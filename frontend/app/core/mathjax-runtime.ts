const MATHJAX_READY_EVENT: string = 'formula-ocr-mathjax-ready';
const MATHJAX_READY_TIMEOUT_MS = 15000;

type MathJax = {
  startup?: { document?: { clear(): void; reset(): void } };
  tex2mmlPromise?: (latex: string, options?: Record<string, unknown>) => Promise<string>;
  typesetClear?: (elements: unknown[]) => unknown;
  typesetPromise: (elements: unknown[]) => Promise<unknown>;
};

type MathJaxRuntime = ReturnType<typeof createMathJaxRuntime>;
type Host = typeof globalThis & {
  FormulaOcrMathJaxRuntime?: MathJaxRuntime;
  MathJax?: MathJax;
};

function createMathJaxRuntime() {
  let readinessPromise: Promise<MathJax> | null = null;
  let operationQueue: Promise<unknown> = Promise.resolve();

  function hostWindow(): Host {
    return (typeof window === 'undefined' ? globalThis : window) as Host;
  }

  function isReady() {
    return typeof hostWindow().MathJax?.typesetPromise === 'function';
  }

  function waitForMathJax() {
    if (isReady()) return Promise.resolve(hostWindow().MathJax as MathJax);
    if (readinessPromise) return readinessPromise;

    const host = hostWindow();
    const pending = new Promise<MathJax>((resolve, reject) => {
      let settled = false;
      const finish = (callback: (value: any) => void, value: any) => {
        if (settled) return;
        settled = true;
        host.clearTimeout(timeout);
        host.removeEventListener?.(MATHJAX_READY_EVENT, handleReady);
        callback(value);
      };
      const handleReady = () => {
        if (isReady()) finish(resolve, host.MathJax as MathJax);
      };
      const timeout = host.setTimeout(() => {
        if (isReady()) {
          finish(resolve, host.MathJax as MathJax);
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

  function withMathJax<T>(operation: (mathJax: MathJax) => T | Promise<T>): Promise<T> {
    const task = operationQueue
      .catch(() => undefined)
      .then(async () => operation(await waitForMathJax()));
    // A failed dynamic font or extension request must not poison later renders.
    operationQueue = task.catch(() => undefined);
    return task;
  }

  function typesetMathJax(elements: unknown[]) {
    return withMathJax((mathJax) => mathJax.typesetPromise(elements));
  }

  function clearMathJax(elements: unknown[]) {
    if (!isReady()) return Promise.resolve();
    return withMathJax((mathJax) => mathJax.typesetClear?.(elements));
  }

  function mathJaxToMathML(latex: string, options: Record<string, unknown> = {}) {
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
  (globalThis as Host).FormulaOcrMathJaxRuntime
  || ((globalThis as Host).FormulaOcrMathJaxRuntime = createMathJaxRuntime())
);
export const {
  clearMathJax,
  mathJaxToMathML,
  typesetMathJax,
  waitForMathJax,
  withMathJax,
} = mathJaxRuntime;
