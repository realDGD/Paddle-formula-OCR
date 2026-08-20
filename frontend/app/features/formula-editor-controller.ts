import { $, endpoint } from '../core/dom.ts';
import { createLatexRenderer } from './latex-renderer.ts';
import type { JsonObject, VisualStatusSetter, WorkbenchPage } from '../types.ts';

const EDITOR_SESSION_KEY = 'formula-ocr-editor-session-v1';
const WORKBENCH_PAGES: WorkbenchPage[] = ['ocr', 'editor', 'table-ocr', 'table-editor'];

export function createFormulaEditorController() {
  const latex = $<HTMLTextAreaElement>('#latex-output');
  const latexEditor = window.FormulaLatexEditor?.create(latex, $('#latex-editor')) || null;
  const visualLatex = $<HTMLTextAreaElement>('#visual-latex-output');
  const visualLatexEditor = window.FormulaLatexEditor?.create(visualLatex, $('#visual-latex-editor')) || null;
  const visualField = $('#visual-math-field');
  const visualStatus = $('#visual-editor-status');
  const visualSourcePreview = $('#visual-source-preview');
  const visualSourcePreviewCode = $('#visual-source-preview-code');
  const visualSourcePreviewToggle = $<HTMLInputElement>('#visual-source-preview-toggle');
  let syncingVisualEditor = false;
  let activeFormulaInputMode = 'source';
  let editorSessionEnabled = false;

  function readEditorSession() {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(EDITOR_SESSION_KEY) || 'null');
      if (!saved || typeof saved.latex !== 'string') return null;
      return {
        latex: saved.latex,
        inputMode: ['source', 'visual'].includes(saved.inputMode) ? saved.inputMode : 'source',
      };
    } catch (error) {
      console.warn('Unable to read formula editor session:', error);
      return null;
    }
  }
  function persistEditorSession() {
    if (!editorSessionEnabled) return;
    try {
      window.sessionStorage.setItem(EDITOR_SESSION_KEY, JSON.stringify({
        latex: getVisualLatexValue(),
        inputMode: activeFormulaInputMode,
      }));
    } catch (error) {
      console.warn('Unable to save formula editor session:', error);
    }
  }
  function activateEditorSession() {
    if (editorSessionEnabled) return;
    editorSessionEnabled = true;
    persistEditorSession();
  }

  function configureVisualMathField() {
    if (window.MathfieldElement) {
      window.MathfieldElement.fontsDirectory = endpoint('vendor/mathlive/fonts/');
      window.MathfieldElement.soundsDirectory = null;
      window.MathfieldElement.strings = {
        'zh-cn': {
          'tooltip.toggle virtual keyboard': '切换虚拟键盘',
          'tooltip.menu': '公式菜单',
        },
      };
      window.MathfieldElement.locale = 'zh-cn';
      window.MathfieldElement.scientificNotationTemplate = '#1\\times10^{#2}';
    }
    if (!visualField) return;
    visualField.macros = {
      ...(visualField.macros || {}),
      ...(window.FormulaOcrMathLiveMacros || {}),
    };
    visualField.mathVirtualKeyboardPolicy = 'manual';
    visualField.smartFence = true;
    visualField.smartMode = true;
  }
  configureVisualMathField();


  let syncingCode = false;

  const getLatexValue = (): string => latexEditor ? latexEditor.getValue() : latex.value;
  const {
    render: renderLatex,
    safelyFormatRecognizedLatex,
    schedule: scheduleLatexRender,
  } = createLatexRenderer({ getLatexValue });
  const setLatexValue = (value: unknown, skipSyncVisual = false) => {
    const next = String(value || '');
    if (latexEditor) latexEditor.setValue(next);
    else latex.value = next;
    $('#continue-visual-edit').disabled = !next.trim();
    if (!skipSyncVisual && !syncingCode) {
      syncingCode = true;
      setVisualLatexValue(next, '已同步图片识别 LaTeX', true);
      syncingCode = false;
    }
  };

  // The source editor is canonical. MathLive intentionally normalizes LaTeX
  // when serializing, which must not rewrite source during copy/environment
  // operations. Real visual edits are synchronized into this editor below.
  const getVisualLatexValue = (): string => (
    visualLatexEditor ? visualLatexEditor.getValue() : visualLatex.value
  );
  function updateVisualSourcePreview(value: unknown) {
    if (visualSourcePreviewCode) visualSourcePreviewCode.textContent = String(value || '') || '源码会显示在这里。';
  }
  function updateVisualSourcePreviewVisibility() {
    if (!visualSourcePreview || !visualSourcePreviewToggle) return;
    visualSourcePreview.hidden = !visualSourcePreviewToggle.checked;
    $('#visual-input-split')?.classList.toggle('has-source-preview', visualSourcePreviewToggle.checked);
  }
  function hideMathVirtualKeyboard() {
    try {
      window.mathVirtualKeyboard?.hide?.();
    } catch (error) {
      console.warn('Unable to close MathLive virtual keyboard:', error);
    }
  }
  function setFormulaInputMode(mode: string, focus = true) {
    if (!['source', 'visual'].includes(mode)) return;
    if (mode !== 'visual') hideMathVirtualKeyboard();
    activeFormulaInputMode = mode;
    document.querySelectorAll<HTMLElement>('[data-formula-input-mode]').forEach((tab) => {
      const active = tab.dataset.formulaInputMode === mode;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll<HTMLElement>('[data-formula-input-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.formulaInputPanel !== mode;
    });
    document.querySelectorAll<HTMLElement>('[data-formula-input-control]').forEach((control) => {
      control.hidden = control.dataset.formulaInputControl !== mode;
    });
    persistEditorSession();
    if (!focus) return;
    window.requestAnimationFrame(() => {
      if (mode === 'visual') visualField?.focus?.();
      else if (visualLatexEditor) visualLatexEditor.focus();
      else visualLatex?.focus?.();
    });
  }
  const setVisualStatus: VisualStatusSetter = (message, level = '') => {
    visualStatus.textContent = message;
    visualStatus.dataset.level = level === true ? 'error' : String(level);
    visualStatus.title = '';
  };
  function describeMathLiveError(error: JsonObject) {
    const labels: Record<string, string> = {
      'unknown-command': '不支持的命令',
      'invalid-command': '无效命令',
      'unknown-environment': '不支持的环境',
      'unbalanced-braces': '括号不配对',
      'unbalanced-environment': '环境不配对',
      'missing-argument': '缺少参数',
      'unexpected-token': '存在意外字符',
    };
    const detail = error?.arg || error?.latex || '';
    return `${labels[error?.code] || error?.code || 'LaTeX 语法问题'}${detail ? `：${detail}` : ''}`;
  }
  function updateVisualValidationStatus(value: string, successMessage: string) {
    const validator = window.MathLive?.validateLatex;
    if (typeof validator === 'function') {
      try {
        const errors = validator(value, { macros: window.FormulaOcrMathLiveMacros || {} });
        if (errors.length) {
          const descriptions = errors.map(describeMathLiveError);
          setVisualStatus(`MathLive 提示：${descriptions[0]}`, 'warning');
          visualStatus.title = descriptions.join('\n');
          return;
        }
      } catch (error) {
        console.warn('MathLive validation failed:', error);
      }
    }
    if (/\\mathds\b/.test(value)) {
      setVisualStatus('MathLive 用黑板粗体近似显示 \\mathds；最终预览使用 dsfont', 'warning');
      visualStatus.title = '编辑状态仅字体近似；LaTeX 源码和最终 MathJax 预览保持 dsfont 语义。';
      return;
    }
    setVisualStatus(successMessage);
  }
  function setVisualLatexValue(value: unknown, message = '已同步 LaTeX 源码', skipSyncOcr = false) {
    const next = String(value || '');
    if (syncingVisualEditor) return;
    syncingVisualEditor = true;
    if (visualField?.setValue && visualField.getValue('latex') !== next) {
      visualField.setValue(next, { silenceNotifications: true });
    }
    if (visualLatexEditor) visualLatexEditor.setValue(next);
    else visualLatex.value = next;
    updateVisualSourcePreview(next);
    syncingVisualEditor = false;
    updateVisualValidationStatus(next, message);

    if (!skipSyncOcr && !syncingCode) {
      syncingCode = true;
      setLatexValue(next, true);
      renderLatex();
      syncingCode = false;
    }
    persistEditorSession();
  }
  function syncVisualFromField() {
    if (syncingVisualEditor || !visualField?.getValue) return;
    syncingVisualEditor = true;
    const next = visualField.getValue('latex');
    if (visualLatexEditor) visualLatexEditor.setValue(next);
    else visualLatex.value = next;
    updateVisualSourcePreview(next);
    syncingVisualEditor = false;
    updateVisualValidationStatus(next, '可视化输入已同步');

    if (!syncingCode) {
      syncingCode = true;
      setLatexValue(next, true);
      renderLatex();
      syncingCode = false;
    }
    persistEditorSession();
  }
  function expandSnippetTemplate(template: string, selectedText: string | null = null) {
    type Range = { end: number; start: number };
    type Field = Range & { index: number };
    let firstField: Field | undefined;
    let selectedRange: Range | null = null;
    let output = '';
    let sourceOffset = 0;
    const fields: Field[] = [];
    let insertedSelection = false;
    const pattern = /\$\{(\d+)(?::([^}]*))?\}/g;
    for (const match of String(template || '').matchAll(pattern)) {
      output += template.slice(sourceOffset, match.index);
      const useSelection = !insertedSelection && selectedText !== null;
      const value = useSelection ? selectedText : (match[2] || '');
      const start = output.length;
      output += value;
      fields.push({ index: Number(match[1]), start, end: output.length });
      if (useSelection) {
        selectedRange = { start, end: output.length };
        insertedSelection = true;
      }
      sourceOffset = match.index + match[0].length;
    }
    output += String(template || '').slice(sourceOffset);
    fields.sort((left, right) => left.index - right.index || left.start - right.start);
    [firstField] = fields;
    return { text: output, firstField, selectedRange };
  }
  function mathLiveSnippet(template: string) {
    return String(template || '').replace(/\$\{\d+(?::([^}]*))?\}/g, (match, value) => (
      value || '#?'
    ));
  }
  function getSourceSelectionForWrap() {
    if (visualLatexEditor?.view) {
      const selection = visualLatexEditor.view.state.selection.main;
      if (selection.empty) return null;
      return {
        text: visualLatexEditor.view.state.sliceDoc(selection.from, selection.to),
        start: selection.from,
        end: selection.to,
      };
    }
    const start = visualLatex.selectionStart ?? visualLatex.value.length;
    const end = visualLatex.selectionEnd ?? start;
    if (start === end) return null;
    return { text: visualLatex.value.slice(start, end), start, end };
  }
  function getVisualMathSelectionForWrap() {
    if (!visualField?.getValue || visualField.selectionIsCollapsed) return null;
    const text = visualField.getValue(visualField.selection, 'latex');
    return text ? { text } : null;
  }
  function insertVisualLatex(
    value: unknown,
    snippetTemplate = '',
    { wrapSelection = false }: { wrapSelection?: boolean } = {},
  ) {
    const next = String(value || '');
    if (!next) return;
    if (activeFormulaInputMode === 'source') {
      const selected = wrapSelection && snippetTemplate ? getSourceSelectionForWrap() : null;
      if (selected) {
        const wrapped = expandSnippetTemplate(snippetTemplate, selected.text);
        if (visualLatexEditor?.insert) {
          visualLatexEditor.insert(wrapped.text);
          return;
        }
        visualLatex.setRangeText(wrapped.text, selected.start, selected.end, 'end');
        if (wrapped.selectedRange) {
          visualLatex.setSelectionRange(
            selected.start + wrapped.selectedRange.start,
            selected.start + wrapped.selectedRange.end,
          );
        }
        visualLatex.focus();
        visualLatex.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      if (visualLatexEditor?.insert) {
        visualLatexEditor.insert(next, { snippet: snippetTemplate });
        return;
      }
      const start = visualLatex.selectionStart ?? visualLatex.value.length;
      const end = visualLatex.selectionEnd ?? start;
      if (snippetTemplate) {
        const expanded = expandSnippetTemplate(snippetTemplate);
        visualLatex.setRangeText(expanded.text, start, end, 'end');
        if (expanded.firstField) {
          visualLatex.setSelectionRange(
            start + expanded.firstField.start,
            start + expanded.firstField.end,
          );
        }
        visualLatex.focus();
        visualLatex.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      const followingCharacter = visualLatex.value.slice(end, end + 1);
      const insertText = /\\[A-Za-z]+$/.test(next) && /^[A-Za-z]$/.test(followingCharacter)
        ? `${next} `
        : next;
      visualLatex.setRangeText(insertText, start, end, 'end');
      visualLatex.focus();
      visualLatex.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const selected = wrapSelection && snippetTemplate ? getVisualMathSelectionForWrap() : null;
    if (!visualField?.insert) {
      setVisualLatexValue(`${getVisualLatexValue()}${next}`, '已插入快捷工具');
      return;
    }
    visualField.focus();
    if (selected) {
      const wrapped = expandSnippetTemplate(snippetTemplate, selected.text);
      visualField.insert(wrapped.text, {
        insertionMode: 'replaceSelection',
        selectionMode: 'item',
        format: 'latex',
        focus: true,
      });
      syncVisualFromField();
      return;
    }
    visualField.insert(snippetTemplate ? mathLiveSnippet(snippetTemplate) : next, {
      insertionMode: 'replaceSelection',
      selectionMode: snippetTemplate ? 'placeholder' : 'after',
      format: 'latex',
      focus: true,
    });
    syncVisualFromField();
  }
  function showWorkbenchPage(page: string | undefined) {
    if (!page || !WORKBENCH_PAGES.includes(page as WorkbenchPage)) return;
    if (page === 'editor') activateEditorSession();
    if (page !== 'editor') hideMathVirtualKeyboard();
    for (const candidate of WORKBENCH_PAGES) {
      $(`#${candidate}-page`).hidden = candidate !== page;
    }
    document.querySelectorAll<HTMLElement>('.page-tab').forEach((tab) => {
      const active = tab.dataset.page === page;
      tab.classList.toggle('is-active', active);
      tab.classList.toggle('secondary', !active);
      tab.setAttribute('aria-current', active ? 'page' : 'false');
    });
    if (page === 'editor') window.setTimeout(() => setFormulaInputMode(activeFormulaInputMode), 0);
  }

  function restoreEditorSession() {
    const saved = readEditorSession();
    if (!saved) return;
    editorSessionEnabled = true;
    setVisualLatexValue(saved.latex, '已恢复当前标签页中的公式');
    setFormulaInputMode(saved.inputMode, false);
    showWorkbenchPage('editor');
  }

  function initializeEvents({
    closeFormulaFormatMenu,
  }: {
    closeFormulaFormatMenu: () => void;
  }) {
    latex.addEventListener('input', () => {
      if (syncingCode) return;
      $('#continue-visual-edit').disabled = !getLatexValue().trim();
      syncingCode = true;
      setVisualLatexValue(getLatexValue(), '已同步图片识别 LaTeX', true);
      syncingCode = false;
      scheduleLatexRender();
    });
    visualField?.addEventListener('input', syncVisualFromField);
    visualLatex.addEventListener('input', () => {
      if (syncingVisualEditor) return;
      setVisualLatexValue(visualLatexEditor ? visualLatexEditor.getValue() : visualLatex.value);
    });
    $('#visual-clear').addEventListener('click', () => {
      closeFormulaFormatMenu();
      setVisualLatexValue('', '已清空公式');
    });
    document.querySelectorAll<HTMLElement>('[data-formula-input-mode]').forEach((tab) => {
      tab.addEventListener('click', () => setFormulaInputMode(tab.dataset.formulaInputMode || 'source'));
      tab.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        setFormulaInputMode(activeFormulaInputMode === 'source' ? 'visual' : 'source');
      });
    });
    visualSourcePreviewToggle?.addEventListener('change', updateVisualSourcePreviewVisibility);
    updateVisualSourcePreview(getVisualLatexValue());
    updateVisualSourcePreviewVisibility();
    setFormulaInputMode(activeFormulaInputMode, false);
    $('#continue-visual-edit').addEventListener('click', () => {
      const value = getLatexValue();
      if (!value.trim()) return;
      setVisualLatexValue(value, '已从图片识别结果导入');
      setFormulaInputMode('visual', false);
      showWorkbenchPage('editor');
    });
    document.querySelectorAll<HTMLElement>('.page-tab').forEach((tab) => {
      tab.addEventListener('click', () => showWorkbenchPage(tab.dataset.page));
    });
    restoreEditorSession();
  }

  return {
    getLatexValue,
    getVisualLatexValue,
    initializeEvents,
    insertVisualLatex,
    renderLatex,
    safelyFormatRecognizedLatex,
    showWorkbenchPage,
    setLatexValue,
    setVisualLatexValue,
    setVisualStatus,
  };
}
