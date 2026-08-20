import assert from 'node:assert/strict';
import {
  analyzeLatexFences,
  expectedRightDelimiter,
} from '../../frontend/latex-fence-analyzer.mts';

const paired = analyzeLatexFences(String.raw`\left(x - 1\right)`);
assert.equal(paired.pairs, 1);
assert.equal(paired.unmatched.length, 0);
assert.deepEqual(
  paired.tokens.map((token) => [token.role, token.delimiter, token.pairId, token.depth]),
  [
    ['left', '(', 1, 0],
    ['right', ')', 1, 0],
  ],
);

const nested = analyzeLatexFences(
  String.raw`\left(a + \left[b\right]\right)`,
);
assert.equal(nested.pairs, 2);
assert.equal(nested.unmatched.length, 0);
assert.deepEqual(
  nested.tokens.map((token) => token.depth),
  [0, 1, 1, 0],
);

const missingRightSource = String.raw`\left(x - 1\right)\left(x + 3`;
const missingRight = analyzeLatexFences(missingRightSource);
assert.equal(missingRight.pairs, 1);
assert.equal(missingRight.unmatched.length, 1);
assert.equal(missingRight.unmatched[0].unmatched, 'missing-right');
assert.equal(
  missingRightSource.slice(missingRight.unmatched[0].from, missingRight.unmatched[0].to),
  String.raw`\left(`,
);

const extraRightSource = String.raw`x + 1\right)`;
const extraRight = analyzeLatexFences(extraRightSource);
assert.equal(extraRight.unmatched.length, 1);
assert.equal(extraRight.unmatched[0].unmatched, 'extra-right');
assert.equal(
  extraRightSource.slice(extraRight.unmatched[0].from, extraRight.unmatched[0].to),
  String.raw`\right)`,
);

const ignored = analyzeLatexFences(
  String.raw`\leftarrow % \left(
\verb|\right)|`,
);
assert.equal(ignored.tokens.length, 0);

const invisible = analyzeLatexFences(
  String.raw`\left.\frac{\mathrm{d}f}{\mathrm{d}x}\right|_{x=0}`,
);
assert.equal(invisible.unmatched.length, 0);
assert.deepEqual(invisible.tokens.map((token) => token.delimiter), ['.', '|']);

const intentionallyMixed = analyzeLatexFences(String.raw`\left(x\right]`);
assert.equal(intentionallyMixed.unmatched.length, 0);
assert.equal(expectedRightDelimiter('('), ')');
assert.equal(expectedRightDelimiter('\\langle'), '\\rangle');
assert.equal(expectedRightDelimiter('.'), '.');

console.log('Validated LaTeX left/right fence pairing.');
