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

export function insertAlignments(
  alignments: MarkdownAlignment[],
  insertedColumns: Array<{ column: number }>,
): MarkdownAlignment[] {
  const result = [...alignments];
  const sorted = [...insertedColumns].sort((a, b) => a.column - b.column);
  for (const item of sorted) {
    result.splice(item.column, 0, null);
  }
  return result;
}

export function deleteAlignments(
  alignments: MarkdownAlignment[],
  removedColumns: number[],
): MarkdownAlignment[] {
  const result = [...alignments];
  const sorted = [...removedColumns].sort((a, b) => b - a);
  for (const idx of sorted) {
    if (idx >= 0 && idx < result.length) {
      result.splice(idx, 1);
    }
  }
  return result;
}

export type ColumnPositionRecord = {
  index: number;
  id: string;
};

export type AlignmentHistoryAction = 'moveColumn' | 'insertColumn' | 'deleteColumn';

export type AlignmentHistoryEntry =
  | {
      action: 'moveColumn';
      fromIndex: number;
      toIndex: number;
    }
  | {
      action: 'insertColumn';
      columns: ColumnPositionRecord[];
    }
  | {
      action: 'deleteColumn';
      columns: ColumnPositionRecord[];
    };

export class ColumnIdentityAlignmentManager {
  private idCounter = 0;
  private columnIds: string[] = [];
  private alignmentsById = new Map<string, MarkdownAlignment>();
  private undoStack: AlignmentHistoryEntry[] = [];
  private redoStack: AlignmentHistoryEntry[] = [];

  constructor(initialAlignments: MarkdownAlignment[] = []) {
    this.reset(initialAlignments);
  }

  private nextId(): string {
    this.idCounter += 1;
    return `col_${this.idCounter}`;
  }

  reset(alignments: MarkdownAlignment[] = []): void {
    this.idCounter = 0;
    this.columnIds = [];
    this.alignmentsById.clear();
    this.undoStack = [];
    this.redoStack = [];
    for (let i = 0; i < alignments.length; i += 1) {
      const id = this.nextId();
      this.columnIds.push(id);
      this.alignmentsById.set(id, alignments[i] ?? null);
    }
  }

  getAlignments(): MarkdownAlignment[] {
    return this.columnIds.map((id) => this.alignmentsById.get(id) ?? null);
  }

  getAlignmentAt(index: number): MarkdownAlignment {
    const id = this.columnIds[index];
    if (!id) return null;
    return this.alignmentsById.get(id) ?? null;
  }

  setAlignmentAt(index: number, alignment: MarkdownAlignment): void {
    const id = this.columnIds[index];
    if (id) {
      this.alignmentsById.set(id, alignment);
    }
  }

