import { $ } from '../core/dom.ts';
import { typesetMathJax } from '../core/mathjax-runtime.ts';
import type { MarkdownAlignment, MarkdownPipeTable, TableResult, WorkbenchPage } from '../types.ts';
import {
  ClipboardModule,
  EditModule,
  FormatModule,
  HistoryModule,
  InteractionModule,
  KeybindingsModule,
  MenuModule,
  MoveColumnsModule,
  MoveRowsModule,
  ResizeColumnsModule,
  ResizeRowsModule,
  ResizeTableModule,
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
    ResizeTableModule,
    MoveRowsModule,
    MoveColumnsModule,
    MenuModule,
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

export function reorderRows(table: MarkdownPipeTable, fromIndex: number, toIndex: number): MarkdownPipeTable {
  if (table.rows.length <= 1 || fromIndex === toIndex) return table;
  if (fromIndex < 0 || fromIndex >= table.rows.length || toIndex < 0 || toIndex >= table.rows.length) return table;
  const rows = [...table.rows];
  const [movedRow] = rows.splice(fromIndex, 1);
  rows.splice(toIndex, 0, movedRow);
  return {
    headers: [...table.headers],
    alignments: [...table.alignments],
    rows,
  };
}

export function reorderColumns(table: MarkdownPipeTable, fromIndex: number, toIndex: number): MarkdownPipeTable {
  if (table.headers.length <= 1 || fromIndex === toIndex) return table;
  if (fromIndex < 0 || fromIndex >= table.headers.length || toIndex < 0 || toIndex >= table.headers.length) return table;
  const headers = [...table.headers];
  const [movedHeader] = headers.splice(fromIndex, 1);
  headers.splice(toIndex, 0, movedHeader);

  const alignments = [...table.alignments];
  const [movedAlign] = alignments.splice(fromIndex, 1);
  alignments.splice(toIndex, 0, movedAlign);

  const rows = table.rows.map((row) => {
    const nextRow = [...row];
    const [movedCell] = nextRow.splice(fromIndex, 1);
    nextRow.splice(toIndex, 0, movedCell);
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

export type TableActionHandler = (action: string, payload?: any) => void;

export function buildTabulatorSpreadsheetOptions({
  data,
  getAlignments,
  onAction,
}: {
  data: string[][];
  getAlignments: () => MarkdownAlignment[];
  onAction?: TableActionHandler;
}) {
  const rowCount = Math.max(data.length, 1);
  const colCount = Math.max(data[0]?.length || 1, 1);

  const cellContextMenu = [
    {
      label: '复制内容',
      action: async (_e: any, cell: any) => {
        try {
          await navigator.clipboard.writeText(String(cell.getValue() ?? ''));
        } catch {}
      },
    },
    {
      label: '清空内容',
      action: (_e: any, cell: any) => cell.setValue(''),
    },
    { separator: true },
    {
      label: '上方插入行',
      action: (_e: any, cell: any) => {
        const rowPos = cell.getRow().getPosition();
        onAction?.('insertRowAbove', { rowPos });
      },
    },
    {
      label: '下方插入行',
      action: (_e: any, cell: any) => {
        const rowPos = cell.getRow().getPosition();
        onAction?.('insertRowBelow', { rowPos });
      },
    },
    {
      label: '左侧插入列',
      action: (_e: any, cell: any) => {
        const colIndex = spreadsheetFieldToIndex(cell.getColumn().getField());
        onAction?.('insertColLeft', { colIndex });
      },
    },
    {
      label: '右侧插入列',
      action: (_e: any, cell: any) => {
        const colIndex = spreadsheetFieldToIndex(cell.getColumn().getField());
        onAction?.('insertColRight', { colIndex });
      },
    },
    { separator: true },
    {
      label: '删除行',
      action: (_e: any, cell: any) => {
        const rowPos = cell.getRow().getPosition();
        onAction?.('removeRow', { rowPos });
      },
    },
    {
      label: '删除列',
      action: (_e: any, cell: any) => {
        const colIndex = spreadsheetFieldToIndex(cell.getColumn().getField());
        onAction?.('removeCol', { colIndex });
      },
    },
  ];

  const headerContextMenu = [
    {
      label: '左侧插入列',
      action: (_e: any, column: any) => {
        const colIndex = spreadsheetFieldToIndex(column.getField());
        onAction?.('insertColLeft', { colIndex });
      },
    },
    {
      label: '右侧插入列',
      action: (_e: any, column: any) => {
        const colIndex = spreadsheetFieldToIndex(column.getField());
        onAction?.('insertColRight', { colIndex });
      },
    },
    {
      label: '删除列',
      action: (_e: any, column: any) => {
        const colIndex = spreadsheetFieldToIndex(column.getField());
        onAction?.('removeCol', { colIndex });
      },
    },
    { separator: true },
    {
      label: '左对齐',
      action: (_e: any, column: any) => {
        const colIndex = spreadsheetFieldToIndex(column.getField());
        onAction?.('setAlignment', { colIndex, alignment: 'left' });
      },
    },
    {
      label: '居中对齐',
      action: (_e: any, column: any) => {
        const colIndex = spreadsheetFieldToIndex(column.getField());
        onAction?.('setAlignment', { colIndex, alignment: 'center' });
      },
    },
    {
      label: '右对齐',
      action: (_e: any, column: any) => {
        const colIndex = spreadsheetFieldToIndex(column.getField());
        onAction?.('setAlignment', { colIndex, alignment: 'right' });
      },
    },
  ];

  const rowContextMenu = [
    {
      label: '上方插入行',
      action: (_e: any, row: any) => {
        const rowPos = row.getPosition();
        onAction?.('insertRowAbove', { rowPos });
      },
    },
    {
      label: '下方插入行',
      action: (_e: any, row: any) => {
        const rowPos = row.getPosition();
        onAction?.('insertRowBelow', { rowPos });
      },
    },
    {
      label: '复制行',
      action: (_e: any, row: any) => {
        const rowPos = row.getPosition();
        onAction?.('duplicateRow', { rowPos });
      },
    },
    { separator: true },
    {
      label: '删除行',
      action: (_e: any, row: any) => {
        const rowPos = row.getPosition();
        onAction?.('removeRow', { rowPos });
      },
    },
  ];

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
      contextMenu: cellContextMenu,
      headerContextMenu: headerContextMenu,
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
        renderCellContent(wrapper, String(value ?? ''));
        return wrapper;
      },
    },
    rowHeader: {
      resizable: false,
      frozen: true,
      width: 44,
      hozAlign: 'center',
      formatter: (cell: any) => {
        const row = cell.getRow();
        const pos = row.getPosition();
        const el = cell.getElement();
        if (pos === 1) {
          el.classList.add('tabulator-header-row-handle');
          el.style.pointerEvents = 'none';
          el.style.cursor = 'default';
        }
        return String(pos);
      },
      field: 'rownum',
      accessorClipboard: 'rownum',
      rowHandle: true,
      contextMenu: rowContextMenu,
    },
    movableRows: true,
    movableColumns: true,
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
    editTriggerEvent: 'dblclick',
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
  let tabulator: any = null;
  let selectedRowIndex: number | null = null;
  let selectedColIndex: number | null = null;

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
      scheduleTableMathTypeset([tableContainer]);
    } catch (e) {
      console.warn('Updating Tabulator sheet data failed:', e);
    }
  }

  function applyTableMutation(mutator: (table: MarkdownPipeTable) => MarkdownPipeTable) {
    editorTable = mutator(editorTable);
    if (parsedTables.length > 0) {
      parsedTables[activeTableIndex] = editorTable;
    } else {
      parsedTables = [editorTable];
    }
    updateTabulatorData();
    const markdown = parsedTables.map(serializeMarkdownPipeTable).join('\n\n');
    editorSource.value = markdown;
    setRecognizedMarkdown(markdown, true);
    renderEditor();
  }

  function handleTableAction(action: string, payload: any = {}) {
    switch (action) {
      case 'insertRowAbove': {
        const rowPos = payload.rowPos ?? (selectedRowIndex !== null ? selectedRowIndex + 1 : null);
        if (rowPos !== null && rowPos > 1) {
          const insertIdx = rowPos - 2;
          applyTableMutation((t) => insertRowAt(t, insertIdx));
        } else if (rowPos === 1) {
          applyTableMutation((t) => insertRowAt(t, 0));
        } else {
          applyTableMutation((t) => insertRowAt(t, t.rows.length));
        }
        break;
      }
      case 'insertRowBelow': {
        const rowPos = payload.rowPos ?? (selectedRowIndex !== null ? selectedRowIndex + 1 : null);
        if (rowPos !== null && rowPos >= 1) {
          const insertIdx = rowPos - 1;
          applyTableMutation((t) => insertRowAt(t, insertIdx));
        } else {
          applyTableMutation((t) => insertRowAt(t, t.rows.length));
        }
        break;
      }
      case 'removeRow': {
        const rowPos = payload.rowPos ?? (selectedRowIndex !== null ? selectedRowIndex + 1 : null);
        if (rowPos !== null && rowPos > 1) {
          applyTableMutation((t) => removeRowAt(t, rowPos - 2));
        } else if (rowPos === 1) {
          break;
        } else if (rowPos === null && editorTable.rows.length > 0) {
          applyTableMutation((t) => removeRowAt(t, t.rows.length - 1));
        }
        break;
      }
      case 'duplicateRow': {
        const rowPos = payload.rowPos ?? (selectedRowIndex !== null ? selectedRowIndex + 1 : null);
        if (rowPos !== null && rowPos > 1 && editorTable.rows.length >= rowPos - 1) {
          const bodyIndex = rowPos - 2;
          const sourceRow = editorTable.rows[bodyIndex];
          applyTableMutation((t) => {
            const rows = [...t.rows];
            rows.splice(bodyIndex + 1, 0, [...sourceRow]);
            return { headers: [...t.headers], alignments: [...t.alignments], rows };
          });
        }
        break;
      }
      case 'insertColLeft': {
        const colIndex = payload.colIndex ?? (selectedColIndex !== null ? selectedColIndex : 0);
        applyTableMutation((t) => insertColumnAt(t, colIndex));
        break;
      }
      case 'insertColRight': {
        const colIndex = payload.colIndex ?? (selectedColIndex !== null ? selectedColIndex : editorTable.headers.length - 1);
        applyTableMutation((t) => insertColumnAt(t, colIndex + 1));
        break;
      }
      case 'removeCol': {
        const colIndex = payload.colIndex ?? (selectedColIndex !== null ? selectedColIndex : editorTable.headers.length - 1);
        applyTableMutation((t) => removeColumnAt(t, colIndex));
        break;
      }
      case 'setAlignment': {
        const colIndex = payload.colIndex ?? 0;
        const alignment = payload.alignment as MarkdownAlignment;
        applyTableMutation((t) => {
          const alignments = [...t.alignments];
          alignments[colIndex] = alignment;
          return { headers: [...t.headers], rows: t.rows.map((r) => [...r]), alignments };
        });
        break;
      }
    }
  }

  function initTabulator() {
    if (!tableContainer || typeof window === 'undefined') return;
    const initialData = getSpreadsheetData();
    const options = buildTabulatorSpreadsheetOptions({
      data: initialData,
      getAlignments: () => editorTable.alignments,
      onAction: handleTableAction,
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
        scheduleTableMathTypeset([tableContainer]);
      }
    };

    tabulator.on('cellEdited', onVisualChange);
    tabulator.on('historyUndo', onVisualChange);
    tabulator.on('historyRedo', onVisualChange);
    tabulator.on('clipboardPasted', onVisualChange);

    tabulator.on('rowMoved', (row: any) => {
      try {
        if (row && typeof row.getPosition === 'function' && row.getPosition() === 1) {
          syncing = true;
          try {
            updateTabulatorData();
            tabulator.redraw(true);
          } finally {
            syncing = false;
          }
          return;
        }
      } catch (err) {
        console.warn('Row move validation failed:', err);
      }
      onVisualChange();
    });

    tabulator.on('columnMoved', (_column: any, columns: any[]) => {
      try {
        if (!Array.isArray(columns)) return;
        const dataCols = columns.filter((col) => {
          const field = col?.getField?.();
          return typeof field === 'string' && /^[A-Z]+$/.test(field);
        });
        if (dataCols.length !== editorTable.headers.length) return;
        const order = dataCols.map((col) => spreadsheetFieldToIndex(col.getField()));
        applyTableMutation((t) => reorderColumnsByOrder(t, order));
      } catch (err) {
        console.warn('Column move reorder failed:', err);
      }
    });

    tabulator.on('cellClick', (_e: any, cell: any) => {
      try {
        const rowPos = cell.getRow().getPosition();
        selectedRowIndex = rowPos - 1;
        selectedColIndex = spreadsheetFieldToIndex(cell.getColumn().getField());
      } catch {}
    });

    tabulator.on('rangeAdded', (range: any) => {
      try {
        const bounds = range.getBounds();
        if (bounds?.start) {
          const rowPos = bounds.start.getRow().getPosition();
          selectedRowIndex = rowPos - 1;
          selectedColIndex = spreadsheetFieldToIndex(bounds.start.getColumn().getField());
        }
      } catch {}
    });

    tabulator.on('renderComplete', () => {
      scheduleTableMathTypeset([tableContainer]);
    });
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
          updateTabulatorData();
          tabulator?.redraw(true);
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
        updateTabulatorData();
        tabulator?.redraw(true);
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
    updateTabulatorData();
  });

  $('#table-add-row')?.addEventListener('click', () => {
    handleTableAction('insertRowBelow');
  });

  $('#table-remove-row')?.addEventListener('click', () => {
    handleTableAction('removeRow');
  });

  $('#table-add-col')?.addEventListener('click', () => {
    handleTableAction('insertColRight');
  });

  $('#table-remove-col')?.addEventListener('click', () => {
    handleTableAction('removeCol');
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
      onTableEditorVisible();
    },
  };
}
