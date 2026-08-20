import assert from 'node:assert/strict';
import { parseMarkdownPipeTables } from '../../frontend/app/features/table-controller.ts';

assert.deepEqual(
  parseMarkdownPipeTables(`| Name | Value |
| :--- | ---: |
| A\\|B | &amp; |`),
  [{ headers: ['Name', 'Value'], rows: [['A|B', '&amp;']] }],
);

console.log('Validated Markdown pipe table parsing.');
