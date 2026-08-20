import { $ } from '../core/dom.ts';
import type { MarkdownAlignment, MarkdownPipeTable, TableResult, WorkbenchPage } from '../types.ts';
import {
  ClipboardModule,
  EditModule,
  FormatModule,
  HistoryModule,
  InteractionModule,
  KeybindingsModule,
  ResizeColumnsModule,
  ResizeRowsModule,
  SelectRangeModule,
  SpreadsheetModule,
  Tabulator,
} from 'tabulator-tables';

export type { MarkdownAlignment, MarkdownPipeTable };

if (typeof window !== 'undefined') {
  Tabulator.registerModule([
    SpreadsheetModule,
    EditModule,
    SelectRangeModule,
    ClipboardModule,
    HistoryModule,
    KeybindingsModule,
    ResizeColumnsModule,
    ResizeRowsModule,
    FormatModule,
    InteractionModule,
  ]);
}

export function decodeHtmlEntities(value: string): string {
  const entityMap: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': '\u00a0',
  };
  return String(value || '')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/gi, (match) => entityMap[match.toLowerCase()] ?? match)
    .replace(/&#(\d+);/g, (_, code) => {
      const numeric = Number(code);
      return Number.isSafeInteger(numeric) && numeric >= 0 && numeric <= 0x10ffff
        ? String.fromCodePoint(numeric)
        : '';
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
      const numeric = Number.parseInt(code, 16);
      return Number.isSafeInteger(numeric) && numeric >= 0 && numeric <= 0x10ffff
        ? String.fromCodePoint(numeric)
        : '';
    });
}

export function decodeMarkdownCell(value: string): string {
  if (!value) return '';
  let text = String(value).replace(/<\s*br\s*\/?>/gi, '\n');
  text = decodeHtmlEntities(text);
  text = text.replace(/\\([\\|`*_\[\]!])/g, '$1');
  return text;
}

export function encodeMarkdownCell(value: string): string {
  if (!value) return '';
  const lines = String(value)
    .split('\n')
    .map((line) => {
      const normalized = line.trim().replace(/[ \t]+/g, ' ');
      let escaped = normalized
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('\\', '\\\\');
      for (const character of ['|', '`', '*', '_', '[', ']', '!']) {
        escaped = escaped.replaceAll(character, `\\${character}`);
      }
      return escaped;
    });
  return lines.join('<br>');
}

export function parseAlignment(cell: string): MarkdownAlignment | undefined {
  const trimmed = cell.trim();
  if (!/^:?-{3,}:?$/.test(trimmed)) return undefined;
  const left = trimmed.startsWith(':');
  const right = trimmed.endsWith(':');
  if (left && right) return 'center';
  if (left) return 'left';
  if (right) return 'right';
  return null;
}

export function alignmentSeparator(alignment: MarkdownAlignment): string {
  switch (alignment) {
    case 'left':
      return ':---';
    case 'center':
      return ':---:';
    case 'right':
      return '---:';
    default:
      return '---';
  }
}

function trimOuterPipes(line: string): string {
  let source = line.trim();
  if (source.startsWith('|')) {
    source = source.slice(1);
  }
  const trimmedEnd = source.trimEnd();
  if (trimmedEnd.endsWith('|')) {
    let backslashCount = 0;
    for (let index = trimmedEnd.length - 2; index >= 0 && trimmedEnd[index] === '\\'; index -= 1) {
      backslashCount += 1;
    }
    if (backslashCount % 2 === 0) {
      source = trimmedEnd.slice(0, -1);
    }
  }
  return source;
}

function splitPipeRow(line: string): string[] {
  const source = trimOuterPipes(line);
  const cells: string[] = [];
  let cell = '';
  let escaped = false;
  for (const character of source) {
    if (escaped) {
      cell += '\\' + character;
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += character;
    }
  }
  if (escaped) cell += '\\';
  cells.push(cell.trim());
  return cells;
}

