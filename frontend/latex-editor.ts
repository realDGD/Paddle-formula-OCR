import { acceptCompletion, autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, snippet as applySnippet, snippetCompletion, startCompletion } from '@codemirror/autocomplete';
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { stexMath } from '@codemirror/legacy-modes/mode/stex';
import { EditorState, StateEffect } from '@codemirror/state';
import { Decoration, drawSelection, dropCursor, EditorView, highlightActiveLine, highlightSpecialChars, hoverTooltip, keymap, lineNumbers, placeholder, ViewPlugin } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { withMathJax } from './app/core/mathjax-runtime.ts';
import { analyzeLatexFences, expectedRightDelimiter } from './latex-fence-analyzer.mts';
import type { LatexFenceAnalysis, LatexFenceToken } from './latex-fence-analyzer.mts';

type LatexCompletion = Completion & {
  previewTex?: string;
  previewText?: string;
};

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
const approachLimitOperators = new Set(['\\lim', '\\limsup', '\\liminf']);
const singleLimitOperators = new Set(['\\min', '\\max', '\\inf', '\\sup']);
const snippetField = (index: number) => '${' + index + '}';

function limitOperatorTemplate(label: string, modifier: string) {
  if (approachLimitOperators.has(label)) {
    return `${label}${modifier}_{${snippetField(1)} \\to ${snippetField(2)}}`;
  }
  if (singleLimitOperators.has(label)) return `${label}${modifier}_{${snippetField(1)}}`;
  return `${label}${modifier}_{${snippetField(1)}}^{${snippetField(2)}}`;
}

function plainCompletion(
  label: string,
  fallback: string,
  previewTex = label,
  detail = '',
): LatexCompletion {
  return { label, apply: `${label} `, type: 'keyword', detail, previewTex, previewText: fallback || label };
}

function snippet(label: string, template: string, previewTex: string, detail: string): LatexCompletion {
  return Object.assign(snippetCompletion(`${template} `, { label, type: 'keyword', detail }), {
    previewTex,
    previewText: detail,
  });
}

const latexCompletions: LatexCompletion[] = [];
for (const group of symbolGroups) {
  for (const [label, glyph] of group) latexCompletions.push(plainCompletion(label, glyph));
}
for (const label of functionCommands) latexCompletions.push(plainCompletion(label, label.slice(1)));
for (const [label, template, previewTex, detail] of structuralSnippets) {
  latexCompletions.push(snippet(label, template, previewTex, detail));
}
for (const [label, sample] of limitOperators) {
  latexCompletions.push(plainCompletion(label, label.slice(1), `\\displaystyle ${sample}`, '默认上下标行为'));
  latexCompletions.push(snippet(
    `${label}\\limits`,
    limitOperatorTemplate(label, '\\limits'),
    `\\displaystyle ${sample.replace(label, `${label}\\limits`)}`,
    '强制上下排列并填写界限',
  ));
  latexCompletions.push(snippet(
    `${label}\\nolimits`,
    limitOperatorTemplate(label, '\\nolimits'),
    `\\displaystyle ${sample.replace(label, `${label}\\nolimits`)}`,
    '强制右侧排列并填写界限',
  ));
}
latexCompletions.sort((left, right) => left.label.localeCompare(right.label, 'en'));

