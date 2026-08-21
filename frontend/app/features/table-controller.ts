import { defineCustomElements } from '@revolist/revogrid/loader';
import katex from 'katex';
import { $ } from '../core/dom.ts';
import { typesetMathJax } from '../core/mathjax-runtime.ts';
import type { MarkdownAlignment, MarkdownPipeTable, TableResult, WorkbenchPage } from '../types.ts';

export type { MarkdownAlignment, MarkdownPipeTable };

if (typeof window !== 'undefined') {
  try {
    defineCustomElements();
  } catch {}
}

export interface GridRow {
  [columnId: string]: string;
}

export interface TableGridState {
  rows: GridRow[];
  columnOrder: string[];
  alignmentById: Record<string, MarkdownAlignment>;
}

export interface TableSnapshot {
  rows: GridRow[];
  columnOrder: string[];
  alignmentById: Record<string, MarkdownAlignment>;
}

let colCounter = 0;
function generateNewColId(state: TableGridState): string {
  let id = `c${colCounter++}`;
  while (state.columnOrder.includes(id) || id in state.alignmentById) {
    id = `c${colCounter++}`;
  }
  return id;
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

export function markdownPipeTableToGridState(table: MarkdownPipeTable): TableGridState {
  const maxCols = Math.max(table.headers.length, ...table.rows.map((r) => r.length), table.alignments.length, 1);
  const columnOrder: string[] = [];
  const alignmentById: Record<string, MarkdownAlignment> = {};
  for (let i = 0; i < maxCols; i += 1) {
    const colId = `c${i}`;
    columnOrder.push(colId);
    alignmentById[colId] = table.alignments[i] ?? null;
  }

  const rawData: string[][] = [
    table.headers.length ? [...table.headers] : [''],
    ...table.rows.map((r) => [...r]),
  ];

  const rows: GridRow[] = rawData.map((row) => {
    const rowObj: GridRow = {};
    columnOrder.forEach((colId, i) => {
      rowObj[colId] = String(row[i] ?? '');
    });
    return rowObj;
  });

  return { rows, columnOrder, alignmentById };
}

export function gridStateToMarkdownPipeTable(state: TableGridState): MarkdownPipeTable {
  if (!state.rows.length || !state.columnOrder.length) {
    return { headers: [''], rows: [], alignments: [null] };
  }

  const raw2D: string[][] = state.rows.map((rowObj) => {
    return state.columnOrder.map((colId) => String(rowObj[colId] ?? ''));
  });

  const headers = raw2D[0] || [''];
  const rows = raw2D.slice(1);
  const alignments = state.columnOrder.map((colId) => state.alignmentById[colId] ?? null);

  return { headers, rows, alignments };
}

export function insertRowBefore(state: TableGridState, index: number): TableGridState {
  const newRow: GridRow = {};
  state.columnOrder.forEach((cId) => { newRow[cId] = ''; });
  const rows = state.rows.map((r) => ({ ...r }));
  const clamped = Math.max(0, Math.min(index, rows.length));
  rows.splice(clamped, 0, newRow);
  return {
    rows,
    columnOrder: [...state.columnOrder],
    alignmentById: { ...state.alignmentById },
  };
}

export function insertRowAfter(state: TableGridState, index: number): TableGridState {
  const newRow: GridRow = {};
  state.columnOrder.forEach((cId) => { newRow[cId] = ''; });
  const rows = state.rows.map((r) => ({ ...r }));
  const clamped = Math.max(0, Math.min(index + 1, rows.length));
  rows.splice(clamped, 0, newRow);
  return {
    rows,
    columnOrder: [...state.columnOrder],
    alignmentById: { ...state.alignmentById },
  };
}

export function deleteRow(state: TableGridState, index: number): TableGridState {
  if (state.rows.length <= 1) {
    const blankRow: GridRow = {};
    state.columnOrder.forEach((cId) => { blankRow[cId] = ''; });
    return {
      rows: [blankRow],
      columnOrder: [...state.columnOrder],
      alignmentById: { ...state.alignmentById },
    };
  }
  const rows = state.rows.map((r) => ({ ...r }));
  const clamped = Math.max(0, Math.min(index, rows.length - 1));
  rows.splice(clamped, 1);
  return {
    rows,
    columnOrder: [...state.columnOrder],
    alignmentById: { ...state.alignmentById },
  };
}

export function insertColumnBefore(state: TableGridState, index: number): TableGridState {
  const newColId = generateNewColId(state);
  const columnOrder = [...state.columnOrder];
  const clamped = Math.max(0, Math.min(index, columnOrder.length));
  columnOrder.splice(clamped, 0, newColId);
  const alignmentById = { ...state.alignmentById, [newColId]: null };
  const rows = state.rows.map((r) => ({ ...r, [newColId]: '' }));
  return { rows, columnOrder, alignmentById };
}

export function insertColumnAfter(state: TableGridState, index: number): TableGridState {
  const newColId = generateNewColId(state);
  const columnOrder = [...state.columnOrder];
  const clamped = Math.max(0, Math.min(index + 1, columnOrder.length));
  columnOrder.splice(clamped, 0, newColId);
  const alignmentById = { ...state.alignmentById, [newColId]: null };
  const rows = state.rows.map((r) => ({ ...r, [newColId]: '' }));
  return { rows, columnOrder, alignmentById };
}

export function deleteColumn(state: TableGridState, index: number): TableGridState {
  if (state.columnOrder.length <= 1) return state;
  const columnOrder = [...state.columnOrder];
  const clamped = Math.max(0, Math.min(index, columnOrder.length - 1));
  const [removedColId] = columnOrder.splice(clamped, 1);
  const alignmentById = { ...state.alignmentById };
  delete alignmentById[removedColId];
  const rows = state.rows.map((r) => {
    const nextRow = { ...r };
    delete nextRow[removedColId];
    return nextRow;
  });
  return { rows, columnOrder, alignmentById };
}

export function reorderRows(state: TableGridState, fromIndex: number, toIndex: number): TableGridState {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    fromIndex >= state.rows.length ||
    toIndex < 0 ||
    toIndex >= state.rows.length
  ) {
    return state;
  }
  const rows = state.rows.map((r) => ({ ...r }));
  const [moved] = rows.splice(fromIndex, 1);
  rows.splice(toIndex, 0, moved);
  return {
    rows,
    columnOrder: [...state.columnOrder],
    alignmentById: { ...state.alignmentById },
  };
}

