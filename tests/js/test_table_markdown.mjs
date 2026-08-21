import assert from 'node:assert/strict';
import {
  alignmentSeparator,
  buildAutoRowDefinitions,
  buildCellVNodeKey,
  buildEffectiveRowDefinitions,
  buildRevoColumns,
  buildRowDefinitions,
  clampColumnWidth,
  columnIndexToLabel,
  computeAutoColumnWidth,
  computeAutoRowHeight,
  computeRowDropIndex,
  computeSmartFillSeries,
  computeTargetColumnIndices,
  computeTargetRowIndices,
  decodeHtmlEntities,
  decodeMarkdownCell,
  deleteColumn,
  deleteRow,
  encodeMarkdownCell,
  gridStateToMarkdownPipeTable,
  insertColumnAfter,
  insertColumnBefore,
  insertRowAfter,
  insertRowBefore,
  isEditableContext,
  markdownPipeTableToGridState,
  measureTableTextWidth,
  normalizeTableMathText,
  parseAlignment,
  parseMarkdownPipeTables,
  parseMathFormula,
  PasteTransactionGuard,
  remapAutoSizedRowsOnDelete,
  remapAutoSizedRowsOnInsert,
  remapAutoSizedRowsOnReorder,
  reorderColumns,
  reorderRows,
  resolveRevoGridTheme,
  RevoTextareaEditor,
  serializeMarkdownPipeTable,
  setAlignment,
  setBatchAlignment,
  setCellValue,
  shouldHandleTableHistory,
  shouldRecordCellEdit,
  tableGridStateEquals,
  TableSnapshotHistory,
} from '../../frontend/app/features/table-controller.ts';

// 1. decodeHtmlEntities character references tests
assert.equal(decodeHtmlEntities('<b>text</b>'), '<b>text</b>');
assert.equal(decodeHtmlEntities('<span>hello</span>'), '<span>hello</span>');
assert.equal(decodeHtmlEntities('&amp; &lt; &gt; &quot; &#39; &apos; &nbsp;'), '& < > " \' \' \u00a0');
assert.equal(decodeHtmlEntities('&#65; &#x42;'), 'A B');
assert.equal(decodeHtmlEntities('&lt;br&gt;'), '<br>');

// 2. Markdown cell codec unit tests
assert.equal(decodeMarkdownCell('A\\|B'), 'A|B');
assert.equal(decodeMarkdownCell('A\\\\B'), 'A\\B');
assert.equal(decodeMarkdownCell('第一行<br>第二行'), '第一行\n第二行');
assert.equal(decodeMarkdownCell('第一行<br/>第二行'), '第一行\n第二行');
assert.equal(decodeMarkdownCell('第一行<br />第二行'), '第一行\n第二行');
assert.equal(decodeMarkdownCell('A&lt;br&gt;B'), 'A<br>B');
assert.equal(decodeMarkdownCell('&lt;b&gt;text&lt;/b&gt;'), '<b>text</b>');
assert.equal(
  decodeMarkdownCell('\\*bold\\* \\_italic\\_ \\[link\\] \\!warn \\`code\\`'),
  '*bold* _italic_ [link] !warn `code`',
);
assert.equal(decodeMarkdownCell('&amp; &lt; &gt; &quot; &#39;'), '& < > " \'');

// 3. encodeMarkdownCell unit tests
assert.equal(encodeMarkdownCell('A|B'), 'A\\|B');
assert.equal(encodeMarkdownCell('A\\B'), 'A\\\\B');
assert.equal(encodeMarkdownCell('第一行\n第二行'), '第一行<br>第二行');
assert.equal(encodeMarkdownCell('A<br>B'), 'A&lt;br&gt;B');
assert.equal(encodeMarkdownCell('<b>text</b>'), '&lt;b&gt;text&lt;/b&gt;');
assert.equal(
  encodeMarkdownCell('*bold* _italic_ [link] !warn `code`'),
  '\\*bold\\* \\_italic\\_ \\[link\\] \\!warn \\`code\\`',
);
assert.equal(encodeMarkdownCell('& < > " \''), '&amp; &lt; &gt; " \'');

// 4. Literal &lt;br&gt; and <br> round-trip
assert.equal(decodeMarkdownCell('A&lt;br&gt;B'), 'A<br>B');
assert.equal(encodeMarkdownCell('A<br>B'), 'A&lt;br&gt;B');
assert.equal(decodeMarkdownCell(encodeMarkdownCell('A<br>B')), 'A<br>B');

assert.equal(encodeMarkdownCell('A\nB'), 'A<br>B');
assert.equal(decodeMarkdownCell('A<br>B'), 'A\nB');
assert.equal(decodeMarkdownCell(encodeMarkdownCell('A\nB')), 'A\nB');

// 5. Alignment validation (1/2 hyphens rejected, 3+ hyphens accepted)
assert.equal(parseAlignment('---'), null);
assert.equal(parseAlignment(':---'), 'left');
assert.equal(parseAlignment('---:'), 'right');
assert.equal(parseAlignment(':---:'), 'center');
assert.equal(parseAlignment(':-----:'), 'center');

