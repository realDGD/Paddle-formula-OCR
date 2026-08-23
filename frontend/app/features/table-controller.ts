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
  autoSizedRows?: number[];
}

export type TableHistoryRestoreResult = {
  state: TableGridState;
  autoSizedRows: number[];
};

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

export type FillHandleMode = 'copy' | 'smart' | 'selection' | 'disabled';

export function clampColumnWidth(width: number, min = 60, max = 600): number {
  return Math.max(min, Math.min(max, Math.round(width)));
}

export function computeTargetColumnIndices(
  selectedRange: { x: number; x1: number } | null,
  selectedCol: number,
  columnCount: number,
): number[] {
  if (columnCount <= 0) return [];
  if (selectedRange && typeof selectedRange.x === 'number' && typeof selectedRange.x1 === 'number') {
    const minX = Math.max(0, Math.min(selectedRange.x, selectedRange.x1));
    const maxX = Math.min(columnCount - 1, Math.max(selectedRange.x, selectedRange.x1));
    const indices: number[] = [];
    for (let i = minX; i <= maxX; i += 1) indices.push(i);
    return indices;
  }
  const col = Math.max(0, Math.min(selectedCol, columnCount - 1));
  return [col];
}

export function computeTargetRowIndices(
  selectedRange: { y: number; y1: number } | null,
  selectedRow: number,
  rowCount: number,
): number[] {
  if (rowCount <= 0) return [];
  if (selectedRange && typeof selectedRange.y === 'number' && typeof selectedRange.y1 === 'number') {
    const minY = Math.max(0, Math.min(selectedRange.y, selectedRange.y1));
    const maxY = Math.min(rowCount - 1, Math.max(selectedRange.y, selectedRange.y1));
    const indices: number[] = [];
    for (let i = minY; i <= maxY; i += 1) indices.push(i);
    return indices;
  }
  const row = Math.max(0, Math.min(selectedRow, rowCount - 1));
  return [row];
}

export function setBatchAlignment(
  state: TableGridState,
  colIndices: number[],
  align: MarkdownAlignment,
): TableGridState {
  const nextAlignments = { ...state.alignmentById };
  for (const idx of colIndices) {
    const colId = state.columnOrder[idx];
    if (colId) {
      nextAlignments[colId] = align;
    }
  }
  return {
    ...state,
    alignmentById: nextAlignments,
  };
}

let measureCanvas: HTMLCanvasElement | null = null;
export function measureTableTextWidth(text: string, font = '13px system-ui, -apple-system, sans-serif'): number {
  if (typeof document === 'undefined') {
    return text.length * 8.5;
  }
  if (!measureCanvas) {
    measureCanvas = document.createElement('canvas');
  }
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return text.length * 8.5;
  ctx.font = font;
  return ctx.measureText(text).width;
}

export function computeAutoColumnWidth(
  state: TableGridState,
  colIndex: number,
  measureText: (text: string) => number = measureTableTextWidth,
  options?: { minWidth?: number; maxWidth?: number; padding?: number },
): number {
  const minWidth = options?.minWidth ?? 80;
  const maxWidth = options?.maxWidth ?? 360;
  const padding = options?.padding ?? 20;

  const colId = state.columnOrder[colIndex];
  if (!colId) return minWidth;

  const headerLabel = columnIndexToLabel(colIndex);
  let maxContentWidth = measureText(headerLabel);

  for (const row of state.rows) {
    const cellText = String(row[colId] ?? '');
    const lines = cellText.split('\n');
    for (const line of lines) {
      const w = measureText(line);
      if (w > maxContentWidth) {
        maxContentWidth = w;
      }
    }
  }

  return Math.max(minWidth, Math.min(maxWidth, Math.round(maxContentWidth + padding)));
}

export function computeAutoRowHeight(
  state: TableGridState,
  rowIndex: number,
  columnWidthsById: Record<string, number>,
  measureText: (text: string) => number = measureTableTextWidth,
  options?: { minHeight?: number; maxHeight?: number; lineHeight?: number },
): number {
  const minHeight = options?.minHeight ?? 36;
  const maxHeight = options?.maxHeight ?? 160;
  const lineHeight = options?.lineHeight ?? 18;

  const rowObj = state.rows[rowIndex];
  if (!rowObj) return minHeight;

  let maxLinesInRow = 1;
  for (const colId of state.columnOrder) {
    const cellText = String(rowObj[colId] ?? '');
    const explicitLines = cellText.split('\n');
    const colWidth = Math.max(60, columnWidthsById[colId] ?? 140) - 16;
    let totalLinesForCol = 0;

    for (const line of explicitLines) {
      const textWidth = measureText(line);
      const wrappedLines = Math.max(1, Math.ceil(textWidth / Math.max(20, colWidth)));
      totalLinesForCol += wrappedLines;
    }

    if (totalLinesForCol > maxLinesInRow) {
      maxLinesInRow = totalLinesForCol;
    }
  }

  return Math.max(minHeight, Math.min(maxHeight, 18 + maxLinesInRow * lineHeight));
}