export function parseMarkdownPipeTables(markdown: string): MarkdownPipeTable[] {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const tables: MarkdownPipeTable[] = [];
  for (let separatorIndex = 1; separatorIndex < lines.length; separatorIndex += 1) {
    const headerLine = lines[separatorIndex - 1];
    const separatorLine = lines[separatorIndex];
    if (!headerLine.includes('|') || !separatorLine.includes('|')) continue;
    const rawHeaders = splitPipeRow(headerLine);
    const rawSeparators = splitPipeRow(separatorLine);
    if (!rawHeaders.length || rawSeparators.length !== rawHeaders.length) continue;
    const alignments: MarkdownAlignment[] = [];
    let validSeparators = true;
    for (const sep of rawSeparators) {
      const align = parseAlignment(sep);
      if (align === undefined) {
        validSeparators = false;
        break;
      }
      alignments.push(align);
    }
    if (!validSeparators) continue;

    const headers = rawHeaders.map(decodeMarkdownCell);
    const rows: string[][] = [];
    let rowIndex = separatorIndex + 1;
    while (rowIndex < lines.length && lines[rowIndex].trim() && lines[rowIndex].includes('|')) {
      const cells = splitPipeRow(lines[rowIndex]).slice(0, headers.length).map(decodeMarkdownCell);
      while (cells.length < headers.length) cells.push('');
      rows.push(cells);
      rowIndex += 1;
    }
    tables.push({ headers, rows, alignments });
    separatorIndex = rowIndex - 1;
  }
  return tables;
}

export function serializeMarkdownPipeTable(table: MarkdownPipeTable): string {
  const columnCount = Math.max(
    table.headers.length,
    ...table.rows.map((row) => row.length),
    table.alignments?.length || 0,
    1,
  );
  const padRow = (cells: string[]) => {
    const padded = cells.slice(0, columnCount);
    while (padded.length < columnCount) padded.push('');
    return padded;
  };
  const headers = padRow(table.headers).map(encodeMarkdownCell);
  const alignments: MarkdownAlignment[] = [];
  for (let index = 0; index < columnCount; index += 1) {
    alignments.push(table.alignments?.[index] ?? null);
  }
  const separators = alignments.map(alignmentSeparator);
  const rows = table.rows.map((row) => padRow(row).map(encodeMarkdownCell));

  const renderRow = (cells: string[]) => `| ${cells.join(' | ')} |`;
  return [
    renderRow(headers),
    renderRow(separators),
    ...rows.map(renderRow),
  ].join('\n');
}

export function markdownPipeTableToSpreadsheetData(table: MarkdownPipeTable): string[][] {
  if (!table.headers.length && !table.rows.length) return [['']];
  const maxCols = Math.max(
    table.headers.length,
    ...table.rows.map((r) => r.length),
    table.alignments?.length || 0,
    1,
  );
  const pad = (arr: string[]) => {
    const res = [...arr];
    while (res.length < maxCols) res.push('');
    return res;
  };
  return [pad(table.headers), ...table.rows.map(pad)];
}

export function spreadsheetDataToMarkdownPipeTable(
  data: (string | null | undefined)[][],
  alignments: MarkdownAlignment[] = [],
): MarkdownPipeTable {
  if (!data || !data.length) return { headers: [''], rows: [], alignments: [null] };
  const rawHeaders = (data[0] || []).map((v) => String(v ?? ''));
  const rawRows = data.slice(1).map((r) => (r || []).map((v) => String(v ?? '')));
  const maxCols = Math.max(
    rawHeaders.length,
    ...rawRows.map((r) => r.length),
    alignments?.length || 0,
    1,
  );
  const pad = (arr: string[]) => {
    const res = [...arr];
    while (res.length < maxCols) res.push('');
    return res;
  };
  const headers = pad(rawHeaders);
  const rows = rawRows.map(pad);
  const nextAlignments: MarkdownAlignment[] = [];
  for (let i = 0; i < maxCols; i += 1) {
    nextAlignments.push(alignments?.[i] ?? null);
  }
  return { headers, rows, alignments: nextAlignments };
}

export function spreadsheetFieldToIndex(field: string): number {
  let index = 0;
  for (let i = 0; i < field.length; i += 1) {
    index = index * 26 + (field.charCodeAt(i) - 64);
  }
  return index - 1;
}