  onMoveColumn(fromIndex: number, toIndex: number): MarkdownAlignment[] {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      fromIndex >= this.columnIds.length ||
      toIndex < 0 ||
      toIndex >= this.columnIds.length
    ) {
      return this.getAlignments();
    }
    const [movedId] = this.columnIds.splice(fromIndex, 1);
    this.columnIds.splice(toIndex, 0, movedId);
    this.undoStack.push({ action: 'moveColumn', fromIndex, toIndex });
    this.redoStack = [];
    return this.getAlignments();
  }

  onInsertColumns(insertedColumns: Array<{ column: number }>): MarkdownAlignment[] {
    const sorted = [...insertedColumns].sort((a, b) => a.column - b.column);
    const records: ColumnPositionRecord[] = [];
    for (const item of sorted) {
      const id = this.nextId();
      this.alignmentsById.set(id, null);
      const colNum = Math.max(0, Math.min(item.column, this.columnIds.length));
      this.columnIds.splice(colNum, 0, id);
      records.push({ index: colNum, id });
    }
    this.undoStack.push({
      action: 'insertColumn',
      columns: records,
    });
    this.redoStack = [];
    return this.getAlignments();
  }

  onDeleteColumns(removedColumns: number[]): MarkdownAlignment[] {
    const records = removedColumns
      .map((idx) => ({ index: idx, id: this.columnIds[idx] }))
      .filter((r) => r.id !== undefined)
      .sort((a, b) => a.index - b.index);

    const desc = [...removedColumns].sort((a, b) => b - a);
    for (const col of desc) {
      if (col >= 0 && col < this.columnIds.length) {
        this.columnIds.splice(col, 1);
      }
    }
    this.undoStack.push({
      action: 'deleteColumn',
      columns: records,
    });
    this.redoStack = [];
    return this.getAlignments();
  }

  undo(actionName?: string): MarkdownAlignment[] | null {
    if (!this.undoStack.length) return null;
    const top = this.undoStack[this.undoStack.length - 1];
    if (actionName && top.action !== actionName) {
      console.warn(`AlignmentHistoryManager: action mismatch on undo. Expected ${top.action}, got ${actionName}`);
      return null;
    }
    const entry = this.undoStack.pop()!;
    this.redoStack.push(entry);

    switch (entry.action) {
      case 'moveColumn': {
        const [movedId] = this.columnIds.splice(entry.toIndex, 1);
        this.columnIds.splice(entry.fromIndex, 0, movedId);
        break;
      }
      case 'insertColumn': {
        for (const col of entry.columns) {
          const idx = this.columnIds.indexOf(col.id);
          if (idx !== -1) {
            this.columnIds.splice(idx, 1);
          }
        }
        break;
      }
      case 'deleteColumn': {
        for (const col of entry.columns) {
          const colNum = Math.max(0, Math.min(col.index, this.columnIds.length));
          this.columnIds.splice(colNum, 0, col.id);
        }
        break;
      }
    }
    return this.getAlignments();
  }

  redo(actionName?: string): MarkdownAlignment[] | null {
    if (!this.redoStack.length) return null;
    const top = this.redoStack[this.redoStack.length - 1];
    if (actionName && top.action !== actionName) {
      console.warn(`AlignmentHistoryManager: action mismatch on redo. Expected ${top.action}, got ${actionName}`);
      return null;
    }
    const entry = this.redoStack.pop()!;
    this.undoStack.push(entry);

    switch (entry.action) {
      case 'moveColumn': {
        const [movedId] = this.columnIds.splice(entry.fromIndex, 1);
        this.columnIds.splice(entry.toIndex, 0, movedId);
        break;
      }
      case 'insertColumn': {
        for (const col of entry.columns) {
          const colNum = Math.max(0, Math.min(col.index, this.columnIds.length));
          this.columnIds.splice(colNum, 0, col.id);
        }
        break;
      }
      case 'deleteColumn': {
        for (const col of entry.columns) {
          const idx = this.columnIds.indexOf(col.id);
          if (idx !== -1) {
            this.columnIds.splice(idx, 1);
          }
        }
        break;
      }
    }
    return this.getAlignments();
  }
}

export function resetEditorHistory(
  alignmentManager?: ColumnIdentityAlignmentManager,
  worksheet?: jspreadsheet.WorksheetInstance | null,
) {
  if (alignmentManager) alignmentManager.reset();
  if (worksheet) {
    (worksheet as any).history = [];
    (worksheet as any).historyIndex = -1;
  }
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
  if (typeof document === 'undefined') return;
  for (let index = 0; index < lines.length; index += 1) {
    if (index > 0) target.appendChild(document.createElement('br'));
    target.appendChild(document.createTextNode(lines[index]));
  }
}

export function applySpreadsheetAlignment(cell: HTMLElement, alignment: MarkdownAlignment) {
  if (!cell) return;
  const cssAlign = alignment === 'center' ? 'center' : alignment === 'right' ? 'right' : 'left';
  cell.style.textAlign = cssAlign;
}

