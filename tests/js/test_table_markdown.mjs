import assert from 'node:assert/strict';
import {
  alignmentSeparator,
  buildJspreadsheetOptions,
  decodeHtmlEntities,
  decodeMarkdownCell,
  encodeMarkdownCell,
  insertColumnAt,
  insertRowAt,
  markdownPipeTableToSpreadsheetData,
  moveAlignment,
  normalizeTableMathText,
  parseAlignment,
  parseMarkdownPipeTables,
  removeColumnAt,
  removeRowAt,
  reorderColumnsByOrder,
  serializeMarkdownPipeTable,
  spreadsheetDataToMarkdownPipeTable,
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

// 9. Jspreadsheet CE 2D Data Adapter (Markdown -> TableModel -> Jspreadsheet data -> TableModel -> Markdown)
const testTable = parsedComplex[0];
const spreadsheetData = markdownPipeTableToSpreadsheetData(testTable);

// Row 0 is headers, Row 1..N are data rows
assert.deepEqual(spreadsheetData[0], ['Pipe', 'Backslash', 'Line Break', 'Literal Tag', 'Entities']);
assert.deepEqual(spreadsheetData[1], ['A|B', 'A\\B', '第一行\n第二行', 'A<br>B', '& < >']);
assert.deepEqual(spreadsheetData[2], ['C|D', 'E\\F', '第三行\n第四行', '<b>text</b>', 'A B']);

// Jspreadsheet 2D data back to MarkdownPipeTable
const restoredTable = spreadsheetDataToMarkdownPipeTable(spreadsheetData, testTable.alignments);
assert.deepEqual(restoredTable, testTable);

// Reserializing matches original Markdown
const reserialized = serializeMarkdownPipeTable(restoredTable);
assert.equal(reserialized, serializedComplex);

// 10. Free Row Moving (Moving Row 0 Header to Row 2 makes Row 1 the new Markdown Header)
const beforeRowMove = [
  ['Header1', 'Header2'],
  ['RowA1', 'RowA2'],
  ['RowB1', 'RowB2'],
];
// Move row 0 to index 2
const afterRowMove = [
  ['RowA1', 'RowA2'],
  ['RowB1', 'RowB2'],
  ['Header1', 'Header2'],
];
const movedRowTable = spreadsheetDataToMarkdownPipeTable(afterRowMove, ['left', 'right']);
assert.deepEqual(movedRowTable.headers, ['RowA1', 'RowA2']);
assert.deepEqual(movedRowTable.rows, [
  ['RowB1', 'RowB2'],
  ['Header1', 'Header2'],
]);

// 11. moveAlignment & Column Dragging Synchronization
const originalAlignments = ['left', 'center', 'right'];
const movedAlignments = moveAlignment(originalAlignments, 0, 2);
assert.deepEqual(movedAlignments, ['center', 'right', 'left']);

const movedBackAlignments = moveAlignment(movedAlignments, 2, 0);
assert.deepEqual(movedBackAlignments, ['left', 'center', 'right']);

// 12. Selection-aware Column & Row insertion/deletion
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

// Reorder columns by permutation order [1, 2, 0] (A B C -> B C A)
const permutedCols = reorderColumnsByOrder(baseTable, [1, 2, 0]);
assert.deepEqual(permutedCols.headers, ['B', 'C', 'A']);
assert.deepEqual(permutedCols.alignments, ['center', 'right', 'left']);
assert.deepEqual(permutedCols.rows, [
  ['2', '3', '1'],
  ['5', '6', '4'],
]);

// 13. LaTeX Math text normalizer in table cells
assert.equal(normalizeTableMathText('$e^2$'), '\\(e^2\\)');
assert.equal(normalizeTableMathText('\\(e^2\\)'), '\\(e^2\\)');
assert.equal(normalizeTableMathText('$$e^2$$'), '$$e^2$$');
assert.equal(normalizeTableMathText('\\[e^2\\]'), '\\[e^2\\]');
assert.equal(normalizeTableMathText('/(e^2/)'), '/(e^2/)');
assert.equal(normalizeTableMathText('Let $x$ and $y$ be variables'), 'Let \\(x\\) and \\(y\\) be variables');
assert.equal(normalizeTableMathText('$100 and $200'), '$100 and $200');

// 14. Multiple Visual/Source transitions cycle without data drift
let cyclingTable = parsedComplex[0];
for (let cycle = 0; cycle < 5; cycle += 1) {
  const data = markdownPipeTableToSpreadsheetData(cyclingTable);
  cyclingTable = spreadsheetDataToMarkdownPipeTable(data, cyclingTable.alignments);
  const md = serializeMarkdownPipeTable(cyclingTable);
  const reParsedCycle = parseMarkdownPipeTables(md)[0];
  assert.deepEqual(reParsedCycle, parsedComplex[0]);
}

// 15. Jspreadsheet CE Options configuration verification
const jssOptions = buildJspreadsheetOptions({
  data: spreadsheetData,
  alignments: ['left', 'center', 'right', null, 'left'],
});
assert.equal(jssOptions.worksheets.length, 1);
const wsConfig = jssOptions.worksheets[0];
assert.equal(wsConfig.parseFormulas, false);
assert.equal(wsConfig.rowDrag, true);
assert.equal(wsConfig.columnDrag, true);
assert.equal(wsConfig.allowInsertRow, true);
assert.equal(wsConfig.allowInsertColumn, true);
assert.equal(wsConfig.allowDeleteRow, true);
assert.equal(wsConfig.allowDeleteColumn, true);
assert.equal(wsConfig.tableOverflow, true);
assert.equal(wsConfig.tableHeight, '420px');
assert.equal(wsConfig.columns.length, 5);
assert.deepEqual(wsConfig.columns[0], { align: 'left' });
assert.deepEqual(wsConfig.columns[1], { align: 'center' });
assert.deepEqual(wsConfig.columns[2], { align: 'right' });
assert.deepEqual(wsConfig.columns[3], { align: 'center' }); // null fallback to center
assert.deepEqual(wsConfig.columns[4], { align: 'left' });
assert.equal(typeof wsConfig.contextMenu, 'function');

console.log('Validated Markdown pipe table parsing, alignments, cell codec, HTML entities, Jspreadsheet CE spreadsheet adapter, and round-trip serialization.');