function latexCompletionSource(context: CompletionContext): CompletionResult | null {
  const command = context.matchBefore(/\\[A-Za-z]*$/);
  if (!command) return null;
  const prefix = context.state.sliceDoc(command.from, context.pos).toLowerCase();
  const beforeCommand = context.state.sliceDoc(Math.max(0, command.from - 32), command.from);
  const precedingOperator = beforeCommand.match(
    /\\(?:sum|prod|coprod|bigcup|bigcap|bigvee|bigwedge|int|iint|iiint|iiiint|oint|oiint|oiiint|lim|limsup|liminf|min|max|inf|sup)\s*$/,
  )?.[0]?.trim();
  const modifierCompletions: LatexCompletion[] = [];
  if ('\\limits'.startsWith(prefix) || '\\nolimits'.startsWith(prefix)) {
    for (const modifier of ['\\limits', '\\nolimits']) {
      if (!modifier.startsWith(prefix)) continue;
      const contextualTemplate = approachLimitOperators.has(precedingOperator || '')
        ? `${modifier}_{${snippetField(1)} \\to ${snippetField(2)}}`
        : singleLimitOperators.has(precedingOperator || '')
          ? `${modifier}_{${snippetField(1)}}`
          : `${modifier}_{${snippetField(1)}}^{${snippetField(2)}}`;
      modifierCompletions.push(snippet(
        modifier,
        contextualTemplate,
        approachLimitOperators.has(precedingOperator || '')
          ? `\\displaystyle ${precedingOperator}${modifier}_{x\\to 0}`
          : singleLimitOperators.has(precedingOperator || '')
            ? `\\displaystyle ${precedingOperator}${modifier}_{x}`
            : `\\displaystyle ${precedingOperator || '\\sum'}${modifier}_{i=1}^{n}`,
        modifier === '\\limits' ? '填写界限并强制上下排列' : '填写界限并强制右侧排列',
      ));
    }
  }
  return {
    from: command.from,
    options: [
      ...latexCompletions.filter((completion) => completion.label.toLowerCase().startsWith(prefix)),
      ...modifierCompletions,
    ],
    filter: false,
  };
}