assert.equal(parseAlignment('-'), undefined);
assert.equal(parseAlignment('--'), undefined);
assert.equal(parseAlignment(':-:'), undefined);
assert.equal(parseAlignment(':-'), undefined);
assert.equal(parseAlignment('-:'), undefined);
assert.equal(parseAlignment(':--'), undefined);
assert.equal(parseAlignment('--:'), undefined);
assert.equal(parseAlignment(':--:'), undefined);
assert.equal(parseAlignment('invalid'), undefined);

assert.equal(alignmentSeparator('left'), ':---');
assert.equal(alignmentSeparator('center'), ':---:');
assert.equal(alignmentSeparator('right'), '---:');
assert.equal(alignmentSeparator(null), '---');

// 6. Normal table with all alignments
const normalTableMarkdown = [
  '| Left | Center | Right | Default |',
  '| :--- | :---: | ---: | --- |',
  '| 1 | 2 | 3 | 4 |',
].join('\n');

const parsedNormal = parseMarkdownPipeTables(normalTableMarkdown);
assert.deepEqual(parsedNormal, [
  {
    headers: ['Left', 'Center', 'Right', 'Default'],
    alignments: ['left', 'center', 'right', null],
    rows: [['1', '2', '3', '4']],
  },
]);
assert.equal(serializeMarkdownPipeTable(parsedNormal[0]), normalTableMarkdown);

// 7. Table without outer pipes and with trailing escaped pipe
const noOuterPipesMarkdown = [
  'A | B\\|',
  '--- | ---',
  '1 | C\\|',
].join('\n');

const parsedNoOuter = parseMarkdownPipeTables(noOuterPipesMarkdown);
assert.deepEqual(parsedNoOuter, [
  {
    headers: ['A', 'B|'],
    alignments: [null, null],
    rows: [['1', 'C|']],
  },
]);

// 8. Complex table round-trip with special characters, literal <br>, real <br>, backslashes, and entities
const complexTableMarkdown = [
  '| Pipe | Backslash | Line Break | Literal Tag | Entities |',
  '| :--- | :---: | ---: | --- | :--- |',
  '| A\\|B | A\\\\B | 第一行<br>第二行 | A&lt;br&gt;B | &amp; &lt; &gt; |',
  '| C\\|D | E\\\\F | 第三行<br/>第四行 | &lt;b&gt;text&lt;/b&gt; | &#65; &#x42; |',
].join('\n');

const parsedComplex = parseMarkdownPipeTables(complexTableMarkdown);
assert.deepEqual(parsedComplex, [
  {
    headers: ['Pipe', 'Backslash', 'Line Break', 'Literal Tag', 'Entities'],
    alignments: ['left', 'center', 'right', null, 'left'],
    rows: [
      ['A|B', 'A\\B', '第一行\n第二行', 'A<br>B', '& < >'],
      ['C|D', 'E\\F', '第三行\n第四行', '<b>text</b>', 'A B'],
    ],
  },
]);

const serializedComplex = serializeMarkdownPipeTable(parsedComplex[0]);
assert.equal(
  serializedComplex,
  [
    '| Pipe | Backslash | Line Break | Literal Tag | Entities |',
    '| :--- | :---: | ---: | --- | :--- |',
    '| A\\|B | A\\\\B | 第一行<br>第二行 | A&lt;br&gt;B | &amp; &lt; &gt; |',
    '| C\\|D | E\\\\F | 第三行<br>第四行 | &lt;b&gt;text&lt;/b&gt; | A B |',
  ].join('\n'),
);

const reParsed = parseMarkdownPipeTables(serializedComplex);
assert.deepEqual(reParsed, parsedComplex);
assert.equal(serializeMarkdownPipeTable(reParsed[0]), serializedComplex);

// 9. MarkdownPipeTable <-> TableGridState Adapter
const baseTable = {
  headers: ['HeaderA', 'HeaderB', 'HeaderC'],
  alignments: ['left', 'center', 'right'],
  rows: [
    ['Row1A', 'Row1B', 'Row1C'],
    ['Row2A', 'Row2B', 'Row2C'],
  ],
};

const gridState = markdownPipeTableToGridState(baseTable);
assert.equal(gridState.rows.length, 3); // row 0 is Header, row 1-2 are body
assert.deepEqual(gridState.columnOrder, ['c0', 'c1', 'c2']);
assert.deepEqual(gridState.alignmentById, { c0: 'left', c1: 'center', c2: 'right' });

const restoredFromState = gridStateToMarkdownPipeTable(gridState);
assert.deepEqual(restoredFromState, baseTable);

// 10. Column Order & Alignment Reordering
const colReorderedState = reorderColumns(gridState, 0, 2);
assert.deepEqual(colReorderedState.columnOrder, ['c1', 'c2', 'c0']);

