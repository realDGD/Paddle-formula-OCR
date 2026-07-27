import { $ } from './core/dom.js';
import { initializeAdminController } from './features/admin/index.js';
import { initializeCopyController } from './features/copy-controller.js';
import { createFormulaEditorController } from './features/formula-editor-controller.js';
import { initializeFormulaToolboxController } from './features/formula-toolbox-controller.js';
import { initializeHandwritingController } from './features/handwriting-controller.js';
import { initializeImageController } from './features/image-controller.js';
import { initializeJobController } from './features/job-controller.js';
import { initializeViewPreferences } from './features/view-preferences.js';

(() => {
  initializeViewPreferences();

  const editor = createFormulaEditorController();
  const statusText = $('#job-status');
  function setStatus(message, error = false, phase = '') {
    statusText.textContent = message;
    statusText.style.color = error ? '#c13333' : '';
    statusText.dataset.phase = phase;
  }

  const { copyLatex } = initializeCopyController({
    getLatexValue: editor.getLatexValue,
    getVisualLatexValue: editor.getVisualLatexValue,
    setStatus,
    setVisualStatus: editor.setVisualStatus,
  });

  let jobController;
  const imageController = initializeImageController({
    isJobActive: () => jobController?.isActive() || false,
    onImageChanged: () => jobController?.refreshControls(),
    setStatus,
  });
  jobController = initializeJobController({
    copyLatex,
    getImageFile: imageController.getFile,
    renderLatex: editor.renderLatex,
    safelyFormatRecognizedLatex: editor.safelyFormatRecognizedLatex,
    setImageJobActive: imageController.setJobActive,
    setLatexValue: editor.setLatexValue,
    setStatus,
  });

  const toolbox = initializeFormulaToolboxController({
    getVisualLatexValue: editor.getVisualLatexValue,
    insertVisualLatex: editor.insertVisualLatex,
    setVisualLatexValue: editor.setVisualLatexValue,
    setVisualStatus: editor.setVisualStatus,
  });
  editor.initializeEvents({
    closeFormulaFormatMenu: toolbox.closeFormulaFormatMenu,
  });
  initializeHandwritingController({
    insertVisualLatex: editor.insertVisualLatex,
  });
  initializeAdminController({ setStatus });
})();
