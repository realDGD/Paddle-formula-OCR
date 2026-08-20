import { $, escapeHtml } from '../core/dom.ts';
import {
  clearMathJax,
  waitForMathJax,
  withMathJax,
} from '../core/mathjax-runtime.ts';

export function createLatexRenderer({
  getLatexValue,
}: {
  getLatexValue: () => string;
}) {
  let renderGeneration = 0;
  let renderTimer: number | undefined;

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
      clearMathJax(entries.map((entry) => entry.target)).catch(() => undefined);
      return;
    }
    const isStandaloneDisplayEnvironment = /^\\begin\{(?:eqnarray|align)\*?\}/.test(value);
    try {
      await waitForMathJax();
      if (generation !== renderGeneration) return;
      const rendered = await withMathJax(async (mathJax) => {
        if (generation !== renderGeneration) return false;
        const targets = entries.map((entry) => entry.target);
        mathJax.typesetClear?.(targets);
        for (const target of targets) {
          target.textContent = isStandaloneDisplayEnvironment ? value : `\\[${value}\\]`;
        }
        await mathJax.typesetPromise(targets);
        return true;
      });
      if (!rendered) return;
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

  function normalizedMathJaxMarkup(node: Element) {
    const clone = node.cloneNode(true) as Element;
    [clone, ...clone.querySelectorAll('*')].forEach((element) => {
      element.removeAttribute('id');
      element.removeAttribute('data-latex');
      element.removeAttribute('data-semantic-attributes');
    });
    return clone.outerHTML;
  }

  async function hasEquivalentMathJaxOutput(original: string, formatted: string) {
    if (original === formatted) return true;

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
      await withMathJax(async (mathJax) => {
        mathJax.typesetClear?.([comparisonHost]);
        await mathJax.typesetPromise([comparisonHost]);
      });
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
      await clearMathJax([comparisonHost]).catch(() => undefined);
      comparisonHost.remove();
    }
  }

  async function safelyFormatRecognizedLatex(value: unknown) {
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
