from __future__ import annotations

import json
import subprocess
import unittest
from pathlib import Path

from formula_ocr.latex_formatter import format_latex_source, has_equivalent_tokens


class LatexFormatterTests(unittest.TestCase):
    def test_python_and_browser_formatters_share_representative_results(self) -> None:
        root = Path(__file__).resolve().parents[1]
        sources = [
            r"a+b=\frac{c}{d}",
            r"r\cos\theta",
            r"\alpha\beta+\nabla\psi",
            r"\int\limits_a^b",
            r"\text{two  real roots}+x",
            r"\ce{SO4^2- + Ba^2+ -> BaSO4 v}",
            r"\begin{array}{l}a=b\\c=d\end{array}",
            (
                r"\left.\begin{matrix}a\subset\beta\\b\subset\beta"
                r"\end{matrix}\right\}\Rightarrow a\parallel b"
            ),
            (
                r"\begin{array}{l}a=b\\\left\{\begin{matrix}c>0\\c<0"
                r"\end{matrix}\right.\end{array}"
            ),
            r"x+{y",
            r"x+y% protected",
            r"\begin{array}a&b\end{array}",
            r"a\\[2pt]b",
        ]
        script = """
const formatter = require('./static/latex-source-formatter.js');
const sources = JSON.parse(process.argv[1]);
process.stdout.write(JSON.stringify(sources.map((source) => formatter.format(source))));
"""
        browser_results = json.loads(
            subprocess.run(
                ["node", "-e", script, json.dumps(sources)],
                cwd=root,
                check=True,
                capture_output=True,
                text=True,
            ).stdout
        )

        for source, browser_result in zip(sources, browser_results, strict=True):
            with self.subTest(source=source):
                python_result = format_latex_source(source)
                self.assertEqual(python_result.formatted, browser_result["formatted"])
                self.assertEqual(python_result.changed, browser_result["changed"])
                self.assertEqual(python_result.safe, browser_result["safe"])
                self.assertEqual(python_result.status, browser_result["status"])

    def test_only_token_equivalent_output_is_accepted(self) -> None:
        source = r"\begin{array}{l}a=b\\c=d\end{array}"
        result = format_latex_source(source)

        self.assertTrue(result.safe)
        self.assertTrue(result.changed)
        self.assertTrue(has_equivalent_tokens(source, result.formatted))
        self.assertFalse(
            has_equivalent_tokens(
                r"\sum_{1}^{2}",
                r"{\textstyle\sum_{1}^{2}}",
            )
        )

    def test_unsafe_source_is_returned_unchanged(self) -> None:
        source = r"x+y% protected"
        result = format_latex_source(source)

        self.assertFalse(result.safe)
        self.assertFalse(result.changed)
        self.assertEqual(result.formatted, source)
        self.assertEqual(result.status, "comment-protected")


if __name__ == "__main__":
    unittest.main()
