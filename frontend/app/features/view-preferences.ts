import { closestAllowedValue, endpoint } from '../core/dom.ts';

const EDITOR_FONT_SIZES = [14, 16, 18, 22];
const PREVIEW_ZOOM_LEVELS = [50, 75, 100, 125, 150, 175, 200];

export function initializeViewPreferences() {
  let editorFontSize = 16;
  let previewZoom = 100;
  let editorFontSizeTouched = false;
  let previewZoomTouched = false;
  let saveQueue = Promise.resolve();

  function saveUserPreference(patch: Record<string, number>) {
    saveQueue = saveQueue
      .catch(() => undefined)
      .then(async () => {
        const response = await fetch(endpoint('api/preferences'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!response.ok) throw new Error('无法保存显示偏好。');
      })
      .catch((error) => {
        console.warn('Unable to save user view preferences:', error);
      });
  }

  function applyEditorFontSize(value: unknown, persist = true) {
    editorFontSize = closestAllowedValue(value, EDITOR_FONT_SIZES, 16);
    document.documentElement.style.setProperty('--editor-font-size', `${editorFontSize}px`);
    document.querySelectorAll<HTMLInputElement>('[data-editor-font-size-control]').forEach((control) => {
      control.value = String(editorFontSize);
    });
    document.querySelectorAll<HTMLOutputElement>('[data-editor-font-size-value]').forEach((output) => {
      output.value = String(editorFontSize);
      output.textContent = String(editorFontSize);
    });
    if (persist) {
      editorFontSizeTouched = true;
      saveUserPreference({ editor_font_size: editorFontSize });
    }
  }

  function stepEditorFontSize(direction: number) {
    const currentIndex = EDITOR_FONT_SIZES.indexOf(editorFontSize);
    const nextIndex = Math.max(0, Math.min(EDITOR_FONT_SIZES.length - 1, currentIndex + direction));
    applyEditorFontSize(EDITOR_FONT_SIZES[nextIndex]);
  }

  function applyPreviewZoom(value: unknown, persist = true) {
    previewZoom = closestAllowedValue(value, PREVIEW_ZOOM_LEVELS, 100);
    document.documentElement.style.setProperty('--preview-scale', String(previewZoom / 100));
    document.querySelectorAll<HTMLOutputElement>('[data-preview-zoom-value]').forEach((output) => {
      output.value = `${previewZoom}%`;
      output.textContent = `${previewZoom}%`;
    });
    document.querySelectorAll<HTMLButtonElement>('[data-preview-zoom-action="out"]').forEach((button) => {
      button.disabled = previewZoom === PREVIEW_ZOOM_LEVELS[0];
    });
    document.querySelectorAll<HTMLButtonElement>('[data-preview-zoom-action="in"]').forEach((button) => {
      button.disabled = previewZoom === PREVIEW_ZOOM_LEVELS[PREVIEW_ZOOM_LEVELS.length - 1];
    });
    if (persist) {
      previewZoomTouched = true;
      saveUserPreference({ preview_zoom: previewZoom });
    }
  }

  function stepPreviewZoom(direction: number) {
    const currentIndex = PREVIEW_ZOOM_LEVELS.indexOf(previewZoom);
    const nextIndex = Math.max(0, Math.min(PREVIEW_ZOOM_LEVELS.length - 1, currentIndex + direction));
    applyPreviewZoom(PREVIEW_ZOOM_LEVELS[nextIndex]);
  }

  document.querySelectorAll<HTMLInputElement>('[data-editor-font-size-control]').forEach((control) => {
    control.addEventListener('change', () => applyEditorFontSize(control.value));
  });
  document.querySelectorAll<HTMLElement>('[data-editor-font-size-action]').forEach((button) => {
    button.addEventListener('click', () => stepEditorFontSize(button.dataset.editorFontSizeAction === 'in' ? 1 : -1));
  });
  document.querySelectorAll<HTMLElement>('[data-preview-zoom-action]').forEach((button) => {
    button.addEventListener('click', () => stepPreviewZoom(button.dataset.previewZoomAction === 'in' ? 1 : -1));
  });

  applyEditorFontSize(editorFontSize, false);
  applyPreviewZoom(previewZoom, false);

  fetch(endpoint('api/preferences'), { cache: 'no-store' })
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || '无法读取显示偏好。');
      if (!editorFontSizeTouched) {
        applyEditorFontSize(payload.preferences?.editor_font_size, false);
      }
      if (!previewZoomTouched) {
        applyPreviewZoom(payload.preferences?.preview_zoom, false);
      }
    })
    .catch((error) => {
      console.warn('Unable to load user view preferences:', error);
    });
}
