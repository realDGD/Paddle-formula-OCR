import { $, endpoint } from '../core/dom.js';

const ACTIVE_STATUSES = new Set(['queued', 'loading_model', 'running']);
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'timed_out', 'cancelled']);

export function initializeJobController({
  copyLatex,
  getImageFile,
  renderLatex,
  safelyFormatRecognizedLatex,
  setImageJobActive,
  setLatexValue,
  setStatus,
}) {
  const state = {
    id: null,
    pollTimer: null,
    status: null,
  };

  function isActive(status = state.status) {
    return ACTIVE_STATUSES.has(status);
  }

  function refreshControls() {
    const active = isActive();
    $('#recognize').disabled = !getImageFile() || active;
    $('#cancel-job').hidden = !state.id || !active;
    setImageJobActive(active);
  }

  function stopPolling() {
    window.clearTimeout(state.pollTimer);
    state.pollTimer = null;
  }

  async function poll() {
    const jobId = state.id;
    if (!jobId) return;
    try {
      const response = await fetch(endpoint(`api/jobs/${jobId}`));
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || '无法读取任务状态。');
      if (state.id !== jobId) return;
      const job = payload.job;
      state.status = job.status;
      const labels = {
        queued: `正在排队，第 ${job.queue_position || '?'} 位`,
        loading_model: '正在加载模型（首次加载或切换模型时需要等待）…',
        running: '正在识别公式…',
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
        const recognizedLatex = String(job.latex_raw || '');
        const formattedResult = await safelyFormatRecognizedLatex(recognizedLatex);
        setLatexValue(formattedResult.latex);
        await renderLatex();
        if (formattedResult.formatted) {
          setStatus('识别完成，源码已通过等价性检查并自动格式化。', false, job.status);
        } else if (!['unchanged', 'formatter-unavailable'].includes(formattedResult.status)) {
          setStatus('识别完成；无法确认格式化结果完全等价，已保留原始源码。', false, job.status);
        }
        if ($('#auto-copy').checked) await copyLatex();
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

  $('#recognize').addEventListener('click', async () => {
    const imageFile = getImageFile();
    if (!imageFile) return;
    const body = new FormData();
    body.append('image', imageFile, imageFile.name);
    $('#recognize').disabled = true;
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

  $('#cancel-job').addEventListener('click', async () => {
    if (!state.id) return;
    $('#cancel-job').disabled = true;
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
      $('#cancel-job').disabled = false;
    }
  });

  refreshControls();
  return { isActive, refreshControls };
}
