import { acceptCompletion, autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, snippetCompletion, startCompletion } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { stexMath } from '@codemirror/legacy-modes/mode/stex';
import { EditorState } from '@codemirror/state';
import { drawSelection, dropCursor, EditorView, highlightActiveLine, highlightSpecialChars, keymap, lineNumbers, placeholder } from '@codemirror/view';
import { tags } from '@lezer/highlight';

const symbolGroups = [
  [
    ['\\alpha', 'α'], ['\\beta', 'β'], ['\\gamma', 'γ'], ['\\delta', 'δ'], ['\\epsilon', 'ϵ'],
    ['\\varepsilon', 'ε'], ['\\zeta', 'ζ'], ['\\eta', 'η'], ['\\theta', 'θ'], ['\\vartheta', 'ϑ'],
    ['\\iota', 'ι'], ['\\kappa', 'κ'], ['\\lambda', 'λ'], ['\\mu', 'μ'], ['\\nu', 'ν'],
    ['\\xi', 'ξ'], ['\\pi', 'π'], ['\\varpi', 'ϖ'], ['\\rho', 'ρ'], ['\\varrho', 'ϱ'],
    ['\\sigma', 'σ'], ['\\varsigma', 'ς'], ['\\tau', 'τ'], ['\\upsilon', 'υ'], ['\\phi', 'ϕ'],
    ['\\varphi', 'φ'], ['\\chi', 'χ'], ['\\psi', 'ψ'], ['\\omega', 'ω'],
    ['\\Gamma', 'Γ'], ['\\Delta', 'Δ'], ['\\Theta', 'Θ'], ['\\Lambda', 'Λ'], ['\\Xi', 'Ξ'],
    ['\\Pi', 'Π'], ['\\Sigma', 'Σ'], ['\\Upsilon', 'Υ'], ['\\Phi', 'Φ'], ['\\Psi', 'Ψ'], ['\\Omega', 'Ω'],
  ],
  [
    ['\\pm', '±'], ['\\mp', '∓'], ['\\times', '×'], ['\\div', '÷'], ['\\cdot', '·'], ['\\ast', '∗'],
    ['\\star', '⋆'], ['\\circ', '∘'], ['\\bullet', '∙'], ['\\oplus', '⊕'], ['\\ominus', '⊖'],
    ['\\otimes', '⊗'], ['\\oslash', '⊘'], ['\\odot', '⊙'], ['\\cap', '∩'], ['\\cup', '∪'],
    ['\\sqcap', '⊓'], ['\\sqcup', '⊔'], ['\\vee', '∨'], ['\\wedge', '∧'], ['\\setminus', '∖'],
  ],
  [
    ['\\equiv', '≡'], ['\\sim', '∼'], ['\\simeq', '≃'], ['\\approx', '≈'], ['\\cong', '≅'],
    ['\\neq', '≠'], ['\\le', '≤'], ['\\leq', '≤'], ['\\ge', '≥'], ['\\geq', '≥'],
    ['\\ll', '≪'], ['\\gg', '≫'], ['\\prec', '≺'], ['\\succ', '≻'], ['\\preceq', '≼'],
    ['\\succeq', '≽'], ['\\in', '∈'], ['\\notin', '∉'], ['\\ni', '∋'], ['\\subset', '⊂'],
    ['\\supset', '⊃'], ['\\subseteq', '⊆'], ['\\supseteq', '⊇'], ['\\perp', '⊥'], ['\\parallel', '∥'],
    ['\\mid', '∣'], ['\\propto', '∝'], ['\\models', '⊨'], ['\\vdash', '⊢'], ['\\dashv', '⊣'],
  ],
  [
    ['\\leftarrow', '←'], ['\\rightarrow', '→'], ['\\leftrightarrow', '↔'], ['\\Leftarrow', '⇐'],
    ['\\Rightarrow', '⇒'], ['\\Leftrightarrow', '⇔'], ['\\longleftarrow', '⟵'], ['\\longrightarrow', '⟶'],
    ['\\longleftrightarrow', '⟷'], ['\\mapsto', '↦'], ['\\hookleftarrow', '↩'], ['\\hookrightarrow', '↪'],
    ['\\uparrow', '↑'], ['\\downarrow', '↓'], ['\\updownarrow', '↕'], ['\\nearrow', '↗'],
    ['\\searrow', '↘'], ['\\swarrow', '↙'], ['\\nwarrow', '↖'],
  ],
  [
    ['\\infty', '∞'], ['\\partial', '∂'], ['\\nabla', '∇'], ['\\ell', 'ℓ'], ['\\hbar', 'ℏ'],
    ['\\imath', 'ı'], ['\\jmath', 'ȷ'], ['\\Re', 'ℜ'], ['\\Im', 'ℑ'], ['\\wp', '℘'],
    ['\\emptyset', '∅'], ['\\varnothing', '∅'], ['\\aleph', 'ℵ'], ['\\forall', '∀'], ['\\exists', '∃'],
    ['\\neg', '¬'], ['\\angle', '∠'], ['\\triangle', '△'], ['\\square', '□'], ['\\diamond', '◇'],
    ['\\top', '⊤'], ['\\bot', '⊥'], ['\\ldots', '…'], ['\\cdots', '⋯'], ['\\vdots', '⋮'], ['\\ddots', '⋱'],
  ],
];

