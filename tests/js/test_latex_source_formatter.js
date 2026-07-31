'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const formatter = require('../../static/latex-source-formatter.js');
const tools = require('../../static/formula-tools.js');
const mathJaxProfile = require('../../static/vendor/mathjax/formula-ocr-profile.js');

assert.deepEqual(
  formatter.format(String.raw`a+b=\frac{c}{d}`),
  {
    source: String.raw`a+b=\frac{c}{d}`,
    formatted: String.raw`a + b = \frac{c}{d}`,
    changed: true,
    safe: true,
    status: 'formatted',
  },
);

assert.equal(
  formatter.format(String.raw`a*-b`).formatted,
  String.raw`a * -b`,
);
assert.equal(
  formatter.format(String.raw`r\cos\theta`).formatted,
  String.raw`r \cos \theta`,
);
assert.equal(
  formatter.format(String.raw`\alpha\beta+\nabla\psi`).formatted,
  String.raw`\alpha \beta + \nabla \psi`,
);
assert.equal(
  formatter.format(String.raw`\int\limits_a^b`).formatted,
  String.raw`\int\limits_a^b`,
);
assert.equal(
  formatter.format(String.raw`\int f(x)\,\mathrm{d}x`).formatted,
  String.raw`\int f(x)\,\mathrm{d}x`,
);
assert.equal(
  formatter.format(String.raw`\text{two  real roots}+x`).formatted,
  String.raw`\text{two  real roots} + x`,
);
assert.equal(
  formatter.format(String.raw`\ce{SO4^2- + Ba^2+ -> BaSO4 v}`).formatted,
  String.raw`\ce{SO4^2- + Ba^2+ -> BaSO4 v}`,
);
assert.equal(
  formatter.format(String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix}`).formatted,
  String.raw`\begin{pmatrix}
  a & b \\
  c & d
\end{pmatrix}`,
);
assert.equal(
  formatter.format(String.raw`\begin{array}{l}a=b\\c=d\end{array}`).formatted,
  String.raw`\begin{array}{l}
  a = b \\
  c = d
\end{array}`,
);
assert.equal(
  formatter.format(
    String.raw`\left.\begin{matrix}a\subset\beta\\b\subset\beta\end{matrix}\right\}\Rightarrow a\parallel b`,
  ).formatted,
  String.raw`\left.\begin{matrix}
  a \subset \beta \\
  b \subset \beta