export function indexToSpreadsheetField(index: number): string {
  let num = index + 1;
  let result = '';
  while (num > 0) {
    const rem = (num - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    num = Math.floor((num - 1) / 26);
  }
  return result;
}

export function addRowToTable(table: MarkdownPipeTable): MarkdownPipeTable {
  const colCount = Math.max(table.headers.length, 1);
  return {
    headers: [...table.headers],
    alignments: [...table.alignments],
    rows: [...table.rows, new Array(colCount).fill('')],
  };
}

export function removeRowFromTable(table: MarkdownPipeTable): MarkdownPipeTable {
  if (table.rows.length === 0) return table;
  return {
    headers: [...table.headers],
    alignments: [...table.alignments],
    rows: table.rows.slice(0, -1),
  };
}

export function addColumnToTable(table: MarkdownPipeTable): MarkdownPipeTable {
  return {
    headers: [...table.headers, ''],
    alignments: [...table.alignments, null],
    rows: table.rows.map((r) => [...r, '']),
  };
}

export function removeColumnFromTable(table: MarkdownPipeTable): MarkdownPipeTable {
  if (table.headers.length <= 1) return table;
  return {
    headers: table.headers.slice(0, -1),
    alignments: table.alignments.slice(0, -1),
    rows: table.rows.map((r) => r.slice(0, -1)),
  };
}

interface LocalSheetDefinition {
  columns?: number;
  data?: any[];
  key?: string;
  rows?: number;
  title?: string;
}

interface LocalSheetComponent {
  clear(): void;
  getData(): any[][];
  getDefinition(): LocalSheetDefinition;
  setColumns(columns: number): void;
  setData(data: any[][]): void;
  setRows(rows: number): void;
  setTitle(title: string): void;
}

export function buildTabulatorSpreadsheetOptions({
  data,
  getAlignments,
}: {
  data: string[][];
  getAlignments: () => MarkdownAlignment[];
}) {
  const rowCount = Math.max(data.length, 1);
  const colCount = Math.max(data[0]?.length || 1, 1);

  return {
    spreadsheet: true,
    spreadsheetRows: rowCount,
    spreadsheetColumns: colCount,
    spreadsheetData: data,
    spreadsheetOutputFull: true,
    spreadsheetColumnDefinition: {
      editor: 'textarea',
      headerSort: false,
      resizable: true,
      formatter: (cell: any) => {
        const value = cell.getValue();
        const field = cell.getColumn().getField();
        const colIndex = spreadsheetFieldToIndex(field);
        const alignments = getAlignments();
        const align = alignments?.[colIndex];
        const el = cell.getElement();
        if (align) {
          el.style.textAlign = align;
        } else {
          el.style.textAlign = '';
        }
        const wrapper = document.createElement('div');
        wrapper.className = 'table-cell-content';
        wrapper.textContent = String(value ?? '');
        return wrapper;
      },
    },
    rowHeader: {
      resizable: false,
      frozen: true,
      width: 40,
      hozAlign: 'center',
      formatter: 'rownum',
      field: 'rownum',
      accessorClipboard: 'rownum',
    },
    selectableRange: 1,
    selectableRangeColumns: true,
    selectableRangeRows: true,
    selectableRangeClearCells: true,
    clipboard: true,
    clipboardCopyRowRange: 'range',
    clipboardPasteParser: 'range',
    clipboardPasteAction: 'range',
    clipboardCopyConfig: {
      rowHeaders: false,
      columnHeaders: false,
    },
    clipboardCopyStyled: false,
    history: true,
    editTriggerEvent: 'click',
    layout: 'fitDataFill',
  };
}

const TABLE_TAGS = new Set([
  'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'br',
]);
const DROP_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math']);

function copySafeAttributes(source: Element, target: HTMLElement) {
  for (const name of ['rowspan', 'colspan', 'span']) {
    const value = Number.parseInt(source.getAttribute(name) || '', 10);
    if (Number.isInteger(value) && value > 0 && value <= 1000) target.setAttribute(name, String(value));
  }
  const scope = source.getAttribute('scope');
  if (scope && ['row', 'col', 'rowgroup', 'colgroup'].includes(scope)) target.setAttribute('scope', scope);
}

function appendSafeNode(source: Node, target: Node) {
  if (source.nodeType === 3) {
    target.appendChild(document.createTextNode(source.textContent || ''));
    return;
  }
  if (!(source instanceof Element)) return;
  const tag = source.localName.toLowerCase();
  if (DROP_TAGS.has(tag)) return;
  if (!TABLE_TAGS.has(tag)) {
    for (const child of source.childNodes) appendSafeNode(child, target);
    return;
  }
  const clean = document.createElement(tag);
  copySafeAttributes(source, clean);
  for (const child of source.childNodes) appendSafeNode(child, clean);
  target.appendChild(clean);
}

function rebuildHtmlTables(source: string): HTMLTableElement[] {
  const parsed = new DOMParser().parseFromString(source, 'text/html');
  return [...parsed.querySelectorAll('table')]
    .filter((table) => !table.parentElement?.closest('table'))
    .map((table) => {
      const fragment = document.createDocumentFragment();
      appendSafeNode(table, fragment);
      return fragment.firstElementChild as HTMLTableElement;
    })
    .filter(Boolean);
}

function renderCellContent(target: HTMLElement, text: string) {
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (index > 0) target.appendChild(document.createElement('br'));
    target.appendChild(document.createTextNode(lines[index]));
  }
}