const functionCommands = [
  '\\sin', '\\cos', '\\tan', '\\cot', '\\sec', '\\csc', '\\arcsin', '\\arccos', '\\arctan',
  '\\sinh', '\\cosh', '\\tanh', '\\log', '\\ln', '\\lg', '\\exp', '\\min', '\\max',
  '\\inf', '\\sup', '\\det', '\\dim', '\\gcd', '\\ker', '\\deg', '\\hom', '\\Pr', '\\arg',
];

const structuralSnippets = [
  ['\\frac', '\\frac{${1}}{${2}}', '\\frac{a}{b}', '分式'],
  ['\\dfrac', '\\dfrac{${1}}{${2}}', '\\dfrac{a}{b}', '行间分式'],
  ['\\tfrac', '\\tfrac{${1}}{${2}}', '\\tfrac{a}{b}', '行内分式'],
  ['\\sqrt', '\\sqrt{${1}}', '\\sqrt{x}', '平方根'],
  ['\\sqrt[]', '\\sqrt[${1}]{${2}}', '\\sqrt[3]{x}', 'n 次根'],
  ['\\binom', '\\binom{${1}}{${2}}', '\\binom{n}{k}', '二项式'],
  ['\\text', '\\text{${1}}', '\\text{文字}', '文本'],
  ['\\operatorname', '\\operatorname{${1}}', '\\operatorname{rank}', '自定义算子'],
  ['\\overline', '\\overline{${1}}', '\\overline{x}', '上划线'],
  ['\\underline', '\\underline{${1}}', '\\underline{x}', '下划线'],
  ['\\overbrace', '\\overbrace{${1}}^{${2}}', '\\overbrace{a+b}^{n}', '上花括号'],
  ['\\underbrace', '\\underbrace{${1}}_{${2}}', '\\underbrace{a+b}_{n}', '下花括号'],
  ['\\vec', '\\vec{${1}}', '\\vec{x}', '向量箭头'],
  ['\\hat', '\\hat{${1}}', '\\hat{x}', '宽帽'],
  ['\\widehat', '\\widehat{${1}}', '\\widehat{ABC}', '宽帽'],
  ['\\bar', '\\bar{${1}}', '\\bar{x}', '短横线'],
  ['\\tilde', '\\tilde{${1}}', '\\tilde{x}', '波浪号'],
  ['\\widetilde', '\\widetilde{${1}}', '\\widetilde{ABC}', '宽波浪号'],
  ['\\dot', '\\dot{${1}}', '\\dot{x}', '一点导数'],
  ['\\ddot', '\\ddot{${1}}', '\\ddot{x}', '二点导数'],
  ['\\cancel', '\\cancel{${1}}', '\\cancel{x}', '取消线'],
  ['\\mathbb', '\\mathbb{${1}}', '\\mathbb{R}', '黑板粗体'],
  ['\\mathbf', '\\mathbf{${1}}', '\\mathbf{x}', '粗体'],
  ['\\mathrm', '\\mathrm{${1}}', '\\mathrm{d}', '正体'],
  ['\\mathit', '\\mathit{${1}}', '\\mathit{x}', '意大利体'],
  ['\\mathcal', '\\mathcal{${1}}', '\\mathcal{F}', '花体'],
  ['\\begin{matrix}', '\\begin{matrix}\n${1}\n\\end{matrix}', '\\begin{matrix}a&b\\\\c&d\\end{matrix}', '矩阵'],
  ['\\begin{pmatrix}', '\\begin{pmatrix}\n${1}\n\\end{pmatrix}', '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}', '圆括号矩阵'],
  ['\\begin{bmatrix}', '\\begin{bmatrix}\n${1}\n\\end{bmatrix}', '\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}', '方括号矩阵'],
  ['\\begin{cases}', '\\begin{cases}\n${1} & ${2} \\\\\n${3} & ${4}\n\\end{cases}', '\\begin{cases}x&x>0\\\\-x&x\\le0\\end{cases}', '分段表达式'],
  ['\\left', '\\left${1} ${2} \\right${3}', '\\left( x \\right)', '自适应定界符'],
  ['\\ce', '\\ce{${1}}', '\\ce{H2O}', '化学结构式 / 反应式'],
  ['\\pu', '\\pu{${1}}', '\\pu{123 J}', '物理化学单位'],
  ['\\bra', '\\bra{${1}}', '\\bra{\\psi}', '狄拉克 Bra 态'],
  ['\\ket', '\\ket{${1}}', '\\ket{\\psi}', '狄拉克 Ket 态'],
  ['\\braket', '\\braket{${1}|${2}}', '\\braket{\\phi|\\psi}', '狄拉克内积'],
  ['\\pdv', '\\pdv{${1}}{${2}}', '\\pdv{f}{x}', '偏导数'],
  ['\\dv', '\\dv{${1}}{${2}}', '\\dv{y}{x}', '全导数'],
  ['\\grad', '\\grad{${1}}', '\\grad{\\phi}', '梯度'],
  ['\\curl', '\\curl{${1}}', '\\curl{\\mathbf{B}}', '旋度'],
  ['\\abs', '\\abs{${1}}', '\\abs{x}', '绝对值'],
  ['\\norm', '\\norm{${1}}', '\\norm{\\mathbf{v}}', '范数'],
  ['\\bbox', '\\bbox[${1:border:1px solid red}]{\\mathbf{${2:E}=mc^2}}', '\\bbox[border:1px solid red]{E=mc^2}', '局部边框/背景色'],
  ['\\unicode', '\\unicode{${1:x2205}}', '\\unicode{x2205}', 'Unicode 字符'],
  ['\\cfrac', '\\cfrac{${1}}{${2}}', '\\cfrac{1}{1+x}', '连分式'],
  ['\\coloneqq', '\\coloneqq', ':=', '定义为'],
  ['\\xleftarrow', '\\xleftarrow{${1}}', '\\xleftarrow{n}', '带文字左箭头'],
  ['\\xrightarrow', '\\xrightarrow{${1}}', '\\xrightarrow{n}', '带文字右箭头'],
  ['\\centernot', '\\centernot${1}', '\\centernot\\Longrightarrow', '居中否定划线'],
  ['\\color', '\\color{${1:red}}{${2:x}}', '\\color{red}{x}', '颜色着色'],
  ['\\textcolor', '\\textcolor{${1:red}}{${2:x}}', '\\textcolor{red}{x}', '文本着色'],
  ['\\enclose', '\\enclose{${1:circle}}{${2:x}}', '\\enclose{circle}{x}', '几何围框'],
  ['\\begin{amscd}', '\\begin{amscd}\n${1:A} @>${2:f}>> ${3:B}\\\\\n@V${4:g}VV @VV${5:h}V\\\\\n${6:C} @>${7:k}>> ${8:D}\n\\end{amscd}', '\\begin{amscd}A @>f>> B\\end{amscd}', '交换图表'],
];