const colReorderedTable = gridStateToMarkdownPipeTable(colReorderedState);
assert.deepEqual(colReorderedTable.headers, ['HeaderB', 'HeaderC', 'HeaderA']);
assert.deepEqual(colReorderedTable.alignments, ['center', 'right', 'left']);
assert.deepEqual(colReorderedTable.rows, [
  ['Row1B', 'Row1C', 'Row1A'],
  ['Row2B', 'Row2C', 'Row2A'],
]);

// 11. Row Reordering (Free row dragging, row 0 can move)
const rowReorderedState = reorderRows(gridState, 0, 2);
const rowReorderedTable = gridStateToMarkdownPipeTable(rowReorderedState);
assert.deepEqual(rowReorderedTable.headers, ['Row1A', 'Row1B', 'Row1C']);
assert.deepEqual(rowReorderedTable.rows, [
  ['Row2A', 'Row2B', 'Row2C'],
  ['HeaderA', 'HeaderB', 'HeaderC'],
]);

// 12. Row Insert and Delete Mutations
const afterInsertRowBefore = insertRowBefore(gridState, 1);
assert.equal(afterInsertRowBefore.rows.length, 4);
assert.deepEqual(afterInsertRowBefore.rows[1], { c0: '', c1: '', c2: '' });

const afterInsertRowAfter = insertRowAfter(gridState, 1);
assert.equal(afterInsertRowAfter.rows.length, 4);
assert.deepEqual(afterInsertRowAfter.rows[2], { c0: '', c1: '', c2: '' });

const afterDeleteRow = deleteRow(gridState, 1);
assert.equal(afterDeleteRow.rows.length, 2);

// 13. Column Insert and Delete Mutations
const afterInsertColBefore = insertColumnBefore(gridState, 1);
assert.equal(afterInsertColBefore.columnOrder.length, 4);
const newColIdBefore = afterInsertColBefore.columnOrder[1];
assert.equal(afterInsertColBefore.alignmentById[newColIdBefore], null);

const afterInsertColAfter = insertColumnAfter(gridState, 1);
assert.equal(afterInsertColAfter.columnOrder.length, 4);
const newColIdAfter = afterInsertColAfter.columnOrder[2];
assert.equal(afterInsertColAfter.alignmentById[newColIdAfter], null);

const afterDeleteCol = deleteColumn(gridState, 1);
assert.equal(afterDeleteCol.columnOrder.length, 2);
assert.deepEqual(afterDeleteCol.columnOrder, ['c0', 'c2']);
assert.equal(afterDeleteCol.alignmentById.c1, undefined);

// 14. Alignment Mutation
const afterAlign = setAlignment(gridState, 1, 'right');
assert.equal(afterAlign.alignmentById.c1, 'right');

// 15. TableSnapshotHistory (Undo / Redo)
const snapshotHistory = new TableSnapshotHistory();
let currentHistoryState = markdownPipeTableToGridState(baseTable);

// Action 1: Move col 0 -> 2
snapshotHistory.record(currentHistoryState);
currentHistoryState = reorderColumns(currentHistoryState, 0, 2);
assert.deepEqual(currentHistoryState.columnOrder, ['c1', 'c2', 'c0']);

// Action 2: Delete row 1
snapshotHistory.record(currentHistoryState);
currentHistoryState = deleteRow(currentHistoryState, 1);
assert.equal(currentHistoryState.rows.length, 2);

// Action 3: Insert col after 0
snapshotHistory.record(currentHistoryState);
currentHistoryState = insertColumnAfter(currentHistoryState, 0);
assert.equal(currentHistoryState.columnOrder.length, 4);

// Undo 3
currentHistoryState = snapshotHistory.undo(currentHistoryState);
assert.equal(currentHistoryState.columnOrder.length, 3);
assert.equal(currentHistoryState.rows.length, 2);

// Undo 2
currentHistoryState = snapshotHistory.undo(currentHistoryState);
assert.equal(currentHistoryState.rows.length, 3);
assert.deepEqual(currentHistoryState.columnOrder, ['c1', 'c2', 'c0']);

// Undo 1
currentHistoryState = snapshotHistory.undo(currentHistoryState);
assert.deepEqual(currentHistoryState.columnOrder, ['c0', 'c1', 'c2']);

// Redo 1
currentHistoryState = snapshotHistory.redo(currentHistoryState);
assert.deepEqual(currentHistoryState.columnOrder, ['c1', 'c2', 'c0']);

// Redo 2
currentHistoryState = snapshotHistory.redo(currentHistoryState);
assert.equal(currentHistoryState.rows.length, 2);

// Redo 3
currentHistoryState = snapshotHistory.redo(currentHistoryState);
assert.equal(currentHistoryState.columnOrder.length, 4);

