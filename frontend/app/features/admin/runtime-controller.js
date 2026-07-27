import { $, endpoint } from '../../core/dom.js';

const RUNTIME_PROFILES = ['cpu', 'cuda118', 'cuda126'];

export function initializeRuntimeController({
  refreshRuntimeAvailability,
  setSettingsSection,
  settingsForm,
}) {
  const bootstrapDialog = $('#bootstrap-dialog');
  const logsDialog = $('#logs-dialog');
  let runtimeInstallTimer = null;
  let bootstrapTimer = null;

  function updateRuntimeInstallControls(installation) {
    const active = ['installing', 'cancelling'].includes(installation?.state);
    const activeProfile = active ? installation.profile : null;
    for (const profile of RUNTIME_PROFILES) {
      $(`#cancel-install-${profile}`).hidden = profile !== activeProfile;
      $(`#install-${profile}`).disabled = active;
    }
  }

  function formatInstallation(installation) {
    const lines = [
      `识别组件：${installation.profile || '未知'}`,
      `状态：${installation.state || '未知'}`,
      `阶段：${installation.phase || '等待开始。'}`,
    ];
    if (installation.started_at) {
      lines.push(`开始时间：${new Date(installation.started_at).toLocaleString()}`);
    }
    if (installation.logs?.length) lines.push('', '最近安装输出：', ...installation.logs.slice(-8));
    if (installation.error) lines.push('', '错误：', installation.error);
    if (installation.result) lines.push('', '安装结果：', JSON.stringify(installation.result, null, 2));
    return lines.join('\n');
  }

  async function pollRuntimeInstallation(profile) {
    try {
      const response = await fetch(endpoint(`api/admin/runtimes/${profile}/install-status`));
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || '无法读取安装进度。');
      const installation = payload.installation;
      $('#settings-message').textContent = formatInstallation(installation);
      updateRuntimeInstallControls(installation);
      if (['installing', 'cancelling'].includes(installation.state)) {
        runtimeInstallTimer = window.setTimeout(() => pollRuntimeInstallation(profile), 1000);
      } else {
        runtimeInstallTimer = null;
      }
    } catch (error) {
      runtimeInstallTimer = null;
      $('#settings-message').textContent = `无法读取安装进度：${error.message}`;
    }
  }

  async function resumeRuntimeInstallation() {
    const response = await fetch(endpoint('api/admin/runtimes/cpu/install-status'));
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || '无法读取安装进度。');
    const installation = payload.installation;
    updateRuntimeInstallControls(installation);
    if (['installing', 'cancelling'].includes(installation.state)) {
      $('#settings-message').textContent = formatInstallation(installation);
      pollRuntimeInstallation(installation.profile);
    } else {
      $('#settings-message').textContent = '';
    }
  }

  async function startRuntimeInstall(profile) {
    if (runtimeInstallTimer) window.clearTimeout(runtimeInstallTimer);
    $('#settings-message').textContent = '正在创建安装任务…';
    const response = await fetch(endpoint(`api/admin/runtimes/${profile}/install`), { method: 'POST' });
    const payload = await response.json();
    if (!response.ok) {
      $('#settings-message').textContent = payload.detail || '无法启动安装。';
      return;
    }
    $('#settings-message').textContent = formatInstallation(payload.installation);
    updateRuntimeInstallControls(payload.installation);
    pollRuntimeInstallation(profile);
  }

  async function cancelRuntimeInstall(profile) {
    const response = await fetch(endpoint(`api/admin/runtimes/${profile}/install`), { method: 'DELETE' });
    const payload = await response.json();
    if (!response.ok) {
      $('#settings-message').textContent = payload.detail || '无法中断安装。';
      return;
    }
    $('#settings-message').textContent = formatInstallation(payload.installation);
    updateRuntimeInstallControls(payload.installation);
    pollRuntimeInstallation(profile);
  }

  async function runtimeAction(profile, action) {
    $('#settings-message').textContent = '正在检测识别组件…';
    const response = await fetch(endpoint(`api/admin/runtimes/${profile}/${action}`), { method: 'POST' });
    const payload = await response.json();
    $('#settings-message').textContent = response.ok
      ? JSON.stringify(payload.diagnostics || payload.installed, null, 2)
      : (payload.detail || '操作失败。');
  }

  function formatBootstrap(progress) {
    const lines = [
      `状态：${progress.state || '未知'}`,
      `阶段：${progress.phase || '等待开始。'}`,
    ];
    if (progress.profiles?.length) lines.push(`识别组件：${progress.profiles.join('、')}`);
    if (progress.logs?.length) lines.push('', '最近输出：', ...progress.logs.slice(-10));
    if (progress.error) lines.push('', '错误：', progress.error);
    if (progress.result) lines.push('', '结果：', JSON.stringify(progress.result, null, 2));
    return lines.join('\n');
  }

  async function pollBootstrap() {
    const response = await fetch(endpoint('api/admin/bootstrap/status'));
    const payload = await response.json();
    if (!response.ok) {
      $('#settings-message').textContent = payload.detail || '无法读取安装进度。';
      return;
    }
    const progress = payload.bootstrap;
    $('#settings-message').textContent = formatBootstrap(progress);
    if (progress.state === 'running') {
      bootstrapTimer = window.setTimeout(pollBootstrap, 1000);
    } else {
      bootstrapTimer = null;
      refreshRuntimeAvailability();
    }
  }

  async function openBootstrapDialog() {
    const response = await fetch(endpoint('api/admin/bootstrap/plan'));
    const payload = await response.json();
    if (!response.ok) {
      $('#settings-message').textContent = payload.detail || '无法检测显卡。';
      return;
    }
    const nvidia = payload.nvidia || {};
    const hasNvidia = Boolean(nvidia.available);
    $('#bootstrap-gpu-choice').hidden = !hasNvidia;
    $('#bootstrap-profile-set').value = 'cpu';
    $('#bootstrap-plan').textContent = hasNvidia
      ? `检测到 NVIDIA 显卡：${(nvidia.gpus || []).join('；')}。请选择要安装的 NVIDIA 加速组件。`
      : `未检测到可用 NVIDIA 显卡或驱动。将只安装 CPU 识别组件。${nvidia.reason ? `（${nvidia.reason}）` : ''}`;
    bootstrapDialog.showModal();
  }

  async function showLogs() {
    logsDialog.showModal();
    $('#logs-output').textContent = '正在读取日志…';
    const response = await fetch(endpoint('api/admin/logs'));
    const payload = await response.json();
    $('#logs-output').textContent = response.ok
      ? (payload.lines?.join('\n') || '暂无日志。')
      : (payload.detail || '无法读取日志。');
  }

  $('#bootstrap-runtime').addEventListener('click', openBootstrapDialog);
  $('#bootstrap-close').addEventListener('click', () => bootstrapDialog.close());
  $('#bootstrap-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const selection = $('#bootstrap-gpu-choice').hidden ? 'cpu' : $('#bootstrap-profile-set').value;
    const profiles = {
      cpu: ['cpu'],
      cuda118: ['cpu', 'cuda118'],
      cuda126: ['cpu', 'cuda126'],
      all: ['cpu', 'cuda118', 'cuda126'],
    }[selection];
    const response = await fetch(endpoint('api/admin/bootstrap'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profiles,
        model_name: settingsForm.elements.namedItem('active_model').value,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      $('#bootstrap-plan').textContent = payload.detail || '无法启动一键安装。';
      return;
    }
    bootstrapDialog.close();
    $('#settings-message').textContent = formatBootstrap(payload.bootstrap);
    if (bootstrapTimer) window.clearTimeout(bootstrapTimer);
    pollBootstrap();
  });
  $('#open-logs').addEventListener('click', showLogs);
  $('#refresh-logs').addEventListener('click', showLogs);
  $('#logs-close').addEventListener('click', () => logsDialog.close());
  $('#open-runtime-setup').addEventListener('click', () => {
    setSettingsSection('runtime');
    $('#open-settings').click();
  });
  $('#install-cpu').addEventListener('click', () => startRuntimeInstall('cpu'));
  $('#install-cuda118').addEventListener('click', () => startRuntimeInstall('cuda118'));
  $('#install-cuda126').addEventListener('click', () => startRuntimeInstall('cuda126'));
  $('#cancel-install-cpu').addEventListener('click', () => cancelRuntimeInstall('cpu'));
  $('#cancel-install-cuda118').addEventListener('click', () => cancelRuntimeInstall('cuda118'));
  $('#cancel-install-cuda126').addEventListener('click', () => cancelRuntimeInstall('cuda126'));
  $('#diagnose-cpu').addEventListener('click', () => runtimeAction('cpu', 'diagnose'));
  $('#diagnose-cuda118').addEventListener('click', () => runtimeAction('cuda118', 'diagnose'));
  $('#diagnose-cuda126').addEventListener('click', () => runtimeAction('cuda126', 'diagnose'));
  $('#smoke-cpu').addEventListener('click', () => runtimeAction('cpu', 'smoke-test'));
  $('#smoke-cuda118').addEventListener('click', () => runtimeAction('cuda118', 'smoke-test'));
  $('#smoke-cuda126').addEventListener('click', () => runtimeAction('cuda126', 'smoke-test'));

  return { resumeRuntimeInstallation };
}
