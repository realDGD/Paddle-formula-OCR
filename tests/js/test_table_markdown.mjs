import assert from 'node:assert/strict';
import {
  alignmentSeparator,
  buildRevoColumns,
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
  normalizeTableMathText,
  parseAlignment,
  parseMarkdownPipeTables,
  parseMathFormula,
  reorderColumns,
  reorderRows,
  serializeMarkdownPipeTable,
  setAlignment,
  shouldHandleTableHistory,
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

// 21. Paste Transaction History Deduplication Simulation
const pasteHistory = new TableSnapshotHistory();
let pState = markdownPipeTableToGridState(baseTable);
let pasteInProgress = false;

function triggerBeforePaste() {
  pasteInProgress = true;
  pasteHistory.record(pState);
}

function triggerBeforeEdit() {
  if (!pasteInProgress) {
    pasteHistory.record(pState);
  }
}

function triggerAfterPaste() {
  pasteInProgress = false;
}

// 1 paste transaction triggers beforepasteapply and multiple beforeedits -> exactly 1 snapshot recorded
triggerBeforePaste();
triggerBeforeEdit();
triggerBeforeEdit();
triggerAfterPaste();
assert.equal(pasteHistory.getUndoDepth(), 1);

// Normal edit afterwards -> records next snapshot
triggerBeforeEdit();
assert.equal(pasteHistory.getUndoDepth(), 2);

console.log('Validated Markdown pipe table parsing, alignments, cell codec, HTML entities, RevoGrid GridState adapter, snapshot history, undo routing, and round-trip serialization.');