export function reorderColumns(state: TableGridState, fromIndex: number, toIndex: number): TableGridState {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    fromIndex >= state.columnOrder.length ||
    toIndex < 0 ||
    toIndex >= state.columnOrder.length
  ) {
    return state;
  }
  const columnOrder = [...state.columnOrder];
  const [moved] = columnOrder.splice(fromIndex, 1);
  columnOrder.splice(toIndex, 0, moved);
  return {
    rows: state.rows.map((r) => ({ ...r })),
    columnOrder,
    alignmentById: { ...state.alignmentById },
  };
}

export function setAlignment(state: TableGridState, index: number, alignment: MarkdownAlignment): TableGridState {
  const colId = state.columnOrder[index];
  if (!colId) return state;
  if (state.alignmentById[colId] === alignment) return state;
  return {
    rows: state.rows.map((r) => ({ ...r })),
    columnOrder: [...state.columnOrder],
    alignmentById: { ...state.alignmentById, [colId]: alignment },
  };
}

export function setCellValue(
  state: TableGridState,
  rowIndex: number,
  colIndex: number,
  value: string,
): TableGridState {
  const colId = state.columnOrder[colIndex];
  if (!colId || rowIndex < 0 || rowIndex >= state.rows.length) {
    return state;
  }
  const currentRow = state.rows[rowIndex];
  const currentValue = String(currentRow?.[colId] ?? '');
  const nextValue = String(value ?? '');
  if (currentValue === nextValue) {
    return state;
  }
  const nextRows = state.rows.map((r, rIdx) => {
    if (rIdx === rowIndex) {
      return { ...r, [colId]: nextValue };
    }
    return { ...r };
  });
  return {
    rows: nextRows,
    columnOrder: [...state.columnOrder],
    alignmentById: { ...state.alignmentById },
  };
}

export function tableGridStateEquals(a: TableGridState, b: TableGridState): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  if (a.columnOrder.length !== b.columnOrder.length) return false;
  for (let i = 0; i < a.columnOrder.length; i += 1) {
    if (a.columnOrder[i] !== b.columnOrder[i]) return false;
  }

  for (const colId of a.columnOrder) {
    const alignA = a.alignmentById[colId] ?? null;
    const alignB = b.alignmentById[colId] ?? null;
    if (alignA !== alignB) return false;
  }

  if (a.rows.length !== b.rows.length) return false;

  for (let r = 0; r < a.rows.length; r += 1) {
    const rowA = a.rows[r];
    const rowB = b.rows[r];
    if (!rowA || !rowB) {
      if (rowA !== rowB) return false;
      continue;
    }
    for (const colId of a.columnOrder) {
      const valA = String(rowA[colId] ?? '');
      const valB = String(rowB[colId] ?? '');
      if (valA !== valB) return false;
    }
  }

  return true;
}

