import assert from 'node:assert/strict';
import {
  alignmentSeparator,
  decodeMarkdownCell,
  encodeMarkdownCell,
  parseAlignment,
  parseMarkdownPipeTables,
  serializeMarkdownPipeTable,
} from '../../frontend/app/features/table-controller.ts';

// 1. Markdown cell codec unit tests
assert.equal(decodeMarkdownCell('A\\|B'), 'A|B');
assert.equal(decodeMarkdownCell('A\\\\B'), 'A\\B');
assert.equal(decodeMarkdownCell('第一行<br>第二行'), '第一行\n第二行');
assert.equal(decodeMarkdownCell('第一行<br/>第二行'), '第一行\n第二行');
assert.equal(decodeMarkdownCell('第一行<br />第二行'), '第一行\n第二行');
assert.equal(
  decodeMarkdownCell('\\*bold\\* \\_italic\\_ \\[link\\] \\!warn \\`code\\`'),
  '*bold* _italic_ [link] !warn `code`',
);
assert.equal(decodeMarkdownCell('&amp; &lt; &gt; &quot; &#39;'), '& < > " \'');

assert.equal(encodeMarkdownCell('A|B'), 'A\\|B');
assert.equal(encodeMarkdownCell('A\\B'), 'A\\\\B');
assert.equal(encodeMarkdownCell('第一行\n第二行'), '第一行<br>第二行');
assert.equal(
  encodeMarkdownCell('*bold* _italic_ [link] !warn `code`'),
  '\\*bold\\* \\_italic\\_ \\[link\\] \\!warn \\`code\\`',
);

// 2. Alignment parsing and formatting
assert.equal(parseAlignment(':---'), 'left');
assert.equal(parseAlignment(':---:'), 'center');
assert.equal(parseAlignment('---:'), 'right');
assert.equal(parseAlignment('---'), null);
assert.equal(parseAlignment('invalid'), undefined);

assert.equal(alignmentSeparator('left'), ':---');
assert.equal(alignmentSeparator('center'), ':---:');
assert.equal(alignmentSeparator('right'), '---:');
assert.equal(alignmentSeparator(null), '---');

// 3. Normal table with all alignments
const normalTableMarkdown = `| Left | Center | Right | Default |
| :--- | :---: | ---: | --- |
| 1 | 2 | 3 | 4 |`;

const parsedNormal = parseMarkdownPipeTables(normalTableMarkdown);
assert.deepEqual(parsedNormal, [
  {
    headers: ['Left', 'Center', 'Right', 'Default'],
    alignments: ['left', 'center', 'right', null],
    rows: [['1', '2', '3', '4']],
  },
]);
assert.equal(serializeMarkdownPipeTable(parsedNormal[0]), normalTableMarkdown);

// 4. Table with special characters, escaped pipes, backslashes, <br>, <br/>, and markdown symbols
const complexTableMarkdown = [
  '| Pipe | Backslash | Line Break | Symbols |',
  '| :--- | :---: | ---: | --- |',
  '| A\\|B | A\\\\B | 第一行<br>第二行 | \\*star\\* \\_sub\\_ |',
  '| C\\|D | E\\\\F | 第三行<br/>第四行 | \\[link\\] \\! \\`code\\` |',
].join('\n');

const parsedComplex = parseMarkdownPipeTables(complexTableMarkdown);
assert.deepEqual(parsedComplex, [
  {
    headers: ['Pipe', 'Backslash', 'Line Break', 'Symbols'],
    alignments: ['left', 'center', 'right', null],
    rows: [
      ['A|B', 'A\\B', '第一行\n第二行', '*star* _sub_'],
      ['C|D', 'E\\F', '第三行\n第四行', '[link] ! `code`'],
    ],
  },
]);

// 5. Round-trip: serialize(parse(markdown))
const serializedComplex = serializeMarkdownPipeTable(parsedComplex[0]);
assert.equal(
  serializedComplex,
  [
    '| Pipe | Backslash | Line Break | Symbols |',
    '| :--- | :---: | ---: | --- |',
    '| A\\|B | A\\\\B | 第一行<br>第二行 | \\*star\\* \\_sub\\_ |',
    '| C\\|D | E\\\\F | 第三行<br>第四行 | \\[link\\] \\! \\`code\\` |',
  ].join('\n'),
);

const reParsed = parseMarkdownPipeTables(serializedComplex);
assert.deepEqual(reParsed, parsedComplex);
assert.equal(serializeMarkdownPipeTable(reParsed[0]), serializedComplex);

console.log('Validated Markdown pipe table parsing, alignments, cell codec, and round-trip serialization.');
