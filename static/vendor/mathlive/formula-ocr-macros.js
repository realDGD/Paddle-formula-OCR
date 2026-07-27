(function (root, factory) {
  const macros = factory();
  if (typeof module === 'object' && module.exports) module.exports = macros;
  root.FormulaOcrMathLiveMacros = macros;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // MathLive does not ship the LaTeX upgreek package. Keep the public command
  // names, but render them with MathLive's upright roman Greek glyphs.
  const uprightGreek = (name) => `\\mathrm{\\${name}}`;
  return Object.freeze({
    upalpha: uprightGreek('alpha'),
    upbeta: uprightGreek('beta'),
    upchi: uprightGreek('chi'),
    updelta: uprightGreek('delta'),
    Updelta: uprightGreek('Delta'),
    upepsilon: uprightGreek('epsilon'),
    upeta: uprightGreek('eta'),
    upgamma: uprightGreek('gamma'),
    Upgamma: uprightGreek('Gamma'),
    upiota: uprightGreek('iota'),
    upkappa: uprightGreek('kappa'),
    uplambda: uprightGreek('lambda'),
    Uplambda: uprightGreek('Lambda'),
    upmu: uprightGreek('mu'),
    upnu: uprightGreek('nu'),
    upomega: uprightGreek('omega'),
    Upomega: uprightGreek('Omega'),
    upphi: uprightGreek('phi'),
    Upphi: uprightGreek('Phi'),
    uppi: uprightGreek('pi'),
    Uppi: uprightGreek('Pi'),
    uppsi: uprightGreek('psi'),
    Uppsi: uprightGreek('Psi'),
    uprho: uprightGreek('rho'),
    upsigma: uprightGreek('sigma'),
    Upsigma: uprightGreek('Sigma'),
    uptau: uprightGreek('tau'),
    uptheta: uprightGreek('theta'),
    Uptheta: uprightGreek('Theta'),
    upupsilon: uprightGreek('upsilon'),
    Upupsilon: uprightGreek('Upsilon'),
    upvarepsilon: uprightGreek('varepsilon'),
    upvarphi: uprightGreek('varphi'),
    upvarpi: uprightGreek('varpi'),
    upvarrho: uprightGreek('varrho'),
    upvarsigma: uprightGreek('varsigma'),
    upvartheta: uprightGreek('vartheta'),
    upxi: uprightGreek('xi'),
    Upxi: uprightGreek('Xi'),
    upzeta: uprightGreek('zeta'),

    // MathLive 0.110 does not activate these AMS/Mathtools/Gensymb commands.
    // Use the same Unicode code points or a semantically equivalent expansion.
    dots: '\\ldots',
    dotsb: '\\cdots',
    dotsc: '\\ldots',
    dotsi: '\\!\\cdots',
    dotsm: '\\cdots',
    dotso: '\\ldots',
    idotsint: '\\int\\!\\cdots\\!\\int',
    iiiint: '\\mathop{\\char"2A0C}',
    diagdown: '\\mathbin{\\char"2572}',
    celsius: '\\mathord{\\char"2103}',
    ohm: '\\mathord{\\char"2126}',
    iddots: '\\mathord{\\char"22F0}',
    dblcolon: '{\\mathop{\\char"2237}}',
    Coloneqq: '{\\mathop{\\char"2A74}}',
    eqqcolon: '{\\mathop{\\char"2255}}',
    Eqqcolon: '{\\mathop{\\char"3D\\char"2237}}',
    eqcolon: '{\\mathop{\\char"2255}}',
    Eqcolon: '{\\mathop{\\char"3D\\char"2237}}',
    colonapprox: '{\\mathop{\\char"003A\\char"2248}}',
    Colonapprox: '{\\mathop{\\char"2237\\char"2248}}',
    colonsim: '{\\mathop{\\char"3A\\char"223C}}',
    Colonsim: '{\\mathop{\\char"2237\\char"223C}}',

    // MathLive has no dsfont face. Preserve \mathds in the editor source while
    // displaying the closest built-in blackboard-bold style. MathJax renders
    // the final preview with the bundled dsfont extension.
    mathds: { def: '\\mathbb{#1}', args: 1, expand: false },
  });
}));