// 16. Formula Detector (parseMathFormula)
assert.deepEqual(parseMathFormula('$e^2$'), { isMath: true, formula: 'e^2', displayMode: false });
assert.deepEqual(parseMathFormula('$e^3$'), { isMath: true, formula: 'e^3', displayMode: false });
assert.deepEqual(parseMathFormula('\\(e^2\\)'), { isMath: true, formula: 'e^2', displayMode: false });
assert.deepEqual(parseMathFormula('\\[e^2\\]'), { isMath: true, formula: 'e^2', displayMode: true });
assert.deepEqual(parseMathFormula('$$e^2$$'), { isMath: true, formula: 'e^2', displayMode: true });
assert.deepEqual(parseMathFormula('/(e^2/)'), { isMath: false, formula: '' });
assert.deepEqual(parseMathFormula('$100'), { isMath: false, formula: '' });
assert.deepEqual(parseMathFormula('$100 and $200'), { isMath: false, formula: '' });

// 17. LaTeX Math text normalizer in table preview
assert.equal(normalizeTableMathText('$e^2$'), '\\(e^2\\)');
assert.equal(normalizeTableMathText('\\(e^2\\)'), '\\(e^2\\)');
assert.equal(normalizeTableMathText('$$e^2$$'), '$$e^2$$');
assert.equal(normalizeTableMathText('\\[e^2\\]'), '\\[e^2\\]');
assert.equal(normalizeTableMathText('/(e^2/)'), '/(e^2/)');
assert.equal(normalizeTableMathText('Let $x$ and $y$ be variables'), 'Let \\(x\\) and \\(y\\) be variables');
assert.equal(normalizeTableMathText('$100 and $200'), '$100 and $200');

// 18. Multiple Visual/Source transitions cycle without data drift
let cyclingTable = parsedComplex[0];
for (let cycle = 0; cycle < 5; cycle += 1) {
  const gState = markdownPipeTableToGridState(cyclingTable);
  cyclingTable = gridStateToMarkdownPipeTable(gState);
  const md = serializeMarkdownPipeTable(cyclingTable);
  const reParsedCycle = parseMarkdownPipeTables(md)[0];
  assert.deepEqual(reParsedCycle, parsedComplex[0]);
}

// 19. Fixed Column Visual Coordinates after Reordering
const reorderedColsState = reorderColumns(gridState, 0, 2);
assert.deepEqual(reorderedColsState.columnOrder, ['c1', 'c2', 'c0']);
const reorderedColDefs = buildRevoColumns(reorderedColsState);
assert.deepEqual(reorderedColDefs.map((c) => c.name), ['A', 'B', 'C']); // UI coordinates stay A, B, C!
assert.deepEqual(reorderedColDefs.map((c) => c.prop), ['c1', 'c2', 'c0']);

// 20. Undo Routing (isEditableContext & shouldHandleTableHistory)
assert.equal(isEditableContext([{ tagName: 'INPUT' }]), true);
assert.equal(isEditableContext([{ tagName: 'TEXTAREA' }]), true);
assert.equal(isEditableContext([{ isContentEditable: true }]), true);
assert.equal(isEditableContext([{ classList: { contains: (cls) => cls === 'revo-editor' } }]), true);
assert.equal(isEditableContext([{ tagName: 'DIV', isContentEditable: false, classList: { contains: () => false } }]), false);

assert.equal(shouldHandleTableHistory({ composedPath: () => [{ tagName: 'INPUT' }] }), false);
assert.equal(shouldHandleTableHistory({ composedPath: () => [{ tagName: 'TEXTAREA' }] }), false);
assert.equal(shouldHandleTableHistory({ composedPath: () => [{ tagName: 'DIV', isContentEditable: false, classList: { contains: () => false } }] }), true);

// 21. Production PasteTransactionGuard Testing
const pasteGuard = new PasteTransactionGuard();
assert.equal(pasteGuard.isActive(), false);

const pasteHistory = new TableSnapshotHistory();
const pState = markdownPipeTableToGridState(baseTable);

// 1 paste transaction triggers beforepasteapply and multiple beforeedits -> exactly 1 snapshot recorded
pasteGuard.begin();
assert.equal(pasteGuard.isActive(), true);
pasteHistory.record(pState);

if (!pasteGuard.isActive()) pasteHistory.record(pState);
if (!pasteGuard.isActive()) pasteHistory.record(pState);

pasteGuard.end();
assert.equal(pasteGuard.isActive(), false);
assert.equal(pasteHistory.getUndoDepth(), 1);

// Normal edit afterwards -> records next snapshot
if (!pasteGuard.isActive()) pasteHistory.record(pState);
assert.equal(pasteHistory.getUndoDepth(), 2);

// Fallback timeout test (auto inactive)
pasteGuard.begin(10);
assert.equal(pasteGuard.isActive(), true);
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(pasteGuard.isActive(), false);