export function renderSpreadsheetCellDisplay(
  cell: HTMLTableCellElement,
  value: unknown,
  alignment?: MarkdownAlignment,
) {
  if (!cell || cell.classList?.contains?.('editor')) return;
  const rawText = String(value ?? '');
  cell.replaceChildren?.();
  renderCellContent(cell, rawText);
  applySpreadsheetAlignment(cell, alignment ?? null);
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
  getAlignment,
  onVisualChange,
  onRowMove,
  onColMove,
  onColInsert,
  onColDelete,
  onSetAlignment,
  onUndo,
  onRedo,
  onCreateCell,
}: {
  data: string[][];
  alignments: MarkdownAlignment[];
  getAlignment?: (x: number) => MarkdownAlignment;
  onVisualChange?: () => void;
  onRowMove?: (fromIndex: number, toIndex: number) => void;
  onColMove?: (fromIndex: number, toIndex: number) => void;
  onColInsert?: (columns: Array<{ column: number }>) => void;
  onColDelete?: (removedColumns: number[]) => void;
  onSetAlignment?: (colIndex: number, align: MarkdownAlignment) => void;
  onUndo?: (record: any) => void;
  onRedo?: (record: any) => void;
  onCreateCell?: (instance: jspreadsheet.WorksheetInstance, cell: HTMLTableCellElement, x: number, y: number, value: any) => void;
}) {
  const colCount = Math.max(data[0]?.length || 1, alignments.length, 1);
  const rowCount = Math.max(data.length, 1);
  const columns: jspreadsheet.Column[] = [];
  for (let i = 0; i < colCount; i += 1) {
    const align = getAlignment ? getAlignment(i) : alignments[i];
    columns.push({ align: align === 'center' ? 'center' : align === 'right' ? 'right' : 'left' });
  }

  const contextMenu = (worksheet: jspreadsheet.WorksheetInstance, x: any, y: any, _e: any, _items: any[], section: string) => {
    const customItems: any[] = [];
    const colIndex = x !== null && x !== undefined ? parseInt(x, 10) : 0;
    const rowIndex = y !== null && y !== undefined ? parseInt(y, 10) : 0;

    if (section === 'header') {
      customItems.push({
        title: '在左侧插入列',
        onclick: () => worksheet.insertColumn(1, colIndex, true),
      });
      customItems.push({
        title: '在右侧插入列',
        onclick: () => worksheet.insertColumn(1, colIndex, false),
      });
      customItems.push({
        title: '删除此列',
        onclick: () => worksheet.deleteColumn(colIndex, 1),
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
        onclick: () => worksheet.insertColumn(1, colIndex, true),
      });
      customItems.push({
        title: '在右侧插入列',
        onclick: () => worksheet.insertColumn(1, colIndex, false),
      });
      customItems.push({ type: 'line' });
      customItems.push({
        title: '删除此行',
        onclick: () => worksheet.deleteRow(rowIndex, 1),
      });
      customItems.push({
        title: '删除此列',
        onclick: () => worksheet.deleteColumn(colIndex, 1),
      });
    }
    return customItems;
  };

  const handleUndo = (_instance: jspreadsheet.WorksheetInstance, record: any) => {
    onUndo ? onUndo(record) : onVisualChange?.();
  };
  const handleRedo = (_instance: jspreadsheet.WorksheetInstance, record: any) => {
    onRedo ? onRedo(record) : onVisualChange?.();
  };

  return {
    onundo: handleUndo,
    onredo: handleRedo,
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
        oncreatecell: onCreateCell,
        oneditionend: (_instance: jspreadsheet.WorksheetInstance, cell: HTMLTableCellElement, x: number, _y: number, value: any) => {
          const currentAlign = getAlignment ? getAlignment(x) : (alignments?.[x] ?? null);
          renderSpreadsheetCellDisplay(cell, value, currentAlign);
        },
        oninsertrow: () => onVisualChange?.(),
        ondeleterow: () => onVisualChange?.(),
        oninsertcolumn: (_instance: jspreadsheet.WorksheetInstance, insertedColumns: any[]) => {
          onColInsert?.(insertedColumns);
        },
        ondeletecolumn: (_instance: jspreadsheet.WorksheetInstance, removedColumns: number[]) => {
          onColDelete?.(removedColumns);
        },
        onmoverow: (_instance: jspreadsheet.WorksheetInstance, from: number, to: number) => {
          onRowMove ? onRowMove(from, to) : onVisualChange?.();
        },
        onmovecolumn: (_instance: jspreadsheet.WorksheetInstance, from: number, to: number) => {
          onColMove ? onColMove(from, to) : onVisualChange?.();
        },
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
  let worksheetInstance: jspreadsheet.WorksheetInstance | null = null;
  const alignmentHistory = new ColumnIdentityAlignmentManager();

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

  function applySpreadsheetDisplayAndAlignment() {
    if (!worksheetInstance || !tableContainer) return;
    const data = worksheetInstance.getData();
    const rows = (worksheetInstance as any).records || [];
    for (let y = 0; y < rows.length; y += 1) {
      const row = rows[y];
      if (!row) continue;
      for (let x = 0; x < row.length; x += 1) {
        const cellObj = row[x];
        const cell = cellObj?.element || (worksheetInstance as any).getCellFromCoords?.(x, y);
        if (cell) {
          const val = data[y]?.[x];
          const align = editorTable.alignments?.[x];
          renderSpreadsheetCellDisplay(cell, val, align);
        }
      }
    }
    scheduleTableMathTypeset([tableContainer, editorPreview]);
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
        applySpreadsheetDisplayAndAlignment();
      }
    } catch (err) {
      console.warn('Sync visual to markdown failed:', err);
    } finally {
      syncing = false;
      scheduleTableMathTypeset([tableContainer]);
    }
  }

  function replaceSpreadsheetData() {
    if (!worksheetInstance) return;
    const data2D = getSpreadsheetData();
    try {
      syncing = true;
      resetEditorHistory(alignmentHistory, worksheetInstance);
      alignmentHistory.reset(editorTable.alignments);
      worksheetInstance.setData(data2D);
      applySpreadsheetDisplayAndAlignment();
    } catch (e) {
      console.warn('Replacing Jspreadsheet sheet data failed:', e);
    } finally {
      syncing = false;
    }
  }

  function refreshSpreadsheetView() {
    if (!worksheetInstance || !tableContainer) return;
    try {
      applySpreadsheetDisplayAndAlignment();
      scheduleTableMathTypeset([tableContainer, editorPreview]);
    } catch (e) {
      console.warn('Refreshing Jspreadsheet view failed:', e);
    }
  }

  function initSpreadsheet() {
    if (!tableContainer || typeof window === 'undefined') return;
    tableContainer.replaceChildren();
    resetEditorHistory(alignmentHistory, worksheetInstance);
    alignmentHistory.reset(editorTable.alignments);
    const initialData = getSpreadsheetData();

    const options = buildJspreadsheetOptions({
      data: initialData,
      alignments: editorTable.alignments,
      getAlignment: (x: number) => alignmentHistory.getAlignmentAt(x),
      onVisualChange,
      onCreateCell: (_instance, cell, x, _y, value) => {
        const currentAlign = alignmentHistory.getAlignmentAt(x);
        renderSpreadsheetCellDisplay(cell, value, currentAlign);
      },
      onRowMove: (_from, _to) => {
        onVisualChange();
      },
      onColMove: (from, to) => {
        editorTable.alignments = alignmentHistory.onMoveColumn(from, to);
        onVisualChange();
      },
      onColInsert: (columns) => {
        editorTable.alignments = alignmentHistory.onInsertColumns(columns);
        onVisualChange();
      },
      onColDelete: (removedColumns) => {
        editorTable.alignments = alignmentHistory.onDeleteColumns(removedColumns);
        onVisualChange();
      },
      onSetAlignment: (colIndex, align) => {
        alignmentHistory.setAlignmentAt(colIndex, align);
        editorTable.alignments = alignmentHistory.getAlignments();
        applySpreadsheetDisplayAndAlignment();
        onVisualChange();
      },
      onUndo: (record) => {
        if (record && ['moveColumn', 'insertColumn', 'deleteColumn'].includes(record.action)) {
          const restored = alignmentHistory.undo(record.action);
          if (restored) {
            editorTable.alignments = restored;
            applySpreadsheetDisplayAndAlignment();
          }
        }
        onVisualChange();
      },
      onRedo: (record) => {
        if (record && ['moveColumn', 'insertColumn', 'deleteColumn'].includes(record.action)) {
          const restored = alignmentHistory.redo(record.action);
          if (restored) {
            editorTable.alignments = restored;
            applySpreadsheetDisplayAndAlignment();
          }
        }
        onVisualChange();
      },
    });

    const worksheets = jspreadsheet(tableContainer as HTMLDivElement, options as any);
    worksheetInstance = (Array.isArray(worksheets) ? worksheets[0] : (tableContainer as any).jspreadsheet) as jspreadsheet.WorksheetInstance;
    applySpreadsheetDisplayAndAlignment();
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
    replaceSpreadsheetData();
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
        refreshSpreadsheetView();
      });
    } else if (mode === 'source') {
      editorSource.focus();
    }
  }

  function onTableEditorVisible() {
    window.requestAnimationFrame(() => {
      refreshSpreadsheetView();
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
    replaceSpreadsheetData();
  });

  $('#table-add-row')?.addEventListener('click', () => {
    if (!worksheetInstance) return;
    const cell = (worksheetInstance as any).selectedCell;
    const y = Array.isArray(cell) && typeof cell[1] === 'number'
      ? Math.max(cell[1], cell[3] ?? cell[1])
      : (worksheetInstance.getData().length - 1);
    worksheetInstance.insertRow(1, y, 0);
  });

  $('#table-remove-row')?.addEventListener('click', () => {
    if (!worksheetInstance) return;
    const cell = (worksheetInstance as any).selectedCell;
    const y = Array.isArray(cell) && typeof cell[1] === 'number'
      ? cell[1]
      : (worksheetInstance.getData().length - 1);
    worksheetInstance.deleteRow(y, 1);
  });

  $('#table-add-col')?.addEventListener('click', () => {
    if (!worksheetInstance) return;
    const cell = (worksheetInstance as any).selectedCell;
    const x = Array.isArray(cell) && typeof cell[0] === 'number'
      ? Math.max(cell[0], cell[2] ?? cell[0])
      : ((worksheetInstance.getData()[0]?.length || 1) - 1);
    worksheetInstance.insertColumn(1, x, false);
  });

  $('#table-remove-col')?.addEventListener('click', () => {
    if (!worksheetInstance) return;
    const cell = (worksheetInstance as any).selectedCell;
    const x = Array.isArray(cell) && typeof cell[0] === 'number'
      ? cell[0]
      : ((worksheetInstance.getData()[0]?.length || 1) - 1);
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
