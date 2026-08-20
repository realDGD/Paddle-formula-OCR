import { $ } from '../core/dom.ts';
import type { TableResult, WorkbenchPage } from '../types.ts';

export type MarkdownPipeTable = {
  headers: string[];
  rows: string[][];
};

function splitPipeRow(line: string): string[] {
  const source = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let cell = '';
  let escaped = false;
  for (const character of source) {
    if (escaped) {
      cell += character === '|' ? '|' : `\\${character}`;
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

const isSeparatorCell = (cell: string) => /^:?-{3,}:?$/.test(cell.trim());

export function parseMarkdownPipeTables(markdown: string): MarkdownPipeTable[] {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const tables: MarkdownPipeTable[] = [];
  for (let separatorIndex = 1; separatorIndex < lines.length; separatorIndex += 1) {
    const headerLine = lines[separatorIndex - 1];
    const separatorLine = lines[separatorIndex];
    if (!headerLine.includes('|') || !separatorLine.includes('|')) continue;
    const headers = splitPipeRow(headerLine);
    const separators = splitPipeRow(separatorLine);
    if (!headers.length || separators.length !== headers.length || !separators.every(isSeparatorCell)) continue;

    const rows: string[][] = [];
    let rowIndex = separatorIndex + 1;
    while (rowIndex < lines.length && lines[rowIndex].trim() && lines[rowIndex].includes('|')) {
      const cells = splitPipeRow(lines[rowIndex]).slice(0, headers.length);
      while (cells.length < headers.length) cells.push('');
      rows.push(cells);
      rowIndex += 1;
    }
    tables.push({ headers, rows });
    separatorIndex = rowIndex - 1;
  }
  return tables;
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

function decodeHtmlEntities(value: string): string {
  return new DOMParser().parseFromString(value, 'text/html').body.textContent || '';
}

function buildPipeTable({ headers, rows }: MarkdownPipeTable): HTMLTableElement {
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const headingRow = document.createElement('tr');
  for (const value of headers) {
    const cell = document.createElement('th');
    cell.textContent = decodeHtmlEntities(value);
    headingRow.append(cell);
  }
  head.append(headingRow);
  const body = document.createElement('tbody');
  for (const row of rows) {
    const tableRow = document.createElement('tr');
    for (const value of row) {
      const cell = document.createElement('td');
      cell.textContent = decodeHtmlEntities(value);
      tableRow.append(cell);
    }
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

  let syncing = false;

  const renderRecognized = () => {
    renderTableSource(recognizedSource.value, recognizedPreview, recognizedStatus);
    continueButton.disabled = !recognizedSource.value.trim();
  };
  const renderEditor = () => renderTableSource(editorSource.value, editorPreview, editorStatus);

  const setRecognizedMarkdown = (value: string) => {
    if (recognizedSource.value !== value) recognizedSource.value = value;
    renderRecognized();
    if (!syncing) {
      syncing = true;
      setEditorMarkdown(value);
      syncing = false;
    }
  };

  const setEditorMarkdown = (value: string) => {
    if (editorSource.value !== value) editorSource.value = value;
    renderEditor();
    if (!syncing) {
      syncing = true;
      setRecognizedMarkdown(value);
      syncing = false;
    }
  };

  recognizedSource.addEventListener('input', () => setRecognizedMarkdown(recognizedSource.value));
  editorSource.addEventListener('input', () => setEditorMarkdown(editorSource.value));
  $('#copy-table-markdown').addEventListener('click', () => copyMarkdown(recognizedSource.value, recognizedStatus));
  $('#copy-table-editor-markdown').addEventListener('click', () => copyMarkdown(editorSource.value, editorStatus));
  $('#clear-table-editor').addEventListener('click', () => {
    setEditorMarkdown('');
    editorSource.focus();
  });
  continueButton.addEventListener('click', () => {
    setEditorMarkdown(recognizedSource.value);
    showWorkbenchPage('table-editor');
    editorSource.focus();
  });

  renderRecognized();
  renderEditor();
  return {
    setTableResults(tables: TableResult[]) {
      const markdown = tables.map((table) => table.markdown.trim()).filter(Boolean).join('\n\n');
      setRecognizedMarkdown(markdown);
    },
  };
}