export type RowDropPosition = 'before' | 'after';

export function computeRowDropIndex(
  fromIndex: number,
  targetIndex: number,
  position: RowDropPosition,
  rowCount: number,
): number {
  if (rowCount <= 1) return 0;
  const rawInsertionPoint = position === 'before' ? targetIndex : targetIndex + 1;
  const finalIndex = rawInsertionPoint > fromIndex ? rawInsertionPoint - 1 : rawInsertionPoint;
  return Math.max(0, Math.min(finalIndex, rowCount - 1));
}

export class TableSnapshotHistory {
  private undoStack: TableSnapshot[] = [];
  private redoStack: TableSnapshot[] = [];

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  record(state: TableGridState): void {
    this.undoStack.push({
      rows: state.rows.map((r) => ({ ...r })),
      columnOrder: [...state.columnOrder],
      alignmentById: { ...state.alignmentById },
    });
    this.redoStack = [];
  }

  undo(currentState: TableGridState): TableGridState | null {
    if (!this.undoStack.length) return null;
    const previous = this.undoStack.pop()!;
    this.redoStack.push({
      rows: currentState.rows.map((r) => ({ ...r })),
      columnOrder: [...currentState.columnOrder],
      alignmentById: { ...currentState.alignmentById },
    });
    return {
      rows: previous.rows.map((r) => ({ ...r })),
      columnOrder: [...previous.columnOrder],
      alignmentById: { ...previous.alignmentById },
    };
  }

  redo(currentState: TableGridState): TableGridState | null {
    if (!this.redoStack.length) return null;
    const next = this.redoStack.pop()!;
    this.undoStack.push({
      rows: currentState.rows.map((r) => ({ ...r })),
      columnOrder: [...currentState.columnOrder],
      alignmentById: { ...currentState.alignmentById },
    });
    return {
      rows: next.rows.map((r) => ({ ...r })),
      columnOrder: [...next.columnOrder],
      alignmentById: { ...next.alignmentById },
    };
  }

  getUndoDepth(): number {
    return this.undoStack.length;
  }

  getRedoDepth(): number {
    return this.redoStack.length;
  }
}

export function parseMathFormula(str: string): { isMath: boolean; formula: string; displayMode?: boolean } {
  if (!str || typeof str !== 'string') return { isMath: false, formula: '' };
  const trimmed = str.trim();

  if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 4) {
    return { isMath: true, formula: trimmed.slice(2, -2).trim(), displayMode: true };
  }
  if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]') && trimmed.length > 4) {
    return { isMath: true, formula: trimmed.slice(2, -2).trim(), displayMode: true };
  }
  if (trimmed.startsWith('\\(') && trimmed.endsWith('\\)') && trimmed.length > 4) {
    return { isMath: true, formula: trimmed.slice(2, -2).trim(), displayMode: false };
  }
  if (trimmed.startsWith('$') && trimmed.endsWith('$') && trimmed.length > 2) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner && !/^[\d,.\s]+$/.test(inner) && !inner.includes('$')) {
      return { isMath: true, formula: inner, displayMode: false };
    }
  }

  return { isMath: false, formula: '' };
}

export function buildCellVNodeKey(
  rowIndex: number,
  colId: string,
  rawText: string,
  isMath: boolean,
): string {
  return `${isMath ? 'math' : 'text'}:${rowIndex}:${colId}:${rawText}`;
}

export function resolveRevoGridTheme(
  fnosTheme?: string | null,
  systemPrefersDark?: boolean,
): 'compact' | 'darkCompact' {
  if (fnosTheme === 'dark') return 'darkCompact';
  if (fnosTheme === 'light') return 'compact';
  return systemPrefersDark ? 'darkCompact' : 'compact';
}

