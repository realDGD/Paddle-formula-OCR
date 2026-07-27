import { $, escapeHtml } from '../core/dom.js';

export function createLatexRenderer({ getLatexValue }) {
  let renderGeneration = 0;
  let renderTimer = null;

  function schedule() {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(() => render(), 120);
  }

  async function render() {
    const generation = ++renderGeneration;
    const entries = [
      { target: $('#latex-preview'), status: $('#render-status') },
      { target: $('#visual-formula-preview'), status: $('#visual-render-status') },
    ].filter((entry) => entry.target);
    const value = getLatexValue().trim();
    if (!value) {
      for (const { target, status } of entries) {
        target.textContent = '预览会显示在这里。';
        if (status) {
          status.textContent = '';
          status.title = '';
        }
      }
      return;
    }
    const isStandaloneDisplayEnvironment = /^\\begin\{(?:eqnarray|align)\*?\}/.test(value);
    for (const { target } of entries) {
      target.textContent = isStandaloneDisplayEnvironment ? value : `\\[${value}\\]`;
    }
    try {
      if (!window.MathJax?.typesetPromise) throw new Error('MathJax 尚未加载');
      await window.MathJax.typesetPromise(entries.map((entry) => entry.target));
      if (generation !== renderGeneration) return;
      for (const { target, status } of entries) {
        const errorNode = target.querySelector('.mjx-merror, [data-mjx-error], mjx-container[data-mjx-error], .merror');
        if (errorNode) {
          const errorText = errorNode.textContent || 'LaTeX 语法不完整或存在错误';
          target.innerHTML = `<div class="preview-error-box"><div class="error-title">⚠️ 公式语法不完整或存在错误</div><div class="error-detail">${escapeHtml(errorText)}</div></div>`;
          if (status) {
            status.textContent = '语法错误';
            status.title = errorText;
          }
        } else if (status) {
          status.textContent = '';
          status.title = '';
        }
      }
    } catch (error) {
      if (generation !== renderGeneration) return;
      const message = error.message || String(error);
      for (const { target, status } of entries) {
        target.innerHTML = `<div class="preview-error-box"><div class="error-title">⚠️ 公式渲染失败</div><div class="error-detail">${escapeHtml(message)}</div></div>`;
        if (status) {
          status.textContent = '预览失败';
          status.title = message;
        }
      }
    }
  }

  function normalizedMathJaxMarkup(node) {
    const clone = node.cloneNode(true);
    [clone, ...clone.querySelectorAll('*')].forEach((element) => {
      element.removeAttribute('id');
      element.removeAttribute('data-latex');
      element.removeAttribute('data-semantic-attributes');
    });
    return clone.outerHTML;
  }

  async function hasEquivalentMathJaxOutput(original, formatted) {
    if (original === formatted) return true;
    if (!window.MathJax?.typesetPromise) return false;

    const comparisonHost = document.createElement('div');
    comparisonHost.setAttribute('aria-hidden', 'true');
    comparisonHost.style.cssText = [
      'position: fixed',
      'left: -100000px',
      'top: 0',
      'visibility: hidden',
      'pointer-events: none',
    ].join(';');
    const originalTarget = document.createElement('div');
    const formattedTarget = document.createElement('div');
    originalTarget.textContent = `\\[${original}\\]`;
    formattedTarget.textContent = `\\[${formatted}\\]`;
    comparisonHost.append(originalTarget, formattedTarget);
    document.body.append(comparisonHost);

    try {
      await window.MathJax.typesetPromise([comparisonHost]);
      const originalError = originalTarget.querySelector(
        '.mjx-merror, [data-mjx-error], mjx-container[data-mjx-error], .merror',
      );
      const formattedError = formattedTarget.querySelector(
        '.mjx-merror, [data-mjx-error], mjx-container[data-mjx-error], .merror',
      );
      const originalMath = originalTarget.querySelector('mjx-container');
      const formattedMath = formattedTarget.querySelector('mjx-container');
      if (originalError || formattedError || !originalMath || !formattedMath) return false;
      return normalizedMathJaxMarkup(originalMath) === normalizedMathJaxMarkup(formattedMath);
    } catch (error) {
      console.warn('LaTeX formatting equivalence check failed:', error);
      return false;
    } finally {
      window.MathJax.typesetClear?.([comparisonHost]);
      comparisonHost.remove();
    }
  }

  async function safelyFormatRecognizedLatex(value) {
    const original = String(value || '');
    const formatter = window.FormulaOcrLatexFormatter;
    if (!original || !formatter?.format) {
      return { latex: original, status: 'formatter-unavailable', formatted: false };
    }

    const result = formatter.format(original);
    if (!result.safe) {
      return { latex: original, status: result.status, formatted: false };
    }
    if (!result.changed) {
      return { latex: original, status: 'unchanged', formatted: false };
    }
    if (!formatter.hasEquivalentTokens(original, result.formatted)) {
      return { latex: original, status: 'token-changed', formatted: false };
    }
    if (!await hasEquivalentMathJaxOutput(original, result.formatted)) {
      return { latex: original, status: 'render-changed', formatted: false };
    }
    return { latex: result.formatted, status: 'equivalent', formatted: true };
  }

  return {
    render,
    safelyFormatRecognizedLatex,
    schedule,
  };
}
