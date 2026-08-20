import assert from 'node:assert/strict';

const eventTarget = new EventTarget();
globalThis.window = Object.assign(eventTarget, {
  MathJax: {},
  clearTimeout,
  setTimeout,
});

const {
  mathJaxRuntime,
  mathJaxToMathML,
  typesetMathJax,
  waitForMathJax,
} = await import('../../frontend/app/core/mathjax-runtime.ts');

const readiness = waitForMathJax();
window.MathJax.typesetPromise = async () => undefined;
window.MathJax.tex2mmlPromise = async (latex) => `<math>${latex}</math>`;
window.dispatchEvent(new Event('formula-ocr-mathjax-ready'));
assert.equal(await readiness, window.MathJax);

let releaseFirst;
const calls = [];
window.MathJax.typesetPromise = async ([target]) => {
  calls.push(target.id);
  if (target.id === 'first') {
    await new Promise((resolve) => {
      releaseFirst = resolve;
    });
  }
  if (target.id === 'broken') throw new Error('dynamic font failed');
};

const first = typesetMathJax([{ id: 'first' }]);
const second = typesetMathJax([{ id: 'second' }]);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.deepEqual(calls, ['first']);
releaseFirst();
await Promise.all([first, second]);
assert.deepEqual(calls, ['first', 'second']);

await assert.rejects(
  typesetMathJax([{ id: 'broken' }]),
  /dynamic font failed/,
);
await typesetMathJax([{ id: 'recovered' }]);
assert.deepEqual(calls, ['first', 'second', 'broken', 'recovered']);

assert.equal(
  await mathJaxToMathML('x^2', { display: true }),
  '<math>x^2</math>',
);
assert.equal(globalThis.FormulaOcrMathJaxRuntime, mathJaxRuntime);