// 22. Column Index to Label (A-Z, AA, AB, AZ, BA, ZZ, AAA)
assert.equal(columnIndexToLabel(0), 'A');
assert.equal(columnIndexToLabel(1), 'B');
assert.equal(columnIndexToLabel(25), 'Z');
assert.equal(columnIndexToLabel(26), 'AA');
assert.equal(columnIndexToLabel(27), 'AB');
assert.equal(columnIndexToLabel(51), 'AZ');
assert.equal(columnIndexToLabel(52), 'BA');
assert.equal(columnIndexToLabel(701), 'ZZ');
assert.equal(columnIndexToLabel(702), 'AAA');

// 23. Multiline Raw <-> Markdown Round-trip
const multilineRaw = '第一行\n第二行';
const encodedMultiline = encodeMarkdownCell(multilineRaw);
assert.equal(encodedMultiline, '第一行<br>第二行');
const decodedMultiline = decodeMarkdownCell(encodedMultiline);
assert.equal(decodedMultiline, multilineRaw);

// 24. buildRowDefinitions Multi-line Row Height Calculation
const rowDefState = {
  rows: [
    { c0: 'Single line', c1: 'Also single' },
    { c0: 'Line 1\nLine 2', c1: 'Single' },
    { c0: 'Single', c1: 'Line 1\nLine 2\nLine 3' },
    { c0: new Array(15).fill('line').join('\n'), c1: 'Many lines' },
  ],
  columnOrder: ['c0', 'c1'],
  alignmentById: { c0: 'left', c1: 'left' },
};

const rowDefs = buildRowDefinitions(rowDefState);
assert.equal(rowDefs.length, 4);
assert.equal(rowDefs[0].size, 36); // 1 line -> 36px
assert.equal(rowDefs[1].size, 54); // 2 lines -> 54px
assert.equal(rowDefs[2].size, 72); // 3 lines -> 72px
assert.equal(rowDefs[3].size, 160); // 15 lines -> clamped to max 160px

// 25. RevoTextareaEditor Keydown & IME & Escape Lifecycle
let saveCallCount = 0;
let lastSavedVal = '';
let lastPreventFocus = false;
let closeCallCount = 0;
let lastCloseFocusNext = false;

const editor = new RevoTextareaEditor(
  {},
  (val, preventFocus) => {
    saveCallCount += 1;
    lastSavedVal = val;
    lastPreventFocus = Boolean(preventFocus);
  },
  (focusNext) => {
    closeCallCount += 1;
    lastCloseFocusNext = Boolean(focusNext);
  },
);

let blurCount = 0;

editor.editCell = { val: 'initial text' };
editor.editInput = {
  value: 'initial text',
  blur: () => {
    blurCount += 1;
  },
};

// IME isComposing = true + Enter -> should NOT save or close
saveCallCount = 0;
closeCallCount = 0;
blurCount = 0;
editor.onKeyDown({ key: 'Enter', isComposing: true, preventDefault: () => {}, stopPropagation: () => {} });
assert.equal(saveCallCount, 0);
assert.equal(closeCallCount, 0);
assert.equal(blurCount, 0);

// IME isComposing = false + Enter -> should save and commit
editor.editInput.value = 'updated text';
editor.onKeyDown({ key: 'Enter', isComposing: false, preventDefault: () => {}, stopPropagation: () => {} });
assert.equal(saveCallCount, 1);
assert.equal(lastSavedVal, 'updated text');
assert.equal(lastPreventFocus, false);
assert.equal(blurCount, 1);

// Alt+Enter or Shift+Enter -> should NOT save (inserts newline)
saveCallCount = 0;
editor.onKeyDown({ key: 'Enter', altKey: true, isComposing: false, preventDefault: () => {}, stopPropagation: () => {} });
assert.equal(saveCallCount, 0);
editor.onKeyDown({ key: 'Enter', shiftKey: true, isComposing: false, preventDefault: () => {}, stopPropagation: () => {} });
assert.equal(saveCallCount, 0);

// Tab -> should save with isKeyTab = true
saveCallCount = 0;
blurCount = 0;
editor.onKeyDown({ key: 'Tab', isComposing: false, preventDefault: () => {}, stopPropagation: () => {} });
assert.equal(saveCallCount, 1);
assert.equal(lastPreventFocus, true);
assert.equal(blurCount, 1);

// Escape -> should call closeCallback(false), NOT saveCallback, and NOT actively blur
saveCallCount = 0;
closeCallCount = 0;
blurCount = 0;
editor.onKeyDown({ key: 'Escape', isComposing: false, preventDefault: () => {}, stopPropagation: () => {} });
assert.equal(saveCallCount, 0);
assert.equal(closeCallCount, 1);
assert.equal(lastCloseFocusNext, false);
assert.equal(blurCount, 0); // Escape does not actively blur before closeCallback

// Calling beforeDisconnect during RevoGrid teardown performs blur
editor.beforeDisconnect();
assert.equal(blurCount, 1);

