import { $, closestAllowedValue } from '../core/dom.js';

const EDITOR_FONT_SIZES = [14, 16, 18, 22];
const PREVIEW_ZOOM_LEVELS = [50, 75, 100, 125, 150, 175, 200];

export function initializeViewPreferences() {
  let editorFontSize = Number(localStorage.getItem('formula-ocr-editor-font-size')) || 16;
  let previewZoom = Number(localStorage.getItem('formula-ocr-preview-zoom')) || 100;

  function applyEditorFontSize(value, persist = true) {
    editorFontSize = closestAllowedValue(value, EDITOR_FONT_SIZES, 16);
    document.documentElement.style.setProperty('--editor-font-size', `${editorFontSize}px`);
    document.querySelectorAll('[data-editor-font-size-control]').forEach((control) => {
      control.value = String(editorFontSize);
    });
    document.querySelectorAll('[data-editor-font-size-value]').forEach((output) => {
      output.value = String(editorFontSize);
      output.textContent = String(editorFontSize);
    });
    if (persist) localStorage.setItem('formula-ocr-editor-font-size', String(editorFontSize));
  }

  function stepEditorFontSize(direction) {
    const currentIndex = EDITOR_FONT_SIZES.indexOf(editorFontSize);
    const nextIndex = Math.max(0, Math.min(EDITOR_FONT_SIZES.length - 1, currentIndex + direction));
    applyEditorFontSize(EDITOR_FONT_SIZES[nextIndex]);
  }

  function applyPreviewZoom(value, persist = true) {
    previewZoom = closestAllowedValue(value, PREVIEW_ZOOM_LEVELS, 100);
    document.documentElement.style.setProperty('--preview-scale', String(previewZoom / 100));
    document.querySelectorAll('[data-preview-zoom-value]').forEach((output) => {
      output.value = `${previewZoom}%`;
      output.textContent = `${previewZoom}%`;
    });
    document.querySelectorAll('[data-preview-zoom-action="out"]').forEach((button) => {
      button.disabled = previewZoom === PREVIEW_ZOOM_LEVELS[0];
    });
    document.querySelectorAll('[data-preview-zoom-action="in"]').forEach((button) => {
      button.disabled = previewZoom === PREVIEW_ZOOM_LEVELS[PREVIEW_ZOOM_LEVELS.length - 1];
    });
    if (persist) localStorage.setItem('formula-ocr-preview-zoom', String(previewZoom));
  }

  function stepPreviewZoom(direction) {
    const currentIndex = PREVIEW_ZOOM_LEVELS.indexOf(previewZoom);
    const nextIndex = Math.max(0, Math.min(PREVIEW_ZOOM_LEVELS.length - 1, currentIndex + direction));
    applyPreviewZoom(PREVIEW_ZOOM_LEVELS[nextIndex]);
  }

  document.querySelectorAll('[data-editor-font-size-control]').forEach((control) => {
    control.addEventListener('change', () => applyEditorFontSize(control.value));
  });
  document.querySelectorAll('[data-editor-font-size-action]').forEach((button) => {
    button.addEventListener('click', () => stepEditorFontSize(button.dataset.editorFontSizeAction === 'in' ? 1 : -1));
  });
  document.querySelectorAll('[data-preview-zoom-action]').forEach((button) => {
    button.addEventListener('click', () => stepPreviewZoom(button.dataset.previewZoomAction === 'in' ? 1 : -1));
  });

  applyEditorFontSize(editorFontSize, false);
  applyPreviewZoom(previewZoom, false);
}
