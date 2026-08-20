from __future__ import annotations

import gc
import html
import json
import os
import sys
import time
import traceback
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

FORMULA_KIND = "formula"
TABLE_KIND = "table"
MAX_TABLE_RESULTS = 16
MAX_TABLE_RESULT_CHARS = 250_000
MAX_TABLE_RESULTS_JSON_BYTES = 1_000_000


def emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def extract_latex(result: Any) -> str:
    data = getattr(result, "json", result)
    if callable(data):
        data = data()
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except json.JSONDecodeError:
            return data
    def find_formula(value: Any) -> str | None:
        if isinstance(value, dict):
            formula = value.get("rec_formula")
            if isinstance(formula, str):
                return formula
            for nested in value.values():
                found = find_formula(nested)
                if found is not None:
                    return found
        elif isinstance(value, (list, tuple)):
            for nested in value:
                found = find_formula(nested)
                if found is not None:
                    return found
        return None

    formula = find_formula(data)
    if formula is not None:
        return formula
    if isinstance(result, str):
        return result
    raise RuntimeError("PaddleOCR 未返回 LaTeX 结果。")


class _SafeTableParser(HTMLParser):
    _tags = {"table", "caption", "thead", "tbody", "tfoot", "tr", "th", "td", "br"}
    _drop_content_tags = {"script", "style", "template", "svg", "math", "iframe", "object"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.output: list[str] = []
        self.table_depth = 0
        self.table_count = 0
        self.drop_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if self.table_depth and tag in self._drop_content_tags:
            self.drop_depth += 1
            return
        if self.drop_depth:
            return
        if tag == "table":
            self.table_depth += 1
            self.table_count += 1
        if not self.table_depth or tag not in self._tags:
            return
        safe_attrs = ""
        if tag in {"td", "th"}:
            values: list[str] = []
            for name, value in attrs:
                if name.lower() not in {"rowspan", "colspan"}:
                    continue
                try:
                    span = int(value or "")
                except ValueError:
                    continue
                if 1 < span <= 1000:
                    values.append(f'{name.lower()}="{span}"')
            if values:
                safe_attrs = " " + " ".join(values)
        self.output.append(f"<{tag}{safe_attrs}>")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if self.drop_depth:
            if tag in self._drop_content_tags:
                self.drop_depth -= 1
            return
        if not self.table_depth or tag not in self._tags:
            return
        if tag != "br":
            self.output.append(f"</{tag}>")
        if tag == "table":
            self.table_depth -= 1

    def handle_data(self, data: str) -> None:
        if self.table_depth and not self.drop_depth:
            self.output.append(html.escape(data, quote=False))


class _MarkdownTableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: list[list[str]] = []
        self.header_rows: list[bool] = []
        self._row: list[tuple[str, int, int]] | None = None
        self._cell: list[str] | None = None
        self._cell_rowspan = 1
        self._cell_colspan = 1
        self._row_is_header = False
        self._rowspans: dict[int, int] = {}
        self._in_thead = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag == "thead":
            self._in_thead = True
        elif tag == "tr":
            self._row = []
            self._row_is_header = self._in_thead
        elif tag in {"td", "th"} and self._row is not None:
            self._cell = []
            self._row_is_header = self._row_is_header or tag == "th"
            values = dict(attrs)
            self._cell_rowspan = int(values.get("rowspan") or 1)
            self._cell_colspan = int(values.get("colspan") or 1)
        elif tag == "br" and self._cell is not None:
            self._cell.append("\n")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in {"td", "th"} and self._row is not None and self._cell is not None:
            self._row.append(
                (_markdown_cell("".join(self._cell)), self._cell_rowspan, self._cell_colspan)
            )
            self._cell = None
        elif tag == "tr" and self._row is not None:
            row: list[str] = []
            column = 0
            next_rowspans = {
                index: remaining - 1
                for index, remaining in self._rowspans.items()
                if remaining > 1
            }
            for value, rowspan, colspan in self._row:
                while any(self._rowspans.get(column + offset, 0) for offset in range(colspan)):
                    row.append("")
                    column += 1
                row.extend((value, *("" for _ in range(colspan - 1))))
                if rowspan > 1:
                    for offset in range(colspan):
                        next_rowspans[column + offset] = rowspan - 1
                column += colspan
            while column <= max(self._rowspans, default=-1):
                row.append("")
                column += 1
            if row:
                self.rows.append(row)
                self.header_rows.append(self._row_is_header)
            self._rowspans = next_rowspans
            self._row = None
            self._row_is_header = False
        elif tag == "thead":
            self._in_thead = False

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell.append(data.replace("\r\n", " ").replace("\n", " ").replace("\r", " ").replace("\t", " "))


def _markdown_cell(value: str) -> str:
    lines = [" ".join(part.split()) for part in value.split("\n")]
    while lines and not lines[0]:
        lines.pop(0)
    while lines and not lines[-1]:
        lines.pop()
    if not lines:
        return ""
    processed: list[str] = []
    for line in lines:
        escaped = html.escape(line, quote=False)
        for character in ("\\", "|", "`", "*", "_", "[", "]", "!"):
            escaped = escaped.replace(character, f"\\{character}")
        processed.append(escaped)
    return "<br>".join(processed)


def sanitize_table_html(value: str) -> str:
    if not value or len(value) > MAX_TABLE_RESULT_CHARS:
        raise ValueError("表格 HTML 为空或大小超出限制。")
    parser = _SafeTableParser()
    parser.feed(value)
    parser.close()
    sanitized = "".join(parser.output)
    if (
        parser.table_count == 0
        or parser.table_depth != 0
        or parser.drop_depth != 0
        or len(sanitized) > MAX_TABLE_RESULT_CHARS
    ):
        raise ValueError("PaddleOCR 返回了无效的表格 HTML。")
    return sanitized


def table_html_to_markdown(sanitized_html: str) -> str:
    parser = _MarkdownTableParser()
    parser.feed(sanitized_html)
    parser.close()
    if not parser.rows:
        return ""
    width = max(len(row) for row in parser.rows)
    rows = [row + [""] * (width - len(row)) for row in parser.rows]
    if parser.header_rows[0]:
        header, body = rows[0], rows[1:]
    else:
        header, body = [""] * width, rows
    render = lambda row: "| " + " | ".join(row) + " |"
    return "\n".join((render(header), render(["---"] * width), *(render(row) for row in body)))


def _result_data(result: Any) -> Any:
    data = getattr(result, "json", result)
    if callable(data):
        data = data()
    if isinstance(data, str):
        try:
            return json.loads(data)
        except json.JSONDecodeError:
            return {}
    return data


def _find_table_html(value: Any):
    if isinstance(value, dict):
        for key, nested in value.items():
            if key == "pred_html" and isinstance(nested, str):
                yield nested
            else:
                yield from _find_table_html(nested)
    elif isinstance(value, (list, tuple)):
        for nested in value:
            yield from _find_table_html(nested)


def extract_tables(result: Any) -> list[dict[str, str]]:
    tables = []
    for raw_html in _find_table_html(_result_data(result)):
        safe_html = sanitize_table_html(raw_html)
        tables.append(
            {
                "html": safe_html,
                "markdown": table_html_to_markdown(safe_html),
            }
        )
        if len(tables) > MAX_TABLE_RESULTS:
            raise ValueError("表格识别结果数量超出限制。")
    if len(json.dumps(tables, ensure_ascii=False).encode("utf-8")) > MAX_TABLE_RESULTS_JSON_BYTES:
        raise ValueError("表格识别结果大小超出限制。")
    return tables


def preprocess_image(image_path: str) -> str:
    try:
        from .image_processing import prepare_image_for_ocr

        return prepare_image_for_ocr(image_path)
    except Exception:
        return image_path


class Recognizer:
    def __init__(self) -> None:
        self.model: Any | None = None
        self.model_name: str | None = None
        self.device: str | None = None
        self.cpu_threads: int | None = None
        self.kind: str | None = None

    def load(
        self,
        *,
        model_name: str,
        device: str,
        cpu_threads: int,
        kind: str = FORMULA_KIND,
    ) -> None:
        if kind not in {FORMULA_KIND, TABLE_KIND}:
            raise ValueError(f"未知识别类型：{kind}")
        if (
            self.model is not None
            and self.kind == kind
            and self.model_name == model_name
            and self.device == device
            and self.cpu_threads == cpu_threads
        ):
            return
        # Keep at most one large pipeline resident on memory-constrained NASes.
        previous_model = self.model
        self.model = None
        self.kind = None
        self.model_name = None
        self.device = None
        self.cpu_threads = None
        close = getattr(previous_model, "close", None)
        if callable(close):
            close()
        gc.collect()
        if os.environ.get("FORMULA_OCR_MOCK_RECOGNIZER") == "1":
            self.model = "mock"
            self.kind = kind
            self.model_name = model_name
            self.device = device
            self.cpu_threads = cpu_threads
            return
        from paddlex.utils.deps import is_dep_available

        # PaddleOCR hides the original PaddleX DependencyError behind a generic
        # message. Check the dependencies used by the formula/static predictor
        # first so an incomplete runtime can be repaired without guessing.
        required_dependencies = (
            "paddlepaddle",
            "opencv-contrib-python",
            "imagesize",
            "pypdfium2",
            "tokenizers",
            "ftfy",
        )
        missing = [name for name in required_dependencies if not is_dep_available(name)]
        if missing:
            raise RuntimeError(
                "识别组件缺少依赖："
                + ", ".join(missing)
                + "。请重新安装对应识别组件。"
            )

        model_dir = os.environ.get("FORMULA_OCR_MODEL_DIR")
        kwargs: dict[str, Any] = {
            "device": device,
            "engine": "paddle_static",
            "cpu_threads": cpu_threads,
            "enable_hpi": False,
        }
        if model_dir:
            # A dedicated cache path makes model data survive worker restarts.
            Path(model_dir).mkdir(parents=True, exist_ok=True)
        if kind == TABLE_KIND:
            from paddleocr import TableRecognitionPipelineV2

            self.model = TableRecognitionPipelineV2(
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_layout_detection=False,
                **kwargs,
            )
        else:
            from paddleocr import FormulaRecognition

            self.model = FormulaRecognition(model_name=model_name, **kwargs)
        self.kind = kind
        self.model_name = model_name
        self.device = device
        self.cpu_threads = cpu_threads

    def recognize(self, image_path: str) -> dict[str, Any]:
        if self.model == "mock":
            if self.kind == TABLE_KIND:
                safe_html = "<table><thead><tr><th>项目</th><th>值</th></tr></thead><tbody><tr><td>OCR</td><td>ready</td></tr></tbody></table>"
                return {
                    "tables": [
                        {
                            "html": safe_html,
                            "markdown": table_html_to_markdown(safe_html),
                        }
                    ]
                }
            return {"latex_raw": r"\mathrm{OCR\ runtime\ is\ ready}"}
        if self.model is None:
            raise RuntimeError("模型尚未加载。")

        if self.kind == TABLE_KIND:
            tables: list[dict[str, str]] = []
            for result in self.model.predict(input=image_path):
                tables.extend(extract_tables(result))
                if len(tables) > MAX_TABLE_RESULTS:
                    raise RuntimeError("表格识别结果数量超出限制。")
            if not tables:
                raise RuntimeError("PaddleOCR 未返回表格结果。")
            return {"tables": tables}

        target_path = preprocess_image(image_path)
        try:
            outputs = self.model.predict(input=target_path, batch_size=1)
            for result in outputs:
                return {"latex_raw": extract_latex(result)}
        finally:
            if target_path != image_path and os.path.exists(target_path):
                try:
                    os.remove(target_path)
                except Exception:
                    pass
        raise RuntimeError("PaddleOCR 未返回识别结果。")

    @staticmethod
    def diagnose() -> dict[str, Any]:
        if os.environ.get("FORMULA_OCR_MOCK_RECOGNIZER") == "1":
            return {"mock": True, "cuda_available": False, "device_count": 0}
        import paddle

        return {
            "paddle_version": paddle.__version__,
            "compiled_with_cuda": paddle.is_compiled_with_cuda(),
            "cuda_available": paddle.device.cuda.device_count() > 0 if paddle.is_compiled_with_cuda() else False,
            "device_count": paddle.device.cuda.device_count() if paddle.is_compiled_with_cuda() else 0,
            "cuda_version": getattr(paddle.version, "cuda", lambda: None)(),
        }


def main() -> int:
    recognizer = Recognizer()
    emit({"type": "ready", "profile": os.environ.get("FORMULA_OCR_RUNTIME_PROFILE")})
    for line in sys.stdin:
        try:
            message = json.loads(line)
            action = message["action"]
            job_id = message.get("job_id")
            if action == "diagnose":
                emit({"type": "result", "request_id": message["request_id"], "data": recognizer.diagnose()})
                continue
            if action == "prepare":
                recognizer.load(
                    model_name=message["model_name"],
                    device=message["device"],
                    cpu_threads=int(message["cpu_threads"]),
                )
                emit(
                    {
                        "type": "result",
                        "request_id": message["request_id"],
                        "data": {"prepared": True, "model": message["model_name"], "device": message["device"]},
                    }
                )
                continue
            if action == "smoke":
                recognizer.load(
                    model_name=message["model_name"],
                    device=message["device"],
                    cpu_threads=int(message["cpu_threads"]),
                )
                started = time.monotonic()
                result = recognizer.recognize(message["image_path"])
                emit(
                    {
                        "type": "result",
                        "request_id": message["request_id"],
                        "data": {
                            **result,
                            "duration_ms": round((time.monotonic() - started) * 1000),
                            "device": message["device"],
                        },
                    }
                )
                continue
            if action != "recognize":
                raise ValueError(f"未知动作：{action}")
            emit({"type": "status", "job_id": job_id, "status": "loading_model"})
            kind = str(message.get("kind", FORMULA_KIND))
            recognizer.load(
                model_name=message["model_name"],
                device=message["device"],
                cpu_threads=int(message["cpu_threads"]),
                kind=kind,
            )
            emit({"type": "status", "job_id": job_id, "status": "running"})
            started = time.monotonic()
            result = recognizer.recognize(message["image_path"])
            emit(
                {
                    "type": "result",
                    "job_id": job_id,
                    **result,
                    "duration_ms": round((time.monotonic() - started) * 1000),
                }
            )
        except Exception as exc:  # Worker boundary: report all model/runtime errors.
            emit(
                {
                    "type": "error",
                    "job_id": message.get("job_id") if "message" in locals() else None,
                    "request_id": message.get("request_id") if "message" in locals() else None,
                    "code": "WORKER_ERROR",
                    "message": str(exc),
                    "traceback": traceback.format_exc(limit=8),
                }
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