export function computeSmartFillSeries(
  sourceValues: string[],
  count: number,
  direction: 'forward' | 'backward' = 'forward',
): string[] {
  if (count <= 0) return [];
  if (sourceValues.length === 0) return Array(count).fill('');
  if (sourceValues.length === 1) return Array(count).fill(sourceValues[0]);

  const numValues = sourceValues.map((v) => Number(v.trim()));
  const isAllNumbers = numValues.every((n, i) => sourceValues[i].trim() !== '' && !Number.isNaN(n));

  if (isAllNumbers) {
    const step = numValues[1] - numValues[0];
    let isArithmetic = true;
    for (let i = 2; i < numValues.length; i += 1) {
      if (Math.abs((numValues[i] - numValues[i - 1]) - step) > 1e-9) {
        isArithmetic = false;
        break;
      }
    }
    if (isArithmetic) {
      const result: string[] = [];
      if (direction === 'forward') {
        const lastNum = numValues[numValues.length - 1];
        for (let i = 1; i <= count; i += 1) {
          const nextVal = lastNum + step * i;
          result.push(Number.isInteger(nextVal) ? String(nextVal) : String(Math.round(nextVal * 1e6) / 1e6));
        }
      } else {
        const firstNum = numValues[0];
        for (let i = 1; i <= count; i += 1) {
          const prevVal = firstNum - step * i;
          result.push(Number.isInteger(prevVal) ? String(prevVal) : String(Math.round(prevVal * 1e6) / 1e6));
        }
      }
      return result;
    }
  }

  const result: string[] = [];
  const len = sourceValues.length;
  if (direction === 'forward') {
    for (let i = 0; i < count; i += 1) {
      result.push(sourceValues[i % len]);
    }
  } else {
    for (let i = 1; i <= count; i += 1) {
      const idx = ((0 - i) % len + len) % len;
      result.push(sourceValues[idx]);
    }
  }
  return result;
}

