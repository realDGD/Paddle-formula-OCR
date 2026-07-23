from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from formula_ocr.app import create_app


class ApplicationFactoryTests(unittest.TestCase):
    def test_factory_registers_no_content_delete_route(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            static = Path(__file__).resolve().parents[1] / "static"
            with patch.dict(
                "os.environ",
                {
                    "FORMULA_OCR_APP_ROOT": str(root),
                    "FORMULA_OCR_DATA_DIR": str(root / "data"),
                    "FORMULA_OCR_STATIC_DIR": str(static),
                },
                clear=False,
            ):
                app = create_app()
        route = next(
            route
            for route in app.routes
            if getattr(route, "path", "") == "/api/jobs/{job_id}"
            and "DELETE" in getattr(route, "methods", set())
        )
        self.assertEqual(route.status_code, 204)
        self.assertEqual(route.response_class.__name__, "Response")

    def test_factory_registers_desktop_launcher_route(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            static = Path(__file__).resolve().parents[1] / "static"
            with patch.dict(
                "os.environ",
                {
                    "FORMULA_OCR_APP_ROOT": str(root),
                    "FORMULA_OCR_DATA_DIR": str(root / "data"),
                    "FORMULA_OCR_STATIC_DIR": str(static),
                },
                clear=False,
            ):
                app = create_app()
        route = next(route for route in app.routes if getattr(route, "path", "") == "/launcher.html")
        self.assertEqual(route.response_class.__name__, "HTMLResponse")

    def test_factory_registers_runtime_install_status_route(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            static = Path(__file__).resolve().parents[1] / "static"
            with patch.dict(
                "os.environ",
                {
                    "FORMULA_OCR_APP_ROOT": str(root),
                    "FORMULA_OCR_DATA_DIR": str(root / "data"),
                    "FORMULA_OCR_STATIC_DIR": str(static),
                },
                clear=False,
            ):
                app = create_app()
        route = next(
            route
            for route in app.routes
            if getattr(route, "path", "") == "/api/admin/runtimes/{profile}/install-status"
        )
        self.assertIn("GET", route.methods)

    def test_factory_registers_runtime_install_cancellation_route(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            static = Path(__file__).resolve().parents[1] / "static"
            with patch.dict(
                "os.environ",
                {
                    "FORMULA_OCR_APP_ROOT": str(root),
                    "FORMULA_OCR_DATA_DIR": str(root / "data"),
                    "FORMULA_OCR_STATIC_DIR": str(static),
                },
                clear=False,
            ):
                app = create_app()
        route = next(
            route
            for route in app.routes
            if getattr(route, "path", "") == "/api/admin/runtimes/{profile}/install"
            and "DELETE" in getattr(route, "methods", set())
        )
        self.assertEqual(route.status_code, 202)

    def test_factory_registers_bootstrap_and_logs_routes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            static = Path(__file__).resolve().parents[1] / "static"
            with patch.dict(
                "os.environ",
                {
                    "FORMULA_OCR_APP_ROOT": str(root),
                    "FORMULA_OCR_DATA_DIR": str(root / "data"),
                    "FORMULA_OCR_STATIC_DIR": str(static),
                },
                clear=False,
            ):
                app = create_app()
        paths = {route.path for route in app.routes if hasattr(route, "path")}
        self.assertIn("/api/admin/bootstrap/plan", paths)
        self.assertIn("/api/admin/bootstrap", paths)
        self.assertIn("/api/admin/bootstrap/status", paths)
        self.assertIn("/api/admin/logs", paths)