export function createCellTemplate(
  h: any,
  props: { value: any; prop: string | number; rowIndex?: number },
  alignmentById: Record<string, MarkdownAlignment>,
) {
  const rawText = String(props.value ?? '');
  const parsed = parseMathFormula(rawText);
  const colId = String(props.prop);
  const rowIndex = typeof props.rowIndex === 'number' ? props.rowIndex : 0;
  const align = alignmentById[colId] || 'left';
  const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
  const vnodeKey = buildCellVNodeKey(rowIndex, colId, rawText, parsed.isMath);

  if (parsed.isMath) {
    return h('div', {
      key: vnodeKey,
      class: 'table-cell-content math-rendered-cell',
      style: { justifyContent: justify, width: '100%', height: '100%', display: 'flex', alignItems: 'center' },
      'data-raw': rawText,
      ref: (el: HTMLElement) => {
        if (el) {
          el.replaceChildren();
          try {
            katex.render(parsed.formula, el, {
              displayMode: Boolean(parsed.displayMode),
              throwOnError: false,
            });
          } catch {
            el.appendChild(document.createTextNode(rawText));
          }
        }
      },
    });
  }

  return h('div', {
    key: vnodeKey,
    class: 'table-cell-content plain-text-cell',
    style: { justifyContent: justify, width: '100%', height: '100%', display: 'flex', alignItems: 'center' },
    'data-raw': rawText,
  }, rawText);
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
  if (typeof document === 'undefined') return;
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

export class RevoTextareaEditor {
  public editInput: HTMLTextAreaElement | null = null;
  public element: Element | null = null;
  public editCell?: { val?: any; x?: number; y?: number };
  public data: any;
  public saveCallback?: (value: any, preventFocus?: boolean) => void;
  public closeCallback?: (focusNext?: boolean) => void;

  constructor(
    data: any,
    saveCallback?: (value: any, preventFocus?: boolean) => void,
    closeCallback?: (focusNext?: boolean) => void,
  ) {
    this.data = data;
    this.saveCallback = saveCallback;
    this.closeCallback = closeCallback;
  }

  async componentDidRender() {
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        if (this.editInput) {
          this.editInput.focus();
          const len = this.editInput.value.length;
          this.editInput.setSelectionRange(len, len);
        }
      });
    }
  }

  onKeyDown(e: KeyboardEvent) {
    if (e.isComposing || e.keyCode === 229) {
      return;
    }
    if ((e.altKey || e.shiftKey) && e.key === 'Enter') {
      e.stopPropagation();
      return;
    }
    if (e.key === 'Enter' && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      this.beforeDisconnect();
      this.saveCallback?.(this.getValue(), false);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      this.beforeDisconnect();
      this.saveCallback?.(this.getValue(), true);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.closeCallback?.(false);
      return;
    }
  }

  beforeDisconnect() {
    this.editInput?.blur();
  }

  getValue() {
    return this.editInput ? this.editInput.value : (this.editCell?.val ?? '');
  }

  render(h: any) {
    const val = String(this.editCell?.val ?? '');
    return h('textarea', {
      class: 'revo-editor revo-textarea-editor',
      style: {
        width: '100%',
        height: '100%',
        minHeight: '48px',
        resize: 'none',
        boxSizing: 'border-box',
        font: 'inherit',
        padding: '4px',
      },
      value: val,
      ref: (el: HTMLTextAreaElement) => {
        this.editInput = el;
      },
      onKeyDown: (e: KeyboardEvent) => this.onKeyDown(e),
    });
  }
}

export function buildRowDefinitions(state: TableGridState): Array<{ type: 'rgRow'; index: number; size: number }> {
  const definitions: Array<{ type: 'rgRow'; index: number; size: number }> = [];

  for (let y = 0; y < state.rows.length; y += 1) {
    const rowObj = state.rows[y];
    let maxLines = 1;
    if (rowObj) {
      for (const colId of state.columnOrder) {
        const val = String(rowObj[colId] ?? '');
        const lines = val.split('\n').length;
        if (lines > maxLines) maxLines = lines;
      }
    }
    const size = Math.min(160, Math.max(36, 18 + maxLines * 18));
    definitions.push({
      type: 'rgRow',
      index: y,
      size,
    });
  }

  return definitions;
}

export function columnIndexToLabel(index: number): string {
  let num = index + 1;
  let label = '';
  while (num > 0) {
    const rem = (num - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    num = Math.floor((num - 1) / 26);
  }
  return label;
}

export class PasteTransactionGuard {
  private active = false;
  private timer: any = null;

  begin(timeoutMs = 1000): void {
    this.active = true;
    if (typeof window !== 'undefined' || typeof setTimeout !== 'undefined') {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.active = false;
        this.timer = null;
      }, timeoutMs);
    }
  }

  end(): void {
    this.active = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  isActive(): boolean {
    return this.active;
  }
}

export function shouldRecordCellEdit(detail?: {
  model?: Record<string, any>;
  prop?: string | number;
  val?: any;
}): boolean {
  if (!detail || detail.prop === undefined) return true;
  const propKey = String(detail.prop);
  const oldValue = String(detail.model?.[propKey] ?? '');
  const newValue = String(detail.val ?? '');
  return oldValue !== newValue;
}