function buildPipeTable({ headers, rows, alignments }: MarkdownPipeTable): HTMLTableElement {
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const headingRow = document.createElement('tr');
  headers.forEach((value, index) => {
    const cell = document.createElement('th');
    const alignment = alignments?.[index];
    if (alignment) cell.style.textAlign = alignment;
    renderCellContent(cell, value);
    headingRow.append(cell);
  });
  head.append(headingRow);
  const body = document.createElement('tbody');
  for (const row of rows) {
    const tableRow = document.createElement('tr');
    row.forEach((value, index) => {
      const cell = document.createElement('td');
      const alignment = alignments?.[index];
      if (alignment) cell.style.textAlign = alignment;
      renderCellContent(cell, value);
      tableRow.append(cell);
    });
    body.append(tableRow);
  }
  table.append(head, body);
  return table;
}

function renderTableSource(source: string, target: HTMLElement, status: HTMLElement) {
  target.replaceChildren();
  if (!source.trim()) {
    const empty = document.createElement('p');
    empty.className = 'table-preview-empty';
    empty.textContent = '预览会显示在这里。';
    target.append(empty);
    status.textContent = '';
    return;
  }

  const tables = [
    ...rebuildHtmlTables(source),
    ...parseMarkdownPipeTables(source).map(buildPipeTable),
  ];
  if (!tables.length) {
    const empty = document.createElement('p');
    empty.className = 'table-preview-empty';
    empty.textContent = '未检测到有效的 Markdown 或 HTML 表格。';
    target.append(empty);
    status.textContent = '无法渲染';
    return;
  }
  target.append(...tables);
  status.textContent = `${tables.length} 个表格`;
}

