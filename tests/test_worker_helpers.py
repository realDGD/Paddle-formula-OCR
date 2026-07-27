import os
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from formula_ocr.worker import Recognizer, extract_latex, preprocess_image


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


if __name__ == "__main__":
    unittest.main()
