"use strict";
(() => {
  // frontend/app/core/dom.ts
  var $ = (selector, root = document) => root.querySelector(selector);
  function endpoint(path) {
    return new URL(path, document.baseURI).toString();
  }
  function escapeHtml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function closestAllowedValue(value, allowed, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return allowed.reduce((closest, candidate) => Math.abs(candidate - numeric) < Math.abs(closest - numeric) ? candidate : closest, fallback);
  }

  // frontend/app/features/admin/api-client-controller.ts
  function initializeApiClientController({
    apiConfiguration,
    rememberApiSettings
  }) {
    const dialog = $("#api-setup-dialog");
    function generateApiScriptCode() {
      const host = window.location.hostname;
      const isIPv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(host) && host !== "127.0.0.1";
      const serverIp = isIPv4 ? host : "\u586B\u5199\u4F60\u7684\u5C40\u57DF\u7F51 IP";
      const port = apiConfiguration.port || "8504";
      const token = apiConfiguration.token || "\u8BF7\u91CD\u65B0\u6253\u5F00\u5BA2\u6237\u7AEF\u793A\u4F8B\u4EE5\u8BFB\u53D6 Token";
      return `import requests
from PIL import ImageGrab
import pyperclip
import io

# \u{1F534} \u98DE\u725B NAS \u5BBF\u4E3B\u673A\u7EDF\u4E00\u653E\u884C\u7684\u5C40\u57DF\u7F51\u72EC\u7ACB API \u7AEF\u53E3 ${port}
SERVER_IP = "${serverIp}"
SERVER_URL = f"http://{SERVER_IP}:${port}/predict"
API_TOKEN = "${token}"

def main():
    img = ImageGrab.grabclipboard()
    if img is None:
        print("\u274C \u9519\u8BEF\uFF1A\u526A\u5207\u677F\u4E2D\u6CA1\u6709\u56FE\u7247\uFF01\u8BF7\u5148\u622A\u56FE\u3002")
        return

    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='PNG')
    img_byte_arr.seek(0)

    files = {'file': ('screenshot.png', img_byte_arr, 'image/png')}
    session = requests.Session()
    session.trust_env = False  # \u7981\u7528\u4EE3\u7406\u73AF\u5883

    try:
        response = session.post(
            SERVER_URL,
            headers={"Authorization": f"Bearer {API_TOKEN}"},
            files=files,
            timeout=(5, ${apiConfiguration.requestTimeout}),
        )
        print(f"DEBUG - \u72B6\u6001\u7801: {response.status_code}, \u5185\u5BB9\u7C7B\u578B: {response.headers.get('Content-Type')}")

        try:
            result = response.json()
        except Exception:
            print(f"\u274C \u8FD4\u56DE\u7684\u5185\u5BB9\u4E0D\u662F JSON\uFF1A\\n{response.text[:300]}")
            return

        if not response.ok:
            error_message = result.get("detail") or result.get("message") or str(result)
            print(f"\u274C \u8BF7\u6C42\u5931\u8D25\uFF1A{error_message}")
            if response.status_code == 401:
                print("\u8BF7\u91CD\u65B0\u6253\u5F00 Python \u5BA2\u6237\u7AEF\u793A\u4F8B\u5E76\u590D\u5236\u5305\u542B\u6700\u65B0 API_TOKEN \u7684\u4EE3\u7801\u3002")
            return

        if result.get("status") == "success":
            latex = result.get("latex")
            pyperclip.copy(latex)
            print("\u2705 \u8BC6\u522B\u6210\u529F\uFF01\u516C\u5F0F\u4EE3\u7801\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F\u3002")
        else:
            print(f"\u274C \u8BC6\u522B\u5931\u8D25\uFF1A{result.get('message') or result.get('detail') or result}")

    except Exception as e:
        print(f"\u274C \u8FDE\u63A5\u5931\u8D25: {e}")

if __name__ == "__main__":
    main()`;
    }
    function highlightPythonCode(code) {
      const escapeCode = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const highlightPlain = (value) => escapeCode(value).replace(/\b(import|from|def|if|else|try|except|return|print|as|None|True|False|is|not|in|and|or)\b|\b(\d+)\b|\b([a-zA-Z_]\w*)(?=\()/g, (match, keyword, number) => {
        if (keyword) return `<span class="py-keyword">${match}</span>`;
        if (number) return `<span class="py-number">${match}</span>`;
        return `<span class="py-function">${match}</span>`;
      });
      return code.split("\n").map((line) => {
        const parts = [];
        let plainStart = 0;
        for (let index = 0; index < line.length; ) {
          const char = line[index];
          if (char === "#") {
            parts.push(highlightPlain(line.slice(plainStart, index)));
            parts.push(`<span class="py-comment">${escapeCode(line.slice(index))}</span>`);
            return parts.join("");
          }
          if (char === '"' || char === "'") {
            parts.push(highlightPlain(line.slice(plainStart, index)));
            const quote = char;
            let end = index + 1;
            while (end < line.length) {
              if (line[end] === quote && line[end - 1] !== "\\") {
                end += 1;
                break;
              }
              end += 1;
            }
            parts.push(`<span class="py-string">${escapeCode(line.slice(index, end))}</span>`);
            index = end;
            plainStart = end;
            continue;
          }
          index += 1;
        }
        parts.push(highlightPlain(line.slice(plainStart)));
        return parts.join("");
      }).join("\n");
    }
    function renderApiClientCode() {
      const code = generateApiScriptCode();
      $("#api-client-code-block").innerHTML = highlightPythonCode(code);
      const rawInput = $("#api-raw-code-input");
      if (rawInput) rawInput.value = code;
    }
    async function refreshApiClientCredentials() {
      const statusElement = $("#api-client-credential-status");
      if (statusElement) statusElement.textContent = "\u6B63\u5728\u8BFB\u53D6\u5F53\u524D API Token\u2026";
      try {
        const response = await fetch(endpoint("api/admin/api-client"));
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.api_server_token) {
          if (statusElement) {
            statusElement.textContent = payload.detail ? `\u672A\u80FD\u81EA\u52A8\u8BFB\u53D6 Token\uFF1A${payload.detail}` : "\u672A\u80FD\u81EA\u52A8\u8BFB\u53D6 Token\u3002";
          }
          return false;
        }
        rememberApiSettings(payload);
        if (statusElement) {
          statusElement.textContent = "\u5F53\u524D\u6709\u6548 Token \u4EC5\u663E\u793A\u5728\u4E0B\u65B9\u793A\u4F8B\u4EE3\u7801\u4E2D\uFF0C\u53EF\u76F4\u63A5\u590D\u5236\u8FD0\u884C\u3002";
        }
        return true;
      } catch (error) {
        if (statusElement) statusElement.textContent = `\u8BFB\u53D6 Token \u5931\u8D25\uFF1A${error.message}`;
        return false;
      }
    }
    $("#open-api-setup")?.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!dialog) return;
      dialog.showModal();
      await refreshApiClientCredentials();
      renderApiClientCode();
    });
    $("#api-setup-close")?.addEventListener("click", () => dialog?.close());
    $("#regenerate-api-token")?.addEventListener("click", async () => {
      if (!window.confirm("\u91CD\u65B0\u751F\u6210\u540E\uFF0C\u6240\u6709\u4F7F\u7528\u65E7 Token \u7684\u5BA2\u6237\u7AEF\u4F1A\u7ACB\u5373\u65E0\u6CD5\u8BBF\u95EE\u3002\u786E\u5B9A\u7EE7\u7EED\u5417\uFF1F")) return;
      const button = $("#regenerate-api-token");
      const statusElement = $("#api-client-credential-status");
      button.disabled = true;
      if (statusElement) statusElement.textContent = "\u6B63\u5728\u4F7F\u65E7 Token \u5931\u6548\u2026";
      try {
        const response = await fetch(endpoint("api/admin/api-token"), { method: "POST" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.api_server_token) {
          throw new Error(payload.detail || "\u91CD\u65B0\u751F\u6210 Token \u5931\u8D25\u3002");
        }
        rememberApiSettings(payload);
        renderApiClientCode();
        if (statusElement) {
          statusElement.textContent = "Token \u5DF2\u91CD\u65B0\u751F\u6210\uFF1B\u65B0 Token \u4EC5\u663E\u793A\u5728\u4E0B\u65B9\u793A\u4F8B\u4EE3\u7801\u4E2D\u3002";
        }
      } catch (error) {
        if (statusElement) statusElement.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
    $("#copy-api-script")?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const button = $("#copy-api-script");
      if (button) button.blur();
      const rawCode = generateApiScriptCode();
      const rawInput = $("#api-raw-code-input");
      if (rawInput) rawInput.value = rawCode;
      const selection = window.getSelection();
      if (selection) selection.removeAllRanges();
      let copied = false;
      if (rawInput) {
        try {
          rawInput.focus();
          rawInput.select();
          rawInput.setSelectionRange(0, rawCode.length);
          copied = document.execCommand("copy");
        } catch {
        }
      }
      if (!copied && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(rawCode);
          copied = true;
        } catch {
        }
      }
      if (selection) selection.removeAllRanges();
      if (copied) {
        if (button) {
          const originalText = button.textContent;
          button.textContent = "\u5DF2\u590D\u5236\uFF01";
          setTimeout(() => {
            button.textContent = originalText;
          }, 2e3);
        }
        return;
      }
      const codeBlock = $("#api-client-code-block");
      if (codeBlock) {
        const range = document.createRange();
        range.selectNodeContents(codeBlock);
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
      if (button) {
        const originalText = button.textContent;
        button.textContent = "\u5DF2\u9009\u4E2D\u4EE3\u7801\uFF0C\u8BF7\u6309 Ctrl+C / \u2318C";
        setTimeout(() => {
          button.textContent = originalText;
        }, 2500);
      }
    });
  }

  // frontend/app/features/admin/runtime-controller.ts
  var RUNTIME_PROFILES = ["cpu", "cuda118", "cuda126"];
  function initializeRuntimeController({
    refreshRuntimeAvailability,
    setSettingsSection,
    settingsForm
  }) {
    const bootstrapDialog = $("#bootstrap-dialog");
    const logsDialog = $("#logs-dialog");
    let runtimeInstallTimer;
    let bootstrapTimer;
    function updateRuntimeInstallControls(installation) {
      const active = ["installing", "cancelling"].includes(installation?.state);
      const activeProfile = active ? installation.profile : null;
      for (const profile of RUNTIME_PROFILES) {
        $(`#cancel-install-${profile}`).hidden = profile !== activeProfile;
        $(`#install-${profile}`).disabled = active;
      }
    }
    function formatInstallation(installation) {
      const lines = [
        `\u8BC6\u522B\u7EC4\u4EF6\uFF1A${installation.profile || "\u672A\u77E5"}`,
        `\u72B6\u6001\uFF1A${installation.state || "\u672A\u77E5"}`,
        `\u9636\u6BB5\uFF1A${installation.phase || "\u7B49\u5F85\u5F00\u59CB\u3002"}`
      ];
      if (installation.started_at) {
        lines.push(`\u5F00\u59CB\u65F6\u95F4\uFF1A${new Date(installation.started_at).toLocaleString()}`);
      }
      if (installation.logs?.length) lines.push("", "\u6700\u8FD1\u5B89\u88C5\u8F93\u51FA\uFF1A", ...installation.logs.slice(-8));
      if (installation.error) lines.push("", "\u9519\u8BEF\uFF1A", installation.error);
      if (installation.result) lines.push("", "\u5B89\u88C5\u7ED3\u679C\uFF1A", JSON.stringify(installation.result, null, 2));
      return lines.join("\n");
    }
    async function pollRuntimeInstallation(profile) {
      try {
        const response = await fetch(endpoint(`api/admin/runtimes/${profile}/install-status`));
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail || "\u65E0\u6CD5\u8BFB\u53D6\u5B89\u88C5\u8FDB\u5EA6\u3002");
        const installation = payload.installation;
        $("#settings-message").textContent = formatInstallation(installation);
        updateRuntimeInstallControls(installation);
        if (["installing", "cancelling"].includes(installation.state)) {
          runtimeInstallTimer = window.setTimeout(() => pollRuntimeInstallation(profile), 1e3);
        } else {
          runtimeInstallTimer = void 0;
        }
      } catch (error) {
        runtimeInstallTimer = void 0;
        $("#settings-message").textContent = `\u65E0\u6CD5\u8BFB\u53D6\u5B89\u88C5\u8FDB\u5EA6\uFF1A${error.message}`;
      }
    }
    async function resumeRuntimeInstallation() {
      const response = await fetch(endpoint("api/admin/runtimes/cpu/install-status"));
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "\u65E0\u6CD5\u8BFB\u53D6\u5B89\u88C5\u8FDB\u5EA6\u3002");
      const installation = payload.installation;
      updateRuntimeInstallControls(installation);
      if (["installing", "cancelling"].includes(installation.state)) {
        $("#settings-message").textContent = formatInstallation(installation);
        pollRuntimeInstallation(installation.profile);
      } else {
        $("#settings-message").textContent = "";
      }
    }
    async function startRuntimeInstall(profile) {
      if (runtimeInstallTimer) window.clearTimeout(runtimeInstallTimer);
      $("#settings-message").textContent = "\u6B63\u5728\u521B\u5EFA\u5B89\u88C5\u4EFB\u52A1\u2026";
      const response = await fetch(endpoint(`api/admin/runtimes/${profile}/install`), { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        $("#settings-message").textContent = payload.detail || "\u65E0\u6CD5\u542F\u52A8\u5B89\u88C5\u3002";
        return;
      }
      $("#settings-message").textContent = formatInstallation(payload.installation);
      updateRuntimeInstallControls(payload.installation);
      pollRuntimeInstallation(profile);
    }
    async function cancelRuntimeInstall(profile) {
      const response = await fetch(endpoint(`api/admin/runtimes/${profile}/install`), { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) {
        $("#settings-message").textContent = payload.detail || "\u65E0\u6CD5\u4E2D\u65AD\u5B89\u88C5\u3002";
        return;
      }
      $("#settings-message").textContent = formatInstallation(payload.installation);
      updateRuntimeInstallControls(payload.installation);
      pollRuntimeInstallation(profile);
    }
    async function runtimeAction(profile, action) {
      $("#settings-message").textContent = "\u6B63\u5728\u68C0\u6D4B\u8BC6\u522B\u7EC4\u4EF6\u2026";
      const response = await fetch(endpoint(`api/admin/runtimes/${profile}/${action}`), { method: "POST" });
      const payload = await response.json();
      $("#settings-message").textContent = response.ok ? JSON.stringify(payload.diagnostics || payload.installed, null, 2) : payload.detail || "\u64CD\u4F5C\u5931\u8D25\u3002";
    }
    function formatBootstrap(progress) {
      const lines = [
        `\u72B6\u6001\uFF1A${progress.state || "\u672A\u77E5"}`,
        `\u9636\u6BB5\uFF1A${progress.phase || "\u7B49\u5F85\u5F00\u59CB\u3002"}`
      ];
      if (progress.profiles?.length) lines.push(`\u8BC6\u522B\u7EC4\u4EF6\uFF1A${progress.profiles.join("\u3001")}`);
      if (progress.logs?.length) lines.push("", "\u6700\u8FD1\u8F93\u51FA\uFF1A", ...progress.logs.slice(-10));
      if (progress.error) lines.push("", "\u9519\u8BEF\uFF1A", progress.error);
      if (progress.result) lines.push("", "\u7ED3\u679C\uFF1A", JSON.stringify(progress.result, null, 2));
      return lines.join("\n");
    }
    async function pollBootstrap() {
      const response = await fetch(endpoint("api/admin/bootstrap/status"));
      const payload = await response.json();
      if (!response.ok) {
        $("#settings-message").textContent = payload.detail || "\u65E0\u6CD5\u8BFB\u53D6\u5B89\u88C5\u8FDB\u5EA6\u3002";
        return;
      }
      const progress = payload.bootstrap;
      $("#settings-message").textContent = formatBootstrap(progress);
      if (progress.state === "running") {
        bootstrapTimer = window.setTimeout(pollBootstrap, 1e3);
      } else {
        bootstrapTimer = void 0;
        refreshRuntimeAvailability();
      }
    }
    async function openBootstrapDialog() {
      const response = await fetch(endpoint("api/admin/bootstrap/plan"));
      const payload = await response.json();
      if (!response.ok) {
        $("#settings-message").textContent = payload.detail || "\u65E0\u6CD5\u68C0\u6D4B\u663E\u5361\u3002";
        return;
      }
      const nvidia = payload.nvidia || {};
      const hasNvidia = Boolean(nvidia.available);
      $("#bootstrap-gpu-choice").hidden = !hasNvidia;
      $("#bootstrap-profile-set").value = "cpu";
      $("#bootstrap-plan").textContent = hasNvidia ? `\u68C0\u6D4B\u5230 NVIDIA \u663E\u5361\uFF1A${(nvidia.gpus || []).join("\uFF1B")}\u3002\u8BF7\u9009\u62E9\u8981\u5B89\u88C5\u7684 NVIDIA \u52A0\u901F\u7EC4\u4EF6\u3002` : `\u672A\u68C0\u6D4B\u5230\u53EF\u7528 NVIDIA \u663E\u5361\u6216\u9A71\u52A8\u3002\u5C06\u53EA\u5B89\u88C5 CPU \u8BC6\u522B\u7EC4\u4EF6\u3002${nvidia.reason ? `\uFF08${nvidia.reason}\uFF09` : ""}`;
      bootstrapDialog.showModal();
    }
    async function showLogs() {
      logsDialog.showModal();
      $("#logs-output").textContent = "\u6B63\u5728\u8BFB\u53D6\u65E5\u5FD7\u2026";
      const response = await fetch(endpoint("api/admin/logs"));
      const payload = await response.json();
      $("#logs-output").textContent = response.ok ? payload.lines?.join("\n") || "\u6682\u65E0\u65E5\u5FD7\u3002" : payload.detail || "\u65E0\u6CD5\u8BFB\u53D6\u65E5\u5FD7\u3002";
    }
    $("#bootstrap-runtime").addEventListener("click", openBootstrapDialog);
    $("#bootstrap-close").addEventListener("click", () => bootstrapDialog.close());
    $("#bootstrap-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const profileChoices = {
        cpu: ["cpu"],
        cuda118: ["cpu", "cuda118"],
        cuda126: ["cpu", "cuda126"],
        all: ["cpu", "cuda118", "cuda126"]
      };
      const selection = $("#bootstrap-gpu-choice").hidden ? "cpu" : $("#bootstrap-profile-set").value;
      const profiles = profileChoices[selection];
      const response = await fetch(endpoint("api/admin/bootstrap"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profiles,
          model_name: settingsForm.elements.namedItem("active_model").value
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        $("#bootstrap-plan").textContent = payload.detail || "\u65E0\u6CD5\u542F\u52A8\u4E00\u952E\u5B89\u88C5\u3002";
        return;
      }
      bootstrapDialog.close();
      $("#settings-message").textContent = formatBootstrap(payload.bootstrap);
      if (bootstrapTimer) window.clearTimeout(bootstrapTimer);
      pollBootstrap();
    });
    $("#open-logs").addEventListener("click", showLogs);
    $("#refresh-logs").addEventListener("click", showLogs);
    $("#logs-close").addEventListener("click", () => logsDialog.close());
    $("#open-runtime-setup").addEventListener("click", () => {
      setSettingsSection("runtime");
      $("#open-settings").click();
    });
    $("#install-cpu").addEventListener("click", () => startRuntimeInstall("cpu"));
    $("#install-cuda118").addEventListener("click", () => startRuntimeInstall("cuda118"));
    $("#install-cuda126").addEventListener("click", () => startRuntimeInstall("cuda126"));
    $("#cancel-install-cpu").addEventListener("click", () => cancelRuntimeInstall("cpu"));
    $("#cancel-install-cuda118").addEventListener("click", () => cancelRuntimeInstall("cuda118"));
    $("#cancel-install-cuda126").addEventListener("click", () => cancelRuntimeInstall("cuda126"));
    $("#diagnose-cpu").addEventListener("click", () => runtimeAction("cpu", "diagnose"));
    $("#diagnose-cuda118").addEventListener("click", () => runtimeAction("cuda118", "diagnose"));
    $("#diagnose-cuda126").addEventListener("click", () => runtimeAction("cuda126", "diagnose"));
    $("#smoke-cpu").addEventListener("click", () => runtimeAction("cpu", "smoke-test"));
    $("#smoke-cuda118").addEventListener("click", () => runtimeAction("cuda118", "smoke-test"));
    $("#smoke-cuda126").addEventListener("click", () => runtimeAction("cuda126", "smoke-test"));
    return { resumeRuntimeInstallation };
  }

  // frontend/app/features/admin/settings-controller.ts
  var SETTINGS_SECTIONS = ["general", "performance", "api", "runtime"];
  function initializeSettingsController({ setStatus }) {
    const dialog = $("#settings-dialog");
    const settingsForm = $("#settings-form");
    const preferencesDialog = $("#preferences-dialog");
    const preferencesForm = $("#preferences-form");
    const settingsTabButtons = [...document.querySelectorAll("[data-settings-section]")];
    const apiConfiguration = {
      port: "8504",
      requestTimeout: 450,
      token: ""
    };
    let activeSettingsSection = "general";
    let settingsOpenedHandler = async () => {
    };
    try {
      const savedSection = window.sessionStorage.getItem("formula-ocr-settings-section");
      if (savedSection && SETTINGS_SECTIONS.includes(savedSection)) activeSettingsSection = savedSection;
    } catch {
    }
    function setSettingsSection(section, { focus = false } = {}) {
      if (!section) return;
      if (!SETTINGS_SECTIONS.includes(section)) return;
      activeSettingsSection = section;
      settingsTabButtons.forEach((button) => {
        const isActive = button.dataset.settingsSection === section;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", String(isActive));
        button.tabIndex = isActive ? 0 : -1;
        if (isActive && focus) button.focus();
      });
      document.querySelectorAll("[data-settings-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.settingsPanel !== section;
      });
      try {
        window.sessionStorage.setItem("formula-ocr-settings-section", section);
      } catch {
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
      const select = $("#cpu-threads-select");
      if (!select) return;
      const available = Math.max(1, Number(cpu.available_threads) || 1);
      const selected = Number(configured) || 0;
      const options = [new Option(`\u81EA\u52A8\u68C0\u6D4B\uFF08\u5F53\u524D\u4F7F\u7528 ${available} \u7EBF\u7A0B\uFF0C\u63A8\u8350\uFF09`, "0")];
      for (let threads = 1; threads <= available; threads += 1) {
        options.push(new Option(`${threads} \u7EBF\u7A0B`, String(threads)));
      }
      if (selected > available) {
        options.push(new Option(`${selected} \u7EBF\u7A0B\uFF08\u8D85\u8FC7\u5F53\u524D\u53EF\u7528\u6570\u91CF\uFF0C\u5C06\u81EA\u52A8\u9650\u5236\uFF09`, String(selected)));
      }
      select.replaceChildren(...options);
      select.value = String(selected);
      const effective = Number(cpu.effective_threads) || Math.min(selected || available, available);
      const help = $("#cpu-threads-help");
      if (help) {
        help.textContent = `\u68C0\u6D4B\u5230 fnOS \u4E3A\u5E94\u7528\u63D0\u4F9B ${available} \u4E2A\u53EF\u7528\u903B\u8F91 CPU\uFF1B\u5F53\u524D\u5B9E\u9645\u4F7F\u7528 ${effective} \u4E2A\u7EBF\u7A0B\u3002`;
      }
    }
    function renderDownloadSources(sources) {
      const container = $("#settings-sources");
      const entries = [
        ["CPU \u8BC6\u522B\u7EC4\u4EF6", sources.cpu_paddle || "\u672A\u63D0\u4F9B"],
        ["NVIDIA CUDA 11.8", sources.cuda118_paddle || "\u672A\u63D0\u4F9B"],
        ["NVIDIA CUDA 12.6", sources.cuda126_paddle || "\u672A\u63D0\u4F9B"],
        ["CUDA PaddleOCR", sources.cuda_paddleocr || "\u672A\u63D0\u4F9B"],
        ["\u6A21\u578B", sources.formula_models || "\u672A\u63D0\u4F9B"]
      ];
      const title = document.createElement("h3");
      title.textContent = "\u4E0B\u8F7D\u6E90";
      const list = document.createElement("dl");
      for (const [label, value] of entries) {
        const term = document.createElement("dt");
        term.textContent = label;
        const detail = document.createElement("dd");
        detail.textContent = value;
        list.append(term, detail);
      }
      container.replaceChildren(title, list);
    }
    async function refreshRuntimeAvailability() {
      try {
        const response = await fetch(endpoint("api/system-info"));
        const payload = await response.json();
        if (!response.ok) return;
        $("#runtime-setup-notice").hidden = Object.values(payload.runtimes || {}).some(Boolean);
        const isAdmin = Boolean(payload.user?.is_admin);
        $("#open-settings").hidden = !isAdmin;
        $("#open-runtime-setup").hidden = !isAdmin;
      } catch {
      }
    }
    async function loadInitialSettings() {
      try {
        const response = await fetch(endpoint("api/system-info"));
        if (!response.ok) return;
        const payload = await response.json();
        if (!payload?.settings) return;
        rememberApiSettings(payload.settings);
        const checkbox = $("#api_server_enabled");
        if (checkbox) checkbox.checked = Boolean(payload.settings.api_server_enabled);
        const isAdmin = Boolean(payload.user?.is_admin);
        $("#open-settings").hidden = !isAdmin;
        $("#open-runtime-setup").hidden = !isAdmin;
      } catch (error) {
        console.warn("\u52A0\u8F7D\u521D\u59CB\u914D\u7F6E\u5931\u8D25:", error);
      }
    }
    settingsTabButtons.forEach((button, index) => {
      button.addEventListener("click", () => setSettingsSection(button.dataset.settingsSection));
      button.addEventListener("keydown", (event) => {
        let nextIndex = null;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          nextIndex = (index + 1) % settingsTabButtons.length;
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          nextIndex = (index - 1 + settingsTabButtons.length) % settingsTabButtons.length;
        }
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = settingsTabButtons.length - 1;
        if (nextIndex === null) return;
        event.preventDefault();
        setSettingsSection(settingsTabButtons[nextIndex].dataset.settingsSection, { focus: true });
      });
    });
    setSettingsSection(activeSettingsSection);
    $("#open-preferences").addEventListener("click", async () => {
      const message = $("#preferences-message");
      if (message) message.textContent = "\u6B63\u5728\u8BFB\u53D6\u4E2A\u4EBA\u8BBE\u7F6E\u2026";
      try {
        const response = await fetch(endpoint("api/preferences"));
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.detail || "\u65E0\u6CD5\u8BFB\u53D6\u4E2A\u4EBA\u8BBE\u7F6E\u3002");
        preferencesForm.elements.namedItem("launch_mode").value = payload.preferences.launch_mode;
        if (message) message.textContent = "";
        preferencesDialog.showModal();
      } catch (error) {
        setStatus(error.message, true);
      }
    });
    $("#close-preferences").addEventListener("click", () => preferencesDialog.close());
    $("#cancel-preferences").addEventListener("click", () => preferencesDialog.close());
    preferencesForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const message = $("#preferences-message");
      const launchMode = preferencesForm.elements.namedItem("launch_mode").value;
      const response = await fetch(endpoint("api/preferences"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ launch_mode: launchMode })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (message) message.textContent = payload.detail || "\u4FDD\u5B58\u4E2A\u4EBA\u8BBE\u7F6E\u5931\u8D25\u3002";
        return;
      }
      if (message) message.textContent = "\u4E2A\u4EBA\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\u3002";
      preferencesDialog.close();
    });
    $("#open-settings").addEventListener("click", async () => {
      try {
        const response = await fetch(endpoint("api/settings"));
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail || "\u65E0\u7BA1\u7406\u5458\u6743\u9650\u3002");
        for (const [key, value] of Object.entries(payload.settings)) {
          const field = settingsForm.elements.namedItem(key);
          if (!field) continue;
          if (field.type === "checkbox") field.checked = Boolean(value);
          else field.value = String(value ?? "");
        }
        rememberApiSettings(payload.settings);
        populateCpuThreadOptions(payload.cpu, payload.settings.cpu_threads);
        $("#settings-message").textContent = payload.api_server_status?.error || "";
        for (const profile of ["cpu", "cuda118", "cuda126"]) {
          $(`#runtime-status-${profile}`).textContent = payload.runtimes[profile] ? "\u5DF2\u5B89\u88C5" : "\u672A\u5B89\u88C5";
        }
        renderDownloadSources(payload.download_sources || {});
        setSettingsSection(activeSettingsSection);
        dialog.showModal();
        await settingsOpenedHandler();
      } catch (error) {
        setStatus(error.message, true);
      }
    });
    $("#close-settings").addEventListener("click", () => dialog.close());
    $("#cancel-settings").addEventListener("click", () => dialog.close());
    settingsForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(settingsForm);
      const data = Object.fromEntries(form);
      data.api_server_enabled = settingsForm.elements.namedItem("api_server_enabled").checked;
      for (const key of [
        "model_load_timeout_seconds",
        "execution_timeout_seconds",
        "cpu_threads",
        "max_queue_size",
        "max_queued_per_user",
        "job_retention_days"
      ]) {
        if (data[key] !== void 0 && data[key] !== "") data[key] = Number(data[key]);
      }
      const response = await fetch(endpoint("api/settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const payload = await response.json();
      if (response.ok) {
        rememberApiSettings(payload.settings);
        $("#settings-message").textContent = "\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\u3002";
        dialog.close();
      } else {
        $("#settings-message").textContent = payload.detail || "\u4FDD\u5B58\u5931\u8D25\u3002";
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
      settingsForm
    };
  }

  // frontend/app/features/admin/index.ts
  function initializeAdminController({ setStatus }) {
    const settings = initializeSettingsController({ setStatus });
    initializeApiClientController(settings);
    const runtime = initializeRuntimeController({
      refreshRuntimeAvailability: settings.refreshRuntimeAvailability,
      setSettingsSection: settings.setSettingsSection,
      settingsForm: settings.settingsForm
    });
    settings.setSettingsOpenedHandler(runtime.resumeRuntimeInstallation);
  }

  // frontend/app/core/mathjax-runtime.ts
  var MATHJAX_READY_EVENT = "formula-ocr-mathjax-ready";
  var MATHJAX_READY_TIMEOUT_MS = 15e3;
  function createMathJaxRuntime() {
    let readinessPromise = null;
    let operationQueue = Promise.resolve();
    function hostWindow() {
      return typeof window === "undefined" ? globalThis : window;
    }
    function isReady() {
      return typeof hostWindow().MathJax?.typesetPromise === "function";
    }
    function waitForMathJax2() {
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
          finish(reject, new Error("MathJax \u52A0\u8F7D\u8D85\u65F6"));
        }, MATHJAX_READY_TIMEOUT_MS);
        host.addEventListener?.(MATHJAX_READY_EVENT, handleReady);
        handleReady();
      });
      readinessPromise = pending.finally(() => {
        readinessPromise = null;
      });
      return readinessPromise;
    }
    function withMathJax2(operation) {
      const task = operationQueue.catch(() => void 0).then(async () => operation(await waitForMathJax2()));
      operationQueue = task.catch(() => void 0);
      return task;
    }
    function typesetMathJax2(elements) {
      return withMathJax2((mathJax) => mathJax.typesetPromise(elements));
    }
    function clearMathJax2(elements) {
      if (!isReady()) return Promise.resolve();
      return withMathJax2((mathJax) => mathJax.typesetClear?.(elements));
    }
    function mathJaxToMathML2(latex, options = {}) {
      return withMathJax2((mathJax) => {
        if (typeof mathJax.tex2mmlPromise !== "function") {
          throw new Error("MathJax MathML \u8F6C\u6362\u5668\u672A\u5C31\u7EEA");
        }
        return mathJax.tex2mmlPromise(latex, options);
      });
    }
    return Object.freeze({
      clearMathJax: clearMathJax2,
      isReady,
      mathJaxToMathML: mathJaxToMathML2,
      typesetMathJax: typesetMathJax2,
      waitForMathJax: waitForMathJax2,
      withMathJax: withMathJax2
    });
  }
  var mathJaxRuntime = globalThis.FormulaOcrMathJaxRuntime || (globalThis.FormulaOcrMathJaxRuntime = createMathJaxRuntime());
  var {
    clearMathJax,
    mathJaxToMathML,
    typesetMathJax,
    waitForMathJax,
    withMathJax
  } = mathJaxRuntime;

  // frontend/app/features/copy-controller.ts
  function initializeCopyController({
    getLatexValue,
    getVisualLatexValue,
    setStatus,
    setVisualStatus
  }) {
    const copyFormatControls = [
      $("#copy-format"),
      $("#visual-copy-format")
    ].filter(Boolean);
    let copyFormat = localStorage.getItem("formula-ocr-copy-format") || "raw";
    function synchronizeCopyFormat(value, persist = true) {
      const validFormats = /* @__PURE__ */ new Set(["raw", "inline-dollar", "block-dollar", "inline-paren", "block-bracket", "mathml"]);
      copyFormat = validFormats.has(value) ? value : "raw";
      copyFormatControls.forEach((control) => {
        control.value = copyFormat;
      });
      if (persist) localStorage.setItem("formula-ocr-copy-format", copyFormat);
    }
    async function formattedLatex(rawValue = getLatexValue(), format = copyFormat) {
      const raw = String(rawValue || "").trim();
      if (format === "mathml") {
        try {
          return await mathJaxToMathML(raw, { display: true });
        } catch {
          return raw;
        }
      }
      switch (format) {
        case "inline-dollar":
          return `$${raw}$`;
        case "block-dollar":
          return `$$${raw}$$`;
        case "inline-paren":
          return `\\(${raw}\\)`;
        case "block-bracket":
          return `\\[${raw}\\]`;
        default:
          return raw;
      }
    }
    function fallbackCopyText(text) {
      const parent = document.querySelector("dialog[open]") || document.body;
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "50%";
      textarea.style.top = "50%";
      textarea.style.width = "100px";
      textarea.style.height = "40px";
      textarea.style.opacity = "0.01";
      textarea.style.zIndex = "99999";
      parent.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      let successful = false;
      try {
        successful = document.execCommand("copy");
      } catch {
      }
      parent.removeChild(textarea);
      return successful;
    }
    function fallbackCopyHtml(htmlContent) {
      const parent = document.querySelector("dialog[open]") || document.body;
      const container = document.createElement("div");
      container.contentEditable = "true";
      container.style.position = "fixed";
      container.style.left = "-9999px";
      container.style.top = "0";
      container.style.opacity = "0";
      container.innerHTML = htmlContent;
      parent.appendChild(container);
      const range = document.createRange();
      range.selectNodeContents(container);
      const selection = window.getSelection();
      if (!selection) return false;
      selection.removeAllRanges();
      selection.addRange(range);
      let successful = false;
      try {
        successful = document.execCommand("copy");
      } catch {
      }
      selection.removeAllRanges();
      parent.removeChild(container);
      return successful;
    }
    async function copyLatex() {
      if (!getLatexValue().trim()) return;
      try {
        const formatted = await formattedLatex();
        if (navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(formatted);
            setStatus("\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F\u3002");
            return;
          } catch {
          }
        }
        if (fallbackCopyText(formatted)) {
          setStatus("\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F\u3002");
        } else {
          setStatus("\u6D4F\u89C8\u5668\u62D2\u7EDD\u526A\u8D34\u677F\u8BBF\u95EE\uFF0C\u8BF7\u4F7F\u7528\u624B\u52A8\u9009\u62E9\u590D\u5236\u3002", true);
        }
      } catch {
        setStatus("\u6D4F\u89C8\u5668\u62D2\u7EDD\u526A\u8D34\u677F\u8BBF\u95EE\uFF0C\u8BF7\u4F7F\u7528\u624B\u52A8\u9009\u62E9\u590D\u5236\u3002", true);
      }
    }
    async function copyToWord(latexValue, buttonElement, isVisual = false) {
      const raw = (latexValue !== void 0 && latexValue !== null ? latexValue : isVisual ? getVisualLatexValue() : getLatexValue()).trim();
      const setStatusForEditor = isVisual ? setVisualStatus : setStatus;
      if (!raw) {
        setStatusForEditor("\u6CA1\u6709\u53EF\u590D\u5236\u7684\u516C\u5F0F\u5185\u5BB9\u3002", true);
        return;
      }
      try {
        const mathml = await mathJaxToMathML(raw, { display: true });
        const htmlContent = `<!--StartFragment--><math xmlns="http://www.w3.org/1998/Math/MathML" display="block">${mathml.replace(/^<math[^>]*>/, "").replace(/<\/math>$/, "")}</math><!--EndFragment-->`;
        let copied = false;
        if (navigator.clipboard?.write && window.ClipboardItem) {
          try {
            const item = new ClipboardItem({
              "text/html": new Blob([htmlContent], { type: "text/html" }),
              "text/plain": new Blob([mathml], { type: "text/plain" })
            });
            await navigator.clipboard.write([item]);
            copied = true;
          } catch (error) {
            console.warn("ClipboardItem write failed, fallbacking to execCommand:", error);
          }
        }
        if (!copied) copied = fallbackCopyHtml(htmlContent);
        if (!copied) throw new Error("\u6240\u6709\u590D\u5236\u9014\u5F84\u5747\u5931\u8D25");
        if (buttonElement) {
          const originalText = buttonElement.textContent;
          buttonElement.textContent = "\u2713 \u5DF2\u590D\u5236 Word \u516C\u5F0F";
          buttonElement.disabled = true;
          setTimeout(() => {
            buttonElement.textContent = originalText;
            buttonElement.disabled = false;
          }, 1600);
        }
        setStatusForEditor("\u5DF2\u6210\u529F\u590D\u5236 Word \u516C\u5F0F\u683C\u5F0F\uFF0C\u53EF\u5728 Word / WPS \u4E2D\u6309 Ctrl+V \u7C98\u8D34\u3002");
      } catch (error) {
        console.warn("Word copy error:", error);
        try {
          const mathml = await mathJaxToMathML(raw, { display: true });
          if (fallbackCopyText(mathml)) {
            setStatusForEditor("\u5DF2\u590D\u5236 MathML \u6587\u672C\uFF0C\u53EF\u5728 Word \u4E2D\u7C98\u8D34\u3002");
          } else {
            setStatusForEditor("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u4F7F\u7528\u624B\u52A8\u9009\u62E9\u590D\u5236\u3002", true);
          }
        } catch {
          setStatusForEditor("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u4F7F\u7528\u624B\u52A8\u9009\u62E9\u590D\u5236\u3002", true);
        }
      }
    }
    function checkHttpAutoCopyPermission() {
      const isHttp = location.protocol === "http:" && !["localhost", "127.0.0.1"].includes(location.hostname);
      if (isHttp && !window.isSecureContext) {
        $("#http-setup-nas-origin").value = location.origin;
        $("#http-setup-dialog").showModal();
      }
    }
    async function copyInputElementValue(inputElement, buttonElement, successMessage) {
      if (!inputElement) return;
      const text = inputElement.value;
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          copied = true;
        } catch {
        }
      }
      if (!copied) {
        inputElement.focus();
        inputElement.select();
        try {
          copied = document.execCommand("copy");
        } catch {
        }
      }
      if (!copied) copied = fallbackCopyText(text);
      if (copied) {
        if (buttonElement) {
          const originalText = buttonElement.textContent;
          buttonElement.textContent = "\u2713 \u5DF2\u590D\u5236";
          buttonElement.disabled = true;
          setTimeout(() => {
            buttonElement.textContent = originalText;
            buttonElement.disabled = false;
          }, 1500);
        }
        setStatus(successMessage);
      } else {
        setStatus("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u53CC\u51FB\u9009\u4E2D\u6587\u672C\u624B\u52A8\u590D\u5236\u3002", true);
      }
    }
    async function copyVisualLatex() {
      const value = getVisualLatexValue().trim();
      if (!value) {
        setVisualStatus("\u6CA1\u6709\u53EF\u590D\u5236\u7684 LaTeX");
        return;
      }
      try {
        const formatted = await formattedLatex(value, copyFormat);
        if (navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(formatted);
            setVisualStatus("\u5DF2\u6309\u6240\u9009\u683C\u5F0F\u590D\u5236");
            return;
          } catch {
          }
        }
        if (fallbackCopyText(formatted)) {
          setVisualStatus("\u5DF2\u6309\u6240\u9009\u683C\u5F0F\u590D\u5236");
        } else {
          setVisualStatus("\u6D4F\u89C8\u5668\u62D2\u7EDD\u526A\u8D34\u677F\u8BBF\u95EE\uFF0C\u8BF7\u624B\u52A8\u590D\u5236\u6E90\u7801");
        }
      } catch {
        setVisualStatus("\u6D4F\u89C8\u5668\u62D2\u7EDD\u526A\u8D34\u677F\u8BBF\u95EE\uFF0C\u8BF7\u624B\u52A8\u590D\u5236\u6E90\u7801");
      }
    }
    $("#copy").addEventListener("click", copyLatex);
    $("#copy-word").addEventListener("click", () => copyToWord(null, $("#copy-word"), false));
    $("#visual-copy").addEventListener("click", copyVisualLatex);
    $("#visual-copy-word").addEventListener("click", () => copyToWord(null, $("#visual-copy-word"), true));
    copyFormatControls.forEach((control) => {
      control.addEventListener("change", () => synchronizeCopyFormat(control.value));
    });
    $("#auto-copy").addEventListener("change", () => {
      const isChecked = $("#auto-copy").checked;
      localStorage.setItem("formula-ocr-auto-copy", isChecked ? "1" : "0");
      if (isChecked) checkHttpAutoCopyPermission();
    });
    $("#copy-flag-link").addEventListener("click", () => {
      copyInputElementValue(
        $("#http-setup-flag-link"),
        $("#copy-flag-link"),
        "\u5DF2\u590D\u5236 Flag \u94FE\u63A5\uFF0C\u8BF7\u5728 Chrome \u5730\u5740\u680F\u4E2D\u7C98\u8D34\u6253\u5F00\u3002"
      );
    });
    $("#copy-nas-origin").addEventListener("click", () => {
      copyInputElementValue($("#http-setup-nas-origin"), $("#copy-nas-origin"), "\u5DF2\u590D\u5236\u5F53\u524D NAS \u7F51\u5740\u3002");
    });
    $("#http-setup-close").addEventListener("click", () => $("#http-setup-dialog").close());
    synchronizeCopyFormat(copyFormat, false);
    $("#auto-copy").checked = localStorage.getItem("formula-ocr-auto-copy") === "1";
    return { copyLatex };
  }

  // frontend/app/features/latex-renderer.ts
  function createLatexRenderer({
    getLatexValue
  }) {
    let renderGeneration = 0;
    let renderTimer;
    function schedule() {
      window.clearTimeout(renderTimer);
      renderTimer = window.setTimeout(() => render(), 120);
    }
    async function render() {
      const generation = ++renderGeneration;
      const entries = [
        { target: $("#latex-preview"), status: $("#render-status") },
        { target: $("#visual-formula-preview"), status: $("#visual-render-status") }
      ].filter((entry) => entry.target);
      const value = getLatexValue().trim();
      if (!value) {
        for (const { target, status } of entries) {
          target.textContent = "\u9884\u89C8\u4F1A\u663E\u793A\u5728\u8FD9\u91CC\u3002";
          if (status) {
            status.textContent = "";
            status.title = "";
          }
        }
        clearMathJax(entries.map((entry) => entry.target)).catch(() => void 0);
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
          const errorNode = target.querySelector(".mjx-merror, [data-mjx-error], mjx-container[data-mjx-error], .merror");
          if (errorNode) {
            const errorText = errorNode.textContent || "LaTeX \u8BED\u6CD5\u4E0D\u5B8C\u6574\u6216\u5B58\u5728\u9519\u8BEF";
            target.innerHTML = `<div class="preview-error-box"><div class="error-title">\u26A0\uFE0F \u516C\u5F0F\u8BED\u6CD5\u4E0D\u5B8C\u6574\u6216\u5B58\u5728\u9519\u8BEF</div><div class="error-detail">${escapeHtml(errorText)}</div></div>`;
            if (status) {
              status.textContent = "\u8BED\u6CD5\u9519\u8BEF";
              status.title = errorText;
            }
          } else if (status) {
            status.textContent = "";
            status.title = "";
          }
        }
      } catch (error) {
        if (generation !== renderGeneration) return;
        const message = error.message || String(error);
        for (const { target, status } of entries) {
          target.innerHTML = `<div class="preview-error-box"><div class="error-title">\u26A0\uFE0F \u516C\u5F0F\u6E32\u67D3\u5931\u8D25</div><div class="error-detail">${escapeHtml(message)}</div></div>`;
          if (status) {
            status.textContent = "\u9884\u89C8\u5931\u8D25";
            status.title = message;
          }
        }
      }
    }
    function normalizedMathJaxMarkup(node) {
      const clone = node.cloneNode(true);
      [clone, ...clone.querySelectorAll("*")].forEach((element) => {
        element.removeAttribute("id");
        element.removeAttribute("data-latex");
        element.removeAttribute("data-semantic-attributes");
      });
      return clone.outerHTML;
    }
    async function hasEquivalentMathJaxOutput(original, formatted) {
      if (original === formatted) return true;
      const comparisonHost = document.createElement("div");
      comparisonHost.setAttribute("aria-hidden", "true");
      comparisonHost.style.cssText = [
        "position: fixed",
        "left: -100000px",
        "top: 0",
        "visibility: hidden",
        "pointer-events: none"
      ].join(";");
      const originalTarget = document.createElement("div");
      const formattedTarget = document.createElement("div");
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
          ".mjx-merror, [data-mjx-error], mjx-container[data-mjx-error], .merror"
        );
        const formattedError = formattedTarget.querySelector(
          ".mjx-merror, [data-mjx-error], mjx-container[data-mjx-error], .merror"
        );
        const originalMath = originalTarget.querySelector("mjx-container");
        const formattedMath = formattedTarget.querySelector("mjx-container");
        if (originalError || formattedError || !originalMath || !formattedMath) return false;
        return normalizedMathJaxMarkup(originalMath) === normalizedMathJaxMarkup(formattedMath);
      } catch (error) {
        console.warn("LaTeX formatting equivalence check failed:", error);
        return false;
      } finally {
        await clearMathJax([comparisonHost]).catch(() => void 0);
        comparisonHost.remove();
      }
    }
    async function safelyFormatRecognizedLatex(value) {
      const original = String(value || "");
      const formatter = window.FormulaOcrLatexFormatter;
      if (!original || !formatter?.format) {
        return { latex: original, status: "formatter-unavailable", formatted: false };
      }
      const result = formatter.format(original);
      if (!result.safe) {
        return { latex: original, status: result.status, formatted: false };
      }
      if (!result.changed) {
        return { latex: original, status: "unchanged", formatted: false };
      }
      if (!formatter.hasEquivalentTokens(original, result.formatted)) {
        return { latex: original, status: "token-changed", formatted: false };
      }
      if (!await hasEquivalentMathJaxOutput(original, result.formatted)) {
        return { latex: original, status: "render-changed", formatted: false };
      }
      return { latex: result.formatted, status: "equivalent", formatted: true };
    }
    return {
      render,
      safelyFormatRecognizedLatex,
      schedule
    };
  }

  // frontend/app/features/formula-editor-controller.ts
  var EDITOR_SESSION_KEY = "formula-ocr-editor-session-v1";
  var WORKBENCH_PAGES = ["ocr", "editor", "table-ocr", "table-editor"];
  function createFormulaEditorController() {
    const latex = $("#latex-output");
    const latexEditor = window.FormulaLatexEditor?.create(latex, $("#latex-editor")) || null;
    const visualLatex = $("#visual-latex-output");
    const visualLatexEditor = window.FormulaLatexEditor?.create(visualLatex, $("#visual-latex-editor")) || null;
    const visualField = $("#visual-math-field");
    const visualStatus = $("#visual-editor-status");
    const visualSourcePreview = $("#visual-source-preview");
    const visualSourcePreviewCode = $("#visual-source-preview-code");
    const visualSourcePreviewToggle = $("#visual-source-preview-toggle");
    let syncingVisualEditor = false;
    let activeFormulaInputMode = "source";
    let editorSessionEnabled = false;
    function readEditorSession() {
      try {
        const saved = JSON.parse(window.sessionStorage.getItem(EDITOR_SESSION_KEY) || "null");
        if (!saved || typeof saved.latex !== "string") return null;
        return {
          latex: saved.latex,
          inputMode: ["source", "visual"].includes(saved.inputMode) ? saved.inputMode : "source"
        };
      } catch (error) {
        console.warn("Unable to read formula editor session:", error);
        return null;
      }
    }
    function persistEditorSession() {
      if (!editorSessionEnabled) return;
      try {
        window.sessionStorage.setItem(EDITOR_SESSION_KEY, JSON.stringify({
          latex: getVisualLatexValue(),
          inputMode: activeFormulaInputMode
        }));
      } catch (error) {
        console.warn("Unable to save formula editor session:", error);
      }
    }
    function activateEditorSession() {
      if (editorSessionEnabled) return;
      editorSessionEnabled = true;
      persistEditorSession();
    }
    function configureVisualMathField() {
      if (window.MathfieldElement) {
        window.MathfieldElement.fontsDirectory = endpoint("vendor/mathlive/fonts/");
        window.MathfieldElement.soundsDirectory = null;
        window.MathfieldElement.strings = {
          "zh-cn": {
            "tooltip.toggle virtual keyboard": "\u5207\u6362\u865A\u62DF\u952E\u76D8",
            "tooltip.menu": "\u516C\u5F0F\u83DC\u5355"
          }
        };
        window.MathfieldElement.locale = "zh-cn";
        window.MathfieldElement.scientificNotationTemplate = "#1\\times10^{#2}";
      }
      if (!visualField) return;
      visualField.macros = {
        ...visualField.macros || {},
        ...window.FormulaOcrMathLiveMacros || {}
      };
      visualField.mathVirtualKeyboardPolicy = "manual";
      visualField.smartFence = true;
      visualField.smartMode = true;
    }
    configureVisualMathField();
    let syncingCode = false;
    const getLatexValue = () => latexEditor ? latexEditor.getValue() : latex.value;
    const {
      render: renderLatex,
      safelyFormatRecognizedLatex,
      schedule: scheduleLatexRender
    } = createLatexRenderer({ getLatexValue });
    const setLatexValue = (value, skipSyncVisual = false) => {
      const next = String(value || "");
      if (latexEditor) latexEditor.setValue(next);
      else latex.value = next;
      $("#continue-visual-edit").disabled = !next.trim();
      if (!skipSyncVisual && !syncingCode) {
        syncingCode = true;
        setVisualLatexValue(next, "\u5DF2\u540C\u6B65\u56FE\u7247\u8BC6\u522B LaTeX", true);
        syncingCode = false;
      }
    };
    const getVisualLatexValue = () => visualLatexEditor ? visualLatexEditor.getValue() : visualLatex.value;
    function updateVisualSourcePreview(value) {
      if (visualSourcePreviewCode) visualSourcePreviewCode.textContent = String(value || "") || "\u6E90\u7801\u4F1A\u663E\u793A\u5728\u8FD9\u91CC\u3002";
    }
    function updateVisualSourcePreviewVisibility() {
      if (!visualSourcePreview || !visualSourcePreviewToggle) return;
      visualSourcePreview.hidden = !visualSourcePreviewToggle.checked;
      $("#visual-input-split")?.classList.toggle("has-source-preview", visualSourcePreviewToggle.checked);
    }
    function hideMathVirtualKeyboard() {
      try {
        window.mathVirtualKeyboard?.hide?.();
      } catch (error) {
        console.warn("Unable to close MathLive virtual keyboard:", error);
      }
    }
    function setFormulaInputMode(mode, focus = true) {
      if (!["source", "visual"].includes(mode)) return;
      if (mode !== "visual") hideMathVirtualKeyboard();
      activeFormulaInputMode = mode;
      document.querySelectorAll("[data-formula-input-mode]").forEach((tab) => {
        const active = tab.dataset.formulaInputMode === mode;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      document.querySelectorAll("[data-formula-input-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.formulaInputPanel !== mode;
      });
      document.querySelectorAll("[data-formula-input-control]").forEach((control) => {
        control.hidden = control.dataset.formulaInputControl !== mode;
      });
      persistEditorSession();
      if (!focus) return;
      window.requestAnimationFrame(() => {
        if (mode === "visual") visualField?.focus?.();
        else if (visualLatexEditor) visualLatexEditor.focus();
        else visualLatex?.focus?.();
      });
    }
    const setVisualStatus = (message, level = "") => {
      visualStatus.textContent = message;
      visualStatus.dataset.level = level === true ? "error" : String(level);
      visualStatus.title = "";
    };
    function describeMathLiveError(error) {
      const labels = {
        "unknown-command": "\u4E0D\u652F\u6301\u7684\u547D\u4EE4",
        "invalid-command": "\u65E0\u6548\u547D\u4EE4",
        "unknown-environment": "\u4E0D\u652F\u6301\u7684\u73AF\u5883",
        "unbalanced-braces": "\u62EC\u53F7\u4E0D\u914D\u5BF9",
        "unbalanced-environment": "\u73AF\u5883\u4E0D\u914D\u5BF9",
        "missing-argument": "\u7F3A\u5C11\u53C2\u6570",
        "unexpected-token": "\u5B58\u5728\u610F\u5916\u5B57\u7B26"
      };
      const detail = error?.arg || error?.latex || "";
      return `${labels[error?.code] || error?.code || "LaTeX \u8BED\u6CD5\u95EE\u9898"}${detail ? `\uFF1A${detail}` : ""}`;
    }
    function updateVisualValidationStatus(value, successMessage) {
      const validator = window.MathLive?.validateLatex;
      if (typeof validator === "function") {
        try {
          const errors = validator(value, { macros: window.FormulaOcrMathLiveMacros || {} });
          if (errors.length) {
            const descriptions = errors.map(describeMathLiveError);
            setVisualStatus(`MathLive \u63D0\u793A\uFF1A${descriptions[0]}`, "warning");
            visualStatus.title = descriptions.join("\n");
            return;
          }
        } catch (error) {
          console.warn("MathLive validation failed:", error);
        }
      }
      if (/\\mathds\b/.test(value)) {
        setVisualStatus("MathLive \u7528\u9ED1\u677F\u7C97\u4F53\u8FD1\u4F3C\u663E\u793A \\mathds\uFF1B\u6700\u7EC8\u9884\u89C8\u4F7F\u7528 dsfont", "warning");
        visualStatus.title = "\u7F16\u8F91\u72B6\u6001\u4EC5\u5B57\u4F53\u8FD1\u4F3C\uFF1BLaTeX \u6E90\u7801\u548C\u6700\u7EC8 MathJax \u9884\u89C8\u4FDD\u6301 dsfont \u8BED\u4E49\u3002";
        return;
      }
      setVisualStatus(successMessage);
    }
    function setVisualLatexValue(value, message = "\u5DF2\u540C\u6B65 LaTeX \u6E90\u7801", skipSyncOcr = false) {
      const next = String(value || "");
      if (syncingVisualEditor) return;
      syncingVisualEditor = true;
      if (visualField?.setValue && visualField.getValue("latex") !== next) {
        visualField.setValue(next, { silenceNotifications: true });
      }
      if (visualLatexEditor) visualLatexEditor.setValue(next);
      else visualLatex.value = next;
      updateVisualSourcePreview(next);
      syncingVisualEditor = false;
      updateVisualValidationStatus(next, message);
      if (!skipSyncOcr && !syncingCode) {
        syncingCode = true;
        setLatexValue(next, true);
        renderLatex();
        syncingCode = false;
      }
      persistEditorSession();
    }
    function syncVisualFromField() {
      if (syncingVisualEditor || !visualField?.getValue) return;
      syncingVisualEditor = true;
      const next = visualField.getValue("latex");
      if (visualLatexEditor) visualLatexEditor.setValue(next);
      else visualLatex.value = next;
      updateVisualSourcePreview(next);
      syncingVisualEditor = false;
      updateVisualValidationStatus(next, "\u53EF\u89C6\u5316\u8F93\u5165\u5DF2\u540C\u6B65");
      if (!syncingCode) {
        syncingCode = true;
        setLatexValue(next, true);
        renderLatex();
        syncingCode = false;
      }
      persistEditorSession();
    }
    function expandSnippetTemplate(template, selectedText = null) {
      let firstField;
      let selectedRange = null;
      let output = "";
      let sourceOffset = 0;
      const fields = [];
      let insertedSelection = false;
      const pattern = /\$\{(\d+)(?::([^}]*))?\}/g;
      for (const match of String(template || "").matchAll(pattern)) {
        output += template.slice(sourceOffset, match.index);
        const useSelection = !insertedSelection && selectedText !== null;
        const value = useSelection ? selectedText : match[2] || "";
        const start = output.length;
        output += value;
        fields.push({ index: Number(match[1]), start, end: output.length });
        if (useSelection) {
          selectedRange = { start, end: output.length };
          insertedSelection = true;
        }
        sourceOffset = match.index + match[0].length;
      }
      output += String(template || "").slice(sourceOffset);
      fields.sort((left, right) => left.index - right.index || left.start - right.start);
      [firstField] = fields;
      return { text: output, firstField, selectedRange };
    }
    function mathLiveSnippet(template) {
      return String(template || "").replace(/\$\{\d+(?::([^}]*))?\}/g, (match, value) => value || "#?");
    }
    function getSourceSelectionForWrap() {
      if (visualLatexEditor?.view) {
        const selection = visualLatexEditor.view.state.selection.main;
        if (selection.empty) return null;
        return {
          text: visualLatexEditor.view.state.sliceDoc(selection.from, selection.to),
          start: selection.from,
          end: selection.to
        };
      }
      const start = visualLatex.selectionStart ?? visualLatex.value.length;
      const end = visualLatex.selectionEnd ?? start;
      if (start === end) return null;
      return { text: visualLatex.value.slice(start, end), start, end };
    }
    function getVisualMathSelectionForWrap() {
      if (!visualField?.getValue || visualField.selectionIsCollapsed) return null;
      const text = visualField.getValue(visualField.selection, "latex");
      return text ? { text } : null;
    }
    function insertVisualLatex(value, snippetTemplate = "", { wrapSelection = false } = {}) {
      const next = String(value || "");
      if (!next) return;
      if (activeFormulaInputMode === "source") {
        const selected2 = wrapSelection && snippetTemplate ? getSourceSelectionForWrap() : null;
        if (selected2) {
          const wrapped = expandSnippetTemplate(snippetTemplate, selected2.text);
          if (visualLatexEditor?.insert) {
            visualLatexEditor.insert(wrapped.text);
            return;
          }
          visualLatex.setRangeText(wrapped.text, selected2.start, selected2.end, "end");
          if (wrapped.selectedRange) {
            visualLatex.setSelectionRange(
              selected2.start + wrapped.selectedRange.start,
              selected2.start + wrapped.selectedRange.end
            );
          }
          visualLatex.focus();
          visualLatex.dispatchEvent(new Event("input", { bubbles: true }));
          return;
        }
        if (visualLatexEditor?.insert) {
          visualLatexEditor.insert(next, { snippet: snippetTemplate });
          return;
        }
        const start = visualLatex.selectionStart ?? visualLatex.value.length;
        const end = visualLatex.selectionEnd ?? start;
        if (snippetTemplate) {
          const expanded = expandSnippetTemplate(snippetTemplate);
          visualLatex.setRangeText(expanded.text, start, end, "end");
          if (expanded.firstField) {
            visualLatex.setSelectionRange(
              start + expanded.firstField.start,
              start + expanded.firstField.end
            );
          }
          visualLatex.focus();
          visualLatex.dispatchEvent(new Event("input", { bubbles: true }));
          return;
        }
        const followingCharacter = visualLatex.value.slice(end, end + 1);
        const insertText = /\\[A-Za-z]+$/.test(next) && /^[A-Za-z]$/.test(followingCharacter) ? `${next} ` : next;
        visualLatex.setRangeText(insertText, start, end, "end");
        visualLatex.focus();
        visualLatex.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }
      const selected = wrapSelection && snippetTemplate ? getVisualMathSelectionForWrap() : null;
      if (!visualField?.insert) {
        setVisualLatexValue(`${getVisualLatexValue()}${next}`, "\u5DF2\u63D2\u5165\u5FEB\u6377\u5DE5\u5177");
        return;
      }
      visualField.focus();
      if (selected) {
        const wrapped = expandSnippetTemplate(snippetTemplate, selected.text);
        visualField.insert(wrapped.text, {
          insertionMode: "replaceSelection",
          selectionMode: "item",
          format: "latex",
          focus: true
        });
        syncVisualFromField();
        return;
      }
      visualField.insert(snippetTemplate ? mathLiveSnippet(snippetTemplate) : next, {
        insertionMode: "replaceSelection",
        selectionMode: snippetTemplate ? "placeholder" : "after",
        format: "latex",
        focus: true
      });
      syncVisualFromField();
    }
    function showWorkbenchPage(page) {
      if (!page || !WORKBENCH_PAGES.includes(page)) return;
      if (page === "editor") activateEditorSession();
      if (page !== "editor") hideMathVirtualKeyboard();
      for (const candidate of WORKBENCH_PAGES) {
        $(`#${candidate}-page`).hidden = candidate !== page;
      }
      document.querySelectorAll(".page-tab").forEach((tab) => {
        const active = tab.dataset.page === page;
        tab.classList.toggle("is-active", active);
        tab.classList.toggle("secondary", !active);
        tab.setAttribute("aria-current", active ? "page" : "false");
      });
      if (page === "editor") window.setTimeout(() => setFormulaInputMode(activeFormulaInputMode), 0);
    }
    function restoreEditorSession() {
      const saved = readEditorSession();
      if (!saved) return;
      editorSessionEnabled = true;
      setVisualLatexValue(saved.latex, "\u5DF2\u6062\u590D\u5F53\u524D\u6807\u7B7E\u9875\u4E2D\u7684\u516C\u5F0F");
      setFormulaInputMode(saved.inputMode, false);
      showWorkbenchPage("editor");
    }
    function initializeEvents({
      closeFormulaFormatMenu
    }) {
      latex.addEventListener("input", () => {
        if (syncingCode) return;
        $("#continue-visual-edit").disabled = !getLatexValue().trim();
        syncingCode = true;
        setVisualLatexValue(getLatexValue(), "\u5DF2\u540C\u6B65\u56FE\u7247\u8BC6\u522B LaTeX", true);
        syncingCode = false;
        scheduleLatexRender();
      });
      visualField?.addEventListener("input", syncVisualFromField);
      visualLatex.addEventListener("input", () => {
        if (syncingVisualEditor) return;
        setVisualLatexValue(visualLatexEditor ? visualLatexEditor.getValue() : visualLatex.value);
      });
      $("#visual-clear").addEventListener("click", () => {
        closeFormulaFormatMenu();
        setVisualLatexValue("", "\u5DF2\u6E05\u7A7A\u516C\u5F0F");
      });
      document.querySelectorAll("[data-formula-input-mode]").forEach((tab) => {
        tab.addEventListener("click", () => setFormulaInputMode(tab.dataset.formulaInputMode || "source"));
        tab.addEventListener("keydown", (event) => {
          if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
          event.preventDefault();
          setFormulaInputMode(activeFormulaInputMode === "source" ? "visual" : "source");
        });
      });
      visualSourcePreviewToggle?.addEventListener("change", updateVisualSourcePreviewVisibility);
      updateVisualSourcePreview(getVisualLatexValue());
      updateVisualSourcePreviewVisibility();
      setFormulaInputMode(activeFormulaInputMode, false);
      $("#continue-visual-edit").addEventListener("click", () => {
        const value = getLatexValue();
        if (!value.trim()) return;
        setVisualLatexValue(value, "\u5DF2\u4ECE\u56FE\u7247\u8BC6\u522B\u7ED3\u679C\u5BFC\u5165");
        setFormulaInputMode("visual", false);
        showWorkbenchPage("editor");
      });
      document.querySelectorAll(".page-tab").forEach((tab) => {
        tab.addEventListener("click", () => showWorkbenchPage(tab.dataset.page));
      });
      restoreEditorSession();
    }
    return {
      getLatexValue,
      getVisualLatexValue,
      initializeEvents,
      insertVisualLatex,
      renderLatex,
      safelyFormatRecognizedLatex,
      showWorkbenchPage,
      setLatexValue,
      setVisualLatexValue,
      setVisualStatus
    };
  }

  // frontend/app/features/formula-environments.mts
  var formulaEnvironmentNames = /* @__PURE__ */ new Set([
    "eqnarray",
    "align",
    "aligned",
    "gathered",
    "cases",
    "split",
    "array"
  ]);
  function unwrapOneFormulaEnvironment(value) {
    const source = String(value || "").trim();
    const match = source.match(/^\\begin\{(eqnarray|align|aligned|gathered|cases|split|array)(\*)?\}([\s\S]*?)\\end\{\1\2\}\s*$/);
    if (!match) return null;
    let inner = match[3];
    if (match[1] === "array") inner = inner.replace(/^\{[^{}\n]*\}/, "");
    inner = inner.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
    return inner;
  }
  function repairLegacyNestedFormula(value) {
    let inner = String(value || "");
    const withoutTrailingArtifacts = inner.replace(/(?:[ \t]*(?:&|\\\\)[ \t]*(?:\r?\n)?)+$/, "");
    const nested = unwrapOneFormulaEnvironment(withoutTrailingArtifacts);
    if (nested === null) return inner;
    inner = nested;
    while (true) {
      const cleaned = inner.replace(/(?:[ \t]*(?:&|\\\\)[ \t]*(?:\r?\n)?)+$/, "");
      const next = unwrapOneFormulaEnvironment(cleaned);
      if (next === null) return cleaned;
      inner = next;
    }
  }
  function normalizeArrayColumnFormat(value) {
    const format = String(value || "");
    return /^[lcr]+$/.test(format) ? format : "c";
  }
  function getOuterArrayColumnFormat(value) {
    const source = String(value || "").trim();
    const match = source.match(/^\\begin\{array\}\{([lcr]+)\}/);
    return match ? match[1] : null;
  }
  function switchFormulaEnvironment(value, environmentId, arrayColumnFormat = "c") {
    const environment = String(environmentId || "none");
    if (environment !== "none" && !formulaEnvironmentNames.has(environment)) return null;
    const source = String(value || "").trim();
    const unwrapped = unwrapOneFormulaEnvironment(source);
    const inner = unwrapped === null ? source : repairLegacyNestedFormula(unwrapped);
    if (environment === "none") return inner;
    const begin = environment === "array" ? `\\begin{array}{${normalizeArrayColumnFormat(arrayColumnFormat)}}` : `\\begin{${environment}}`;
    return `${begin}
${inner}
\\end{${environment}}`;
  }
  function createFormulaEnvironmentSwitcher() {
    let arrayColumnFormat = "c";
    return (value, environmentId) => {
      arrayColumnFormat = getOuterArrayColumnFormat(value) || arrayColumnFormat;
      return switchFormulaEnvironment(value, environmentId, arrayColumnFormat);
    };
  }

  // frontend/app/features/formula-toolbox-controller.ts
  function initializeFormulaToolboxController({
    getVisualLatexValue,
    insertVisualLatex,
    setVisualLatexValue,
    setVisualStatus
  }) {
    const formulaToolbox = $("#formula-toolbox");
    const shortcutCategoryShell = $("#shortcut-category-shell");
    const shortcutCategoryBar = $("#shortcut-category-bar");
    const shortcutSymbolPanel = $("#shortcut-symbol-panel");
    const formulaTemplateShell = $("#formula-template-shell");
    const formulaTemplateCategoryBar = $("#formula-template-category-bar");
    const formulaTemplateMenu = $("#formula-template-menu");
    const formulaTemplateGrid = $("#formula-template-grid");
    const formulaFormatShell = $("#formula-format-shell");
    const formulaFormatToolbar = $("#formula-format-toolbar");
    const formulaFormatMenu = $("#formula-format-menu");
    let activeFormulaToolMode = "shortcuts";
    let openShortcutCategoryId = "";
    let shortcutPanelPinned = false;
    let activeShortcutButton = null;
    let openTemplateCategoryId = "";
    let templatePanelPinned = false;
    let activeTemplateCategoryButton = null;
    let openFormatToolId = "";
    let activeFormatToolButton = null;
    const switchFormulaEnvironment2 = createFormulaEnvironmentSwitcher();
    function typesetFormulaTools(target) {
      if (!target) return Promise.resolve();
      return typesetMathJax([target]).catch((error) => {
        console.warn("Formula tool preview failed to render:", error);
      });
    }
    function fitMenuFormulaPreviews(root, buttonSelector, previewSelector, { horizontalPadding = 16, verticalPadding = 12, minimumScale = 0.42 } = {}) {
      if (!root) return;
      for (const button of root.querySelectorAll(buttonSelector)) {
        const preview = button.querySelector(previewSelector);
        const math = preview?.querySelector("mjx-container");
        if (!preview || !math) continue;
        preview.style.setProperty("--menu-preview-scale", "1");
        const naturalRect = math.getBoundingClientRect();
        const naturalWidth = Math.max(math.scrollWidth, naturalRect.width);
        const naturalHeight = Math.max(math.scrollHeight, naturalRect.height);
        const shortcutCategory = root.dataset.shortcutCategory;
        if (shortcutCategory === "greek") {
          const desiredWidth = Math.max(32, Math.min(64, Math.ceil((naturalWidth + 12) / 8) * 8));
          button.style.width = `${desiredWidth}px`;
        } else if (shortcutCategory === "limits") {
          const desiredWidth = Math.max(48, Math.min(112, Math.ceil((naturalWidth + 14) / 8) * 8));
          button.style.width = `${desiredWidth}px`;
        } else if (shortcutCategory === "fractions") {
          const grid = button.parentElement;
          if (!grid) continue;
          const desiredWidth = grid.classList.contains("is-wide") ? button === grid.firstElementChild ? 136 : 187 : grid.classList.contains("is-fill") ? 66 : (button.dataset.toolInsert || "").includes("\\partial^2") ? 108 : Math.max(48, Math.min(108, naturalWidth + 12));
          button.style.width = `${desiredWidth}px`;
        }
        const availableWidth = Math.max(1, button.clientWidth - horizontalPadding);
        const availableHeight = Math.max(1, button.clientHeight - verticalPadding);
        const scale = Math.min(
          1,
          Math.max(
            minimumScale,
            Math.min(availableWidth / Math.max(1, naturalWidth), availableHeight / Math.max(1, naturalHeight))
          )
        );
        preview.style.setProperty("--menu-preview-scale", scale.toFixed(3));
        preview.classList.toggle("is-scaled", scale < 0.995);
      }
    }
    function fitShortcutPanelPreviews(categoryId) {
      if (!shortcutSymbolPanel || shortcutSymbolPanel.dataset.shortcutCategory !== categoryId || shortcutSymbolPanel.hidden) return;
      fitMenuFormulaPreviews(
        shortcutSymbolPanel,
        ".shortcut-symbol-button",
        ".shortcut-symbol-preview",
        { horizontalPadding: 8, verticalPadding: 6, minimumScale: 0.35 }
      );
      positionShortcutPanel();
    }
    function scheduleShortcutPanelPreviewFit(categoryId) {
      const refit = () => fitShortcutPanelPreviews(categoryId);
      window.requestAnimationFrame(refit);
      for (const delay of [80, 260, 700]) window.setTimeout(refit, delay);
      document.fonts?.ready?.then(refit);
    }
    const formulaTemplateMinimumSingleLineScale = 0.95;
    const formulaTemplatePackingToleranceRows = 6;
    function formulaTemplateSpansAllColumns(button) {
      return button.classList.contains("is-wide") || button.classList.contains("is-large") || button.classList.contains("is-wide-single-line");
    }
    function formulaTemplateGridColumnCount(root) {
      return window.getComputedStyle(root).gridTemplateColumns.trim().split(/\s+/).length;
    }
    function formulaTemplateMinimumHeight(button) {
      if (button.classList.contains("is-extra-tall")) return 184;
      if (button.classList.contains("is-tall") || button.classList.contains("is-large")) return 136;
      if (button.classList.contains("is-wide")) return 60;
      return 52;
    }
    function packFormulaTemplateCards(root) {
      if (!root || formulaTemplateGridColumnCount(root) < 2) return;
      const remaining = Array.from(root.querySelectorAll(":scope > .formula-template-button"));
      const packed = [];
      const occupiedRows = [0, 0];
      const cardRowSpan = (button) => Number.parseInt(button.dataset.templateRowSpan || "", 10) || 30;
      const placeHalfWidthCard = (button) => {
        const columnIndex = occupiedRows[0] <= occupiedRows[1] ? 0 : 1;
        occupiedRows[columnIndex] += cardRowSpan(button);
      };
      while (remaining.length) {
        const button = remaining.shift();
        if (formulaTemplateSpansAllColumns(button)) {
          while (occupiedRows[0] !== occupiedRows[1]) {
            const openColumn = occupiedRows[0] < occupiedRows[1] ? 0 : 1;
            const availableRows = Math.abs(occupiedRows[0] - occupiedRows[1]);
            const fillerIndex = remaining.findIndex((candidate) => !formulaTemplateSpansAllColumns(candidate) && cardRowSpan(candidate) <= availableRows + formulaTemplatePackingToleranceRows);
            if (fillerIndex < 0) break;
            const filler = remaining.splice(fillerIndex, 1)[0];
            packed.push(filler);
            occupiedRows[openColumn] += cardRowSpan(filler);
          }
          packed.push(button);
          const nextOccupiedRow = Math.max(...occupiedRows) + cardRowSpan(button);
          occupiedRows[0] = nextOccupiedRow;
          occupiedRows[1] = nextOccupiedRow;
          continue;
        }
        packed.push(button);
        placeHalfWidthCard(button);
      }
      root.replaceChildren(...packed);
    }
    function prepareFormulaTemplateCardWidths(root) {
      const buttons = Array.from(root.querySelectorAll(":scope > .formula-template-button"));
      for (const button of buttons) {
        button.classList.remove("is-wide-single-line");
        const preview = button.querySelector(".formula-template-preview");
        if (preview) preview.style.setProperty("--menu-preview-scale", "1");
      }
      void root.offsetWidth;
      for (const button of buttons) {
        const preview = button.querySelector(".formula-template-preview");
        const math = preview?.querySelector("mjx-container");
        if (!preview || !math) continue;
        const naturalRect = math.getBoundingClientRect();
        const naturalWidth = Math.max(math.scrollWidth, naturalRect.width);
        const naturalHeight = Math.max(math.scrollHeight, naturalRect.height);
        button.dataset.templateNaturalHeight = naturalHeight.toFixed(2);
        const availableWidth = Math.max(1, button.clientWidth - 18);
        if (button.classList.contains("is-single-line") && !button.classList.contains("is-half") && !root.classList.contains("is-single-column") && naturalWidth * formulaTemplateMinimumSingleLineScale > availableWidth) {
          button.classList.add("is-wide-single-line");
        }
      }
      void root.offsetWidth;
      const rowHeight = Number.parseFloat(window.getComputedStyle(root).gridAutoRows) || 2;
      for (const button of buttons) {
        const preview = button.querySelector(".formula-template-preview");
        const math = preview?.querySelector("mjx-container");
        if (!preview || !math) continue;
        const naturalRect = math.getBoundingClientRect();
        const naturalWidth = Math.max(math.scrollWidth, naturalRect.width);
        const naturalHeight = Math.max(math.scrollHeight, naturalRect.height);
        const availableWidth = Math.max(1, button.clientWidth - 18);
        const scale = Math.min(1, availableWidth / Math.max(1, naturalWidth));
        const desiredHeight = Math.ceil(Math.max(
          formulaTemplateMinimumHeight(button),
          naturalHeight * scale + 22
        ));
        const marginBottom = Number.parseFloat(window.getComputedStyle(button).marginBottom) || 0;
        button.dataset.templateRowSpan = String(
          Math.ceil((desiredHeight + marginBottom) / rowHeight)
        );
      }
      packFormulaTemplateCards(root);
    }
    function fitFormulaTemplateCards(root) {
      if (!root) return;
      prepareFormulaTemplateCardWidths(root);
      const rowHeight = Number.parseFloat(window.getComputedStyle(root).gridAutoRows) || 2;
      for (const button of root.querySelectorAll(".formula-template-button")) {
        const preview = button.querySelector(".formula-template-preview");
        const math = preview?.querySelector("mjx-container");
        if (!preview || !math) continue;
        preview.style.setProperty("--menu-preview-scale", "1");
        const naturalRect = math.getBoundingClientRect();
        const naturalWidth = Math.max(math.scrollWidth, naturalRect.width);
        const naturalHeight = Math.max(math.scrollHeight, naturalRect.height);
        const availableWidth = Math.max(1, button.clientWidth - 18);
        const scale = Math.min(1, availableWidth / Math.max(1, naturalWidth));
        preview.style.setProperty("--menu-preview-scale", scale.toFixed(3));
        preview.classList.toggle("is-scaled", scale < 0.995);
        const minimumHeight = formulaTemplateMinimumHeight(button);
        const desiredHeight = Math.ceil(Math.max(minimumHeight, naturalHeight * scale + 22));
        const marginBottom = Number.parseFloat(window.getComputedStyle(button).marginBottom) || 0;
        button.style.gridRow = `span ${Math.ceil((desiredHeight + marginBottom) / rowHeight)}`;
      }
    }
    function getViewportClampedPanelLeft(shellRect, buttonRect, panelWidth) {
      const viewportInset = 12;
      const preferredViewportLeft = buttonRect.left;
      const maximumViewportLeft = Math.max(
        viewportInset,
        window.innerWidth - panelWidth - viewportInset
      );
      const viewportLeft = Math.min(
        Math.max(viewportInset, preferredViewportLeft),
        maximumViewportLeft
      );
      return viewportLeft - shellRect.left;
    }
    function positionShortcutPanel() {
      if (!shortcutCategoryShell || !shortcutSymbolPanel || shortcutSymbolPanel.hidden || !activeShortcutButton) return;
      const shellRect = shortcutCategoryShell.getBoundingClientRect();
      const buttonRect = activeShortcutButton.getBoundingClientRect();
      const panelWidth = shortcutSymbolPanel.offsetWidth;
      shortcutSymbolPanel.style.left = `${getViewportClampedPanelLeft(shellRect, buttonRect, panelWidth)}px`;
      shortcutSymbolPanel.style.top = `${buttonRect.bottom - shellRect.top + 3}px`;
    }
    function closeShortcutPanel({ force = false, restoreFocus = false } = {}) {
      if (shortcutPanelPinned && !force) return;
      const previousButton = activeShortcutButton;
      previousButton?.classList.remove("is-active");
      previousButton?.setAttribute("aria-expanded", "false");
      if (shortcutSymbolPanel) shortcutSymbolPanel.hidden = true;
      openShortcutCategoryId = "";
      shortcutPanelPinned = false;
      activeShortcutButton = null;
      if (restoreFocus) previousButton?.focus();
    }
    function renderShortcutPanel(category) {
      if (!shortcutSymbolPanel) return;
      shortcutSymbolPanel.dataset.shortcutCategory = category.id;
      const body = document.createElement("div");
      body.className = "shortcut-symbol-panel-body";
      for (const candidateGroup of category.groups) {
        const section = document.createElement("section");
        section.className = "shortcut-symbol-group";
        section.dataset.shortcutGroup = candidateGroup.label;
        const groupHeading = document.createElement("h4");
        groupHeading.textContent = candidateGroup.label;
        const grid = document.createElement("div");
        const groupLayout = candidateGroup.layout || "compact";
        grid.className = `shortcut-symbol-grid is-${groupLayout}`;
        if (groupLayout === "compact") {
          grid.style.setProperty("--shortcut-compact-columns", String(Math.min(16, candidateGroup.items.length)));
        } else if (groupLayout === "fill") {
          grid.style.setProperty("--shortcut-fill-columns", String(Math.min(4, candidateGroup.items.length)));
        } else if (groupLayout === "formula") {
          grid.style.setProperty("--shortcut-formula-columns", String(Math.min(3, candidateGroup.items.length)));
        }
        for (const item of candidateGroup.items) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "shortcut-symbol-button";
          button.dataset.toolInsert = item.latex;
          if (item.snippet) button.dataset.toolSnippet = item.snippet;
          button.title = item.label ? `${item.label}\uFF1A${item.latex}` : `\u63D2\u5165 ${item.latex}`;
          button.setAttribute("aria-label", button.title);
          const preview = document.createElement("span");
          preview.className = "shortcut-symbol-preview";
          preview.textContent = `\\(${item.preview}\\)`;
          button.append(preview);
          grid.append(button);
        }
        section.append(groupHeading, grid);
        body.append(section);
      }
      shortcutSymbolPanel.replaceChildren(body);
      typesetFormulaTools(shortcutSymbolPanel).then(() => {
        scheduleShortcutPanelPreviewFit(category.id);
      });
    }
    function openShortcutPanel(category, button, { pinned = false, focusFirst = false } = {}) {
      if (openShortcutCategoryId !== category.id) {
        renderShortcutPanel(category);
        activeShortcutButton?.classList.remove("is-active");
        activeShortcutButton?.setAttribute("aria-expanded", "false");
      }
      openShortcutCategoryId = category.id;
      shortcutPanelPinned = pinned;
      activeShortcutButton = button;
      button.classList.add("is-active");
      button.setAttribute("aria-expanded", "true");
      shortcutSymbolPanel.hidden = false;
      window.requestAnimationFrame(() => {
        positionShortcutPanel();
        if (focusFirst) shortcutSymbolPanel.querySelector(".shortcut-symbol-button")?.focus();
      });
    }
    function positionTemplatePanel() {
      if (!formulaTemplateShell || !formulaTemplateMenu || formulaTemplateMenu.hidden || !activeTemplateCategoryButton) return;
      const shellRect = formulaTemplateShell.getBoundingClientRect();
      const buttonRect = activeTemplateCategoryButton.getBoundingClientRect();
      const panelWidth = formulaTemplateMenu.offsetWidth;
      formulaTemplateMenu.style.left = `${getViewportClampedPanelLeft(shellRect, buttonRect, panelWidth)}px`;
      formulaTemplateMenu.style.top = `${buttonRect.bottom - shellRect.top + 3}px`;
    }
    function closeTemplatePanel({ force = false, restoreFocus = false } = {}) {
      if (templatePanelPinned && !force) return;
      const previousButton = activeTemplateCategoryButton;
      previousButton?.classList.remove("is-active");
      previousButton?.setAttribute("aria-expanded", "false");
      if (formulaTemplateMenu) formulaTemplateMenu.hidden = true;
      openTemplateCategoryId = "";
      templatePanelPinned = false;
      activeTemplateCategoryButton = null;
      if (restoreFocus) previousButton?.focus();
    }
    function renderTemplatePanel(category) {
      if (!formulaTemplateMenu || !formulaTemplateGrid) return;
      formulaTemplateGrid.classList.toggle("is-single-column", category.singleColumn);
      formulaTemplateGrid.replaceChildren();
      for (const candidate of category.templates) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "formula-template-button";
        if (candidate.layout && candidate.layout !== "standard") button.classList.add(`is-${candidate.layout}`);
        if (candidate.singleLine) {
          button.classList.add("is-single-line");
        }
        button.dataset.toolInsert = candidate.latex;
        button.title = `\u63D2\u5165${candidate.label}`;
        button.setAttribute("aria-label", button.title);
        const preview = document.createElement("span");
        preview.className = "formula-template-preview";
        if (candidate.singleLine) preview.classList.add("is-single-line");
        preview.textContent = `\\(${candidate.preview}\\)`;
        button.append(preview);
        formulaTemplateGrid.append(button);
      }
      formulaTemplateMenu.replaceChildren(formulaTemplateGrid);
      typesetFormulaTools(formulaTemplateMenu).then(() => {
        window.requestAnimationFrame(() => {
          fitFormulaTemplateCards(formulaTemplateGrid);
          positionTemplatePanel();
        });
      });
    }
    function openTemplatePanel(category, button, { pinned = false, focusFirst = false } = {}) {
      if (openTemplateCategoryId !== category.id) {
        renderTemplatePanel(category);
        activeTemplateCategoryButton?.classList.remove("is-active");
        activeTemplateCategoryButton?.setAttribute("aria-expanded", "false");
      }
      openTemplateCategoryId = category.id;
      templatePanelPinned = pinned;
      activeTemplateCategoryButton = button;
      button.classList.add("is-active");
      button.setAttribute("aria-expanded", "true");
      formulaTemplateMenu.hidden = false;
      window.requestAnimationFrame(() => {
        positionTemplatePanel();
        if (focusFirst) formulaTemplateGrid.querySelector(".formula-template-button")?.focus();
      });
    }
    function setFormulaToolMode(mode, focus = true) {
      if (!mode) return;
      if (!["shortcuts", "templates"].includes(mode)) return;
      activeFormulaToolMode = mode;
      document.querySelectorAll("[data-formula-tool-mode]").forEach((tab) => {
        const active = tab.dataset.formulaToolMode === mode;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
        if (active && focus) tab.focus();
      });
      document.querySelectorAll("[data-formula-tool-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.formulaToolPanel !== mode;
      });
      closeShortcutPanel({ force: true });
      closeTemplatePanel({ force: true });
      if (mode === "templates") window.requestAnimationFrame(() => typesetFormulaTools(formulaTemplateCategoryBar));
    }
    function applyFormulaEnvironment(environmentId, label) {
      const environment = String(environmentId || "none");
      const next = switchFormulaEnvironment2(getVisualLatexValue(), environment);
      if (next === null) return;
      if (environment === "none") {
        setVisualLatexValue(next, "\u5DF2\u79FB\u9664\u516C\u5F0F\u73AF\u5883");
        return;
      }
      setVisualLatexValue(next, `\u5DF2\u8BBE\u7F6E\u4E3A${label || `${environment} \u73AF\u5883`}`);
    }
    const formulaFormatToolIcons = Object.freeze({
      colors: "\u25C9",
      fonts: "A",
      "font-sizes": "T\u2195",
      environments: "{ }"
    });
    function positionFormulaFormatMenu() {
      if (!formulaFormatShell || !formulaFormatMenu || formulaFormatMenu.hidden || !activeFormatToolButton) return;
      const shellRect = formulaFormatShell.getBoundingClientRect();
      const buttonRect = activeFormatToolButton.getBoundingClientRect();
      const panelWidth = formulaFormatMenu.offsetWidth;
      formulaFormatMenu.style.left = `${getViewportClampedPanelLeft(shellRect, buttonRect, panelWidth)}px`;
      formulaFormatMenu.style.top = `${buttonRect.bottom - shellRect.top + 6}px`;
    }
    function closeFormulaFormatMenu({ restoreFocus = false } = {}) {
      const previousButton = activeFormatToolButton;
      previousButton?.classList.remove("is-active");
      previousButton?.setAttribute("aria-expanded", "false");
      if (formulaFormatMenu) formulaFormatMenu.hidden = true;
      openFormatToolId = "";
      activeFormatToolButton = null;
      if (restoreFocus) previousButton?.focus();
    }
    function renderFormulaFormatMenu(tool) {
      if (!formulaFormatMenu) return;
      const body = document.createElement("div");
      body.className = `formula-format-menu-body is-${tool.id}`;
      for (const candidateGroup of tool.groups) {
        const section = document.createElement("section");
        section.className = "formula-format-option-group";
        const groupHeading = document.createElement("h4");
        groupHeading.textContent = candidateGroup.label;
        const grid = document.createElement("div");
        grid.className = "formula-format-option-grid";
        for (const item of candidateGroup.items) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "formula-format-option";
          if (item.action === "environment") {
            button.dataset.formatAction = "environment";
            button.dataset.environmentId = item.id;
          } else {
            button.dataset.toolInsert = item.latex;
            if (item.snippet) button.dataset.toolSnippet = item.snippet;
          }
          button.title = `${item.label || tool.label}\uFF1A${item.latex}`;
          button.setAttribute("aria-label", button.title);
          if (tool.id === "colors") {
            const colorName = item.latex.match(/^\\color\{([^}]+)\}/)?.[1] || "currentColor";
            const swatch = document.createElement("span");
            swatch.className = "formula-color-swatch";
            swatch.style.setProperty("--formula-swatch-color", colorName);
            swatch.setAttribute("aria-hidden", "true");
            const label = document.createElement("span");
            label.className = "formula-format-option-label";
            label.textContent = item.label || colorName;
            button.append(swatch, label);
          } else {
            const text = document.createElement("span");
            text.className = "formula-format-option-text";
            const label = document.createElement("span");
            label.className = "formula-format-option-label";
            label.textContent = item.label || tool.label;
            const code = document.createElement("code");
            code.textContent = item.latex;
            text.append(label, code);
            const preview = document.createElement("span");
            preview.className = "formula-format-option-preview";
            preview.setAttribute("aria-hidden", "true");
            preview.textContent = `\\(${item.preview}\\)`;
            button.append(text, preview);
          }
          grid.append(button);
        }
        section.append(groupHeading, grid);
        body.append(section);
      }
      formulaFormatMenu.className = `formula-format-menu is-${tool.id}`;
      formulaFormatMenu.replaceChildren(body);
      typesetFormulaTools(formulaFormatMenu).then(() => {
        window.requestAnimationFrame(() => {
          fitMenuFormulaPreviews(
            formulaFormatMenu,
            ".formula-format-option",
            ".formula-format-option-preview",
            { horizontalPadding: 12, verticalPadding: 10, minimumScale: 0.5 }
          );
          positionFormulaFormatMenu();
        });
      });
    }
    function openFormulaFormatMenu(tool, button, { focusFirst = false } = {}) {
      if (!formulaFormatMenu) return;
      if (openFormatToolId !== tool.id) {
        renderFormulaFormatMenu(tool);
        activeFormatToolButton?.classList.remove("is-active");
        activeFormatToolButton?.setAttribute("aria-expanded", "false");
      }
      openFormatToolId = tool.id;
      activeFormatToolButton = button;
      button.classList.add("is-active");
      button.setAttribute("aria-expanded", "true");
      formulaFormatMenu.hidden = false;
      window.requestAnimationFrame(() => {
        positionFormulaFormatMenu();
        if (focusFirst) formulaFormatMenu.querySelector(".formula-format-option")?.focus();
      });
    }
    function initializeFormulaFormatToolbar() {
      const tools = window.FormulaOcrTools;
      if (!formulaFormatShell || !formulaFormatToolbar || !formulaFormatMenu || !tools?.formatTools) {
        console.warn("Formula format tool data or containers are unavailable.");
        return;
      }
      for (const tool of tools.formatTools) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "formula-format-button";
        button.dataset.formatToolId = tool.id;
        button.setAttribute("aria-haspopup", "true");
        button.setAttribute("aria-controls", "formula-format-menu");
        button.setAttribute("aria-expanded", "false");
        button.title = `\u5C55\u5F00${tool.label}\u9009\u9879`;
        const icon = document.createElement("span");
        icon.className = "formula-format-button-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = formulaFormatToolIcons[tool.id] || "\u2022";
        const label = document.createElement("span");
        label.textContent = tool.label;
        const arrow = document.createElement("span");
        arrow.className = "formula-format-button-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "\u2304";
        button.append(icon, label, arrow);
        button.addEventListener("click", () => {
          if (openFormatToolId === tool.id) {
            closeFormulaFormatMenu({ restoreFocus: true });
            return;
          }
          openFormulaFormatMenu(tool, button);
        });
        button.addEventListener("keydown", (event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            openFormulaFormatMenu(tool, button, { focusFirst: true });
            return;
          }
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const buttons = [...formulaFormatToolbar.querySelectorAll(".formula-format-button")];
          const current = buttons.indexOf(button);
          let next = event.key === "Home" ? 0 : buttons.length - 1;
          if (event.key === "ArrowLeft") next = (current - 1 + buttons.length) % buttons.length;
          if (event.key === "ArrowRight") next = (current + 1) % buttons.length;
          buttons[next]?.focus();
        });
        formulaFormatToolbar.append(button);
      }
      formulaFormatMenu.addEventListener("click", (event) => {
        const button = event.target.closest('[data-tool-insert], [data-format-action="environment"]');
        if (!button || !formulaFormatMenu.contains(button)) return;
        const label = button.querySelector(".formula-format-option-label")?.textContent || "\u6392\u7248\u547D\u4EE4";
        if (button.dataset.formatAction === "environment") {
          applyFormulaEnvironment(button.dataset.environmentId, label);
        } else {
          insertVisualLatex(button.dataset.toolInsert, button.dataset.toolSnippet || "", { wrapSelection: true });
          setVisualStatus(`\u5DF2\u5E94\u7528${label}`);
        }
        closeFormulaFormatMenu();
      });
      formulaFormatMenu.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        closeFormulaFormatMenu({ restoreFocus: true });
      });
    }
    function initializeFormulaToolbox() {
      const tools = window.FormulaOcrTools;
      if (!formulaToolbox || !shortcutCategoryBar || !shortcutSymbolPanel || !formulaTemplateShell || !formulaTemplateCategoryBar || !formulaTemplateMenu || !formulaTemplateGrid || !tools?.templateCategories) {
        console.warn("Formula tool data or containers are unavailable.");
        return;
      }
      for (const category of tools.categories) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "shortcut-category-button";
        button.dataset.categoryId = category.id;
        button.setAttribute("aria-haspopup", "true");
        button.setAttribute("aria-controls", "shortcut-symbol-panel");
        button.setAttribute("aria-expanded", "false");
        button.title = `\u5C55\u5F00${category.label}`;
        const icon = document.createElement("span");
        icon.className = "shortcut-category-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = `\\(${category.icon}\\)`;
        const label = document.createElement("span");
        label.className = "shortcut-category-label";
        label.textContent = category.label;
        const arrow = document.createElement("span");
        arrow.className = "shortcut-category-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "\u25BC";
        button.append(icon, label, arrow);
        button.addEventListener("click", () => {
          if (openShortcutCategoryId === category.id && shortcutPanelPinned) {
            closeShortcutPanel({ force: true, restoreFocus: true });
            return;
          }
          openShortcutPanel(category, button, { pinned: true });
        });
        button.addEventListener("keydown", (event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            openShortcutPanel(category, button, { pinned: true, focusFirst: true });
            return;
          }
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const buttons = [...shortcutCategoryBar.querySelectorAll(".shortcut-category-button")];
          const current = buttons.indexOf(button);
          let next = event.key === "Home" ? 0 : buttons.length - 1;
          if (event.key === "ArrowLeft") next = (current - 1 + buttons.length) % buttons.length;
          if (event.key === "ArrowRight") next = (current + 1) % buttons.length;
          buttons[next]?.focus();
        });
        shortcutCategoryBar.append(button);
      }
      for (const category of tools.templateCategories) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "shortcut-category-button formula-template-category-button";
        button.dataset.templateCategoryId = category.id;
        button.setAttribute("aria-haspopup", "true");
        button.setAttribute("aria-controls", "formula-template-menu");
        button.setAttribute("aria-expanded", "false");
        button.title = `\u5C55\u5F00${category.label}\u516C\u5F0F\u6A21\u677F`;
        const icon = document.createElement("span");
        icon.className = "shortcut-category-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = `\\(${category.icon}\\)`;
        const label = document.createElement("span");
        label.className = "shortcut-category-label";
        label.textContent = category.label;
        const arrow = document.createElement("span");
        arrow.className = "shortcut-category-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "\u25BC";
        button.append(icon, label, arrow);
        button.addEventListener("click", () => {
          if (openTemplateCategoryId === category.id && templatePanelPinned) {
            closeTemplatePanel({ force: true, restoreFocus: true });
            return;
          }
          openTemplatePanel(category, button, { pinned: true });
        });
        button.addEventListener("keydown", (event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            openTemplatePanel(category, button, { pinned: true, focusFirst: true });
            return;
          }
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const buttons = [...formulaTemplateCategoryBar.querySelectorAll(".formula-template-category-button")];
          const current = buttons.indexOf(button);
          let next = event.key === "Home" ? 0 : buttons.length - 1;
          if (event.key === "ArrowLeft") next = (current - 1 + buttons.length) % buttons.length;
          if (event.key === "ArrowRight") next = (current + 1) % buttons.length;
          buttons[next]?.focus();
        });
        formulaTemplateCategoryBar.append(button);
      }
      formulaToolbox.addEventListener("click", (event) => {
        const button = event.target.closest("[data-tool-insert]");
        if (!button || !formulaToolbox.contains(button)) return;
        insertVisualLatex(button.dataset.toolInsert, button.dataset.toolSnippet || "");
        setVisualStatus(`\u5DF2\u63D2\u5165${button.title.replace(/^插入/, "") || "\u516C\u5F0F"}`);
        if (button.classList.contains("shortcut-symbol-button")) closeShortcutPanel({ force: true });
        if (button.classList.contains("formula-template-button")) closeTemplatePanel({ force: true });
      });
      shortcutSymbolPanel.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        closeShortcutPanel({ force: true, restoreFocus: true });
      });
      formulaTemplateMenu.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        closeTemplatePanel({ force: true, restoreFocus: true });
      });
      document.querySelectorAll("[data-formula-tool-mode]").forEach((tab) => {
        tab.addEventListener("click", () => setFormulaToolMode(tab.dataset.formulaToolMode, false));
        tab.addEventListener("keydown", (event) => {
          if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
          event.preventDefault();
          setFormulaToolMode(activeFormulaToolMode === "shortcuts" ? "templates" : "shortcuts");
        });
      });
      document.addEventListener("pointerdown", (event) => {
        if (!shortcutSymbolPanel.hidden && !shortcutCategoryShell.contains(event.target)) {
          closeShortcutPanel({ force: true });
        }
        if (!formulaTemplateMenu.hidden && !formulaTemplateShell.contains(event.target)) {
          closeTemplatePanel({ force: true });
        }
        if (!formulaFormatMenu?.hidden && !formulaFormatShell?.contains(event.target)) {
          closeFormulaFormatMenu();
        }
      });
      window.addEventListener("resize", () => {
        fitMenuFormulaPreviews(
          shortcutSymbolPanel,
          ".shortcut-symbol-button",
          ".shortcut-symbol-preview",
          { horizontalPadding: 14, verticalPadding: 10, minimumScale: 0.48 }
        );
        fitFormulaTemplateCards(formulaTemplateGrid);
        fitMenuFormulaPreviews(
          formulaFormatMenu,
          ".formula-format-option",
          ".formula-format-option-preview",
          { horizontalPadding: 12, verticalPadding: 10, minimumScale: 0.5 }
        );
        positionShortcutPanel();
        positionTemplatePanel();
        positionFormulaFormatMenu();
      });
      shortcutCategoryShell.querySelector(".shortcut-category-scroll")?.addEventListener("scroll", positionShortcutPanel);
      formulaTemplateShell.querySelector(".formula-template-category-scroll")?.addEventListener("scroll", positionTemplatePanel);
      typesetFormulaTools(shortcutCategoryBar);
      typesetFormulaTools(formulaTemplateCategoryBar);
    }
    initializeFormulaToolbox();
    initializeFormulaFormatToolbar();
    return { closeFormulaFormatMenu };
  }

  // frontend/app/features/handwriting-controller.ts
  function initializeHandwritingController({
    insertVisualLatex
  }) {
    const canvas = $("#handwriting-canvas");
    const context = canvas.getContext("2d");
    const state = {
      activeStroke: null,
      dataset: null,
      datasetPromise: null,
      recognitionGeneration: 0,
      strokes: []
    };
    function pointFromEvent(event) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * canvas.width / rect.width,
        y: (event.clientY - rect.top) * canvas.height / rect.height
      };
    }
    function draw() {
      context.clearRect(0, 0, canvas.width, canvas.height);
      const dark = document.documentElement.dataset.fnosTheme === "dark" || !document.documentElement.dataset.fnosTheme && window.matchMedia("(prefers-color-scheme: dark)").matches;
      context.strokeStyle = dark ? "#d8e6fb" : "#173860";
      context.lineWidth = 5;
      context.lineCap = "round";
      context.lineJoin = "round";
      for (const stroke of state.strokes) {
        if (!stroke.length) continue;
        context.beginPath();
        context.moveTo(stroke[0].x, stroke[0].y);
        for (const point of stroke.slice(1)) context.lineTo(point.x, point.y);
        context.stroke();
      }
    }
    function candidateMessage(text) {
      return Object.assign(document.createElement("p"), {
        className: "subtle",
        textContent: text
      });
    }
    function clear() {
      state.recognitionGeneration += 1;
      state.strokes = [];
      state.activeStroke = null;
      draw();
      $("#handwriting-candidates").replaceChildren(
        candidateMessage("\u8BF7\u753B\u4E00\u4E2A\u6570\u5B66\u7B26\u53F7\uFF0C\u518D\u83B7\u53D6\u5019\u9009\u3002")
      );
    }
    function hasStrokes(strokes = state.strokes) {
      return strokes.length > 0 && strokes.some((stroke) => stroke?.length);
    }
    async function loadDataset() {
      if (state.dataset) return state.dataset;
      if (!state.datasetPromise) {
        state.datasetPromise = (async () => {
          try {
            const response = await fetch(endpoint("vendor/detexify/detexify-dataset.json"));
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
          } catch (error) {
            console.warn("Failed to load Detexify dataset:", error);
            return [];
          }
        })();
      }
      state.dataset = await state.datasetPromise;
      return state.dataset;
    }
    async function renderSymbolGlyph(item, span) {
      const command = item?.cmd || "";
      span.textContent = `\\(${command}\\)`;
      try {
        await typesetMathJax([span]);
        if (span.querySelector(".mjx-merror, [data-mjx-error], mjx-container[data-mjx-error], .merror")) {
          throw new Error("MathJax \u672A\u80FD\u6E32\u67D3\u6B64\u7B26\u53F7");
        }
      } catch (error) {
        span.textContent = command;
        span.title = error.message || String(error);
        span.classList.add("candidate-glyph-error");
      }
    }
    function classify(strokes, dataset) {
      if (!hasStrokes(strokes) || !dataset.length || !window.DetexifyClassifier) return [];
      const rawResults = window.DetexifyClassifier.classify(strokes, dataset, 24);
      const seen = /* @__PURE__ */ new Set();
      const candidates = [];
      for (const result of rawResults) {
        if (!result?.item) continue;
        const item = { ...result.item };
        const key = item.cmd || item.id;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push(item);
        if (candidates.length >= 12) break;
      }
      return candidates;
    }
    async function recognize() {
      const generation = ++state.recognitionGeneration;
      const container = $("#handwriting-candidates");
      const strokes = state.strokes.map((stroke) => stroke.map((point) => ({ ...point })));
      if (!hasStrokes(strokes)) {
        container.replaceChildren(
          candidateMessage("\u5728\u4E0A\u65B9\u753B\u5E03\u7ED8\u5236\u7B26\u53F7\uFF0C\u677E\u7B14\u540E\u81EA\u52A8\u4EA7\u751F\u5339\u914D\u5019\u9009\u3002")
        );
        return;
      }
      const dataset = await loadDataset();
      if (generation !== state.recognitionGeneration) return;
      const candidates = classify(strokes, dataset);
      if (!candidates.length) {
        container.replaceChildren(
          candidateMessage("\u672A\u627E\u5230\u5339\u914D\u5019\u9009\u7B26\u53F7\uFF0C\u8BF7\u5C1D\u8BD5\u91CD\u65B0\u4E66\u5199\u3002")
        );
        return;
      }
      const note = document.createElement("p");
      note.className = "subtle";
      const uniqueSymbols = new Set(dataset.map((item) => item.cmd || item.id)).size;
      note.textContent = `\u539F\u751F\u5185\u7F6E\u7B26\u53F7\u5339\u914D\uFF08${uniqueSymbols} \u4E2A\u7B26\u53F7\u547D\u4EE4\uFF0C\u524D ${candidates.length} \u4E2A\u5019\u9009\uFF09\uFF1A`;
      const list = document.createElement("div");
      list.className = "candidate-list";
      for (const item of candidates) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "candidate-button";
        const commandContainer = document.createElement("div");
        commandContainer.className = "candidate-command";
        const commandCode = document.createElement("code");
        commandCode.textContent = item.cmd;
        commandContainer.append(commandCode);
        if (item.pkg) {
          const packageInfo = document.createElement("small");
          packageInfo.className = "subtle";
          packageInfo.textContent = `(${item.pkg})`;
          commandContainer.append(packageInfo);
        }
        const glyph = document.createElement("span");
        glyph.className = "candidate-glyph";
        button.append(commandContainer, glyph);
        button.title = `\u70B9\u51FB\u63D2\u5165\u547D\u4EE4 ${item.cmd}`;
        button.addEventListener("click", () => insertVisualLatex(item.cmd));
        list.append(button);
        await renderSymbolGlyph(item, glyph);
        if (generation !== state.recognitionGeneration) return;
      }
      container.replaceChildren(note, list);
    }
    function finishStroke(event) {
      if (!state.activeStroke) return;
      state.activeStroke.push(pointFromEvent(event));
      state.activeStroke = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      draw();
      recognize();
    }
    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      canvas.setPointerCapture(event.pointerId);
      state.activeStroke = [pointFromEvent(event)];
      state.strokes.push(state.activeStroke);
      draw();
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!state.activeStroke) return;
      state.activeStroke.push(pointFromEvent(event));
      draw();
    });
    canvas.addEventListener("pointerup", finishStroke);
    canvas.addEventListener("pointercancel", finishStroke);
    $("#handwriting-clear").addEventListener("click", () => {
      clear();
      $("#handwriting-candidates").replaceChildren(
        candidateMessage("\u5728\u4E0A\u65B9\u753B\u5E03\u7ED8\u5236\u7B26\u53F7\uFF0C\u677E\u7B14\u540E\u81EA\u52A8\u4EA7\u751F\u5339\u914D\u5019\u9009\u3002")
      );
    });
    $("#handwriting-undo").addEventListener("click", () => {
      state.strokes.pop();
      draw();
      recognize();
    });
    draw();
  }

  // frontend/app/features/image-controller.ts
  var SUPPORTED_IMAGE_TYPE = /^image\/(png|jpeg|webp)$/;
  function initializeImageController({
    idPrefix = "",
    isJobActive,
    onImageChanged,
    setStatus
  }) {
    const element = (id) => $(`#${idPrefix}${id}`);
    const imageInput = element("image-input");
    const dropZone = element("drop-zone");
    const imagePanel = element("image-panel");
    const preview = element("image-preview");
    const cropCanvas = element("crop-canvas");
    const cropDialog = element("crop-dialog");
    const page = element("ocr-page");
    const subject = idPrefix ? "\u8868\u683C" : "\u516C\u5F0F";
    const state = {
      crop: null,
      cropImage: null,
      file: null,
      isCropped: false,
      originalFile: null
    };
    function notifyImageChanged() {
      onImageChanged?.();
    }
    function setImage(file, isCropped = false) {
      if (!file || !SUPPORTED_IMAGE_TYPE.test(file.type)) {
        setStatus("\u8BF7\u9009\u62E9 PNG\u3001JPEG \u6216 WebP \u56FE\u7247\u3002", true);
        return;
      }
      state.isCropped = isCropped;
      if (!isCropped) state.originalFile = file;
      state.file = file;
      preview.src = URL.createObjectURL(file);
      preview.onload = () => URL.revokeObjectURL(preview.src);
      dropZone.hidden = true;
      imagePanel.hidden = false;
      const restoreButton = element("restore-image");
      if (restoreButton) restoreButton.hidden = !state.isCropped;
      notifyImageChanged();
      element("image-info").textContent = `${file.name || "\u7C98\u8D34\u56FE\u7247"} \xB7 ${(file.size / 1024).toFixed(1)} KB${state.isCropped ? " (\u5DF2\u88C1\u526A)" : ""}`;
      setStatus(state.isCropped ? "\u56FE\u7247\u88C1\u526A\u6210\u529F\u3002\u8BEF\u88C1\u526A\u53EF\u70B9\u51FB\u201C\u8FD8\u539F\u539F\u56FE\u201D\u3002" : "\u56FE\u7247\u5DF2\u51C6\u5907\u597D\u3002");
    }
    function prepareCropCanvas() {
      const sourceImage = state.cropImage || preview;
      const width = sourceImage.naturalWidth || sourceImage.width;
      const height = sourceImage.naturalHeight || sourceImage.height;
      const maxWidth = Math.min(width, 900);
      const ratio = maxWidth / width;
      cropCanvas.width = maxWidth;
      cropCanvas.height = Math.round(height * ratio);
      const context = cropCanvas.getContext("2d");
      state.crop = {
        context,
        dragging: false,
        end: null,
        ratio,
        sourceImage,
        start: null
      };
      drawCrop();
    }
    function drawCrop() {
      if (!state.crop) return;
      const {
        context,
        start,
        end,
        sourceImage
      } = state.crop;
      const image = sourceImage || preview;
      context.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
      context.drawImage(image, 0, 0, cropCanvas.width, cropCanvas.height);
      if (!start || !end) return;
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const width = Math.abs(start.x - end.x);
      const height = Math.abs(start.y - end.y);
      context.fillStyle = "rgba(0, 0, 0, .45)";
      context.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
      context.drawImage(
        image,
        x / state.crop.ratio,
        y / state.crop.ratio,
        width / state.crop.ratio,
        height / state.crop.ratio,
        x,
        y,
        width,
        height
      );
      context.strokeStyle = "#1769e0";
      context.lineWidth = 2;
      context.strokeRect(x, y, width, height);
    }
    function canvasPoint(event) {
      const rect = cropCanvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * cropCanvas.width / rect.width,
        y: (event.clientY - rect.top) * cropCanvas.height / rect.height
      };
    }
    function openCrop() {
      const cropFile = state.originalFile || state.file;
      if (!cropFile) {
        setStatus("\u8BF7\u5148\u9009\u62E9\u56FE\u7247\u3002", true);
        return;
      }
      const image = new Image();
      image.src = URL.createObjectURL(cropFile);
      image.onload = () => {
        state.cropImage = image;
        prepareCropCanvas();
        cropDialog.showModal();
      };
    }
    function closeCrop() {
      if (cropDialog.open) cropDialog.close();
      if (state.cropImage?.src) URL.revokeObjectURL(state.cropImage.src);
      state.cropImage = null;
      state.crop = null;
    }
    function finishCropDrag(event) {
      if (!state.crop?.dragging) return;
      state.crop.end = canvasPoint(event);
      state.crop.dragging = false;
      if (cropCanvas.hasPointerCapture(event.pointerId)) {
        cropCanvas.releasePointerCapture(event.pointerId);
      }
      drawCrop();
    }
    element("select-image").addEventListener("click", () => imageInput.click());
    imageInput.addEventListener("change", () => setImage(imageInput.files?.[0]));
    dropZone.addEventListener("click", (event) => {
      if (event.target === dropZone) imageInput.click();
    });
    dropZone.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      imageInput.click();
    });
    dropZone.addEventListener("dragover", (event) => {
      event.preventDefault();
      dropZone.classList.add("dragging");
    });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
    dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      dropZone.classList.remove("dragging");
      setImage(event.dataTransfer?.files[0]);
    });
    window.addEventListener("paste", (event) => {
      if (page.hidden) return;
      for (const item of event.clipboardData?.items || []) {
        if (!item.type.startsWith("image/")) continue;
        if (isJobActive()) {
          setStatus("\u8BC6\u522B\u4EFB\u52A1\u8FDB\u884C\u4E2D\uFF0C\u5DF2\u5FFD\u7565\u65B0\u7684\u526A\u8D34\u677F\u56FE\u7247\u3002", true);
          return;
        }
        setImage(item.getAsFile());
        break;
      }
    });
    element("clear-image").addEventListener("click", () => {
      closeCrop();
      state.file = null;
      state.originalFile = null;
      state.isCropped = false;
      preview.removeAttribute("src");
      imagePanel.hidden = true;
      dropZone.hidden = false;
      imageInput.value = "";
      const restoreButton = element("restore-image");
      if (restoreButton) restoreButton.hidden = true;
      notifyImageChanged();
      setStatus("\u8BF7\u9009\u62E9\u56FE\u7247\u3002");
    });
    element("restore-image").addEventListener("click", () => {
      if (!state.originalFile) return;
      setImage(state.originalFile, false);
      setStatus("\u5DF2\u6210\u529F\u8FD8\u539F\u4E3A\u539F\u59CB\u56FE\u7247\u3002");
    });
    element("crop-open").addEventListener("click", openCrop);
    element("crop-close").addEventListener("click", closeCrop);
    element("crop-cancel").addEventListener("click", closeCrop);
    element("crop-reset").addEventListener("click", prepareCropCanvas);
    cropDialog.addEventListener("close", closeCrop);
    cropCanvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !state.crop) return;
      cropCanvas.setPointerCapture(event.pointerId);
      const point = canvasPoint(event);
      state.crop.start = point;
      state.crop.end = point;
      state.crop.dragging = true;
      drawCrop();
    });
    cropCanvas.addEventListener("pointermove", (event) => {
      if (!state.crop?.dragging) return;
      state.crop.end = canvasPoint(event);
      drawCrop();
    });
    cropCanvas.addEventListener("pointerup", finishCropDrag);
    cropCanvas.addEventListener("pointercancel", finishCropDrag);
    element("crop-apply").addEventListener("click", () => {
      const crop = state.crop;
      if (!crop?.start || !crop.end) {
        setStatus(`\u8BF7\u5728\u56FE\u7247\u4E0A\u62D6\u52A8\u4EE5\u9009\u62E9${subject}\u533A\u57DF\u3002`, true);
        return;
      }
      const x = Math.min(crop.start.x, crop.end.x) / crop.ratio;
      const y = Math.min(crop.start.y, crop.end.y) / crop.ratio;
      const width = Math.abs(crop.start.x - crop.end.x) / crop.ratio;
      const height = Math.abs(crop.start.y - crop.end.y) / crop.ratio;
      if (width < 8 || height < 8) {
        setStatus("\u88C1\u526A\u533A\u57DF\u8FC7\u5C0F\u3002", true);
        return;
      }
      const sourceImage = crop.sourceImage || preview;
      const output = document.createElement("canvas");
      output.width = Math.round(width);
      output.height = Math.round(height);
      output.getContext("2d").drawImage(
        sourceImage,
        x,
        y,
        width,
        height,
        0,
        0,
        output.width,
        output.height
      );
      output.toBlob((blob) => {
        if (blob) setImage(new File([blob], `${idPrefix || "formula-"}crop.png`, { type: "image/png" }), true);
        closeCrop();
      }, "image/png");
    });
    return {
      getFile: () => state.file,
      setJobActive(active) {
        element("clear-image").disabled = active;
        element("crop-open").disabled = active;
      }
    };
  }

  // frontend/app/features/job-controller.ts
  var ACTIVE_STATUSES = /* @__PURE__ */ new Set(["queued", "loading_model", "running"]);
  var TERMINAL_STATUSES = /* @__PURE__ */ new Set(["succeeded", "failed", "timed_out", "cancelled"]);
  function initializeJobController(options) {
    const {
      getImageFile,
      idPrefix = "",
      kind,
      setImageJobActive,
      setStatus
    } = options;
    const element = (id) => $(`#${idPrefix}${id}`);
    const state = {
      id: null,
      pollTimer: void 0,
      status: null
    };
    function isActive(status = state.status) {
      return status !== null && ACTIVE_STATUSES.has(status);
    }
    function refreshControls() {
      const active = isActive();
      element("recognize").disabled = !getImageFile() || active;
      element("cancel-job").hidden = !state.id || !active;
      setImageJobActive(active);
    }
    function stopPolling() {
      window.clearTimeout(state.pollTimer);
      state.pollTimer = void 0;
    }
    async function poll() {
      const jobId = state.id;
      if (!jobId) return;
      try {
        const response = await fetch(endpoint(`api/jobs/${jobId}`));
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail || "\u65E0\u6CD5\u8BFB\u53D6\u4EFB\u52A1\u72B6\u6001\u3002");
        if (state.id !== jobId) return;
        const job = payload.job;
        state.status = job.status;
        const labels = {
          queued: `\u6B63\u5728\u6392\u961F\uFF0C\u7B2C ${job.queue_position || "?"} \u4F4D`,
          loading_model: "\u6B63\u5728\u52A0\u8F7D\u6A21\u578B\uFF08\u9996\u6B21\u52A0\u8F7D\u6216\u5207\u6362\u6A21\u578B\u65F6\u9700\u8981\u7B49\u5F85\uFF09\u2026",
          running: `\u6B63\u5728\u8BC6\u522B${kind === "table" ? "\u8868\u683C" : "\u516C\u5F0F"}\u2026`,
          succeeded: "\u8BC6\u522B\u5B8C\u6210\u3002",
          failed: `\u8BC6\u522B\u5931\u8D25\uFF1A${job.error_message || "\u672A\u77E5\u9519\u8BEF"}`,
          timed_out: "\u8BC6\u522B\u8D85\u65F6\u3002",
          cancelled: "\u4EFB\u52A1\u5DF2\u53D6\u6D88\uFF1B\u5F53\u524D\u5E95\u5C42\u63A8\u7406\u4F1A\u81EA\u7136\u7ED3\u675F\uFF0C\u6A21\u578B\u4FDD\u6301\u52A0\u8F7D\u3002"
        };
        setStatus(
          labels[job.status] || job.status,
          ["failed", "timed_out"].includes(job.status),
          job.status
        );
        if (job.status === "succeeded") {
          if (options.kind === "formula") {
            const formulaJob = job;
            const recognizedLatex = String(formulaJob.latex_raw || "");
            const formattedResult = await options.safelyFormatRecognizedLatex(recognizedLatex);
            options.setLatexValue(formattedResult.latex);
            await options.renderLatex();
            if (formattedResult.formatted) {
              setStatus("\u8BC6\u522B\u5B8C\u6210\uFF0C\u6E90\u7801\u5DF2\u901A\u8FC7\u7B49\u4EF7\u6027\u68C0\u67E5\u5E76\u81EA\u52A8\u683C\u5F0F\u5316\u3002", false, job.status);
            } else if (!["unchanged", "formatter-unavailable"].includes(formattedResult.status)) {
              setStatus("\u8BC6\u522B\u5B8C\u6210\uFF1B\u65E0\u6CD5\u786E\u8BA4\u683C\u5F0F\u5316\u7ED3\u679C\u5B8C\u5168\u7B49\u4EF7\uFF0C\u5DF2\u4FDD\u7559\u539F\u59CB\u6E90\u7801\u3002", false, job.status);
            }
            if ($("#auto-copy").checked) await options.copyLatex();
          } else {
            const tables = job.tables || [];
            await options.setTableResults(tables);
            setStatus(`\u8BC6\u522B\u5B8C\u6210\uFF0C\u5171 ${tables.length} \u4E2A\u8868\u683C\u3002`, false, job.status);
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
          setStatus(`\u8BFB\u53D6\u4EFB\u52A1\u72B6\u6001\u5931\u8D25\uFF0C\u6B63\u5728\u91CD\u8BD5\uFF1A${error.message}`, true);
        }
      } finally {
        if (state.id === jobId && isActive()) {
          stopPolling();
          state.pollTimer = window.setTimeout(poll, 750);
        }
      }
    }
    element("recognize").addEventListener("click", async () => {
      const imageFile = getImageFile();
      if (!imageFile) return;
      const body = new FormData();
      body.append("image", imageFile, imageFile.name);
      body.append("kind", kind);
      element("recognize").disabled = true;
      setStatus("\u6B63\u5728\u521B\u5EFA\u4EFB\u52A1\u2026", false, "queued");
      try {
        const response = await fetch(endpoint("api/jobs"), { method: "POST", body });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail || "\u521B\u5EFA\u4EFB\u52A1\u5931\u8D25\u3002");
        state.id = payload.job.id;
        state.status = "queued";
        refreshControls();
        await poll();
      } catch (error) {
        state.id = null;
        state.status = null;
        refreshControls();
        setStatus(error.message, true);
      }
    });
    element("cancel-job").addEventListener("click", async () => {
      if (!state.id) return;
      element("cancel-job").disabled = true;
      try {
        const response = await fetch(endpoint(`api/jobs/${state.id}`), { method: "DELETE" });
        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload.detail || "\u65E0\u6CD5\u53D6\u6D88\u4EFB\u52A1\u3002");
        }
        state.status = "cancelled";
        setStatus("\u4EFB\u52A1\u5DF2\u53D6\u6D88\uFF1B\u5F53\u524D\u5E95\u5C42\u63A8\u7406\u4F1A\u81EA\u7136\u7ED3\u675F\uFF0C\u6A21\u578B\u4FDD\u6301\u52A0\u8F7D\u3002", false, "cancelled");
        stopPolling();
        state.id = null;
        refreshControls();
      } catch (error) {
        setStatus(error.message, true);
      } finally {
        element("cancel-job").disabled = false;
      }
    });
    refreshControls();
    return { isActive, refreshControls };
  }

  // frontend/app/features/table-controller.ts
  function splitPipeRow(line) {
    const source = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    const cells = [];
    let cell = "";
    let escaped = false;
    for (const character of source) {
      if (escaped) {
        cell += character === "|" ? "|" : `\\${character}`;
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "|") {
        cells.push(cell.trim());
        cell = "";
      } else {
        cell += character;
      }
    }
    if (escaped) cell += "\\";
    cells.push(cell.trim());
    return cells;
  }
  var isSeparatorCell = (cell) => /^:?-{3,}:?$/.test(cell.trim());
  function parseMarkdownPipeTables(markdown) {
    const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
    const tables = [];
    for (let separatorIndex = 1; separatorIndex < lines.length; separatorIndex += 1) {
      const headerLine = lines[separatorIndex - 1];
      const separatorLine = lines[separatorIndex];
      if (!headerLine.includes("|") || !separatorLine.includes("|")) continue;
      const headers = splitPipeRow(headerLine);
      const separators = splitPipeRow(separatorLine);
      if (!headers.length || separators.length !== headers.length || !separators.every(isSeparatorCell)) continue;
      const rows = [];
      let rowIndex = separatorIndex + 1;
      while (rowIndex < lines.length && lines[rowIndex].trim() && lines[rowIndex].includes("|")) {
        const cells = splitPipeRow(lines[rowIndex]).slice(0, headers.length);
        while (cells.length < headers.length) cells.push("");
        rows.push(cells);
        rowIndex += 1;
      }
      tables.push({ headers, rows });
      separatorIndex = rowIndex - 1;
    }
    return tables;
  }
  var TABLE_TAGS = /* @__PURE__ */ new Set([
    "table",
    "caption",
    "colgroup",
    "col",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "th",
    "td",
    "br"
  ]);
  var DROP_TAGS = /* @__PURE__ */ new Set(["script", "style", "iframe", "object", "embed", "svg", "math"]);
  function copySafeAttributes(source, target) {
    for (const name of ["rowspan", "colspan", "span"]) {
      const value = Number.parseInt(source.getAttribute(name) || "", 10);
      if (Number.isInteger(value) && value > 0 && value <= 1e3) target.setAttribute(name, String(value));
    }
    const scope = source.getAttribute("scope");
    if (scope && ["row", "col", "rowgroup", "colgroup"].includes(scope)) target.setAttribute("scope", scope);
  }
  function appendSafeNode(source, target) {
    if (source.nodeType === 3) {
      target.appendChild(document.createTextNode(source.textContent || ""));
      return;
    }
    if (!(source instanceof Element)) return;
    const tag = source.localName.toLowerCase();
    if (DROP_TAGS.has(tag)) return;
    if (!TABLE_TAGS.has(tag)) {
      for (const child of source.childNodes) appendSafeNode(child, target);
      return;
    }
    const clean = document.createElement(tag);
    copySafeAttributes(source, clean);
    for (const child of source.childNodes) appendSafeNode(child, clean);
    target.appendChild(clean);
  }
  function rebuildHtmlTables(source) {
    const parsed = new DOMParser().parseFromString(source, "text/html");
    return [...parsed.querySelectorAll("table")].filter((table) => !table.parentElement?.closest("table")).map((table) => {
      const fragment = document.createDocumentFragment();
      appendSafeNode(table, fragment);
      return fragment.firstElementChild;
    }).filter(Boolean);
  }
  function decodeHtmlEntities(value) {
    return new DOMParser().parseFromString(value, "text/html").body.textContent || "";
  }
  function buildPipeTable({ headers, rows }) {
    const table = document.createElement("table");
    const head = document.createElement("thead");
    const headingRow = document.createElement("tr");
    for (const value of headers) {
      const cell = document.createElement("th");
      cell.textContent = decodeHtmlEntities(value);
      headingRow.append(cell);
    }
    head.append(headingRow);
    const body = document.createElement("tbody");
    for (const row of rows) {
      const tableRow = document.createElement("tr");
      for (const value of row) {
        const cell = document.createElement("td");
        cell.textContent = decodeHtmlEntities(value);
        tableRow.append(cell);
      }
      body.append(tableRow);
    }
    table.append(head, body);
    return table;
  }
  function renderTableSource(source, target, status) {
    target.replaceChildren();
    if (!source.trim()) {
      const empty = document.createElement("p");
      empty.className = "table-preview-empty";
      empty.textContent = "\u9884\u89C8\u4F1A\u663E\u793A\u5728\u8FD9\u91CC\u3002";
      target.append(empty);
      status.textContent = "";
      return;
    }
    const tables = [
      ...rebuildHtmlTables(source),
      ...parseMarkdownPipeTables(source).map(buildPipeTable)
    ];
    if (!tables.length) {
      const empty = document.createElement("p");
      empty.className = "table-preview-empty";
      empty.textContent = "\u672A\u68C0\u6D4B\u5230\u6709\u6548\u7684 Markdown \u6216 HTML \u8868\u683C\u3002";
      target.append(empty);
      status.textContent = "\u65E0\u6CD5\u6E32\u67D3";
      return;
    }
    target.append(...tables);
    status.textContent = `${tables.length} \u4E2A\u8868\u683C`;
  }
  async function copyMarkdown(value, status) {
    if (!value.trim()) {
      status.textContent = "\u6CA1\u6709\u53EF\u590D\u5236\u7684 Markdown\u3002";
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      status.textContent = "\u5DF2\u590D\u5236 Markdown\u3002";
      return;
    } catch {
      const input = document.createElement("textarea");
      input.value = value;
      input.style.position = "fixed";
      input.style.left = "-9999px";
      document.body.append(input);
      input.select();
      const copied = document.execCommand("copy");
      input.remove();
      status.textContent = copied ? "\u5DF2\u590D\u5236 Markdown\u3002" : "\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u590D\u5236\u3002";
    }
  }
  function initializeTableController({
    showWorkbenchPage
  }) {
    const recognizedSource = $("#table-markdown-output");
    const recognizedPreview = $("#table-preview");
    const recognizedStatus = $("#table-render-status");
    const continueButton = $("#continue-table-edit");
    const editorSource = $("#table-editor-markdown");
    const editorPreview = $("#table-editor-preview");
    const editorStatus = $("#table-editor-render-status");
    let syncing = false;
    const renderRecognized = () => {
      renderTableSource(recognizedSource.value, recognizedPreview, recognizedStatus);
      continueButton.disabled = !recognizedSource.value.trim();
    };
    const renderEditor = () => renderTableSource(editorSource.value, editorPreview, editorStatus);
    const setRecognizedMarkdown = (value) => {
      if (recognizedSource.value !== value) recognizedSource.value = value;
      renderRecognized();
      if (!syncing) {
        syncing = true;
        setEditorMarkdown(value);
        syncing = false;
      }
    };
    const setEditorMarkdown = (value) => {
      if (editorSource.value !== value) editorSource.value = value;
      renderEditor();
      if (!syncing) {
        syncing = true;
        setRecognizedMarkdown(value);
        syncing = false;
      }
    };
    recognizedSource.addEventListener("input", () => setRecognizedMarkdown(recognizedSource.value));
    editorSource.addEventListener("input", () => setEditorMarkdown(editorSource.value));
    $("#copy-table-markdown").addEventListener("click", () => copyMarkdown(recognizedSource.value, recognizedStatus));
    $("#copy-table-editor-markdown").addEventListener("click", () => copyMarkdown(editorSource.value, editorStatus));
    $("#clear-table-editor").addEventListener("click", () => {
      setEditorMarkdown("");
      editorSource.focus();
    });
    continueButton.addEventListener("click", () => {
      setEditorMarkdown(recognizedSource.value);
      showWorkbenchPage("table-editor");
      editorSource.focus();
    });
    renderRecognized();
    renderEditor();
    return {
      setTableResults(tables) {
        const markdown = tables.map((table) => table.markdown.trim()).filter(Boolean).join("\n\n");
        setRecognizedMarkdown(markdown);
      }
    };
  }

  // frontend/app/features/view-preferences.ts
  var EDITOR_FONT_SIZES = [14, 16, 18, 22];
  var PREVIEW_ZOOM_LEVELS = [50, 75, 100, 125, 150, 175, 200];
  function initializeViewPreferences() {
    let editorFontSize = 16;
    let previewZoom = 100;
    let editorFontSizeTouched = false;
    let previewZoomTouched = false;
    let saveQueue = Promise.resolve();
    function saveUserPreference(patch) {
      saveQueue = saveQueue.catch(() => void 0).then(async () => {
        const response = await fetch(endpoint("api/preferences"), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch)
        });
        if (!response.ok) throw new Error("\u65E0\u6CD5\u4FDD\u5B58\u663E\u793A\u504F\u597D\u3002");
      }).catch((error) => {
        console.warn("Unable to save user view preferences:", error);
      });
    }
    function applyEditorFontSize(value, persist = true) {
      editorFontSize = closestAllowedValue(value, EDITOR_FONT_SIZES, 16);
      document.documentElement.style.setProperty("--editor-font-size", `${editorFontSize}px`);
      document.querySelectorAll("[data-editor-font-size-control]").forEach((control) => {
        control.value = String(editorFontSize);
      });
      document.querySelectorAll("[data-editor-font-size-value]").forEach((output) => {
        output.value = String(editorFontSize);
        output.textContent = String(editorFontSize);
      });
      if (persist) {
        editorFontSizeTouched = true;
        saveUserPreference({ editor_font_size: editorFontSize });
      }
    }
    function stepEditorFontSize(direction) {
      const currentIndex = EDITOR_FONT_SIZES.indexOf(editorFontSize);
      const nextIndex = Math.max(0, Math.min(EDITOR_FONT_SIZES.length - 1, currentIndex + direction));
      applyEditorFontSize(EDITOR_FONT_SIZES[nextIndex]);
    }
    function applyPreviewZoom(value, persist = true) {
      previewZoom = closestAllowedValue(value, PREVIEW_ZOOM_LEVELS, 100);
      document.documentElement.style.setProperty("--preview-scale", String(previewZoom / 100));
      document.querySelectorAll("[data-preview-zoom-value]").forEach((output) => {
        output.value = `${previewZoom}%`;
        output.textContent = `${previewZoom}%`;
      });
      document.querySelectorAll('[data-preview-zoom-action="out"]').forEach((button) => {
        button.disabled = previewZoom === PREVIEW_ZOOM_LEVELS[0];
      });
      document.querySelectorAll('[data-preview-zoom-action="in"]').forEach((button) => {
        button.disabled = previewZoom === PREVIEW_ZOOM_LEVELS[PREVIEW_ZOOM_LEVELS.length - 1];
      });
      if (persist) {
        previewZoomTouched = true;
        saveUserPreference({ preview_zoom: previewZoom });
      }
    }
    function stepPreviewZoom(direction) {
      const currentIndex = PREVIEW_ZOOM_LEVELS.indexOf(previewZoom);
      const nextIndex = Math.max(0, Math.min(PREVIEW_ZOOM_LEVELS.length - 1, currentIndex + direction));
      applyPreviewZoom(PREVIEW_ZOOM_LEVELS[nextIndex]);
    }
    document.querySelectorAll("[data-editor-font-size-control]").forEach((control) => {
      control.addEventListener("change", () => applyEditorFontSize(control.value));
    });
    document.querySelectorAll("[data-editor-font-size-action]").forEach((button) => {
      button.addEventListener("click", () => stepEditorFontSize(button.dataset.editorFontSizeAction === "in" ? 1 : -1));
    });
    document.querySelectorAll("[data-preview-zoom-action]").forEach((button) => {
      button.addEventListener("click", () => stepPreviewZoom(button.dataset.previewZoomAction === "in" ? 1 : -1));
    });
    applyEditorFontSize(editorFontSize, false);
    applyPreviewZoom(previewZoom, false);
    fetch(endpoint("api/preferences"), { cache: "no-store" }).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "\u65E0\u6CD5\u8BFB\u53D6\u663E\u793A\u504F\u597D\u3002");
      if (!editorFontSizeTouched) {
        applyEditorFontSize(payload.preferences?.editor_font_size, false);
      }
      if (!previewZoomTouched) {
        applyPreviewZoom(payload.preferences?.preview_zoom, false);
      }
    }).catch((error) => {
      console.warn("Unable to load user view preferences:", error);
    });
  }

  // frontend/app/main.ts
  (() => {
    initializeViewPreferences();
    const editor = createFormulaEditorController();
    const createStatusSetter = (selector) => {
      const statusText = $(selector);
      return (message, error = false, phase = "") => {
        statusText.textContent = message;
        statusText.style.color = error ? "#c13333" : "";
        statusText.dataset.phase = phase;
      };
    };
    const setStatus = createStatusSetter("#job-status");
    const setTableStatus = createStatusSetter("#table-job-status");
    const table = initializeTableController({
      showWorkbenchPage: editor.showWorkbenchPage
    });
    const { copyLatex } = initializeCopyController({
      getLatexValue: editor.getLatexValue,
      getVisualLatexValue: editor.getVisualLatexValue,
      setStatus,
      setVisualStatus: editor.setVisualStatus
    });
    let jobController;
    const imageController = initializeImageController({
      isJobActive: () => jobController?.isActive() || false,
      onImageChanged: () => jobController?.refreshControls(),
      setStatus
    });
    jobController = initializeJobController({
      copyLatex,
      getImageFile: imageController.getFile,
      kind: "formula",
      renderLatex: editor.renderLatex,
      safelyFormatRecognizedLatex: editor.safelyFormatRecognizedLatex,
      setImageJobActive: imageController.setJobActive,
      setLatexValue: editor.setLatexValue,
      setStatus
    });
    let tableJobController;
    const tableImageController = initializeImageController({
      idPrefix: "table-",
      isJobActive: () => tableJobController?.isActive() || false,
      onImageChanged: () => tableJobController?.refreshControls(),
      setStatus: setTableStatus
    });
    tableJobController = initializeJobController({
      getImageFile: tableImageController.getFile,
      idPrefix: "table-",
      kind: "table",
      setImageJobActive: tableImageController.setJobActive,
      setStatus: setTableStatus,
      setTableResults: table.setTableResults
    });
    const toolbox = initializeFormulaToolboxController({
      getVisualLatexValue: editor.getVisualLatexValue,
      insertVisualLatex: editor.insertVisualLatex,
      setVisualLatexValue: editor.setVisualLatexValue,
      setVisualStatus: editor.setVisualStatus
    });
    editor.initializeEvents({
      closeFormulaFormatMenu: toolbox.closeFormulaFormatMenu
    });
    initializeHandwritingController({
      insertVisualLatex: editor.insertVisualLatex
    });
    initializeAdminController({ setStatus });
  })();
})();
