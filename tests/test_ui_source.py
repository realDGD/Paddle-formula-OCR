from __future__ import annotations

import unittest
from pathlib import Path


class UserInterfaceSourceTests(unittest.TestCase):
    def test_settings_values_are_read_from_the_form(self) -> None:
        source = (Path(__file__).resolve().parents[1] / "static" / "app.js").read_text(encoding="utf-8")
        self.assertIn("const settingsForm = $('#settings-form');", source)
        self.assertIn("settingsForm.elements.namedItem(key)", source)
        self.assertNotIn("dialog.elements.namedItem(key)", source)

    def test_settings_display_download_sources(self) -> None:
        source = (Path(__file__).resolve().parents[1] / "static" / "app.js").read_text(encoding="utf-8")
        self.assertIn("payload.download_sources", source)
        self.assertIn("settings-sources", source)
        self.assertIn("sources.cpu_paddle", source)
        self.assertIn("sources.cuda118_paddle", source)
        self.assertIn("sources.cuda126_paddle", source)
        self.assertIn("function renderDownloadSources", source)
        self.assertIn("container.replaceChildren(title, list)", source)

    def test_settings_offer_isolated_cuda_profiles(self) -> None:
        root = Path(__file__).resolve().parents[1]
        markup = (root / "static" / "index.html").read_text(encoding="utf-8")
        source = (root / "static" / "app.js").read_text(encoding="utf-8")
        self.assertIn('value="cuda118"', markup)
        self.assertIn('value="cuda126"', markup)
        self.assertIn("startRuntimeInstall('cuda118')", source)
        self.assertIn("startRuntimeInstall('cuda126')", source)

    def test_first_run_setup_and_admin_log_tools_are_available(self) -> None:
        root = Path(__file__).resolve().parents[1]
        markup = (root / "static" / "index.html").read_text(encoding="utf-8")
        source = (root / "static" / "app.js").read_text(encoding="utf-8")
        self.assertIn('id="runtime-setup-notice"', markup)
        self.assertIn('id="bootstrap-runtime"', markup)
        self.assertIn('id="bootstrap-dialog"', markup)
        self.assertIn('id="open-logs"', markup)
        self.assertIn('id="save-settings"', markup)
        self.assertLess(markup.index('class="runtime-management"'), markup.index('id="settings-sources"'))
        self.assertIn("refreshRuntimeAvailability", source)
        self.assertIn("api/admin/bootstrap/plan", source)
        self.assertIn("api/admin/bootstrap/status", source)
        self.assertIn("api/admin/logs", source)

    def test_upload_controls_and_task_cancellation_are_inline(self) -> None:
        root = Path(__file__).resolve().parents[1]
        markup = (root / "static" / "index.html").read_text(encoding="utf-8")
        source = (root / "static" / "app.js").read_text(encoding="utf-8")
        self.assertIn('id="clear-image"', markup)
        self.assertIn('id="cancel-job"', markup)
        self.assertIn("dropZone.hidden = true", source)
        self.assertIn("method: 'DELETE'", source)

    def test_latex_uses_browser_fallback_font_rules(self) -> None:
        root = Path(__file__).resolve().parents[1]
        markup = (root / "static" / "index.html").read_text(encoding="utf-8")
        styles = (root / "static" / "styles.css").read_text(encoding="utf-8")
        self.assertIn("mtextInheritFont: true", markup)
        self.assertIn("unknownFamily: 'serif'", markup)
        self.assertIn("font-family: ui-monospace, monospace", styles)
        self.assertIn("font-family: ui-serif, serif", styles)

    def test_embedded_workbench_inherits_fnos_theme_but_tab_uses_browser_theme(self) -> None:
        root = Path(__file__).resolve().parents[1]
        theme_bridge = (root / "static" / "theme.js").read_text(encoding="utf-8")
        styles = (root / "static" / "styles.css").read_text(encoding="utf-8")
        markup = (root / "static" / "index.html").read_text(encoding="utf-8")
        self.assertIn("window.top === window", theme_bridge)
        self.assertIn("MutationObserver", theme_bridge)
        self.assertIn("fnos-theme-mode", theme_bridge)
        self.assertIn("storedMode !== null", theme_bridge)
        self.assertIn("matchMedia('(prefers-color-scheme: dark)')", theme_bridge)
        self.assertIn("storage", theme_bridge)
        self.assertIn('root.dataset.fnosTheme', theme_bridge)
        self.assertIn('src="./theme.js"', markup)
        self.assertIn(':root[data-fnos-theme="dark"]', styles)
        self.assertIn(':root[data-fnos-theme="light"]', styles)
        self.assertIn("#settings-dialog", styles)
        self.assertIn("max-height", styles)

    def test_latex_editor_has_highlighting_and_rendered_command_completion(self) -> None:
        root = Path(__file__).resolve().parents[1]
        markup = (root / "static" / "index.html").read_text(encoding="utf-8")
        source = (root / "frontend" / "latex-editor.js").read_text(encoding="utf-8")
        app = (root / "static" / "app.js").read_text(encoding="utf-8")
        self.assertIn('vendor/codemirror/latex-editor.js', markup)
        self.assertIn('id="latex-editor"', markup)
        self.assertIn('StreamLanguage.define(stexMath)', source)
        self.assertIn('autocompletion({', source)
        self.assertIn('renderCompletionPreview', source)
        self.assertIn('.startsWith(prefix)', source)
        self.assertIn('filter: false', source)
        self.assertIn('apply: `${label} `', source)
        self.assertIn('snippetCompletion(`${template} `', source)
        self.assertIn("caretColor: 'var(--latex-caret)'", source)
        self.assertIn('--latex-caret: #1769e0', (root / "static" / "styles.css").read_text(encoding="utf-8"))
        self.assertIn('--latex-caret: #73a9ff', (root / "static" / "styles.css").read_text(encoding="utf-8"))
        self.assertIn("{ key: 'Tab', run: acceptCompletion }", source)
        for command in ["sum", "prod", "coprod", "bigcup", "bigcap", "bigvee", "bigwedge", "int", "oint", "lim"]:
            self.assertIn(f"['\\\\{command}',", source)
        self.assertIn("`${label}\\\\limits`", source)
        self.assertIn("`${label}\\\\nolimits`", source)
        self.assertIn("['\\\\cancel',", source)
        self.assertIn('FormulaLatexEditor?.create', app)

    def test_visual_formula_editor_has_local_mathlive_tools_and_handwriting_panel(self) -> None:
        root = Path(__file__).resolve().parents[1]
        markup = (root / "static" / "index.html").read_text(encoding="utf-8")
        source = (root / "static" / "app.js").read_text(encoding="utf-8")
        build_script = (root / "scripts" / "build_fpk.sh").read_text(encoding="utf-8")
        self.assertIn('data-page="editor"', markup)
        self.assertIn('id="editor-page"', markup)
        self.assertIn('id="visual-math-field"', markup)
        self.assertIn('id="visual-latex-editor"', markup)
        self.assertIn('id="handwriting-canvas"', markup)
        self.assertIn('id="recognize-handwriting"', markup)
        self.assertIn('vendor/mathlive/mathlive.min.js', markup)
        self.assertIn("function showWorkbenchPage", source)
        self.assertIn("function insertVisualLatex", source)
        self.assertIn("function handwritingCandidates", source)
        self.assertIn("continue-visual-edit", source)
        self.assertIn('MATHLIVE_DIR=', build_script)
        self.assertIn('mathlive.min.js', build_script)

    def test_runtime_results_are_pretty_printed(self) -> None:
        root = Path(__file__).resolve().parents[1]
        source = (root / "static" / "app.js").read_text(encoding="utf-8")
        styles = (root / "static" / "styles.css").read_text(encoding="utf-8")
        self.assertIn("JSON.stringify(payload.diagnostics || payload.installed, null, 2)", source)
        self.assertIn("#settings-message { white-space: pre-wrap", styles)
        self.assertIn(".download-sources dl", styles)

    def test_runtime_installation_is_polled_with_recent_output(self) -> None:
        root = Path(__file__).resolve().parents[1]
        source = (root / "static" / "app.js").read_text(encoding="utf-8")
        markup = (root / "static" / "index.html").read_text(encoding="utf-8")
        self.assertIn("install-status", source)
        self.assertIn("installation.logs.slice(-8)", source)
        self.assertIn("window.setTimeout(() => pollRuntimeInstallation(profile), 1000)", source)
        self.assertIn("cancelRuntimeInstall", source)
        self.assertIn("resumeRuntimeInstallation", source)
        self.assertIn("method: 'DELETE'", source)
        self.assertIn('id="cancel-install-cpu"', markup)
        self.assertIn('id="cancel-install-cuda118"', markup)
        self.assertIn('id="cancel-install-cuda126"', markup)

    def test_formula_worker_checks_tokenizer_dependency(self) -> None:
        worker = (Path(__file__).resolve().parents[1] / "src" / "formula_ocr" / "worker.py").read_text(encoding="utf-8")
        self.assertIn('"tokenizers"', worker)
        self.assertIn('"ftfy"', worker)

    def test_crop_uses_a_modal_and_locks_after_pointer_release(self) -> None:
        root = Path(__file__).resolve().parents[1]
        markup = (root / "static" / "index.html").read_text(encoding="utf-8")
        source = (root / "static" / "app.js").read_text(encoding="utf-8")
        self.assertIn('id="crop-dialog"', markup)
        self.assertIn('id="crop-reset"', markup)
        self.assertIn("cropDialog.showModal()", source)
        self.assertIn("state.crop.dragging = false", source)
        self.assertIn("if (!state.crop?.dragging) return", source)

    def test_launcher_uses_gateway_relative_workbench_url(self) -> None:
        root = Path(__file__).resolve().parents[1]
        launcher = (root / "static" / "launcher.js").read_text(encoding="utf-8")
        config = (root / "fnos-package" / "app" / "ui" / "config").read_text(encoding="utf-8")
        self.assertIn("new URL('./', window.location.href)", launcher)
        self.assertIn("window.open(workbench, '_blank', 'noopener')", launcher)
        self.assertIn('"url": "/app/paddle-formula-ocr/launcher.html"', config)

    def test_uninstall_wizard_defaults_to_preserving_application_data(self) -> None:
        root = Path(__file__).resolve().parents[1]
        wizard = (root / "fnos-package" / "wizard" / "uninstall").read_text(encoding="utf-8")
        callback = (root / "fnos-package" / "cmd" / "uninstall_callback").read_text(encoding="utf-8")
        self.assertIn('"type": "radio"', wizard)
        self.assertIn('"field": "wizard_data_action"', wizard)
        self.assertIn('"initValue": "keep"', wizard)
        self.assertIn('"value": "delete"', wizard)
        self.assertIn('DATA_ACTION="${wizard_data_action:-keep}"', callback)
        self.assertIn('/vol*/@appdata/paddle-formula-ocr', callback)