// 26. shouldRecordCellEdit & Cell/Range Edit History Precision
assert.equal(shouldRecordCellEdit({ model: { c0: 'ABC' }, prop: 'c0', val: 'ABC' }), false);
assert.equal(shouldRecordCellEdit({ model: { c0: 'ABC' }, prop: 'c0', val: 'XYZ' }), true);
assert.equal(shouldRecordCellEdit({ model: { c0: '' }, prop: 'c0', val: '' }), false);
assert.equal(shouldRecordCellEdit({ model: { c0: '' }, prop: 'c0', val: '0' }), true);
assert.equal(shouldRecordCellEdit({ model: { c0: 1 }, prop: 'c0', val: '1' }), false);
assert.equal(shouldRecordCellEdit({ model: { c0: '1' }, prop: 'c0', val: 1 }), false);
assert.equal(shouldRecordCellEdit(undefined), true);

const editHistory = new TableSnapshotHistory();
let eState = markdownPipeTableToGridState({ headers: ['H1'], alignments: ['left'], rows: [['ABC']] });

// Edit ABC -> ABC (unchanged) -> does not record snapshot
if (shouldRecordCellEdit({ model: eState.rows[1], prop: 'c0', val: 'ABC' })) {
  editHistory.record(eState);
}
assert.equal(editHistory.getUndoDepth(), 0);

// Edit ABC -> XYZ (changed) -> records 1 snapshot
if (shouldRecordCellEdit({ model: eState.rows[1], prop: 'c0', val: 'XYZ' })) {
  editHistory.record(eState);
  eState.rows[1].c0 = 'XYZ';
}
assert.equal(editHistory.getUndoDepth(), 1);

// Undo restores ABC
eState = editHistory.undo(eState);
assert.equal(eState.rows[1].c0, 'ABC');

// Range edit (non-paste) -> records 1 snapshot
editHistory.record(eState);
assert.equal(editHistory.getUndoDepth(), 1);

// 27. tableGridStateEquals Semantic Equality
const testStateA = markdownPipeTableToGridState(baseTable);
const testStateB = markdownPipeTableToGridState(baseTable); // Different object references, same content
assert.equal(tableGridStateEquals(testStateA, testStateB), true);

// Cell value difference -> false
const diffCellState = setCellValue(testStateA, 1, 0, 'Different');
assert.equal(tableGridStateEquals(testStateA, diffCellState), false);

// Column order difference -> false
const diffColState = reorderColumns(testStateA, 0, 1);
assert.equal(tableGridStateEquals(testStateA, diffColState), false);

// Alignment difference -> false
const diffAlignState = setAlignment(testStateA, 0, 'right');
assert.equal(tableGridStateEquals(testStateA, diffAlignState), false);

// Row count difference -> false
const diffRowState = insertRowAfter(testStateA, 0);
assert.equal(tableGridStateEquals(testStateA, diffRowState), false);

// 28. setCellValue Pure Function
const cellSetState = setCellValue(testStateA, 1, 0, 'NewVal');
assert.equal(cellSetState.rows[1].c0, 'NewVal');
assert.equal(tableGridStateEquals(testStateA, cellSetState), false);

const sameSetState = setCellValue(testStateA, 1, 0, testStateA.rows[1].c0);
assert.equal(tableGridStateEquals(testStateA, sameSetState), true);

// 29. No-op Mutation History Guard Verification
const noopHistory = new TableSnapshotHistory();
let noopState = markdownPipeTableToGridState({ headers: ['OnlyCol'], alignments: ['center'], rows: [['ABC']] });

function applyNoopMutation(mutator) {
  const next = mutator(noopState);
  if (tableGridStateEquals(noopState, next)) {
    return false;
  }
  noopHistory.record(noopState);
  noopState = next;
  return true;
}

// 1. Only 1 column -> deleteColumn is no-op -> Undo depth unchanged (0)
applyNoopMutation((st) => deleteColumn(st, 0));
assert.equal(noopHistory.getUndoDepth(), 0);

// 2. Current center -> setAlignment('center') is no-op -> Undo depth unchanged (0)
applyNoopMutation((st) => setAlignment(st, 0, 'center'));
assert.equal(noopHistory.getUndoDepth(), 0);

// 3. Current center -> setAlignment('right') is changed -> Undo depth becomes 1
applyNoopMutation((st) => setAlignment(st, 0, 'right'));
assert.equal(noopHistory.getUndoDepth(), 1);

// 4. Empty cell clear is no-op -> Undo depth unchanged
let blankState = markdownPipeTableToGridState({ headers: ['H1'], alignments: ['left'], rows: [['']] });
const blankHistory = new TableSnapshotHistory();

function applyBlankMutation(mutator) {
  const next = mutator(blankState);
  if (tableGridStateEquals(blankState, next)) {
    return false;
  }
  blankHistory.record(blankState);
  blankState = next;
  return true;
}

applyBlankMutation((st) => setCellValue(st, 1, 0, ''));
assert.equal(blankHistory.getUndoDepth(), 0);