const limitOperators = [
  ['\\sum', '\\sum_{i=1}^{n}'],
  ['\\prod', '\\prod_{i=1}^{n}'],
  ['\\coprod', '\\coprod_{i=1}^{n}'],
  ['\\bigcup', '\\bigcup_{i=1}^{n}'],
  ['\\bigcap', '\\bigcap_{i=1}^{n}'],
  ['\\bigvee', '\\bigvee_{i=1}^{n}'],
  ['\\bigwedge', '\\bigwedge_{i=1}^{n}'],
  ['\\int', '\\int_{0}^{1}'],
  ['\\oint', '\\oint_{C}'],
  ['\\lim', '\\lim_{x\\to 0}'],
];

function plainCompletion(label, fallback, previewTex = label, detail = '') {
  return { label, apply: `${label} `, type: 'keyword', detail, previewTex, previewText: fallback || label };
}

function snippet(label, template, previewTex, detail) {
  return Object.assign(snippetCompletion(`${template} `, { label, type: 'keyword', detail }), {
    previewTex,
    previewText: detail,
  });
}

const latexCompletions = [];
for (const group of symbolGroups) {
  for (const [label, glyph] of group) latexCompletions.push(plainCompletion(label, glyph));
}
for (const label of functionCommands) latexCompletions.push(plainCompletion(label, label.slice(1)));
for (const [label, template, previewTex, detail] of structuralSnippets) {
  latexCompletions.push(snippet(label, template, previewTex, detail));
}
for (const [label, sample] of limitOperators) {
  latexCompletions.push(plainCompletion(label, label.slice(1), `\\displaystyle ${sample}`, '默认上下标行为'));
  latexCompletions.push(plainCompletion(`${label}\\limits`, '上下排列', `\\displaystyle ${sample.replace(label, `${label}\\limits`)}`, '强制上下排列'));
  latexCompletions.push(plainCompletion(`${label}\\nolimits`, '右侧排列', `\\displaystyle ${sample.replace(label, `${label}\\nolimits`)}`, '强制右侧排列'));
}
latexCompletions.push(
  plainCompletion('\\limits', '上下排列', '\\displaystyle\\sum\\limits_{i=1}^{n}', '强制上下排列'),
  plainCompletion('\\nolimits', '右侧排列', '\\displaystyle\\sum\\nolimits_{i=1}^{n}', '强制右侧排列'),
);
latexCompletions.sort((left, right) => left.label.localeCompare(right.label, 'en'));