async function copyMarkdown(value: string, status: HTMLElement) {
  if (!value.trim()) {
    status.textContent = '没有可复制的 Markdown。';
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    status.textContent = '已复制 Markdown。';
    return;
  } catch {
    const input = document.createElement('textarea');
    input.value = value;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.append(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    status.textContent = copied ? '已复制 Markdown。' : '复制失败，请手动复制。';
  }
}

export function initializeTableController({
  showWorkbenchPage,
}: {
  showWorkbenchPage: (page: WorkbenchPage) => void;
}) {
  const recognizedSource = $<HTMLTextAreaElement>('#table-markdown-output');
  const recognizedPreview = $<HTMLElement>('#table-preview');
  const recognizedStatus = $<HTMLElement>('#table-render-status');
  const continueButton = $<HTMLButtonElement>('#continue-table-edit');
  const editorSource = $<HTMLTextAreaElement>('#table-editor-markdown');
  const editorPreview = $<HTMLElement>('#table-editor-preview');
  const editorStatus = $<HTMLElement>('#table-editor-render-status');
  const tableContainer = $<HTMLElement>('#table-spreadsheet-container');
  const tableSelect = $<HTMLSelectElement>('#table-editor-select');
  const multiSelectShell = $<HTMLElement>('#table-multi-select-shell');

  let editorTable: MarkdownPipeTable = { headers: [''], rows: [], alignments: [null] };
  let parsedTables: MarkdownPipeTable[] = [];
  let activeTableIndex = 0;
  let syncing = false;
  let tabulator: any = null;

  const renderRecognized = () => {
    renderTableSource(recognizedSource.value, recognizedPreview, recognizedStatus);
    continueButton.disabled = !recognizedSource.value.trim();
  };
  const renderEditor = () => renderTableSource(editorSource.value, editorPreview, editorStatus);

  function getSpreadsheetData(): string[][] {
    return markdownPipeTableToSpreadsheetData(editorTable);
  }

  function updateTableSelector() {
    if (!tableSelect || !multiSelectShell) return;
    if (parsedTables.length <= 1) {
      multiSelectShell.hidden = true;
      return;
    }
    multiSelectShell.hidden = false;
    tableSelect.replaceChildren();
    parsedTables.forEach((_, idx) => {
      const option = document.createElement('option');
      option.value = String(idx);
      option.textContent = `表格 ${idx + 1}`;
      if (idx === activeTableIndex) option.selected = true;
      tableSelect.appendChild(option);
    });
  }

  function updateTabulatorData() {
    if (!tabulator) return;
    const data2D = getSpreadsheetData();
    const rowCount = Math.max(data2D.length, 1);
    const colCount = Math.max(data2D[0]?.length || 1, 1);

    try {
      tabulator.setSheetData(data2D);
      const sheet = tabulator.getSheet() as LocalSheetComponent | false;
      if (sheet) {
        const def = sheet.getDefinition();
        if (def && typeof def.rows === 'number' && def.rows !== rowCount) {
          sheet.setRows(rowCount);
        }
        if (def && typeof def.columns === 'number' && def.columns !== colCount) {
          sheet.setColumns(colCount);
        }
      }
    } catch (e) {
      console.warn('Updating Tabulator sheet data failed:', e);
    }
  }

  function initTabulator() {
    if (!tableContainer || typeof window === 'undefined') return;
    const initialData = getSpreadsheetData();
    const options = buildTabulatorSpreadsheetOptions({
      data: initialData,
      getAlignments: () => editorTable.alignments,
    });

    tabulator = new Tabulator(tableContainer, options);

    const onVisualChange = () => {
      if (syncing || !tabulator) return;
      syncing = true;
      try {
        const rawData = tabulator.getSheetData() as (string | null | undefined)[][];
        if (Array.isArray(rawData) && rawData.length > 0) {
          editorTable = spreadsheetDataToMarkdownPipeTable(rawData, editorTable.alignments);
          let fullMarkdown = '';
          if (parsedTables.length > 1) {
            parsedTables[activeTableIndex] = editorTable;
            fullMarkdown = parsedTables.map(serializeMarkdownPipeTable).join('\n\n');
          } else {
            parsedTables = [editorTable];
            fullMarkdown = serializeMarkdownPipeTable(editorTable);
          }
          editorSource.value = fullMarkdown;
          setRecognizedMarkdown(fullMarkdown, true);
          renderEditor();
        }
      } catch (err) {
        console.warn('Sync visual to markdown failed:', err);
      } finally {
        syncing = false;
      }
    };

    tabulator.on('cellEdited', onVisualChange);
    tabulator.on('historyUndo', onVisualChange);
    tabulator.on('historyRedo', onVisualChange);
    tabulator.on('clipboardPasted', onVisualChange);
  }

  const setEditorMarkdown = (value: string, skipSyncRecognized = false) => {
    if (editorSource.value !== value) editorSource.value = value;
    parsedTables = parseMarkdownPipeTables(value);
    if (parsedTables.length === 0) {
      editorTable = { headers: [''], rows: [], alignments: [null] };
      parsedTables = [editorTable];
      activeTableIndex = 0;
    } else {
      if (activeTableIndex >= parsedTables.length) activeTableIndex = 0;
      editorTable = parsedTables[activeTableIndex];
    }
    updateTableSelector();
    updateTabulatorData();
    renderEditor();
    if (!skipSyncRecognized && !syncing) {
      syncing = true;
      setRecognizedMarkdown(value, true);
      syncing = false;
    }
  };

  const setRecognizedMarkdown = (value: string, skipSyncEditor = false) => {
    if (recognizedSource.value !== value) recognizedSource.value = value;
    renderRecognized();
    if (!skipSyncEditor && !syncing) {
      syncing = true;
      setEditorMarkdown(value, true);
      syncing = false;
    }
  };

  function setTableInputMode(mode: 'visual' | 'source') {
    document.querySelectorAll<HTMLElement>('[data-table-input-mode]').forEach((tab) => {
      const active = tab.dataset.tableInputMode === mode;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll<HTMLElement>('[data-table-input-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.tableInputPanel !== mode;
    });
    if (mode === 'visual' && tabulator) {
      window.requestAnimationFrame(() => {
        try {
          tabulator?.redraw(true);
        } catch {}
      });
    } else if (mode === 'source') {
      editorSource.focus();
    }
  }

  recognizedSource.addEventListener('input', () => setRecognizedMarkdown(recognizedSource.value));
  editorSource.addEventListener('input', () => setEditorMarkdown(editorSource.value));
  $('#copy-table-markdown').addEventListener('click', () => copyMarkdown(recognizedSource.value, recognizedStatus));
  $('#copy-table-editor-markdown').addEventListener('click', () => copyMarkdown(editorSource.value, editorStatus));
  $('#clear-table-editor').addEventListener('click', () => {
    setEditorMarkdown('');
    if (tableContainer) updateTabulatorData();
  });
  continueButton.addEventListener('click', () => {
    setEditorMarkdown(recognizedSource.value);
    setTableInputMode('visual');
    showWorkbenchPage('table-editor');
  });

  tableSelect?.addEventListener('change', () => {
    activeTableIndex = Number(tableSelect.value) || 0;
    editorTable = parsedTables[activeTableIndex] || { headers: [''], rows: [], alignments: [null] };
    updateTabulatorData();
  });

  $('#table-add-row')?.addEventListener('click', () => {
    editorTable = addRowToTable(editorTable);
    if (parsedTables.length > 0) parsedTables[activeTableIndex] = editorTable;
    updateTabulatorData();
    const markdown = parsedTables.map(serializeMarkdownPipeTable).join('\n\n');
    editorSource.value = markdown;
    setRecognizedMarkdown(markdown, true);
    renderEditor();
  });

  $('#table-remove-row')?.addEventListener('click', () => {
    editorTable = removeRowFromTable(editorTable);
    if (parsedTables.length > 0) parsedTables[activeTableIndex] = editorTable;
    updateTabulatorData();
    const markdown = parsedTables.map(serializeMarkdownPipeTable).join('\n\n');
    editorSource.value = markdown;
    setRecognizedMarkdown(markdown, true);
    renderEditor();
  });

  $('#table-add-col')?.addEventListener('click', () => {
    editorTable = addColumnToTable(editorTable);
    if (parsedTables.length > 0) parsedTables[activeTableIndex] = editorTable;
    updateTabulatorData();
    const markdown = parsedTables.map(serializeMarkdownPipeTable).join('\n\n');
    editorSource.value = markdown;
    setRecognizedMarkdown(markdown, true);
    renderEditor();
  });

  $('#table-remove-col')?.addEventListener('click', () => {
    editorTable = removeColumnFromTable(editorTable);
    if (parsedTables.length > 0) parsedTables[activeTableIndex] = editorTable;
    updateTabulatorData();
    const markdown = parsedTables.map(serializeMarkdownPipeTable).join('\n\n');
    editorSource.value = markdown;
    setRecognizedMarkdown(markdown, true);
    renderEditor();
  });

  document.querySelectorAll<HTMLElement>('[data-table-input-mode]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const mode = (tab.dataset.tableInputMode as 'visual' | 'source') || 'visual';
      setTableInputMode(mode);
    });
  });

  initTabulator();
  renderRecognized();
  renderEditor();
  setTableInputMode('visual');

  return {
    setTableResults(tables: TableResult[]) {
      const markdown = tables.map((table) => table.markdown.trim()).filter(Boolean).join('\n\n');
      setRecognizedMarkdown(markdown);
    },
    redrawVisualTable() {
      try {
        tabulator?.redraw(true);
      } catch {}
    },
  };
}
