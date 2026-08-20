import { $ } from './core/dom.ts';
import { initializeAdminController } from './features/admin/index.ts';
import { initializeCopyController } from './features/copy-controller.ts';
import { createFormulaEditorController } from './features/formula-editor-controller.ts';
import { initializeFormulaToolboxController } from './features/formula-toolbox-controller.ts';
import { initializeHandwritingController } from './features/handwriting-controller.ts';
import { initializeImageController } from './features/image-controller.ts';
import { initializeJobController } from './features/job-controller.ts';
import { initializeTableController } from './features/table-controller.ts';
import { initializeViewPreferences } from './features/view-preferences.ts';
import type { StatusSetter } from './types.ts';

(() => {
  initializeViewPreferences();

  const editor = createFormulaEditorController();
  const createStatusSetter = (selector: string): StatusSetter => {
    const statusText = $(selector);
    return (message, error = false, phase = '') => {
      statusText.textContent = message;
      statusText.style.color = error ? '#c13333' : '';
      statusText.dataset.phase = phase;
    };
  };
  const setStatus = createStatusSetter('#job-status');
  const setTableStatus = createStatusSetter('#table-job-status');
  const table = initializeTableController({
    showWorkbenchPage: editor.showWorkbenchPage,
  });

  const { copyLatex } = initializeCopyController({
    getLatexValue: editor.getLatexValue,
    getVisualLatexValue: editor.getVisualLatexValue,
    setStatus,
    setVisualStatus: editor.setVisualStatus,
  });

  let jobController: ReturnType<typeof initializeJobController> | undefined;
  const imageController = initializeImageController({
    isJobActive: () => jobController?.isActive() || false,
    onImageChanged: () => jobController?.refreshControls(),
    setStatus,
  });
  jobController = initializeJobController({
    copyLatex,
    getImageFile: imageController.getFile,
    kind: 'formula',
    renderLatex: editor.renderLatex,
    safelyFormatRecognizedLatex: editor.safelyFormatRecognizedLatex,
    setImageJobActive: imageController.setJobActive,
    setLatexValue: editor.setLatexValue,
    setStatus,
  });

  let tableJobController: ReturnType<typeof initializeJobController> | undefined;
  const tableImageController = initializeImageController({
    idPrefix: 'table-',
    isJobActive: () => tableJobController?.isActive() || false,
    onImageChanged: () => tableJobController?.refreshControls(),
    setStatus: setTableStatus,
  });
  tableJobController = initializeJobController({
    getImageFile: tableImageController.getFile,
    idPrefix: 'table-',
    kind: 'table',
    setImageJobActive: tableImageController.setJobActive,
    setStatus: setTableStatus,
    setTableResults: table.setTableResults,
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
