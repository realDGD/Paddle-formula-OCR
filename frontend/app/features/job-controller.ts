import { $, endpoint } from '../core/dom.ts';
import type {
  FormulaJob,
  RecognitionJob,
  RecognitionKind,
  StatusSetter,
  TableJob,
  TableResult,
} from '../types.ts';

const ACTIVE_STATUSES = new Set(['queued', 'loading_model', 'running']);
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'timed_out', 'cancelled']);

type CommonOptions = {
  getImageFile: () => File | null;
  idPrefix?: string;
  kind: RecognitionKind;
  setImageJobActive: (active: boolean) => void;
  setStatus: StatusSetter;
};

type FormulaOptions = CommonOptions & {
  copyLatex: () => Promise<void>;
  kind: 'formula';
  renderLatex: () => Promise<void>;
  safelyFormatRecognizedLatex: (value: string) => Promise<{
    formatted: boolean;
    latex: string;
    status: string;
  }>;
  setLatexValue: (value: string) => void;
};

type TableOptions = CommonOptions & {
  kind: 'table';
  setTableResults: (tables: TableResult[]) => void | Promise<void>;
};

export function initializeJobController(options: FormulaOptions | TableOptions) {
  const {
    getImageFile,
    idPrefix = '',
    kind,
    setImageJobActive,
    setStatus,
  } = options;
  const element = <T extends Element = any>(id: string): T => $<T>(`#${idPrefix}${id}`);
  const state = {
    id: null as string | null,
    pollTimer: undefined as number | undefined,
    status: null as string | null,
  };

  function isActive(status: string | null = state.status) {
    return status !== null && ACTIVE_STATUSES.has(status);
  }

  function refreshControls() {
    const active = isActive();
    element<HTMLButtonElement>('recognize').disabled = !getImageFile() || active;
    element<HTMLButtonElement>('cancel-job').hidden = !state.id || !active;
    setImageJobActive(active);
  }

  function stopPolling() {
    window.clearTimeout(state.pollTimer);
    state.pollTimer = undefined;
  }

  async function poll() {
    const jobId = state.id;
    if (!jobId) return;
    try {
      const response = await fetch(endpoint(`api/jobs/${jobId}`));
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || '无法读取任务状态。');
      if (state.id !== jobId) return;
      const job = payload.job as RecognitionJob;
      state.status = job.status;
      const labels: Record<string, string> = {
        queued: `正在排队，第 ${job.queue_position || '?'} 位`,
        loading_model: '正在加载模型（首次加载或切换模型时需要等待）…',
        running: `正在识别${kind === 'table' ? '表格' : '公式'}…`,
        succeeded: '识别完成。',
        failed: `识别失败：${job.error_message || '未知错误'}`,
        timed_out: '识别超时。',
        cancelled: '任务已取消；当前底层推理会自然结束，模型保持加载。',
      };
      setStatus(
        labels[job.status] || job.status,
        ['failed', 'timed_out'].includes(job.status),
        job.status,
      );
      if (job.status === 'succeeded') {
        if (options.kind === 'formula') {
          const formulaJob = job as FormulaJob;
          const recognizedLatex = String(formulaJob.latex_raw || '');
          const formattedResult = await options.safelyFormatRecognizedLatex(recognizedLatex);
          options.setLatexValue(formattedResult.latex);
          await options.renderLatex();
          if (formattedResult.formatted) {
            setStatus('识别完成，源码已通过等价性检查并自动格式化。', false, job.status);
          } else if (!['unchanged', 'formatter-unavailable'].includes(formattedResult.status)) {
            setStatus('识别完成；无法确认格式化结果完全等价，已保留原始源码。', false, job.status);
          }
          if ($<HTMLInputElement>('#auto-copy').checked) await options.copyLatex();
        } else {
          const tables = (job as TableJob).tables || [];
          await options.setTableResults(tables);
          setStatus(`识别完成，共 ${tables.length} 个表格。`, false, job.status);
        }
      }
      refreshControls();
      if (TERMINAL_STATUSES.has(job.status)) {
        stopPolling();
        state.id = null;
        refreshControls();
      }
    } catch (error) {
      if (state.id === jobId) {
        setStatus(`读取任务状态失败，正在重试：${error.message}`, true);
      }
    } finally {
      if (state.id === jobId && isActive()) {
        stopPolling();
        state.pollTimer = window.setTimeout(poll, 750);
      }
    }
  }

  element('recognize').addEventListener('click', async () => {
    const imageFile = getImageFile();
    if (!imageFile) return;
    const body = new FormData();
    body.append('image', imageFile, imageFile.name);
    body.append('kind', kind);
    element<HTMLButtonElement>('recognize').disabled = true;
    setStatus('正在创建任务…', false, 'queued');
    try {
      const response = await fetch(endpoint('api/jobs'), { method: 'POST', body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || '创建任务失败。');
      state.id = payload.job.id;
      state.status = 'queued';
      refreshControls();
      await poll();
    } catch (error) {
      state.id = null;
      state.status = null;
      refreshControls();
      setStatus(error.message, true);
    }
  });

  element('cancel-job').addEventListener('click', async () => {
    if (!state.id) return;
    element<HTMLButtonElement>('cancel-job').disabled = true;
    try {
      const response = await fetch(endpoint(`api/jobs/${state.id}`), { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.detail || '无法取消任务。');
      }
      state.status = 'cancelled';
      setStatus('任务已取消；当前底层推理会自然结束，模型保持加载。', false, 'cancelled');
      stopPolling();
      state.id = null;
      refreshControls();
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      element<HTMLButtonElement>('cancel-job').disabled = false;
    }
  });

  refreshControls();
  return { isActive, refreshControls };
}