// 5. Non-empty cell clear -> Undo depth becomes 1 -> Undo restores ABC
let populatedState = markdownPipeTableToGridState({ headers: ['H1'], alignments: ['left'], rows: [['ABC']] });
const popHistory = new TableSnapshotHistory();

function applyPopMutation(mutator) {
  const next = mutator(populatedState);
  if (tableGridStateEquals(populatedState, next)) {
    return false;
  }
  popHistory.record(populatedState);
  populatedState = next;
  return true;
}

applyPopMutation((st) => setCellValue(st, 1, 0, ''));
assert.equal(popHistory.getUndoDepth(), 1);
assert.equal(populatedState.rows[1].c0, '');

populatedState = popHistory.undo(populatedState);
assert.equal(populatedState.rows[1].c0, 'ABC');

// 30. buildCellVNodeKey Unique Reconciliation Keys
const keyMathCell = buildCellVNodeKey(0, 'c1', '$e^2$', true);
const keyTextCell = buildCellVNodeKey(0, 'c2', '戶數占比%', false);
assert.notEqual(keyMathCell, keyTextCell);

const keyMathEdit = buildCellVNodeKey(0, 'c1', '$e^3$', true);
assert.notEqual(keyMathCell, keyMathEdit);

const keyModeSwitch = buildCellVNodeKey(0, 'c1', 'e^2', false);
assert.notEqual(keyMathCell, keyModeSwitch);

// 31. resolveRevoGridTheme Multi-environment Palette Mapping
assert.equal(resolveRevoGridTheme('dark', false), 'darkCompact');
assert.equal(resolveRevoGridTheme('light', true), 'compact');
assert.equal(resolveRevoGridTheme(null, true), 'darkCompact');
assert.equal(resolveRevoGridTheme(null, false), 'compact');

// 32. computeRowDropIndex Calculation & Boundary Testing
assert.equal(computeRowDropIndex(0, 2, 'after', 4), 2);
assert.equal(computeRowDropIndex(3, 1, 'before', 4), 1);
assert.equal(computeRowDropIndex(1, 1, 'before', 4), 1); // no-op
assert.equal(computeRowDropIndex(1, 1, 'after', 4), 1); // no-op
assert.equal(computeRowDropIndex(0, 3, 'after', 4), 3); // last
assert.equal(computeRowDropIndex(3, 0, 'before', 4), 0); // first
assert.equal(computeRowDropIndex(0, 0, 'before', 1), 0); // single row

// 33. Target Column & Row Indices from Selection Range (including single cell B3)
assert.deepEqual(computeTargetColumnIndices({ x: 1, y: 2, x1: 1, y1: 2 }, 1, 4), [1]); // Single cell B3 -> col 1
assert.deepEqual(computeTargetRowIndices({ x: 1, y: 2, x1: 1, y1: 2 }, 2, 5), [2]); // Single cell B3 -> row 2
assert.deepEqual(computeTargetColumnIndices({ x: 0, x1: 2 }, 0, 4), [0, 1, 2]); // Col range
assert.deepEqual(computeTargetColumnIndices({ x: 3, x1: 1 }, 0, 4), [1, 2, 3]);
assert.deepEqual(computeTargetColumnIndices(null, 2, 4), [2]);
assert.deepEqual(computeTargetRowIndices({ y: 1, y1: 3 }, 0, 5), [1, 2, 3]); // Row range
assert.deepEqual(computeTargetRowIndices({ y: 4, y1: 2 }, 0, 5), [2, 3, 4]);
assert.deepEqual(computeTargetRowIndices(null, 4, 5), [4]);

// 34. Column Width Clamping
assert.equal(clampColumnWidth(40), 60);
assert.equal(clampColumnWidth(150), 150);
assert.equal(clampColumnWidth(900), 600);

// 35. Auto Column Width & Auto Row Height Calculation + Dynamic Column Width Effect
const testMockMeasure = (str) => str.length * 10;
const autoFitState = {
  columnOrder: ['c0', 'c1'],
  rows: [
    { c0: 'Short', c1: 'Line 1\nLine 2\nLine 3' },
    { c0: 'This is a very long text to test width calculation', c1: 'Val' },
  ],
  alignmentById: { c0: 'left', c1: 'left' },
};
assert.equal(computeAutoColumnWidth(autoFitState, 0, testMockMeasure), 360);
assert.equal(computeAutoColumnWidth(autoFitState, 1, testMockMeasure), 80);
assert.equal(computeAutoRowHeight(autoFitState, 0, { c0: 140, c1: 140 }, testMockMeasure), 72);
assert.equal(computeAutoRowHeight(autoFitState, 1, { c0: 140, c1: 140 }, testMockMeasure), 108);

// Test auto row definitions when column narrows vs widens
const narrowDefs = buildAutoRowDefinitions(autoFitState, { c0: 60, c1: 60 }, testMockMeasure);
const wideDefs = buildAutoRowDefinitions(autoFitState, { c0: 400, c1: 400 }, testMockMeasure);
assert.ok(narrowDefs[1].size >= wideDefs[1].size); // Narrower column causes more wrapping and larger row height

