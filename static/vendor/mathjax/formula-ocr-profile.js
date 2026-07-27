(function (root, factory) {
  const profile = factory();
  if (typeof module === 'object' && module.exports) module.exports = profile;
  root.FormulaOcrMathJaxProfile = profile;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Keep browser rendering and the Detexify audit on exactly the same MathJax profile.
  return Object.freeze({
    packages: Object.freeze([
      'action', 'ams', 'amscd', 'bbm', 'bboldx', 'bbox', 'begingroup',
      'boldsymbol', 'braket', 'bussproofs', 'cancel', 'cases', 'centernot',
      'color', 'colortbl', 'configmacros', 'dsfont', 'empheq', 'enclose',
      'extpfeil', 'fontsizev3', 'gensymb', 'mathtools', 'mhchem',
      'newcommand', 'physics', 'setoptions', 'tagformat', 'textcomp',
      'textmacros', 'unicode', 'units', 'upgreek', 'verb',
    ]),
    fontExtensions: Object.freeze([
      'mathjax-bbm-font-extension',
      'mathjax-bboldx-font-extension',
      'mathjax-dsfont-font-extension',
      'mathjax-mhchem-font-extension',
    ]),
    excludedPackages: Object.freeze([
      'colorv2', 'html', 'noerrors', 'noundefined', 'require', 'texhtml',
    ]),
  });
}));
