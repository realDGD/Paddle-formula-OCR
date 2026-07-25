import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from formula_ocr.api_server import ApiServerManager, handle_predict_formula, preprocess_image_in_place
from formula_ocr.app import create_app
from formula_ocr.schemas import AppSettings, SettingsUpdate


class ApiServerTests(unittest.TestCase):
    def test_preprocess_image_in_place_dark_background(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            img_path = Path(temp_dir) / "dark.png"
            img = Image.new("RGB", (100, 100), color=(10, 10, 10))
            img.save(img_path)

            preprocess_image_in_place(img_path)

            processed = Image.open(img_path).convert("RGB")
            center = processed.getpixel((50, 50))
            gray = sum(center) / 3
            self.assertGreater(gray, 200, "Dark background image should be inverted to light background")

    def test_preprocess_image_in_place_light_background(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            img_path = Path(temp_dir) / "light.png"
            img = Image.new("RGB", (100, 100), color=(240, 240, 240))
            img.save(img_path)

            preprocess_image_in_place(img_path)

            processed = Image.open(img_path).convert("RGB")
            center = processed.getpixel((50, 50))
            gray = sum(center) / 3
            self.assertGreater(gray, 200, "Light background image should remain light")

    def test_app_settings_api_server_fields(self) -> None:
        settings = AppSettings()
        self.assertTrue(settings.api_server_enabled)
        self.assertEqual(settings.api_server_port, 8504)

        update = SettingsUpdate(api_server_enabled=True, api_server_port=9000)
        self.assertTrue(update.api_server_enabled)
        self.assertEqual(update.api_server_port, 9000)

    def test_factory_registers_predict_route(self) -> None:
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
        route_paths = [getattr(r, "path", "") for r in app.routes]
        self.assertIn("/predict", route_paths)
        self.assertIn("/api/predict", route_paths)

    def test_api_server_manager_live_lifecycle(self) -> None:
        async def run_test():
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
                    await app.state.formula_ocr.queue.start()
                    manager = app.state.formula_ocr.api_server

                    try:
                        settings = app.state.formula_ocr.store.get_settings().model_copy(
                            update={"api_server_enabled": True, "api_server_port": 18504}
                        )
                        await manager.sync(settings)

                        reader, writer = await asyncio.open_connection("127.0.0.1", 18504)
                        boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
                        body = (
                            f"--{boundary}\r\n"
                            'Content-Disposition: form-data; name="file"; filename="test.txt"\r\n'
                            "Content-Type: text/plain\r\n\r\n"
                            "invalid image content\r\n"
                            f"--{boundary}--\r\n"
                        ).encode("utf-8")

                        req = (
                            f"POST /predict HTTP/1.1\r\n"
                            f"Host: 127.0.0.1:18504\r\n"
                            f"Content-Type: multipart/form-data; boundary={boundary}\r\n"
                            f"Content-Length: {len(body)}\r\n"
                            f"Connection: close\r\n\r\n"
                        ).encode("utf-8") + body

                        writer.write(req)
                        await writer.drain()
                        response_data = await reader.read()
                        writer.close()
                        await writer.wait_closed()

                        self.assertIn(b"200 OK", response_data)
                        self.assertIn(b'"status":"fail"', response_data)

                        await manager.stop()
                    finally:
                        await app.state.formula_ocr.queue.stop()

        asyncio.run(run_test())

    def test_handle_predict_formula_disabled_returns_403(self) -> None:
        async def run_test() -> None:
            with tempfile.TemporaryDirectory() as temp_dir:
                with patch.dict("os.environ", {"FORMULA_OCR_DATA_DIR": temp_dir}):
                    app = create_app()
                    settings = app.state.formula_ocr.store.get_settings()
                    settings.api_server_enabled = False
                    app.state.formula_ocr.store.save_settings(settings)

                    class DummyFile:
                        filename = "test.png"
                        async def read(self, n: int = -1) -> bytes:
                            return b""

                    resp = await handle_predict_formula(app.state.formula_ocr, DummyFile())
                    self.assertEqual(resp.status_code, 403)
                    self.assertIn("已被管理员关闭", resp.body.decode("utf-8"))
                    await app.state.formula_ocr.queue.stop()

        asyncio.run(run_test())


if __name__ == "__main__":
    unittest.main()