// 36. Fill Handle Smart Pattern Inference (4 Directions: Down, Up, Right, Left)
assert.deepEqual(computeSmartFillSeries(['1', '2'], 3, 'forward'), ['3', '4', '5']); // Down / Right
assert.deepEqual(computeSmartFillSeries(['2', '3'], 3, 'backward'), ['1', '0', '-1']); // Up / Left
assert.deepEqual(computeSmartFillSeries(['10', '20'], 2, 'forward'), ['30', '40']);
assert.deepEqual(computeSmartFillSeries(['20', '30'], 2, 'backward'), ['10', '0']);
assert.deepEqual(computeSmartFillSeries(['5', '4'], 3, 'forward'), ['3', '2', '1']);
assert.deepEqual(computeSmartFillSeries(['A', 'B'], 4, 'forward'), ['A', 'B', 'A', 'B']);
assert.deepEqual(computeSmartFillSeries(['A', 'B'], 3, 'backward'), ['B', 'A', 'B']);
assert.deepEqual(computeSmartFillSeries(['$e^2$', '$e^3$'], 3, 'forward'), ['$e^2$', '$e^3$', '$e^2$']);
assert.deepEqual(computeSmartFillSeries(['$e^2$', '$e^3$'], 3, 'backward'), ['$e^3$', '$e^2$', '$e^3$']);
assert.deepEqual(computeSmartFillSeries(['Fixed'], 2, 'forward'), ['Fixed', 'Fixed']);
assert.deepEqual(computeSmartFillSeries(['Fixed'], 2, 'backward'), ['Fixed', 'Fixed']);

// 37. Batch Column Alignment Mutation with Single Undo Snapshot
let multiColState = markdownPipeTableToGridState({
  headers: ['A', 'B', 'C'],
  alignments: ['left', 'left', 'left'],
  rows: [['1', '2', '3']],
});
const batchHistory = new TableSnapshotHistory();
function applyBatchMutation(mutator) {
  const next = mutator(multiColState);
  if (tableGridStateEquals(multiColState, next)) return false;
  batchHistory.record(multiColState);
  multiColState = next;
  return true;
}
applyBatchMutation((st) => setBatchAlignment(st, [0, 1, 2], 'center'));
assert.equal(batchHistory.getUndoDepth(), 1);
assert.equal(multiColState.alignmentById.c0, 'center');
assert.equal(multiColState.alignmentById.c1, 'center');
assert.equal(multiColState.alignmentById.c2, 'center');

multiColState = batchHistory.undo(multiColState);
assert.equal(multiColState.alignmentById.c0, 'left');
assert.equal(multiColState.alignmentById.c1, 'left');
assert.equal(multiColState.alignmentById.c2, 'left');

// 38. Targeted vs Global Auto Row Height (Set<number>)
const threeRowState = {
  columnOrder: ['c0'],
  rows: [
    { c0: 'Short' },
    { c0: 'This is a very long text to test row wrapping behavior' },
    { c0: 'Also short' },
  ],
  alignmentById: { c0: 'left' },
};
const baseDefsThree = buildRowDefinitions(threeRowState);
assert.equal(baseDefsThree[0].size, 36);
assert.equal(baseDefsThree[1].size, 36);
assert.equal(baseDefsThree[2].size, 36);

// Targeting only row 1:
const row1OnlyDefs = buildEffectiveRowDefinitions(threeRowState, { c0: 100 }, new Set([1]), testMockMeasure);
assert.equal(row1OnlyDefs[0].size, 36); // unaffected
assert.equal(row1OnlyDefs[1].size, 144); // row 1 auto-sized
assert.equal(row1OnlyDefs[2].size, 36); // unaffected (remains base 36)

// Targeting all rows:
const allRowDefs = buildEffectiveRowDefinitions(threeRowState, { c0: 100 }, new Set([0, 1, 2]), testMockMeasure);
assert.equal(allRowDefs[0].size, 36);
assert.equal(allRowDefs[1].size, 144);
assert.equal(allRowDefs[2].size, 54); // auto-sized with wrapping to 54

// 39. Remap Auto-sized Rows on Structure Change (Insert, Delete, Reorder)
assert.deepEqual(Array.from(remapAutoSizedRowsOnInsert(new Set([1, 3]), 1)), [2, 4]);
assert.deepEqual(Array.from(remapAutoSizedRowsOnDelete(new Set([1, 3]), 1)), [2]);
assert.deepEqual(Array.from(remapAutoSizedRowsOnReorder(new Set([0, 3]), 0, 2)), [3, 2]);
assert.deepEqual(Array.from(remapAutoSizedRowsOnReorder(new Set([2, 3]), 2, 0)), [3, 0]);

console.log('Validated Markdown pipe table parsing, alignments, cell codec, HTML entities, RevoGrid GridState adapter, snapshot history, undo routing, and round-trip serialization.');
