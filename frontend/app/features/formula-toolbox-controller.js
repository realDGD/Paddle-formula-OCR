import { $ } from '../core/dom.js';
import { switchFormulaEnvironment } from './formula-environments.mjs';

export function initializeFormulaToolboxController({
  getVisualLatexValue,
  insertVisualLatex,
  setVisualLatexValue,
  setVisualStatus,
}) {
  const formulaToolbox = $('#formula-toolbox');
  const shortcutCategoryShell = $('#shortcut-category-shell');
  const shortcutCategoryBar = $('#shortcut-category-bar');
  const shortcutSymbolPanel = $('#shortcut-symbol-panel');
  const formulaTemplateShell = $('#formula-template-shell');
  const formulaTemplateCategoryBar = $('#formula-template-category-bar');
  const formulaTemplateMenu = $('#formula-template-menu');
  const formulaTemplateGrid = $('#formula-template-grid');
  const formulaFormatShell = $('#formula-format-shell');
  const formulaFormatToolbar = $('#formula-format-toolbar');
  const formulaFormatMenu = $('#formula-format-menu');
  let activeFormulaToolMode = 'shortcuts';
  let openShortcutCategoryId = '';
  let shortcutPanelPinned = false;
  let activeShortcutButton = null;
  let openTemplateCategoryId = '';
  let templatePanelPinned = false;
  let activeTemplateCategoryButton = null;
  let openFormatToolId = '';
  let activeFormatToolButton = null;

  function typesetFormulaTools(target) {
    if (!target) return Promise.resolve();
    if (!window.MathJax?.typesetPromise) {
      return new Promise((resolve) => {
        window.addEventListener(
          'formula-ocr-mathjax-ready',
          () => typesetFormulaTools(target).then(resolve),
          { once: true },
        );
      });
    }
    return window.MathJax.typesetPromise([target]).catch((error) => {
      console.warn('Formula tool preview failed to render:', error);
    });
  }
  function fitMenuFormulaPreviews(
    root,
    buttonSelector,
    previewSelector,
    { horizontalPadding = 16, verticalPadding = 12, minimumScale = 0.42 } = {},
  ) {
    if (!root) return;
    for (const button of root.querySelectorAll(buttonSelector)) {
      const preview = button.querySelector(previewSelector);
      const math = preview?.querySelector('mjx-container');
      if (!preview || !math) continue;
      preview.style.setProperty('--menu-preview-scale', '1');
      const naturalRect = math.getBoundingClientRect();
      const naturalWidth = Math.max(math.scrollWidth, naturalRect.width);
      const naturalHeight = Math.max(math.scrollHeight, naturalRect.height);
      const shortcutCategory = root.dataset.shortcutCategory;
      if (shortcutCategory === 'greek') {
        const desiredWidth = Math.max(32, Math.min(64, Math.ceil((naturalWidth + 12) / 8) * 8));
        button.style.width = `${desiredWidth}px`;
      } else if (shortcutCategory === 'limits') {
        const desiredWidth = Math.max(48, Math.min(112, Math.ceil((naturalWidth + 14) / 8) * 8));
        button.style.width = `${desiredWidth}px`;
      } else if (shortcutCategory === 'fractions') {
        const grid = button.parentElement;
        const desiredWidth = grid.classList.contains('is-wide')
          ? (button === grid.firstElementChild ? 136 : 187)
          : grid.classList.contains('is-fill')
            ? 66
            : button.dataset.toolInsert.includes('\\partial^2')
              ? 108
              : Math.max(48, Math.min(108, naturalWidth + 12));
        button.style.width = `${desiredWidth}px`;
      }
      const availableWidth = Math.max(1, button.clientWidth - horizontalPadding);
      const availableHeight = Math.max(1, button.clientHeight - verticalPadding);
      const scale = Math.min(
        1,
        Math.max(
          minimumScale,
          Math.min(availableWidth / Math.max(1, naturalWidth), availableHeight / Math.max(1, naturalHeight)),
        ),
      );
      preview.style.setProperty('--menu-preview-scale', scale.toFixed(3));
      preview.classList.toggle('is-scaled', scale < 0.995);
    }
  }
  function fitShortcutPanelPreviews(categoryId) {
    if (
      !shortcutSymbolPanel
      || shortcutSymbolPanel.dataset.shortcutCategory !== categoryId
      || shortcutSymbolPanel.hidden
    ) return;
    fitMenuFormulaPreviews(
      shortcutSymbolPanel,
      '.shortcut-symbol-button',
      '.shortcut-symbol-preview',
      { horizontalPadding: 8, verticalPadding: 6, minimumScale: 0.35 },
    );
    positionShortcutPanel();
  }
  function scheduleShortcutPanelPreviewFit(categoryId) {
    const refit = () => fitShortcutPanelPreviews(categoryId);
    window.requestAnimationFrame(refit);
    for (const delay of [80, 260, 700]) window.setTimeout(refit, delay);
    document.fonts?.ready?.then(refit);
  }
  const formulaTemplateMinimumSingleLineScale = 0.95;
  const formulaTemplatePackingToleranceRows = 6;
  function formulaTemplateSpansAllColumns(button) {
    return button.classList.contains('is-wide')
      || button.classList.contains('is-large')
      || button.classList.contains('is-wide-single-line');
  }
  function formulaTemplateGridColumnCount(root) {
    return window.getComputedStyle(root).gridTemplateColumns.trim().split(/\s+/).length;
  }
  function formulaTemplateMinimumHeight(button) {
    if (button.classList.contains('is-extra-tall')) return 184;
    if (button.classList.contains('is-tall') || button.classList.contains('is-large')) return 136;
    if (button.classList.contains('is-wide')) return 60;
    return 52;
  }
  function packFormulaTemplateCards(root) {
    if (!root || formulaTemplateGridColumnCount(root) < 2) return;
    const remaining = Array.from(root.querySelectorAll(':scope > .formula-template-button'));
    const packed = [];
    const occupiedRows = [0, 0];
    const cardRowSpan = (button) => (
      Number.parseInt(button.dataset.templateRowSpan, 10) || 30
    );
    const placeHalfWidthCard = (button) => {
      const columnIndex = occupiedRows[0] <= occupiedRows[1] ? 0 : 1;
      occupiedRows[columnIndex] += cardRowSpan(button);
    };
    while (remaining.length) {
      const button = remaining.shift();
      if (formulaTemplateSpansAllColumns(button)) {
        while (occupiedRows[0] !== occupiedRows[1]) {
          const openColumn = occupiedRows[0] < occupiedRows[1] ? 0 : 1;
          const availableRows = Math.abs(occupiedRows[0] - occupiedRows[1]);
          const fillerIndex = remaining.findIndex((candidate) => (
            !formulaTemplateSpansAllColumns(candidate)
            && cardRowSpan(candidate) <= availableRows + formulaTemplatePackingToleranceRows
          ));
          if (fillerIndex < 0) break;
          const filler = remaining.splice(fillerIndex, 1)[0];
          packed.push(filler);
          occupiedRows[openColumn] += cardRowSpan(filler);
        }
        packed.push(button);
        const nextOccupiedRow = Math.max(...occupiedRows) + cardRowSpan(button);
        occupiedRows[0] = nextOccupiedRow;
        occupiedRows[1] = nextOccupiedRow;
        continue;
      }
      packed.push(button);
      placeHalfWidthCard(button);
    }
    root.replaceChildren(...packed);
  }
  function prepareFormulaTemplateCardWidths(root) {
    const buttons = Array.from(root.querySelectorAll(':scope > .formula-template-button'));
    for (const button of buttons) {
      button.classList.remove('is-wide-single-line');
      const preview = button.querySelector('.formula-template-preview');
      if (preview) preview.style.setProperty('--menu-preview-scale', '1');
    }
    void root.offsetWidth;
    for (const button of buttons) {
      const preview = button.querySelector('.formula-template-preview');
      const math = preview?.querySelector('mjx-container');
      if (!preview || !math) continue;
      const naturalRect = math.getBoundingClientRect();
      const naturalWidth = Math.max(math.scrollWidth, naturalRect.width);
      const naturalHeight = Math.max(math.scrollHeight, naturalRect.height);
      button.dataset.templateNaturalHeight = naturalHeight.toFixed(2);
      const availableWidth = Math.max(1, button.clientWidth - 18);
      if (
        button.classList.contains('is-single-line')
        && !root.classList.contains('is-single-column')
        && naturalWidth * formulaTemplateMinimumSingleLineScale > availableWidth
      ) {
        button.classList.add('is-wide-single-line');
      }
    }
    void root.offsetWidth;
    const rowHeight = Number.parseFloat(window.getComputedStyle(root).gridAutoRows) || 2;
    for (const button of buttons) {
      const preview = button.querySelector('.formula-template-preview');
      const math = preview?.querySelector('mjx-container');
      if (!preview || !math) continue;
      const naturalRect = math.getBoundingClientRect();
      const naturalWidth = Math.max(math.scrollWidth, naturalRect.width);
      const naturalHeight = Math.max(math.scrollHeight, naturalRect.height);
      const availableWidth = Math.max(1, button.clientWidth - 18);
      const scale = Math.min(1, availableWidth / Math.max(1, naturalWidth));
      const desiredHeight = Math.ceil(Math.max(
        formulaTemplateMinimumHeight(button),
        naturalHeight * scale + 22,
      ));
      const marginBottom = Number.parseFloat(window.getComputedStyle(button).marginBottom) || 0;
      button.dataset.templateRowSpan = String(
        Math.ceil((desiredHeight + marginBottom) / rowHeight),
      );
    }
    packFormulaTemplateCards(root);
  }
  function fitFormulaTemplateCards(root) {
    if (!root) return;
    prepareFormulaTemplateCardWidths(root);
    const rowHeight = Number.parseFloat(window.getComputedStyle(root).gridAutoRows) || 2;
    for (const button of root.querySelectorAll('.formula-template-button')) {
      const preview = button.querySelector('.formula-template-preview');
      const math = preview?.querySelector('mjx-container');
      if (!preview || !math) continue;
      preview.style.setProperty('--menu-preview-scale', '1');
      const naturalRect = math.getBoundingClientRect();
      const naturalWidth = Math.max(math.scrollWidth, naturalRect.width);
      const naturalHeight = Math.max(math.scrollHeight, naturalRect.height);
      const availableWidth = Math.max(1, button.clientWidth - 18);
      const scale = Math.min(1, availableWidth / Math.max(1, naturalWidth));
      preview.style.setProperty('--menu-preview-scale', scale.toFixed(3));
      preview.classList.toggle('is-scaled', scale < 0.995);

      const minimumHeight = formulaTemplateMinimumHeight(button);
      const desiredHeight = Math.ceil(Math.max(minimumHeight, naturalHeight * scale + 22));
      const marginBottom = Number.parseFloat(window.getComputedStyle(button).marginBottom) || 0;
      button.style.gridRow = `span ${Math.ceil((desiredHeight + marginBottom) / rowHeight)}`;
    }
  }
  function getViewportClampedPanelLeft(shellRect, buttonRect, panelWidth) {
    const viewportInset = 12;
    const preferredViewportLeft = buttonRect.left;
    const maximumViewportLeft = Math.max(
      viewportInset,
      window.innerWidth - panelWidth - viewportInset,
    );
    const viewportLeft = Math.min(
      Math.max(viewportInset, preferredViewportLeft),
      maximumViewportLeft,
    );
    return viewportLeft - shellRect.left;
  }
  function positionShortcutPanel() {
    if (!shortcutCategoryShell || !shortcutSymbolPanel || shortcutSymbolPanel.hidden || !activeShortcutButton) return;
    const shellRect = shortcutCategoryShell.getBoundingClientRect();
    const buttonRect = activeShortcutButton.getBoundingClientRect();
    const panelWidth = shortcutSymbolPanel.offsetWidth;
    shortcutSymbolPanel.style.left = `${getViewportClampedPanelLeft(shellRect, buttonRect, panelWidth)}px`;
    shortcutSymbolPanel.style.top = `${buttonRect.bottom - shellRect.top + 3}px`;
  }
  function closeShortcutPanel({ force = false, restoreFocus = false } = {}) {
    if (shortcutPanelPinned && !force) return;
    const previousButton = activeShortcutButton;
    previousButton?.classList.remove('is-active');
    previousButton?.setAttribute('aria-expanded', 'false');
    if (shortcutSymbolPanel) shortcutSymbolPanel.hidden = true;
    openShortcutCategoryId = '';
    shortcutPanelPinned = false;
    activeShortcutButton = null;
    if (restoreFocus) previousButton?.focus();
  }
  function renderShortcutPanel(category) {
    if (!shortcutSymbolPanel) return;
    shortcutSymbolPanel.dataset.shortcutCategory = category.id;
    const body = document.createElement('div');
    body.className = 'shortcut-symbol-panel-body';
    for (const candidateGroup of category.groups) {
      const section = document.createElement('section');
      section.className = 'shortcut-symbol-group';
      section.dataset.shortcutGroup = candidateGroup.label;
      const groupHeading = document.createElement('h4');
      groupHeading.textContent = candidateGroup.label;
      const grid = document.createElement('div');
      const groupLayout = candidateGroup.layout || 'compact';
      grid.className = `shortcut-symbol-grid is-${groupLayout}`;
      if (groupLayout === 'compact') {
        grid.style.setProperty('--shortcut-compact-columns', String(Math.min(16, candidateGroup.items.length)));
      } else if (groupLayout === 'fill') {
        grid.style.setProperty('--shortcut-fill-columns', String(Math.min(4, candidateGroup.items.length)));
      } else if (groupLayout === 'formula') {
        grid.style.setProperty('--shortcut-formula-columns', String(Math.min(3, candidateGroup.items.length)));
      }
      for (const item of candidateGroup.items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'shortcut-symbol-button';
        button.dataset.toolInsert = item.latex;
        if (item.snippet) button.dataset.toolSnippet = item.snippet;
        button.title = item.label ? `${item.label}：${item.latex}` : `插入 ${item.latex}`;
        button.setAttribute('aria-label', button.title);
        const preview = document.createElement('span');
        preview.className = 'shortcut-symbol-preview';
        preview.textContent = `\\(${item.preview}\\)`;
        button.append(preview);
        grid.append(button);
      }
      section.append(groupHeading, grid);
      body.append(section);
    }
    shortcutSymbolPanel.replaceChildren(body);
    typesetFormulaTools(shortcutSymbolPanel).then(() => {
      scheduleShortcutPanelPreviewFit(category.id);
    });
  }
  function openShortcutPanel(category, button, { pinned = false, focusFirst = false } = {}) {
    if (openShortcutCategoryId !== category.id) {
      renderShortcutPanel(category);
      activeShortcutButton?.classList.remove('is-active');
      activeShortcutButton?.setAttribute('aria-expanded', 'false');
    }
    openShortcutCategoryId = category.id;
    shortcutPanelPinned = pinned;
    activeShortcutButton = button;
    button.classList.add('is-active');
    button.setAttribute('aria-expanded', 'true');
    shortcutSymbolPanel.hidden = false;
    window.requestAnimationFrame(() => {
      positionShortcutPanel();
      if (focusFirst) shortcutSymbolPanel.querySelector('.shortcut-symbol-button')?.focus();
    });
  }
  function positionTemplatePanel() {
    if (!formulaTemplateShell || !formulaTemplateMenu || formulaTemplateMenu.hidden || !activeTemplateCategoryButton) return;
    const shellRect = formulaTemplateShell.getBoundingClientRect();
    const buttonRect = activeTemplateCategoryButton.getBoundingClientRect();
    const panelWidth = formulaTemplateMenu.offsetWidth;
    formulaTemplateMenu.style.left = `${getViewportClampedPanelLeft(shellRect, buttonRect, panelWidth)}px`;
    formulaTemplateMenu.style.top = `${buttonRect.bottom - shellRect.top + 3}px`;
  }
  function closeTemplatePanel({ force = false, restoreFocus = false } = {}) {
    if (templatePanelPinned && !force) return;
    const previousButton = activeTemplateCategoryButton;
    previousButton?.classList.remove('is-active');
    previousButton?.setAttribute('aria-expanded', 'false');
    if (formulaTemplateMenu) formulaTemplateMenu.hidden = true;
    openTemplateCategoryId = '';
    templatePanelPinned = false;
    activeTemplateCategoryButton = null;
    if (restoreFocus) previousButton?.focus();
  }
  function renderTemplatePanel(category) {
    if (!formulaTemplateMenu || !formulaTemplateGrid) return;
    formulaTemplateGrid.classList.toggle('is-single-column', category.singleColumn);
    formulaTemplateGrid.replaceChildren();
    for (const candidate of category.templates) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'formula-template-button';
      if (candidate.layout && candidate.layout !== 'standard') button.classList.add(`is-${candidate.layout}`);
      if (candidate.singleLine) {
        button.classList.add('is-single-line');
      }
      button.dataset.toolInsert = candidate.latex;
      button.title = `插入${candidate.label}`;
      button.setAttribute('aria-label', button.title);
      const preview = document.createElement('span');
      preview.className = 'formula-template-preview';
      if (candidate.singleLine) preview.classList.add('is-single-line');
      preview.textContent = `\\(${candidate.preview}\\)`;
      button.append(preview);
      formulaTemplateGrid.append(button);
    }
    formulaTemplateMenu.replaceChildren(formulaTemplateGrid);
    typesetFormulaTools(formulaTemplateMenu).then(() => {
      window.requestAnimationFrame(() => {
        fitFormulaTemplateCards(formulaTemplateGrid);
        positionTemplatePanel();
      });
    });
  }
  function openTemplatePanel(category, button, { pinned = false, focusFirst = false } = {}) {
    if (openTemplateCategoryId !== category.id) {
      renderTemplatePanel(category);
      activeTemplateCategoryButton?.classList.remove('is-active');
      activeTemplateCategoryButton?.setAttribute('aria-expanded', 'false');
    }
    openTemplateCategoryId = category.id;
    templatePanelPinned = pinned;
    activeTemplateCategoryButton = button;
    button.classList.add('is-active');
    button.setAttribute('aria-expanded', 'true');
    formulaTemplateMenu.hidden = false;
    window.requestAnimationFrame(() => {
      positionTemplatePanel();
      if (focusFirst) formulaTemplateGrid.querySelector('.formula-template-button')?.focus();
    });
  }
  function setFormulaToolMode(mode, focus = true) {
    if (!['shortcuts', 'templates'].includes(mode)) return;
    activeFormulaToolMode = mode;
    document.querySelectorAll('[data-formula-tool-mode]').forEach((tab) => {
      const active = tab.dataset.formulaToolMode === mode;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    });
    document.querySelectorAll('[data-formula-tool-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.formulaToolPanel !== mode;
    });
    closeShortcutPanel({ force: true });
    closeTemplatePanel({ force: true });
    if (mode === 'templates') window.requestAnimationFrame(() => typesetFormulaTools(formulaTemplateCategoryBar));
  }
  function applyFormulaEnvironment(environmentId, label) {
    const environment = String(environmentId || 'none');
    const next = switchFormulaEnvironment(getVisualLatexValue(), environment);
    if (next === null) return;
    if (environment === 'none') {
      setVisualLatexValue(next, '已移除公式环境');
      return;
    }
    setVisualLatexValue(next, `已设置为${label || `${environment} 环境`}`);
  }
  const formulaFormatToolIcons = Object.freeze({
    colors: '◉',
    fonts: 'A',
    'font-sizes': 'T↕',
    environments: '{ }',
  });
  function positionFormulaFormatMenu() {
    if (!formulaFormatShell || !formulaFormatMenu || formulaFormatMenu.hidden || !activeFormatToolButton) return;
    const shellRect = formulaFormatShell.getBoundingClientRect();
    const buttonRect = activeFormatToolButton.getBoundingClientRect();
    const panelWidth = formulaFormatMenu.offsetWidth;
    formulaFormatMenu.style.left = `${getViewportClampedPanelLeft(shellRect, buttonRect, panelWidth)}px`;
    formulaFormatMenu.style.top = `${buttonRect.bottom - shellRect.top + 6}px`;
  }
  function closeFormulaFormatMenu({ restoreFocus = false } = {}) {
    const previousButton = activeFormatToolButton;
    previousButton?.classList.remove('is-active');
    previousButton?.setAttribute('aria-expanded', 'false');
    if (formulaFormatMenu) formulaFormatMenu.hidden = true;
    openFormatToolId = '';
    activeFormatToolButton = null;
    if (restoreFocus) previousButton?.focus();
  }
  function renderFormulaFormatMenu(tool) {
    if (!formulaFormatMenu) return;
    const body = document.createElement('div');
    body.className = `formula-format-menu-body is-${tool.id}`;
    for (const candidateGroup of tool.groups) {
      const section = document.createElement('section');
      section.className = 'formula-format-option-group';
      const groupHeading = document.createElement('h4');
      groupHeading.textContent = candidateGroup.label;
      const grid = document.createElement('div');
      grid.className = 'formula-format-option-grid';
      for (const item of candidateGroup.items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'formula-format-option';
        if (item.action === 'environment') {
          button.dataset.formatAction = 'environment';
          button.dataset.environmentId = item.id;
        } else {
          button.dataset.toolInsert = item.latex;
          if (item.snippet) button.dataset.toolSnippet = item.snippet;
        }
        button.title = `${item.label || tool.label}：${item.latex}`;
        button.setAttribute('aria-label', button.title);

        if (tool.id === 'colors') {
          const colorName = item.latex.match(/^\\color\{([^}]+)\}/)?.[1] || 'currentColor';
          const swatch = document.createElement('span');
          swatch.className = 'formula-color-swatch';
          swatch.style.setProperty('--formula-swatch-color', colorName);
          swatch.setAttribute('aria-hidden', 'true');
          const label = document.createElement('span');
          label.className = 'formula-format-option-label';
          label.textContent = item.label || colorName;
          button.append(swatch, label);
        } else {
          const text = document.createElement('span');
          text.className = 'formula-format-option-text';
          const label = document.createElement('span');
          label.className = 'formula-format-option-label';
          label.textContent = item.label || tool.label;
          const code = document.createElement('code');
          code.textContent = item.latex;
          text.append(label, code);
          const preview = document.createElement('span');
          preview.className = 'formula-format-option-preview';
          preview.setAttribute('aria-hidden', 'true');
          preview.textContent = `\\(${item.preview}\\)`;
          button.append(text, preview);
        }
        grid.append(button);
      }
      section.append(groupHeading, grid);
      body.append(section);
    }
    formulaFormatMenu.className = `formula-format-menu is-${tool.id}`;
    formulaFormatMenu.replaceChildren(body);
    typesetFormulaTools(formulaFormatMenu).then(() => {
      window.requestAnimationFrame(() => {
        fitMenuFormulaPreviews(
          formulaFormatMenu,
          '.formula-format-option',
          '.formula-format-option-preview',
          { horizontalPadding: 12, verticalPadding: 10, minimumScale: 0.5 },
        );
        positionFormulaFormatMenu();
      });
    });
  }
  function openFormulaFormatMenu(tool, button, { focusFirst = false } = {}) {
    if (!formulaFormatMenu) return;
    if (openFormatToolId !== tool.id) {
      renderFormulaFormatMenu(tool);
      activeFormatToolButton?.classList.remove('is-active');
      activeFormatToolButton?.setAttribute('aria-expanded', 'false');
    }
    openFormatToolId = tool.id;
    activeFormatToolButton = button;
    button.classList.add('is-active');
    button.setAttribute('aria-expanded', 'true');
    formulaFormatMenu.hidden = false;
    window.requestAnimationFrame(() => {
      positionFormulaFormatMenu();
      if (focusFirst) formulaFormatMenu.querySelector('.formula-format-option')?.focus();
    });
  }
  function initializeFormulaFormatToolbar() {
    const tools = window.FormulaOcrTools;
    if (!formulaFormatShell || !formulaFormatToolbar || !formulaFormatMenu || !tools?.formatTools) {
      console.warn('Formula format tool data or containers are unavailable.');
      return;
    }
    for (const tool of tools.formatTools) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'formula-format-button';
      button.dataset.formatToolId = tool.id;
      button.setAttribute('aria-haspopup', 'true');
      button.setAttribute('aria-controls', 'formula-format-menu');
      button.setAttribute('aria-expanded', 'false');
      button.title = `展开${tool.label}选项`;

      const icon = document.createElement('span');
      icon.className = 'formula-format-button-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = formulaFormatToolIcons[tool.id] || '•';
      const label = document.createElement('span');
      label.textContent = tool.label;
      const arrow = document.createElement('span');
      arrow.className = 'formula-format-button-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '⌄';
      button.append(icon, label, arrow);

      button.addEventListener('click', () => {
        if (openFormatToolId === tool.id) {
          closeFormulaFormatMenu({ restoreFocus: true });
          return;
        }
        openFormulaFormatMenu(tool, button);
      });
      button.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          openFormulaFormatMenu(tool, button, { focusFirst: true });
          return;
        }
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const buttons = [...formulaFormatToolbar.querySelectorAll('.formula-format-button')];
        const current = buttons.indexOf(button);
        let next = event.key === 'Home' ? 0 : buttons.length - 1;
        if (event.key === 'ArrowLeft') next = (current - 1 + buttons.length) % buttons.length;
        if (event.key === 'ArrowRight') next = (current + 1) % buttons.length;
        buttons[next]?.focus();
      });
      formulaFormatToolbar.append(button);
    }
    formulaFormatMenu.addEventListener('click', (event) => {
      const button = event.target.closest('[data-tool-insert], [data-format-action="environment"]');
      if (!button || !formulaFormatMenu.contains(button)) return;
      const label = button.querySelector('.formula-format-option-label')?.textContent || '排版命令';
      if (button.dataset.formatAction === 'environment') {
        applyFormulaEnvironment(button.dataset.environmentId, label);
      } else {
        insertVisualLatex(button.dataset.toolInsert, button.dataset.toolSnippet || '', { wrapSelection: true });
        setVisualStatus(`已应用${label}`);
      }
      closeFormulaFormatMenu();
    });
    formulaFormatMenu.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeFormulaFormatMenu({ restoreFocus: true });
    });
  }
  function initializeFormulaToolbox() {
    const tools = window.FormulaOcrTools;
    if (
      !formulaToolbox
      || !shortcutCategoryBar
      || !shortcutSymbolPanel
      || !formulaTemplateShell
      || !formulaTemplateCategoryBar
      || !formulaTemplateMenu
      || !formulaTemplateGrid
      || !tools?.templateCategories
    ) {
      console.warn('Formula tool data or containers are unavailable.');
      return;
    }

    for (const category of tools.categories) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'shortcut-category-button';
      button.dataset.categoryId = category.id;
      button.setAttribute('aria-haspopup', 'true');
      button.setAttribute('aria-controls', 'shortcut-symbol-panel');
      button.setAttribute('aria-expanded', 'false');
      button.title = `展开${category.label}`;

      const icon = document.createElement('span');
      icon.className = 'shortcut-category-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = `\\(${category.icon}\\)`;
      const label = document.createElement('span');
      label.className = 'shortcut-category-label';
      label.textContent = category.label;
      const arrow = document.createElement('span');
      arrow.className = 'shortcut-category-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '▼';
      button.append(icon, label, arrow);

      button.addEventListener('click', () => {
        if (openShortcutCategoryId === category.id && shortcutPanelPinned) {
          closeShortcutPanel({ force: true, restoreFocus: true });
          return;
        }
        openShortcutPanel(category, button, { pinned: true });
      });
      button.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          openShortcutPanel(category, button, { pinned: true, focusFirst: true });
          return;
        }
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const buttons = [...shortcutCategoryBar.querySelectorAll('.shortcut-category-button')];
        const current = buttons.indexOf(button);
        let next = event.key === 'Home' ? 0 : buttons.length - 1;
        if (event.key === 'ArrowLeft') next = (current - 1 + buttons.length) % buttons.length;
        if (event.key === 'ArrowRight') next = (current + 1) % buttons.length;
        buttons[next]?.focus();
      });
      shortcutCategoryBar.append(button);
    }

    for (const category of tools.templateCategories) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'shortcut-category-button formula-template-category-button';
      button.dataset.templateCategoryId = category.id;
      button.setAttribute('aria-haspopup', 'true');
      button.setAttribute('aria-controls', 'formula-template-menu');
      button.setAttribute('aria-expanded', 'false');
      button.title = `展开${category.label}公式模板`;

      const icon = document.createElement('span');
      icon.className = 'shortcut-category-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = `\\(${category.icon}\\)`;
      const label = document.createElement('span');
      label.className = 'shortcut-category-label';
      label.textContent = category.label;
      const arrow = document.createElement('span');
      arrow.className = 'shortcut-category-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '▼';
      button.append(icon, label, arrow);

      button.addEventListener('click', () => {
        if (openTemplateCategoryId === category.id && templatePanelPinned) {
          closeTemplatePanel({ force: true, restoreFocus: true });
          return;
        }
        openTemplatePanel(category, button, { pinned: true });
      });
      button.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          openTemplatePanel(category, button, { pinned: true, focusFirst: true });
          return;
        }
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const buttons = [...formulaTemplateCategoryBar.querySelectorAll('.formula-template-category-button')];
        const current = buttons.indexOf(button);
        let next = event.key === 'Home' ? 0 : buttons.length - 1;
        if (event.key === 'ArrowLeft') next = (current - 1 + buttons.length) % buttons.length;
        if (event.key === 'ArrowRight') next = (current + 1) % buttons.length;
        buttons[next]?.focus();
      });
      formulaTemplateCategoryBar.append(button);
    }

    formulaToolbox.addEventListener('click', (event) => {
      const button = event.target.closest('[data-tool-insert]');
      if (!button || !formulaToolbox.contains(button)) return;
      insertVisualLatex(button.dataset.toolInsert, button.dataset.toolSnippet || '');
      setVisualStatus(`已插入${button.title.replace(/^插入/, '') || '公式'}`);
      if (button.classList.contains('shortcut-symbol-button')) closeShortcutPanel({ force: true });
      if (button.classList.contains('formula-template-button')) closeTemplatePanel({ force: true });
    });
    shortcutSymbolPanel.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeShortcutPanel({ force: true, restoreFocus: true });
    });
    formulaTemplateMenu.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeTemplatePanel({ force: true, restoreFocus: true });
    });
    document.querySelectorAll('[data-formula-tool-mode]').forEach((tab) => {
      tab.addEventListener('click', () => setFormulaToolMode(tab.dataset.formulaToolMode, false));
      tab.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        setFormulaToolMode(activeFormulaToolMode === 'shortcuts' ? 'templates' : 'shortcuts');
      });
    });
    document.addEventListener('pointerdown', (event) => {
      if (!shortcutSymbolPanel.hidden && !shortcutCategoryShell.contains(event.target)) {
        closeShortcutPanel({ force: true });
      }
      if (!formulaTemplateMenu.hidden && !formulaTemplateShell.contains(event.target)) {
        closeTemplatePanel({ force: true });
      }
      if (!formulaFormatMenu?.hidden && !formulaFormatShell?.contains(event.target)) {
        closeFormulaFormatMenu();
      }
    });
    window.addEventListener('resize', () => {
      fitMenuFormulaPreviews(
        shortcutSymbolPanel,
        '.shortcut-symbol-button',
        '.shortcut-symbol-preview',
        { horizontalPadding: 14, verticalPadding: 10, minimumScale: 0.48 },
      );
      fitFormulaTemplateCards(formulaTemplateGrid);
      fitMenuFormulaPreviews(
        formulaFormatMenu,
        '.formula-format-option',
        '.formula-format-option-preview',
        { horizontalPadding: 12, verticalPadding: 10, minimumScale: 0.5 },
      );
      positionShortcutPanel();
      positionTemplatePanel();
      positionFormulaFormatMenu();
    });
    shortcutCategoryShell.querySelector('.shortcut-category-scroll')?.addEventListener('scroll', positionShortcutPanel);
    formulaTemplateShell.querySelector('.formula-template-category-scroll')?.addEventListener('scroll', positionTemplatePanel);
    typesetFormulaTools(shortcutCategoryBar);
    typesetFormulaTools(formulaTemplateCategoryBar);
  }
  initializeFormulaToolbox();
  initializeFormulaFormatToolbar();
  return { closeFormulaFormatMenu };
}