export function applySmartFillToChangedRange(
  detail: {
    oldRange: { x: number; y: number; x1: number; y1: number };
    newRange: { x: number; y: number; x1: number; y1: number };
    newData: Record<number, Record<string, string>>;
  },
  gridState: TableGridState,
) {
  const { oldRange, newRange, newData } = detail;
  const startCol = Math.min(oldRange.x, oldRange.x1);
  const endCol = Math.max(oldRange.x, oldRange.x1);
  const startRow = Math.min(oldRange.y, oldRange.y1);
  const endRow = Math.max(oldRange.y, oldRange.y1);

  const newStartCol = Math.min(newRange.x, newRange.x1);
  const newEndCol = Math.max(newRange.x, newRange.x1);
  const newStartRow = Math.min(newRange.y, newRange.y1);
  const newEndRow = Math.max(newRange.y, newRange.y1);

  // 1. Expanding Downwards
  if (newEndRow > endRow) {
    const fillRowCount = newEndRow - endRow;
    for (let c = startCol; c <= endCol; c += 1) {
      const colId = gridState.columnOrder[c];
      if (!colId) continue;
      const sourceValues: string[] = [];
      for (let r = startRow; r <= endRow; r += 1) {
        sourceValues.push(String(gridState.rows[r]?.[colId] ?? ''));
      }
      const fillSeries = computeSmartFillSeries(sourceValues, fillRowCount, 'forward');
      for (let i = 0; i < fillRowCount; i += 1) {
        const targetRow = endRow + 1 + i;
        if (!newData[targetRow]) newData[targetRow] = {};
        newData[targetRow][colId] = fillSeries[i];
      }
    }
  }
  // 2. Expanding Upwards
  else if (newStartRow < startRow) {
    const fillRowCount = startRow - newStartRow;
    for (let c = startCol; c <= endCol; c += 1) {
      const colId = gridState.columnOrder[c];
      if (!colId) continue;
      const sourceValues: string[] = [];
      for (let r = startRow; r <= endRow; r += 1) {
        sourceValues.push(String(gridState.rows[r]?.[colId] ?? ''));
      }
      const fillSeries = computeSmartFillSeries(sourceValues, fillRowCount, 'backward');
      for (let i = 0; i < fillRowCount; i += 1) {
        const targetRow = startRow - 1 - i;
        if (!newData[targetRow]) newData[targetRow] = {};
        newData[targetRow][colId] = fillSeries[i];
      }
    }
  }
  // 3. Expanding Rightwards
  else if (newEndCol > endCol) {
    const fillColCount = newEndCol - endCol;
    for (let r = startRow; r <= endRow; r += 1) {
      const sourceValues: string[] = [];
      for (let c = startCol; c <= endCol; c += 1) {
        const colId = gridState.columnOrder[c];
        sourceValues.push(colId ? String(gridState.rows[r]?.[colId] ?? '') : '');
      }
      const fillSeries = computeSmartFillSeries(sourceValues, fillColCount, 'forward');
      for (let i = 0; i < fillColCount; i += 1) {
        const targetColIdx = endCol + 1 + i;
        const targetColId = gridState.columnOrder[targetColIdx];
        if (targetColId) {
          if (!newData[r]) newData[r] = {};
          newData[r][targetColId] = fillSeries[i];
        }
      }
    }
  }
  // 4. Expanding Leftwards
  else if (newStartCol < startCol) {
    const fillColCount = startCol - newStartCol;
    for (let r = startRow; r <= endRow; r += 1) {
      const sourceValues: string[] = [];
      for (let c = startCol; c <= endCol; c += 1) {
        const colId = gridState.columnOrder[c];
        sourceValues.push(colId ? String(gridState.rows[r]?.[colId] ?? '') : '');
      }
      const fillSeries = computeSmartFillSeries(sourceValues, fillColCount, 'backward');
      for (let i = 0; i < fillColCount; i += 1) {
        const targetColIdx = startCol - 1 - i;
        const targetColId = gridState.columnOrder[targetColIdx];
        if (targetColId) {
          if (!newData[r]) newData[r] = {};
          newData[r][targetColId] = fillSeries[i];
        }
      }
    }
  }
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

  record(state: TableGridState, autoSizedRows?: Set<number> | number[]): void {
    const autoList = autoSizedRows
      ? (Array.isArray(autoSizedRows) ? [...autoSizedRows] : Array.from(autoSizedRows))
      : [];
    this.undoStack.push({
      rows: state.rows.map((r) => ({ ...r })),
      columnOrder: [...state.columnOrder],
      alignmentById: { ...state.alignmentById },
      autoSizedRows: autoList,
    });
    this.redoStack = [];
  }

  undo(currentState: TableGridState, currentAutoSizedRows?: Set<number> | number[]): TableHistoryRestoreResult | null {
    if (!this.undoStack.length) return null;
    const previous = this.undoStack.pop()!;
    const currentAutoList = currentAutoSizedRows
      ? (Array.isArray(currentAutoSizedRows) ? [...currentAutoSizedRows] : Array.from(currentAutoSizedRows))
      : [];
    this.redoStack.push({
      rows: currentState.rows.map((r) => ({ ...r })),
      columnOrder: [...currentState.columnOrder],
      alignmentById: { ...currentState.alignmentById },
      autoSizedRows: currentAutoList,
    });
    return {
      state: {
        rows: previous.rows.map((r) => ({ ...r })),
        columnOrder: [...previous.columnOrder],
        alignmentById: { ...previous.alignmentById },
      },
      autoSizedRows: previous.autoSizedRows ? [...previous.autoSizedRows] : [],
    };
  }

  redo(currentState: TableGridState, currentAutoSizedRows?: Set<number> | number[]): TableHistoryRestoreResult | null {
    if (!this.redoStack.length) return null;
    const next = this.redoStack.pop()!;
    const currentAutoList = currentAutoSizedRows
      ? (Array.isArray(currentAutoSizedRows) ? [...currentAutoSizedRows] : Array.from(currentAutoSizedRows))
      : [];
    this.undoStack.push({
      rows: currentState.rows.map((r) => ({ ...r })),
      columnOrder: [...currentState.columnOrder],
      alignmentById: { ...currentState.alignmentById },
      autoSizedRows: currentAutoList,
    });
    return {
      state: {
        rows: next.rows.map((r) => ({ ...r })),
        columnOrder: [...next.columnOrder],
        alignmentById: { ...next.alignmentById },
      },
      autoSizedRows: next.autoSizedRows ? [...next.autoSizedRows] : [],
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
  onResizeStart?: (colId: string, e: PointerEvent) => void,
) {
  const rawText = String(props.value ?? '');
  const parsed = parseMathFormula(rawText);
  const colId = String(props.prop);
  const rowIndex = typeof props.rowIndex === 'number' ? props.rowIndex : 0;
  const align = alignmentById[colId] || 'left';
  const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
  const vnodeKey = buildCellVNodeKey(rowIndex, colId, rawText, parsed.isMath);

  const resizerVNode = h('span', {
    class: 'revo-col-resizer',
    'data-col-id': colId,
    onPointerDown: (e: PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onResizeStart?.(colId, e);
    },
    onClick: (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
    },
  });

  if (parsed.isMath) {
    return h('div', {
      key: vnodeKey,
      class: 'table-cell-content math-rendered-cell',
      style: { justifyContent: justify, width: '100%', height: '100%', display: 'flex', alignItems: 'center', position: 'relative' },
      'data-raw': rawText,
      ref: (el: HTMLElement) => {
        if (el) {
          let mathSpan = el.querySelector<HTMLElement>('.katex-cell-math');
          if (!mathSpan) {
            el.replaceChildren();
            mathSpan = document.createElement('span');
            mathSpan.className = 'katex-cell-math';
            el.appendChild(mathSpan);

            const resizer = document.createElement('span');
            resizer.className = 'revo-col-resizer';
            resizer.setAttribute('data-col-id', colId);
            resizer.addEventListener('pointerdown', (e) => {
              e.stopPropagation();
              e.preventDefault();
              onResizeStart?.(colId, e);
            });
            resizer.addEventListener('click', (e) => {
              e.stopPropagation();
              e.preventDefault();
            });
            el.appendChild(resizer);
          }
          try {
            katex.render(parsed.formula, mathSpan, {
              displayMode: Boolean(parsed.displayMode),
              throwOnError: false,
            });
          } catch {
            mathSpan.textContent = rawText;
          }
        }
      },
    });
  }

  return h('div', {
    key: vnodeKey,
    class: 'table-cell-content plain-text-cell',
    style: { justifyContent: justify, width: '100%', height: '100%', display: 'flex', alignItems: 'center', position: 'relative' },
    'data-raw': rawText,
  }, [
    h('span', { class: 'plain-cell-text' }, rawText),
    resizerVNode,
  ]);
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
  private disconnecting = false;

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

  onBlur() {
    if (this.disconnecting) {
      return;
    }
    this.disconnecting = true;
    this.saveCallback?.(this.getValue(), true);
    this.closeCallback?.(false);
  }

  beforeDisconnect() {
    this.disconnecting = true;
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
      onBlur: () => this.onBlur(),
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

export function buildEffectiveRowDefinitions(
  state: TableGridState,
  columnWidthsById: Record<string, number>,
  autoSizedRows?: Set<number>,
  measureText: (text: string) => number = measureTableTextWidth,
): Array<{ type: 'rgRow'; index: number; size: number }> {
  const definitions = buildRowDefinitions(state);
  if (!autoSizedRows || autoSizedRows.size === 0) {
    return definitions;
  }
  for (const rowIndex of autoSizedRows) {
    if (rowIndex >= 0 && rowIndex < state.rows.length) {
      const def = definitions.find((d) => d.index === rowIndex);
      if (def) {
        def.size = computeAutoRowHeight(state, rowIndex, columnWidthsById, measureText);
      }
    }
  }
  return definitions;
}

export function buildAutoRowDefinitions(
  state: TableGridState,
  columnWidthsById: Record<string, number>,
  measureText: (text: string) => number = measureTableTextWidth,
): Array<{ type: 'rgRow'; index: number; size: number }> {
  const allRows = new Set<number>(state.rows.map((_, i) => i));
  return buildEffectiveRowDefinitions(state, columnWidthsById, allRows, measureText);
}

export function remapAutoSizedRowsOnInsert(autoSizedRows: Set<number>, insertIndex: number): Set<number> {
  const next = new Set<number>();
  for (const idx of autoSizedRows) {
    if (idx < insertIndex) {
      next.add(idx);
    } else {
      next.add(idx + 1);
    }
  }
  return next;
}

export function remapAutoSizedRowsOnDelete(autoSizedRows: Set<number>, deleteIndex: number): Set<number> {
  const next = new Set<number>();
  for (const idx of autoSizedRows) {
    if (idx === deleteIndex) {
      continue;
    } else if (idx > deleteIndex) {
      next.add(idx - 1);
    } else {
      next.add(idx);
    }
  }
  return next;
}

export function remapAutoSizedRowsOnReorder(
  autoSizedRows: Set<number>,
  fromIndex: number,
  toIndex: number,
): Set<number> {
  const next = new Set<number>();
  const isFromAuto = autoSizedRows.has(fromIndex);
  for (const idx of autoSizedRows) {
    if (idx === fromIndex) continue;
    if (fromIndex < toIndex) {
      if (idx > fromIndex && idx <= toIndex) {
        next.add(idx - 1);
      } else {
        next.add(idx);
      }
    } else if (fromIndex > toIndex) {
      if (idx >= toIndex && idx < fromIndex) {
        next.add(idx + 1);
      } else {
        next.add(idx);
      }
    } else {
      next.add(idx);
    }
  }
  if (isFromAuto) {
    next.add(toIndex);
  }
  return next;
}

export function autoSizedRowsEqual(a?: Set<number> | number[] | null, b?: Set<number> | number[] | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const setA = a instanceof Set ? a : new Set(a);
  const setB = b instanceof Set ? b : new Set(b);
  if (setA.size !== setB.size) return false;
  for (const item of setA) {
    if (!setB.has(item)) return false;
  }
  return true;
}

export type TableEditorMutationContext = {
  state: TableGridState;
  autoSizedRows: Set<number>;
};

export type TableEditorMutationResult = {
  before: { state: TableGridState; autoSizedRows: Set<number> };
  after: { state: TableGridState; autoSizedRows: Set<number> };
  changed: boolean;
};

export function applyTableEditorMutation(
  current: TableEditorMutationContext,
  stateMutator: (state: TableGridState) => TableGridState,
  autoRowsMutator?: (rows: Set<number>) => Set<number>,
): TableEditorMutationResult {
  const beforeState = current.state;
  const beforeAuto = new Set(current.autoSizedRows);

  const nextState = stateMutator(beforeState);
  const nextAuto = autoRowsMutator ? autoRowsMutator(new Set(beforeAuto)) : beforeAuto;

  const stateSame = tableGridStateEquals(beforeState, nextState);
  const autoSame = autoSizedRowsEqual(beforeAuto, nextAuto);
  const changed = !stateSame || !autoSame;

  return {
    before: {
      state: beforeState,
      autoSizedRows: beforeAuto,
    },
    after: {
      state: nextState,
      autoSizedRows: nextAuto,
    },
    changed,
  };
}

export type TableSelectionMode = 'cell' | 'range' | 'row' | 'column';

export function applyRowSelection(
  rowIndex: number,
  rowCount: number,
  columnCount: number,
): {
  mode: TableSelectionMode;
  selectedCell: { row: number; col: number };
  selectedRange: { x: number; y: number; x1: number; y1: number };
} {
  return {
    mode: 'row',
    selectedCell: { row: rowIndex, col: 0 },
    selectedRange: {
      x: 0,
      y: rowIndex,
      x1: Math.max(0, columnCount - 1),
      y1: rowIndex,
    },
  };
}

export function applyColumnSelection(
  colIndex: number,
  rowCount: number,
  columnCount: number,
): {
  mode: TableSelectionMode;
  selectedCell: { row: number; col: number };
  selectedRange: { x: number; y: number; x1: number; y1: number };
} {
  return {
    mode: 'column',
    selectedCell: { row: 0, col: colIndex },
    selectedRange: {
      x: colIndex,
      y: 0,
      x1: colIndex,
      y1: Math.max(0, rowCount - 1),
    },
  };
}

export function handleAfterFocusRange(
  selectionMode: TableSelectionMode,
  currentRange: { x: number; y: number; x1: number; y1: number } | null,
  cell: { row: number; col: number },
): { x: number; y: number; x1: number; y1: number } | null {
  if (selectionMode === 'cell') {
    return {
      x: cell.col,
      y: cell.row,
      x1: cell.col,
      y1: cell.row,
    };
  }
  return currentRange;
}

export function handleBeforeCellFocusTransition(
  selectionMode: TableSelectionMode,
  structuralFocusInProgress: boolean,
): TableSelectionMode {
  if (structuralFocusInProgress) {
    return selectionMode;
  }
  if (selectionMode === 'row' || selectionMode === 'column') {
    return 'cell';
  }
  return selectionMode;
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

export function buildRevoColumns(
  state: TableGridState,
  columnWidthsById: Record<string, number> = {},
  onResizeStart?: (colId: string, e: PointerEvent) => void,
) {
  return state.columnOrder.map((colId, index) => ({
    prop: colId,
    name: columnIndexToLabel(index),
    size: columnWidthsById[colId] ?? 140,
    editor: RevoTextareaEditor,
    columnTemplate: (h: any, data: any) => h('div', { class: 'table-column-header' }, data.name),
    cellTemplate: (h: any, props: any) => createCellTemplate(h, props, state.alignmentById, onResizeStart),
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
  let selectedRange: { x: number; y: number; x1: number; y1: number } | null = null;
  let selectionMode: TableSelectionMode = 'cell';
  let structuralFocusInProgress = false;
  const columnWidthsById: Record<string, number> = {};
  let fillHandleMode: FillHandleMode =
    (typeof localStorage !== 'undefined' ? (localStorage.getItem('tableFillHandleMode') as FillHandleMode) : null) ||
    'copy';
  let autoSizedRows = new Set<number>();
  const history = new TableSnapshotHistory();

  function updateSelectionClasses() {
    if (!tableContainer) return;
    tableContainer.classList.toggle('is-row-selected', selectionMode === 'row');
    tableContainer.classList.toggle('is-column-selected', selectionMode === 'column');
  }

  function resetSelectionLifecycle() {
    selectionMode = 'cell';
    selectedCell = { row: 0, col: 0 };
    selectedRange = null;
    updateSelectionClasses();
  }

  function getEffectiveRowDefinitions(): Array<{ type: 'rgRow'; index: number; size: number }> {
    return buildEffectiveRowDefinitions(gridState, columnWidthsById, autoSizedRows, measureTableTextWidth);
  }

  function applyFillHandleMode() {
    tableContainer?.classList.toggle('fill-mode-disabled', fillHandleMode === 'disabled');
  }

  let activeResizeColId: string | null = null;
  let resizeStartX = 0;
  let resizeStartWidth = 140;

  function handleColResizeStart(colId: string, e: PointerEvent) {
    activeResizeColId = colId;
    resizeStartX = e.clientX;
    resizeStartWidth = columnWidthsById[colId] ?? 140;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onPointerMove(ev: PointerEvent) {
      if (!activeResizeColId) return;
      const dx = ev.clientX - resizeStartX;
      const newWidth = clampColumnWidth(resizeStartWidth + dx);
      columnWidthsById[activeResizeColId] = newWidth;
      if (gridElement) {
        gridElement.columns = buildRevoColumns(gridState, columnWidthsById, handleColResizeStart);
        if (autoSizedRows.size > 0) {
          gridElement.rowDefinitions = getEffectiveRowDefinitions();
        }
      }
    }

    function onPointerUp() {
      activeResizeColId = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  function updateHistoryButtons() {
    const undoBtn = $<HTMLButtonElement>('#table-undo-btn');
    const redoBtn = $<HTMLButtonElement>('#table-redo-btn');
    if (undoBtn) undoBtn.disabled = history.getUndoDepth() === 0;
    if (redoBtn) redoBtn.disabled = history.getRedoDepth() === 0;
  }

  function performTableUndo() {
    const restored = history.undo(gridState, autoSizedRows);
    if (restored) {
      gridState = restored.state;
      autoSizedRows = new Set(restored.autoSizedRows);
      applyGridStateToView();
      syncGridToMarkdown();
      updateHistoryButtons();
    }
  }

  function performTableRedo() {
    const restored = history.redo(gridState, autoSizedRows);
    if (restored) {
      gridState = restored.state;
      autoSizedRows = new Set(restored.autoSizedRows);
      applyGridStateToView();
      syncGridToMarkdown();
      updateHistoryButtons();
    }
  }

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
    gridElement.columns = buildRevoColumns(gridState, columnWidthsById, handleColResizeStart);
    gridElement.source = gridState.rows;
    gridElement.rowDefinitions = getEffectiveRowDefinitions();
    updateHistoryButtons();
  }

  function applyGridMutation(
    stateMutator: (state: TableGridState) => TableGridState,
    autoRowsMutator?: (rows: Set<number>) => Set<number>,
  ): boolean {
    const result = applyTableEditorMutation(
      { state: gridState, autoSizedRows },
      stateMutator,
      autoRowsMutator,
    );
    if (!result.changed) {
      return false;
    }
    history.record(result.before.state, result.before.autoSizedRows);
    gridState = result.after.state;
    autoSizedRows = result.after.autoSizedRows;
    applyGridStateToView();
    syncGridToMarkdown();
    updateHistoryButtons();
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
        autoSizedRows.clear();
        resetSelectionLifecycle();
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
    autoSizedRows.clear();
    resetSelectionLifecycle();
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

    applyFillHandleMode();

    (grid as any).columns = buildRevoColumns(gridState, columnWidthsById, handleColResizeStart);
    (grid as any).source = gridState.rows;
    (grid as any).rowDefinitions = getEffectiveRowDefinitions();

    (grid as any).rowHeaders = {
      size: 58,
      cellTemplate: (h: any, { rowIndex }: any) =>
        h('div', {
          class: 'revo-row-handle',
          draggable: true,
          'data-row-index': String(rowIndex),
          onClick: async () => {
            const sel = applyRowSelection(rowIndex, gridState.rows.length, gridState.columnOrder.length);
            selectionMode = sel.mode;
            selectedCell.row = sel.selectedCell.row;
            selectedCell.col = sel.selectedCell.col;
            selectedRange = sel.selectedRange;
            updateSelectionClasses();
            if ((grid as any).setCellsFocus) {
              structuralFocusInProgress = true;
              try {
                await (grid as any).setCellsFocus(
                  { x: 0, y: rowIndex },
                  { x: gridState.columnOrder.length - 1, y: rowIndex },
                );
              } catch {} finally {
                structuralFocusInProgress = false;
              }
            }
          },
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
                applyGridMutation(
                  (st) => reorderRows(st, from, finalIndex),
                  (rows) => remapAutoSizedRowsOnReorder(rows, from, finalIndex),
                );
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

    grid.addEventListener('beforefocusrender', (e: any) => {
      if (selectionMode === 'row' || selectionMode === 'column') {
        e.preventDefault();
      }
    });

    grid.addEventListener('beforecellfocus', () => {
      const nextMode = handleBeforeCellFocusTransition(selectionMode, structuralFocusInProgress);
      if (nextMode !== selectionMode) {
        selectionMode = nextMode;
        updateSelectionClasses();
      }
    });

    grid.addEventListener('afterfocus', (e: any) => {
      if (e.detail) {
        if (typeof e.detail.rowIndex === 'number') {
          selectedCell.row = e.detail.rowIndex;
        }
        if (typeof e.detail.colIndex === 'number') {
          selectedCell.col = e.detail.colIndex;
        }
        selectedRange = handleAfterFocusRange(selectionMode, selectedRange, selectedCell);
      }
    });

    grid.addEventListener('setrange', (e: any) => {
      if (e.detail) {
        if (selectionMode === 'cell') {
          selectionMode = 'range';
        }
        selectedRange = {
          x: Math.min(e.detail.x, e.detail.x1),
          y: Math.min(e.detail.y, e.detail.y1),
          x1: Math.max(e.detail.x, e.detail.x1),
          y1: Math.max(e.detail.y, e.detail.y1),
        };
        updateSelectionClasses();
      }
    });

    grid.addEventListener('beforeheaderclick', async (e: any) => {
      const colIdx = typeof e.detail?.index === 'number' ? e.detail.index : selectedCell.col;
      const sel = applyColumnSelection(colIdx, gridState.rows.length, gridState.columnOrder.length);
      selectionMode = sel.mode;
      selectedCell.row = sel.selectedCell.row;
      selectedCell.col = sel.selectedCell.col;
      selectedRange = sel.selectedRange;
      updateSelectionClasses();
      if ((grid as any).setCellsFocus) {
        structuralFocusInProgress = true;
        try {
          await (grid as any).setCellsFocus(
            { x: colIdx, y: 0 },
            { x: colIdx, y: Math.max(0, gridState.rows.length - 1) },
          );
        } catch {} finally {
          structuralFocusInProgress = false;
        }
      }
    });

    grid.addEventListener('aftercolumnresize', (e: any) => {
      if (e.detail) {
        Object.values(e.detail).forEach((col: any) => {
          if (col && typeof col.prop === 'string' && typeof col.size === 'number') {
            columnWidthsById[col.prop] = clampColumnWidth(col.size);
          }
        });
      }
    });

    grid.addEventListener('headerresize', (e: any) => {
      if (e.detail) {
        Object.entries(e.detail).forEach(([indexStr, size]) => {
          const idx = Number(indexStr);
          const colId = gridState.columnOrder[idx];
          if (colId && typeof size === 'number') {
            columnWidthsById[colId] = clampColumnWidth(size);
          }
        });
      }
    });

    grid.addEventListener('beforeautofill', (e: any) => {
      if (fillHandleMode === 'disabled') {
        e.preventDefault();
        return;
      }
      if (fillHandleMode === 'selection') {
        e.preventDefault();
        if (e.detail?.newRange) {
          const nr = e.detail.newRange;
          selectedRange = {
            x: Math.min(nr.x, nr.x1),
            y: Math.min(nr.y, nr.y1),
            x1: Math.max(nr.x, nr.x1),
            y1: Math.max(nr.y, nr.y1),
          };
          (grid as any).setCellsFocus?.({ x: nr.x, y: nr.y }, { x: nr.x1, y: nr.y1 })?.catch?.(() => undefined);
        }
        return;
      }
      if (fillHandleMode === 'smart') {
        if (e.detail) {
          applySmartFillToChangedRange(e.detail, gridState);
        }
      }
    });

    grid.addEventListener('beforeedit', (e: any) => {
      if (!pasteGuard.isActive() && shouldRecordCellEdit(e.detail)) {
        history.record(gridState, autoSizedRows);
        updateHistoryButtons();
      }
    });

    grid.addEventListener('beforerangeedit', () => {
      if (!pasteGuard.isActive()) {
        history.record(gridState, autoSizedRows);
        updateHistoryButtons();
      }
    });

    grid.addEventListener('afteredit', (e: any) => {
      if (e.detail && e.detail.prop !== undefined) {
        const colId = String(e.detail.prop);
        const rowIdx = e.detail.rowIndex ?? selectedCell.row;
        if (gridState.rows[rowIdx]) {
          gridState.rows[rowIdx][colId] = String(e.detail.val ?? '');
          grid.rowDefinitions = getEffectiveRowDefinitions();
        }
      } else if (grid.source) {
        gridState.rows = grid.source;
        grid.rowDefinitions = getEffectiveRowDefinitions();
      }
      syncGridToMarkdown();
    });

    grid.addEventListener('beforepaste', () => {
      pasteGuard.begin();
    });

    grid.addEventListener('beforepasteapply', () => {
      pasteGuard.begin();
      history.record(gridState, autoSizedRows);
      updateHistoryButtons();
    });

    grid.addEventListener('afterpasteapply', () => {
      pasteGuard.end();
      grid.rowDefinitions = getEffectiveRowDefinitions();
      syncGridToMarkdown();
      updateHistoryButtons();
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
          history.record(gridState, autoSizedRows);
          gridState = {
            ...gridState,
            columnOrder: [...newOrder],
          };
          applyGridStateToView();
          syncGridToMarkdown();
          updateHistoryButtons();
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
          {
            label: '在上方插入行',
            action: () => {
              applyGridMutation(
                (st) => insertRowBefore(st, rowIdx),
                (rows) => remapAutoSizedRowsOnInsert(rows, rowIdx),
              );
            },
          },
          {
            label: '在下方插入行',
            action: () => {
              applyGridMutation(
                (st) => insertRowAfter(st, rowIdx),
                (rows) => remapAutoSizedRowsOnInsert(rows, rowIdx + 1),
              );
            },
          },
          { separator: true },
          {
            label: '删除行',
            action: () => {
              applyGridMutation(
                (st) => deleteRow(st, rowIdx),
                (rows) => remapAutoSizedRowsOnDelete(rows, rowIdx),
              );
            },
          },
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
          {
            label: '在上方插入行',
            action: () => {
              applyGridMutation(
                (st) => insertRowBefore(st, rowIdx),
                (rows) => remapAutoSizedRowsOnInsert(rows, rowIdx),
              );
            },
          },
          {
            label: '在下方插入行',
            action: () => {
              applyGridMutation(
                (st) => insertRowAfter(st, rowIdx),
                (rows) => remapAutoSizedRowsOnInsert(rows, rowIdx + 1),
              );
            },
          },
          {
            label: '删除当前行',
            action: () => {
              applyGridMutation(
                (st) => deleteRow(st, rowIdx),
                (rows) => remapAutoSizedRowsOnDelete(rows, rowIdx),
              );
            },
          },
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
    autoSizedRows.clear();
    resetSelectionLifecycle();
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
    autoSizedRows.clear();
    resetSelectionLifecycle();
    replaceGridData();
  });

  function getTargetCols(): number[] {
    return computeTargetColumnIndices(selectedRange, selectedCell.col, gridState.columnOrder.length);
  }

  function getTargetRows(): number[] {
    return computeTargetRowIndices(selectedRange, selectedCell.row, gridState.rows.length);
  }

  $('#table-align-left')?.addEventListener('click', () => {
    const cols = getTargetCols();
    applyGridMutation((st) => setBatchAlignment(st, cols, 'left'));
  });

  $('#table-align-center')?.addEventListener('click', () => {
    const cols = getTargetCols();
    applyGridMutation((st) => setBatchAlignment(st, cols, 'center'));
  });

  $('#table-align-right')?.addEventListener('click', () => {
    const cols = getTargetCols();
    applyGridMutation((st) => setBatchAlignment(st, cols, 'right'));
  });

  function autoSizeColumns(cols?: number[]) {
    const targetCols = cols ?? Array.from({ length: gridState.columnOrder.length }, (_, i) => i);
    targetCols.forEach((colIdx) => {
      const colId = gridState.columnOrder[colIdx];
      if (colId) {
        const autoW = computeAutoColumnWidth(gridState, colIdx, measureTableTextWidth);
        columnWidthsById[colId] = autoW;
      }
    });
    if (gridElement) {
      gridElement.columns = buildRevoColumns(gridState, columnWidthsById, handleColResizeStart);
      if (autoSizedRows.size > 0) {
        gridElement.rowDefinitions = getEffectiveRowDefinitions();
      }
    }
  }

  function autoSizeRows(rows?: number[]) {
    const targetRows = rows ?? Array.from({ length: gridState.rows.length }, (_, i) => i);
    targetRows.forEach((r) => autoSizedRows.add(r));
    if (gridElement) {
      gridElement.rowDefinitions = getEffectiveRowDefinitions();
    }
  }

  $('#table-autosize-cols')?.addEventListener('click', () => {
    autoSizeColumns(selectedRange !== null ? getTargetCols() : undefined);
  });

  $('#table-autosize-rows')?.addEventListener('click', () => {
    autoSizeRows(selectedRange !== null ? getTargetRows() : undefined);
  });

  $('#table-autosize-both')?.addEventListener('click', () => {
    autoSizeColumns(selectedRange !== null ? getTargetCols() : undefined);
    autoSizeRows(selectedRange !== null ? getTargetRows() : undefined);
  });

  $('#table-undo-btn')?.addEventListener('click', () => {
    performTableUndo();
  });

  $('#table-redo-btn')?.addEventListener('click', () => {
    performTableRedo();
  });

  const fillModeSelect = $<HTMLSelectElement>('#table-fill-handle-mode');
  if (fillModeSelect) {
    fillModeSelect.value = fillHandleMode;
    fillModeSelect.addEventListener('change', () => {
      fillHandleMode = (fillModeSelect.value as FillHandleMode) || 'copy';
      try {
        localStorage?.setItem('tableFillHandleMode', fillHandleMode);
      } catch {}
      applyFillHandleMode();
    });
  }

  // Undo / Redo keyboard shortcuts
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (!isGridVisible()) return;
    if (!shouldHandleTableHistory(e)) return;
    const isCmdOrCtrl = e.metaKey || e.ctrlKey;
    if (isCmdOrCtrl && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      performTableUndo();
      e.preventDefault();
    } else if (isCmdOrCtrl && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
      performTableRedo();
      e.preventDefault();
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
