import jspreadsheet from 'jspreadsheet-ce';
import { $ } from '../core/dom.ts';
import { typesetMathJax } from '../core/mathjax-runtime.ts';
import type { MarkdownAlignment, MarkdownPipeTable, TableResult, WorkbenchPage } from '../types.ts';

export type { MarkdownAlignment, MarkdownPipeTable };

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

export function trimOuterPipes(line: string): string {
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

export function splitPipeRow(line: string): string[] {
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

export function moveAlignment(
  alignments: MarkdownAlignment[],
  fromIndex: number,
  toIndex: number,
): MarkdownAlignment[] {
  if (alignments.length <= 1 || fromIndex === toIndex) return [...alignments];
  if (fromIndex < 0 || fromIndex >= alignments.length || toIndex < 0 || toIndex >= alignments.length) {
    return [...alignments];
  }
  const result = [...alignments];
  const [moved] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, moved);
  return result;
}

export function insertRowAt(table: MarkdownPipeTable, index: number): MarkdownPipeTable {
  const colCount = Math.max(table.headers.length, 1);
  const newRow = new Array(colCount).fill('');
  const rows = [...table.rows];
  const clampedIndex = Math.max(0, Math.min(index, rows.length));
  rows.splice(clampedIndex, 0, newRow);
  return {
    headers: [...table.headers],
    alignments: [...table.alignments],
    rows,
  };
}

export function removeRowAt(table: MarkdownPipeTable, index: number): MarkdownPipeTable {
  if (table.rows.length === 0) return table;
  const rows = [...table.rows];
  const clampedIndex = Math.max(0, Math.min(index, rows.length - 1));
  rows.splice(clampedIndex, 1);
  return {
    headers: [...table.headers],
    alignments: [...table.alignments],
    rows,
  };
}

export function insertColumnAt(table: MarkdownPipeTable, index: number): MarkdownPipeTable {
  const colCount = table.headers.length;
  const clampedIndex = Math.max(0, Math.min(index, colCount));
  const headers = [...table.headers];
  headers.splice(clampedIndex, 0, '');
  const alignments = [...table.alignments];
  alignments.splice(clampedIndex, 0, null);
  const rows = table.rows.map((row) => {
    const nextRow = [...row];
    nextRow.splice(clampedIndex, 0, '');
    return nextRow;
  });
  return {
    headers,
    alignments,
    rows,
  };
}

export function removeColumnAt(table: MarkdownPipeTable, index: number): MarkdownPipeTable {
  if (table.headers.length <= 1) return table;
  const clampedIndex = Math.max(0, Math.min(index, table.headers.length - 1));
  const headers = [...table.headers];
  headers.splice(clampedIndex, 1);
  const alignments = [...table.alignments];
  alignments.splice(clampedIndex, 1);
  const rows = table.rows.map((row) => {
    const nextRow = [...row];
    nextRow.splice(clampedIndex, 1);
    return nextRow;
  });
  return {
    headers,
    alignments,
    rows,
  };
}

export function reorderColumnsByOrder(table: MarkdownPipeTable, order: number[]): MarkdownPipeTable {
  if (order.length !== table.headers.length) return table;
  const headers = order.map((idx) => table.headers[idx] ?? '');
  const alignments = order.map((idx) => table.alignments[idx] ?? null);
  const rows = table.rows.map((row) => order.map((idx) => row[idx] ?? ''));
  return {
    headers,
    alignments,
    rows,
  };
}

export function normalizeTableMathText(text: string): string {
  const tokens: string[] = [];
  const placeholder = (s: string) => `\x00MATH_${tokens.push(s) - 1}\x00`;

  let s = text
    .replace(/\$\$[^\$]+?\$\$/g, placeholder)
    .replace(/\\\[[\s\S]+?\\\]/g, placeholder)
    .replace(/\\\([\s\S]+?\\\)/g, placeholder);

  s = s.replace(/(^|[^\\])\$([^\s\$](?:[^$\n]*?[^\s\$])?)\$/g, (_, prefix, math) => {
    return `${prefix}\\(${math}\\)`;
  });

  s = s.replace(/\x00MATH_(\d+)\x00/g, (_, idx) => tokens[Number(idx)]);
  return s;
}

export function renderCellContent(target: HTMLElement, text: string) {
  const normalized = normalizeTableMathText(text);
  const lines = normalized.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (index > 0) target.appendChild(document.createElement('br'));
    target.appendChild(document.createTextNode(lines[index]));
  }
}