function latexCompletionSource(context) {
  const command = context.matchBefore(/\\[A-Za-z]*$/);
  if (!command) return null;
  const prefix = context.state.sliceDoc(command.from, context.pos).toLowerCase();
  return {
    from: command.from,
    options: latexCompletions.filter((completion) => completion.label.toLowerCase().startsWith(prefix)),
    filter: false,
  };
}

let mathJaxQueue = Promise.resolve();
function renderCompletionPreview(completion) {
  const node = document.createElement('span');
  node.className = 'cm-latex-result';
  node.textContent = completion.previewText || completion.detail || '';
  queueMicrotask(() => {
    if (!node.isConnected || !window.MathJax?.typesetPromise) return;
    mathJaxQueue = mathJaxQueue
      .catch(() => undefined)
      .then(async () => {
        if (!node.isConnected) return;
        node.textContent = `\\(${completion.previewTex || completion.label}\\)`;
        await window.MathJax.typesetPromise([node]);
      })
      .catch(() => {
        if (node.isConnected) node.textContent = completion.previewText || completion.detail || '';
      });
  });
  return node;
}

const latexHighlightStyle = HighlightStyle.define([
  { tag: [tags.keyword, tags.tagName, tags.typeName], color: 'var(--latex-command)', fontWeight: '650' },
  { tag: [tags.brace, tags.squareBracket, tags.paren], color: 'var(--latex-bracket)' },
  { tag: [tags.number, tags.integer, tags.float], color: 'var(--latex-number)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--latex-string)' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--latex-comment)', fontStyle: 'italic' },
  { tag: [tags.operator, tags.arithmeticOperator, tags.logicOperator], color: 'var(--latex-operator)' },
]);

const latexTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'transparent', color: 'inherit', fontSize: '0.95rem' },
  '&.cm-focused': { outline: '2px solid color-mix(in srgb, #1769e0 45%, transparent)', outlineOffset: '-1px' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
  '.cm-content': { padding: '0.7rem 0', caretColor: 'var(--latex-caret)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--latex-caret) !important', borderLeftWidth: '2px !important' },
  '.cm-line': { padding: '0 0.8rem' },
  '.cm-gutters': { backgroundColor: 'var(--latex-gutter-bg)', color: 'var(--latex-gutter-text)', borderRight: '1px solid var(--latex-editor-border)' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--latex-active-line)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'var(--latex-selection) !important' },
});

function createLatexEditor(textarea, host) {
  if (!textarea || !host) return null;
  let suppressInput = false;
  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: textarea.value,
      extensions: [
        lineNumbers(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        bracketMatching(),
        closeBrackets(),
        highlightActiveLine(),
        StreamLanguage.define(stexMath),
        syntaxHighlighting(latexHighlightStyle, { fallback: true }),
        latexTheme,
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({
          'aria-label': 'LaTeX 源码编辑器',
          'aria-multiline': 'true',
          spellcheck: 'false',
          autocapitalize: 'off',
          autocomplete: 'off',
        }),
        placeholder(textarea.placeholder || ''),
        autocompletion({
          override: [latexCompletionSource],
          activateOnTyping: true,
          maxRenderedOptions: 40,
          icons: false,
          addToOptions: [{ render: renderCompletionPreview, position: 90 }],
        }),
        keymap.of([
          { key: 'Tab', run: acceptCompletion },
          indentWithTab,
          ...closeBracketsKeymap,
          ...completionKeymap,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          textarea.value = update.state.doc.toString();
          if (!suppressInput) {
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            const completed = update.transactions.some((transaction) => transaction.isUserEvent('input.complete'));
            const cursor = update.state.selection.main.head;
            const beforeCursor = update.state.sliceDoc(Math.max(0, cursor - 80), cursor);
            if (!completed && /\\[A-Za-z]*$/.test(beforeCursor)) queueMicrotask(() => startCompletion(view));
          }
        }),
      ],
    }),
  });
  textarea.hidden = true;
  host.hidden = false;
  return {
    getValue: () => view.state.doc.toString(),
    setValue(value) {
      const next = String(value ?? '');
      if (next === view.state.doc.toString()) return;
      suppressInput = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
      suppressInput = false;
      textarea.value = next;
    },
    focus: () => view.focus(),
    view,
  };
}

window.FormulaLatexEditor = { create: createLatexEditor };