export function isEditableContext(
  path: Array<{ tagName?: string; isContentEditable?: boolean; classList?: { contains: (cls: string) => boolean } }>,
): boolean {
  for (const el of path) {
    if (!el) continue;
    const tag = el.tagName?.toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
    if (el.isContentEditable) return true;
    if (
      el.classList?.contains?.('revo-editor') ||
      el.classList?.contains?.('revo-textarea-editor') ||
      el.classList?.contains?.('edit-input') ||
      el.classList?.contains?.('editing')
    ) {
      return true;
    }
  }
  return false;
}

export function shouldHandleTableHistory(e: {
  composedPath?: () => EventTarget[];
  target?: EventTarget | null;
  defaultPrevented?: boolean;
}): boolean {
  if (e.defaultPrevented) return false;
  const path = (e.composedPath ? e.composedPath() : [e.target].filter(Boolean)) as HTMLElement[];
  return !isEditableContext(path);
}

export function buildRevoColumns(state: TableGridState) {
  return state.columnOrder.map((colId, index) => ({
    prop: colId,
    name: columnIndexToLabel(index),
    size: 140,
    editor: RevoTextareaEditor,
    cellTemplate: (h: any, props: any) => createCellTemplate(h, props, state.alignmentById),
  }));
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
  let gridState: TableGridState = { rows: [{}], columnOrder: ['c0'], alignmentById: { c0: null } };
  let gridElement: any = null;
  let gridDirty = true;
  let selectedCell = { row: 0, col: 0 };
  const history = new TableSnapshotHistory();

  const renderRecognized = () => {
    renderTableSource(recognizedSource.value, recognizedPreview, recognizedStatus);
    continueButton.disabled = !recognizedSource.value.trim();
  };
  const renderEditor = () => renderTableSource(editorSource.value, editorPreview, editorStatus);

  function isGridVisible(): boolean {
    if (!tableContainer) return false;
    const page = tableContainer.closest<HTMLElement>('#table-editor-page');
    const panel = tableContainer.closest<HTMLElement>('[data-table-input-panel="visual"]');
    return Boolean(
      page &&
      !page.hidden &&
      panel &&
      !panel.hidden &&
      tableContainer.getClientRects().length > 0
    );
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

  function syncGridToMarkdown() {
    if (syncing) return;
    syncing = true;
    try {
      editorTable = gridStateToMarkdownPipeTable(gridState);
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
    } catch (err) {
      console.warn('Sync Grid to Markdown failed:', err);
    } finally {
      syncing = false;
    }
  }

  function getSystemPrefersDark(): boolean {
    return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-color-scheme: dark)')?.matches);
  }

  function getFnosTheme(): string | null {
    if (typeof document === 'undefined') return null;
    return document.documentElement.getAttribute('data-fnos-theme');
  }

  function syncGridTheme() {
    if (!gridElement) return;
    const theme = resolveRevoGridTheme(getFnosTheme(), getSystemPrefersDark());
    gridElement.theme = theme;
    gridElement.setAttribute('theme', theme);
  }

  function applyGridStateToView() {
    if (!gridElement) return;
    syncGridTheme();
    gridElement.columns = buildRevoColumns(gridState);
    gridElement.source = gridState.rows;
    gridElement.rowDefinitions = buildRowDefinitions(gridState);
  }

  function applyGridMutation(mutator: (state: TableGridState) => TableGridState): boolean {
    const nextState = mutator(gridState);
    if (tableGridStateEquals(gridState, nextState)) {
      return false;
    }
    history.record(gridState);
    gridState = nextState;
    applyGridStateToView();
    syncGridToMarkdown();
    return true;
  }

  function replaceGridData() {
    gridDirty = true;
    if (isGridVisible()) {
      ensureGridReady();
    }
  }

  function refreshGridView() {
    if (!gridElement || !tableContainer) return;
    try {
      gridElement.refresh?.('all');
    } catch (e) {
      console.warn('Refreshing RevoGrid view failed:', e);
    }
  }

  function ensureGridReady() {
    if (!isGridVisible()) return;

    if (!gridElement) {
      initGrid();
      gridDirty = false;
      return;
    }

    if (gridDirty) {
      try {
        syncing = true;
        history.clear();
        gridState = markdownPipeTableToGridState(editorTable);
        applyGridStateToView();
        gridDirty = false;
      } catch (e) {
        console.warn('Flushing dirty grid data failed:', e);
      } finally {
        syncing = false;
      }
      return;
    }

    refreshGridView();
  }

  function initGrid() {
    if (!tableContainer || typeof window === 'undefined') return;
    tableContainer.replaceChildren();
    history.clear();
    gridState = markdownPipeTableToGridState(editorTable);

    const dropIndicator = document.createElement('div');
    dropIndicator.className = 'table-row-drop-indicator';
    tableContainer.appendChild(dropIndicator);

    let draggedRowIndex: number | null = null;
    let draggedHandleElement: HTMLElement | null = null;
    let rowDropTarget: { rowIndex: number; position: RowDropPosition } | null = null;

    function clearDragState() {
      draggedRowIndex = null;
      rowDropTarget = null;
      if (dropIndicator) dropIndicator.style.display = 'none';
      tableContainer?.classList.remove('is-row-dragging');
      draggedHandleElement?.classList.remove('is-dragging');
      draggedHandleElement = null;
    }

    const initialTheme = resolveRevoGridTheme(getFnosTheme(), getSystemPrefersDark());
    const grid = document.createElement('revo-grid');
    grid.setAttribute('theme', initialTheme);
    (grid as any).theme = initialTheme;
    grid.setAttribute('can-drag', 'true');
    grid.setAttribute('can-move-columns', 'true');
    grid.setAttribute('range', 'true');
    grid.setAttribute('resize', 'true');
    grid.setAttribute('use-clipboard', 'true');
    grid.setAttribute('apply-on-close', 'true');

    (grid as any).columns = buildRevoColumns(gridState);
    (grid as any).source = gridState.rows;
    (grid as any).rowDefinitions = buildRowDefinitions(gridState);

    (grid as any).rowHeaders = {
      size: 58,
      cellTemplate: (h: any, { rowIndex }: any) =>
        h('div', {
          class: 'revo-row-handle',
          draggable: true,
          'data-row-index': String(rowIndex),
          onClick: () => { selectedCell.row = rowIndex; },
          onDragStart: (e: DragEvent) => {
            draggedRowIndex = rowIndex;
            selectedCell.row = rowIndex;
            tableContainer?.classList.add('is-row-dragging');
            draggedHandleElement = e.currentTarget as HTMLElement;
            draggedHandleElement?.classList.add('is-dragging');
            if (e.dataTransfer) {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', String(rowIndex));

              const ghost = document.createElement('div');
              ghost.className = 'table-row-drag-ghost';
              ghost.textContent = `⋮⋮ 第 ${rowIndex + 1} 行`;
              document.body.appendChild(ghost);
              e.dataTransfer.setDragImage(ghost, 12, 12);
              setTimeout(() => ghost.remove(), 0);
            }
          },
          onDragOver: (e: DragEvent) => {
            e.preventDefault();
            if (e.dataTransfer) {
              e.dataTransfer.dropEffect = 'move';
            }
            const handleEl = e.currentTarget as HTMLElement;
            const rect = handleEl.getBoundingClientRect();
            const position: RowDropPosition = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
            rowDropTarget = { rowIndex, position };

            if (dropIndicator && tableContainer) {
              const hostRect = tableContainer.getBoundingClientRect();
              const targetY = position === 'before' ? rect.top : rect.bottom;
              const top = targetY - hostRect.top;
              dropIndicator.style.top = `${top}px`;
              dropIndicator.style.display = 'block';
            }
          },
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            if (draggedRowIndex !== null && rowDropTarget) {
              const from = draggedRowIndex;
              const finalIndex = computeRowDropIndex(
                from,
                rowDropTarget.rowIndex,
                rowDropTarget.position,
                gridState.rows.length,
              );
              if (from !== finalIndex) {
                applyGridMutation((st) => reorderRows(st, from, finalIndex));
              }
            }
            clearDragState();
          },
          onDragEnd: () => {
            clearDragState();
          },
        }, '⋮⋮ ' + (rowIndex + 1)),
    };

    const pasteGuard = new PasteTransactionGuard();

    grid.addEventListener('afterfocus', (e: any) => {
      if (e.detail) {
        if (typeof e.detail.rowIndex === 'number') {
          selectedCell.row = e.detail.rowIndex;
        }
        if (typeof e.detail.colIndex === 'number') {
          selectedCell.col = e.detail.colIndex;
        }
      }
    });

    grid.addEventListener('beforeheaderclick', (e: any) => {
      if (typeof e.detail?.index === 'number') {
        selectedCell.col = e.detail.index;
      }
    });

    grid.addEventListener('beforeedit', (e: any) => {
      if (!pasteGuard.isActive() && shouldRecordCellEdit(e.detail)) {
        history.record(gridState);
      }
    });

    grid.addEventListener('beforerangeedit', () => {
      if (!pasteGuard.isActive()) {
        history.record(gridState);
      }
    });

    grid.addEventListener('afteredit', (e: any) => {
      if (e.detail && e.detail.prop !== undefined) {
        const colId = String(e.detail.prop);
        const rowIdx = e.detail.rowIndex ?? selectedCell.row;
        if (gridState.rows[rowIdx]) {
          gridState.rows[rowIdx][colId] = String(e.detail.val ?? '');
          grid.rowDefinitions = buildRowDefinitions(gridState);
        }
      } else if (grid.source) {
        gridState.rows = grid.source;
        grid.rowDefinitions = buildRowDefinitions(gridState);
      }
      syncGridToMarkdown();
    });

    grid.addEventListener('beforepaste', () => {
      pasteGuard.begin();
    });

    grid.addEventListener('beforepasteapply', () => {
      pasteGuard.begin();
      history.record(gridState);
    });

    grid.addEventListener('afterpasteapply', () => {
      pasteGuard.end();
      grid.rowDefinitions = buildRowDefinitions(gridState);
      syncGridToMarkdown();
    });

    grid.addEventListener('columndragend', (e: any) => {
      if (e.detail) {
        let newOrder: string[] = [];
        if (Array.isArray(e.detail.columns) && e.detail.columns.length > 0) {
          newOrder = e.detail.columns.map((c: any) => String(c.prop)).filter((p: string) => gridState.columnOrder.includes(p));
        } else if (Array.isArray(e.detail.order) && e.detail.order.length === gridState.columnOrder.length) {
          newOrder = e.detail.order.map((idx: number) => gridState.columnOrder[idx]).filter(Boolean);
        }
        if (newOrder.length === gridState.columnOrder.length && newOrder.join(',') !== gridState.columnOrder.join(',')) {
          history.record(gridState);
          gridState = {
            ...gridState,
            columnOrder: [...newOrder],
          };
          applyGridStateToView();
          syncGridToMarkdown();
        }
      }
    });

    // Custom context menu handler
    const contextMenu = $<HTMLElement>('#table-context-menu');

    function hideContextMenu() {
      if (contextMenu) contextMenu.hidden = true;
    }

    window.addEventListener('click', hideContextMenu);
    window.addEventListener('scroll', hideContextMenu, true);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideContextMenu();
    });

    function renderContextMenu(items: Array<{ label?: string; action?: () => void; separator?: boolean }>, x: number, y: number) {
      if (!contextMenu) return;
      contextMenu.replaceChildren();
      items.forEach((item) => {
        if (item.separator) {
          const sep = document.createElement('div');
          sep.className = 'table-context-menu-separator';
          contextMenu.appendChild(sep);
        } else if (item.label) {
          const btn = document.createElement('div');
          btn.className = 'table-context-menu-item';
          btn.textContent = item.label;
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            hideContextMenu();
            item.action?.();
          });
          contextMenu.appendChild(btn);
        }
      });
      contextMenu.style.left = `${x}px`;
      contextMenu.style.top = `${y}px`;
      contextMenu.hidden = false;
    }

    grid.addEventListener('contextmenu', (e: MouseEvent) => {
      const path = (e.composedPath?.() || []) as HTMLElement[];
      const target = (e.target as HTMLElement) || path[0];
      if (!target) return;

      // 1. Check Row Handle
      const rowHandleEl = path.find((el) => el.hasAttribute?.('data-row-index') || el.classList?.contains?.('revo-row-handle'));
      if (rowHandleEl) {
        e.preventDefault();
        const rowIdx = Number(rowHandleEl.getAttribute('data-row-index') ?? selectedCell.row);
        selectedCell.row = rowIdx;
        renderContextMenu([
          { label: '在上方插入行', action: () => applyGridMutation((st) => insertRowBefore(st, rowIdx)) },
          { label: '在下方插入行', action: () => applyGridMutation((st) => insertRowAfter(st, rowIdx)) },
          { separator: true },
          { label: '删除行', action: () => applyGridMutation((st) => deleteRow(st, rowIdx)) },
        ], e.pageX, e.pageY);
        return;
      }

      // 2. Check Column Header
      const isHeader = path.some((el) => el.tagName === 'REVOGR-HEADER' || el.classList?.contains?.('header-cell') || el.classList?.contains?.('header-rgCol'));
      if (isHeader) {
        e.preventDefault();
        const colCell = path.find((el) => el.hasAttribute?.('data-rgcol') || el.hasAttribute?.('col-index'));
        let colIdx = selectedCell.col;
        if (colCell) {
          const prop = colCell.getAttribute('data-rgcol') ?? colCell.getAttribute('col-index');
          if (prop && gridState.columnOrder.includes(prop)) {
            colIdx = gridState.columnOrder.indexOf(prop);
          } else if (prop) {
            colIdx = Number(prop);
          }
        }
        selectedCell.col = colIdx;
        renderContextMenu([
          { label: '在左侧插入列', action: () => applyGridMutation((st) => insertColumnBefore(st, colIdx)) },
          { label: '在右侧插入列', action: () => applyGridMutation((st) => insertColumnAfter(st, colIdx)) },
          { label: '删除列', action: () => applyGridMutation((st) => deleteColumn(st, colIdx)) },
          { separator: true },
          { label: '左对齐', action: () => applyGridMutation((st) => setAlignment(st, colIdx, 'left')) },
          { label: '居中对齐', action: () => applyGridMutation((st) => setAlignment(st, colIdx, 'center')) },
          { label: '右对齐', action: () => applyGridMutation((st) => setAlignment(st, colIdx, 'right')) },
        ], e.pageX, e.pageY);
        return;
      }

      // 3. Check Cell
      const cellEl = path.find((el) => el.hasAttribute?.('data-rgrow') || el.hasAttribute?.('data-rgcol'));
      if (cellEl || target.closest('revo-grid')) {
        e.preventDefault();
        const rowIdx = cellEl?.getAttribute('data-rgrow') ? Number(cellEl.getAttribute('data-rgrow')) : selectedCell.row;
        const colProp = cellEl?.getAttribute('data-rgcol');
        const colIdx = colProp && gridState.columnOrder.includes(colProp)
          ? gridState.columnOrder.indexOf(colProp)
          : (colProp ? Number(colProp) : selectedCell.col);
        selectedCell.row = rowIdx;
        selectedCell.col = colIdx;
        renderContextMenu([
          { label: '在上方插入行', action: () => applyGridMutation((st) => insertRowBefore(st, rowIdx)) },
          { label: '在下方插入行', action: () => applyGridMutation((st) => insertRowAfter(st, rowIdx)) },
          { label: '删除当前行', action: () => applyGridMutation((st) => deleteRow(st, rowIdx)) },
          { separator: true },
          { label: '在左侧插入列', action: () => applyGridMutation((st) => insertColumnBefore(st, colIdx)) },
          { label: '在右侧插入列', action: () => applyGridMutation((st) => insertColumnAfter(st, colIdx)) },
          { label: '删除当前列', action: () => applyGridMutation((st) => deleteColumn(st, colIdx)) },
          { separator: true },
          {
            label: '复制内容',
            action: () => {
              const colId = gridState.columnOrder[colIdx];
              const rawVal = gridState.rows[rowIdx]?.[colId] ?? '';
              navigator.clipboard?.writeText?.(rawVal);
            },
          },
          {
            label: '清空内容',
            action: () => {
              applyGridMutation((st) => setCellValue(st, rowIdx, colIdx, ''));
            },
          },
        ], e.pageX, e.pageY);
        return;
      }
    });

    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
      const observer = new MutationObserver(() => syncGridTheme());
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-fnos-theme'] });
    }
    if (typeof window !== 'undefined' && window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => syncGridTheme());
    }

    tableContainer.appendChild(grid);
    gridElement = grid;
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
    replaceGridData();
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
    if (mode === 'visual') {
      window.requestAnimationFrame(() => {
        ensureGridReady();
      });
    } else if (mode === 'source') {
      editorSource.focus();
    }
  }

  function onTableEditorVisible() {
    window.requestAnimationFrame(() => {
      ensureGridReady();
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
    replaceGridData();
  });

  $('#table-add-row')?.addEventListener('click', () => {
    applyGridMutation((st) => insertRowAfter(st, selectedCell.row));
  });

  $('#table-remove-row')?.addEventListener('click', () => {
    applyGridMutation((st) => deleteRow(st, selectedCell.row));
  });

  $('#table-add-col')?.addEventListener('click', () => {
    applyGridMutation((st) => insertColumnAfter(st, selectedCell.col));
  });

  $('#table-remove-col')?.addEventListener('click', () => {
    applyGridMutation((st) => deleteColumn(st, selectedCell.col));
  });

  // Undo / Redo keyboard shortcuts
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (!isGridVisible()) return;
    if (!shouldHandleTableHistory(e)) return;
    const isCmdOrCtrl = e.metaKey || e.ctrlKey;
    if (isCmdOrCtrl && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      const restored = history.undo(gridState);
      if (restored) {
        gridState = restored;
        applyGridStateToView();
        syncGridToMarkdown();
        e.preventDefault();
      }
    } else if (isCmdOrCtrl && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
      const restored = history.redo(gridState);
      if (restored) {
        gridState = restored;
        applyGridStateToView();
        syncGridToMarkdown();
        e.preventDefault();
      }
    }
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
