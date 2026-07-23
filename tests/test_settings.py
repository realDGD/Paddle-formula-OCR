from __future__ import annotations

import unittest

from formula_ocr.schemas import AppSettings, LaunchMode, SettingsUpdate


class LaunchModeSettingsTests(unittest.TestCase):
    def test_browser_tab_is_the_default_launch_mode(self) -> None:
        self.assertIs(AppSettings().launch_mode, LaunchMode.BROWSER_TAB)

    def test_launch_mode_can_be_updated(self) -> None:
        update = SettingsUpdate.model_validate({"launch_mode": "embedded"})
        self.assertIs(update.launch_mode, LaunchMode.EMBEDDED)