\end{matrix}\right\} \Rightarrow a \parallel b`,
);
assert.equal(
  formatter.format(
    String.raw`\begin{array}{l}a=b\\\left\{\begin{matrix}c>0\\c<0\end{matrix}\right.\end{array}`,
  ).formatted,
  String.raw`\begin{array}{l}
  a = b \\
  \left\{\begin{matrix}
    c > 0 \\
    c < 0
  \end{matrix}\right.
\end{array}`,
);

assert.equal(formatter.format(String.raw`x+{y`).safe, false);
assert.equal(formatter.format(String.raw`x+y% protected`).safe, false);
assert.equal(
  formatter.format(String.raw`\begin{array}a&b\end{array}`).status,
  'malformed-environment-header',
);
assert.equal(
  formatter.hasEquivalentTokens(
    String.raw`\sum_{1}^{2}`,
    String.raw`{\textstyle\sum_{1}^{2}}`,
  ),
  false,
);
assert.equal(
  formatter.hasEquivalentTokens(
    String.raw`\int f(x)\mathrm{d}x`,
    String.raw`\int f(x)\,\mathrm{d}x`,
  ),
  false,
);
assert.equal(
  formatter.hasEquivalentTokens(
    String.raw`a+b=\frac{c}{d}`,
    String.raw`a + b = \frac{c}{d}`,
  ),
  true,
);

const presetEntries = [
  ...tools.templates,
  ...tools.formatTools.flatMap((tool) => (
    tool.groups.flatMap((group) => group.items.filter((item) => !item.action))
  )),
  ...tools.categories.flatMap((category) => (
    category.groups.flatMap((group) => group.items)
  )),
];
assert.equal(tools.categories.length, 10);
assert.equal(tools.formatTools.length, 4);
assert.deepEqual(
  tools.formatTools.map((tool) => tool.label),
  ['颜色', '字体', '字号', '环境'],
);
const environmentTool = tools.formatTools.find((tool) => tool.id === 'environments');
assert.deepEqual(
  environmentTool.groups.flatMap((group) => group.items).map((item) => item.id),
  ['none', 'eqnarray', 'align', 'aligned', 'gathered', 'cases', 'split', 'array'],
);
assert.equal(tools.templates.length, 127);
for (const item of presetEntries) {
  const result = formatter.format(item.latex);
  assert.equal(result.safe, true, `unsafe preset: ${item.label || item.latex}`);
  assert.equal(result.formatted, item.latex, `non-idempotent preset: ${item.label || item.latex}`);
  assert.equal(formatter.hasEquivalentTokens(item.latex, result.formatted), true);
}

const forbiddenTemplateSource = [
  ['comments', /%/],
  ['math delimiters', /\$/],
  ['obsolete commands', /\\(?:buildrel|cfrac|gt|lt|over|rm)\b/],
  ['legacy vector style', /\\vec\b/],
  ['plain real-number set', /\\in\s+R(?:\b|\^)/],
  ['matrix-based one-sided cases', /\\left(?:\\\{|\.)\\begin\{matrix\}/],
];
for (const [description, pattern] of forbiddenTemplateSource) {
  for (const item of tools.templates) {
    assert.doesNotMatch(item.latex, pattern, `${description}: ${item.label}`);
  }
}

const structuredEnvironmentPattern = /\\begin\{(?:align\*?|aligned|alignedat\*?|array|bmatrix|Bmatrix|cases|dcases\*?|eqnarray\*?|gather\*?|gathered|matrix|multline\*?|pmatrix|smallmatrix|split|subarray|Vmatrix|vmatrix)\}(?:\{[^}]*\})?/g;
for (const item of presetEntries) {
  for (const match of item.latex.matchAll(structuredEnvironmentPattern)) {
    assert.equal(
      item.latex[match.index + match[0].length],
      '\n',
      `structured environment must start its body on a new line: ${item.label || item.latex}`,
    );
  }
}

const firstTemplate = tools.templates.find((item) => item.label === '多项式因式分解');
assert.equal(
  firstTemplate.latex,
  String.raw`(x - 1)(x + 3)`,
);
const matrixTemplate = tools.templates.find((item) => item.label === '二阶单位矩阵');
assert.equal(
  matrixTemplate.latex,
  String.raw`\begin{pmatrix}
  1 & 0 \\
  0 & 1
\end{pmatrix}`,
);
const commonPointTemplate = tools.templates.find(
  (item) => item.label === '两个平面的公共点在交线上',
);
assert.equal(commonPointTemplate.singleLine, true);
assert.equal(matrixTemplate.singleLine, false);
assert.match(
  tools.templates.find((item) => item.label === '圆的参数方程').latex,
  /^\\begin\{cases\}\n/,
);
assert.match(
  tools.templates.find((item) => item.label === '二次方程判别式').latex,
  /^\\begin\{aligned\}\n[\s\S]*\\begin\{cases\}\n/,
);
assert.match(
  tools.templates.find((item) => item.label === '面面平行判定定理').latex,
  /^\\left\.\\begin\{array\}\{l\}\n[\s\S]*\\end\{array\}\\right\\\}/,
);
assert.match(
  tools.templates.find((item) => item.label === '麦克斯韦方程组微分形式').latex,
  /^\\begin\{aligned\}\n/,
);
assert.doesNotMatch(
  tools.templates.find((item) => item.label === '麦克斯韦方程组微分形式').latex,
  /\\begin\{array\}|\\cfrac/,
);
assert.equal(
  tools.templates.find((item) => item.label === '爱因斯坦场方程').layout,
  'half',
);
assert.equal(
  tools.templates.find((item) => item.label === '麦克斯韦方程组微分形式').layout,
  'tall',
);
assert.equal(
  tools.templates.find((item) => item.label === '介质中的麦克斯韦方程组微分形式').layout,
  'tall',
);

const shortcutEntries = tools.categories.flatMap((category) => (
  category.groups.flatMap((group) => group.items)
));
const formatEntries = tools.formatTools.flatMap((tool) => (
  tool.groups.flatMap((group) => group.items)
));
const expandSnippet = (value) => value.replace(
  /\$\{\d+(?::([^}]*))?\}/g,
  (match, fallback) => fallback || '',
);
for (const item of [...shortcutEntries, ...formatEntries].filter((candidate) => candidate.snippet)) {
  assert.equal(expandSnippet(item.snippet), item.latex, `snippet changed preset: ${item.latex}`);
}
assert.equal(
  shortcutEntries.find((item) => item.latex === String.raw`\sqrt[]{}`).snippet,
  '\\sqrt[${1}]{${2}}',
);
assert.equal(
  shortcutEntries.find((item) => item.latex === String.raw`\int\limits_{}^{}`).snippet,
  '\\int\\limits_{${1}}^{${2}}',
);
assert.equal(
  shortcutEntries.find((item) => item.latex.includes(String.raw`\frac{\partial^2 y}`)).snippet,
  '',
);
assert.equal(
  shortcutEntries.find((item) => item.latex.includes(String.raw`\begin{matrix}`)).snippet,
  '',
);
assert.equal(
  shortcutEntries.find((item) => item.latex === String.raw`\nabla \psi`).latex,
  String.raw`\nabla \psi`,
);
assert.equal(tools.templates.some((item) => item.snippet), false);

function normalizedMathJaxMarkup(markup) {
  return markup
    .replace(/ id="[^"]*"/g, '')
    .replace(/ data-latex="[^"]*"/g, '')
    .replace(/ data-semantic-attributes="[^"]*"/g, '');
}

async function validateMathJaxEquivalence() {
  const root = path.resolve(__dirname, '..', '..');
  const mathjaxPath = path.join(root, 'node_modules', 'mathjax', 'node-main.cjs');
  const MathJax = await require(mathjaxPath).init({
    loader: {
      load: [
        'input/tex',
        'output/chtml',
        ...mathJaxProfile.packages.map((name) => `[tex]/${name}`),
      ],
    },
    tex: {
      packages: {
        '[+]': mathJaxProfile.packages,
        '[-]': mathJaxProfile.excludedPackages,
      },
    },
  });

  async function render(source) {
    const node = await MathJax.tex2chtmlPromise(source, { display: true });
    const markup = MathJax.startup.adaptor.outerHTML(node);
    assert.doesNotMatch(markup, /mjx-merror|data-mjx-error|class="merror"/i, source);
    return normalizedMathJaxMarkup(markup);
  }

  const compact = await render(String.raw`a+b=\frac{c}{d}`);
  const spaced = await render(String.raw`a + b = \frac{c}{d}`);
  assert.equal(compact, spaced);

  const displaySum = await render(String.raw`\sum_{1}^{2}`);
  const textstyleSum = await render(String.raw`{\textstyle\sum_{1}^{2}}`);
  assert.notEqual(displaySum, textstyleSum);

  const noThinSpace = await render(String.raw`\int f(x)\mathrm{d}x`);
  const thinSpace = await render(String.raw`\int f(x)\,\mathrm{d}x`);
  assert.notEqual(noThinSpace, thinSpace);

  assert.equal(
    await render(String.raw`\begin{array}{l}a=b\\c=d\end{array}`),
    await render(String.raw`\begin{array}{l}
      a = b \\
      c = d
    \end{array}`),
  );

  for (const item of presetEntries) await render(item.preview);
}

validateMathJaxEquivalence()
  .then(() => {
    console.log(`Validated ${presetEntries.length} formatted LaTeX presets.`);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
