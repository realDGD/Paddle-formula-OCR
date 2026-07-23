import unittest
from formula_ocr.worker import extract_latex


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


if __name__ == "__main__":
    unittest.main()
