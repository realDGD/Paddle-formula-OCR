import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from PIL import Image

from formula_ocr.worker import (
    FORMULA_KIND,
    TABLE_KIND,
    Recognizer,
    extract_latex,
    extract_tables,
    preprocess_image,
)


class TestWorkerHelpers(unittest.TestCase):
    def test_extract_latex_dict_nested(self):
        class MockResult:
            def __init__(self, data):
                self.json = data

        res1 = MockResult({"res": {"rec_formula": "\\alpha + \\beta"}})
        self.assertEqual(extract_latex(res1), "\\alpha + \\beta")

    def test_extract_latex_dict_flat(self):
        res2 = {"rec_formula": "E = mc^2"}
        self.assertEqual(extract_latex(res2), "E = mc^2")

    def test_extract_latex_json_str(self):
        res3 = '{"res": {"rec_formula": "a^2 + b^2 = c^2"}}'
        self.assertEqual(extract_latex(res3), "a^2 + b^2 = c^2")

    def test_extract_latex_plain_str(self):
        self.assertEqual(extract_latex("\\int x dx"), "\\int x dx")

    def test_extract_latex_recurses_through_lists_and_nested_results(self):
        data = {"result": [{"page": {"res": {"rec_formula": "x+y"}}}]}
        self.assertEqual(extract_latex(data), "x+y")

    def test_transparent_input_is_flattened_onto_white(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "transparent.png"
            image = Image.new("RGBA", (20, 20), (0, 0, 0, 0))
            image.putpixel((10, 10), (0, 0, 0, 255))
            image.save(path)
            prepared = Path(preprocess_image(str(path)))
            try:
                normalized = Image.open(prepared).convert("RGB")
                self.assertEqual(normalized.getpixel((0, 0)), (255, 255, 255))
                self.assertEqual(normalized.getpixel((10, 10)), (0, 0, 0))
            finally:
                if prepared != path:
                    prepared.unlink(missing_ok=True)

    def test_cpu_thread_change_invalidates_mock_model_cache(self):
        recognizer = Recognizer()
        old_value = os.environ.get("FORMULA_OCR_MOCK_RECOGNIZER")
        os.environ["FORMULA_OCR_MOCK_RECOGNIZER"] = "1"
        try:
            recognizer.load(model_name="PP-FormulaNet_plus-M", device="cpu", cpu_threads=2)
            self.assertEqual(recognizer.cpu_threads, 2)
            recognizer.load(model_name="PP-FormulaNet_plus-M", device="cpu", cpu_threads=6)
            self.assertEqual(recognizer.cpu_threads, 6)
        finally:
            if old_value is None:
                os.environ.pop("FORMULA_OCR_MOCK_RECOGNIZER", None)
            else:
                os.environ["FORMULA_OCR_MOCK_RECOGNIZER"] = old_value

    def test_table_html_is_sanitized_and_converted_to_markdown(self):
        result = {
            "res": {
                "table_res_list": [
                    {
                        "pred_html": (
                            '<html><body><table onclick="bad()"><thead><tr>'
                            '<th>Name</th><th><img src=x onerror="bad()">Value</th>'
                            '</tr></thead><tbody><tr><td>A|B</td>'
                            '<td><script>alert(1)</script>2</td></tr></tbody></table></body></html>'
                        )
                    }
                ]
            }
        }

        tables = extract_tables(result)

        self.assertEqual(len(tables), 1)
        self.assertNotIn("onclick", tables[0]["html"])
        self.assertNotIn("script", tables[0]["html"])
        self.assertNotIn("alert", tables[0]["html"])
        self.assertEqual(
            tables[0]["markdown"],
            "| Name | Value |\n| --- | --- |\n| A\\|B | 2 |",
        )

    def test_table_html_preserves_explicit_br_line_breaks_and_escapes_special_chars(self):
        result = {
            "res": {
                "table_res_list": [
                    {
                        "pred_html": (
                            "<table><thead><tr><th>Header</th><th>Symbols</th></tr></thead>"
                            "<tbody><tr><td>\n  第一行  \n<br>\n  第二行  \n</td>"
                            "<td>*star* and _sub_ and [1] and `code` and A\\B and A|B</td></tr>"
                            "<tr><td>第三行<br/>第四行</td><td>normal</td></tr></tbody></table>"
                        )
                    }
                ]
            }
        }

        tables = extract_tables(result)
        self.assertEqual(len(tables), 1)
        self.assertEqual(
            tables[0]["markdown"],
            "| Header | Symbols |\n"
            "| --- | --- |\n"
            "| 第一行<br>第二行 | \\*star\\* and \\_sub\\_ and \\[1\\] and \\`code\\` and A\\\\B and A\\|B |\n"
            "| 第三行<br>第四行 | normal |",
        )

    def test_merged_table_is_flattened_to_pipe_markdown(self):
        tables = extract_tables(
            {
                "table_res_list": [
                    {
                        "pred_html": (
                            '<table><tr><td rowspan="2">A</td><td>B</td></tr>'
                            '<tr><td>C</td></tr></table>'
                        )
                    }
                ]
            }
        )

        self.assertEqual(
            tables[0]["markdown"],
            "|  |  |\n| --- | --- |\n| A | B |\n|  | C |",
        )
        self.assertNotIn("<table", tables[0]["markdown"])

    def test_mock_switches_between_one_formula_or_table_pipeline(self):
        recognizer = Recognizer()
        with patch.dict("os.environ", {"FORMULA_OCR_MOCK_RECOGNIZER": "1"}):
            recognizer.load(
                model_name="PP-FormulaNet_plus-M",
                device="cpu",
                cpu_threads=2,
                kind=FORMULA_KIND,
            )
            self.assertIn("latex_raw", recognizer.recognize("unused.png"))
            recognizer.load(
                model_name="TableRecognitionPipelineV2",
                device="cpu",
                cpu_threads=2,
                kind=TABLE_KIND,
            )
            table_result = recognizer.recognize("unused.png")

        self.assertEqual(recognizer.kind, TABLE_KIND)
        self.assertNotIn("latex_raw", table_result)
        self.assertTrue(table_result["tables"][0]["markdown"])

    def test_switching_pipeline_closes_the_previous_model(self):
        recognizer = Recognizer()
        previous = MagicMock()
        recognizer.model = previous
        recognizer.kind = FORMULA_KIND
        recognizer.model_name = "PP-FormulaNet_plus-M"
        recognizer.device = "cpu"
        recognizer.cpu_threads = 2

        with patch.dict("os.environ", {"FORMULA_OCR_MOCK_RECOGNIZER": "1"}):
            recognizer.load(
                model_name="TableRecognitionPipelineV2",
                device="cpu",
                cpu_threads=2,
                kind=TABLE_KIND,
            )

        previous.close.assert_called_once_with()

    def test_table_pipeline_disables_large_document_preprocessors(self):
        table_pipeline = MagicMock(return_value=object())
        paddleocr = types.ModuleType("paddleocr")
        paddleocr.TableRecognitionPipelineV2 = table_pipeline
        paddlex = types.ModuleType("paddlex")
        paddlex.__path__ = []
        paddlex_utils = types.ModuleType("paddlex.utils")
        paddlex_utils.__path__ = []
        paddlex_deps = types.ModuleType("paddlex.utils.deps")
        paddlex_deps.is_dep_available = lambda _: True

        with (
            patch.dict(
                sys.modules,
                {
                    "paddleocr": paddleocr,
                    "paddlex": paddlex,
                    "paddlex.utils": paddlex_utils,
                    "paddlex.utils.deps": paddlex_deps,
                },
            ),
            patch.dict(os.environ, {"FORMULA_OCR_MOCK_RECOGNIZER": "0"}),
        ):
            Recognizer().load(
                model_name="TableRecognitionPipelineV2",
                device="cpu",
                cpu_threads=3,
                kind=TABLE_KIND,
            )

        table_pipeline.assert_called_once_with(
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_layout_detection=False,
            device="cpu",
            engine="paddle_static",
            cpu_threads=3,
            enable_hpi=False,
        )

    def test_table_recognition_skips_formula_image_preprocessing(self):
        recognizer = Recognizer()
        recognizer.kind = TABLE_KIND
        recognizer.model = MagicMock()
        recognizer.model.predict.return_value = [
            {"table_res_list": [{"pred_html": "<table><tr><td>A</td></tr></table>"}]}
        ]

        with patch("formula_ocr.worker.preprocess_image") as preprocess:
            result = recognizer.recognize("table.png")

        preprocess.assert_not_called()
        recognizer.model.predict.assert_called_once_with(input="table.png")
        self.assertTrue(result["tables"][0]["markdown"])


if __name__ == "__main__":
    unittest.main()