const pendingMathContainers = new Set<HTMLElement>();
let mathTypesetTimer: number | undefined;

export function scheduleTableMathTypeset(containers: Array<HTMLElement | null | undefined>) {
  if (typeof window === 'undefined') return;
  for (const container of containers) {
    if (container) pendingMathContainers.add(container);
  }
  if (!pendingMathContainers.size) return;
  window.clearTimeout(mathTypesetTimer);
  mathTypesetTimer = window.setTimeout(() => {
    const targets = Array.from(pendingMathContainers);
    pendingMathContainers.clear();
    if (targets.length) {
      try {
        typesetMathJax(targets).catch(() => undefined);
      } catch {}
    }
  }, 50);
}

export function buildJspreadsheetOptions({
  data,
  alignments,
  onVisualChange,
  onRowMove,
  onColMove,
  onColInsert,
  onColDelete,
  onSetAlignment,
}: {
  data: string[][];
  alignments: MarkdownAlignment[];
  onVisualChange?: () => void;
  onRowMove?: (fromIndex: number, toIndex: number) => void;
  onColMove?: (fromIndex: number, toIndex: number) => void;
  onColInsert?: (colIndex: number, insertBefore: boolean) => void;
  onColDelete?: (colIndex: number) => void;
  onSetAlignment?: (colIndex: number, align: MarkdownAlignment) => void;
}) {
  const colCount = Math.max(data[0]?.length || 1, alignments.length, 1);
  const rowCount = Math.max(data.length, 1);
  const columns = [];
  for (let i = 0; i < colCount; i += 1) {
    columns.push({ align: alignments[i] || 'center' });
  }

  const contextMenu = (worksheet: any, x: any, y: any, _e: any, _items: any[], section: string) => {
    const customItems: any[] = [];
    const colIndex = x !== null && x !== undefined ? parseInt(x, 10) : 0;
    const rowIndex = y !== null && y !== undefined ? parseInt(y, 10) : 0;

    if (section === 'header') {
      customItems.push({
        title: '在左侧插入列',
        onclick: () => onColInsert ? onColInsert(colIndex, true) : worksheet.insertColumn(1, colIndex, 1),
      });
      customItems.push({
        title: '在右侧插入列',
        onclick: () => onColInsert ? onColInsert(colIndex, false) : worksheet.insertColumn(1, colIndex, 0),
      });
      customItems.push({
        title: '删除此列',
        onclick: () => onColDelete ? onColDelete(colIndex) : worksheet.deleteColumn(colIndex, 1),
      });
      customItems.push({ type: 'line' });
      customItems.push({
        title: '左对齐',
        onclick: () => onSetAlignment?.(colIndex, 'left'),
      });
      customItems.push({
        title: '居中对齐',
        onclick: () => onSetAlignment?.(colIndex, 'center'),
      });
      customItems.push({
        title: '右对齐',
        onclick: () => onSetAlignment?.(colIndex, 'right'),
      });
    } else if (section === 'row') {
      customItems.push({
        title: '在上方插入行',
        onclick: () => worksheet.insertRow(1, rowIndex, 1),
      });
      customItems.push({
        title: '在下方插入行',
        onclick: () => worksheet.insertRow(1, rowIndex, 0),
      });
      customItems.push({
        title: '删除此行',
        onclick: () => worksheet.deleteRow(rowIndex, 1),
      });
    } else {
      customItems.push({
        title: '复制',
        shortcut: 'Ctrl + C',
        onclick: () => worksheet.copy?.(true),
      });
      customItems.push({
        title: '清空内容',
        onclick: () => worksheet.setValueFromCoords?.(colIndex, rowIndex, ''),
      });
      customItems.push({ type: 'line' });
      customItems.push({
        title: '在上方插入行',
        onclick: () => worksheet.insertRow(1, rowIndex, 1),
      });
      customItems.push({
        title: '在下方插入行',
        onclick: () => worksheet.insertRow(1, rowIndex, 0),
      });
      customItems.push({
        title: '在左侧插入列',
        onclick: () => onColInsert ? onColInsert(colIndex, true) : worksheet.insertColumn(1, colIndex, 1),
      });
      customItems.push({
        title: '在右侧插入列',
        onclick: () => onColInsert ? onColInsert(colIndex, false) : worksheet.insertColumn(1, colIndex, 0),
      });
      customItems.push({ type: 'line' });
      customItems.push({
        title: '删除此行',
        onclick: () => worksheet.deleteRow(rowIndex, 1),
      });
      customItems.push({
        title: '删除此列',
        onclick: () => onColDelete ? onColDelete(colIndex) : worksheet.deleteColumn(colIndex, 1),
      });
    }
    return customItems;
  };

  return {
    worksheets: [
      {
        data,
        columns,
        minDimensions: [colCount, rowCount],
        parseFormulas: false,
        rowDrag: true,
        columnDrag: true,
        allowInsertRow: true,
        allowManualInsertRow: true,
        allowInsertColumn: true,
        allowManualInsertColumn: true,
        allowDeleteRow: true,
        allowDeleteColumn: true,
        tableOverflow: true,
        tableHeight: '420px',
        tableWidth: '100%',
        contextMenu,
        onload: () => onVisualChange?.(),
        onchange: () => onVisualChange?.(),
        oninsertrow: () => onVisualChange?.(),
        ondeleterow: () => onVisualChange?.(),
        oninsertcolumn: (_w: any, colNumber: number, _num: number, insertBefore: boolean) => {
          onColInsert?.(colNumber, insertBefore);
        },
        ondeletecolumn: (_w: any, colNumber: number) => {
          onColDelete?.(colNumber);
        },
        onmoverow: (_w: any, from: number, to: number) => {
          onRowMove ? onRowMove(from, to) : onVisualChange?.();
        },
        onmovecolumn: (_w: any, from: number, to: number) => {
          onColMove ? onColMove(from, to) : onVisualChange?.();
        },
        onundo: () => onVisualChange?.(),
        onredo: () => onVisualChange?.(),
      },
    ],
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
  scheduleTableMathTypeset([target]);
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
  let worksheetInstance: any = null;

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

  function onVisualChange() {
    if (syncing || !worksheetInstance) return;
    syncing = true;
    try {
      const rawData = worksheetInstance.getData() as (string | null | undefined)[][];
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
      scheduleTableMathTypeset([tableContainer]);
    }
  }

  function updateSpreadsheetData() {
    if (!worksheetInstance) return;
    const data2D = getSpreadsheetData();
    try {
      syncing = true;
      worksheetInstance.setData(data2D);
      scheduleTableMathTypeset([tableContainer]);
    } catch (e) {
      console.warn('Updating Jspreadsheet sheet data failed:', e);
    } finally {
      syncing = false;
    }
  }

  function initSpreadsheet() {
    if (!tableContainer || typeof window === 'undefined') return;
    tableContainer.replaceChildren();
    const initialData = getSpreadsheetData();

    const options = buildJspreadsheetOptions({
      data: initialData,
      alignments: editorTable.alignments,
      onVisualChange,
      onRowMove: (_from, _to) => {
        onVisualChange();
      },
      onColMove: (from, to) => {
        editorTable.alignments = moveAlignment(editorTable.alignments, from, to);
        onVisualChange();
      },
      onColInsert: (colNumber, insertBefore) => {
        const insertIdx = insertBefore ? colNumber : colNumber + 1;
        editorTable.alignments.splice(insertIdx, 0, null);
        onVisualChange();
      },
      onColDelete: (colNumber) => {
        editorTable.alignments.splice(colNumber, 1);
        onVisualChange();
      },
      onSetAlignment: (colIndex, align) => {
        editorTable.alignments[colIndex] = align;
        if (worksheetInstance && worksheetInstance.options?.columns) {
          worksheetInstance.options.columns[colIndex] = {
            ...(worksheetInstance.options.columns[colIndex] || {}),
            align: align || 'center',
          };
        }
        onVisualChange();
      },
    });

    const worksheets = jspreadsheet(tableContainer as HTMLDivElement, options as any);
    worksheetInstance = Array.isArray(worksheets) ? worksheets[0] : (tableContainer as any).jspreadsheet;
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
    updateSpreadsheetData();
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
    if (mode === 'visual' && worksheetInstance) {
      window.requestAnimationFrame(() => {
        try {
          updateSpreadsheetData();
          scheduleTableMathTypeset([tableContainer, editorPreview]);
        } catch {}
      });
    } else if (mode === 'source') {
      editorSource.focus();
    }
  }

  function onTableEditorVisible() {
    window.requestAnimationFrame(() => {
      try {
        updateSpreadsheetData();
        scheduleTableMathTypeset([tableContainer, editorPreview]);
      } catch {}
    });
  }

  recognizedSource.addEventListener('input', () => setRecognizedMarkdown(recognizedSource.value));
  editorSource.addEventListener('input', () => setEditorMarkdown(editorSource.value));
  $('#copy-table-markdown').addEventListener('click', () => copyMarkdown(recognizedSource.value, recognizedStatus));
  $('#copy-table-editor-markdown').addEventListener('click', () => copyMarkdown(editorSource.value, editorStatus));
  $('#clear-table-editor').addEventListener('click', () => {
    setEditorMarkdown('');
  });
  continueButton.addEventListener('click', () => {
    setEditorMarkdown(recognizedSource.value);
    setTableInputMode('visual');
    showWorkbenchPage('table-editor');
    onTableEditorVisible();
  });

  tableSelect?.addEventListener('change', () => {
    activeTableIndex = Number(tableSelect.value) || 0;
    editorTable = parsedTables[activeTableIndex] || { headers: [''], rows: [], alignments: [null] };
    updateSpreadsheetData();
  });

  $('#table-add-row')?.addEventListener('click', () => {
    if (!worksheetInstance) return;
    const selected = worksheetInstance.getSelected?.();
    const y = selected && selected[1] !== undefined ? Math.max(selected[1], selected[3]) : (worksheetInstance.getData().length - 1);
    worksheetInstance.insertRow(1, y, 0);
  });

  $('#table-remove-row')?.addEventListener('click', () => {
    if (!worksheetInstance) return;
    const selected = worksheetInstance.getSelected?.();
    const y = selected && selected[1] !== undefined ? selected[1] : (worksheetInstance.getData().length - 1);
    worksheetInstance.deleteRow(y, 1);
  });

  $('#table-add-col')?.addEventListener('click', () => {
    if (!worksheetInstance) return;
    const selected = worksheetInstance.getSelected?.();
    const x = selected && selected[0] !== undefined ? Math.max(selected[0], selected[2]) : ((worksheetInstance.getData()[0]?.length || 1) - 1);
    const insertIdx = x + 1;
    editorTable.alignments.splice(insertIdx, 0, null);
    worksheetInstance.insertColumn(1, x, 0);
  });

  $('#table-remove-col')?.addEventListener('click', () => {
    if (!worksheetInstance) return;
    const selected = worksheetInstance.getSelected?.();
    const x = selected && selected[0] !== undefined ? selected[0] : ((worksheetInstance.getData()[0]?.length || 1) - 1);
    editorTable.alignments.splice(x, 1);
    worksheetInstance.deleteColumn(x, 1);
  });

  document.querySelectorAll<HTMLElement>('[data-table-input-mode]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const mode = (tab.dataset.tableInputMode as 'visual' | 'source') || 'visual';
      setTableInputMode(mode);
    });
  });

  document.querySelectorAll<HTMLElement>('.page-tab[data-page="table-editor"]').forEach((tab) => {
    tab.addEventListener('click', () => {
      onTableEditorVisible();
    });
  });

  initSpreadsheet();
  renderRecognized();
  renderEditor();
  setTableInputMode('visual');

  return {
    setTableResults(tables: TableResult[]) {
      const markdown = tables.map((table) => table.markdown.trim()).filter(Boolean).join('\n\n');
      setRecognizedMarkdown(markdown);
    },
    redrawVisualTable() {
      onTableEditorVisible();
    },
  };
}
