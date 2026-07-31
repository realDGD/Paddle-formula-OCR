from __future__ import annotations

import subprocess
import unittest
from pathlib import Path


class LatexSourceFormatterTests(unittest.TestCase):
    def test_browser_formatter_and_all_presets(self) -> None:
        root = Path(__file__).resolve().parents[1]
        result = subprocess.run(
            ["node", str(root / "tests" / "js" / "test_latex_source_formatter.js")],
            cwd=root,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("formatted LaTeX presets", result.stdout)

    def test_formula_environment_switching_replaces_outer_wrappers(self) -> None:
        root = Path(__file__).resolve().parents[1]
        result = subprocess.run(
            ["node", str(root / "tests" / "js" / "test_formula_environments.mjs")],
            cwd=root,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_latex_left_right_fence_analyzer(self) -> None:
        root = Path(__file__).resolve().parents[1]
        result = subprocess.run(
            ["node", str(root / "tests" / "js" / "test_latex_fence_analyzer.mjs")],
            cwd=root,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("left/right fence pairing", result.stdout)

    def test_latex_renderer_waits_for_mathjax_startup(self) -> None:
        root = Path(__file__).resolve().parents[1]
        result = subprocess.run(
            ["node", str(root / "tests" / "js" / "test_latex_renderer.mjs")],
            cwd=root,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_mathjax_runtime_serializes_and_recovers_render_queue(self) -> None:
        root = Path(__file__).resolve().parents[1]
        result = subprocess.run(
            ["node", str(root / "tests" / "js" / "test_mathjax_runtime.mjs")],
            cwd=root,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
