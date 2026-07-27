from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from formula_ocr.config import AppPaths
from formula_ocr.runtime import (
    PADDLE_CPU_INDEX_URL,
    PADDLE_CUDA118_INDEX_URL,
    PADDLE_CUDA126_INDEX_URL,
    PYPI_MIRROR_URL,
    RuntimeManager,
)
from formula_ocr.schemas import RuntimeProfile
from formula_ocr.store import Store


class RuntimeSourceTests(unittest.TestCase):
    def test_legacy_cuda130_setting_migrates_to_auto(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            database = Path(temporary) / "app.sqlite3"
            first_store = Store(database)
            with first_store._connect() as connection:  # exercise persisted 0.3.3 data
                connection.execute(
                    "UPDATE settings SET value = ? WHERE key = 'app'",
                    ('{"runtime_profile":"cuda130"}',),
                )
            migrated_store = Store(database)
            self.assertEqual(migrated_store.get_settings().runtime_profile, RuntimeProfile.AUTO)

    def test_cuda_profile_uses_the_cuda118_manifest_name(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manager = RuntimeManager(AppPaths(root=root, data=root / "data", static=root / "static"))
            self.assertEqual(manager.manifest_for(RuntimeProfile.CUDA118).name, "cuda118.txt")
            self.assertEqual(manager.manifest_for(RuntimeProfile.CUDA126).name, "cuda126.txt")

    def test_download_sources_are_explicit(self) -> None:
        sources = RuntimeManager.download_sources()
        self.assertIn("离线", sources["cpu_paddle"])
        self.assertIn(PADDLE_CUDA118_INDEX_URL, sources["cuda118_paddle"])
        self.assertIn(PADDLE_CUDA126_INDEX_URL, sources["cuda126_paddle"])
        self.assertIn(PYPI_MIRROR_URL, sources["cuda_paddleocr"])

    def test_paddle_indexes_match_the_requested_runtime(self) -> None:
        self.assertEqual(RuntimeManager.paddle_sources(RuntimeProfile.CPU)[0][0], PADDLE_CPU_INDEX_URL)
        self.assertEqual(RuntimeManager.paddle_sources(RuntimeProfile.CUDA118)[0][0], PADDLE_CUDA118_INDEX_URL)
        self.assertEqual(RuntimeManager.paddle_sources(RuntimeProfile.CUDA126)[0][0], PADDLE_CUDA126_INDEX_URL)

    def test_runtime_needs_a_success_marker_not_only_a_python_file(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            paths = AppPaths(root=root, data=root / "data", static=root / "static")
            manager = RuntimeManager(paths)
            manifest = manager.manifest_for(RuntimeProfile.CPU)
            manifest.parent.mkdir(parents=True)
            manifest.write_text("paddleocr==3.7.0\n", encoding="utf-8")
            interpreter = manager.profile_dir(RuntimeProfile.CPU) / "venv" / "bin" / "python"
            interpreter.parent.mkdir(parents=True)
            interpreter.touch()
            self.assertFalse(manager.is_installed(RuntimeProfile.CPU))
            marker = manager.profile_dir(RuntimeProfile.CPU) / "installed.json"
            marker.write_text(
                '{"profile":"cpu"}',
                encoding="utf-8",
            )
            self.assertFalse(manager.is_installed(RuntimeProfile.CPU))
            marker.write_text(
                '{"profile":"cpu","verified_paddle":true,"manifest":"paddleocr==3.7.0\\n"}',
                encoding="utf-8",
            )
            self.assertTrue(manager.is_installed(RuntimeProfile.CPU))
            manifest.write_text("paddleocr==3.8.0\n", encoding="utf-8")
            self.assertFalse(manager.is_installed(RuntimeProfile.CPU))

    def test_cpu_wheelhouse_is_relative_to_the_app_root(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manager = RuntimeManager(AppPaths(root=root, data=root / "data", static=root / "static"))
            self.assertEqual(manager.cpu_wheelhouse(), root / "runtime-wheelhouses" / "cpu")

    def test_cpu_manifest_contains_formula_tokenizer_dependency(self) -> None:
        manifest = (Path(__file__).resolve().parents[1] / "runtime-manifests" / "cpu.txt").read_text(encoding="utf-8")
        self.assertIn("tokenizers>=0.19", manifest)
        self.assertIn("ftfy>=6.0", manifest)

    def test_cuda_manifests_contain_formula_decoder_dependencies(self) -> None:
        root = Path(__file__).resolve().parents[1] / "runtime-manifests"
        for name in ("cuda118.txt", "cuda126.txt"):
            manifest = (root / name).read_text(encoding="utf-8")
            self.assertIn("paddlepaddle-gpu==3.3.1", manifest)
            self.assertIn("paddleocr==3.7.0", manifest)
            self.assertIn("paddlex==3.7.2", manifest)
            self.assertIn("tokenizers>=0.19", manifest)
            self.assertIn("ftfy>=6.0", manifest)

    def test_worker_uses_app_owned_cache_and_temp_paths(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            paths = AppPaths(root=root, data=root / "data", static=root / "static")
            manager = RuntimeManager(paths)
            environment = manager.worker_environment(RuntimeProfile.CPU)
            self.assertEqual(environment["PADDLE_HOME"], str(paths.cache / "paddle"))
            self.assertEqual(environment["XDG_CACHE_HOME"], str(paths.cache / "xdg"))
            self.assertEqual(environment["TMPDIR"], str(paths.temporary))
            self.assertEqual(environment["HOME"], str(paths.home))
            self.assertTrue((paths.cache / "paddle").is_dir())


class RuntimeDiagnosisTests(unittest.IsolatedAsyncioTestCase):
    async def test_diagnosis_uses_a_short_lived_runtime_process(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            paths = AppPaths(root=root, data=root / "data", static=root / "static")
            manager = RuntimeManager(paths)
            process = AsyncMock()
            process.returncode = 0
            process.communicate.return_value = (
                b'Paddle startup log\nFORMULA_OCR_DIAGNOSTICS={"paddle_version": "3.3.0", "compiled_with_cuda": false, "cuda_available": false, "device_count": 0, "cuda_version": null}\n',
                None,
            )
            with (
                patch.object(manager, "interpreter_for", return_value=root / "python") as selected_interpreter,
                patch("formula_ocr.runtime.asyncio.create_subprocess_exec", return_value=process) as create_process,
            ):
                diagnostics = await manager.diagnose(RuntimeProfile.CPU)

        self.assertEqual(diagnostics["paddle_version"], "3.3.0")
        self.assertFalse(diagnostics["compiled_with_cuda"])
        selected_interpreter.assert_called_once_with(RuntimeProfile.CPU)
        self.assertEqual(create_process.call_args.args[:2], (str(root / "python"), "-c"))


class RuntimeInstallCommandTests(unittest.IsolatedAsyncioTestCase):
    async def test_background_install_exposes_phase_and_recent_logs(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manager = RuntimeManager(AppPaths(root=root, data=root / "data", static=root / "static"))

            async def fake_install(profile, report=None):
                assert report is not None
                report("正在下载 CUDA Paddle…", "Downloading paddlepaddle-gpu")
                return {"profile": profile.value, "verified_paddle": True}

            manager.install = fake_install  # type: ignore[method-assign]
            started = manager.start_install(RuntimeProfile.CUDA118)
            self.assertEqual(started["state"], "installing")
            await manager._install_task
            completed = manager.installation_status(RuntimeProfile.CUDA118)

        self.assertEqual(completed["state"], "succeeded")
        self.assertIn("Downloading paddlepaddle-gpu", completed["logs"])
        self.assertEqual(completed["result"]["profile"], "cuda118")

    async def test_active_background_install_can_be_cancelled(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manager = RuntimeManager(AppPaths(root=root, data=root / "data", static=root / "static"))
            started = asyncio.Event()
            keep_running = asyncio.Event()

            async def fake_install(profile, report=None):
                started.set()
                await keep_running.wait()
                return {"profile": profile.value, "verified_paddle": True}

            manager.install = fake_install  # type: ignore[method-assign]
            manager.start_install(RuntimeProfile.CPU)
            await started.wait()
            cancelling = manager.cancel_install(RuntimeProfile.CPU)
            self.assertEqual(cancelling["state"], "cancelling")
            assert manager._install_task is not None
            with self.assertRaises(asyncio.CancelledError):
                await manager._install_task
            cancelled = manager.installation_status(RuntimeProfile.CPU)

        self.assertEqual(cancelled["state"], "cancelled")

    async def test_paddle_verification_uses_app_owned_environment(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            paths = AppPaths(root=root, data=root / "data", static=root / "static")
            manager = RuntimeManager(paths)
            calls: list[tuple[list[str], dict[str, str] | None]] = []

            async def fake_run(
                command: list[str], *, cwd: Path, env: dict[str, str] | None = None
            ) -> None:
                calls.append((command, env))

            manager._run = fake_run  # type: ignore[method-assign]
            await manager._verify_paddle(root / "python", root, RuntimeProfile.CPU)

        self.assertEqual(calls[0][1]["PADDLE_HOME"], str(paths.cache / "paddle"))
        self.assertEqual(calls[0][1]["TMPDIR"], str(paths.temporary))

    async def test_cpu_install_is_offline(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manager = RuntimeManager(AppPaths(root=root, data=root / "data", static=root / "static"))
            wheelhouse = manager.cpu_wheelhouse()
            wheelhouse.mkdir(parents=True)
            (wheelhouse / "placeholder.whl").touch()
            commands: list[list[str]] = []

            async def fake_run(command: list[str], *, cwd: Path) -> None:
                commands.append(command)

            manager._run = fake_run  # type: ignore[method-assign]
            source = await manager._install_cpu_offline(root / "python", root, root / "cpu.txt")

        self.assertIn("离线", source)
        self.assertIn("--no-index", commands[0])
        self.assertIn("--find-links", commands[0])

    async def test_pip_install_uses_long_timeout_and_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manager = RuntimeManager(AppPaths(root=root, data=root / "data", static=root / "static"))
            commands: list[list[str]] = []

            async def fake_run(command: list[str], *, cwd: Path) -> None:
                commands.append(command)
                if len(commands) == 1:
                    raise RuntimeError("first mirror failed")

            manager._run = fake_run  # type: ignore[method-assign]
            result = await manager._install_with_fallback(
                root / "python",
                root,
                package="paddleocr==3.5.0",
                sources=((PYPI_MIRROR_URL, "镜像"), ("https://fallback.example/simple", "回退")),
                force_reinstall=True,
            )

        self.assertEqual(result, "回退")
        self.assertEqual(commands[0][commands[0].index("--timeout") + 1], "180")
        self.assertIn("--no-cache-dir", commands[0])
        self.assertIn("--force-reinstall", commands[0])
        self.assertIn("https://fallback.example/simple", commands[1])

    async def test_cuda_install_includes_formula_decoder_dependencies(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            paths = AppPaths(root=root, data=root / "data", static=root / "static")
            manager = RuntimeManager(paths)
            manifest = root / "runtime-manifests" / "cuda118.txt"
            manifest.parent.mkdir(parents=True)
            manifest.write_text(
                "paddlepaddle-gpu==3.3.1\npaddleocr==3.7.0\npaddlex==3.7.2\ntokenizers>=0.19\nftfy>=6.0\n",
                encoding="utf-8",
            )
            commands: list[list[str]] = []

            async def fake_run(command: list[str], *, cwd: Path, **_: object) -> None:
                commands.append(command)

            manager._run = fake_run  # type: ignore[method-assign]
            await manager.install(RuntimeProfile.CUDA118)

        packages = [command[-1] for command in commands if "pip" in command]
        self.assertIn("tokenizers>=0.19", packages)
        self.assertIn("ftfy>=6.0", packages)
