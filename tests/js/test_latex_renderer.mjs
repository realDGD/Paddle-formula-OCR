import assert from 'node:assert/strict';
import { createLatexRenderer } from '../../frontend/app/features/latex-renderer.js';

const eventTarget = new EventTarget();
globalThis.window = Object.assign(eventTarget, {
  MathJax: {},
  clearTimeout,
  setTimeout,
});

const preview = {
  innerHTML: '',
  querySelector: () => null,
  textContent: '',
};
const visualPreview = {
  innerHTML: '',
  querySelector: () => null,
  textContent: '',
};
const status = { textContent: '', title: '' };
const visualStatus = { textContent: '', title: '' };
const nodes = new Map([
  ['#latex-preview', preview],
  ['#visual-formula-preview', visualPreview],
  ['#render-status', status],
  ['#visual-render-status', visualStatus],
]);
globalThis.document = {
  querySelector: (selector) => nodes.get(selector) || null,
};

let typesetCalls = 0;
const renderer = createLatexRenderer({ getLatexValue: () => String.raw`x^2` });
const pendingRender = renderer.render();

assert.equal(status.textContent, '');
assert.equal(preview.textContent, '');
assert.doesNotMatch(preview.innerHTML, /公式渲染失败/);

window.MathJax.typesetPromise = async (targets) => {
  typesetCalls += 1;
  assert.deepEqual(targets, [preview, visualPreview]);
};
window.dispatchEvent(new Event('formula-ocr-mathjax-ready'));
await pendingRender;

assert.equal(typesetCalls, 1);
assert.equal(status.textContent, '');
assert.doesNotMatch(preview.innerHTML, /MathJax 尚未加载/);
