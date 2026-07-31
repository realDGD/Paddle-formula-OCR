const MATHJAX_READY_EVENT = 'formula-ocr-mathjax-ready';
const MATHJAX_READY_TIMEOUT_MS = 15000;

function createMathJaxRuntime() {
  let readinessPromise = null;
  let operationQueue = Promise.resolve();

  function hostWindow() {
    return typeof window === 'undefined' ? globalThis : window;
  }

  function isReady() {
    return typeof hostWindow().MathJax?.typesetPromise === 'function';
  }

  function waitForMathJax() {
    if (isReady()) return Promise.resolve(hostWindow().MathJax);
    if (readinessPromise) return readinessPromise;

    const host = hostWindow();
    const pending = new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        host.clearTimeout(timeout);
        host.removeEventListener?.(MATHJAX_READY_EVENT, handleReady);
        callback(value);
      };
      const handleReady = () => {
        if (isReady()) finish(resolve, host.MathJax);
      };
      const timeout = host.setTimeout(() => {
        if (isReady()) {
          finish(resolve, host.MathJax);
          return;
        }
        finish(reject, new Error('MathJax 加载超时'));
      }, MATHJAX_READY_TIMEOUT_MS);

      host.addEventListener?.(MATHJAX_READY_EVENT, handleReady);
      // Cover the race where MathJax becomes ready while the listener is added.
      handleReady();
    });
    readinessPromise = pending.finally(() => {
      readinessPromise = null;
    });
    return readinessPromise;
  }

  function withMathJax(operation) {
    const task = operationQueue
      .catch(() => undefined)
      .then(async () => operation(await waitForMathJax()));
    // A failed dynamic font or extension request must not poison later renders.
    operationQueue = task.catch(() => undefined);
    return task;
  }

  function typesetMathJax(elements) {
    return withMathJax((mathJax) => mathJax.typesetPromise(elements));
  }

  function clearMathJax(elements) {
    if (!isReady()) return Promise.resolve();
    return withMathJax((mathJax) => mathJax.typesetClear?.(elements));
  }

  function mathJaxToMathML(latex, options) {
    return withMathJax((mathJax) => {
      if (typeof mathJax.tex2mmlPromise !== 'function') {
        throw new Error('MathJax MathML 转换器未就绪');
      }
      return mathJax.tex2mmlPromise(latex, options);
    });
  }

  return Object.freeze({
    clearMathJax,
    isReady,
    mathJaxToMathML,
    typesetMathJax,
    waitForMathJax,
    withMathJax,
  });
}

export const mathJaxRuntime = (
  globalThis.FormulaOcrMathJaxRuntime
  || (globalThis.FormulaOcrMathJaxRuntime = createMathJaxRuntime())
);
export const {
  clearMathJax,
  mathJaxToMathML,
  typesetMathJax,
  waitForMathJax,
  withMathJax,
} = mathJaxRuntime;
