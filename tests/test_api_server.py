import asyncio
import io
import json
import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException
from fastapi.responses import JSONResponse
from PIL import Image
from pydantic import ValidationError

from formula_ocr.api_server import handle_predict_formula, preprocess_image_in_place
from formula_ocr.app import create_app
from formula_ocr.config import configured_api_server_port
from formula_ocr.prediction import enqueue_formula_job
from formula_ocr.schemas import (
    AccessMode,
    AppSettings,
    JobStatus,
    JobView,
    RuntimeProfile,
    SettingsUpdate,
    UserContext,
    UserPreferencesUpdate,
)
from formula_ocr.security import validate_image


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

    def test_preprocess_transparent_image_preserves_dark_formula(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            img_path = Path(temp_dir) / "transparent.png"
            img = Image.new("RGBA", (100, 100), color=(0, 0, 0, 0))
            for x in range(20, 80):
                img.putpixel((x, 50), (0, 0, 0, 255))
            img.save(img_path)

            preprocess_image_in_place(img_path)

            processed = Image.open(img_path).convert("RGB")
            self.assertEqual(processed.getpixel((5, 5)), (255, 255, 255))
            self.assertEqual(processed.getpixel((50, 50)), (0, 0, 0))

    def test_preprocess_transparent_image_converts_light_formula_to_dark(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            img_path = Path(temp_dir) / "transparent-light.png"
            img = Image.new("RGBA", (100, 100), color=(0, 0, 0, 0))
            for x in range(20, 80):
                img.putpixel((x, 50), (255, 255, 255, 255))
            img.save(img_path)

            preprocess_image_in_place(img_path)

            processed = Image.open(img_path).convert("RGB")
            self.assertEqual(processed.getpixel((5, 5)), (255, 255, 255))
            self.assertEqual(processed.getpixel((50, 50)), (0, 0, 0))

    def test_app_settings_api_server_fields(self) -> None:
        settings = AppSettings()
        self.assertTrue(settings.api_server_enabled)
        self.assertEqual(settings.job_retention_days, 1)
        self.assertGreaterEqual(len(settings.api_server_token), 32)
        with patch.dict("os.environ", {"FORMULA_OCR_API_PORT": "9000"}):
            self.assertEqual(configured_api_server_port(), 9000)
        with self.assertRaises(ValidationError):
            SettingsUpdate.model_validate({"api_server_port": 9000})

    def test_upload_stream_is_closed_and_sensitive_names_are_not_persisted(self) -> None:
        async def run_test() -> None:
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
                    state = app.state.formula_ocr
                    payload = io.BytesIO()
                    Image.new("RGB", (20, 20), "white").save(payload, format="PNG")

                    class MemoryUpload:
                        filename = "private-formula-name.png"

                        def __init__(self, content: bytes):
                            self._stream = io.BytesIO(content)
                            self.closed = False

                        async def read(self, size: int = -1) -> bytes:
                            return self._stream.read(size)

                        async def close(self) -> None:
                            self.closed = True
                            self._stream.close()

                    upload = MemoryUpload(payload.getvalue())
                    job = await enqueue_formula_job(
                        state,
                        upload,  # type: ignore[arg-type]
                        user_id="private-user-id",
                    )
                    image_path = state.store.get_image_path(job.id)
                    with state.store._connect() as connection:
                        row = connection.execute(
                            "SELECT username, metadata_json FROM jobs WHERE id = ?",
                            (job.id,),
                        ).fetchone()

                    self.assertTrue(upload.closed)
                    self.assertEqual(image_path.parent, state.paths.uploads)
                    self.assertEqual(stat.S_IMODE(state.paths.uploads.stat().st_mode), 0o700)
                    self.assertEqual(stat.S_IMODE(image_path.stat().st_mode), 0o600)
                    self.assertEqual(row["username"], "")
                    self.assertEqual(json.loads(row["metadata_json"]), {})
                    self.assertNotIn("private-formula-name.png", state.paths.database.read_bytes().decode("latin1"))
                    await state.queue.stop()
                    self.assertFalse(image_path.exists())

        asyncio.run(run_test())

    def test_image_pixel_limit_is_checked_from_header(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            image_path = Path(temporary) / "large.png"
            Image.new("RGB", (100, 100), "white").save(image_path)
            with self.assertRaises(HTTPException) as raised:
                validate_image(image_path, max_pixels=9_999)
        self.assertEqual(raised.exception.status_code, 413)

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

    def test_preferences_and_launcher_are_scoped_to_current_user(self) -> None:
        async def run_test() -> None:
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
                    get_preferences = next(
                        route for route in app.routes
                        if getattr(route, "path", "") == "/api/preferences"
                        and "GET" in route.methods
                    )
                    put_preferences = next(
                        route for route in app.routes
                        if getattr(route, "path", "") == "/api/preferences"
                        and "PUT" in route.methods
                    )
                    launcher = next(
                        route for route in app.routes
                        if getattr(route, "path", "") == "/launcher.html"
                    )
                    user_a = UserContext(user_id="user-a", username="A")
                    user_b = UserContext(user_id="user-b", username="B")
                    await put_preferences.endpoint(
                        update=UserPreferencesUpdate(launch_mode="embedded"),
                        user=user_a,
                    )
                    a_preferences = await get_preferences.endpoint(user=user_a)
                    b_preferences = await get_preferences.endpoint(user=user_b)
                    a_launcher = await launcher.endpoint(user=user_a)
                    b_launcher = await launcher.endpoint(user=user_b)

            self.assertEqual(a_preferences["preferences"]["launch_mode"], "embedded")
            self.assertEqual(b_preferences["preferences"]["launch_mode"], "browser_tab")
            self.assertIn('data-launch-mode="embedded"', a_launcher.body.decode())
            self.assertIn('data-launch-mode="browser_tab"', b_launcher.body.decode())

        asyncio.run(run_test())

    def test_gateway_predict_uses_verified_user_without_missing_attribute(self) -> None:
        async def run_test() -> None:
            with tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                static = Path(__file__).resolve().parents[1] / "static"
                with patch.dict(
                    "os.environ",
                    {
                        "FORMULA_OCR_APP_ROOT": str(root),
                        "FORMULA_OCR_DATA_DIR": str(root / "data"),
                        "FORMULA_OCR_STATIC_DIR": str(static),
                        "FORMULA_OCR_API_PORT": "18504",
                    },
                    clear=False,
                ):
                    app = create_app()
                    route = next(
                        route for route in app.routes
                        if getattr(route, "path", "") == "/predict"
                    )
                    response_value = JSONResponse({"status": "success", "latex": "x"})
                    user = UserContext(user_id="user-1", username="User One")
                    with patch(
                        "formula_ocr.app.handle_predict_formula",
                        AsyncMock(return_value=response_value),
                    ) as handler:
                        response = await route.endpoint(file=object(), user=user)
                    self.assertEqual(response.status_code, 200)
                    handler.assert_awaited_once()
                    self.assertEqual(handler.await_args.kwargs["user_id"], "user-1")
                    self.assertFalse(handler.await_args.kwargs["check_enabled"])

        asyncio.run(run_test())

    def test_gateway_predict_enforces_admin_only_access(self) -> None:
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
                settings = app.state.formula_ocr.store.get_settings().model_copy(
                    update={"api_server_enabled": False, "access_mode": AccessMode.ADMINS_ONLY}
                )
                app.state.formula_ocr.store.save_settings(settings)
                route = next(
                    route for route in app.routes
                    if getattr(route, "path", "") == "/predict"
                )
                verified_user = route.dependant.dependencies[0].call

                class DummyRequest:
                    headers = {
                        "x-trim-userid": "user-1",
                        "x-trim-username": "User One",
                    }

                with self.assertRaises(HTTPException) as raised:
                    verified_user(DummyRequest())

        self.assertEqual(raised.exception.status_code, 403)

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
                        "FORMULA_OCR_API_PORT": "18504",
                    },
                    clear=False,
                ):
                    app = create_app()
                    await app.state.formula_ocr.queue.start()
                    manager = app.state.formula_ocr.api_server

                    try:
                        settings = app.state.formula_ocr.store.get_settings().model_copy(
                            update={"api_server_enabled": True}
                        )
                        app.state.formula_ocr.store.save_settings(settings)
                        await manager.sync(settings)

                        boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
                        body = (
                            f"--{boundary}\r\n"
                            'Content-Disposition: form-data; name="file"; filename="test.txt"\r\n'
                            "Content-Type: text/plain\r\n\r\n"
                            "invalid image content\r\n"
                            f"--{boundary}--\r\n"
                        ).encode("utf-8")

                        async def request(extra_headers: str = "") -> bytes:
                            reader, writer = await asyncio.open_connection("127.0.0.1", 18504)
                            req = (
                            f"POST /predict HTTP/1.1\r\n"
                            f"Host: 127.0.0.1:18504\r\n"
                            f"Content-Type: multipart/form-data; boundary={boundary}\r\n"
                            f"Content-Length: {len(body)}\r\n"
                            f"{extra_headers}"
                            f"Connection: close\r\n\r\n"
                            ).encode("utf-8") + body
                            writer.write(req)
                            await writer.drain()
                            response_data = await reader.read()
                            writer.close()
                            await writer.wait_closed()
                            return response_data

                        unauthorized = await request()
                        self.assertIn(b"401 Unauthorized", unauthorized)
                        authorized = await request(
                            f"Authorization: Bearer {settings.api_server_token}\r\n"
                        )
                        self.assertIn(b"422 Unprocessable", authorized)
                        self.assertIn(b'"status":"fail"', authorized)
                        self.assertTrue(manager.status["running"])

                        await manager.stop()
                    finally:
                        await app.state.formula_ocr.queue.stop()

        asyncio.run(run_test())

    def test_running_app_rebinds_when_fnos_port_file_changes(self) -> None:
        async def run_test() -> None:
            with tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                data = root / "data"
                static = Path(__file__).resolve().parents[1] / "static"
                with patch.dict(
                    "os.environ",
                    {
                        "FORMULA_OCR_APP_ROOT": str(root),
                        "FORMULA_OCR_DATA_DIR": str(data),
                        "FORMULA_OCR_STATIC_DIR": str(static),
                        "FORMULA_OCR_API_PORT": "18506",
                    },
                    clear=False,
                ):
                    app = create_app()
                    async with app.router.lifespan_context(app):
                        manager = app.state.formula_ocr.api_server
                        self.assertEqual(manager.status["port"], 18506)
                        (data / "env").write_text(
                            "TRIM_SERVICE_PORT=18507\nFORMULA_OCR_API_PORT=18507\n",
                            encoding="utf-8",
                        )
                        await asyncio.sleep(2.3)
                        self.assertEqual(manager.status["port"], 18507)

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

    def test_handle_predict_formula_returns_token_equivalent_formatted_latex(self) -> None:
        async def run_test() -> None:
            state = MagicMock()
            state.store.get_settings.return_value = AppSettings(api_server_enabled=True)
            queued = MagicMock(id="job-1")
            completed = JobView(
                id="job-1",
                status=JobStatus.SUCCEEDED,
                model="PP-FormulaNet_plus-M",
                runtime_profile=RuntimeProfile.CPU,
                created_at="2026-07-27T00:00:00Z",
                latex_raw=r"\begin{array}{l}a=b\\c=d\end{array}",
            )

            with (
                patch(
                    "formula_ocr.api_server.enqueue_formula_job",
                    AsyncMock(return_value=queued),
                ),
                patch(
                    "formula_ocr.api_server.wait_for_formula_job",
                    AsyncMock(return_value=completed),
                ),
            ):
                response = await handle_predict_formula(
                    state,
                    MagicMock(),
                    user_id="lan_api:test",
                )

            payload = json.loads(response.body)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(payload["status"], "success")
            self.assertEqual(
                payload["latex"],
                "\\begin{array}{l}\n"
                "  a = b \\\\\n"
                "  c = d\n"
                "\\end{array}",
            )

        asyncio.run(run_test())

    def test_token_is_excluded_from_settings_and_only_available_in_admin_client_endpoint(self) -> None:
        async def run_test() -> None:
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
                    routes = {
                        route.path: route
                        for route in app.routes
                        if getattr(route, "path", "") in {
                            "/api/system-info",
                            "/api/settings",
                            "/api/admin/api-client",
                        }
                        and "GET" in getattr(route, "methods", set())
                    }
                    normal = UserContext(user_id="user-1", username="User One")
                    admin = normal.model_copy(update={"is_admin": True})
                    public_payload = await routes["/api/system-info"].endpoint(user=normal)
                    with self.assertRaises(HTTPException) as raised:
                        await routes["/api/settings"].endpoint(user=normal)
                    admin_payload = await routes["/api/settings"].endpoint(user=admin)
                    with self.assertRaises(HTTPException) as credentials_raised:
                        await routes["/api/admin/api-client"].endpoint(user=normal)
                    credentials = await routes["/api/admin/api-client"].endpoint(user=admin)
                    rotate_route = next(
                        route for route in app.routes
                        if getattr(route, "path", "") == "/api/admin/api-token"
                        and "POST" in route.methods
                    )
                    rotated = await rotate_route.endpoint(user=admin)
                    refreshed = await routes["/api/admin/api-client"].endpoint(user=admin)

            self.assertNotIn("api_server_token", public_payload["settings"])
            self.assertEqual(raised.exception.status_code, 403)
            self.assertNotIn("api_server_token", admin_payload["settings"])
            self.assertEqual(credentials_raised.exception.status_code, 403)
            self.assertIn("api_server_token", credentials)
            self.assertNotEqual(credentials["api_server_token"], rotated["api_server_token"])
            self.assertEqual(rotated["api_server_token"], refreshed["api_server_token"])

        asyncio.run(run_test())

    def test_port_bind_failure_closes_socket_and_reports_error(self) -> None:
        async def run_test() -> None:
            with tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                static = Path(__file__).resolve().parents[1] / "static"
                with patch.dict(
                    "os.environ",
                    {
                        "FORMULA_OCR_APP_ROOT": str(root),
                        "FORMULA_OCR_DATA_DIR": str(root / "data"),
                        "FORMULA_OCR_STATIC_DIR": str(static),
                        "FORMULA_OCR_API_PORT": "18505",
                    },
                    clear=False,
                ):
                    app = create_app()
                    manager = app.state.formula_ocr.api_server
                    settings = app.state.formula_ocr.store.get_settings()
                    fake_socket = MagicMock()
                    fake_socket.bind.side_effect = OSError("address already in use")
                    with patch("formula_ocr.api_server.socket.socket", return_value=fake_socket):
                        with self.assertRaises(RuntimeError):
                            await manager.sync(settings)
                    fake_socket.close.assert_called_once()
                    self.assertFalse(manager.status["running"])
                    self.assertIn("address already in use", str(manager.status["error"]))

        asyncio.run(run_test())

    def test_settings_update_keeps_old_value_when_api_sync_fails(self) -> None:
        async def run_test() -> None:
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
                    state = app.state.formula_ocr
                    old_enabled = state.store.get_settings().api_server_enabled
                    route = next(
                        route
                        for route in app.routes
                        if getattr(route, "path", "") == "/api/settings"
                        and "PUT" in getattr(route, "methods", set())
                    )
                    admin = UserContext(
                        user_id="admin",
                        username="Admin",
                        is_admin=True,
                    )
                    state.api_server.sync = AsyncMock(
                        side_effect=[RuntimeError("bind failed"), None]
                    )
                    with self.assertRaises(HTTPException) as raised:
                        await route.endpoint(
                            update=SettingsUpdate(api_server_enabled=not old_enabled),
                            user=admin,
                        )
                    self.assertEqual(raised.exception.status_code, 409)
                    self.assertEqual(state.store.get_settings().api_server_enabled, old_enabled)
                    self.assertEqual(state.api_server.sync.await_count, 2)

        asyncio.run(run_test())


if __name__ == "__main__":
    unittest.main()
