from __future__ import annotations

import json
import os
import sys
import time
import traceback
from pathlib import Path
from typing import Any


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
    if isinstance(data, dict):
        nested = data.get("res", data)
        if isinstance(nested, dict) and isinstance(nested.get("rec_formula"), str):
            return nested["rec_formula"]
        if isinstance(data.get("rec_formula"), str):
            return data["rec_formula"]
    if isinstance(result, str):
        return result
    raise RuntimeError("PaddleOCR 未返回 LaTeX 结果。")


def preprocess_image(image_path: str) -> str:
    """
    检查图片是否为黑底/深色背景，如果是，则自动反转为白底黑字。
    这对于暗色截屏及中文字符识别率提升至关重要。
    """
    try:
        from PIL import Image, ImageOps

        img = Image.open(image_path).convert("RGB")
        w, h = img.size
        if w == 0 or h == 0:
            return image_path

        sample_points = [
            (w // 2, h // 2),
            (max(0, w // 10), max(0, h // 10)),
            (min(w - 1, w * 9 // 10), max(0, h // 10)),
            (max(0, w // 10), min(h - 1, h * 9 // 10)),
            (min(w - 1, w * 9 // 10), min(h - 1, h * 9 // 10)),
        ]
        grays = [sum(img.getpixel(p)) / 3 for p in sample_points]
        avg_gray = sum(grays) / len(grays)

        if avg_gray < 110:
            inverted_img = ImageOps.invert(img)
            inverted_path = image_path + ".inverted.png"
            inverted_img.save(inverted_path)
            return inverted_path
    except Exception:
        pass
    return image_path


class Recognizer:
    def __init__(self) -> None:
        self.model: Any | None = None
        self.model_name: str | None = None
        self.device: str | None = None

    def load(self, *, model_name: str, device: str, cpu_threads: int) -> None:
        if self.model is not None and self.model_name == model_name and self.device == device:
            return
        if os.environ.get("FORMULA_OCR_MOCK_RECOGNIZER") == "1":
            self.model = "mock"
            self.model_name = model_name
            self.device = device
            return
        from paddleocr import FormulaRecognition
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
                "公式识别运行时缺少依赖："
                + ", ".join(missing)
                + "。请重新安装对应运行时。"
            )

        model_dir = os.environ.get("FORMULA_OCR_MODEL_DIR")
        kwargs: dict[str, Any] = {
            "model_name": model_name,
            "device": device,
            "engine": "paddle_static",
            "cpu_threads": cpu_threads,
            "enable_hpi": False,
        }
        if model_dir:
            # A dedicated cache path makes model data survive worker restarts.
            Path(model_dir).mkdir(parents=True, exist_ok=True)
        self.model = FormulaRecognition(**kwargs)
        self.model_name = model_name
        self.device = device

    def recognize(self, image_path: str) -> str:
        if self.model == "mock":
            return r"\mathrm{OCR\ runtime\ is\ ready}"
        if self.model is None:
            raise RuntimeError("模型尚未加载。")

        target_path = preprocess_image(image_path)
        try:
            outputs = self.model.predict(input=target_path, batch_size=1)
            for result in outputs:
                return extract_latex(result)
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
                latex = recognizer.recognize(message["image_path"])
                emit(
                    {
                        "type": "result",
                        "request_id": message["request_id"],
                        "data": {
                            "latex_raw": latex,
                            "duration_ms": round((time.monotonic() - started) * 1000),
                            "device": message["device"],
                        },
                    }
                )
                continue
            if action != "recognize":
                raise ValueError(f"未知动作：{action}")
            emit({"type": "status", "job_id": job_id, "status": "loading_model"})
            recognizer.load(
                model_name=message["model_name"],
                device=message["device"],
                cpu_threads=int(message["cpu_threads"]),
            )
            emit({"type": "status", "job_id": job_id, "status": "running"})
            started = time.monotonic()
            latex = recognizer.recognize(message["image_path"])
            emit(
                {
                    "type": "result",
                    "job_id": job_id,
                    "latex_raw": latex,
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
