from __future__ import annotations

import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch

from pydantic import ValidationError

from formula_ocr.config import (
    available_cpu_count,
    configured_api_server_port,
    paths_from_environment,
    resolve_cpu_threads,
)
from formula_ocr.schemas import (
    AppSettings,
    LaunchMode,
    SettingsUpdate,
    UserPreferences,
    UserPreferencesUpdate,
)


class LaunchModeSettingsTests(unittest.TestCase):
    def test_browser_tab_is_the_default_launch_mode(self) -> None:
        self.assertIs(UserPreferences().launch_mode, LaunchMode.BROWSER_TAB)

    def test_launch_mode_can_be_updated(self) -> None:
        update = UserPreferencesUpdate.model_validate({"launch_mode": "embedded"})
        self.assertIs(update.launch_mode, LaunchMode.EMBEDDED)

    def test_global_settings_reject_user_and_fnos_owned_fields(self) -> None:
        with self.assertRaises(ValidationError):
            SettingsUpdate.model_validate({"launch_mode": "embedded"})
        with self.assertRaises(ValidationError):
            SettingsUpdate.model_validate({"api_server_port": 9000})
        with self.assertRaises(ValidationError):
            SettingsUpdate.model_validate({"api_server_token": "x" * 40})

    def test_cpu_threads_support_automatic_detection(self) -> None:
        self.assertEqual(AppSettings().cpu_threads, 0)
        self.assertEqual(SettingsUpdate(cpu_threads=0).cpu_threads, 0)

    def test_cpu_detection_respects_affinity_and_cgroup_limits(self) -> None:
        with (
            patch("formula_ocr.config.os.cpu_count", return_value=16),
            patch(
                "formula_ocr.config.os.sched_getaffinity",
                return_value=set(range(8)),
                create=True,
            ),
            patch("formula_ocr.config._cgroup_cpu_limit", return_value=6),
        ):
            self.assertEqual(available_cpu_count(), 6)

    def test_cpu_thread_resolution_uses_auto_and_clamps_manual_values(self) -> None:
        with patch("formula_ocr.config.available_cpu_count", return_value=6):
            self.assertEqual(resolve_cpu_threads(0), 6)
            self.assertEqual(resolve_cpu_threads(4), 4)
            self.assertEqual(resolve_cpu_threads(12), 6)

    def test_fnos_live_config_file_overrides_stale_process_environment(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            data_dir = Path(temporary)
            (data_dir / "env").write_text(
                "TRIM_SERVICE_PORT=9100\nFORMULA_OCR_API_PORT=9200\n",
                encoding="utf-8",
            )
            with patch.dict("os.environ", {"FORMULA_OCR_API_PORT": "9000"}):
                self.assertEqual(configured_api_server_port(data_dir), 9200)

    def test_uploads_use_the_configured_transient_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data = root / "persistent"
            transient = root / "transient"
            with patch.dict(
                "os.environ",
                {
                    "FORMULA_OCR_APP_ROOT": str(root),
                    "FORMULA_OCR_DATA_DIR": str(data),
                    "FORMULA_OCR_STATIC_DIR": str(root / "static"),
                    "FORMULA_OCR_TEMP_DIR": str(transient),
                },
                clear=False,
            ):
                paths = paths_from_environment()
            self.assertEqual(paths.uploads, (transient / "jobs").resolve())
            self.assertEqual(paths.legacy_uploads, (data / "jobs").resolve())
            self.assertTrue(paths.uploads.is_dir())
            self.assertFalse(paths.legacy_uploads.exists())
