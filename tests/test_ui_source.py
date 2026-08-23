from __future__ import annotations

import json
import unittest
from pathlib import Path


def frontend_application_source(root: Path) -> str:
    """Read reviewable source modules instead of asserting on the generated bundle."""
    source_root = root / "frontend" / "app"
    return "\n".join(
        path.read_text(encoding="utf-8")
        for pattern in ("*.ts", "*.mts")
        for path in sorted(source_root.rglob(pattern))
    )


class UserInterfaceSourceTests(unittest.TestCase):
    def test_workbench_entrypoint_only_composes_feature_controllers(self) -> None:
        root = Path(__file__).resolve().parents[1]
        source_root = root / "frontend" / "app"
        main = (source_root / "main.ts").read_text(encoding="utf-8")
        markup = (root / "static" / "index.html").read_text(encoding="utf-8")
        manifest = (root / "fnos-package" / "manifest").read_text(encoding="utf-8")
        version = next(line.partition("=")[2] for line in manifest.splitlines() if line.startswith("version="))
        expected_modules = (
            "admin/index.ts",
            "copy-controller.ts",
            "formula-editor-controller.ts",
            "formula-toolbox-controller.ts",
            "handwriting-controller.ts",
            "image-controller.ts",
            "job-controller.ts",
            "latex-renderer.ts",
            "table-controller.ts",
            "view-preferences.ts",
        )
        for relative_path in expected_modules:
            self.assertTrue((source_root / "features" / relative_path).is_file())
        self.assertLessEqual(len(main.splitlines()), 120)
        self.assertNotIn("fetch(", main)
        self.assertNotIn("addEventListener(", main)
        self.assertIn("createFormulaEditorController()", main)
        self.assertIn("initializeJobController({", main)
        for asset in ("styles.css", "latex-source-formatter.js", "formula-tools.js", "app.js"):
            self.assertIn(f'./{asset}?v={version}', markup)
        package = (root / "package.json").read_text(encoding="utf-8")
        build_script = (root / "scripts" / "build_fpk.sh").read_text(encoding="utf-8")
        self.assertIn('"build:app"', package)
        self.assertIn('frontend/app/main.ts', build_script)

    def test_settings_values_are_read_from_the_form(self) -> None:
        source = frontend_application_source(Path(__file__).resolve().parents[1])
        self.assertIn("const settingsForm = $<HTMLFormElement>('#settings-form');", source)
        self.assertIn("settingsForm.elements.namedItem(key)", source)
        self.assertNotIn("dialog.elements.namedItem(key)", source)

    def test_table_recognition_uses_independent_pages_and_safe_rendering(self) -> None:
        root = Path(__file__).resolve().parents[1]
        markup = (root / "static" / "index.html").read_text(encoding="utf-8")
        source = frontend_application_source(root)
        for page in ("ocr", "editor", "table-ocr", "table-editor"):
            self.assertIn(f'id="{page}-page"', markup)
            self.assertIn(f'data-page="{page}"', markup)
        self.assertIn("idPrefix: 'table-'", source)
        self.assertIn("body.append('kind', kind)", source)
        self.assertIn("['Enter', ' '].includes(event.key)", source)
        self.assertIn("parseMarkdownPipeTables", source)
        self.assertIn("new DOMParser()", source)
        self.assertIn("decodeHtmlEntities", source)
        self.assertIn("target.replaceChildren()", source)
        self.assertIn("setRecognizedMarkdown", source)
        self.assertIn("setEditorMarkdown", source)
        self.assertNotIn("innerHTML", (root / "frontend" / "app" / "features" / "table-controller.ts").read_text(encoding="utf-8"))

    def test_settings_display_download_sources(self) -> None:
        source = frontend_application_source(Path(__file__).resolve().parents[1])
        self.assertIn("payload.download_sources", source)
        self.assertIn("settings-sources", source)
        self.assertIn("sources.cpu_paddle", source)
        self.assertIn("sources.cuda118_paddle", source)
        self.assertIn("sources.cuda126_paddle", source)
        self.assertIn("function renderDownloadSources", source)
        self.assertIn("container.replaceChildren(title, list)", source)

    def test_admin_settings_are_grouped_and_keyboard_accessible(self) -> None:
        root = Path(__file__).resolve().parents[1]
        markup = (root / "static" / "index.html").read_text(encoding="utf-8")
        source = frontend_application_source(root)
        styles = (root / "static" / "styles.css").read_text(encoding="utf-8")
        for section in ["general", "performance", "api", "runtime"]:
            self.assertIn(f'data-settings-section="{section}"', markup)
            self.assertIn(f'data-settings-panel="{section}"', markup)
        self.assertIn('role="tablist"', markup)
        self.assertIn('id="cancel-settings"', markup)
        self.assertIn('<details class="settings-disclosure">', markup)
        self.assertIn("function setSettingsSection", source)
        self.assertIn("'formula-ocr-settings-section'", source)
        self.assertIn("panel.hidden = panel.dataset.settingsPanel !== section", source)
        self.assertIn("event.key === 'ArrowRight'", source)
        self.assertIn("setSettingsSection('runtime')", source)
        self.assertNotIn("$('#api_server_enabled_text')?.addEventListener", source)
        self.assertIn("软件安装", markup)
        self.assertIn('id="cpu-threads-select"', markup)
        self.assertIn("function populateCpuThreadOptions", source)
        self.assertIn("@media (max-width: 800px)", styles)
        self.assertIn(".settings-section-nav { flex-direction: row", styles)

    def test_launch_mode_is_a_per_user_preference(self) -> None:
        root = Path(__file__).resolve().parents[1]
        markup = (root / "static" / "index.html").read_text(encoding="utf-8")
        source = frontend_application_source(root)
        settings_markup = markup[
            markup.index('<dialog id="settings-dialog">'):
            markup.index('<dialog id="api-setup-dialog"')
        ]
        self.assertIn('id="preferences-dialog"', markup)
        self.assertIn('id="open-preferences"', markup)
        self.assertIn('name="launch_mode"', markup)
        self.assertNotIn('name="launch_mode"', settings_markup)
        self.assertIn("endpoint('api/preferences')", source)
        self.assertIn("只影响当前 fnOS 用户", markup)

    def test_editor_session_and_view_preferences_use_their_intended_storage(self) -> None:
        root = Path(__file__).resolve().parents[1]
        source = frontend_application_source(root)
        editor_source = (
            root / "frontend" / "app" / "features" / "formula-editor-controller.ts"
        ).read_text(encoding="utf-8")
        view_preferences = (
            root / "frontend" / "app" / "features" / "view-preferences.ts"
        ).read_text(encoding="utf-8")
        self.assertIn("window.sessionStorage", editor_source)
        self.assertIn("EDITOR_SESSION_KEY", editor_source)
        self.assertIn("if (!editorSessionEnabled) return", editor_source)
        self.assertIn("restoreEditorSession()", editor_source)
        self.assertNotIn("localStorage", editor_source)
        self.assertNotIn("sessionStorage", view_preferences)
        self.assertNotIn("localStorage", view_preferences)
        self.assertIn("editor_font_size", view_preferences)
        self.assertIn("preview_zoom", view_preferences)
        self.assertIn("endpoint('api/preferences')", source)

    def test_product_name_and_description_are_consistent(self) -> None:
        root = Path(__file__).resolve().parents[1]
        markup = (root / "static" / "index.html").read_text(encoding="utf-8")
        launcher = (root / "static" / "launcher.html").read_text(encoding="utf-8")
        manifest = (root / "fnos-package" / "manifest").read_text(encoding="utf-8")
        self.assertIn("display_name=公式与表格 OCR 工作台", manifest)
        self.assertIn("<title>公式与表格 OCR 工作台</title>", markup)
        self.assertIn("<h1>公式与表格 OCR 工作台</h1>", markup)
        self.assertIn("打开公式与表格 OCR 工作台", launcher)
        self.assertIn("离线公式与表格工作台，主要功能有：", manifest)
        self.assertIn("<strong>鸣谢：</strong>", manifest)

    def test_settings_offer_isolated_cuda_profiles(self) -> None:
        root = Path(__file__).resolve().parents[1]
        markup = (root / "static" / "index.html").read_text(encoding="utf-8")
        source = frontend_application_source(root)
        self.assertIn('value="cuda118"', markup)
        self.assertIn('value="cuda126"', markup)
        self.assertIn("startRuntimeInstall('cuda118')", source)
        self.assertIn("startRuntimeInstall('cuda126')", source)

    def test_first_run_setup_and_admin_log_tools_are_available(self) -> None:
        root = Path(__file__).resolve().parents[1]
        markup = (root / "static" / "index.html").read_text(encoding="utf-8")
        source = frontend_application_source(root)
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
        source = frontend_application_source(root)
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
        source = (root / "frontend" / "latex-editor.ts").read_text(encoding="utf-8")
        app = frontend_application_source(root)
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
        self.assertIn("analyzeLatexFences", source)
        self.assertIn("latexFenceHighlighter", source)
        self.assertIn("latexFenceTooltip", source)
        self.assertIn("cm-latex-fence-unmatched-confirmed", (root / "static" / "styles.css").read_text(encoding="utf-8"))
        self.assertIn('FormulaLatexEditor?.create', app)

    def test_visual_formula_editor_has_local_mathlive_tools_and_handwriting_panel(self) -> None:
        root = Path(__file__).resolve().parents[1]
        markup = (root / "static" / "index.html").read_text(encoding="utf-8")
        source = frontend_application_source(root)
        formula_tools = (root / "static" / "formula-tools.js").read_text(encoding="utf-8")
        styles = (root / "static" / "styles.css").read_text(encoding="utf-8")
        latex_editor = (root / "frontend" / "latex-editor.ts").read_text(encoding="utf-8")
        build_script = (root / "scripts" / "build_fpk.sh").read_text(encoding="utf-8")
        manifest = (root / "fnos-package" / "manifest").read_text(encoding="utf-8")
        self.assertIn('data-page="editor"', markup)
        self.assertIn('id="editor-page"', markup)
        self.assertIn('id="visual-math-field"', markup)
        self.assertIn('id="visual-latex-editor"', markup)
        self.assertIn('id="latex-input-tab"', markup)
        self.assertIn('id="visual-input-tab"', markup)
        self.assertIn('id="visual-source-preview-toggle"', markup)
        self.assertIn('同时开启源码预览', markup)
        self.assertIn('id="visual-formula-preview"', markup)
        self.assertIn('id="visual-render-status"', markup)
        self.assertIn('id="handwriting-canvas"', markup)
        self.assertNotIn('id="recognize-handwriting"', markup)
        self.assertIn('vendor/mathlive/mathlive.min.js', markup)
        self.assertIn('vendor/mathlive/formula-ocr-macros.js', markup)
        self.assertIn('src="./latex-source-formatter.js?v=', markup)
        self.assertIn('src="./formula-tools.js?v=', markup)
        self.assertIn('math-virtual-keyboard-policy="manual"', markup)
        self.assertIn("linebreaks:", markup)
        self.assertIn("inline: false", markup)
        self.assertNotIn('virtual-keyboard-mode="manual"', markup)
        self.assertLess(markup.index('id="formula-toolbox"'), markup.index('class="formula-input-shell"'))
        self.assertLess(markup.index('id="visual-latex-editor"'), markup.index('id="visual-formula-preview"'))
        self.assertIn('id="shortcut-tools-tab"', markup)
        self.assertIn('id="formula-templates-tab"', markup)
        self.assertIn('id="shortcut-category-bar"', markup)
        self.assertIn('id="shortcut-symbol-panel"', markup)
        self.assertIn('id="formula-template-category-bar"', markup)
        self.assertIn('id="formula-template-menu"', markup)
        self.assertIn('id="formula-template-grid"', markup)
        self.assertIn('id="formula-input-command-bar"', markup)
        self.assertIn('id="formula-format-toolbar"', markup)
        self.assertIn('id="formula-format-menu"', markup)
        self.assertIn("function showWorkbenchPage", source)
        self.assertIn("function insertVisualLatex", source)
        self.assertIn("function initializeFormulaToolbox", source)
        self.assertIn("function initializeFormulaFormatToolbar", source)
        self.assertIn("function openFormulaFormatMenu", source)
        self.assertIn("function applyFormulaEnvironment", source)
        environment_helpers = (root / "frontend" / "app" / "features" / "formula-environments.mts").read_text(encoding="utf-8")
        self.assertIn("switchFormulaEnvironment", source)
        self.assertIn("function unwrapOneFormulaEnvironment", environment_helpers)
        self.assertIn("while (true)", environment_helpers)
        self.assertIn("function getSourceSelectionForWrap", source)
        self.assertIn("function getVisualMathSelectionForWrap", source)
        self.assertIn("wrapSelection: true", source)
        self.assertNotIn("addEventListener('pointerenter'", source)
        self.assertIn("function renderTemplatePanel", source)
        self.assertNotIn("scheduleShortcutOpen", source)
        self.assertNotIn("scheduleTemplateOpen", source)
        self.assertNotIn("addEventListener('pointerenter'", source)
        self.assertIn("visualLatexEditor.insert(next, { snippet: snippetTemplate })", source)
        self.assertIn("insert(value: unknown, options: { snippet?: string } = {})", latex_editor)
        self.assertIn("applySnippet(snippetTemplate)", latex_editor)
        self.assertIn("button.dataset.toolSnippet = item.snippet", source)
        self.assertIn("function fitMenuFormulaPreviews", source)
        self.assertIn("function scheduleShortcutPanelPreviewFit", source)
        self.assertIn("document.fonts?.ready?.then(refit)", source)
        self.assertIn("function getViewportClampedPanelLeft", source)
        self.assertIn("window.innerWidth - panelWidth", source)
        self.assertIn("--menu-preview-scale", styles)
        self.assertIn("grid-template-columns: repeat(var(--shortcut-compact-columns, 16), 1.75rem)", styles)
        self.assertIn('shortcutSymbolPanel.dataset.shortcutCategory = category.id', source)
        self.assertIn('section.dataset.shortcutGroup = candidateGroup.label', source)
        self.assertIn('[data-shortcut-category="fractions"]', styles)
        self.assertIn('[data-shortcut-category="roots"]', styles)
        self.assertIn('[data-shortcut-category="limits"]', styles)
        self.assertIn('[data-shortcut-category="trigonometry"]', styles)
        self.assertIn('[data-shortcut-category="integrals"]', styles)
        self.assertIn('[data-shortcut-category="large-operators"]', styles)
        self.assertIn('[data-shortcut-category="brackets"]', styles)
        self.assertIn('[data-shortcut-category="matrices"]', styles)
        self.assertIn("shortcutCategory === 'fractions'", source)
        self.assertIn("shortcutCategory === 'greek'", source)
        self.assertIn("shortcutCategory === 'limits'", source)
        self.assertIn("Math.ceil((naturalWidth + 12) / 8) * 8", source)
        self.assertIn("(button === grid.firstElementChild ? 136 : 187)", source)
        self.assertIn("(button.dataset.toolInsert || '').includes('\\\\partial^2')", source)
        self.assertIn("function fitFormulaTemplateCards", source)
        self.assertIn("naturalHeight * scale + 22", source)
        self.assertIn("button.style.gridRow = `span ${Math.ceil", source)
        self.assertNotIn("button.classList.add('is-medium')", source)
        self.assertNotIn("button.classList.add('is-wide')", source)
        self.assertIn(".shortcut-symbol-preview mjx-container", styles)
        self.assertIn("position: absolute !important", styles)
        self.assertIn("translate(-50%, -50%) scale(var(--menu-preview-scale, 1)) !important", styles)
        self.assertIn(".shortcut-symbol-panel { position: absolute; z-index: 80; width: max-content; max-width: min(100%, calc(100vw - 3rem)); overflow: visible", styles)
        self.assertIn("grid-template-columns: repeat(var(--shortcut-fill-columns), 3.7rem)", styles)
        self.assertIn('[data-shortcut-category="large-operators"] .shortcut-symbol-panel-body { grid-template-columns: repeat(2, max-content)', styles)
        self.assertIn("height: 3rem", styles)
        self.assertIn("height: 4.5rem", styles)
        self.assertIn("height: 3.35rem", styles)
        self.assertIn("连续分式", formula_tools)
        self.assertIn("'formula'", formula_tools)
        self.assertIn("'large'", formula_tools)
        self.assertIn("candidate.layout !== 'standard'", source)
        self.assertIn("shortcut-symbol-grid is-${groupLayout}", source)
        self.assertIn(".shortcut-symbol-grid.is-wide", styles)
        self.assertIn("grid-auto-rows: 5.5rem", styles)
        self.assertIn("button.formula-template-button.is-large", styles)
        self.assertIn("grid-auto-flow: row dense", styles)
        self.assertIn("grid-auto-rows: .125rem", styles)
        self.assertIn("row-gap: 0", styles)
        self.assertIn("grid-row: span 72", styles)
        self.assertIn("button.formula-template-button.is-tall", styles)
        self.assertIn("button.formula-template-button.is-extra-tall", styles)
        self.assertIn("button.formula-template-button.is-wide-single-line", styles)
        self.assertIn(".formula-template-preview.is-single-line mjx-math", styles)
        self.assertIn("singleLine: !templateHasExplicitRows(preview)", formula_tools)
        self.assertIn("button.classList.add('is-wide-single-line')", source)
        self.assertIn("function packFormulaTemplateCards", source)
        self.assertIn("naturalWidth * formulaTemplateMinimumSingleLineScale > availableWidth", source)
        self.assertIn("availableRows + formulaTemplatePackingToleranceRows", source)
        self.assertIn("root.replaceChildren(...packed)", source)
        self.assertNotIn("candidate.preview.replace(/\\s+/g, '').length >= 50", source)
        self.assertIn("'麦克斯韦方程组积分形式'", formula_tools)
        self.assertNotIn("layoutFromUpstreamTemplate", formula_tools)
        self.assertIn("max-height: min(78vh, 46rem)", styles)
        self.assertIn(".shortcut-symbol-preview mjx-container::-webkit-scrollbar { display: none; }", styles)
        self.assertIn("function setFormulaInputMode", source)
        self.assertIn("function hideMathVirtualKeyboard", source)
        self.assertIn("window.mathVirtualKeyboard?.hide?.()", source)
        self.assertIn('class="copy-format-label compact-select-label">复制格式', markup)
        self.assertEqual(markup.count('class="copy-format-select"'), 2)
        self.assertIn(".copy-format-select {", styles)
        self.assertIn("appearance: auto", styles)
        self.assertIn("-webkit-appearance: menulist", styles)
        self.assertIn('id="visual-copy-format"', markup)
        self.assertGreaterEqual(markup.count('data-preview-zoom-value'), 2)
        self.assertIn('data-editor-font-size-control', markup)
        self.assertIn('data-editor-font-size-value', markup)
        self.assertIn("function synchronizeCopyFormat", source)
        self.assertIn("function applyEditorFontSize", source)
        self.assertIn("function applyPreviewZoom", source)
        self.assertIn("control.dataset.formulaInputControl !== mode", source)
        self.assertIn("function updateVisualSourcePreview", source)
        self.assertIn("visualSourcePreviewToggle?.addEventListener('change'", source)
        self.assertIn("target: $('#visual-formula-preview')", source)
        self.assertIn("function waitForMathJax", source)
        self.assertIn("'formula-ocr-mathjax-ready'", source)
        self.assertIn("await waitForMathJax()", source)
        latex_renderer = (
            root / "frontend" / "app" / "features" / "latex-renderer.ts"
        ).read_text(encoding="utf-8")
        self.assertNotIn("throw new Error('MathJax 尚未加载')", latex_renderer)
        self.assertLess(
            markup.index('class="editor-input-tabs"'),
            markup.index('data-formula-input-control="source"'),
        )
        self.assertLess(
            markup.index('class="editor-input-tabs"'),
            markup.index('data-formula-input-control="visual"'),
        )
        self.assertLess(
            markup.index('data-formula-input-control="visual"'),
            markup.index('id="latex-input-panel"'),
        )
        self.assertIn("function configureVisualMathField", source)
        self.assertIn("FormulaOcrMathLiveMacros", source)
        self.assertIn("MathfieldElement.fontsDirectory", source)
        self.assertIn("MathfieldElement.soundsDirectory = null", source)
        self.assertIn("MathfieldElement.scientificNotationTemplate", source)
        self.assertIn("window.MathLive?.validateLatex", source)
        for label in (
            "常用符号",
            "希腊字母",
            "分数微分",
            "根式角标",
            "极限对数",
            "三角函数",
            "积分运算",
            "大型运算",
            "括号取整",
            "数组矩阵",
        ):
            self.assertIn(f"'{label}'", formula_tools)
        for label in ("颜色", "字体", "字号", "环境"):
            self.assertIn(f"formatTool(", formula_tools)
            self.assertIn(f"'{label}'", formula_tools)
        self.assertIn("const formatTools = [", formula_tools)
        self.assertIn("formatTools,", formula_tools)
        self.assertIn("environmentOption('none'", formula_tools)
        self.assertIn("environmentOption('eqnarray'", formula_tools)
        self.assertIn("environmentOption('array'", formula_tools)
        self.assertNotIn("environmentOption('alignedat'", formula_tools)
        for label in ("代数", "几何", "不等式", "积分", "矩阵", "三角", "统计", "数列", "物理", "化学"):
            self.assertIn(f"'{label}'", formula_tools)
        self.assertIn("const templates = templateCategories.flatMap", formula_tools)
        self.assertIn("if (templates.length !== 127)", formula_tools)
        self.assertIn("templateCategoryCounts", formula_tools)
        self.assertNotIn("FormulaOcrLatexLiveTemplateSource", formula_tools)
        self.assertNotIn("latexlive-template-source.js", markup)
        self.assertIn("https://detexify.kirelabs.org/", markup)
        self.assertNotIn('class="app-about', markup)
        self.assertIn("maintainer=realDGD", manifest)
        self.assertIn("maintainer_url=https://github.com/realDGD", manifest)
        self.assertIn("distributor=realDGD", manifest)
        self.assertIn("distributor_url=https://github.com/realDGD", manifest)
        self.assertIn("https://github.com/PaddlePaddle/PaddleOCR", manifest)
        self.assertIn("formatPreset", formula_tools)
        self.assertIn("FormulaOcrLatexFormatter", source)
        self.assertIn("safelyFormatRecognizedLatex", source)
        self.assertIn("hasEquivalentMathJaxOutput", source)
        self.assertIn("hasEquivalentTokens", source)
        self.assertIn("visualLatexEditor ? visualLatexEditor.getValue() : visualLatex.value", source)
        self.assertIn("visualField.setValue(next, { silenceNotifications: true })", source)
        self.assertNotIn(
            "const getVisualLatexValue = () => visualField?.getValue?.('latex')",
            source,
        )
        self.assertIn("function classify", source)
        self.assertIn("candidate-command", source)
        self.assertIn("continue-visual-edit", source)
        self.assertIn('MATHLIVE_DIR=', build_script)
        self.assertIn('mathlive.min.js', build_script)

    def test_mathlive_upgreek_macro_profile_covers_visual_editor_symbols(self) -> None:
        root = Path(__file__).resolve().parents[1]
        macros = (root / "static/vendor/mathlive/formula-ocr-macros.js").read_text(encoding="utf-8")
        stylesheet = (root / "static/styles.css").read_text(encoding="utf-8")
        for command in ("updelta", "uprho", "upxi", "upvarsigma", "Updelta", "Upxi"):
            self.assertIn(f"{command}:", macros)
        self.assertIn("\\\\mathrm", macros)
        self.assertIn("mathds: { def: '\\\\mathbb{#1}'", macros)
        self.assertIn("Coloneqq:", macros)
        self.assertIn("iiiint:", macros)
        self.assertIn(".candidate-button .candidate-command", stylesheet)
        self.assertIn("text-align: left", stylesheet)
        self.assertIn("#visual-math-field::part(content)", stylesheet)
        self.assertIn("justify-content: center", stylesheet)
        self.assertIn("border-top: 1px dashed", stylesheet)

    def test_mathlive_coverage_audit_records_exact_and_approximated_symbols(self) -> None:
        import json

        root = Path(__file__).resolve().parents[1]
        script = (root / "scripts/verify_mathlive_symbol_coverage.mjs").read_text(encoding="utf-8")
        audit = json.loads((root / "scripts/mathlive_symbol_audit.json").read_text(encoding="utf-8"))
        self.assertIn("convertLatexToMarkup", script)
        self.assertEqual(audit["totalMathJaxVerifiedSymbols"], 634)
        self.assertEqual(len(audit["supported"]), 634)
        self.assertEqual(len(audit["exactlySupported"]), 605)
        self.assertEqual(len(audit["approximated"]), 29)
        self.assertEqual(len(audit["unsupported"]), 0)
        self.assertTrue(any(item["command"] == r"\mathds{A}" for item in audit["approximated"]))
        self.assertTrue(any(item["command"] == r"\Coloneqq" for item in audit["exactlySupported"]))
        self.assertFalse(any(item["command"] == r"\updelta" for item in audit["unsupported"]))

    def test_lan_api_help_uses_bearer_token_and_long_timeout(self) -> None:
        root = Path(__file__).resolve().parents[1]
        markup = (root / "static" / "index.html").read_text(encoding="utf-8")
        source = frontend_application_source(root)
        self.assertNotIn('name="api_server_token"', markup)
        self.assertNotIn('name="api_server_port"', markup)
        self.assertIn('"Authorization": f"Bearer {API_TOKEN}"', source)
        self.assertIn('RECOGNITION_KIND = "formula"', source)
        self.assertIn('data={"kind": RECOGNITION_KIND}', source)
        self.assertIn('result.get("tables", [])', source)
        self.assertIn("apiConfiguration.requestTimeout = modelLoadTimeout + executionTimeout + 30", source)
        self.assertIn("timeout=(5, ${apiConfiguration.requestTimeout})", source)
        self.assertIn("await refreshApiClientCredentials()", source)
        self.assertIn("endpoint('api/admin/api-client')", source)
        self.assertIn("endpoint('api/admin/api-token')", source)
        self.assertIn("result.get(\"detail\") or result.get(\"message\")", source)
        self.assertIn('id="api-client-credential-status"', markup)
        self.assertNotIn("timeout=30", source)

    def test_mathjax_strict_profile_and_offline_font_extensions_are_configured(self) -> None:
        root = Path(__file__).resolve().parents[1]
        markup = (root / "static" / "index.html").read_text(encoding="utf-8")
        source = frontend_application_source(root)
        profile = (root / "static/vendor/mathjax/formula-ocr-profile.js").read_text(encoding="utf-8")
        audit = (root / "scripts/verify_all_detexify_symbols.js").read_text(encoding="utf-8")
        build_script = (root / "scripts/build_fpk.sh").read_text(encoding="utf-8")
        self.assertIn("'mathjax-newcm': `${formulaOcrMathJaxFontRoot}/mathjax-newcm`", markup)
        self.assertIn("dynamicPrefix: '[mathjax-newcm]/chtml/dynamic'", markup)
        self.assertIn("loadAllFontFiles: false", markup)
        self.assertIn("FormulaOcrMathJaxRuntime", source)
        self.assertIn("operationQueue", source)
        self.assertIn('vendor/mathjax/formula-ocr-profile.js', markup)
        self.assertIn("formulaOcrMathJaxProfile.packages", markup)
        self.assertIn("'[-]': formulaOcrMathJaxProfile.excludedPackages", markup)
        self.assertIn("'dsfont'", profile)
        self.assertIn("'bbm'", profile)
        self.assertIn("'bboldx'", profile)
        self.assertIn("'mhchem'", profile)
        self.assertIn("formula-ocr-profile.js", audit)
        self.assertIn("item.mathmode", audit)
        self.assertIn("hasVisibleMathOutput", audit)
        self.assertIn("mathjax-dsfont-font-extension", build_script)
        self.assertTrue(
            (root / "static/vendor/mathjax/fonts/mathjax-newcm/chtml/woff2").is_dir()
        )
        for extension in ("mhchem", "dsfont", "bbm", "bboldx"):
            self.assertTrue(
                (root / f"static/vendor/mathjax/fonts/mathjax-{extension}-font-extension/chtml.js").is_file()
                if extension != "mhchem"
                else (root / "static/vendor/mathjax/fonts/mathjax-mhchem-font-extension/chtml.js").is_file()
            )

    def test_detexify_dataset_is_generated_from_the_strict_mathjax_audit(self) -> None:
        import json

        root = Path(__file__).resolve().parents[1]
        dataset = json.loads((root / "static/vendor/detexify/detexify-dataset.json").read_text(encoding="utf-8"))
        valid_ids = json.loads((root / "scripts/mathjax_valid_symbols.json").read_text(encoding="utf-8"))
        audit = json.loads((root / "scripts/mathjax_symbol_audit.json").read_text(encoding="utf-8"))
        self.assertGreater(len(dataset), 445)
        self.assertEqual(len(dataset), len(valid_ids))
        self.assertEqual(len(dataset), len(audit["accepted"]))
        self.assertEqual({item["id"] for item in dataset}, set(valid_ids))
        self.assertTrue(all(item["mode"] == "math" and item["cmd"] for item in dataset))
        self.assertEqual(audit["totalSourceSymbols"], 1123)
        self.assertEqual(audit["directMathCandidates"], 747)

        commands = {item["cmd"] for item in dataset}
        self.assertTrue(
            {
                r"\mathcal{G}",
                r"\mathfrak{d}",
                r"\zeta",
                r"\varsigma",
                r"\mathcal{J}",
                r"\mathfrak{s}",
                r"\rightharpoonup",
                r"\uprho",
                r"\upxi",
            }.issubset(commands)
        )

    def test_handwriting_candidates_use_the_same_mathjax_renderer(self) -> None:
        source = frontend_application_source(Path(__file__).resolve().parents[1])
        self.assertIn("async function renderSymbolGlyph", source)
        self.assertIn("typesetMathJax([span])", source)
        self.assertIn("await renderSymbolGlyph(item, glyph)", source)
        self.assertIn("generation !== state.recognitionGeneration", source)
        self.assertNotIn("function normalizeTeXCommand", source)
        self.assertNotIn("MathfieldElement.toMarkup(cmd, 'math')", source)

    def test_runtime_results_are_pretty_printed(self) -> None:
        root = Path(__file__).resolve().parents[1]
        source = frontend_application_source(root)
        styles = (root / "static" / "styles.css").read_text(encoding="utf-8")
        self.assertIn("JSON.stringify(payload.diagnostics || payload.installed, null, 2)", source)
        self.assertIn("#settings-message { white-space: pre-wrap", styles)
        self.assertIn(".download-sources dl", styles)

    def test_runtime_installation_is_polled_with_recent_output(self) -> None:
        root = Path(__file__).resolve().parents[1]
        source = frontend_application_source(root)
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
        source = frontend_application_source(root)
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

    def test_uninstall_wizard_offers_runtime_only_preservation(self) -> None:
        root = Path(__file__).resolve().parents[1]
        wizard = (root / "fnos-package" / "wizard" / "uninstall").read_text(encoding="utf-8")
        resource = json.loads((root / "fnos-package" / "config" / "resource").read_text(encoding="utf-8"))
        main = (root / "fnos-package" / "cmd" / "main").read_text(encoding="utf-8")
        callback = (root / "fnos-package" / "cmd" / "uninstall_callback").read_text(encoding="utf-8")
        self.assertIn('"type": "radio"', wizard)
        self.assertIn('"field": "wizard_data_action"', wizard)
        self.assertIn('"initValue": "keep"', wizard)
        self.assertIn('"value": "keep_runtime"', wizard)
        self.assertIn('"value": "delete"', wizard)
        self.assertIn('DATA_ACTION="${wizard_data_action:-keep}"', callback)
        self.assertIn("keep_runtime)", callback)
        self.assertEqual(resource["data-share"]["shares"], [{"name": "paddle-formula-ocr/data"}])
        self.assertIn("TRIM_DATA_SHARE_PATHS", main)
        self.assertIn('FORMULA_OCR_DATA_DIR="$DATA_DIR"', main)
        self.assertIn("TRIM_DATA_SHARE_PATHS", callback)
        self.assertIn("runtimes|models", callback)
        self.assertIn("^/vol[0-9]+/@appconf/paddle-formula-ocr$", callback)
