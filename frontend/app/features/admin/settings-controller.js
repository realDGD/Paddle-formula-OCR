import { $, endpoint } from '../../core/dom.js';

const SETTINGS_SECTIONS = ['general', 'performance', 'api', 'runtime'];

export function initializeSettingsController({ setStatus }) {
  const dialog = $('#settings-dialog');
  const settingsForm = $('#settings-form');
  const preferencesDialog = $('#preferences-dialog');
  const preferencesForm = $('#preferences-form');
  const settingsTabButtons = [...document.querySelectorAll('[data-settings-section]')];
  const apiConfiguration = {
    port: '8504',
    requestTimeout: 450,
    token: '',
  };
  let activeSettingsSection = 'general';
  let settingsOpenedHandler = async () => {};

  try {
    const savedSection = window.sessionStorage.getItem('formula-ocr-settings-section');
    if (SETTINGS_SECTIONS.includes(savedSection)) activeSettingsSection = savedSection;
  } catch {
    // sessionStorage may be unavailable in restricted browser contexts.
  }

  function setSettingsSection(section, { focus = false } = {}) {
    if (!SETTINGS_SECTIONS.includes(section)) return;
    activeSettingsSection = section;
    settingsTabButtons.forEach((button) => {
      const isActive = button.dataset.settingsSection === section;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
      button.tabIndex = isActive ? 0 : -1;
      if (isActive && focus) button.focus();
    });
    document.querySelectorAll('[data-settings-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.settingsPanel !== section;
    });
    try {
      window.sessionStorage.setItem('formula-ocr-settings-section', section);
    } catch {
      // Remembering the selected section is a convenience, not a requirement.
    }
  }

  function rememberApiSettings(payload) {
    if (payload.api_server_port) apiConfiguration.port = String(payload.api_server_port);
    if (payload.api_server_token) apiConfiguration.token = String(payload.api_server_token);
    if (payload.request_timeout_seconds) {
      apiConfiguration.requestTimeout = Number(payload.request_timeout_seconds);
      return;
    }
    const modelLoadTimeout = Number(payload.model_load_timeout_seconds || 300);
    const executionTimeout = Number(payload.execution_timeout_seconds || 120);
    apiConfiguration.requestTimeout = modelLoadTimeout + executionTimeout + 30;
  }

  function populateCpuThreadOptions(cpu = {}, configured = 0) {
    const select = $('#cpu-threads-select');
    if (!select) return;
    const available = Math.max(1, Number(cpu.available_threads) || 1);
    const selected = Number(configured) || 0;
    const options = [new Option(`自动检测（当前使用 ${available} 线程，推荐）`, '0')];
    for (let threads = 1; threads <= available; threads += 1) {
      options.push(new Option(`${threads} 线程`, String(threads)));
    }
    if (selected > available) {
      options.push(new Option(`${selected} 线程（超过当前可用数量，将自动限制）`, String(selected)));
    }
    select.replaceChildren(...options);
    select.value = String(selected);
    const effective = Number(cpu.effective_threads) || Math.min(selected || available, available);
    const help = $('#cpu-threads-help');
    if (help) {
      help.textContent = `检测到 fnOS 为应用提供 ${available} 个可用逻辑 CPU；当前实际使用 ${effective} 个线程。`;
    }
  }

  function renderDownloadSources(sources) {
    const container = $('#settings-sources');
    const entries = [
      ['CPU 识别组件', sources.cpu_paddle || '未提供'],
      ['NVIDIA CUDA 11.8', sources.cuda118_paddle || '未提供'],
      ['NVIDIA CUDA 12.6', sources.cuda126_paddle || '未提供'],
      ['CUDA PaddleOCR', sources.cuda_paddleocr || '未提供'],
      ['模型', sources.formula_models || '未提供'],
    ];
    const title = document.createElement('h3');
    title.textContent = '下载源';
    const list = document.createElement('dl');
    for (const [label, value] of entries) {
      const term = document.createElement('dt');
      term.textContent = label;
      const detail = document.createElement('dd');
      detail.textContent = value;
      list.append(term, detail);
    }
    container.replaceChildren(title, list);
  }

  async function refreshRuntimeAvailability() {
    try {
      const response = await fetch(endpoint('api/system-info'));
      const payload = await response.json();
      if (!response.ok) return;
      $('#runtime-setup-notice').hidden = Object.values(payload.runtimes || {}).some(Boolean);
      const isAdmin = Boolean(payload.user?.is_admin);
      $('#open-settings').hidden = !isAdmin;
      $('#open-runtime-setup').hidden = !isAdmin;
    } catch {
      // The normal recognition request will present any gateway error.
    }
  }

  async function loadInitialSettings() {
    try {
      const response = await fetch(endpoint('api/system-info'));
      if (!response.ok) return;
      const payload = await response.json();
      if (!payload?.settings) return;
      rememberApiSettings(payload.settings);
      const checkbox = $('#api_server_enabled');
      if (checkbox) checkbox.checked = Boolean(payload.settings.api_server_enabled);
      const isAdmin = Boolean(payload.user?.is_admin);
      $('#open-settings').hidden = !isAdmin;
      $('#open-runtime-setup').hidden = !isAdmin;
    } catch (error) {
      console.warn('加载初始配置失败:', error);
    }
  }

  settingsTabButtons.forEach((button, index) => {
    button.addEventListener('click', () => setSettingsSection(button.dataset.settingsSection));
    button.addEventListener('keydown', (event) => {
      let nextIndex = null;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        nextIndex = (index + 1) % settingsTabButtons.length;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        nextIndex = (index - 1 + settingsTabButtons.length) % settingsTabButtons.length;
      }
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = settingsTabButtons.length - 1;
      if (nextIndex === null) return;
      event.preventDefault();
      setSettingsSection(settingsTabButtons[nextIndex].dataset.settingsSection, { focus: true });
    });
  });
  setSettingsSection(activeSettingsSection);

  $('#open-preferences').addEventListener('click', async () => {
    const message = $('#preferences-message');
    if (message) message.textContent = '正在读取个人设置…';
    try {
      const response = await fetch(endpoint('api/preferences'));
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || '无法读取个人设置。');
      preferencesForm.elements.namedItem('launch_mode').value = payload.preferences.launch_mode;
      if (message) message.textContent = '';
      preferencesDialog.showModal();
    } catch (error) {
      setStatus(error.message, true);
    }
  });
  $('#close-preferences').addEventListener('click', () => preferencesDialog.close());
  $('#cancel-preferences').addEventListener('click', () => preferencesDialog.close());
  preferencesForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = $('#preferences-message');
    const launchMode = preferencesForm.elements.namedItem('launch_mode').value;
    const response = await fetch(endpoint('api/preferences'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ launch_mode: launchMode }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (message) message.textContent = payload.detail || '保存个人设置失败。';
      return;
    }
    if (message) message.textContent = '个人设置已保存。';
    preferencesDialog.close();
  });

  $('#open-settings').addEventListener('click', async () => {
    try {
      const response = await fetch(endpoint('api/settings'));
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || '无管理员权限。');
      for (const [key, value] of Object.entries(payload.settings)) {
        const field = settingsForm.elements.namedItem(key);
        if (!field) continue;
        if (field.type === 'checkbox') field.checked = Boolean(value);
        else field.value = value;
      }
      rememberApiSettings(payload.settings);
      populateCpuThreadOptions(payload.cpu, payload.settings.cpu_threads);
      $('#settings-message').textContent = payload.api_server_status?.error || '';
      for (const profile of ['cpu', 'cuda118', 'cuda126']) {
        $(`#runtime-status-${profile}`).textContent = payload.runtimes[profile] ? '已安装' : '未安装';
      }
      renderDownloadSources(payload.download_sources || {});
      setSettingsSection(activeSettingsSection);
      dialog.showModal();
      await settingsOpenedHandler();
    } catch (error) {
      setStatus(error.message, true);
    }
  });
  $('#close-settings').addEventListener('click', () => dialog.close());
  $('#cancel-settings').addEventListener('click', () => dialog.close());
  settingsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data = Object.fromEntries(form);
    data.api_server_enabled = settingsForm.elements.namedItem('api_server_enabled').checked;
    for (const key of [
      'model_load_timeout_seconds',
      'execution_timeout_seconds',
      'cpu_threads',
      'max_queue_size',
      'max_queued_per_user',
      'job_retention_days',
    ]) {
      if (data[key] !== undefined && data[key] !== '') data[key] = Number(data[key]);
    }
    const response = await fetch(endpoint('api/settings'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const payload = await response.json();
    if (response.ok) {
      rememberApiSettings(payload.settings);
      $('#settings-message').textContent = '设置已保存。';
      dialog.close();
    } else {
      $('#settings-message').textContent = payload.detail || '保存失败。';
    }
  });

  loadInitialSettings();
  refreshRuntimeAvailability();

  return {
    apiConfiguration,
    refreshRuntimeAvailability,
    rememberApiSettings,
    setSettingsOpenedHandler(handler) {
      settingsOpenedHandler = handler;
    },
    setSettingsSection,
    settingsForm,
  };
}