function renderCompletionPreview(completion: Completion) {
  const latexCompletion = completion as LatexCompletion;
  const node = document.createElement('span');
  node.className = 'cm-latex-result';
  node.textContent = latexCompletion.previewText || completion.detail || '';
  queueMicrotask(() => {
    withMathJax(async (mathJax) => {
      if (!node.isConnected) return;
      node.textContent = `\\(${latexCompletion.previewTex || completion.label}\\)`;
      await mathJax.typesetPromise([node]);
    })
      .catch(() => {
        if (node.isConnected) node.textContent = latexCompletion.previewText || completion.detail || '';
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

const refreshFenceDiagnostics = StateEffect.define<null>();

function sourcePosition(state: EditorState, offset: number) {
  const line = state.doc.lineAt(Math.min(offset, state.doc.length));
  return `第 ${line.number} 行第 ${offset - line.from + 1} 列`;
}

function fenceDescription(
  state: EditorState,
  token: LatexFenceToken,
  analysis: LatexFenceAnalysis,
) {
  const source = state.doc.toString();
  const tokenSource = source.slice(token.from, token.to);
  const position = sourcePosition(state, token.from);
  if (token.unmatched === 'missing-right') {
    const expected = `\\right${expectedRightDelimiter(token.delimiter)}`;
    return `${position}的 ${tokenSource} 没有匹配的 \\right；可以在表达式末尾补充 ${expected}。`;
  }
  if (token.unmatched === 'extra-right') {
    return `${position}的 ${tokenSource} 前面没有可以配对的 \\left。`;
  }
  const partner = analysis.tokens.find((candidate) => (
    candidate !== token && candidate.pairId === token.pairId
  ));
  const role = token.role === 'left' ? '左端' : '右端';
  const partnerPosition = partner ? sourcePosition(state, partner.from) : '未知位置';
  return `${tokenSource} 是一个自适应定界符${role}，与${partnerPosition}的 ${
    partner ? source.slice(partner.from, partner.to) : '另一端'
  } 配对。`;
}

function buildFenceDecorations(view: EditorView, confirmed: boolean): DecorationSet {
  const analysis = analyzeLatexFences(view.state.doc.toString());
  const cursor = view.state.selection.main.head;
  const activeToken = analysis.tokens.find((token) => cursor >= token.from && cursor <= token.to);
  const activePairId = activeToken?.pairId;
  const ranges = analysis.tokens.map((token) => {
    const classes = [
      'cm-latex-fence-token',
      `cm-latex-fence-${token.role}`,
      `cm-latex-fence-depth-${token.depth % 4}`,
    ];
    if (activePairId && token.pairId === activePairId) classes.push('cm-latex-fence-active');
    if (activeToken === token && !token.pairId) classes.push('cm-latex-fence-active');
    if (token.unmatched) {
      classes.push(confirmed
        ? 'cm-latex-fence-unmatched-confirmed'
        : 'cm-latex-fence-unmatched-pending');
    }
    const description = fenceDescription(view.state, token, analysis);
    return Decoration.mark({
      class: classes.join(' '),
      attributes: {
        title: description,
        'data-latex-fence-role': token.role,
        'data-latex-fence-status': token.unmatched || 'paired',
      },
    }).range(token.from, token.to);
  });
  return Decoration.set(ranges, true);
}

const latexFenceHighlighter = ViewPlugin.fromClass(class {
  view: EditorView;
  confirmed: boolean;
  timer: number | null;
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.view = view;
    this.confirmed = true;
    this.timer = null;
    this.decorations = buildFenceDecorations(view, this.confirmed);
  }

  update(update: ViewUpdate) {
    const refreshed = update.transactions.some((transaction) => (
      transaction.effects.some((effect) => effect.is(refreshFenceDiagnostics))
    ));
    if (update.docChanged) {
      this.confirmed = false;
      if (this.timer) window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => {
        this.timer = null;
        this.confirmed = true;
        this.view.dispatch({ effects: refreshFenceDiagnostics.of(null) });
      }, 650);
    }
    if (update.docChanged || update.selectionSet || update.focusChanged || refreshed) {
      this.decorations = buildFenceDecorations(update.view, this.confirmed);
    }
  }

  destroy() {
    if (this.timer) window.clearTimeout(this.timer);
  }
}, {
  decorations: (plugin) => plugin.decorations,
});

const latexFenceTooltip = hoverTooltip((view, position) => {
  const analysis = analyzeLatexFences(view.state.doc.toString());
  const token = analysis.tokens.find((candidate) => (
    position >= candidate.from && position <= candidate.to
  ));
  if (!token) return null;
  return {
    pos: token.from,
    end: token.to,
    above: true,
    create() {
      const dom = document.createElement('div');
      dom.className = 'cm-latex-fence-tooltip';
      const source = document.createElement('code');
      source.textContent = view.state.sliceDoc(token.from, token.to);
      const message = document.createElement('span');
      message.textContent = fenceDescription(view.state, token, analysis);
      dom.append(source, message);
      return { dom };
    },
  };
}, { hoverTime: 300 });

function createLatexEditor(textarea: HTMLTextAreaElement, host: HTMLElement) {
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
        latexFenceHighlighter,
        latexFenceTooltip,
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
    setValue(value: unknown) {
      const next = String(value ?? '');
      if (next === view.state.doc.toString()) return;
      suppressInput = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
      suppressInput = false;
      textarea.value = next;
    },
    insert(value: unknown, options: { snippet?: string } = {}) {
      const next = String(value ?? '');
      if (!next) return;
      const selection = view.state.selection.main;
      const snippetTemplate = String(options.snippet ?? '');
      if (snippetTemplate) {
        applySnippet(snippetTemplate)(view, null, selection.from, selection.to);
        view.focus();
        return;
      }
      const followingCharacter = view.state.sliceDoc(selection.to, selection.to + 1);
      const insertText = /\\[A-Za-z]+$/.test(next) && /^[A-Za-z]$/.test(followingCharacter)
        ? `${next} `
        : next;
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: insertText },
        selection: { anchor: selection.from + insertText.length },
        userEvent: 'input',
      });
      view.focus();
    },
    focus: () => view.focus(),
    view,
  };
}

window.FormulaLatexEditor = { create: createLatexEditor };
