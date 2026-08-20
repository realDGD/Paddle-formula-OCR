import assert from 'node:assert/strict';
import {
  alignmentSeparator,
  buildTabulatorSpreadsheetOptions,
  decodeHtmlEntities,
  decodeMarkdownCell,
  encodeMarkdownCell,
  insertColumnAt,
  insertRowAt,
  markdownPipeTableToSpreadsheetData,
  normalizeTableMathText,
  parseAlignment,
  parseMarkdownPipeTables,
  removeColumnAt,
  removeRowAt,
  reorderColumns,
  reorderColumnsByOrder,
  reorderRows,
  serializeMarkdownPipeTable,
  spreadsheetDataToMarkdownPipeTable,
  spreadsheetFieldToIndex,
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

// 9. Tabulator Spreadsheet 2D Data Adapter (Markdown -> TableModel -> Tabulator data -> TableModel -> Markdown)
const testTable = parsedComplex[0];
const spreadsheetData = markdownPipeTableToSpreadsheetData(testTable);

// Headers and rows are not confused: Row 0 is headers, Row 1..N are data rows
assert.deepEqual(spreadsheetData[0], ['Pipe', 'Backslash', 'Line Break', 'Literal Tag', 'Entities']);
assert.deepEqual(spreadsheetData[1], ['A|B', 'A\\B', '第一行\n第二行', 'A<br>B', '& < >']);
assert.deepEqual(spreadsheetData[2], ['C|D', 'E\\F', '第三行\n第四行', '<b>text</b>', 'A B']);

// Tabulator 2D data back to MarkdownPipeTable
const restoredTable = spreadsheetDataToMarkdownPipeTable(spreadsheetData, testTable.alignments);
assert.deepEqual(restoredTable, testTable);

// Reserializing matches original Markdown
const reserialized = serializeMarkdownPipeTable(restoredTable);
assert.equal(reserialized, serializedComplex);

// 10. Alignment preservation & field indexing
assert.equal(spreadsheetFieldToIndex('A'), 0);
assert.equal(spreadsheetFieldToIndex('B'), 1);
assert.equal(spreadsheetFieldToIndex('E'), 4);
assert.deepEqual(restoredTable.alignments, ['left', 'center', 'right', null, 'left']);

// 11. Selection-aware Column & Row insertion/deletion and reordering
const baseTable = {
  headers: ['A', 'B', 'C'],
  alignments: ['left', 'center', 'right'],
  rows: [
    ['1', '2', '3'],
    ['4', '5', '6'],
  ],
};

// Insert row at top (index 0)
const rowAtTop = insertRowAt(baseTable, 0);
assert.equal(rowAtTop.rows.length, 3);
assert.deepEqual(rowAtTop.rows[0], ['', '', '']);
assert.deepEqual(rowAtTop.rows[1], ['1', '2', '3']);

// Insert row at middle (index 1)
const rowAtMid = insertRowAt(baseTable, 1);
assert.equal(rowAtMid.rows.length, 3);
assert.deepEqual(rowAtMid.rows[1], ['', '', '']);
assert.deepEqual(rowAtMid.rows[2], ['4', '5', '6']);

// Remove row at middle
const removedMid = removeRowAt(rowAtMid, 1);
assert.deepEqual(removedMid.rows, baseTable.rows);

// Insert column at middle (index 1)
const colAtMid = insertColumnAt(baseTable, 1);
assert.deepEqual(colAtMid.headers, ['A', '', 'B', 'C']);
assert.deepEqual(colAtMid.alignments, ['left', null, 'center', 'right']);
assert.deepEqual(colAtMid.rows, [
  ['1', '', '2', '3'],
  ['4', '', '5', '6'],
]);

// Remove column at middle
const removedCol = removeColumnAt(colAtMid, 1);
assert.deepEqual(removedCol.headers, ['A', 'B', 'C']);
assert.deepEqual(removedCol.alignments, ['left', 'center', 'right']);
assert.deepEqual(removedCol.rows, baseTable.rows);

// Row insertion off-by-one verification with header + rowA + rowB
const testHeaderTable = {
  headers: ['H1', 'H2'],
  alignments: ['left', 'right'],
  rows: [
    ['A1', 'A2'], // rowPos 2 (rowA)
    ['B1', 'B2'], // rowPos 3 (rowB)
  ],
};

// 在 rowA (rowPos 2) 上方插入 -> insertRowAt(table, 0) -> blank, rowA, rowB
const aboveRowA = insertRowAt(testHeaderTable, 2 - 2);
assert.deepEqual(aboveRowA.rows, [
  ['', ''],
  ['A1', 'A2'],
  ['B1', 'B2'],
]);

// 在 rowA (rowPos 2) 下方插入 -> insertRowAt(table, 1) -> rowA, blank, rowB
const belowRowA = insertRowAt(testHeaderTable, 2 - 1);
assert.deepEqual(belowRowA.rows, [
  ['A1', 'A2'],
  ['', ''],
  ['B1', 'B2'],
]);

// 在 rowB (rowPos 3) 上方插入 -> insertRowAt(table, 1) -> rowA, blank, rowB
const aboveRowB = insertRowAt(testHeaderTable, 3 - 2);
assert.deepEqual(aboveRowB.rows, [
  ['A1', 'A2'],
  ['', ''],
  ['B1', 'B2'],
]);

// 在 rowB (rowPos 3) 下方插入 -> insertRowAt(table, 2) -> rowA, rowB, blank
const belowRowB = insertRowAt(testHeaderTable, 3 - 1);
assert.deepEqual(belowRowB.rows, [
  ['A1', 'A2'],
  ['B1', 'B2'],
  ['', ''],
]);

// Reorder columns by permutation order [1, 2, 0] (A B C -> B C A)
const permutedCols = reorderColumnsByOrder(baseTable, [1, 2, 0]);
assert.deepEqual(permutedCols.headers, ['B', 'C', 'A']);
assert.deepEqual(permutedCols.alignments, ['center', 'right', 'left']);
assert.deepEqual(permutedCols.rows, [
  ['2', '3', '1'],
  ['5', '6', '4'],
]);

// Reorder rows (0 -> 1)
const reorderedRows = reorderRows(baseTable, 0, 1);
assert.deepEqual(reorderedRows.rows, [
  ['4', '5', '6'],
  ['1', '2', '3'],
]);

// 12. LaTeX Math text normalizer in table cells
assert.equal(normalizeTableMathText('$e^2$'), '\\(e^2\\)');
assert.equal(normalizeTableMathText('\\(e^2\\)'), '\\(e^2\\)');
assert.equal(normalizeTableMathText('$$e^2$$'), '$$e^2$$');
assert.equal(normalizeTableMathText('\\[e^2\\]'), '\\[e^2\\]');
assert.equal(normalizeTableMathText('/(e^2/)'), '/(e^2/)');
assert.equal(normalizeTableMathText('Let $x$ and $y$ be variables'), 'Let \\(x\\) and \\(y\\) be variables');
assert.equal(normalizeTableMathText('$100 and $200'), '$100 and $200');

// 13. Multiple Visual/Source transitions cycle without data drift
let cyclingTable = parsedComplex[0];
for (let cycle = 0; cycle < 5; cycle += 1) {
  const data = markdownPipeTableToSpreadsheetData(cyclingTable);
  cyclingTable = spreadsheetDataToMarkdownPipeTable(data, cyclingTable.alignments);
  const md = serializeMarkdownPipeTable(cyclingTable);
  const reParsedCycle = parseMarkdownPipeTables(md)[0];
  assert.deepEqual(reParsedCycle, parsedComplex[0]);
}

// 14. Tabulator Spreadsheet Options configuration verification
const tabOptions = buildTabulatorSpreadsheetOptions({
  data: spreadsheetData,
  getAlignments: () => ['left', 'center', 'right', null, 'left'],
});
assert.equal(tabOptions.spreadsheet, true);
assert.equal(tabOptions.spreadsheetRows, 3);
assert.equal(tabOptions.spreadsheetColumns, 5);
assert.equal(tabOptions.spreadsheetOutputFull, true);
assert.equal(tabOptions.movableRows, true);
assert.equal(tabOptions.movableColumns, true);
assert.equal(tabOptions.selectableRange, 1);
assert.equal(tabOptions.selectableRangeColumns, true);
assert.equal(tabOptions.selectableRangeRows, true);
assert.equal(tabOptions.selectableRangeClearCells, true);
assert.equal(tabOptions.clipboard, true);
assert.equal(tabOptions.clipboardCopyRowRange, 'range');
assert.equal(tabOptions.clipboardPasteParser, 'range');
assert.equal(tabOptions.clipboardPasteAction, 'range');
assert.deepEqual(tabOptions.clipboardCopyConfig, { rowHeaders: false, columnHeaders: false });
assert.equal(tabOptions.clipboardCopyStyled, false);
assert.equal(tabOptions.history, true);
assert.equal(tabOptions.editTriggerEvent, 'dblclick');
assert.deepEqual(tabOptions.rowHeader.resizable, false);
assert.deepEqual(tabOptions.rowHeader.frozen, true);
assert.deepEqual(tabOptions.rowHeader.hozAlign, 'center');
assert.equal(typeof tabOptions.rowHeader.formatter, 'function');
assert.deepEqual(tabOptions.rowHeader.field, 'rownum');
assert.deepEqual(tabOptions.rowHeader.accessorClipboard, 'rownum');
assert.deepEqual(tabOptions.rowHeader.rowHandle, true);
assert.ok(Array.isArray(tabOptions.rowHeader.contextMenu));
assert.equal(tabOptions.spreadsheetColumnDefinition.editor, 'textarea');
assert.equal(tabOptions.spreadsheetColumnDefinition.headerSort, false);
assert.equal(tabOptions.spreadsheetColumnDefinition.resizable, true);
assert.ok(Array.isArray(tabOptions.spreadsheetColumnDefinition.contextMenu));
assert.ok(Array.isArray(tabOptions.spreadsheetColumnDefinition.headerContextMenu));

console.log('Validated Markdown pipe table parsing, alignments, cell codec, HTML entities, Tabulator spreadsheet adapter, and round-trip serialization.');
