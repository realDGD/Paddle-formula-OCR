"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

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
        const range2 = document.createRange();
        range2.selectNodeContents(codeBlock);
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(range2);
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
    function formatBootstrap(progress2) {
      const lines = [
        `\u72B6\u6001\uFF1A${progress2.state || "\u672A\u77E5"}`,
        `\u9636\u6BB5\uFF1A${progress2.phase || "\u7B49\u5F85\u5F00\u59CB\u3002"}`
      ];
      if (progress2.profiles?.length) lines.push(`\u8BC6\u522B\u7EC4\u4EF6\uFF1A${progress2.profiles.join("\u3001")}`);
      if (progress2.logs?.length) lines.push("", "\u6700\u8FD1\u8F93\u51FA\uFF1A", ...progress2.logs.slice(-10));
      if (progress2.error) lines.push("", "\u9519\u8BEF\uFF1A", progress2.error);
      if (progress2.result) lines.push("", "\u7ED3\u679C\uFF1A", JSON.stringify(progress2.result, null, 2));
      return lines.join("\n");
    }
    async function pollBootstrap() {
      const response = await fetch(endpoint("api/admin/bootstrap/status"));
      const payload = await response.json();
      if (!response.ok) {
        $("#settings-message").textContent = payload.detail || "\u65E0\u6CD5\u8BFB\u53D6\u5B89\u88C5\u8FDB\u5EA6\u3002";
        return;
      }
      const progress2 = payload.bootstrap;
      $("#settings-message").textContent = formatBootstrap(progress2);
      if (progress2.state === "running") {
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
      const list2 = document.createElement("dl");
      for (const [label, value] of entries) {
        const term = document.createElement("dt");
        term.textContent = label;
        const detail = document.createElement("dd");
        detail.textContent = value;
        list2.append(term, detail);
      }
      container.replaceChildren(title, list2);
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
      const textarea2 = document.createElement("textarea");
      textarea2.value = text;
      textarea2.setAttribute("readonly", "");
      textarea2.style.position = "fixed";
      textarea2.style.left = "50%";
      textarea2.style.top = "50%";
      textarea2.style.width = "100px";
      textarea2.style.height = "40px";
      textarea2.style.opacity = "0.01";
      textarea2.style.zIndex = "99999";
      parent.appendChild(textarea2);
      textarea2.focus();
      textarea2.select();
      textarea2.setSelectionRange(0, textarea2.value.length);
      let successful = false;
      try {
        successful = document.execCommand("copy");
      } catch {
      }
      parent.removeChild(textarea2);
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
      const range2 = document.createRange();
      range2.selectNodeContents(container);
      const selection = window.getSelection();
      if (!selection) return false;
      selection.removeAllRanges();
      selection.addRange(range2);
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
      const list2 = document.createElement("div");
      list2.className = "candidate-list";
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
        list2.append(button);
        await renderSymbolGlyph(item, glyph);
        if (generation !== state.recognitionGeneration) return;
      }
      container.replaceChildren(note, list2);
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
      const image2 = sourceImage || preview;
      context.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
      context.drawImage(image2, 0, 0, cropCanvas.width, cropCanvas.height);
      if (!start || !end) return;
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const width = Math.abs(start.x - end.x);
      const height = Math.abs(start.y - end.y);
      context.fillStyle = "rgba(0, 0, 0, .45)";
      context.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
      context.drawImage(
        image2,
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
      const image2 = new Image();
      image2.src = URL.createObjectURL(cropFile);
      image2.onload = () => {
        state.cropImage = image2;
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

  // node_modules/tabulator-tables/dist/js/tabulator_esm.mjs
  var CoreFeature = class {
    constructor(table) {
      this.table = table;
    }
    //////////////////////////////////////////
    /////////////// DataLoad /////////////////
    //////////////////////////////////////////
    reloadData(data, silent, columnsChanged) {
      return this.table.dataLoader.load(data, void 0, void 0, void 0, silent, columnsChanged);
    }
    //////////////////////////////////////////
    ///////////// Localization ///////////////
    //////////////////////////////////////////
    langText() {
      return this.table.modules.localize.getText(...arguments);
    }
    langBind() {
      return this.table.modules.localize.bind(...arguments);
    }
    langLocale() {
      return this.table.modules.localize.getLocale(...arguments);
    }
    //////////////////////////////////////////
    ////////// Inter Table Comms /////////////
    //////////////////////////////////////////
    commsConnections() {
      return this.table.modules.comms.getConnections(...arguments);
    }
    commsSend() {
      return this.table.modules.comms.send(...arguments);
    }
    //////////////////////////////////////////
    //////////////// Layout  /////////////////
    //////////////////////////////////////////
    /** @returns {("fitData" | "fitDataFill" | "fitDataTable" | "fitDataStretch" | "fitColumns")} */
    layoutMode() {
      return this.table.modules.layout.getMode();
    }
    layoutRefresh(force) {
      return this.table.modules.layout.layout(force);
    }
    //////////////////////////////////////////
    /////////////// Event Bus ////////////////
    //////////////////////////////////////////
    subscribe() {
      return this.table.eventBus.subscribe(...arguments);
    }
    unsubscribe() {
      return this.table.eventBus.unsubscribe(...arguments);
    }
    subscribed(key) {
      return this.table.eventBus.subscribed(key);
    }
    subscriptionChange() {
      return this.table.eventBus.subscriptionChange(...arguments);
    }
    dispatch() {
      return this.table.eventBus.dispatch(...arguments);
    }
    chain() {
      return this.table.eventBus.chain(...arguments);
    }
    confirm() {
      return this.table.eventBus.confirm(...arguments);
    }
    dispatchExternal() {
      return this.table.externalEvents.dispatch(...arguments);
    }
    subscribedExternal(key) {
      return this.table.externalEvents.subscribed(key);
    }
    subscriptionChangeExternal() {
      return this.table.externalEvents.subscriptionChange(...arguments);
    }
    //////////////////////////////////////////
    //////////////// Options /////////////////
    //////////////////////////////////////////
    options(key) {
      return this.table.options[key];
    }
    setOption(key, value) {
      if (typeof value !== "undefined") {
        this.table.options[key] = value;
      }
      return this.table.options[key];
    }
    //////////////////////////////////////////
    /////////// Deprecation Checks ///////////
    //////////////////////////////////////////
    deprecationCheck(oldOption, newOption, convert) {
      return this.table.deprecationAdvisor.check(oldOption, newOption, convert);
    }
    deprecationCheckMsg(oldOption, msg) {
      return this.table.deprecationAdvisor.checkMsg(oldOption, msg);
    }
    deprecationMsg(msg) {
      return this.table.deprecationAdvisor.msg(msg);
    }
    //////////////////////////////////////////
    //////////////// Modules /////////////////
    //////////////////////////////////////////
    module(key) {
      return this.table.module(key);
    }
  };
  var Helpers = class {
    static elVisible(el) {
      return !(el.offsetWidth <= 0 && el.offsetHeight <= 0);
    }
    static elOffset(el) {
      var box = el.getBoundingClientRect();
      return {
        top: box.top + window.pageYOffset - document.documentElement.clientTop,
        left: box.left + window.pageXOffset - document.documentElement.clientLeft
      };
    }
    static retrieveNestedData(separator, field, data) {
      var structure = separator ? field.split(separator) : [field], length = structure.length, output;
      for (let i = 0; i < length; i++) {
        data = data[structure[i]];
        output = data;
        if (!data) {
          break;
        }
      }
      return output;
    }
    static deepClone(obj, clone, list2 = []) {
      var objectProto = {}.__proto__, arrayProto = [].__proto__;
      if (!clone) {
        clone = Object.assign(Array.isArray(obj) ? [] : {}, obj);
      }
      for (var i in obj) {
        let subject = obj[i], match, copy;
        if (subject != null && typeof subject === "object" && (subject.__proto__ === objectProto || subject.__proto__ === arrayProto)) {
          match = list2.findIndex((item) => {
            return item.subject === subject;
          });
          if (match > -1) {
            clone[i] = list2[match].copy;
          } else {
            copy = Object.assign(Array.isArray(subject) ? [] : {}, subject);
            list2.unshift({ subject, copy });
            clone[i] = this.deepClone(subject, copy, list2);
          }
        }
      }
      return clone;
    }
  };
  var Popup$1 = class Popup extends CoreFeature {
    constructor(table, element, parent) {
      super(table);
      this.element = element;
      this.container = this._lookupContainer();
      this.parent = parent;
      this.reversedX = false;
      this.childPopup = null;
      this.blurable = false;
      this.blurCallback = null;
      this.blurEventsBound = false;
      this.renderedCallback = null;
      this.visible = false;
      this.hideable = true;
      this.element.classList.add("tabulator-popup-container");
      this.blurEvent = this.hide.bind(this, false);
      this.escEvent = this._escapeCheck.bind(this);
      this.destroyBinding = this.tableDestroyed.bind(this);
      this.destroyed = false;
    }
    tableDestroyed() {
      this.destroyed = true;
      this.hide(true);
    }
    _lookupContainer() {
      var container = this.table.options.popupContainer;
      if (typeof container === "string") {
        container = document.querySelector(container);
        if (!container) {
          console.warn("Menu Error - no container element found matching selector:", this.table.options.popupContainer, "(defaulting to document body)");
        }
      } else if (container === true) {
        container = this.table.element;
      }
      if (container && !this._checkContainerIsParent(container)) {
        container = false;
        console.warn("Menu Error - container element does not contain this table:", this.table.options.popupContainer, "(defaulting to document body)");
      }
      if (!container) {
        container = document.body;
      }
      return container;
    }
    _checkContainerIsParent(container, element = this.table.element) {
      if (container === element) {
        return true;
      } else {
        return element.parentNode ? this._checkContainerIsParent(container, element.parentNode) : false;
      }
    }
    renderCallback(callback) {
      this.renderedCallback = callback;
    }
    containerEventCoords(e) {
      var touch = !(e instanceof MouseEvent);
      var x = touch ? e.touches[0].pageX : e.pageX;
      var y = touch ? e.touches[0].pageY : e.pageY;
      if (this.container !== document.body) {
        let parentOffset = Helpers.elOffset(this.container);
        x -= parentOffset.left;
        y -= parentOffset.top;
      }
      return { x, y };
    }
    elementPositionCoords(element, position = "right") {
      var offset = Helpers.elOffset(element), containerOffset, x, y;
      if (this.container !== document.body) {
        containerOffset = Helpers.elOffset(this.container);
        offset.left -= containerOffset.left;
        offset.top -= containerOffset.top;
      }
      switch (position) {
        case "right":
          x = offset.left + element.offsetWidth;
          y = offset.top - 1;
          break;
        case "bottom":
          x = offset.left;
          y = offset.top + element.offsetHeight;
          break;
        case "left":
          x = offset.left;
          y = offset.top - 1;
          break;
        case "top":
          x = offset.left;
          y = offset.top;
          break;
        case "center":
          x = offset.left + element.offsetWidth / 2;
          y = offset.top + element.offsetHeight / 2;
          break;
      }
      return { x, y, offset };
    }
    show(origin, position) {
      var x, y, parentEl, parentOffset, coords;
      if (this.destroyed || this.table.destroyed) {
        return this;
      }
      if (origin instanceof HTMLElement) {
        parentEl = origin;
        coords = this.elementPositionCoords(origin, position);
        parentOffset = coords.offset;
        x = coords.x;
        y = coords.y;
      } else if (typeof origin === "number") {
        parentOffset = { top: 0, left: 0 };
        x = origin;
        y = position;
      } else {
        coords = this.containerEventCoords(origin);
        x = coords.x;
        y = coords.y;
        this.reversedX = false;
      }
      this.element.style.top = y + "px";
      this.element.style.left = x + "px";
      this.container.appendChild(this.element);
      if (typeof this.renderedCallback === "function") {
        this.renderedCallback();
      }
      this._fitToScreen(x, y, parentEl, parentOffset, position);
      this.visible = true;
      this.subscribe("table-destroy", this.destroyBinding);
      this.element.addEventListener("mousedown", (e) => {
        e.stopPropagation();
      });
      return this;
    }
    _fitToScreen(x, y, parentEl, parentOffset, position) {
      var scrollTop = this.container === document.body ? document.documentElement.scrollTop : this.container.scrollTop;
      if (x + this.element.offsetWidth >= this.container.offsetWidth || this.reversedX) {
        this.element.style.left = "";
        if (parentEl) {
          this.element.style.right = this.container.offsetWidth - parentOffset.left + "px";
        } else {
          this.element.style.right = this.container.offsetWidth - x + "px";
        }
        this.reversedX = true;
      }
      let offsetHeight = Math.max(this.container.offsetHeight, scrollTop ? this.container.scrollHeight : 0);
      if (y + this.element.offsetHeight > offsetHeight) {
        if (parentEl) {
          switch (position) {
            case "bottom":
              this.element.style.top = parseInt(this.element.style.top) - this.element.offsetHeight - parentEl.offsetHeight - 1 + "px";
              break;
            default:
              this.element.style.top = parseInt(this.element.style.top) - this.element.offsetHeight + parentEl.offsetHeight + 1 + "px";
          }
        } else {
          let menuHeight = this.element.offsetHeight;
          if (menuHeight > offsetHeight) {
            this.element.style.top = "0px";
            this.element.style.height = offsetHeight + "px";
          } else {
            let newTop = y - menuHeight;
            if (newTop < 0) {
              newTop = offsetHeight - menuHeight;
            }
            this.element.style.top = newTop + "px";
          }
        }
      }
    }
    isVisible() {
      return this.visible;
    }
    hideOnBlur(callback) {
      this.blurable = true;
      if (this.visible) {
        setTimeout(() => {
          if (this.visible) {
            this.table.rowManager.element.addEventListener("scroll", this.blurEvent);
            this.subscribe("cell-editing", this.blurEvent);
            document.body.addEventListener("click", this.blurEvent);
            document.body.addEventListener("contextmenu", this.blurEvent);
            document.body.addEventListener("mousedown", this.blurEvent);
            window.addEventListener("resize", this.blurEvent);
            document.body.addEventListener("keydown", this.escEvent);
            this.blurEventsBound = true;
          }
        }, 100);
        this.blurCallback = callback;
      }
      return this;
    }
    /** @param {KeyboardEvent} e */
    _escapeCheck(e) {
      if (e.key == 27) {
        this.hide();
      }
    }
    blockHide() {
      this.hideable = false;
    }
    restoreHide() {
      this.hideable = true;
    }
    hide(silent = false) {
      if (this.visible && this.hideable) {
        if (this.blurable && this.blurEventsBound) {
          document.body.removeEventListener("keydown", this.escEvent);
          document.body.removeEventListener("click", this.blurEvent);
          document.body.removeEventListener("contextmenu", this.blurEvent);
          document.body.removeEventListener("mousedown", this.blurEvent);
          window.removeEventListener("resize", this.blurEvent);
          this.table.rowManager.element.removeEventListener("scroll", this.blurEvent);
          this.unsubscribe("cell-editing", this.blurEvent);
          this.blurEventsBound = false;
        }
        if (this.childPopup) {
          this.childPopup.hide();
        }
        if (this.parent) {
          this.parent.childPopup = null;
        }
        if (this.element.parentNode) {
          this.element.parentNode.removeChild(this.element);
        }
        this.visible = false;
        if (this.blurCallback && !silent) {
          this.blurCallback();
        }
        this.unsubscribe("table-destroy", this.destroyBinding);
      }
      return this;
    }
    child(element) {
      if (this.childPopup) {
        this.childPopup.hide();
      }
      this.childPopup = new Popup(this.table, element, this);
      return this.childPopup;
    }
  };
  var Module = class extends CoreFeature {
    constructor(table, name) {
      super(table);
      this._handler = null;
    }
    initialize() {
    }
    ///////////////////////////////////
    ////// Options Registration ///////
    ///////////////////////////////////
    registerTableOption(key, value) {
      this.table.optionsList.register(key, value);
    }
    registerColumnOption(key, value) {
      this.table.columnManager.optionsList.register(key, value);
    }
    ///////////////////////////////////
    /// Public Function Registration ///
    ///////////////////////////////////
    registerTableFunction(name, func) {
      if (typeof this.table[name] === "undefined") {
        this.table[name] = (...args) => {
          this.table.initGuard(name);
          return func(...args);
        };
      } else {
        console.warn("Unable to bind table function, name already in use", name);
      }
    }
    registerComponentFunction(component, func, handler) {
      return this.table.componentFunctionBinder.bind(component, func, handler);
    }
    ///////////////////////////////////
    ////////// Data Pipeline //////////
    ///////////////////////////////////
    registerDataHandler(handler, priority) {
      this.table.rowManager.registerDataPipelineHandler(handler, priority);
      this._handler = handler;
    }
    registerDisplayHandler(handler, priority) {
      this.table.rowManager.registerDisplayPipelineHandler(handler, priority);
      this._handler = handler;
    }
    displayRows(adjust) {
      var index = this.table.rowManager.displayRows.length - 1, lookupIndex;
      if (this._handler) {
        lookupIndex = this.table.rowManager.displayPipeline.findIndex((item) => {
          return item.handler === this._handler;
        });
        if (lookupIndex > -1) {
          index = lookupIndex;
        }
      }
      if (adjust) {
        index = index + adjust;
      }
      if (this._handler) {
        if (index > -1) {
          return this.table.rowManager.getDisplayRows(index);
        } else {
          return this.activeRows();
        }
      }
    }
    activeRows() {
      return this.table.rowManager.activeRows;
    }
    refreshData(renderInPosition, handler) {
      if (!handler) {
        handler = this._handler;
      }
      if (handler) {
        this.table.rowManager.refreshActiveData(handler, false, renderInPosition);
      }
    }
    ///////////////////////////////////
    //////// Footer Management ////////
    ///////////////////////////////////
    footerAppend(element) {
      return this.table.footerManager.append(element);
    }
    footerPrepend(element) {
      return this.table.footerManager.prepend(element);
    }
    footerRemove(element) {
      return this.table.footerManager.remove(element);
    }
    ///////////////////////////////////
    //////// Popups Management ////////
    ///////////////////////////////////
    popup(menuEl, menuContainer) {
      return new Popup$1(this.table, menuEl, menuContainer);
    }
    ///////////////////////////////////
    //////// Alert Management ////////
    ///////////////////////////////////
    alert(content, type) {
      return this.table.alertManager.alert(content, type);
    }
    clearAlert() {
      return this.table.alertManager.clear();
    }
  };
  function generateParamsList$1(data, prefix) {
    var output = [];
    prefix = prefix || "";
    if (Array.isArray(data)) {
      data.forEach((item, i) => {
        output = output.concat(generateParamsList$1(item, prefix ? prefix + "[" + i + "]" : i));
      });
    } else if (typeof data === "object") {
      for (var key in data) {
        output = output.concat(generateParamsList$1(data[key], prefix ? prefix + "[" + key + "]" : key));
      }
    } else {
      output.push({ key: prefix, value: data });
    }
    return output;
  }
  function serializeParams(params) {
    var output = generateParamsList$1(params), encoded = [];
    output.forEach(function(item) {
      encoded.push(encodeURIComponent(item.key) + "=" + encodeURIComponent(item.value));
    });
    return encoded.join("&");
  }
  function urlBuilder(url, config, params) {
    if (url) {
      if (params && Object.keys(params).length) {
        if (!config.method || config.method.toLowerCase() == "get") {
          config.method = "get";
          url += (url.includes("?") ? "&" : "?") + serializeParams(params);
        }
      }
    }
    return url;
  }
  var defaultPasteActions = {
    replace: function(data) {
      return this.table.setData(data);
    },
    update: function(data) {
      return this.table.updateOrAddData(data);
    },
    insert: function(data) {
      return this.table.addData(data);
    }
  };
  var defaultPasteParsers = {
    table: function(clipboard) {
      var data = [], headerFindSuccess = true, columns = this.table.columnManager.columns, columnMap = [], rows = [];
      clipboard = clipboard.split("\n");
      clipboard.forEach(function(row) {
        data.push(row.split("	"));
      });
      if (data.length && !(data.length === 1 && data[0].length < 2)) {
        data[0].forEach(function(value) {
          var column = columns.find(function(column2) {
            return value && column2.definition.title && value.trim() && column2.definition.title.trim() === value.trim();
          });
          if (column) {
            columnMap.push(column);
          } else {
            headerFindSuccess = false;
          }
        });
        if (!headerFindSuccess) {
          headerFindSuccess = true;
          columnMap = [];
          data[0].forEach(function(value) {
            var column = columns.find(function(column2) {
              return value && column2.field && value.trim() && column2.field.trim() === value.trim();
            });
            if (column) {
              columnMap.push(column);
            } else {
              headerFindSuccess = false;
            }
          });
          if (!headerFindSuccess) {
            columnMap = this.table.columnManager.columnsByIndex;
          }
        }
        if (headerFindSuccess) {
          data.shift();
        }
        data.forEach(function(item) {
          var row = {};
          item.forEach(function(value, i) {
            if (columnMap[i]) {
              row[columnMap[i].field] = value;
            }
          });
          rows.push(row);
        });
        return rows;
      } else {
        return false;
      }
    }
  };
  var bindings$2 = {
    copyToClipboard: ["ctrl + 67", "meta + 67"]
  };
  var actions$2 = {
    copyToClipboard: function(e) {
      if (!this.table.modules.edit.currentCell) {
        if (this.table.modExists("clipboard", true)) {
          this.table.modules.clipboard.copy(false, true);
        }
      }
    }
  };
  var extensions$4 = {
    keybindings: {
      bindings: bindings$2,
      actions: actions$2
    }
  };
  var _Clipboard = class _Clipboard extends Module {
    constructor(table) {
      super(table);
      this.mode = true;
      this.pasteParser = function() {
      };
      this.pasteAction = function() {
      };
      this.customSelection = false;
      this.rowRange = false;
      this.blocked = true;
      this.registerTableOption("clipboard", false);
      this.registerTableOption("clipboardCopyStyled", true);
      this.registerTableOption("clipboardCopyConfig", false);
      this.registerTableOption("clipboardCopyFormatter", false);
      this.registerTableOption("clipboardCopyRowRange", "active");
      this.registerTableOption("clipboardPasteParser", "table");
      this.registerTableOption("clipboardPasteAction", "insert");
      this.registerColumnOption("clipboard");
      this.registerColumnOption("titleClipboard");
    }
    initialize() {
      this.mode = this.table.options.clipboard;
      this.rowRange = this.table.options.clipboardCopyRowRange;
      if (this.mode === true || this.mode === "copy") {
        this.table.element.addEventListener("copy", (e) => {
          var plain, html2, list2;
          if (!this.blocked) {
            e.preventDefault();
            if (this.customSelection) {
              plain = this.customSelection;
              if (this.table.options.clipboardCopyFormatter) {
                plain = this.table.options.clipboardCopyFormatter("plain", plain);
              }
            } else {
              list2 = this.table.modules.export.generateExportList(this.table.options.clipboardCopyConfig, this.table.options.clipboardCopyStyled, this.rowRange, "clipboard");
              html2 = this.table.modules.export.generateHTMLTable(list2);
              plain = html2 ? this.generatePlainContent(list2) : "";
              if (this.table.options.clipboardCopyFormatter) {
                plain = this.table.options.clipboardCopyFormatter("plain", plain);
                html2 = this.table.options.clipboardCopyFormatter("html", html2);
              }
            }
            if (window.clipboardData && window.clipboardData.setData) {
              window.clipboardData.setData("Text", plain);
            } else if (e.clipboardData && e.clipboardData.setData) {
              e.clipboardData.setData("text/plain", plain);
              if (html2) {
                e.clipboardData.setData("text/html", html2);
              }
            } else if (e.originalEvent && e.originalEvent.clipboardData.setData) {
              e.originalEvent.clipboardData.setData("text/plain", plain);
              if (html2) {
                e.originalEvent.clipboardData.setData("text/html", html2);
              }
            }
            this.dispatchExternal("clipboardCopied", plain, html2);
            this.reset();
          }
        });
      }
      if (this.mode === true || this.mode === "paste") {
        this.table.element.addEventListener("paste", (e) => {
          this.paste(e);
        });
      }
      this.setPasteParser(this.table.options.clipboardPasteParser);
      this.setPasteAction(this.table.options.clipboardPasteAction);
      this.registerTableFunction("copyToClipboard", this.copy.bind(this));
    }
    reset() {
      this.blocked = true;
      this.customSelection = false;
    }
    generatePlainContent(list2) {
      var output = [];
      list2.forEach((row) => {
        var rowData = [];
        row.columns.forEach((col) => {
          var value = "";
          if (col) {
            if (row.type === "group") {
              col.value = col.component.getKey();
            }
            if (col.value === null) {
              value = "";
            } else {
              switch (typeof col.value) {
                case "object":
                  value = JSON.stringify(col.value);
                  break;
                case "undefined":
                  value = "";
                  break;
                default:
                  value = col.value;
              }
            }
          }
          rowData.push(value);
        });
        output.push(rowData.join("	"));
      });
      return output.join("\n");
    }
    copy(range2, internal) {
      var sel, textRange;
      this.blocked = false;
      this.customSelection = false;
      if (this.mode === true || this.mode === "copy") {
        this.rowRange = range2 || this.table.options.clipboardCopyRowRange;
        if (typeof window.getSelection != "undefined" && typeof document.createRange != "undefined") {
          range2 = document.createRange();
          range2.selectNodeContents(this.table.element);
          sel = window.getSelection();
          if (sel.toString() && internal) {
            this.customSelection = sel.toString();
          }
          sel.removeAllRanges();
          sel.addRange(range2);
        } else if (typeof document.selection != "undefined" && typeof document.body.createTextRange != "undefined") {
          textRange = document.body.createTextRange();
          textRange.moveToElementText(this.table.element);
          textRange.select();
        }
        document.execCommand("copy");
        if (sel) {
          sel.removeAllRanges();
        }
      }
    }
    //PASTE EVENT HANDLING
    setPasteAction(action) {
      switch (typeof action) {
        case "string":
          this.pasteAction = _Clipboard.pasteActions[action];
          if (!this.pasteAction) {
            console.warn("Clipboard Error - No such paste action found:", action);
          }
          break;
        case "function":
          this.pasteAction = action;
          break;
      }
    }
    setPasteParser(parser) {
      switch (typeof parser) {
        case "string":
          this.pasteParser = _Clipboard.pasteParsers[parser];
          if (!this.pasteParser) {
            console.warn("Clipboard Error - No such paste parser found:", parser);
          }
          break;
        case "function":
          this.pasteParser = parser;
          break;
      }
    }
    paste(e) {
      var data, rowData, rows;
      if (this.checkPasteOrigin(e)) {
        data = this.getPasteData(e);
        rowData = this.pasteParser.call(this, data);
        if (rowData) {
          e.preventDefault();
          if (this.table.modExists("mutator")) {
            rowData = this.mutateData(rowData);
          }
          rows = this.pasteAction.call(this, rowData);
          this.dispatchExternal("clipboardPasted", data, rowData, rows);
        } else {
          this.dispatchExternal("clipboardPasteError", data);
        }
      }
    }
    mutateData(data) {
      var output = [];
      if (Array.isArray(data)) {
        data.forEach((row) => {
          output.push(this.table.modules.mutator.transformRow(row, "clipboard"));
        });
      } else {
        output = data;
      }
      return output;
    }
    checkPasteOrigin(e) {
      var valid = true;
      var blocked = this.confirm("clipboard-paste", [e]);
      if (blocked || !["DIV", "SPAN"].includes(e.target.tagName)) {
        valid = false;
      }
      return valid;
    }
    getPasteData(e) {
      var data;
      if (window.clipboardData && window.clipboardData.getData) {
        data = window.clipboardData.getData("Text");
      } else if (e.clipboardData && e.clipboardData.getData) {
        data = e.clipboardData.getData("text/plain");
      } else if (e.originalEvent && e.originalEvent.clipboardData.getData) {
        data = e.originalEvent.clipboardData.getData("text/plain");
      }
      return data;
    }
  };
  __publicField(_Clipboard, "moduleName", "clipboard");
  __publicField(_Clipboard, "moduleExtensions", extensions$4);
  //load defaults
  __publicField(_Clipboard, "pasteActions", defaultPasteActions);
  __publicField(_Clipboard, "pasteParsers", defaultPasteParsers);
  var Clipboard = _Clipboard;
  var CellComponent = class {
    constructor(cell) {
      this._cell = cell;
      return new Proxy(this, {
        get: function(target, name, receiver) {
          if (typeof target[name] !== "undefined") {
            return target[name];
          } else {
            return target._cell.table.componentFunctionBinder.handle("cell", target._cell, name);
          }
        }
      });
    }
    getValue() {
      return this._cell.getValue();
    }
    getOldValue() {
      return this._cell.getOldValue();
    }
    getInitialValue() {
      return this._cell.initialValue;
    }
    getElement() {
      return this._cell.getElement();
    }
    getRow() {
      return this._cell.row.getComponent();
    }
    getData(transform) {
      return this._cell.row.getData(transform);
    }
    getType() {
      return "cell";
    }
    getField() {
      return this._cell.column.getField();
    }
    getColumn() {
      return this._cell.column.getComponent();
    }
    setValue(value, mutate) {
      if (typeof mutate == "undefined") {
        mutate = true;
      }
      this._cell.setValue(value, mutate);
    }
    restoreOldValue() {
      this._cell.setValueActual(this._cell.getOldValue());
    }
    restoreInitialValue() {
      this._cell.setValueActual(this._cell.initialValue);
    }
    checkHeight() {
      this._cell.checkHeight();
    }
    getTable() {
      return this._cell.table;
    }
    _getSelf() {
      return this._cell;
    }
  };
  var Cell = class extends CoreFeature {
    constructor(column, row) {
      super(column.table);
      this.table = column.table;
      this.column = column;
      this.row = row;
      this.element = null;
      this.value = null;
      this.initialValue;
      this.oldValue = null;
      this.modules = {};
      this.height = null;
      this.width = null;
      this.minWidth = null;
      this.component = null;
      this.loaded = false;
      this.build();
    }
    //////////////// Setup Functions /////////////////
    //generate element
    build() {
      this.generateElement();
      this.setWidth();
      this._configureCell();
      this.setValueActual(this.column.getFieldValue(this.row.data));
      this.initialValue = this.value;
    }
    generateElement() {
      this.element = document.createElement("div");
      this.element.className = "tabulator-cell";
      this.element.setAttribute("role", "gridcell");
      if (this.column.isRowHeader) {
        this.element.classList.add("tabulator-row-header");
      }
    }
    _configureCell() {
      var element = this.element, field = this.column.getField(), vertAligns = {
        top: "flex-start",
        bottom: "flex-end",
        middle: "center"
      }, hozAligns = {
        left: "flex-start",
        right: "flex-end",
        center: "center"
      };
      element.style.textAlign = this.column.hozAlign;
      if (this.column.vertAlign) {
        element.style.display = "inline-flex";
        element.style.alignItems = vertAligns[this.column.vertAlign] || "";
        if (this.column.hozAlign) {
          element.style.justifyContent = hozAligns[this.column.hozAlign] || "";
        }
      }
      if (field) {
        element.setAttribute("tabulator-field", field);
      }
      if (this.column.definition.cssClass) {
        var classNames = this.column.definition.cssClass.split(" ");
        classNames.forEach((className) => {
          element.classList.add(className);
        });
      }
      this.dispatch("cell-init", this);
      if (!this.column.visible) {
        this.hide();
      }
    }
    //generate cell contents
    _generateContents() {
      var val;
      val = this.chain("cell-format", this, null, () => {
        return this.element.innerHTML = this.value;
      });
      switch (typeof val) {
        case "object":
          if (val instanceof Node) {
            while (this.element.firstChild) this.element.removeChild(this.element.firstChild);
            this.element.appendChild(val);
          } else {
            this.element.innerHTML = "";
            if (val != null) {
              console.warn("Format Error - Formatter has returned a type of object, the only valid formatter object return is an instance of Node, the formatter returned:", val);
            }
          }
          break;
        case "undefined":
          this.element.innerHTML = "";
          break;
        default:
          this.element.innerHTML = val;
      }
    }
    cellRendered() {
      this.dispatch("cell-rendered", this);
    }
    //////////////////// Getters ////////////////////
    getElement(containerOnly) {
      if (!this.loaded) {
        this.loaded = true;
        if (!containerOnly) {
          this.layoutElement();
        }
      }
      return this.element;
    }
    getValue() {
      return this.value;
    }
    getOldValue() {
      return this.oldValue;
    }
    //////////////////// Actions ////////////////////
    setValue(value, mutate, force) {
      var changed = this.setValueProcessData(value, mutate, force);
      if (changed) {
        this.dispatch("cell-value-updated", this);
        this.cellRendered();
        if (this.column.definition.cellEdited) {
          this.column.definition.cellEdited.call(this.table, this.getComponent());
        }
        this.dispatchExternal("cellEdited", this.getComponent());
        if (this.subscribedExternal("dataChanged")) {
          this.dispatchExternal("dataChanged", this.table.rowManager.getData());
        }
      }
    }
    setValueProcessData(value, mutate, force) {
      var changed = false;
      if (this.value !== value || force) {
        changed = true;
        if (mutate) {
          value = this.chain("cell-value-changing", [this, value], null, value);
        }
      }
      this.setValueActual(value);
      if (changed) {
        this.dispatch("cell-value-changed", this);
      }
      return changed;
    }
    setValueActual(value) {
      this.oldValue = this.value;
      this.value = value;
      this.dispatch("cell-value-save-before", this);
      this.column.setFieldValue(this.row.data, value);
      this.dispatch("cell-value-save-after", this);
      if (this.loaded) {
        this.layoutElement();
      }
    }
    layoutElement() {
      this._generateContents();
      this.dispatch("cell-layout", this);
    }
    setWidth() {
      this.width = this.column.width;
      this.element.style.width = this.column.widthStyled;
    }
    clearWidth() {
      this.width = "";
      this.element.style.width = "";
    }
    getWidth() {
      return this.width || this.element.offsetWidth;
    }
    setMinWidth() {
      this.minWidth = this.column.minWidth;
      this.element.style.minWidth = this.column.minWidthStyled;
    }
    setMaxWidth() {
      this.maxWidth = this.column.maxWidth;
      this.element.style.maxWidth = this.column.maxWidthStyled;
    }
    checkHeight() {
      this.row.reinitializeHeight();
    }
    clearHeight() {
      this.element.style.height = "";
      this.height = null;
      this.dispatch("cell-height", this, "");
    }
    setHeight() {
      this.height = this.row.height;
      this.element.style.height = this.row.heightStyled;
      this.dispatch("cell-height", this, this.row.heightStyled);
    }
    getHeight() {
      return this.height || this.element.offsetHeight;
    }
    show() {
      this.element.style.display = this.column.vertAlign ? "inline-flex" : "";
    }
    hide() {
      this.element.style.display = "none";
    }
    delete() {
      this.dispatch("cell-delete", this);
      if (!this.table.rowManager.redrawBlock && this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
      this.element = false;
      this.column.deleteCell(this);
      this.row.deleteCell(this);
      this.calcs = {};
    }
    getIndex() {
      return this.row.getCellIndex(this);
    }
    //////////////// Object Generation /////////////////
    getComponent() {
      if (!this.component) {
        this.component = new CellComponent(this);
      }
      return this.component;
    }
  };
  var ColumnComponent = class {
    constructor(column) {
      this._column = column;
      this.type = "ColumnComponent";
      return new Proxy(this, {
        get: function(target, name, receiver) {
          if (typeof target[name] !== "undefined") {
            return target[name];
          } else {
            return target._column.table.componentFunctionBinder.handle("column", target._column, name);
          }
        }
      });
    }
    getElement() {
      return this._column.getElement();
    }
    getDefinition() {
      return this._column.getDefinition();
    }
    getField() {
      return this._column.getField();
    }
    getTitleDownload() {
      return this._column.getTitleDownload();
    }
    getCells() {
      var cells = [];
      this._column.cells.forEach(function(cell) {
        cells.push(cell.getComponent());
      });
      return cells;
    }
    isVisible() {
      return this._column.visible;
    }
    show() {
      if (this._column.isGroup) {
        this._column.columns.forEach(function(column) {
          column.show();
        });
      } else {
        this._column.show();
      }
    }
    hide() {
      if (this._column.isGroup) {
        this._column.columns.forEach(function(column) {
          column.hide();
        });
      } else {
        this._column.hide();
      }
    }
    toggle() {
      if (this._column.visible) {
        this.hide();
      } else {
        this.show();
      }
    }
    delete() {
      return this._column.delete();
    }
    getSubColumns() {
      var output = [];
      if (this._column.columns.length) {
        this._column.columns.forEach(function(column) {
          output.push(column.getComponent());
        });
      }
      return output;
    }
    getParentColumn() {
      return this._column.getParentComponent();
    }
    _getSelf() {
      return this._column;
    }
    scrollTo(position, ifVisible) {
      return this._column.table.columnManager.scrollToColumn(this._column, position, ifVisible);
    }
    getTable() {
      return this._column.table;
    }
    move(to, after) {
      var toColumn = this._column.table.columnManager.findColumn(to);
      if (toColumn) {
        this._column.table.columnManager.moveColumn(this._column, toColumn, after);
      } else {
        console.warn("Move Error - No matching column found:", toColumn);
      }
    }
    getNextColumn() {
      var nextCol = this._column.nextColumn();
      return nextCol ? nextCol.getComponent() : false;
    }
    getPrevColumn() {
      var prevCol = this._column.prevColumn();
      return prevCol ? prevCol.getComponent() : false;
    }
    updateDefinition(updates) {
      return this._column.updateDefinition(updates);
    }
    getWidth() {
      return this._column.getWidth();
    }
    setWidth(width) {
      var result;
      if (width === true) {
        result = this._column.reinitializeWidth(true);
      } else {
        result = this._column.setWidth(width);
      }
      this._column.table.columnManager.rerenderColumns(true);
      return result;
    }
  };
  var defaultColumnOptions = {
    "title": void 0,
    "field": void 0,
    "columns": void 0,
    "visible": void 0,
    "hozAlign": void 0,
    "vertAlign": void 0,
    "width": void 0,
    "minWidth": 40,
    "maxWidth": void 0,
    "maxInitialWidth": void 0,
    "cssClass": void 0,
    "variableHeight": void 0,
    "headerVertical": void 0,
    "headerHozAlign": void 0,
    "headerWordWrap": false,
    "editableTitle": void 0
  };
  var _Column = class _Column extends CoreFeature {
    constructor(def, parent, rowHeader) {
      super(parent.table);
      this.definition = def;
      this.parent = parent;
      this.type = "column";
      this.columns = [];
      this.cells = [];
      this.isGroup = false;
      this.isRowHeader = rowHeader;
      this.element = this.createElement();
      this.contentElement = false;
      this.titleHolderElement = false;
      this.titleElement = false;
      this.groupElement = this.createGroupElement();
      this.hozAlign = "";
      this.vertAlign = "";
      this.field = "";
      this.fieldStructure = "";
      this.getFieldValue = "";
      this.setFieldValue = "";
      this.titleDownload = null;
      this.titleFormatterRendered = false;
      this.mapDefinitions();
      this.setField(this.definition.field);
      this.modules = {};
      this.width = null;
      this.widthStyled = "";
      this.maxWidth = null;
      this.maxWidthStyled = "";
      this.maxInitialWidth = null;
      this.minWidth = null;
      this.minWidthStyled = "";
      this.widthFixed = false;
      this.visible = true;
      this.component = null;
      if (this.definition.columns) {
        this.isGroup = true;
        this.definition.columns.forEach((def2, i) => {
          var newCol = new _Column(def2, this);
          this.attachColumn(newCol);
        });
        this.checkColumnVisibility();
      } else {
        parent.registerColumnField(this);
      }
      this._initialize();
    }
    createElement() {
      var el = document.createElement("div");
      el.classList.add("tabulator-col");
      el.setAttribute("role", "columnheader");
      el.setAttribute("aria-sort", "none");
      if (this.isRowHeader) {
        el.classList.add("tabulator-row-header");
      }
      switch (this.table.options.columnHeaderVertAlign) {
        case "middle":
          el.style.justifyContent = "center";
          break;
        case "bottom":
          el.style.justifyContent = "flex-end";
          break;
      }
      return el;
    }
    createGroupElement() {
      var el = document.createElement("div");
      el.classList.add("tabulator-col-group-cols");
      return el;
    }
    mapDefinitions() {
      var defaults = this.table.options.columnDefaults;
      if (defaults) {
        for (let key in defaults) {
          if (typeof this.definition[key] === "undefined") {
            this.definition[key] = defaults[key];
          }
        }
      }
      this.definition = this.table.columnManager.optionsList.generate(_Column.defaultOptionList, this.definition);
    }
    checkDefinition() {
      Object.keys(this.definition).forEach((key) => {
        if (_Column.defaultOptionList.indexOf(key) === -1) {
          console.warn("Invalid column definition option in '" + (this.field || this.definition.title) + "' column:", key);
        }
      });
    }
    setField(field) {
      this.field = field;
      this.fieldStructure = field ? this.table.options.nestedFieldSeparator ? field.split(this.table.options.nestedFieldSeparator) : [field] : [];
      this.getFieldValue = this.fieldStructure.length > 1 ? this._getNestedData : this._getFlatData;
      this.setFieldValue = this.fieldStructure.length > 1 ? this._setNestedData : this._setFlatData;
    }
    //register column position with column manager
    registerColumnPosition(column) {
      this.parent.registerColumnPosition(column);
    }
    //register column position with column manager
    registerColumnField(column) {
      this.parent.registerColumnField(column);
    }
    //trigger position registration
    reRegisterPosition() {
      if (this.isGroup) {
        this.columns.forEach(function(column) {
          column.reRegisterPosition();
        });
      } else {
        this.registerColumnPosition(this);
      }
    }
    //build header element
    _initialize() {
      var def = this.definition;
      while (this.element.firstChild) this.element.removeChild(this.element.firstChild);
      if (def.headerVertical) {
        this.element.classList.add("tabulator-col-vertical");
        if (def.headerVertical === "flip") {
          this.element.classList.add("tabulator-col-vertical-flip");
        }
      }
      this.contentElement = this._buildColumnHeaderContent();
      this.element.appendChild(this.contentElement);
      if (this.isGroup) {
        this._buildGroupHeader();
      } else {
        this._buildColumnHeader();
      }
      this.dispatch("column-init", this);
    }
    //build header element for header
    _buildColumnHeader() {
      var def = this.definition;
      this.dispatch("column-layout", this);
      if (typeof def.visible != "undefined") {
        if (def.visible) {
          this.show(true);
        } else {
          this.hide(true);
        }
      }
      if (def.cssClass) {
        var classNames = def.cssClass.split(" ");
        classNames.forEach((className) => {
          this.element.classList.add(className);
        });
      }
      if (def.field) {
        this.element.setAttribute("tabulator-field", def.field);
      }
      this.setMinWidth(parseInt(def.minWidth));
      if (def.maxInitialWidth) {
        this.maxInitialWidth = parseInt(def.maxInitialWidth);
      }
      if (def.maxWidth) {
        this.setMaxWidth(parseInt(def.maxWidth));
      }
      this.reinitializeWidth();
      this.hozAlign = this.definition.hozAlign;
      this.vertAlign = this.definition.vertAlign;
      this.titleElement.style.textAlign = this.definition.headerHozAlign;
    }
    _buildColumnHeaderContent() {
      var contentElement = document.createElement("div");
      contentElement.classList.add("tabulator-col-content");
      this.titleHolderElement = document.createElement("div");
      this.titleHolderElement.classList.add("tabulator-col-title-holder");
      contentElement.appendChild(this.titleHolderElement);
      this.titleElement = this._buildColumnHeaderTitle();
      this.titleHolderElement.appendChild(this.titleElement);
      return contentElement;
    }
    //build title element of column
    _buildColumnHeaderTitle() {
      var def = this.definition;
      var titleHolderElement = document.createElement("div");
      titleHolderElement.classList.add("tabulator-col-title");
      if (def.headerWordWrap) {
        titleHolderElement.classList.add("tabulator-col-title-wrap");
      }
      if (def.editableTitle) {
        var titleElement = document.createElement("input");
        titleElement.classList.add("tabulator-title-editor");
        titleElement.addEventListener("click", (e) => {
          e.stopPropagation();
          titleElement.focus();
        });
        titleElement.addEventListener("mousedown", (e) => {
          e.stopPropagation();
        });
        titleElement.addEventListener("change", () => {
          def.title = titleElement.value;
          this.dispatchExternal("columnTitleChanged", this.getComponent());
        });
        titleHolderElement.appendChild(titleElement);
        if (def.field) {
          this.langBind("columns|" + def.field, (text) => {
            titleElement.value = text || (def.title || "&nbsp;");
          });
        } else {
          titleElement.value = def.title || "&nbsp;";
        }
      } else {
        if (def.field) {
          this.langBind("columns|" + def.field, (text) => {
            this._formatColumnHeaderTitle(titleHolderElement, text || (def.title || "&nbsp;"));
          });
        } else {
          this._formatColumnHeaderTitle(titleHolderElement, def.title || "&nbsp;");
        }
      }
      return titleHolderElement;
    }
    _formatColumnHeaderTitle(el, title) {
      var contents = this.chain("column-format", [this, title, el], null, () => {
        return title;
      });
      switch (typeof contents) {
        case "object":
          if (contents instanceof Node) {
            el.appendChild(contents);
          } else {
            el.innerHTML = "";
            console.warn("Format Error - Title formatter has returned a type of object, the only valid formatter object return is an instance of Node, the formatter returned:", contents);
          }
          break;
        case "undefined":
          el.innerHTML = "";
          break;
        default:
          el.innerHTML = contents;
      }
    }
    //build header element for column group
    _buildGroupHeader() {
      this.element.classList.add("tabulator-col-group");
      this.element.setAttribute("role", "columngroup");
      this.element.setAttribute("aria-title", this.definition.title);
      if (this.definition.cssClass) {
        var classNames = this.definition.cssClass.split(" ");
        classNames.forEach((className) => {
          this.element.classList.add(className);
        });
      }
      this.titleElement.style.textAlign = this.definition.headerHozAlign;
      this.element.appendChild(this.groupElement);
    }
    //flat field lookup
    _getFlatData(data) {
      return data[this.field];
    }
    //nested field lookup
    _getNestedData(data) {
      var dataObj = data, structure = this.fieldStructure, length = structure.length, output;
      for (let i = 0; i < length; i++) {
        dataObj = dataObj[structure[i]];
        output = dataObj;
        if (!dataObj) {
          break;
        }
      }
      return output;
    }
    //flat field set
    _setFlatData(data, value) {
      if (this.field) {
        data[this.field] = value;
      }
    }
    //nested field set
    _setNestedData(data, value) {
      var dataObj = data, structure = this.fieldStructure, length = structure.length;
      for (let i = 0; i < length; i++) {
        if (i == length - 1) {
          dataObj[structure[i]] = value;
        } else {
          if (!dataObj[structure[i]]) {
            if (typeof value !== "undefined") {
              dataObj[structure[i]] = {};
            } else {
              break;
            }
          }
          dataObj = dataObj[structure[i]];
        }
      }
    }
    //attach column to this group
    attachColumn(column) {
      if (this.groupElement) {
        this.columns.push(column);
        this.groupElement.appendChild(column.getElement());
        column.columnRendered();
      } else {
        console.warn("Column Warning - Column being attached to another column instead of column group");
      }
    }
    //vertically align header in column
    verticalAlign(alignment, height) {
      var parentHeight = this.parent.isGroup ? this.parent.getGroupElement().clientHeight : height || this.parent.getHeadersElement().clientHeight;
      this.element.style.height = parentHeight + "px";
      this.dispatch("column-height", this, this.element.style.height);
      if (this.isGroup) {
        this.groupElement.style.minHeight = parentHeight - this.contentElement.offsetHeight + "px";
      }
      this.columns.forEach(function(column) {
        column.verticalAlign(alignment);
      });
    }
    //clear vertical alignment
    clearVerticalAlign() {
      this.element.style.paddingTop = "";
      this.element.style.height = "";
      this.element.style.minHeight = "";
      this.groupElement.style.minHeight = "";
      this.columns.forEach(function(column) {
        column.clearVerticalAlign();
      });
      this.dispatch("column-height", this, "");
    }
    //// Retrieve Column Information ////
    //return column header element
    getElement() {
      return this.element;
    }
    //return column group element
    getGroupElement() {
      return this.groupElement;
    }
    //return field name
    getField() {
      return this.field;
    }
    getTitleDownload() {
      return this.titleDownload;
    }
    //return the first column in a group
    getFirstColumn() {
      if (!this.isGroup) {
        return this;
      } else {
        if (this.columns.length) {
          return this.columns[0].getFirstColumn();
        } else {
          return false;
        }
      }
    }
    //return the last column in a group
    getLastColumn() {
      if (!this.isGroup) {
        return this;
      } else {
        if (this.columns.length) {
          return this.columns[this.columns.length - 1].getLastColumn();
        } else {
          return false;
        }
      }
    }
    //return all columns in a group
    getColumns(traverse) {
      var columns = [];
      if (traverse) {
        this.columns.forEach((column) => {
          columns.push(column);
          columns = columns.concat(column.getColumns(true));
        });
      } else {
        columns = this.columns;
      }
      return columns;
    }
    //return all columns in a group
    getCells() {
      return this.cells;
    }
    //retrieve the top column in a group of columns
    getTopColumn() {
      if (this.parent.isGroup) {
        return this.parent.getTopColumn();
      } else {
        return this;
      }
    }
    //return column definition object
    getDefinition(updateBranches) {
      var colDefs = [];
      if (this.isGroup && updateBranches) {
        this.columns.forEach(function(column) {
          colDefs.push(column.getDefinition(true));
        });
        this.definition.columns = colDefs;
      }
      return this.definition;
    }
    //////////////////// Actions ////////////////////
    checkColumnVisibility() {
      var visible = false;
      this.columns.forEach(function(column) {
        if (column.visible) {
          visible = true;
        }
      });
      if (visible) {
        this.show();
        this.dispatchExternal("columnVisibilityChanged", this.getComponent(), false);
      } else {
        this.hide();
      }
    }
    //show column
    show(silent, responsiveToggle) {
      if (!this.visible) {
        this.visible = true;
        this.element.style.display = "";
        if (this.parent.isGroup) {
          this.parent.checkColumnVisibility();
        }
        this.cells.forEach(function(cell) {
          cell.show();
        });
        if (!this.isGroup && this.width === null) {
          this.reinitializeWidth();
        }
        this.table.columnManager.verticalAlignHeaders();
        this.dispatch("column-show", this, responsiveToggle);
        if (!silent) {
          this.dispatchExternal("columnVisibilityChanged", this.getComponent(), true);
        }
        if (this.parent.isGroup) {
          this.parent.matchChildWidths();
        }
        if (!this.silent) {
          this.table.columnManager.rerenderColumns();
        }
      }
    }
    //hide column
    hide(silent, responsiveToggle) {
      if (this.visible) {
        this.visible = false;
        this.element.style.display = "none";
        this.table.columnManager.verticalAlignHeaders();
        if (this.parent.isGroup) {
          this.parent.checkColumnVisibility();
        }
        this.cells.forEach(function(cell) {
          cell.hide();
        });
        this.dispatch("column-hide", this, responsiveToggle);
        if (!silent) {
          this.dispatchExternal("columnVisibilityChanged", this.getComponent(), false);
        }
        if (this.parent.isGroup) {
          this.parent.matchChildWidths();
        }
        if (!this.silent) {
          this.table.columnManager.rerenderColumns();
        }
      }
    }
    matchChildWidths() {
      var childWidth = 0;
      if (this.contentElement && this.columns.length) {
        this.columns.forEach(function(column) {
          if (column.visible) {
            childWidth += column.getWidth();
          }
        });
        this.contentElement.style.maxWidth = childWidth - 1 + "px";
        if (this.table.initialized) {
          this.element.style.width = childWidth + "px";
        }
        if (this.parent.isGroup) {
          this.parent.matchChildWidths();
        }
      }
    }
    removeChild(child) {
      var index = this.columns.indexOf(child);
      if (index > -1) {
        this.columns.splice(index, 1);
      }
      if (!this.columns.length) {
        this.delete();
      }
    }
    setWidth(width) {
      this.widthFixed = true;
      this.setWidthActual(width);
    }
    setWidthActual(width) {
      if (isNaN(width)) {
        width = Math.floor(this.table.element.clientWidth / 100 * parseInt(width));
      }
      width = Math.max(this.minWidth, width);
      if (this.maxWidth) {
        width = Math.min(this.maxWidth, width);
      }
      this.width = width;
      this.widthStyled = width ? width + "px" : "";
      this.element.style.width = this.widthStyled;
      if (!this.isGroup) {
        this.cells.forEach(function(cell) {
          cell.setWidth();
        });
      }
      if (this.parent.isGroup) {
        this.parent.matchChildWidths();
      }
      this.dispatch("column-width", this);
      if (this.subscribedExternal("columnWidth")) {
        this.dispatchExternal("columnWidth", this.getComponent());
      }
    }
    checkCellHeights() {
      var rows = [];
      this.cells.forEach(function(cell) {
        if (cell.row.heightInitialized) {
          if (cell.row.getElement().offsetParent !== null) {
            rows.push(cell.row);
            cell.row.clearCellHeight();
          } else {
            cell.row.heightInitialized = false;
          }
        }
      });
      rows.forEach(function(row) {
        row.calcHeight();
      });
      rows.forEach(function(row) {
        row.setCellHeight();
      });
    }
    getWidth() {
      var width = 0;
      if (this.isGroup) {
        this.columns.forEach(function(column) {
          if (column.visible) {
            width += column.getWidth();
          }
        });
      } else {
        width = this.width;
      }
      return width;
    }
    getLeftOffset() {
      var offset = this.element.offsetLeft;
      if (this.parent.isGroup) {
        offset += this.parent.getLeftOffset();
      }
      return offset;
    }
    getHeight() {
      return Math.ceil(this.element.getBoundingClientRect().height);
    }
    setMinWidth(minWidth) {
      if (this.maxWidth && minWidth > this.maxWidth) {
        minWidth = this.maxWidth;
        console.warn("the minWidth (" + minWidth + "px) for column '" + this.field + "' cannot be bigger that its maxWidth (" + this.maxWidthStyled + ")");
      }
      this.minWidth = minWidth;
      this.minWidthStyled = minWidth ? minWidth + "px" : "";
      this.element.style.minWidth = this.minWidthStyled;
      this.cells.forEach(function(cell) {
        cell.setMinWidth();
      });
    }
    setMaxWidth(maxWidth) {
      if (this.minWidth && maxWidth < this.minWidth) {
        maxWidth = this.minWidth;
        console.warn("the maxWidth (" + maxWidth + "px) for column '" + this.field + "' cannot be smaller that its minWidth (" + this.minWidthStyled + ")");
      }
      this.maxWidth = maxWidth;
      this.maxWidthStyled = maxWidth ? maxWidth + "px" : "";
      this.element.style.maxWidth = this.maxWidthStyled;
      this.cells.forEach(function(cell) {
        cell.setMaxWidth();
      });
    }
    delete() {
      return new Promise((resolve, reject) => {
        if (this.isGroup) {
          this.columns.forEach(function(column) {
            column.delete();
          });
        }
        this.dispatch("column-delete", this);
        var cellCount = this.cells.length;
        for (let i = 0; i < cellCount; i++) {
          this.cells[0].delete();
        }
        if (this.element.parentNode) {
          this.element.parentNode.removeChild(this.element);
        }
        this.element = false;
        this.contentElement = false;
        this.titleElement = false;
        this.groupElement = false;
        if (this.parent.isGroup) {
          this.parent.removeChild(this);
        }
        this.table.columnManager.deregisterColumn(this);
        this.table.columnManager.rerenderColumns(true);
        this.dispatch("column-deleted", this);
        resolve();
      });
    }
    columnRendered() {
      if (this.titleFormatterRendered) {
        this.titleFormatterRendered();
      }
      this.dispatch("column-rendered", this);
    }
    //////////////// Cell Management /////////////////
    //generate cell for this column
    generateCell(row) {
      var cell = new Cell(this, row);
      this.cells.push(cell);
      return cell;
    }
    nextColumn() {
      var index = this.table.columnManager.findColumnIndex(this);
      return index > -1 ? this._nextVisibleColumn(index + 1) : false;
    }
    _nextVisibleColumn(index) {
      var column = this.table.columnManager.getColumnByIndex(index);
      return !column || column.visible ? column : this._nextVisibleColumn(index + 1);
    }
    prevColumn() {
      var index = this.table.columnManager.findColumnIndex(this);
      return index > -1 ? this._prevVisibleColumn(index - 1) : false;
    }
    _prevVisibleColumn(index) {
      var column = this.table.columnManager.getColumnByIndex(index);
      return !column || column.visible ? column : this._prevVisibleColumn(index - 1);
    }
    reinitializeWidth(force) {
      this.widthFixed = false;
      if (typeof this.definition.width !== "undefined" && !force) {
        this.setWidth(this.definition.width);
      }
      this.dispatch("column-width-fit-before", this);
      this.fitToData(force);
      this.dispatch("column-width-fit-after", this);
    }
    //set column width to maximum cell width for non group columns
    fitToData(force) {
      if (this.isGroup) {
        return;
      }
      if (!this.widthFixed) {
        this.element.style.width = "";
        this.cells.forEach((cell) => {
          cell.clearWidth();
        });
      }
      var maxWidth = this.element.offsetWidth;
      if (!this.width || !this.widthFixed) {
        this.cells.forEach((cell) => {
          var width = cell.getWidth();
          if (width > maxWidth) {
            maxWidth = width;
          }
        });
        if (maxWidth) {
          var setTo = maxWidth + 1;
          if (force) {
            this.setWidth(setTo);
          } else {
            if (this.maxInitialWidth && !force) {
              setTo = Math.min(setTo, this.maxInitialWidth);
            }
            this.setWidthActual(setTo);
          }
        }
      }
    }
    updateDefinition(updates) {
      var definition;
      if (!this.isGroup) {
        if (!this.parent.isGroup) {
          definition = Object.assign({}, this.getDefinition());
          definition = Object.assign(definition, updates);
          return this.table.columnManager.addColumn(definition, false, this).then((column) => {
            if (definition.field == this.field) {
              this.field = false;
            }
            return this.delete().then(() => {
              return column.getComponent();
            });
          });
        } else {
          console.error("Column Update Error - The updateDefinition function is only available on ungrouped columns");
          return Promise.reject("Column Update Error - The updateDefinition function is only available on columns, not column groups");
        }
      } else {
        console.error("Column Update Error - The updateDefinition function is only available on ungrouped columns");
        return Promise.reject("Column Update Error - The updateDefinition function is only available on columns, not column groups");
      }
    }
    deleteCell(cell) {
      var index = this.cells.indexOf(cell);
      if (index > -1) {
        this.cells.splice(index, 1);
      }
    }
    //////////////// Object Generation /////////////////
    getComponent() {
      if (!this.component) {
        this.component = new ColumnComponent(this);
      }
      return this.component;
    }
    getPosition() {
      return this.table.columnManager.getVisibleColumnsByIndex().indexOf(this) + 1;
    }
    getParentComponent() {
      return this.parent instanceof _Column ? this.parent.getComponent() : false;
    }
  };
  __publicField(_Column, "defaultOptionList", defaultColumnOptions);
  var Column = _Column;
  var RowComponent = class {
    constructor(row) {
      this._row = row;
      return new Proxy(this, {
        get: function(target, name, receiver) {
          if (typeof target[name] !== "undefined") {
            return target[name];
          } else {
            return target._row.table.componentFunctionBinder.handle("row", target._row, name);
          }
        }
      });
    }
    getData(transform) {
      return this._row.getData(transform);
    }
    getElement() {
      return this._row.getElement();
    }
    getCells() {
      var cells = [];
      this._row.getCells().forEach(function(cell) {
        cells.push(cell.getComponent());
      });
      return cells;
    }
    getCell(column) {
      var cell = this._row.getCell(column);
      return cell ? cell.getComponent() : false;
    }
    getIndex() {
      return this._row.getData("data")[this._row.table.options.index];
    }
    getPosition() {
      return this._row.getPosition();
    }
    watchPosition(callback) {
      return this._row.watchPosition(callback);
    }
    delete() {
      return this._row.delete();
    }
    scrollTo(position, ifVisible) {
      return this._row.table.rowManager.scrollToRow(this._row, position, ifVisible);
    }
    move(to, after) {
      this._row.moveToRow(to, after);
    }
    update(data) {
      return this._row.updateData(data);
    }
    normalizeHeight() {
      this._row.normalizeHeight(true);
    }
    _getSelf() {
      return this._row;
    }
    reformat() {
      return this._row.reinitialize();
    }
    getTable() {
      return this._row.table;
    }
    getNextRow() {
      var row = this._row.nextRow();
      return row ? row.getComponent() : row;
    }
    getPrevRow() {
      var row = this._row.prevRow();
      return row ? row.getComponent() : row;
    }
  };
  var Row = class extends CoreFeature {
    constructor(data, parent, type = "row") {
      super(parent.table);
      this.parent = parent;
      this.data = {};
      this.type = type;
      this.element = false;
      this.modules = {};
      this.cells = [];
      this.height = 0;
      this.heightStyled = "";
      this.manualHeight = false;
      this.outerHeight = 0;
      this.initialized = false;
      this.heightInitialized = false;
      this.position = 0;
      this.positionWatchers = [];
      this.component = null;
      this.created = false;
      this.setData(data);
    }
    create() {
      if (!this.created) {
        this.created = true;
        this.generateElement();
      }
    }
    createElement() {
      var el = document.createElement("div");
      el.classList.add("tabulator-row");
      el.setAttribute("role", "row");
      this.element = el;
    }
    getElement() {
      this.create();
      return this.element;
    }
    detachElement() {
      if (this.element && this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
    }
    generateElement() {
      this.createElement();
      this.dispatch("row-init", this);
    }
    generateCells() {
      this.cells = this.table.columnManager.generateCells(this);
    }
    //functions to setup on first render
    initialize(force, inFragment) {
      this.create();
      if (!this.initialized || force) {
        this.deleteCells();
        while (this.element.firstChild) this.element.removeChild(this.element.firstChild);
        this.dispatch("row-layout-before", this);
        this.generateCells();
        this.initialized = true;
        this.table.columnManager.renderer.renderRowCells(this, inFragment);
        if (force) {
          this.normalizeHeight();
        }
        this.dispatch("row-layout", this);
        if (this.table.options.rowFormatter) {
          this.table.options.rowFormatter(this.getComponent());
        }
        this.dispatch("row-layout-after", this);
      } else {
        this.table.columnManager.renderer.rerenderRowCells(this, inFragment);
      }
    }
    rendered() {
      this.cells.forEach((cell) => {
        cell.cellRendered();
      });
    }
    reinitializeHeight() {
      this.heightInitialized = false;
      if (this.element && this.element.offsetParent !== null) {
        this.normalizeHeight(true);
      }
    }
    deinitialize() {
      this.initialized = false;
    }
    deinitializeHeight() {
      this.heightInitialized = false;
    }
    reinitialize(children) {
      this.initialized = false;
      this.heightInitialized = false;
      if (!this.manualHeight) {
        this.height = 0;
        this.heightStyled = "";
      }
      if (this.element && this.element.offsetParent !== null) {
        this.initialize(true);
      }
      this.dispatch("row-relayout", this);
    }
    //get heights when doing bulk row style calcs in virtual DOM
    calcHeight(force) {
      var maxHeight = 0, minHeight = 0;
      if (this.table.options.rowHeight) {
        this.height = this.table.options.rowHeight;
      } else {
        minHeight = this.calcMinHeight();
        maxHeight = this.calcMaxHeight();
        if (force) {
          this.height = Math.max(maxHeight, minHeight);
        } else {
          this.height = this.manualHeight ? this.height : Math.max(maxHeight, minHeight);
        }
      }
      this.heightStyled = this.height ? this.height + "px" : "";
      this.outerHeight = this.element.offsetHeight;
    }
    calcMinHeight() {
      return this.table.options.resizableRows ? this.element.clientHeight : 0;
    }
    calcMaxHeight() {
      var maxHeight = 0;
      this.cells.forEach(function(cell) {
        var height = cell.getHeight();
        if (height > maxHeight) {
          maxHeight = height;
        }
      });
      return maxHeight;
    }
    //set of cells
    setCellHeight() {
      this.cells.forEach(function(cell) {
        cell.setHeight();
      });
      this.heightInitialized = true;
    }
    clearCellHeight() {
      this.cells.forEach(function(cell) {
        cell.clearHeight();
      });
    }
    //normalize the height of elements in the row
    normalizeHeight(force) {
      if (force && !this.table.options.rowHeight) {
        this.clearCellHeight();
      }
      this.calcHeight(force);
      this.setCellHeight();
    }
    //set height of rows
    setHeight(height, force) {
      if (this.height != height || force) {
        this.manualHeight = true;
        this.height = height;
        this.heightStyled = height ? height + "px" : "";
        this.setCellHeight();
        this.outerHeight = this.element.offsetHeight;
        if (this.subscribedExternal("rowHeight")) {
          this.dispatchExternal("rowHeight", this.getComponent());
        }
      }
    }
    //return rows outer height
    getHeight() {
      return this.outerHeight;
    }
    //return rows outer Width
    getWidth() {
      return this.element.offsetWidth;
    }
    //////////////// Cell Management /////////////////
    deleteCell(cell) {
      var index = this.cells.indexOf(cell);
      if (index > -1) {
        this.cells.splice(index, 1);
      }
    }
    //////////////// Data Management /////////////////
    setData(data) {
      this.data = this.chain("row-data-init-before", [this, data], void 0, data);
      this.dispatch("row-data-init-after", this);
    }
    //update the rows data
    updateData(updatedData) {
      var visible = this.element && Helpers.elVisible(this.element), tempData = {}, newRowData;
      return new Promise((resolve, reject) => {
        if (typeof updatedData === "string") {
          updatedData = JSON.parse(updatedData);
        }
        this.dispatch("row-data-save-before", this);
        if (this.subscribed("row-data-changing")) {
          tempData = Object.assign(tempData, this.data);
          tempData = Object.assign(tempData, updatedData);
        }
        newRowData = this.chain("row-data-changing", [this, tempData, updatedData], null, updatedData);
        const cellsToUpdate = [];
        for (let attrname in updatedData) {
          let columns = this.table.columnManager.getColumnsByFieldRoot(attrname);
          columns.forEach((column) => {
            let cell = this.getCell(column.getField());
            if (cell) {
              let value = column.getFieldValue(newRowData);
              if (cell.getValue() !== value) {
                cellsToUpdate.push([cell, value]);
              }
            }
          });
        }
        for (let attrname in newRowData) {
          this.data[attrname] = newRowData[attrname];
        }
        this.dispatch("row-data-save-after", this);
        cellsToUpdate.forEach(([cell, value]) => {
          cell.setValueProcessData(value);
          if (visible) {
            cell.cellRendered();
          }
        });
        if (visible) {
          this.normalizeHeight(true);
          if (this.table.options.rowFormatter) {
            this.table.options.rowFormatter(this.getComponent());
          }
        } else {
          this.initialized = false;
          this.height = 0;
          this.heightStyled = "";
        }
        this.dispatch("row-data-changed", this, visible, updatedData);
        this.dispatchExternal("rowUpdated", this.getComponent());
        if (this.subscribedExternal("dataChanged")) {
          this.dispatchExternal("dataChanged", this.table.rowManager.getData());
        }
        resolve();
      });
    }
    getData(transform) {
      if (transform) {
        return this.chain("row-data-retrieve", [this, transform], null, this.data);
      }
      return this.data;
    }
    getCell(column) {
      var match = false;
      column = this.table.columnManager.findColumn(column);
      if (!this.initialized && this.cells.length === 0) {
        this.generateCells();
      }
      match = this.cells.find(function(cell) {
        return cell.column === column;
      });
      return match;
    }
    getCellIndex(findCell) {
      return this.cells.findIndex(function(cell) {
        return cell === findCell;
      });
    }
    findCell(subject) {
      return this.cells.find((cell) => {
        return cell.element === subject;
      });
    }
    getCells() {
      if (!this.initialized && this.cells.length === 0) {
        this.generateCells();
      }
      return this.cells;
    }
    nextRow() {
      var row = this.table.rowManager.nextDisplayRow(this, true);
      return row || false;
    }
    prevRow() {
      var row = this.table.rowManager.prevDisplayRow(this, true);
      return row || false;
    }
    moveToRow(to, before) {
      var toRow = this.table.rowManager.findRow(to);
      if (toRow) {
        this.table.rowManager.moveRowActual(this, toRow, !before);
        this.table.rowManager.refreshActiveData("display", false, true);
      } else {
        console.warn("Move Error - No matching row found:", to);
      }
    }
    ///////////////////// Actions  /////////////////////
    delete() {
      this.dispatch("row-delete", this);
      this.deleteActual();
      return Promise.resolve();
    }
    deleteActual(blockRedraw) {
      this.detachModules();
      this.table.rowManager.deleteRow(this, blockRedraw);
      this.deleteCells();
      this.initialized = false;
      this.heightInitialized = false;
      this.element = false;
      this.dispatch("row-deleted", this);
    }
    detachModules() {
      this.dispatch("row-deleting", this);
    }
    deleteCells() {
      var cellCount = this.cells.length;
      for (let i = 0; i < cellCount; i++) {
        this.cells[0].delete();
      }
    }
    wipe() {
      this.detachModules();
      this.deleteCells();
      if (this.element) {
        while (this.element.firstChild) this.element.removeChild(this.element.firstChild);
        if (this.element.parentNode) {
          this.element.parentNode.removeChild(this.element);
        }
      }
      this.element = false;
      this.modules = {};
    }
    isDisplayed() {
      return this.table.rowManager.getDisplayRows().includes(this);
    }
    getPosition() {
      return this.isDisplayed() ? this.position : false;
    }
    setPosition(position) {
      if (position != this.position) {
        this.position = position;
        this.positionWatchers.forEach((callback) => {
          callback(this.position);
        });
      }
    }
    watchPosition(callback) {
      this.positionWatchers.push(callback);
      callback(this.position);
    }
    getGroup() {
      return this.modules.group || false;
    }
    //////////////// Object Generation /////////////////
    getComponent() {
      if (!this.component) {
        this.component = new RowComponent(this);
      }
      return this.component;
    }
  };
  function maskInput(el, options) {
    var mask = options.mask, maskLetter = typeof options.maskLetterChar !== "undefined" ? options.maskLetterChar : "A", maskNumber = typeof options.maskNumberChar !== "undefined" ? options.maskNumberChar : "9", maskWildcard = typeof options.maskWildcardChar !== "undefined" ? options.maskWildcardChar : "*";
    function fillSymbols(index) {
      var symbol = mask[index];
      if (typeof symbol !== "undefined" && symbol !== maskWildcard && symbol !== maskLetter && symbol !== maskNumber) {
        el.value = el.value + "" + symbol;
        fillSymbols(index + 1);
      }
    }
    el.addEventListener("keydown", (e) => {
      var index = el.value.length, char = e.key;
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        if (index >= mask.length) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        } else {
          switch (mask[index]) {
            case maskLetter:
              if (char.toUpperCase() == char.toLowerCase()) {
                e.preventDefault();
                e.stopPropagation();
                return false;
              }
              break;
            case maskNumber:
              if (isNaN(char)) {
                e.preventDefault();
                e.stopPropagation();
                return false;
              }
              break;
            case maskWildcard:
              break;
            default:
              if (char !== mask[index]) {
                e.preventDefault();
                e.stopPropagation();
                return false;
              }
          }
        }
      }
      return;
    });
    el.addEventListener("keyup", (e) => {
      if (e.key.length === 1) {
        if (options.maskAutoFill) {
          fillSymbols(el.value.length);
        }
      }
    });
    if (!el.placeholder) {
      el.placeholder = mask;
    }
    if (options.maskAutoFill) {
      fillSymbols(el.value.length);
    }
  }
  function input(cell, onRendered, success, cancel, editorParams) {
    var cellValue = cell.getValue(), input2 = document.createElement("input");
    input2.setAttribute("type", editorParams.search ? "search" : "text");
    input2.style.padding = "4px";
    input2.style.width = "100%";
    input2.style.boxSizing = "border-box";
    if (editorParams.elementAttributes && typeof editorParams.elementAttributes == "object") {
      for (let key in editorParams.elementAttributes) {
        if (key.charAt(0) == "+") {
          key = key.slice(1);
          input2.setAttribute(key, input2.getAttribute(key) + editorParams.elementAttributes["+" + key]);
        } else {
          input2.setAttribute(key, editorParams.elementAttributes[key]);
        }
      }
    }
    input2.value = typeof cellValue !== "undefined" ? cellValue : "";
    onRendered(function() {
      if (cell.getType() === "cell") {
        input2.focus({ preventScroll: true });
        input2.style.height = "100%";
        if (editorParams.selectContents) {
          input2.select();
        }
      }
    });
    function onChange(e) {
      if ((cellValue === null || typeof cellValue === "undefined") && input2.value !== "" || input2.value !== cellValue) {
        if (success(input2.value)) {
          cellValue = input2.value;
        }
      } else {
        cancel();
      }
    }
    input2.addEventListener("change", onChange);
    input2.addEventListener("blur", onChange);
    input2.addEventListener("keydown", function(e) {
      switch (e.key) {
        // case "Tab":
        case "Enter":
          onChange();
          break;
        case "Escape":
          cancel();
          break;
        case "End":
        case "Home":
          e.stopPropagation();
          break;
      }
    });
    if (editorParams.mask) {
      maskInput(input2, editorParams);
    }
    return input2;
  }
  function textarea$1(cell, onRendered, success, cancel, editorParams) {
    var cellValue = cell.getValue(), vertNav = editorParams.verticalNavigation || "hybrid", value = String(cellValue !== null && typeof cellValue !== "undefined" ? cellValue : ""), input2 = document.createElement("textarea"), scrollHeight = 0;
    input2.style.display = "block";
    input2.style.padding = "2px";
    input2.style.height = "100%";
    input2.style.width = "100%";
    input2.style.boxSizing = "border-box";
    input2.style.whiteSpace = "pre-wrap";
    input2.style.resize = "none";
    if (editorParams.elementAttributes && typeof editorParams.elementAttributes == "object") {
      for (let key in editorParams.elementAttributes) {
        if (key.charAt(0) == "+") {
          key = key.slice(1);
          input2.setAttribute(key, input2.getAttribute(key) + editorParams.elementAttributes["+" + key]);
        } else {
          input2.setAttribute(key, editorParams.elementAttributes[key]);
        }
      }
    }
    input2.value = value;
    onRendered(function() {
      if (cell.getType() === "cell") {
        input2.focus({ preventScroll: true });
        input2.style.height = "100%";
        input2.scrollHeight;
        input2.style.height = input2.scrollHeight + "px";
        cell.getRow().normalizeHeight();
        if (editorParams.selectContents) {
          input2.select();
        }
      }
    });
    function onChange(e) {
      if ((cellValue === null || typeof cellValue === "undefined") && input2.value !== "" || input2.value !== cellValue) {
        if (success(input2.value)) {
          cellValue = input2.value;
        }
        setTimeout(function() {
          cell.getRow().normalizeHeight();
        }, 300);
      } else {
        cancel();
      }
    }
    input2.addEventListener("change", onChange);
    input2.addEventListener("blur", onChange);
    input2.addEventListener("keyup", function() {
      input2.style.height = "";
      var heightNow = input2.scrollHeight;
      input2.style.height = heightNow + "px";
      if (heightNow != scrollHeight) {
        scrollHeight = heightNow;
        cell.getRow().normalizeHeight();
      }
    });
    input2.addEventListener("keydown", function(e) {
      switch (e.key) {
        case "Enter":
          if (e.shiftKey && editorParams.shiftEnterSubmit) {
            onChange();
          }
          break;
        case "Escape":
          cancel();
          break;
        case "ArrowUp":
          if (vertNav == "editor" || vertNav == "hybrid" && input2.selectionStart) {
            e.stopImmediatePropagation();
            e.stopPropagation();
          }
          break;
        case "ArrowDown":
          if (vertNav == "editor" || vertNav == "hybrid" && input2.selectionStart !== input2.value.length) {
            e.stopImmediatePropagation();
            e.stopPropagation();
          }
          break;
        case "End":
        case "Home":
          e.stopPropagation();
          break;
      }
    });
    if (editorParams.mask) {
      maskInput(input2, editorParams);
    }
    return input2;
  }
  function number$1(cell, onRendered, success, cancel, editorParams) {
    var cellValue = cell.getValue(), vertNav = editorParams.verticalNavigation || "editor", input2 = document.createElement("input");
    input2.setAttribute("type", "number");
    if (typeof editorParams.max != "undefined") {
      input2.setAttribute("max", editorParams.max);
    }
    if (typeof editorParams.min != "undefined") {
      input2.setAttribute("min", editorParams.min);
    }
    if (typeof editorParams.step != "undefined") {
      input2.setAttribute("step", editorParams.step);
    }
    input2.style.padding = "4px";
    input2.style.width = "100%";
    input2.style.boxSizing = "border-box";
    if (editorParams.elementAttributes && typeof editorParams.elementAttributes == "object") {
      for (let key in editorParams.elementAttributes) {
        if (key.charAt(0) == "+") {
          key = key.slice(1);
          input2.setAttribute(key, input2.getAttribute(key) + editorParams.elementAttributes["+" + key]);
        } else {
          input2.setAttribute(key, editorParams.elementAttributes[key]);
        }
      }
    }
    input2.value = cellValue;
    var blurFunc = function(e) {
      onChange();
    };
    onRendered(function() {
      if (cell.getType() === "cell") {
        input2.removeEventListener("blur", blurFunc);
        input2.focus({ preventScroll: true });
        input2.style.height = "100%";
        input2.addEventListener("blur", blurFunc);
        if (editorParams.selectContents) {
          input2.select();
        }
      }
    });
    function onChange() {
      var value = input2.value;
      if (!isNaN(value) && value !== "") {
        value = Number(value);
      }
      if (value !== cellValue) {
        if (success(value)) {
          cellValue = value;
        }
      } else {
        cancel();
      }
    }
    input2.addEventListener("keydown", function(e) {
      switch (e.key) {
        case "Enter":
          onChange();
          break;
        case "Escape":
          cancel();
          break;
        case "ArrowUp":
        case "ArrowDown":
          if (vertNav == "editor") {
            e.stopImmediatePropagation();
            e.stopPropagation();
          }
          break;
        case "End":
        case "Home":
          e.stopPropagation();
          break;
      }
    });
    if (editorParams.mask) {
      maskInput(input2, editorParams);
    }
    return input2;
  }
  function range(cell, onRendered, success, cancel, editorParams) {
    var cellValue = cell.getValue(), input2 = document.createElement("input");
    input2.setAttribute("type", "range");
    if (typeof editorParams.max != "undefined") {
      input2.setAttribute("max", editorParams.max);
    }
    if (typeof editorParams.min != "undefined") {
      input2.setAttribute("min", editorParams.min);
    }
    if (typeof editorParams.step != "undefined") {
      input2.setAttribute("step", editorParams.step);
    }
    input2.style.padding = "4px";
    input2.style.width = "100%";
    input2.style.boxSizing = "border-box";
    if (editorParams.elementAttributes && typeof editorParams.elementAttributes == "object") {
      for (let key in editorParams.elementAttributes) {
        if (key.charAt(0) == "+") {
          key = key.slice(1);
          input2.setAttribute(key, input2.getAttribute(key) + editorParams.elementAttributes["+" + key]);
        } else {
          input2.setAttribute(key, editorParams.elementAttributes[key]);
        }
      }
    }
    input2.value = cellValue;
    onRendered(function() {
      if (cell.getType() === "cell") {
        input2.focus({ preventScroll: true });
        input2.style.height = "100%";
      }
    });
    function onChange() {
      var value = input2.value;
      if (!isNaN(value) && value !== "") {
        value = Number(value);
      }
      if (value != cellValue) {
        if (success(value)) {
          cellValue = value;
        }
      } else {
        cancel();
      }
    }
    input2.addEventListener("blur", function(e) {
      onChange();
    });
    input2.addEventListener("keydown", function(e) {
      switch (e.key) {
        case "Enter":
          onChange();
          break;
        case "Escape":
          cancel();
          break;
      }
    });
    return input2;
  }
  function date$1(cell, onRendered, success, cancel, editorParams) {
    var inputFormat = editorParams.format, vertNav = editorParams.verticalNavigation || "editor", DT = inputFormat ? window.DateTime || luxon.DateTime : null;
    var cellValue = cell.getValue(), input2 = document.createElement("input");
    function convertDate(value) {
      var newDatetime;
      if (DT.isDateTime(value)) {
        newDatetime = value;
      } else if (inputFormat === "x") {
        newDatetime = DT.fromMillis(value);
      } else if (inputFormat === "iso") {
        newDatetime = DT.fromISO(String(value));
      } else {
        newDatetime = DT.fromFormat(String(value), inputFormat);
      }
      return newDatetime.toFormat("yyyy-MM-dd");
    }
    input2.type = "date";
    input2.style.padding = "4px";
    input2.style.width = "100%";
    input2.style.boxSizing = "border-box";
    if (editorParams.max) {
      input2.setAttribute("max", inputFormat ? convertDate(editorParams.max) : editorParams.max);
    }
    if (editorParams.min) {
      input2.setAttribute("min", inputFormat ? convertDate(editorParams.min) : editorParams.min);
    }
    if (editorParams.elementAttributes && typeof editorParams.elementAttributes == "object") {
      for (let key in editorParams.elementAttributes) {
        if (key.charAt(0) == "+") {
          key = key.slice(1);
          input2.setAttribute(key, input2.getAttribute(key) + editorParams.elementAttributes["+" + key]);
        } else {
          input2.setAttribute(key, editorParams.elementAttributes[key]);
        }
      }
    }
    cellValue = typeof cellValue !== "undefined" ? cellValue : "";
    if (inputFormat) {
      if (DT) {
        cellValue = convertDate(cellValue);
      } else {
        console.error("Editor Error - 'date' editor 'format' param is dependant on luxon.js");
      }
    }
    input2.value = cellValue;
    onRendered(function() {
      if (cell.getType() === "cell") {
        input2.focus({ preventScroll: true });
        input2.style.height = "100%";
        if (editorParams.selectContents) {
          input2.select();
        }
      }
    });
    function onChange() {
      var value = input2.value, luxDate;
      if ((cellValue === null || typeof cellValue === "undefined") && value !== "" || value !== cellValue) {
        if (value && inputFormat) {
          luxDate = DT.fromFormat(String(value), "yyyy-MM-dd");
          switch (inputFormat) {
            case true:
              value = luxDate;
              break;
            case "x":
              value = luxDate.toMillis();
              break;
            case "iso":
              value = luxDate.toISO();
              break;
            default:
              value = luxDate.toFormat(inputFormat);
          }
        }
        if (success(value)) {
          cellValue = input2.value;
        }
      } else {
        cancel();
      }
    }
    input2.addEventListener("blur", function(e) {
      if (e.relatedTarget || e.rangeParent || e.explicitOriginalTarget !== input2) {
        onChange();
      }
    });
    input2.addEventListener("keydown", function(e) {
      switch (e.key) {
        // case "Tab":
        case "Enter":
          onChange();
          break;
        case "Escape":
          cancel();
          break;
        case "End":
        case "Home":
          e.stopPropagation();
          break;
        case "ArrowUp":
        case "ArrowDown":
          if (vertNav == "editor") {
            e.stopImmediatePropagation();
            e.stopPropagation();
          }
          break;
      }
    });
    return input2;
  }
  function time$1(cell, onRendered, success, cancel, editorParams) {
    var inputFormat = editorParams.format, vertNav = editorParams.verticalNavigation || "editor", DT = inputFormat ? window.DateTime || luxon.DateTime : null, newDatetime;
    var cellValue = cell.getValue(), input2 = document.createElement("input");
    input2.type = "time";
    input2.style.padding = "4px";
    input2.style.width = "100%";
    input2.style.boxSizing = "border-box";
    if (editorParams.elementAttributes && typeof editorParams.elementAttributes == "object") {
      for (let key in editorParams.elementAttributes) {
        if (key.charAt(0) == "+") {
          key = key.slice(1);
          input2.setAttribute(key, input2.getAttribute(key) + editorParams.elementAttributes["+" + key]);
        } else {
          input2.setAttribute(key, editorParams.elementAttributes[key]);
        }
      }
    }
    cellValue = typeof cellValue !== "undefined" ? cellValue : "";
    if (inputFormat) {
      if (DT) {
        if (DT.isDateTime(cellValue)) {
          newDatetime = cellValue;
        } else if (inputFormat === "x") {
          newDatetime = DT.fromMillis(cellValue);
        } else if (inputFormat === "iso") {
          newDatetime = DT.fromISO(String(cellValue));
        } else {
          newDatetime = DT.fromFormat(String(cellValue), inputFormat);
        }
        cellValue = newDatetime.toFormat("HH:mm");
      } else {
        console.error("Editor Error - 'date' editor 'format' param is dependant on luxon.js");
      }
    }
    input2.value = cellValue;
    onRendered(function() {
      if (cell.getType() == "cell") {
        input2.focus({ preventScroll: true });
        input2.style.height = "100%";
        if (editorParams.selectContents) {
          input2.select();
        }
      }
    });
    function onChange() {
      var value = input2.value, luxTime;
      if ((cellValue === null || typeof cellValue === "undefined") && value !== "" || value !== cellValue) {
        if (value && inputFormat) {
          luxTime = DT.fromFormat(String(value), "hh:mm");
          switch (inputFormat) {
            case true:
              value = luxTime;
              break;
            case "x":
              value = luxTime.toMillis();
              break;
            case "iso":
              value = luxTime.toISO();
              break;
            default:
              value = luxTime.toFormat(inputFormat);
          }
        }
        if (success(value)) {
          cellValue = input2.value;
        }
      } else {
        cancel();
      }
    }
    input2.addEventListener("blur", function(e) {
      if (e.relatedTarget || e.rangeParent || e.explicitOriginalTarget !== input2) {
        onChange();
      }
    });
    input2.addEventListener("keydown", function(e) {
      switch (e.key) {
        // case "Tab":
        case "Enter":
          onChange();
          break;
        case "Escape":
          cancel();
          break;
        case "End":
        case "Home":
          e.stopPropagation();
          break;
        case "ArrowUp":
        case "ArrowDown":
          if (vertNav == "editor") {
            e.stopImmediatePropagation();
            e.stopPropagation();
          }
          break;
      }
    });
    return input2;
  }
  function datetime$2(cell, onRendered, success, cancel, editorParams) {
    var inputFormat = editorParams.format, vertNav = editorParams.verticalNavigation || "editor", DT = inputFormat ? this.table.dependencyRegistry.lookup(["luxon", "DateTime"], "DateTime") : null, newDatetime;
    var cellValue = cell.getValue(), input2 = document.createElement("input");
    input2.type = "datetime-local";
    input2.style.padding = "4px";
    input2.style.width = "100%";
    input2.style.boxSizing = "border-box";
    if (editorParams.elementAttributes && typeof editorParams.elementAttributes == "object") {
      for (let key in editorParams.elementAttributes) {
        if (key.charAt(0) == "+") {
          key = key.slice(1);
          input2.setAttribute(key, input2.getAttribute(key) + editorParams.elementAttributes["+" + key]);
        } else {
          input2.setAttribute(key, editorParams.elementAttributes[key]);
        }
      }
    }
    cellValue = typeof cellValue !== "undefined" ? cellValue : "";
    if (inputFormat) {
      if (DT) {
        if (DT.isDateTime(cellValue)) {
          newDatetime = cellValue;
        } else if (inputFormat === "x") {
          newDatetime = DT.fromMillis(cellValue);
        } else if (inputFormat === "iso") {
          newDatetime = DT.fromISO(String(cellValue));
        } else {
          newDatetime = DT.fromFormat(String(cellValue), inputFormat);
        }
        cellValue = newDatetime.toFormat("yyyy-MM-dd") + "T" + newDatetime.toFormat("HH:mm");
      } else {
        console.error("Editor Error - 'date' editor 'format' param is dependant on luxon.js");
      }
    }
    input2.value = cellValue;
    onRendered(function() {
      if (cell.getType() === "cell") {
        input2.focus({ preventScroll: true });
        input2.style.height = "100%";
        if (editorParams.selectContents) {
          input2.select();
        }
      }
    });
    function onChange() {
      var value = input2.value, luxDateTime;
      if ((cellValue === null || typeof cellValue === "undefined") && value !== "" || value !== cellValue) {
        if (value && inputFormat) {
          luxDateTime = DT.fromISO(String(value));
          switch (inputFormat) {
            case true:
              value = luxDateTime;
              break;
            case "x":
              value = luxDateTime.toMillis();
              break;
            case "iso":
              value = luxDateTime.toISO();
              break;
            default:
              value = luxDateTime.toFormat(inputFormat);
          }
        }
        if (success(value)) {
          cellValue = input2.value;
        }
      } else {
        cancel();
      }
    }
    input2.addEventListener("blur", function(e) {
      if (e.relatedTarget || e.rangeParent || e.explicitOriginalTarget !== input2) {
        onChange();
      }
    });
    input2.addEventListener("keydown", function(e) {
      switch (e.key) {
        // case "Tab":
        case "Enter":
          onChange();
          break;
        case "Escape":
          cancel();
          break;
        case "End":
        case "Home":
          e.stopPropagation();
          break;
        case "ArrowUp":
        case "ArrowDown":
          if (vertNav == "editor") {
            e.stopImmediatePropagation();
            e.stopPropagation();
          }
          break;
      }
    });
    return input2;
  }
  var Edit$1 = class Edit {
    constructor(editor, cell, onRendered, success, cancel, editorParams) {
      this.edit = editor;
      this.table = editor.table;
      this.cell = cell;
      this.params = this._initializeParams(editorParams);
      this.data = [];
      this.displayItems = [];
      this.currentItems = [];
      this.focusedItem = null;
      this.input = this._createInputElement();
      this.listEl = this._createListElement();
      this.initialValues = null;
      this.isFilter = cell.getType() === "header";
      this.filterTimeout = null;
      this.filtered = false;
      this.typing = false;
      this.values = [];
      this.popup = null;
      this.listIteration = 0;
      this.lastAction = "";
      this.filterTerm = "";
      this.blurable = true;
      this.actions = {
        success,
        cancel
      };
      this._deprecatedOptionsCheck();
      this._initializeValue();
      onRendered(this._onRendered.bind(this));
    }
    _deprecatedOptionsCheck() {
    }
    _initializeValue() {
      var initialValue = this.cell.getValue();
      if (typeof initialValue === "undefined" && typeof this.params.defaultValue !== "undefined") {
        initialValue = this.params.defaultValue;
      }
      this.initialValues = this.params.multiselect ? initialValue : [initialValue];
      if (this.isFilter) {
        this.input.value = this.initialValues ? this.initialValues.join(",") : "";
        this.headerFilterInitialListGen();
      }
    }
    _onRendered() {
      var cellEl = this.cell.getElement();
      function clickStop(e) {
        e.stopPropagation();
      }
      if (!this.isFilter) {
        this.input.style.height = "100%";
        this.input.focus({ preventScroll: true });
      }
      cellEl.addEventListener("click", clickStop);
      setTimeout(() => {
        cellEl.removeEventListener("click", clickStop);
      }, 1e3);
      this.input.addEventListener("mousedown", this._preventPopupBlur.bind(this));
    }
    _createListElement() {
      var listEl = document.createElement("div");
      listEl.classList.add("tabulator-edit-list");
      listEl.addEventListener("mousedown", this._preventBlur.bind(this));
      listEl.addEventListener("keydown", this._inputKeyDown.bind(this));
      return listEl;
    }
    _setListWidth() {
      var element = this.isFilter ? this.input : this.cell.getElement();
      this.listEl.style.minWidth = element.offsetWidth + "px";
      if (this.params.maxWidth) {
        if (this.params.maxWidth === true) {
          this.listEl.style.maxWidth = element.offsetWidth + "px";
        } else if (typeof this.params.maxWidth === "number") {
          this.listEl.style.maxWidth = this.params.maxWidth + "px";
        } else {
          this.listEl.style.maxWidth = this.params.maxWidth;
        }
      }
    }
    _createInputElement() {
      var attribs = this.params.elementAttributes;
      var input2 = document.createElement("input");
      input2.setAttribute("type", this.params.clearable ? "search" : "text");
      input2.style.padding = "4px";
      input2.style.width = "100%";
      input2.style.boxSizing = "border-box";
      if (!this.params.autocomplete) {
        input2.style.cursor = "default";
        input2.style.caretColor = "transparent";
      }
      if (attribs && typeof attribs == "object") {
        for (let key in attribs) {
          if (key.charAt(0) == "+") {
            key = key.slice(1);
            input2.setAttribute(key, input2.getAttribute(key) + attribs["+" + key]);
          } else {
            input2.setAttribute(key, attribs[key]);
          }
        }
      }
      if (this.params.mask) {
        maskInput(input2, this.params);
      }
      this._bindInputEvents(input2);
      return input2;
    }
    _initializeParams(params) {
      var valueKeys = ["values", "valuesURL", "valuesLookup"], valueCheck;
      params = Object.assign({}, params);
      params.verticalNavigation = params.verticalNavigation || "editor";
      params.placeholderLoading = typeof params.placeholderLoading === "undefined" ? "Searching ..." : params.placeholderLoading;
      params.placeholderEmpty = typeof params.placeholderEmpty === "undefined" ? "No Results Found" : params.placeholderEmpty;
      params.filterDelay = typeof params.filterDelay === "undefined" ? 300 : params.filterDelay;
      params.emptyValue = Object.keys(params).includes("emptyValue") ? params.emptyValue : "";
      valueCheck = Object.keys(params).filter((key) => valueKeys.includes(key)).length;
      if (!valueCheck) {
        console.warn("list editor config error - either the values, valuesURL, or valuesLookup option must be set");
      } else if (valueCheck > 1) {
        console.warn("list editor config error - only one of the values, valuesURL, or valuesLookup options can be set on the same editor");
      }
      if (params.autocomplete) {
        if (params.multiselect) {
          params.multiselect = false;
          console.warn("list editor config error - multiselect option is not available when autocomplete is enabled");
        }
      } else {
        if (params.freetext) {
          params.freetext = false;
          console.warn("list editor config error - freetext option is only available when autocomplete is enabled");
        }
        if (params.filterFunc) {
          params.filterFunc = false;
          console.warn("list editor config error - filterFunc option is only available when autocomplete is enabled");
        }
        if (params.filterRemote) {
          params.filterRemote = false;
          console.warn("list editor config error - filterRemote option is only available when autocomplete is enabled");
        }
        if (params.mask) {
          params.mask = false;
          console.warn("list editor config error - mask option is only available when autocomplete is enabled");
        }
        if (params.allowEmpty) {
          params.allowEmpty = false;
          console.warn("list editor config error - allowEmpty option is only available when autocomplete is enabled");
        }
        if (params.listOnEmpty) {
          params.listOnEmpty = false;
          console.warn("list editor config error - listOnEmpty option is only available when autocomplete is enabled");
        }
      }
      if (params.filterRemote && !(typeof params.valuesLookup === "function" || params.valuesURL)) {
        params.filterRemote = false;
        console.warn("list editor config error - filterRemote option should only be used when values list is populated from a remote source");
      }
      return params;
    }
    //////////////////////////////////////
    ////////// Event Handling ////////////
    //////////////////////////////////////
    _bindInputEvents(input2) {
      input2.addEventListener("focus", this._inputFocus.bind(this));
      input2.addEventListener("click", this._inputClick.bind(this));
      input2.addEventListener("blur", this._inputBlur.bind(this));
      input2.addEventListener("keydown", this._inputKeyDown.bind(this));
      input2.addEventListener("search", this._inputSearch.bind(this));
      if (this.params.autocomplete) {
        input2.addEventListener("keyup", this._inputKeyUp.bind(this));
      }
    }
    _inputFocus(e) {
      this.rebuildOptionsList();
    }
    _filter() {
      if (this.params.filterRemote) {
        clearTimeout(this.filterTimeout);
        this.filterTimeout = setTimeout(() => {
          this.rebuildOptionsList();
        }, this.params.filterDelay);
      } else {
        this._filterList();
      }
    }
    _inputClick(e) {
      e.stopPropagation();
    }
    _inputBlur(e) {
      if (this.blurable) {
        if (this.popup) {
          this.popup.hide();
        } else {
          this._resolveValue(true);
        }
      }
    }
    _inputSearch() {
      this._clearChoices();
    }
    _inputKeyDown(e) {
      switch (e.key) {
        case "ArrowUp":
          this._keyUp(e);
          break;
        case "ArrowDown":
          this._keyDown(e);
          break;
        case "ArrowLeft":
        case "ArrowRight":
          this._keySide(e);
          break;
        case "Enter":
          this._keyEnter();
          break;
        case "Escape":
          this._keyEsc();
          break;
        case "Home":
        case "End":
          this._keyHomeEnd(e);
          break;
        case "Tab":
          this._keyTab(e);
          break;
        default:
          this._keySelectLetter(e);
      }
    }
    _inputKeyUp(e) {
      switch (e.key) {
        case "ArrowUp":
        case "ArrowLeft":
        case "ArrowRight":
        case "ArrowDown":
        case "Enter":
        case "Escape":
          break;
        default:
          this._keyAutoCompLetter(e);
      }
    }
    _preventPopupBlur() {
      if (this.popup) {
        this.popup.blockHide();
      }
      setTimeout(() => {
        if (this.popup) {
          this.popup.restoreHide();
        }
      }, 10);
    }
    _preventBlur() {
      this.blurable = false;
      setTimeout(() => {
        this.blurable = true;
      }, 10);
    }
    //////////////////////////////////////
    //////// Keyboard Navigation /////////
    //////////////////////////////////////
    _keyTab(e) {
      if (this.params.autocomplete && this.lastAction === "typing") {
        this._resolveValue(true);
      } else {
        if (this.focusedItem) {
          this._chooseItem(this.focusedItem, true);
        }
      }
    }
    _keyUp(e) {
      var index = this.displayItems.indexOf(this.focusedItem);
      if (this.params.verticalNavigation == "editor" || this.params.verticalNavigation == "hybrid" && index) {
        e.stopImmediatePropagation();
        e.stopPropagation();
        e.preventDefault();
        if (index > 0) {
          this._focusItem(this.displayItems[index - 1]);
        }
      }
    }
    _keyDown(e) {
      var index = this.displayItems.indexOf(this.focusedItem);
      if (this.params.verticalNavigation == "editor" || this.params.verticalNavigation == "hybrid" && index < this.displayItems.length - 1) {
        e.stopImmediatePropagation();
        e.stopPropagation();
        e.preventDefault();
        if (index < this.displayItems.length - 1) {
          if (index == -1) {
            this._focusItem(this.displayItems[0]);
          } else {
            this._focusItem(this.displayItems[index + 1]);
          }
        }
      }
    }
    _keySide(e) {
      if (!this.params.autocomplete) {
        e.stopImmediatePropagation();
        e.stopPropagation();
        e.preventDefault();
      }
    }
    _keyEnter(e) {
      if (this.params.autocomplete && this.lastAction === "typing") {
        this._resolveValue(true);
      } else {
        if (this.focusedItem) {
          if (this.isFilter && !this.params.multiselect && this.focusedItem.selected) {
            this._resolveValue();
          } else {
            this._chooseItem(this.focusedItem);
          }
        }
      }
    }
    _keyEsc(e) {
      this._cancel();
    }
    _keyHomeEnd(e) {
      if (this.params.autocomplete) {
        e.stopImmediatePropagation();
      }
    }
    _keySelectLetter(e) {
      if (!this.params.autocomplete) {
        e.preventDefault();
        if (e.key.length === 1) {
          this._scrollToValue(e.key.toUpperCase().charCodeAt(0));
        }
      }
    }
    _keyAutoCompLetter(e) {
      this._filter();
      this.lastAction = "typing";
      this.typing = true;
    }
    _scrollToValue(char) {
      clearTimeout(this.filterTimeout);
      var character = String.fromCharCode(char).toLowerCase();
      this.filterTerm += character.toLowerCase();
      var match = this.displayItems.find((item) => {
        return typeof item.label !== "undefined" && item.label.toLowerCase().startsWith(this.filterTerm);
      });
      if (match) {
        this._focusItem(match);
      }
      this.filterTimeout = setTimeout(() => {
        this.filterTerm = "";
      }, 800);
    }
    _focusItem(item) {
      this.lastAction = "focus";
      if (this.focusedItem && this.focusedItem.element) {
        this.focusedItem.element.classList.remove("focused");
      }
      this.focusedItem = item;
      if (item && item.element) {
        item.element.classList.add("focused");
        item.element.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
      }
    }
    //////////////////////////////////////
    /////// Data List Generation /////////
    //////////////////////////////////////
    headerFilterInitialListGen() {
      this._generateOptions(true);
    }
    rebuildOptionsList() {
      this._generateOptions().then(this._sortOptions.bind(this)).then(this._buildList.bind(this)).then(this._showList.bind(this)).catch((e) => {
        if (!Number.isInteger(e)) {
          console.error("List generation error", e);
        }
      });
    }
    _filterList() {
      this._buildList(this._filterOptions());
      this._showList();
    }
    _generateOptions(silent) {
      var values = [];
      var iteration = ++this.listIteration;
      this.filtered = false;
      if (this.params.values) {
        values = this.params.values;
      } else if (this.params.valuesURL) {
        values = this._ajaxRequest(this.params.valuesURL, this.input.value);
      } else {
        if (typeof this.params.valuesLookup === "function") {
          values = this.params.valuesLookup(this.cell, this.input.value);
        } else if (this.params.valuesLookup) {
          values = this._uniqueColumnValues(this.params.valuesLookupField);
        }
      }
      if (values instanceof Promise) {
        if (!silent) {
          this._addPlaceholder(this.params.placeholderLoading);
        }
        return values.then().then((responseValues) => {
          if (this.listIteration === iteration) {
            return this._parseList(responseValues);
          } else {
            return Promise.reject(iteration);
          }
        });
      } else {
        return Promise.resolve(this._parseList(values));
      }
    }
    _addPlaceholder(contents) {
      var placeholder = document.createElement("div");
      if (typeof contents === "function") {
        contents = contents(this.cell.getComponent(), this.listEl);
      }
      if (contents) {
        this._clearList();
        if (contents instanceof HTMLElement) {
          placeholder = contents;
        } else {
          placeholder.classList.add("tabulator-edit-list-placeholder");
          placeholder.innerHTML = contents;
        }
        this.listEl.appendChild(placeholder);
        this._showList();
      }
    }
    _ajaxRequest(url, term) {
      var params = this.params.filterRemote ? { term } : {};
      url = urlBuilder(url, {}, params);
      return fetch(url).then((response) => {
        if (response.ok) {
          return response.json().catch((error) => {
            console.warn("List Ajax Load Error - Invalid JSON returned", error);
            return Promise.reject(error);
          });
        } else {
          console.error("List Ajax Load Error - Connection Error: " + response.status, response.statusText);
          return Promise.reject(response);
        }
      }).catch((error) => {
        console.error("List Ajax Load Error - Connection Error: ", error);
        return Promise.reject(error);
      });
    }
    _uniqueColumnValues(field) {
      var output = {}, data = this.table.getData(this.params.valuesLookup), column;
      if (field) {
        column = this.table.columnManager.getColumnByField(field);
      } else {
        column = this.cell.getColumn()._getSelf();
      }
      if (column) {
        data.forEach((row) => {
          var val = column.getFieldValue(row);
          if (!this._emptyValueCheck(val)) {
            if (this.params.multiselect && Array.isArray(val)) {
              val.forEach((item) => {
                if (!this._emptyValueCheck(item)) {
                  output[item] = true;
                }
              });
            } else {
              output[val] = true;
            }
          }
        });
      } else {
        console.warn("unable to find matching column to create select lookup list:", field);
        output = [];
      }
      return Object.keys(output);
    }
    _emptyValueCheck(value) {
      return value === null || typeof value === "undefined" || value === "";
    }
    _parseList(inputValues) {
      var data = [];
      if (!Array.isArray(inputValues)) {
        inputValues = Object.entries(inputValues).map(([key, value]) => {
          return {
            label: value,
            value: key
          };
        });
      }
      inputValues.forEach((value) => {
        if (typeof value !== "object") {
          value = {
            label: value,
            value
          };
        }
        this._parseListItem(value, data, 0);
      });
      if (!this.currentItems.length && this.params.freetext) {
        this.input.value = this.initialValues;
        this.typing = true;
        this.lastAction = "typing";
      }
      if (this.params.multiselect) {
        this.initialValues = null;
      }
      this.data = data;
      return data;
    }
    _parseListItem(option, data, level) {
      var item = {};
      if (option.options) {
        item = this._parseListGroup(option, level + 1);
      } else {
        item = {
          label: option.label,
          value: option.value,
          itemParams: option.itemParams,
          elementAttributes: option.elementAttributes,
          element: false,
          selected: false,
          visible: true,
          level,
          original: option
        };
        if (this.params.multiselect) {
          var existingIndex = this.currentItems.findIndex((existing) => existing.value === option.value);
          if (existingIndex > -1) {
            if (this.focusedItem === this.currentItems[existingIndex]) {
              this.focusedItem = item;
            }
            this.currentItems[existingIndex] = item;
            item.selected = true;
          } else if (this.initialValues && this.initialValues.indexOf(option.value) > -1) {
            this._chooseItem(item, true);
          }
        } else if (this.initialValues && this.initialValues.indexOf(option.value) > -1) {
          this._chooseItem(item, true);
        }
      }
      data.push(item);
    }
    _parseListGroup(option, level) {
      var item = {
        label: option.label,
        group: true,
        itemParams: option.itemParams,
        elementAttributes: option.elementAttributes,
        element: false,
        visible: true,
        level,
        options: [],
        original: option
      };
      option.options.forEach((child) => {
        this._parseListItem(child, item.options, level);
      });
      return item;
    }
    _sortOptions(options) {
      var sorter;
      if (this.params.sort) {
        sorter = typeof this.params.sort === "function" ? this.params.sort : this._defaultSortFunction.bind(this);
        this._sortGroup(sorter, options);
      }
      return options;
    }
    _sortGroup(sorter, options) {
      options.sort((a, b) => {
        return sorter(a.label, b.label, a.value, b.value, a.original, b.original);
      });
      options.forEach((option) => {
        if (option.group) {
          this._sortGroup(sorter, option.options);
        }
      });
    }
    _defaultSortFunction(as, bs) {
      var a, b, a1, b1, i = 0, L, rx = /(\d+)|(\D+)/g, rd = /\d/;
      var emptyAlign = 0;
      if (this.params.sort === "desc") {
        [as, bs] = [bs, as];
      }
      if (!as && as !== 0) {
        emptyAlign = !bs && bs !== 0 ? 0 : -1;
      } else if (!bs && bs !== 0) {
        emptyAlign = 1;
      } else {
        if (isFinite(as) && isFinite(bs)) return as - bs;
        a = String(as).toLowerCase();
        b = String(bs).toLowerCase();
        if (a === b) return 0;
        if (!(rd.test(a) && rd.test(b))) return a > b ? 1 : -1;
        a = a.match(rx);
        b = b.match(rx);
        L = a.length > b.length ? b.length : a.length;
        while (i < L) {
          a1 = a[i];
          b1 = b[i++];
          if (a1 !== b1) {
            if (isFinite(a1) && isFinite(b1)) {
              if (a1.charAt(0) === "0") a1 = "." + a1;
              if (b1.charAt(0) === "0") b1 = "." + b1;
              return a1 - b1;
            } else return a1 > b1 ? 1 : -1;
          }
        }
        return a.length > b.length;
      }
      return emptyAlign;
    }
    _filterOptions() {
      var filterFunc = this.params.filterFunc || this._defaultFilterFunc, term = this.input.value;
      if (term) {
        this.filtered = true;
        this.data.forEach((item) => {
          this._filterItem(filterFunc, term, item);
        });
      } else {
        this.filtered = false;
      }
      return this.data;
    }
    _filterItem(func, term, item) {
      var matches = false;
      if (!item.group) {
        item.visible = func(term, item.label, item.value, item.original);
      } else {
        item.options.forEach((option) => {
          if (this._filterItem(func, term, option)) {
            matches = true;
          }
        });
        item.visible = matches;
      }
      return item.visible;
    }
    _defaultFilterFunc(term, label, value, item) {
      term = String(term).toLowerCase();
      if (label !== null && typeof label !== "undefined") {
        if (String(label).toLowerCase().indexOf(term) > -1 || String(value).toLowerCase().indexOf(term) > -1) {
          return true;
        }
      }
      return false;
    }
    //////////////////////////////////////
    /////////// Display List /////////////
    //////////////////////////////////////
    _clearList() {
      while (this.listEl.firstChild) this.listEl.removeChild(this.listEl.firstChild);
      this.displayItems = [];
    }
    _buildList(data) {
      this._clearList();
      data.forEach((option) => {
        this._buildItem(option);
      });
      if (!this.displayItems.length) {
        this._addPlaceholder(this.params.placeholderEmpty);
      }
    }
    _buildItem(item) {
      var el = item.element, contents;
      if (!this.filtered || item.visible) {
        if (!el) {
          el = document.createElement("div");
          el.tabIndex = 0;
          contents = this.params.itemFormatter ? this.params.itemFormatter(item.label, item.value, item.original, el) : item.label;
          if (contents instanceof HTMLElement) {
            el.appendChild(contents);
          } else {
            el.innerHTML = contents;
          }
          if (item.group) {
            el.classList.add("tabulator-edit-list-group");
          } else {
            el.classList.add("tabulator-edit-list-item");
          }
          el.classList.add("tabulator-edit-list-group-level-" + item.level);
          if (item.elementAttributes && typeof item.elementAttributes == "object") {
            for (let key in item.elementAttributes) {
              if (key.charAt(0) == "+") {
                key = key.slice(1);
                el.setAttribute(key, this.input.getAttribute(key) + item.elementAttributes["+" + key]);
              } else {
                el.setAttribute(key, item.elementAttributes[key]);
              }
            }
          }
          if (item.group) {
            el.addEventListener("click", this._groupClick.bind(this, item));
          } else {
            el.addEventListener("click", this._itemClick.bind(this, item));
          }
          el.addEventListener("mousedown", this._preventBlur.bind(this));
          item.element = el;
        }
        this._styleItem(item);
        this.listEl.appendChild(el);
        if (item.group) {
          item.options.forEach((option) => {
            this._buildItem(option);
          });
        } else {
          this.displayItems.push(item);
        }
      }
    }
    _showList() {
      var startVis = this.popup && this.popup.isVisible();
      if (this.input.parentNode) {
        if (this.params.autocomplete && this.input.value === "" && !this.params.listOnEmpty) {
          if (this.popup) {
            this.popup.hide(true);
          }
          return;
        }
        this._setListWidth();
        if (!this.popup) {
          this.popup = this.edit.popup(this.listEl);
        }
        this.popup.show(this.cell.getElement(), "bottom");
        if (!startVis) {
          setTimeout(() => {
            this.popup.hideOnBlur(this._resolveValue.bind(this, true));
          }, 10);
        }
      }
    }
    _styleItem(item) {
      if (item && item.element) {
        if (item.selected) {
          item.element.classList.add("active");
        } else {
          item.element.classList.remove("active");
        }
      }
    }
    //////////////////////////////////////
    ///////// User Interaction ///////////
    //////////////////////////////////////
    _itemClick(item, e) {
      e.stopPropagation();
      this._chooseItem(item);
    }
    _groupClick(item, e) {
      e.stopPropagation();
    }
    //////////////////////////////////////
    ////// Current Item Management ///////
    //////////////////////////////////////
    _cancel() {
      this.popup.hide(true);
      this.actions.cancel();
    }
    _clearChoices() {
      this.typing = true;
      this.currentItems.forEach((item) => {
        item.selected = false;
        this._styleItem(item);
      });
      this.currentItems = [];
      this.focusedItem = null;
    }
    _chooseItem(item, silent) {
      var index;
      this.typing = false;
      if (this.params.multiselect) {
        index = this.currentItems.indexOf(item);
        if (index > -1) {
          this.currentItems.splice(index, 1);
          item.selected = false;
        } else {
          this.currentItems.push(item);
          item.selected = true;
        }
        this.input.value = this.currentItems.map((item2) => item2.label).join(",");
        this._styleItem(item);
      } else {
        if (this.isFilter && !silent && item.selected) {
          this._clearChoices();
          this.input.value = "";
          this._resolveValue();
          return;
        }
        this.currentItems = [item];
        item.selected = true;
        this.input.value = item.label;
        this._styleItem(item);
        if (!silent) {
          this._resolveValue();
        }
      }
      this._focusItem(item);
    }
    _resolveValue(blur) {
      var output, initialValue;
      if (this.popup) {
        this.popup.hide(true);
      }
      if (this.params.multiselect) {
        output = this.currentItems.map((item) => item.value);
      } else {
        if (blur && this.params.autocomplete && this.typing) {
          if (this.params.freetext || this.params.allowEmpty && this.input.value === "") {
            output = this.input.value;
          } else {
            this.actions.cancel();
            return;
          }
        } else {
          if (this.currentItems[0]) {
            output = this.currentItems[0].value;
          } else if (this.isFilter && this.focusedItem && this.focusedItem.selected) {
            output = this.focusedItem.value;
          } else {
            initialValue = Array.isArray(this.initialValues) ? this.initialValues[0] : this.initialValues;
            if (initialValue === null || typeof initialValue === "undefined" || initialValue === "") {
              output = initialValue;
            } else {
              output = this.params.emptyValue;
            }
          }
        }
      }
      if (output === "") {
        output = this.params.emptyValue;
      }
      this.actions.success(output);
      if (this.isFilter) {
        this.initialValues = output && !Array.isArray(output) ? [output] : output;
        this.currentItems = [];
      }
    }
  };
  function list(cell, onRendered, success, cancel, editorParams) {
    var list2 = new Edit$1(this, cell, onRendered, success, cancel, editorParams);
    return list2.input;
  }
  function star$1(cell, onRendered, success, cancel, editorParams) {
    var self = this, element = cell.getElement(), value = cell.getValue(), maxStars = element.getElementsByTagName("svg").length || 5, size = element.getElementsByTagName("svg")[0] ? element.getElementsByTagName("svg")[0].getAttribute("width") : 14, stars = [], starsHolder = document.createElement("div"), star2 = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    function starChange(val) {
      stars.forEach(function(star3, i2) {
        if (i2 < val) {
          if (self.table.browser == "ie") {
            star3.setAttribute("class", "tabulator-star-active");
          } else {
            star3.classList.replace("tabulator-star-inactive", "tabulator-star-active");
          }
          star3.innerHTML = '<polygon fill="#488CE9" stroke="#014AAE" stroke-width="37.6152" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" points="259.216,29.942 330.27,173.919 489.16,197.007 374.185,309.08 401.33,467.31 259.216,392.612 117.104,467.31 144.25,309.08 29.274,197.007 188.165,173.919 "/>';
        } else {
          if (self.table.browser == "ie") {
            star3.setAttribute("class", "tabulator-star-inactive");
          } else {
            star3.classList.replace("tabulator-star-active", "tabulator-star-inactive");
          }
          star3.innerHTML = '<polygon fill="#010155" stroke="#686868" stroke-width="37.6152" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" points="259.216,29.942 330.27,173.919 489.16,197.007 374.185,309.08 401.33,467.31 259.216,392.612 117.104,467.31 144.25,309.08 29.274,197.007 188.165,173.919 "/>';
        }
      });
    }
    function buildStar(i2) {
      var starHolder = document.createElement("span");
      var nextStar = star2.cloneNode(true);
      stars.push(nextStar);
      starHolder.addEventListener("mouseenter", function(e) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        starChange(i2);
      });
      starHolder.addEventListener("mousemove", function(e) {
        e.stopPropagation();
        e.stopImmediatePropagation();
      });
      starHolder.addEventListener("click", function(e) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        success(i2);
        element.blur();
      });
      starHolder.appendChild(nextStar);
      starsHolder.appendChild(starHolder);
    }
    function changeValue(val) {
      value = val;
      starChange(val);
    }
    element.style.whiteSpace = "nowrap";
    element.style.overflow = "hidden";
    element.style.textOverflow = "ellipsis";
    starsHolder.style.verticalAlign = "middle";
    starsHolder.style.display = "inline-block";
    starsHolder.style.padding = "4px";
    star2.setAttribute("width", size);
    star2.setAttribute("height", size);
    star2.setAttribute("viewBox", "0 0 512 512");
    star2.setAttribute("xml:space", "preserve");
    star2.style.padding = "0 1px";
    if (editorParams.elementAttributes && typeof editorParams.elementAttributes == "object") {
      for (let key in editorParams.elementAttributes) {
        if (key.charAt(0) == "+") {
          key = key.slice(1);
          starsHolder.setAttribute(key, starsHolder.getAttribute(key) + editorParams.elementAttributes["+" + key]);
        } else {
          starsHolder.setAttribute(key, editorParams.elementAttributes[key]);
        }
      }
    }
    for (var i = 1; i <= maxStars; i++) {
      buildStar(i);
    }
    value = Math.min(parseInt(value), maxStars);
    starChange(value);
    starsHolder.addEventListener("mousemove", function(e) {
      starChange(0);
    });
    starsHolder.addEventListener("click", function(e) {
      success(0);
    });
    element.addEventListener("blur", function(e) {
      cancel();
    });
    element.addEventListener("keydown", function(e) {
      switch (e.key) {
        case "ArrowRight":
          changeValue(value + 1);
          break;
        case "ArrowLeft":
          changeValue(value - 1);
          break;
        case "Enter":
          success(value);
          break;
        case "Escape":
          cancel();
          break;
      }
    });
    return starsHolder;
  }
  function progress$1(cell, onRendered, success, cancel, editorParams) {
    var element = cell.getElement(), max = typeof editorParams.max === "undefined" ? element.getElementsByTagName("div")[0] && element.getElementsByTagName("div")[0].getAttribute("max") || 100 : editorParams.max, min = typeof editorParams.min === "undefined" ? element.getElementsByTagName("div")[0] && element.getElementsByTagName("div")[0].getAttribute("min") || 0 : editorParams.min, percent = (max - min) / 100, value = cell.getValue() || 0, handle2 = document.createElement("div"), bar = document.createElement("div"), mouseDrag, mouseDragWidth;
    function updateValue() {
      var style = window.getComputedStyle(element, null);
      var calcVal = percent * Math.round(bar.offsetWidth / ((element.clientWidth - parseInt(style.getPropertyValue("padding-left")) - parseInt(style.getPropertyValue("padding-right"))) / 100)) + min;
      success(calcVal);
      element.setAttribute("aria-valuenow", calcVal);
      element.setAttribute("aria-label", value);
    }
    handle2.style.position = "absolute";
    handle2.style.right = "0";
    handle2.style.top = "0";
    handle2.style.bottom = "0";
    handle2.style.width = "5px";
    handle2.classList.add("tabulator-progress-handle");
    bar.style.display = "inline-block";
    bar.style.position = "relative";
    bar.style.height = "100%";
    bar.style.backgroundColor = "#488CE9";
    bar.style.maxWidth = "100%";
    bar.style.minWidth = "0%";
    if (editorParams.elementAttributes && typeof editorParams.elementAttributes == "object") {
      for (let key in editorParams.elementAttributes) {
        if (key.charAt(0) == "+") {
          key = key.slice(1);
          bar.setAttribute(key, bar.getAttribute(key) + editorParams.elementAttributes["+" + key]);
        } else {
          bar.setAttribute(key, editorParams.elementAttributes[key]);
        }
      }
    }
    element.style.padding = "4px 4px";
    value = Math.min(parseFloat(value), max);
    value = Math.max(parseFloat(value), min);
    value = Math.round((value - min) / percent);
    bar.style.width = value + "%";
    element.setAttribute("aria-valuemin", min);
    element.setAttribute("aria-valuemax", max);
    bar.appendChild(handle2);
    handle2.addEventListener("mousedown", function(e) {
      mouseDrag = e.screenX;
      mouseDragWidth = bar.offsetWidth;
    });
    handle2.addEventListener("mouseover", function() {
      handle2.style.cursor = "ew-resize";
    });
    element.addEventListener("mousemove", function(e) {
      if (mouseDrag) {
        bar.style.width = mouseDragWidth + e.screenX - mouseDrag + "px";
      }
    });
    element.addEventListener("mouseup", function(e) {
      if (mouseDrag) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        mouseDrag = false;
        mouseDragWidth = false;
        updateValue();
      }
    });
    element.addEventListener("keydown", function(e) {
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          bar.style.width = bar.clientWidth + element.clientWidth / 100 + "px";
          break;
        case "ArrowLeft":
          e.preventDefault();
          bar.style.width = bar.clientWidth - element.clientWidth / 100 + "px";
          break;
        case "Tab":
        case "Enter":
          updateValue();
          break;
        case "Escape":
          cancel();
          break;
      }
    });
    element.addEventListener("blur", function() {
      cancel();
    });
    return bar;
  }
  function tickCross$1(cell, onRendered, success, cancel, editorParams) {
    var value = cell.getValue(), input2 = document.createElement("input"), tristate = editorParams.tristate, indetermValue = typeof editorParams.indeterminateValue === "undefined" ? null : editorParams.indeterminateValue, indetermState = false, trueValueSet = Object.keys(editorParams).includes("trueValue"), falseValueSet = Object.keys(editorParams).includes("falseValue");
    input2.setAttribute("type", "checkbox");
    input2.style.marginTop = "5px";
    input2.style.boxSizing = "border-box";
    if (editorParams.elementAttributes && typeof editorParams.elementAttributes == "object") {
      for (let key in editorParams.elementAttributes) {
        if (key.charAt(0) == "+") {
          key = key.slice(1);
          input2.setAttribute(key, input2.getAttribute(key) + editorParams.elementAttributes["+" + key]);
        } else {
          input2.setAttribute(key, editorParams.elementAttributes[key]);
        }
      }
    }
    input2.value = value;
    if (tristate && (typeof value === "undefined" || value === indetermValue || value === "")) {
      indetermState = true;
      input2.indeterminate = true;
    }
    if (this.table.browser != "firefox" && this.table.browser != "safari") {
      onRendered(function() {
        if (cell.getType() === "cell") {
          input2.focus({ preventScroll: true });
        }
      });
    }
    input2.checked = trueValueSet ? value === editorParams.trueValue : value === true || value === "true" || value === "True" || value === 1;
    function setValue(blur) {
      var checkedValue = input2.checked;
      if (trueValueSet && checkedValue) {
        checkedValue = editorParams.trueValue;
      } else if (falseValueSet && !checkedValue) {
        checkedValue = editorParams.falseValue;
      }
      if (tristate) {
        if (!blur) {
          if (input2.checked && !indetermState) {
            input2.checked = false;
            input2.indeterminate = true;
            indetermState = true;
            return indetermValue;
          } else {
            indetermState = false;
            return checkedValue;
          }
        } else {
          if (indetermState) {
            return indetermValue;
          } else {
            return checkedValue;
          }
        }
      } else {
        return checkedValue;
      }
    }
    input2.addEventListener("change", function(e) {
      success(setValue());
    });
    input2.addEventListener("blur", function(e) {
      success(setValue(true));
    });
    input2.addEventListener("keydown", function(e) {
      if (e.key == "Enter") {
        success(setValue());
      }
      if (e.key == "Escape") {
        cancel();
      }
    });
    return input2;
  }
  function adaptable$1(cell, onRendered, success, cancel, params) {
    var column = cell._getSelf().column, lookup2, editorFunc, editorParams;
    function defaultLookup(cell2) {
      var value = cell2.getValue(), editor = "input";
      switch (typeof value) {
        case "number":
          editor = "number";
          break;
        case "boolean":
          editor = "tickCross";
          break;
        case "string":
          if (value.includes("\n")) {
            editor = "textarea";
          }
          break;
      }
      return editor;
    }
    lookup2 = params.editorLookup ? params.editorLookup(cell) : defaultLookup(cell);
    if (params.paramsLookup) {
      editorParams = typeof params.paramsLookup === "function" ? params.paramsLookup(lookup2, cell) : params.paramsLookup[lookup2];
    }
    editorFunc = this.table.modules.edit.lookupEditor(lookup2, column);
    return editorFunc.call(this, cell, onRendered, success, cancel, editorParams || {});
  }
  var defaultEditors = {
    input,
    textarea: textarea$1,
    number: number$1,
    range,
    date: date$1,
    time: time$1,
    datetime: datetime$2,
    list,
    star: star$1,
    progress: progress$1,
    tickCross: tickCross$1,
    adaptable: adaptable$1
  };
  var _Edit = class _Edit extends Module {
    constructor(table) {
      super(table);
      this.currentCell = false;
      this.mouseClick = false;
      this.recursionBlock = false;
      this.invalidEdit = false;
      this.editedCells = [];
      this.convertEmptyValues = false;
      this.editors = _Edit.editors;
      this.registerTableOption("editTriggerEvent", "focus");
      this.registerTableOption("editorEmptyValue");
      this.registerTableOption("editorEmptyValueFunc", this.emptyValueCheck.bind(this));
      this.registerColumnOption("editable");
      this.registerColumnOption("editor");
      this.registerColumnOption("editorParams");
      this.registerColumnOption("editorEmptyValue");
      this.registerColumnOption("editorEmptyValueFunc");
      this.registerColumnOption("cellEditing");
      this.registerColumnOption("cellEdited");
      this.registerColumnOption("cellEditCancelled");
      this.registerTableFunction("getEditedCells", this.getEditedCells.bind(this));
      this.registerTableFunction("clearCellEdited", this.clearCellEdited.bind(this));
      this.registerTableFunction("navigatePrev", this.navigatePrev.bind(this));
      this.registerTableFunction("navigateNext", this.navigateNext.bind(this));
      this.registerTableFunction("navigateLeft", this.navigateLeft.bind(this));
      this.registerTableFunction("navigateRight", this.navigateRight.bind(this));
      this.registerTableFunction("navigateUp", this.navigateUp.bind(this));
      this.registerTableFunction("navigateDown", this.navigateDown.bind(this));
      this.registerComponentFunction("cell", "isEdited", this.cellIsEdited.bind(this));
      this.registerComponentFunction("cell", "clearEdited", this.clearEdited.bind(this));
      this.registerComponentFunction("cell", "edit", this.editCell.bind(this));
      this.registerComponentFunction("cell", "cancelEdit", this.cellCancelEdit.bind(this));
      this.registerComponentFunction("cell", "navigatePrev", this.navigatePrev.bind(this));
      this.registerComponentFunction("cell", "navigateNext", this.navigateNext.bind(this));
      this.registerComponentFunction("cell", "navigateLeft", this.navigateLeft.bind(this));
      this.registerComponentFunction("cell", "navigateRight", this.navigateRight.bind(this));
      this.registerComponentFunction("cell", "navigateUp", this.navigateUp.bind(this));
      this.registerComponentFunction("cell", "navigateDown", this.navigateDown.bind(this));
    }
    initialize() {
      this.subscribe("cell-init", this.bindEditor.bind(this));
      this.subscribe("cell-delete", this.clearEdited.bind(this));
      this.subscribe("cell-value-changed", this.updateCellClass.bind(this));
      this.subscribe("column-layout", this.initializeColumnCheck.bind(this));
      this.subscribe("column-delete", this.columnDeleteCheck.bind(this));
      this.subscribe("row-deleting", this.rowDeleteCheck.bind(this));
      this.subscribe("row-layout", this.rowEditableCheck.bind(this));
      this.subscribe("data-refreshing", this.cancelEdit.bind(this));
      this.subscribe("clipboard-paste", this.pasteBlocker.bind(this));
      if (!this.confirm("edit-nav-disabled")) {
        this.subscribe("keybinding-nav-prev", this.navigatePrev.bind(this, void 0));
        this.subscribe("keybinding-nav-next", this.keybindingNavigateNext.bind(this));
        this.subscribe("keybinding-nav-up", this.navigateUp.bind(this, void 0));
        this.subscribe("keybinding-nav-down", this.navigateDown.bind(this, void 0));
      }
      this.subscribe("edit-check-editing", this.checkEditing.bind(this));
      this.subscribe("edit-cancel-cell", this.cancelEditEvent.bind(this));
      if (Object.keys(this.table.options).includes("editorEmptyValue")) {
        this.convertEmptyValues = true;
      }
    }
    ///////////////////////////////////
    ///////// Paste Negation //////////
    ///////////////////////////////////
    pasteBlocker(e) {
      if (this.currentCell) {
        return true;
      }
    }
    ///////////////////////////////////
    ////// Keybinding Functions ///////
    ///////////////////////////////////
    keybindingNavigateNext(e) {
      var cell = this.currentCell, newRow = this.options("tabEndNewRow");
      if (cell) {
        if (!this.navigateNext(cell, e)) {
          if (newRow) {
            cell.getElement().firstChild.blur();
            if (!this.invalidEdit) {
              if (newRow === true) {
                newRow = this.table.addRow({});
              } else {
                if (typeof newRow == "function") {
                  newRow = this.table.addRow(newRow(cell.row.getComponent()));
                } else {
                  newRow = this.table.addRow(Object.assign({}, newRow));
                }
              }
              newRow.then(() => {
                setTimeout(() => {
                  cell.getComponent().navigateNext();
                });
              });
            }
          }
        }
      }
    }
    ///////////////////////////////////
    ///////// Cell Functions //////////
    ///////////////////////////////////
    cellIsEdited(cell) {
      return !!cell.modules.edit && cell.modules.edit.edited;
    }
    cellCancelEdit(cell) {
      if (cell === this.currentCell) {
        this.table.modules.edit.cancelEdit();
      } else {
        console.warn("Cancel Editor Error - This cell is not currently being edited ");
      }
    }
    ///////////////////////////////////
    ///////// Table Functions /////////
    ///////////////////////////////////
    updateCellClass(cell) {
      if (this.allowEdit(cell)) {
        cell.getElement().classList.add("tabulator-editable");
      } else {
        cell.getElement().classList.remove("tabulator-editable");
      }
    }
    clearCellEdited(cells) {
      if (!cells) {
        cells = this.table.modules.edit.getEditedCells();
      }
      if (!Array.isArray(cells)) {
        cells = [cells];
      }
      cells.forEach((cell) => {
        this.table.modules.edit.clearEdited(cell._getSelf());
      });
    }
    navigatePrev(cell = this.currentCell, e) {
      var nextCell, prevRow;
      if (cell) {
        if (e) {
          e.preventDefault();
        }
        nextCell = this.navigateLeft();
        if (nextCell) {
          return true;
        } else {
          prevRow = this.table.rowManager.prevDisplayRow(cell.row, true);
          if (prevRow) {
            nextCell = this.findPrevEditableCell(prevRow, prevRow.cells.length);
            if (nextCell) {
              nextCell.getComponent().edit();
              return true;
            }
          }
        }
      }
      return false;
    }
    navigateNext(cell = this.currentCell, e) {
      var nextCell, nextRow;
      if (cell) {
        if (e) {
          e.preventDefault();
        }
        nextCell = this.navigateRight();
        if (nextCell) {
          return true;
        } else {
          nextRow = this.table.rowManager.nextDisplayRow(cell.row, true);
          if (nextRow) {
            nextCell = this.findNextEditableCell(nextRow, -1);
            if (nextCell) {
              nextCell.getComponent().edit();
              return true;
            }
          }
        }
      }
      return false;
    }
    navigateLeft(cell = this.currentCell, e) {
      var index, nextCell;
      if (cell) {
        if (e) {
          e.preventDefault();
        }
        index = cell.getIndex();
        nextCell = this.findPrevEditableCell(cell.row, index);
        if (nextCell) {
          nextCell.getComponent().edit();
          return true;
        }
      }
      return false;
    }
    navigateRight(cell = this.currentCell, e) {
      var index, nextCell;
      if (cell) {
        if (e) {
          e.preventDefault();
        }
        index = cell.getIndex();
        nextCell = this.findNextEditableCell(cell.row, index);
        if (nextCell) {
          nextCell.getComponent().edit();
          return true;
        }
      }
      return false;
    }
    navigateUp(cell = this.currentCell, e) {
      var index, nextRow;
      if (cell) {
        if (e) {
          e.preventDefault();
        }
        index = cell.getIndex();
        nextRow = this.table.rowManager.prevDisplayRow(cell.row, true);
        if (nextRow) {
          nextRow.cells[index].getComponent().edit();
          return true;
        }
      }
      return false;
    }
    navigateDown(cell = this.currentCell, e) {
      var index, nextRow;
      if (cell) {
        if (e) {
          e.preventDefault();
        }
        index = cell.getIndex();
        nextRow = this.table.rowManager.nextDisplayRow(cell.row, true);
        if (nextRow) {
          nextRow.cells[index].getComponent().edit();
          return true;
        }
      }
      return false;
    }
    findNextEditableCell(row, index) {
      var nextCell = false;
      if (index < row.cells.length - 1) {
        for (var i = index + 1; i < row.cells.length; i++) {
          let cell = row.cells[i];
          if (cell.column.modules.edit && Helpers.elVisible(cell.getElement())) {
            let allowEdit = this.allowEdit(cell);
            if (allowEdit) {
              nextCell = cell;
              break;
            }
          }
        }
      }
      return nextCell;
    }
    findPrevEditableCell(row, index) {
      var prevCell = false;
      if (index > 0) {
        for (var i = index - 1; i >= 0; i--) {
          let cell = row.cells[i];
          if (cell.column.modules.edit && Helpers.elVisible(cell.getElement())) {
            let allowEdit = this.allowEdit(cell);
            if (allowEdit) {
              prevCell = cell;
              break;
            }
          }
        }
      }
      return prevCell;
    }
    ///////////////////////////////////
    ///////// Internal Logic //////////
    ///////////////////////////////////
    initializeColumnCheck(column) {
      if (typeof column.definition.editor !== "undefined") {
        this.initializeColumn(column);
      }
    }
    columnDeleteCheck(column) {
      if (this.currentCell && this.currentCell.column === column) {
        this.cancelEdit();
      }
    }
    rowDeleteCheck(row) {
      if (this.currentCell && this.currentCell.row === row) {
        this.cancelEdit();
      }
    }
    rowEditableCheck(row) {
      row.getCells().forEach((cell) => {
        if (cell.column.modules.edit && typeof cell.column.modules.edit.check === "function") {
          this.updateCellClass(cell);
        }
      });
    }
    //initialize column editor
    initializeColumn(column) {
      var convertEmpty = Object.keys(column.definition).includes("editorEmptyValue");
      var config = {
        editor: false,
        blocked: false,
        check: column.definition.editable,
        params: column.definition.editorParams || {},
        convertEmptyValues: convertEmpty,
        editorEmptyValue: column.definition.editorEmptyValue,
        editorEmptyValueFunc: column.definition.editorEmptyValueFunc
      };
      config.editor = this.lookupEditor(column.definition.editor, column);
      if (config.editor) {
        column.modules.edit = config;
      }
    }
    lookupEditor(editor, column) {
      var editorFunc;
      switch (typeof editor) {
        case "string":
          if (this.editors[editor]) {
            editorFunc = this.editors[editor];
          } else {
            console.warn("Editor Error - No such editor found: ", editor);
          }
          break;
        case "function":
          editorFunc = editor;
          break;
        case "boolean":
          if (editor === true) {
            if (typeof column.definition.formatter !== "function") {
              if (this.editors[column.definition.formatter]) {
                editorFunc = this.editors[column.definition.formatter];
              } else {
                editorFunc = this.editors["input"];
              }
            } else {
              console.warn("Editor Error - Cannot auto lookup editor for a custom formatter: ", column.definition.formatter);
            }
          }
          break;
      }
      return editorFunc;
    }
    getCurrentCell() {
      return this.currentCell ? this.currentCell.getComponent() : false;
    }
    checkEditing() {
      return !!this.currentCell;
    }
    cancelEditEvent() {
      if (this.currentCell) {
        this.cancelEdit();
        return true;
      }
      return false;
    }
    clearEditor(cancel) {
      var cell = this.currentCell, cellEl;
      this.invalidEdit = false;
      if (cell) {
        this.currentCell = false;
        cellEl = cell.getElement();
        this.dispatch("edit-editor-clear", cell, cancel);
        cellEl.classList.remove("tabulator-editing");
        while (cellEl.firstChild) cellEl.removeChild(cellEl.firstChild);
        cell.row.getElement().classList.remove("tabulator-editing");
        cell.table.element.classList.remove("tabulator-editing");
      }
    }
    cancelEdit() {
      if (this.currentCell) {
        var cell = this.currentCell;
        var component = this.currentCell.getComponent();
        this.clearEditor(true);
        cell.setValueActual(cell.getValue());
        cell.cellRendered();
        if (cell.column.definition.editor == "textarea" || cell.column.definition.variableHeight) {
          cell.row.normalizeHeight(true);
        }
        if (cell.column.definition.cellEditCancelled) {
          cell.column.definition.cellEditCancelled.call(this.table, component);
        }
        this.dispatch("edit-cancelled", cell);
        this.dispatchExternal("cellEditCancelled", component);
      }
    }
    //return a formatted value for a cell
    bindEditor(cell) {
      if (cell.column.modules.edit) {
        var self = this, element = cell.getElement(true);
        this.updateCellClass(cell);
        element.setAttribute("tabindex", 0);
        element.addEventListener("mousedown", function(e) {
          if (e.button === 2) {
            e.preventDefault();
          } else {
            self.mouseClick = true;
          }
        });
        if (this.options("editTriggerEvent") === "dblclick") {
          element.addEventListener("dblclick", function(e) {
            if (!element.classList.contains("tabulator-editing")) {
              element.focus({ preventScroll: true });
              self.edit(cell, e, false);
            }
          });
        }
        if (this.options("editTriggerEvent") === "focus" || this.options("editTriggerEvent") === "click") {
          element.addEventListener("click", function(e) {
            if (!element.classList.contains("tabulator-editing")) {
              element.focus({ preventScroll: true });
              self.edit(cell, e, false);
            }
          });
        }
        if (this.options("editTriggerEvent") === "focus") {
          element.addEventListener("focus", function(e) {
            if (!self.recursionBlock) {
              self.edit(cell, e, false);
            }
          });
        }
      }
    }
    focusCellNoEvent(cell, block) {
      this.recursionBlock = true;
      if (!(block && this.table.browser === "ie")) {
        cell.getElement().focus({ preventScroll: true });
      }
      this.recursionBlock = false;
    }
    editCell(cell, forceEdit) {
      this.focusCellNoEvent(cell);
      this.edit(cell, false, forceEdit);
    }
    focusScrollAdjust(cell) {
      if (this.table.rowManager.getRenderMode() == "virtual") {
        var topEdge = this.table.rowManager.element.scrollTop, bottomEdge = this.table.rowManager.element.clientHeight + this.table.rowManager.element.scrollTop, rowEl = cell.row.getElement();
        if (rowEl.offsetTop < topEdge) {
          this.table.rowManager.element.scrollTop -= topEdge - rowEl.offsetTop;
        } else {
          if (rowEl.offsetTop + rowEl.offsetHeight > bottomEdge) {
            this.table.rowManager.element.scrollTop += rowEl.offsetTop + rowEl.offsetHeight - bottomEdge;
          }
        }
        var leftEdge = this.table.rowManager.element.scrollLeft, rightEdge = this.table.rowManager.element.clientWidth + this.table.rowManager.element.scrollLeft, cellEl = cell.getElement();
        if (this.table.modExists("frozenColumns")) {
          leftEdge += parseInt(this.table.modules.frozenColumns.leftMargin || 0);
          rightEdge -= parseInt(this.table.modules.frozenColumns.rightMargin || 0);
        }
        if (this.table.options.renderHorizontal === "virtual") {
          leftEdge -= parseInt(this.table.columnManager.renderer.vDomPadLeft);
          rightEdge -= parseInt(this.table.columnManager.renderer.vDomPadLeft);
        }
        if (cellEl.offsetLeft < leftEdge) {
          this.table.rowManager.element.scrollLeft -= leftEdge - cellEl.offsetLeft;
        } else {
          if (cellEl.offsetLeft + cellEl.offsetWidth > rightEdge) {
            this.table.rowManager.element.scrollLeft += cellEl.offsetLeft + cellEl.offsetWidth - rightEdge;
          }
        }
      }
    }
    allowEdit(cell) {
      var check = cell.column.modules.edit ? true : false;
      if (cell.column.modules.edit) {
        switch (typeof cell.column.modules.edit.check) {
          case "function":
            if (cell.row.initialized) {
              check = cell.column.modules.edit.check(cell.getComponent());
            }
            break;
          case "string":
            check = !!cell.row.data[cell.column.modules.edit.check];
            break;
          case "boolean":
            check = cell.column.modules.edit.check;
            break;
        }
      }
      return check;
    }
    edit(cell, e, forceEdit) {
      var self = this, allowEdit = true, rendered = function() {
      }, element = cell.getElement(), editFinished = false, cellEditor, component, params;
      if (this.currentCell) {
        if (!this.invalidEdit && this.currentCell !== cell) {
          this.cancelEdit();
        }
        return;
      }
      function success(value) {
        if (self.currentCell === cell && !editFinished) {
          var valid = self.chain("edit-success", [cell, value], true, true);
          if (valid === true || self.table.options.validationMode === "highlight") {
            editFinished = true;
            self.clearEditor();
            if (!cell.modules.edit) {
              cell.modules.edit = {};
            }
            cell.modules.edit.edited = true;
            if (self.editedCells.indexOf(cell) == -1) {
              self.editedCells.push(cell);
            }
            value = self.transformEmptyValues(value, cell);
            cell.setValue(value, true);
            return valid === true;
          } else {
            editFinished = true;
            self.invalidEdit = true;
            self.focusCellNoEvent(cell, true);
            rendered();
            setTimeout(() => {
              editFinished = false;
            }, 10);
            return false;
          }
        }
      }
      function cancel() {
        if (self.currentCell === cell && !editFinished) {
          self.cancelEdit();
        }
      }
      function onRendered(callback) {
        rendered = callback;
      }
      if (!cell.column.modules.edit.blocked) {
        allowEdit = this.allowEdit(cell);
        if (allowEdit || forceEdit) {
          if (e) {
            e.stopPropagation();
          }
          self.cancelEdit();
          self.currentCell = cell;
          this.focusScrollAdjust(cell);
          component = cell.getComponent();
          if (this.mouseClick) {
            this.mouseClick = false;
            if (cell.column.definition.cellClick) {
              cell.column.definition.cellClick.call(this.table, e, component);
            }
          }
          if (cell.column.definition.cellEditing) {
            cell.column.definition.cellEditing.call(this.table, component);
          }
          this.dispatch("cell-editing", cell);
          this.dispatchExternal("cellEditing", component);
          params = typeof cell.column.modules.edit.params === "function" ? cell.column.modules.edit.params(component) : cell.column.modules.edit.params;
          cellEditor = cell.column.modules.edit.editor.call(self, component, onRendered, success, cancel, params);
          if (this.currentCell && cellEditor !== false) {
            if (cellEditor instanceof Node) {
              element.classList.add("tabulator-editing");
              cell.row.getElement().classList.add("tabulator-editing");
              cell.table.element.classList.add("tabulator-editing");
              while (element.firstChild) element.removeChild(element.firstChild);
              element.appendChild(cellEditor);
              rendered();
              var children = element.children;
              for (var i = 0; i < children.length; i++) {
                children[i].addEventListener("click", function(e2) {
                  e2.stopPropagation();
                });
              }
            } else {
              console.warn("Edit Error - Editor should return an instance of Node, the editor returned:", cellEditor);
              this.blur(element);
              return false;
            }
          } else {
            this.blur(element);
            return false;
          }
          return true;
        } else {
          this.mouseClick = false;
          this.blur(element);
          return false;
        }
      } else {
        this.mouseClick = false;
        this.blur(element);
        return false;
      }
    }
    emptyValueCheck(value) {
      return value === "" || value === null || typeof value === "undefined";
    }
    transformEmptyValues(value, cell) {
      var mod = cell.column.modules.edit, convert = mod.convertEmptyValues || this.convertEmptyValues, checkFunc;
      if (convert) {
        checkFunc = mod.editorEmptyValueFunc || this.options("editorEmptyValueFunc");
        if (checkFunc && checkFunc(value)) {
          value = mod.convertEmptyValues ? mod.editorEmptyValue : this.options("editorEmptyValue");
        }
      }
      return value;
    }
    blur(element) {
      if (!this.confirm("edit-blur", [element])) {
        element.blur();
      }
    }
    getEditedCells() {
      var output = [];
      this.editedCells.forEach((cell) => {
        output.push(cell.getComponent());
      });
      return output;
    }
    clearEdited(cell) {
      var editIndex;
      if (cell.modules.edit && cell.modules.edit.edited) {
        cell.modules.edit.edited = false;
        this.dispatch("edit-edited-clear", cell);
      }
      editIndex = this.editedCells.indexOf(cell);
      if (editIndex > -1) {
        this.editedCells.splice(editIndex, 1);
      }
    }
  };
  __publicField(_Edit, "moduleName", "edit");
  //load defaults
  __publicField(_Edit, "editors", defaultEditors);
  var Edit2 = _Edit;
  function plaintext(cell, formatterParams, onRendered) {
    return this.emptyToSpace(this.sanitizeHTML(cell.getValue()));
  }
  function html(cell, formatterParams, onRendered) {
    return cell.getValue();
  }
  function textarea(cell, formatterParams, onRendered) {
    cell.getElement().style.whiteSpace = "pre-wrap";
    return this.emptyToSpace(this.sanitizeHTML(cell.getValue()));
  }
  function money(cell, formatterParams, onRendered) {
    var floatVal = parseFloat(cell.getValue()), sign = "", number, integer, decimal, rgx, value;
    var decimalSym = formatterParams.decimal || ".";
    var thousandSym = formatterParams.thousand || ",";
    var negativeSign = formatterParams.negativeSign || "-";
    var symbol = formatterParams.symbol || "";
    var after = !!formatterParams.symbolAfter;
    var precision = typeof formatterParams.precision !== "undefined" ? formatterParams.precision : 2;
    if (Number.isNaN(floatVal)) {
      return this.emptyToSpace(this.sanitizeHTML(cell.getValue()));
    }
    if (floatVal < 0) {
      floatVal = Math.abs(floatVal);
      sign = negativeSign;
    }
    number = precision !== false ? floatVal.toFixed(precision) : floatVal;
    number = String(number).split(".");
    integer = number[0];
    decimal = number.length > 1 ? decimalSym + number[1] : "";
    if (formatterParams.thousand !== false) {
      rgx = /(\d+)(\d{3})/;
      while (rgx.test(integer)) {
        integer = integer.replace(rgx, "$1" + thousandSym + "$2");
      }
    }
    value = integer + decimal;
    if (sign === true) {
      value = "(" + value + ")";
      return after ? value + symbol : symbol + value;
    } else {
      return after ? sign + value + symbol : sign + symbol + value;
    }
  }
  function link(cell, formatterParams, onRendered) {
    var value = cell.getValue(), urlPrefix = formatterParams.urlPrefix || "", download = formatterParams.download, label = value, el = document.createElement("a"), data;
    function labelTraverse(path, data2) {
      var item = path.shift(), value2 = data2[item];
      if (path.length && typeof value2 === "object") {
        return labelTraverse(path, value2);
      }
      return value2;
    }
    if (formatterParams.labelField) {
      data = cell.getData();
      label = labelTraverse(formatterParams.labelField.split(this.table.options.nestedFieldSeparator), data);
    }
    if (formatterParams.label) {
      switch (typeof formatterParams.label) {
        case "string":
          label = formatterParams.label;
          break;
        case "function":
          label = formatterParams.label(cell);
          break;
      }
    }
    if (label) {
      if (formatterParams.urlField) {
        data = cell.getData();
        value = Helpers.retrieveNestedData(this.table.options.nestedFieldSeparator, formatterParams.urlField, data);
      }
      if (formatterParams.url) {
        switch (typeof formatterParams.url) {
          case "string":
            value = formatterParams.url;
            break;
          case "function":
            value = formatterParams.url(cell);
            break;
        }
      }
      el.setAttribute("href", urlPrefix + value);
      if (formatterParams.target) {
        el.setAttribute("target", formatterParams.target);
      }
      if (formatterParams.download) {
        if (typeof download == "function") {
          download = download(cell);
        } else {
          download = download === true ? "" : download;
        }
        el.setAttribute("download", download);
      }
      el.innerHTML = this.emptyToSpace(this.sanitizeHTML(label));
      return el;
    } else {
      return "&nbsp;";
    }
  }
  function image(cell, formatterParams, onRendered) {
    var el = document.createElement("img"), src = cell.getValue();
    if (formatterParams.urlPrefix) {
      src = formatterParams.urlPrefix + cell.getValue();
    }
    if (formatterParams.urlSuffix) {
      src = src + formatterParams.urlSuffix;
    }
    el.setAttribute("src", src);
    switch (typeof formatterParams.height) {
      case "number":
        el.style.height = formatterParams.height + "px";
        break;
      case "string":
        el.style.height = formatterParams.height;
        break;
    }
    switch (typeof formatterParams.width) {
      case "number":
        el.style.width = formatterParams.width + "px";
        break;
      case "string":
        el.style.width = formatterParams.width;
        break;
    }
    el.addEventListener("load", function() {
      cell.getRow().normalizeHeight();
    });
    return el;
  }
  function tickCross(cell, formatterParams, onRendered) {
    var value = cell.getValue(), element = cell.getElement(), empty = formatterParams.allowEmpty, truthy = formatterParams.allowTruthy, trueValueSet = Object.keys(formatterParams).includes("trueValue"), tick = typeof formatterParams.tickElement !== "undefined" ? formatterParams.tickElement : '<svg enable-background="new 0 0 24 24" height="14" width="14" viewBox="0 0 24 24" xml:space="preserve" ><path class="tabulator-tick" clip-rule="evenodd" d="M21.652,3.211c-0.293-0.295-0.77-0.295-1.061,0L9.41,14.34  c-0.293,0.297-0.771,0.297-1.062,0L3.449,9.351C3.304,9.203,3.114,9.13,2.923,9.129C2.73,9.128,2.534,9.201,2.387,9.351  l-2.165,1.946C0.078,11.445,0,11.63,0,11.823c0,0.194,0.078,0.397,0.223,0.544l4.94,5.184c0.292,0.296,0.771,0.776,1.062,1.07  l2.124,2.141c0.292,0.293,0.769,0.293,1.062,0l14.366-14.34c0.293-0.294,0.293-0.777,0-1.071L21.652,3.211z" fill-rule="evenodd"/></svg>', cross = typeof formatterParams.crossElement !== "undefined" ? formatterParams.crossElement : '<svg enable-background="new 0 0 24 24" height="14" width="14"  viewBox="0 0 24 24" xml:space="preserve" ><path class="tabulator-cross" d="M22.245,4.015c0.313,0.313,0.313,0.826,0,1.139l-6.276,6.27c-0.313,0.312-0.313,0.826,0,1.14l6.273,6.272  c0.313,0.313,0.313,0.826,0,1.14l-2.285,2.277c-0.314,0.312-0.828,0.312-1.142,0l-6.271-6.271c-0.313-0.313-0.828-0.313-1.141,0  l-6.276,6.267c-0.313,0.313-0.828,0.313-1.141,0l-2.282-2.28c-0.313-0.313-0.313-0.826,0-1.14l6.278-6.269  c0.313-0.312,0.313-0.826,0-1.14L1.709,5.147c-0.314-0.313-0.314-0.827,0-1.14l2.284-2.278C4.308,1.417,4.821,1.417,5.135,1.73  L11.405,8c0.314,0.314,0.828,0.314,1.141,0.001l6.276-6.267c0.312-0.312,0.826-0.312,1.141,0L22.245,4.015z"/></svg>';
    if (trueValueSet && value === formatterParams.trueValue || !trueValueSet && (truthy && value || (value === true || value === "true" || value === "True" || value === 1 || value === "1"))) {
      element.setAttribute("aria-checked", true);
      return tick || "";
    } else {
      if (empty && (value === "null" || value === "" || value === null || typeof value === "undefined")) {
        element.setAttribute("aria-checked", "mixed");
        return "";
      } else {
        element.setAttribute("aria-checked", false);
        return cross || "";
      }
    }
  }
  function datetime$1(cell, formatterParams, onRendered) {
    var DT = this.table.dependencyRegistry.lookup(["luxon", "DateTime"], "DateTime");
    var inputFormat = formatterParams.inputFormat || "yyyy-MM-dd HH:mm:ss";
    var outputFormat = formatterParams.outputFormat || "dd/MM/yyyy HH:mm:ss";
    var invalid = typeof formatterParams.invalidPlaceholder !== "undefined" ? formatterParams.invalidPlaceholder : "";
    var value = cell.getValue();
    if (typeof DT != "undefined") {
      var newDatetime;
      if (DT.isDateTime(value)) {
        newDatetime = value;
      } else if (inputFormat === "x") {
        newDatetime = DT.fromMillis(value);
      } else if (inputFormat === "iso") {
        newDatetime = DT.fromISO(String(value));
      } else {
        newDatetime = DT.fromFormat(String(value), inputFormat);
      }
      if (newDatetime.isValid) {
        if (formatterParams.timezone) {
          newDatetime = newDatetime.setZone(formatterParams.timezone);
        }
        return newDatetime.toFormat(outputFormat);
      } else {
        if (invalid === true || !value) {
          return value;
        } else if (typeof invalid === "function") {
          return invalid(value);
        } else {
          return invalid;
        }
      }
    } else {
      console.error("Format Error - 'datetime' formatter is dependant on luxon.js");
    }
  }
  function datetimediff(cell, formatterParams, onRendered) {
    var DT = this.table.dependencyRegistry.lookup(["luxon", "DateTime"], "DateTime");
    var inputFormat = formatterParams.inputFormat || "yyyy-MM-dd HH:mm:ss";
    var invalid = typeof formatterParams.invalidPlaceholder !== "undefined" ? formatterParams.invalidPlaceholder : "";
    var suffix = typeof formatterParams.suffix !== "undefined" ? formatterParams.suffix : false;
    var unit = typeof formatterParams.unit !== "undefined" ? formatterParams.unit : "days";
    var humanize = typeof formatterParams.humanize !== "undefined" ? formatterParams.humanize : false;
    var date = typeof formatterParams.date !== "undefined" ? formatterParams.date : DT.now();
    var value = cell.getValue();
    if (typeof DT != "undefined") {
      var newDatetime;
      if (DT.isDateTime(value)) {
        newDatetime = value;
      } else if (inputFormat === "x") {
        newDatetime = DT.fromMillis(value);
      } else if (inputFormat === "iso") {
        newDatetime = DT.fromISO(String(value));
      } else {
        newDatetime = DT.fromFormat(String(value), inputFormat);
      }
      if (newDatetime.isValid) {
        if (humanize) {
          return newDatetime.diff(date, unit).toHuman() + (suffix ? " " + suffix : "");
        } else {
          return parseInt(newDatetime.diff(date, unit)[unit]) + (suffix ? " " + suffix : "");
        }
      } else {
        if (invalid === true) {
          return value;
        } else if (typeof invalid === "function") {
          return invalid(value);
        } else {
          return invalid;
        }
      }
    } else {
      console.error("Format Error - 'datetimediff' formatter is dependant on luxon.js");
    }
  }
  function lookup(cell, formatterParams, onRendered) {
    var value = cell.getValue();
    if (typeof formatterParams[value] === "undefined") {
      console.warn("Missing display value for " + value);
      return value;
    }
    return formatterParams[value];
  }
  function star(cell, formatterParams, onRendered) {
    var value = cell.getValue(), element = cell.getElement(), maxStars = formatterParams && formatterParams.stars ? formatterParams.stars : 5, stars = document.createElement("span"), star2 = document.createElementNS("http://www.w3.org/2000/svg", "svg"), starActive = '<polygon fill="#FFEA00" stroke="#C1AB60" stroke-width="37.6152" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" points="259.216,29.942 330.27,173.919 489.16,197.007 374.185,309.08 401.33,467.31 259.216,392.612 117.104,467.31 144.25,309.08 29.274,197.007 188.165,173.919 "/>', starInactive = '<polygon fill="#D2D2D2" stroke="#686868" stroke-width="37.6152" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" points="259.216,29.942 330.27,173.919 489.16,197.007 374.185,309.08 401.33,467.31 259.216,392.612 117.104,467.31 144.25,309.08 29.274,197.007 188.165,173.919 "/>';
    stars.style.verticalAlign = "middle";
    star2.setAttribute("width", "14");
    star2.setAttribute("height", "14");
    star2.setAttribute("viewBox", "0 0 512 512");
    star2.setAttribute("xml:space", "preserve");
    star2.style.padding = "0 1px";
    value = value && !Number.isNaN(value) ? parseInt(value) : 0;
    value = Math.max(0, Math.min(value, maxStars));
    for (var i = 1; i <= maxStars; i++) {
      var nextStar = star2.cloneNode(true);
      nextStar.innerHTML = i <= value ? starActive : starInactive;
      stars.appendChild(nextStar);
    }
    element.style.whiteSpace = "nowrap";
    element.style.overflow = "hidden";
    element.style.textOverflow = "ellipsis";
    element.setAttribute("aria-label", value);
    return stars;
  }
  function traffic(cell, formatterParams, onRendered) {
    var value = this.sanitizeHTML(cell.getValue()) || 0, el = document.createElement("span"), max = formatterParams && formatterParams.max ? formatterParams.max : 100, min = formatterParams && formatterParams.min ? formatterParams.min : 0, colors = formatterParams && typeof formatterParams.color !== "undefined" ? formatterParams.color : ["red", "orange", "green"], color2 = "#666666", percent, percentValue;
    if (Number.isNaN(value) || typeof cell.getValue() === "undefined") {
      return;
    }
    el.classList.add("tabulator-traffic-light");
    percentValue = parseFloat(value) <= max ? parseFloat(value) : max;
    percentValue = parseFloat(percentValue) >= min ? parseFloat(percentValue) : min;
    percent = (max - min) / 100;
    percentValue = Math.round((percentValue - min) / percent);
    switch (typeof colors) {
      case "string":
        color2 = colors;
        break;
      case "function":
        color2 = colors(value);
        break;
      case "object":
        if (Array.isArray(colors)) {
          var unit = 100 / colors.length;
          var index = Math.floor(percentValue / unit);
          index = Math.min(index, colors.length - 1);
          index = Math.max(index, 0);
          color2 = colors[index];
          break;
        }
    }
    el.style.backgroundColor = color2;
    return el;
  }
  function progress(cell, formatterParams = {}, onRendered) {
    var value = this.sanitizeHTML(cell.getValue()) || 0, element = cell.getElement(), max = formatterParams.max ? formatterParams.max : 100, min = formatterParams.min ? formatterParams.min : 0, legendAlign = formatterParams.legendAlign ? formatterParams.legendAlign : "center", percent, percentValue, color2, legend, legendColor;
    percentValue = parseFloat(value) <= max ? parseFloat(value) : max;
    percentValue = parseFloat(percentValue) >= min ? parseFloat(percentValue) : min;
    percent = (max - min) / 100;
    percentValue = Math.round((percentValue - min) / percent);
    switch (typeof formatterParams.color) {
      case "string":
        color2 = formatterParams.color;
        break;
      case "function":
        color2 = formatterParams.color(value);
        break;
      case "object":
        if (Array.isArray(formatterParams.color)) {
          let unit = 100 / formatterParams.color.length;
          let index = Math.floor(percentValue / unit);
          index = Math.min(index, formatterParams.color.length - 1);
          index = Math.max(index, 0);
          color2 = formatterParams.color[index];
          break;
        }
      default:
        color2 = "#2DC214";
    }
    switch (typeof formatterParams.legend) {
      case "string":
        legend = formatterParams.legend;
        break;
      case "function":
        legend = formatterParams.legend(value);
        break;
      case "boolean":
        legend = value;
        break;
      default:
        legend = false;
    }
    switch (typeof formatterParams.legendColor) {
      case "string":
        legendColor = formatterParams.legendColor;
        break;
      case "function":
        legendColor = formatterParams.legendColor(value);
        break;
      case "object":
        if (Array.isArray(formatterParams.legendColor)) {
          let unit = 100 / formatterParams.legendColor.length;
          let index = Math.floor(percentValue / unit);
          index = Math.min(index, formatterParams.legendColor.length - 1);
          index = Math.max(index, 0);
          legendColor = formatterParams.legendColor[index];
        }
        break;
      default:
        legendColor = "#000";
    }
    element.style.minWidth = "30px";
    element.style.position = "relative";
    element.setAttribute("aria-label", percentValue);
    var barEl = document.createElement("div");
    barEl.style.display = "inline-block";
    barEl.style.width = percentValue + "%";
    barEl.style.backgroundColor = color2;
    barEl.style.height = "100%";
    barEl.setAttribute("data-max", max);
    barEl.setAttribute("data-min", min);
    var barContainer = document.createElement("div");
    barContainer.style.position = "relative";
    barContainer.style.width = "100%";
    barContainer.style.height = "100%";
    if (legend) {
      var legendEl = document.createElement("div");
      legendEl.style.position = "absolute";
      legendEl.style.top = 0;
      legendEl.style.left = 0;
      legendEl.style.textAlign = legendAlign;
      legendEl.style.width = "100%";
      legendEl.style.color = legendColor;
      legendEl.innerHTML = legend;
    }
    onRendered(function() {
      if (!(cell instanceof CellComponent)) {
        var holderEl = document.createElement("div");
        holderEl.style.position = "absolute";
        holderEl.style.top = "4px";
        holderEl.style.bottom = "4px";
        holderEl.style.left = "4px";
        holderEl.style.right = "4px";
        element.appendChild(holderEl);
        element = holderEl;
      }
      element.appendChild(barContainer);
      barContainer.appendChild(barEl);
      if (legend) {
        barContainer.appendChild(legendEl);
      }
    });
    return "";
  }
  function color(cell, formatterParams, onRendered) {
    cell.getElement().style.backgroundColor = this.sanitizeHTML(cell.getValue());
    return "";
  }
  function buttonTick(cell, formatterParams, onRendered) {
    return '<svg enable-background="new 0 0 24 24" height="14" width="14" viewBox="0 0 24 24" xml:space="preserve" ><path fill="#2DC214" clip-rule="evenodd" d="M21.652,3.211c-0.293-0.295-0.77-0.295-1.061,0L9.41,14.34  c-0.293,0.297-0.771,0.297-1.062,0L3.449,9.351C3.304,9.203,3.114,9.13,2.923,9.129C2.73,9.128,2.534,9.201,2.387,9.351  l-2.165,1.946C0.078,11.445,0,11.63,0,11.823c0,0.194,0.078,0.397,0.223,0.544l4.94,5.184c0.292,0.296,0.771,0.776,1.062,1.07  l2.124,2.141c0.292,0.293,0.769,0.293,1.062,0l14.366-14.34c0.293-0.294,0.293-0.777,0-1.071L21.652,3.211z" fill-rule="evenodd"/></svg>';
  }
  function buttonCross(cell, formatterParams, onRendered) {
    return '<svg enable-background="new 0 0 24 24" height="14" width="14" viewBox="0 0 24 24" xml:space="preserve" ><path fill="#CE1515" d="M22.245,4.015c0.313,0.313,0.313,0.826,0,1.139l-6.276,6.27c-0.313,0.312-0.313,0.826,0,1.14l6.273,6.272  c0.313,0.313,0.313,0.826,0,1.14l-2.285,2.277c-0.314,0.312-0.828,0.312-1.142,0l-6.271-6.271c-0.313-0.313-0.828-0.313-1.141,0  l-6.276,6.267c-0.313,0.313-0.828,0.313-1.141,0l-2.282-2.28c-0.313-0.313-0.313-0.826,0-1.14l6.278-6.269  c0.313-0.312,0.313-0.826,0-1.14L1.709,5.147c-0.314-0.313-0.314-0.827,0-1.14l2.284-2.278C4.308,1.417,4.821,1.417,5.135,1.73  L11.405,8c0.314,0.314,0.828,0.314,1.141,0.001l6.276-6.267c0.312-0.312,0.826-0.312,1.141,0L22.245,4.015z"/></svg>';
  }
  function toggle(cell, formatterParams, onRendered) {
    var value = cell.getValue(), size = formatterParams.size || 15, sizePx = size + "px", containEl, switchEl, onValue = formatterParams.hasOwnProperty("onValue") ? formatterParams.onValue : true, offValue = formatterParams.hasOwnProperty("offValue") ? formatterParams.offValue : false, state = formatterParams.onTruthy ? value : value === onValue;
    containEl = document.createElement("div");
    containEl.classList.add("tabulator-toggle");
    if (state) {
      containEl.classList.add("tabulator-toggle-on");
      containEl.style.flexDirection = "row-reverse";
      if (formatterParams.onColor) {
        containEl.style.background = formatterParams.onColor;
      }
    } else {
      if (formatterParams.offColor) {
        containEl.style.background = formatterParams.offColor;
      }
    }
    containEl.style.width = 2.5 * size + "px";
    containEl.style.borderRadius = sizePx;
    if (formatterParams.clickable) {
      containEl.addEventListener("click", (e) => {
        cell.setValue(state ? offValue : onValue);
      });
    }
    switchEl = document.createElement("div");
    switchEl.classList.add("tabulator-toggle-switch");
    switchEl.style.height = sizePx;
    switchEl.style.width = sizePx;
    switchEl.style.borderRadius = sizePx;
    containEl.appendChild(switchEl);
    return containEl;
  }
  function rownum(cell, formatterParams, onRendered) {
    var content = document.createElement("span");
    var row = cell.getRow();
    var table = cell.getTable();
    row.watchPosition((position) => {
      if (formatterParams.relativeToPage) {
        position += table.modules.page.getPageSize() * (table.modules.page.getPage() - 1);
      }
      content.innerText = position;
    });
    return content;
  }
  function handle(cell, formatterParams, onRendered) {
    cell.getElement().classList.add("tabulator-row-handle");
    return "<div class='tabulator-row-handle-box'><div class='tabulator-row-handle-bar'></div><div class='tabulator-row-handle-bar'></div><div class='tabulator-row-handle-bar'></div></div>";
  }
  function adaptable(cell, params, onRendered) {
    var lookup2, formatterFunc, formatterParams;
    function defaultLookup(cell2) {
      var value = cell2.getValue(), formatter = "plaintext";
      switch (typeof value) {
        case "boolean":
          formatter = "tickCross";
          break;
        case "string":
          if (value.includes("\n")) {
            formatter = "textarea";
          }
          break;
      }
      return formatter;
    }
    lookup2 = params.formatterLookup ? params.formatterLookup(cell) : defaultLookup(cell);
    if (params.paramsLookup) {
      formatterParams = typeof params.paramsLookup === "function" ? params.paramsLookup(lookup2, cell) : params.paramsLookup[lookup2];
    }
    formatterFunc = this.table.modules.format.lookupFormatter(lookup2);
    return formatterFunc.call(this, cell, formatterParams || {}, onRendered);
  }
  function array$2(cell, formatterParams, onRendered) {
    var delimiter = formatterParams.delimiter || ",", value = cell.getValue(), table = this.table, valueMap;
    if (formatterParams.valueMap) {
      if (typeof formatterParams.valueMap === "string") {
        valueMap = function(value2) {
          return value2.map((item) => {
            return Helpers.retrieveNestedData(table.options.nestedFieldSeparator, formatterParams.valueMap, item);
          });
        };
      } else {
        valueMap = formatterParams.valueMap;
      }
    }
    if (Array.isArray(value)) {
      if (valueMap) {
        value = valueMap(value);
      }
      return value.join(delimiter);
    } else {
      return value;
    }
  }
  function json$1(cell, formatterParams, onRendered) {
    var indent = formatterParams.indent || "	", multiline = typeof formatterParams.multiline === "undefined" ? true : formatterParams.multiline, replacer = formatterParams.replacer || null, value = cell.getValue();
    if (multiline) {
      cell.getElement().style.whiteSpace = "pre-wrap";
    }
    return JSON.stringify(value, replacer, indent);
  }
  var defaultFormatters = {
    plaintext,
    html,
    textarea,
    money,
    link,
    image,
    tickCross,
    datetime: datetime$1,
    datetimediff,
    lookup,
    star,
    traffic,
    progress,
    color,
    buttonTick,
    buttonCross,
    toggle,
    rownum,
    handle,
    adaptable,
    array: array$2,
    json: json$1
  };
  var _Format = class _Format extends Module {
    constructor(table) {
      super(table);
      this.registerColumnOption("formatter");
      this.registerColumnOption("formatterParams");
      this.registerColumnOption("formatterPrint");
      this.registerColumnOption("formatterPrintParams");
      this.registerColumnOption("formatterClipboard");
      this.registerColumnOption("formatterClipboardParams");
      this.registerColumnOption("formatterHtmlOutput");
      this.registerColumnOption("formatterHtmlOutputParams");
      this.registerColumnOption("titleFormatter");
      this.registerColumnOption("titleFormatterParams");
    }
    initialize() {
      this.subscribe("cell-format", this.formatValue.bind(this));
      this.subscribe("cell-rendered", this.cellRendered.bind(this));
      this.subscribe("column-layout", this.initializeColumn.bind(this));
      this.subscribe("column-format", this.formatHeader.bind(this));
    }
    //initialize column formatter
    initializeColumn(column) {
      column.modules.format = this.lookupTypeFormatter(column, "");
      if (typeof column.definition.formatterPrint !== "undefined") {
        column.modules.format.print = this.lookupTypeFormatter(column, "Print");
      }
      if (typeof column.definition.formatterClipboard !== "undefined") {
        column.modules.format.clipboard = this.lookupTypeFormatter(column, "Clipboard");
      }
      if (typeof column.definition.formatterHtmlOutput !== "undefined") {
        column.modules.format.htmlOutput = this.lookupTypeFormatter(column, "HtmlOutput");
      }
    }
    lookupTypeFormatter(column, type) {
      var config = { params: column.definition["formatter" + type + "Params"] || {} }, formatter = column.definition["formatter" + type];
      config.formatter = this.lookupFormatter(formatter);
      return config;
    }
    lookupFormatter(formatter) {
      var formatterFunc;
      switch (typeof formatter) {
        case "string":
          if (_Format.formatters[formatter]) {
            formatterFunc = _Format.formatters[formatter];
          } else {
            console.warn("Formatter Error - No such formatter found: ", formatter);
            formatterFunc = _Format.formatters.plaintext;
          }
          break;
        case "function":
          formatterFunc = formatter;
          break;
        default:
          formatterFunc = _Format.formatters.plaintext;
          break;
      }
      return formatterFunc;
    }
    cellRendered(cell) {
      if (cell.modules.format && cell.modules.format.renderedCallback && !cell.modules.format.rendered) {
        cell.modules.format.renderedCallback();
        cell.modules.format.rendered = true;
      }
    }
    //return a formatted value for a column header
    formatHeader(column, title, el) {
      var formatter, params, onRendered, mockCell;
      if (column.definition.titleFormatter) {
        formatter = this.lookupFormatter(column.definition.titleFormatter);
        onRendered = (callback) => {
          column.titleFormatterRendered = callback;
        };
        mockCell = {
          getValue: function() {
            return title;
          },
          getElement: function() {
            return el;
          },
          getType: function() {
            return "header";
          },
          getColumn: function() {
            return column.getComponent();
          },
          getTable: () => {
            return this.table;
          }
        };
        params = column.definition.titleFormatterParams || {};
        params = typeof params === "function" ? params() : params;
        return formatter.call(this, mockCell, params, onRendered);
      } else {
        return title;
      }
    }
    //return a formatted value for a cell
    formatValue(cell) {
      var component = cell.getComponent(), params = typeof cell.column.modules.format.params === "function" ? cell.column.modules.format.params(component) : cell.column.modules.format.params;
      function onRendered(callback) {
        if (!cell.modules.format) {
          cell.modules.format = {};
        }
        cell.modules.format.renderedCallback = callback;
        cell.modules.format.rendered = false;
      }
      return cell.column.modules.format.formatter.call(this, component, params, onRendered);
    }
    formatExportValue(cell, type) {
      var formatter = cell.column.modules.format[type], params;
      if (formatter) {
        let onRendered = function(callback) {
          if (!cell.modules.format) {
            cell.modules.format = {};
          }
          cell.modules.format.renderedCallback = callback;
          cell.modules.format.rendered = false;
        };
        params = typeof formatter.params === "function" ? formatter.params(cell.getComponent()) : formatter.params;
        return formatter.formatter.call(this, cell.getComponent(), params, onRendered);
      } else {
        return this.formatValue(cell);
      }
    }
    sanitizeHTML(value) {
      if (value) {
        var entityMap = {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
          "/": "&#x2F;",
          "`": "&#x60;",
          "=": "&#x3D;"
        };
        return String(value).replace(/[&<>"'`=/]/g, function(s) {
          return entityMap[s];
        });
      } else {
        return value;
      }
    }
    emptyToSpace(value) {
      return value === null || typeof value === "undefined" || value === "" ? "&nbsp;" : value;
    }
  };
  __publicField(_Format, "moduleName", "format");
  //load defaults
  __publicField(_Format, "formatters", defaultFormatters);
  var Format = _Format;
  var defaultUndoers = {
    cellEdit: function(action) {
      action.component.setValueProcessData(action.data.oldValue);
      action.component.cellRendered();
    },
    rowAdd: function(action) {
      action.component.deleteActual();
      this.table.rowManager.checkPlaceholder();
    },
    rowDelete: function(action) {
      var newRow = this.table.rowManager.addRowActual(action.data.data, action.data.pos, action.data.index);
      if (this.table.options.groupBy && this.table.modExists("groupRows")) {
        this.table.modules.groupRows.updateGroupRows(true);
      }
      this._rebindRow(action.component, newRow);
      this.table.rowManager.checkPlaceholder();
    },
    rowMove: function(action) {
      var after = action.data.posFrom - action.data.posTo > 0;
      this.table.rowManager.moveRowActual(action.component, this.table.rowManager.getRowFromPosition(action.data.posFrom), after);
      this.table.rowManager.regenerateRowPositions();
      this.table.rowManager.reRenderInPosition();
    }
  };
  var defaultRedoers = {
    cellEdit: function(action) {
      action.component.setValueProcessData(action.data.newValue);
      action.component.cellRendered();
    },
    rowAdd: function(action) {
      var newRow = this.table.rowManager.addRowActual(action.data.data, action.data.pos, action.data.index);
      if (this.table.options.groupBy && this.table.modExists("groupRows")) {
        this.table.modules.groupRows.updateGroupRows(true);
      }
      this._rebindRow(action.component, newRow);
      this.table.rowManager.checkPlaceholder();
    },
    rowDelete: function(action) {
      action.component.deleteActual();
      this.table.rowManager.checkPlaceholder();
    },
    rowMove: function(action) {
      this.table.rowManager.moveRowActual(action.component, this.table.rowManager.getRowFromPosition(action.data.posTo), action.data.after);
      this.table.rowManager.regenerateRowPositions();
      this.table.rowManager.reRenderInPosition();
    }
  };
  var bindings$1 = {
    undo: ["ctrl + 90", "meta + 90"],
    redo: ["ctrl + 89", "meta + 89"]
  };
  var actions$1 = {
    undo: function(e) {
      var cell = false;
      if (this.table.options.history && this.table.modExists("history") && this.table.modExists("edit")) {
        cell = this.table.modules.edit.currentCell;
        if (!cell) {
          e.preventDefault();
          this.table.modules.history.undo();
        }
      }
    },
    redo: function(e) {
      var cell = false;
      if (this.table.options.history && this.table.modExists("history") && this.table.modExists("edit")) {
        cell = this.table.modules.edit.currentCell;
        if (!cell) {
          e.preventDefault();
          this.table.modules.history.redo();
        }
      }
    }
  };
  var extensions$3 = {
    keybindings: {
      bindings: bindings$1,
      actions: actions$1
    }
  };
  var _History = class _History extends Module {
    constructor(table) {
      super(table);
      this.history = [];
      this.index = -1;
      this.registerTableOption("history", false);
    }
    initialize() {
      if (this.table.options.history) {
        this.subscribe("cell-value-updated", this.cellUpdated.bind(this));
        this.subscribe("cell-delete", this.clearComponentHistory.bind(this));
        this.subscribe("row-delete", this.rowDeleted.bind(this));
        this.subscribe("rows-wipe", this.clear.bind(this));
        this.subscribe("row-added", this.rowAdded.bind(this));
        this.subscribe("row-move", this.rowMoved.bind(this));
      }
      this.registerTableFunction("undo", this.undo.bind(this));
      this.registerTableFunction("redo", this.redo.bind(this));
      this.registerTableFunction("getHistoryUndoSize", this.getHistoryUndoSize.bind(this));
      this.registerTableFunction("getHistoryRedoSize", this.getHistoryRedoSize.bind(this));
      this.registerTableFunction("clearHistory", this.clear.bind(this));
    }
    rowMoved(from, to, after) {
      this.action("rowMove", from, { posFrom: from.getPosition(), posTo: to.getPosition(), to, after });
    }
    rowAdded(row, data, pos, index) {
      this.action("rowAdd", row, { data, pos, index });
    }
    rowDeleted(row) {
      var index, rows;
      if (this.table.options.groupBy) {
        rows = row.getComponent().getGroup()._getSelf().rows;
        index = rows.indexOf(row);
        if (index) {
          index = rows[index - 1];
        }
      } else {
        index = row.table.rowManager.getRowIndex(row);
        if (index) {
          index = row.table.rowManager.rows[index - 1];
        }
      }
      this.action("rowDelete", row, { data: row.getData(), pos: !index, index });
    }
    cellUpdated(cell) {
      this.action("cellEdit", cell, { oldValue: cell.oldValue, newValue: cell.value });
    }
    clear() {
      this.history = [];
      this.index = -1;
    }
    action(type, component, data) {
      this.history = this.history.slice(0, this.index + 1);
      this.history.push({
        type,
        component,
        data
      });
      this.index++;
    }
    getHistoryUndoSize() {
      return this.index + 1;
    }
    getHistoryRedoSize() {
      return this.history.length - (this.index + 1);
    }
    clearComponentHistory(component) {
      var index = this.history.findIndex(function(item) {
        return item.component === component;
      });
      if (index > -1) {
        this.history.splice(index, 1);
        if (index <= this.index) {
          this.index--;
        }
        this.clearComponentHistory(component);
      }
    }
    undo() {
      if (this.index > -1) {
        let action = this.history[this.index];
        _History.undoers[action.type].call(this, action);
        this.index--;
        this.dispatchExternal("historyUndo", action.type, action.component.getComponent(), action.data);
        return true;
      } else {
        console.warn(this.options("history") ? "History Undo Error - No more history to undo" : "History module not enabled");
        return false;
      }
    }
    redo() {
      if (this.history.length - 1 > this.index) {
        this.index++;
        let action = this.history[this.index];
        _History.redoers[action.type].call(this, action);
        this.dispatchExternal("historyRedo", action.type, action.component.getComponent(), action.data);
        return true;
      } else {
        console.warn(this.options("history") ? "History Redo Error - No more history to redo" : "History module not enabled");
        return false;
      }
    }
    //rebind rows to new element after deletion
    _rebindRow(oldRow, newRow) {
      this.history.forEach(function(action) {
        if (action.component instanceof Row) {
          if (action.component === oldRow) {
            action.component = newRow;
          }
        } else if (action.component instanceof Cell) {
          if (action.component.row === oldRow) {
            var field = action.component.column.getField();
            if (field) {
              action.component = newRow.getCell(field);
            }
          }
        }
      });
    }
  };
  __publicField(_History, "moduleName", "history");
  __publicField(_History, "moduleExtensions", extensions$3);
  //load defaults
  __publicField(_History, "undoers", defaultUndoers);
  __publicField(_History, "redoers", defaultRedoers);
  var History = _History;
  var Interaction = class extends Module {
    constructor(table) {
      super(table);
      this.eventMap = {
        //row events
        rowClick: "row-click",
        rowDblClick: "row-dblclick",
        rowContext: "row-contextmenu",
        rowMouseEnter: "row-mouseenter",
        rowMouseLeave: "row-mouseleave",
        rowMouseOver: "row-mouseover",
        rowMouseOut: "row-mouseout",
        rowMouseMove: "row-mousemove",
        rowMouseDown: "row-mousedown",
        rowMouseUp: "row-mouseup",
        rowTap: "row",
        rowDblTap: "row",
        rowTapHold: "row",
        //cell events
        cellClick: "cell-click",
        cellDblClick: "cell-dblclick",
        cellContext: "cell-contextmenu",
        cellMouseEnter: "cell-mouseenter",
        cellMouseLeave: "cell-mouseleave",
        cellMouseOver: "cell-mouseover",
        cellMouseOut: "cell-mouseout",
        cellMouseMove: "cell-mousemove",
        cellMouseDown: "cell-mousedown",
        cellMouseUp: "cell-mouseup",
        cellTap: "cell",
        cellDblTap: "cell",
        cellTapHold: "cell",
        //column header events
        headerClick: "column-click",
        headerDblClick: "column-dblclick",
        headerContext: "column-contextmenu",
        headerMouseEnter: "column-mouseenter",
        headerMouseLeave: "column-mouseleave",
        headerMouseOver: "column-mouseover",
        headerMouseOut: "column-mouseout",
        headerMouseMove: "column-mousemove",
        headerMouseDown: "column-mousedown",
        headerMouseUp: "column-mouseup",
        headerTap: "column",
        headerDblTap: "column",
        headerTapHold: "column",
        //group header
        groupClick: "group-click",
        groupDblClick: "group-dblclick",
        groupContext: "group-contextmenu",
        groupMouseEnter: "group-mouseenter",
        groupMouseLeave: "group-mouseleave",
        groupMouseOver: "group-mouseover",
        groupMouseOut: "group-mouseout",
        groupMouseMove: "group-mousemove",
        groupMouseDown: "group-mousedown",
        groupMouseUp: "group-mouseup",
        groupTap: "group",
        groupDblTap: "group",
        groupTapHold: "group"
      };
      this.subscribers = {};
      this.touchSubscribers = {};
      this.columnSubscribers = {};
      this.touchWatchers = {
        row: {
          tap: null,
          tapDbl: null,
          tapHold: null
        },
        cell: {
          tap: null,
          tapDbl: null,
          tapHold: null
        },
        column: {
          tap: null,
          tapDbl: null,
          tapHold: null
        },
        group: {
          tap: null,
          tapDbl: null,
          tapHold: null
        }
      };
      this.registerColumnOption("headerClick");
      this.registerColumnOption("headerDblClick");
      this.registerColumnOption("headerContext");
      this.registerColumnOption("headerMouseEnter");
      this.registerColumnOption("headerMouseLeave");
      this.registerColumnOption("headerMouseOver");
      this.registerColumnOption("headerMouseOut");
      this.registerColumnOption("headerMouseMove");
      this.registerColumnOption("headerMouseDown");
      this.registerColumnOption("headerMouseUp");
      this.registerColumnOption("headerTap");
      this.registerColumnOption("headerDblTap");
      this.registerColumnOption("headerTapHold");
      this.registerColumnOption("cellClick");
      this.registerColumnOption("cellDblClick");
      this.registerColumnOption("cellContext");
      this.registerColumnOption("cellMouseEnter");
      this.registerColumnOption("cellMouseLeave");
      this.registerColumnOption("cellMouseOver");
      this.registerColumnOption("cellMouseOut");
      this.registerColumnOption("cellMouseMove");
      this.registerColumnOption("cellMouseDown");
      this.registerColumnOption("cellMouseUp");
      this.registerColumnOption("cellTap");
      this.registerColumnOption("cellDblTap");
      this.registerColumnOption("cellTapHold");
    }
    initialize() {
      this.initializeExternalEvents();
      this.subscribe("column-init", this.initializeColumn.bind(this));
      this.subscribe("cell-dblclick", this.cellContentsSelectionFixer.bind(this));
      this.subscribe("scroll-horizontal", this.clearTouchWatchers.bind(this));
      this.subscribe("scroll-vertical", this.clearTouchWatchers.bind(this));
    }
    clearTouchWatchers() {
      var types = Object.values(this.touchWatchers);
      types.forEach((type) => {
        clearTimeout(type.tapDbl);
        clearTimeout(type.tapHold);
        for (let key in type) {
          type[key] = null;
        }
      });
    }
    cellContentsSelectionFixer(e, cell) {
      var range2;
      if (this.table.modExists("edit")) {
        if (this.table.modules.edit.currentCell === cell) {
          return;
        }
      }
      e.preventDefault();
      try {
        if (document.selection) {
          range2 = document.body.createTextRange();
          range2.moveToElementText(cell.getElement());
          range2.select();
        } else if (window.getSelection) {
          range2 = document.createRange();
          range2.selectNode(cell.getElement());
          window.getSelection().removeAllRanges();
          window.getSelection().addRange(range2);
        }
      } catch (e2) {
      }
    }
    initializeExternalEvents() {
      for (let key in this.eventMap) {
        this.subscriptionChangeExternal(key, this.subscriptionChanged.bind(this, key));
      }
    }
    subscriptionChanged(key, added) {
      if (added) {
        if (!this.subscribers[key]) {
          if (this.eventMap[key].includes("-")) {
            this.subscribers[key] = this.handle.bind(this, key);
            this.subscribe(this.eventMap[key], this.subscribers[key]);
          } else {
            this.subscribeTouchEvents(key);
          }
        }
      } else {
        if (this.eventMap[key].includes("-")) {
          if (this.subscribers[key] && !this.columnSubscribers[key] && !this.subscribedExternal(key)) {
            this.unsubscribe(this.eventMap[key], this.subscribers[key]);
            delete this.subscribers[key];
          }
        } else {
          this.unsubscribeTouchEvents(key);
        }
      }
    }
    subscribeTouchEvents(key) {
      var type = this.eventMap[key];
      if (!this.touchSubscribers[type + "-touchstart"]) {
        this.touchSubscribers[type + "-touchstart"] = this.handleTouch.bind(this, type, "start");
        this.touchSubscribers[type + "-touchend"] = this.handleTouch.bind(this, type, "end");
        this.subscribe(type + "-touchstart", this.touchSubscribers[type + "-touchstart"]);
        this.subscribe(type + "-touchend", this.touchSubscribers[type + "-touchend"]);
      }
      this.subscribers[key] = true;
    }
    unsubscribeTouchEvents(key) {
      var noTouch = true, type = this.eventMap[key];
      if (this.subscribers[key] && !this.subscribedExternal(key)) {
        delete this.subscribers[key];
        for (let i in this.eventMap) {
          if (this.eventMap[i] === type) {
            if (this.subscribers[i]) {
              noTouch = false;
            }
          }
        }
        if (noTouch) {
          this.unsubscribe(type + "-touchstart", this.touchSubscribers[type + "-touchstart"]);
          this.unsubscribe(type + "-touchend", this.touchSubscribers[type + "-touchend"]);
          delete this.touchSubscribers[type + "-touchstart"];
          delete this.touchSubscribers[type + "-touchend"];
        }
      }
    }
    initializeColumn(column) {
      var def = column.definition;
      for (let key in this.eventMap) {
        if (def[key]) {
          this.subscriptionChanged(key, true);
          if (!this.columnSubscribers[key]) {
            this.columnSubscribers[key] = [];
          }
          this.columnSubscribers[key].push(column);
        }
      }
    }
    handle(action, e, component) {
      this.dispatchEvent(action, e, component);
    }
    handleTouch(type, action, e, component) {
      var watchers = this.touchWatchers[type];
      if (type === "column") {
        type = "header";
      }
      switch (action) {
        case "start":
          watchers.tap = true;
          clearTimeout(watchers.tapHold);
          watchers.tapHold = setTimeout(() => {
            clearTimeout(watchers.tapHold);
            watchers.tapHold = null;
            watchers.tap = null;
            clearTimeout(watchers.tapDbl);
            watchers.tapDbl = null;
            this.dispatchEvent(type + "TapHold", e, component);
          }, 1e3);
          break;
        case "end":
          if (watchers.tap) {
            watchers.tap = null;
            this.dispatchEvent(type + "Tap", e, component);
          }
          if (watchers.tapDbl) {
            clearTimeout(watchers.tapDbl);
            watchers.tapDbl = null;
            this.dispatchEvent(type + "DblTap", e, component);
          } else {
            watchers.tapDbl = setTimeout(() => {
              clearTimeout(watchers.tapDbl);
              watchers.tapDbl = null;
            }, 300);
          }
          clearTimeout(watchers.tapHold);
          watchers.tapHold = null;
          break;
      }
    }
    dispatchEvent(action, e, component) {
      var componentObj = component.getComponent(), callback;
      if (this.columnSubscribers[action]) {
        if (component instanceof Cell) {
          callback = component.column.definition[action];
        } else if (component instanceof Column) {
          callback = component.definition[action];
        }
        if (callback) {
          callback(e, componentObj);
        }
      }
      this.dispatchExternal(action, e, componentObj);
    }
  };
  __publicField(Interaction, "moduleName", "interaction");
  var defaultBindings = {
    navPrev: "shift + 9",
    navNext: 9,
    navUp: 38,
    navDown: 40,
    navLeft: 37,
    navRight: 39,
    scrollPageUp: 33,
    scrollPageDown: 34,
    scrollToStart: 36,
    scrollToEnd: 35
  };
  var defaultActions = {
    keyBlock: function(e) {
      e.stopPropagation();
      e.preventDefault();
    },
    scrollPageUp: function(e) {
      var rowManager = this.table.rowManager, newPos = rowManager.scrollTop - rowManager.element.clientHeight;
      e.preventDefault();
      if (rowManager.displayRowsCount) {
        if (newPos >= 0) {
          rowManager.element.scrollTop = newPos;
        } else {
          rowManager.scrollToRow(rowManager.getDisplayRows()[0]);
        }
      }
      this.table.element.focus();
    },
    scrollPageDown: function(e) {
      var rowManager = this.table.rowManager, newPos = rowManager.scrollTop + rowManager.element.clientHeight, scrollMax = rowManager.element.scrollHeight;
      e.preventDefault();
      if (rowManager.displayRowsCount) {
        if (newPos <= scrollMax) {
          rowManager.element.scrollTop = newPos;
        } else {
          rowManager.scrollToRow(rowManager.getDisplayRows()[rowManager.displayRowsCount - 1]);
        }
      }
      this.table.element.focus();
    },
    scrollToStart: function(e) {
      var rowManager = this.table.rowManager;
      e.preventDefault();
      if (rowManager.displayRowsCount) {
        rowManager.scrollToRow(rowManager.getDisplayRows()[0]);
      }
      this.table.element.focus();
    },
    scrollToEnd: function(e) {
      var rowManager = this.table.rowManager;
      e.preventDefault();
      if (rowManager.displayRowsCount) {
        rowManager.scrollToRow(rowManager.getDisplayRows()[rowManager.displayRowsCount - 1]);
      }
      this.table.element.focus();
    },
    navPrev: function(e) {
      this.dispatch("keybinding-nav-prev", e);
    },
    navNext: function(e) {
      this.dispatch("keybinding-nav-next", e);
    },
    navLeft: function(e) {
      this.dispatch("keybinding-nav-left", e);
    },
    navRight: function(e) {
      this.dispatch("keybinding-nav-right", e);
    },
    navUp: function(e) {
      this.dispatch("keybinding-nav-up", e);
    },
    navDown: function(e) {
      this.dispatch("keybinding-nav-down", e);
    }
  };
  var _Keybindings = class _Keybindings extends Module {
    constructor(table) {
      super(table);
      this.watchKeys = null;
      this.pressedKeys = null;
      this.keyupBinding = false;
      this.keydownBinding = false;
      this.registerTableOption("keybindings", {});
      this.registerTableOption("tabEndNewRow", false);
    }
    initialize() {
      var bindings2 = this.table.options.keybindings, mergedBindings = {};
      this.watchKeys = {};
      this.pressedKeys = [];
      if (bindings2 !== false) {
        Object.assign(mergedBindings, _Keybindings.bindings);
        Object.assign(mergedBindings, bindings2);
        this.mapBindings(mergedBindings);
        this.bindEvents();
      }
      this.subscribe("table-destroy", this.clearBindings.bind(this));
    }
    mapBindings(bindings2) {
      for (let key in bindings2) {
        if (_Keybindings.actions[key]) {
          if (bindings2[key]) {
            if (typeof bindings2[key] !== "object") {
              bindings2[key] = [bindings2[key]];
            }
            bindings2[key].forEach((binding) => {
              var bindingList = Array.isArray(binding) ? binding : [binding];
              bindingList.forEach((item) => {
                this.mapBinding(key, item);
              });
            });
          }
        } else {
          console.warn("Key Binding Error - no such action:", key);
        }
      }
    }
    getKeyCode(e) {
      if (e.key.length === 1) {
        return e.key.toUpperCase().charCodeAt(0);
      }
      var specialKeys = {
        "Enter": 13,
        "Escape": 27,
        "Tab": 9,
        "Backspace": 8,
        "Delete": 46,
        "ArrowUp": 38,
        "ArrowDown": 40,
        "ArrowLeft": 37,
        "ArrowRight": 39,
        "Home": 36,
        "End": 35,
        "PageUp": 33,
        "PageDown": 34,
        "Insert": 45
      };
      return specialKeys[e.key] || e.keyCode || 0;
    }
    mapBinding(action, symbolsList) {
      var binding = {
        action: _Keybindings.actions[action],
        keys: [],
        ctrl: false,
        shift: false,
        meta: false
      };
      var symbols = symbolsList.toString().toLowerCase().split(" ").join("").split("+");
      symbols.forEach((symbol) => {
        switch (symbol) {
          case "ctrl":
            binding.ctrl = true;
            break;
          case "shift":
            binding.shift = true;
            break;
          case "meta":
            binding.meta = true;
            break;
          default:
            symbol = isNaN(symbol) ? symbol.toUpperCase().charCodeAt(0) : parseInt(symbol);
            binding.keys.push(symbol);
            if (!this.watchKeys[symbol]) {
              this.watchKeys[symbol] = [];
            }
            this.watchKeys[symbol].push(binding);
        }
      });
    }
    bindEvents() {
      var self = this;
      this.keyupBinding = function(e) {
        var code = self.getKeyCode(e);
        var bindings2 = self.watchKeys[code];
        if (bindings2) {
          self.pressedKeys.push(code);
          bindings2.forEach(function(binding) {
            self.checkBinding(e, binding);
          });
        }
      };
      this.keydownBinding = function(e) {
        var code = self.getKeyCode(e);
        var bindings2 = self.watchKeys[code];
        if (bindings2) {
          var index = self.pressedKeys.indexOf(code);
          if (index > -1) {
            self.pressedKeys.splice(index, 1);
          }
        }
      };
      this.table.element.addEventListener("keydown", this.keyupBinding);
      this.table.element.addEventListener("keyup", this.keydownBinding);
    }
    clearBindings() {
      if (this.keyupBinding) {
        this.table.element.removeEventListener("keydown", this.keyupBinding);
      }
      if (this.keydownBinding) {
        this.table.element.removeEventListener("keyup", this.keydownBinding);
      }
    }
    checkBinding(e, binding) {
      var match = true;
      if (e.ctrlKey == binding.ctrl && e.shiftKey == binding.shift && e.metaKey == binding.meta) {
        binding.keys.forEach((key) => {
          var index = this.pressedKeys.indexOf(key);
          if (index == -1) {
            match = false;
          }
        });
        if (match) {
          binding.action.call(this, e);
        }
        return true;
      }
      return false;
    }
  };
  __publicField(_Keybindings, "moduleName", "keybindings");
  //load defaults
  __publicField(_Keybindings, "bindings", defaultBindings);
  __publicField(_Keybindings, "actions", defaultActions);
  var Keybindings = _Keybindings;
  var ResizeColumns = class extends Module {
    constructor(table) {
      super(table);
      this.startColumn = false;
      this.startX = false;
      this.startWidth = false;
      this.latestX = false;
      this.handle = null;
      this.initialNextColumn = null;
      this.nextColumn = null;
      this.initialized = false;
      this.registerColumnOption("resizable", true);
      this.registerTableOption("resizableColumnFit", false);
      this.registerTableOption("resizableColumnGuide", false);
    }
    initialize() {
      this.subscribe("column-rendered", this.layoutColumnHeader.bind(this));
    }
    initializeEventWatchers() {
      if (!this.initialized) {
        this.subscribe("cell-rendered", this.layoutCellHandles.bind(this));
        this.subscribe("cell-delete", this.deInitializeComponent.bind(this));
        this.subscribe("cell-height", this.resizeHandle.bind(this));
        this.subscribe("column-moved", this.columnLayoutUpdated.bind(this));
        this.subscribe("column-hide", this.deInitializeColumn.bind(this));
        this.subscribe("column-show", this.columnLayoutUpdated.bind(this));
        this.subscribe("column-width", this.columnWidthUpdated.bind(this));
        this.subscribe("column-delete", this.deInitializeComponent.bind(this));
        this.subscribe("column-height", this.resizeHandle.bind(this));
        this.initialized = true;
      }
    }
    layoutCellHandles(cell) {
      if (cell.row.type === "row") {
        this.deInitializeComponent(cell);
        this.initializeColumn("cell", cell, cell.column, cell.element);
      }
    }
    layoutColumnHeader(column) {
      if (column.definition.resizable) {
        this.initializeEventWatchers();
        this.deInitializeComponent(column);
        this.initializeColumn("header", column, column, column.element);
      }
    }
    columnLayoutUpdated(column) {
      var prev = column.prevColumn();
      this.reinitializeColumn(column);
      if (prev) {
        this.reinitializeColumn(prev);
      }
    }
    columnWidthUpdated(column) {
      if (column.modules.frozen) {
        if (this.table.modules.frozenColumns.leftColumns.includes(column)) {
          this.table.modules.frozenColumns.leftColumns.forEach((col) => {
            this.reinitializeColumn(col);
          });
        } else if (this.table.modules.frozenColumns.rightColumns.includes(column)) {
          this.table.modules.frozenColumns.rightColumns.forEach((col) => {
            this.reinitializeColumn(col);
          });
        }
      }
    }
    frozenColumnOffset(column) {
      var offset = false;
      if (column.modules.frozen) {
        offset = column.modules.frozen.marginValue;
        if (column.modules.frozen.position === "left") {
          offset += column.getWidth() - 3;
        } else {
          if (offset) {
            offset -= 3;
          }
        }
      }
      return offset !== false ? offset + "px" : false;
    }
    reinitializeColumn(column) {
      var frozenOffset = this.frozenColumnOffset(column);
      column.cells.forEach((cell) => {
        if (cell.modules.resize && cell.modules.resize.handleEl) {
          if (frozenOffset) {
            cell.modules.resize.handleEl.style[column.modules.frozen.position] = frozenOffset;
            cell.modules.resize.handleEl.style["z-index"] = 11;
          }
          cell.element.after(cell.modules.resize.handleEl);
        }
      });
      if (column.modules.resize && column.modules.resize.handleEl) {
        if (frozenOffset) {
          column.modules.resize.handleEl.style[column.modules.frozen.position] = frozenOffset;
        }
        column.element.after(column.modules.resize.handleEl);
      }
    }
    initializeColumn(type, component, column, element) {
      var self = this, variableHeight = false, mode = column.definition.resizable, config = {}, nearestColumn = column.getLastColumn();
      if (type === "header") {
        variableHeight = column.definition.formatter == "textarea" || column.definition.variableHeight;
        config = { variableHeight };
      }
      if ((mode === true || mode == type) && this._checkResizability(nearestColumn)) {
        var handle2 = document.createElement("span");
        handle2.className = "tabulator-col-resize-handle";
        handle2.addEventListener("click", function(e) {
          e.stopPropagation();
        });
        var handleDown = function(e) {
          self.startColumn = column;
          self.initialNextColumn = self.nextColumn = nearestColumn.nextColumn();
          self._mouseDown(e, nearestColumn, handle2);
        };
        handle2.addEventListener("mousedown", handleDown);
        handle2.addEventListener("touchstart", handleDown, { passive: true });
        handle2.addEventListener("dblclick", (e) => {
          var oldWidth = nearestColumn.getWidth();
          e.stopPropagation();
          nearestColumn.reinitializeWidth(true);
          if (oldWidth !== nearestColumn.getWidth()) {
            self.dispatch("column-resized", nearestColumn);
            self.dispatchExternal("columnResized", nearestColumn.getComponent());
          }
        });
        if (column.modules.frozen) {
          handle2.style.position = "sticky";
          handle2.style[column.modules.frozen.position] = this.frozenColumnOffset(column);
        }
        config.handleEl = handle2;
        if (element.parentNode && column.visible) {
          element.after(handle2);
        }
      }
      component.modules.resize = config;
    }
    deInitializeColumn(column) {
      this.deInitializeComponent(column);
      column.cells.forEach((cell) => {
        this.deInitializeComponent(cell);
      });
    }
    deInitializeComponent(component) {
      var handleEl;
      if (component.modules.resize) {
        handleEl = component.modules.resize.handleEl;
        if (handleEl && handleEl.parentElement) {
          handleEl.parentElement.removeChild(handleEl);
        }
      }
    }
    resizeHandle(component, height) {
      if (component.modules.resize && component.modules.resize.handleEl) {
        component.modules.resize.handleEl.style.height = height;
      }
    }
    getResizingClientX(e) {
      if (typeof e.clientX !== "undefined") return e.clientX;
      const touch = this.table.options.resizableColumnGuide ? e.changedTouches?.[0] : e.touches?.[0];
      return touch?.clientX;
    }
    resize(e, column) {
      var x = this.getResizingClientX(e);
      if (typeof x !== "number" || !isFinite(x)) {
        console.warn("ResizeColumns: could not resolve pointer X from event", e);
        return;
      }
      var startDiff = x - this.startX, moveDiff = x - this.latestX, blockedBefore, blockedAfter;
      this.latestX = x;
      if (this.table.rtl) {
        startDiff = -startDiff;
        moveDiff = -moveDiff;
      }
      blockedBefore = column.width == column.minWidth || column.width == column.maxWidth;
      column.setWidth(this.startWidth + startDiff);
      blockedAfter = column.width == column.minWidth || column.width == column.maxWidth;
      if (moveDiff < 0) {
        this.nextColumn = this.initialNextColumn;
      }
      if (this.table.options.resizableColumnFit && this.nextColumn && !(blockedBefore && blockedAfter)) {
        let colWidth = this.nextColumn.getWidth();
        if (moveDiff > 0) {
          if (colWidth <= this.nextColumn.minWidth) {
            this.nextColumn = this.nextColumn.nextColumn();
          }
        }
        if (this.nextColumn) {
          this.nextColumn.setWidth(this.nextColumn.getWidth() - moveDiff);
        }
      }
      this.table.columnManager.rerenderColumns(true);
      if (!this.table.browserSlow && column.modules.resize && column.modules.resize.variableHeight) {
        column.checkCellHeights();
      }
    }
    calcGuidePosition(e, column, handle2) {
      var mouseX = typeof e.clientX === "undefined" ? e.touches[0].clientX : e.clientX, handleX = handle2.getBoundingClientRect().x - this.table.element.getBoundingClientRect().x, tableX = this.table.element.getBoundingClientRect().x, columnX = column.element.getBoundingClientRect().left - tableX, mouseDiff = mouseX - this.startX, pos = Math.max(handleX + mouseDiff, columnX + column.minWidth);
      if (column.maxWidth) {
        pos = Math.min(pos, columnX + column.maxWidth);
      }
      return pos;
    }
    _checkResizability(column) {
      return column.definition.resizable;
    }
    _mouseDown(e, column, handle2) {
      var self = this, guideEl;
      this.dispatchExternal("columnResizing", column.getComponent());
      if (self.table.options.resizableColumnGuide) {
        guideEl = document.createElement("span");
        guideEl.classList.add("tabulator-col-resize-guide");
        self.table.element.appendChild(guideEl);
        setTimeout(() => {
          guideEl.style.left = self.calcGuidePosition(e, column, handle2) + "px";
        });
      }
      self.table.element.classList.add("tabulator-block-select");
      function mouseMove(e2) {
        if (self.table.options.resizableColumnGuide) {
          guideEl.style.left = self.calcGuidePosition(e2, column, handle2) + "px";
        } else {
          self.resize(e2, column);
        }
      }
      function mouseUp(e2) {
        if (self.table.options.resizableColumnGuide) {
          self.resize(e2, column);
          guideEl.remove();
        }
        if (self.startColumn.modules.edit) {
          self.startColumn.modules.edit.blocked = false;
        }
        if (self.table.browserSlow && column.modules.resize && column.modules.resize.variableHeight) {
          column.checkCellHeights();
        }
        document.body.removeEventListener("mouseup", mouseUp);
        document.body.removeEventListener("mousemove", mouseMove);
        handle2.removeEventListener("touchmove", mouseMove);
        handle2.removeEventListener("touchend", mouseUp);
        self.table.element.classList.remove("tabulator-block-select");
        if (self.startWidth !== column.getWidth()) {
          self.table.columnManager.verticalAlignHeaders();
          self.dispatch("column-resized", column);
          self.dispatchExternal("columnResized", column.getComponent());
        }
      }
      e.stopPropagation();
      if (self.startColumn.modules.edit) {
        self.startColumn.modules.edit.blocked = true;
      }
      self.startX = typeof e.clientX === "undefined" ? e.touches[0].clientX : e.clientX;
      self.latestX = self.startX;
      self.startWidth = column.getWidth();
      document.body.addEventListener("mousemove", mouseMove);
      document.body.addEventListener("mouseup", mouseUp);
      handle2.addEventListener("touchmove", mouseMove, { passive: true });
      handle2.addEventListener("touchend", mouseUp);
    }
  };
  __publicField(ResizeColumns, "moduleName", "resizeColumns");
  var ResizeRows = class extends Module {
    constructor(table) {
      super(table);
      this.startColumn = false;
      this.startY = false;
      this.startHeight = false;
      this.handle = null;
      this.prevHandle = null;
      this.registerTableOption("resizableRows", false);
      this.registerTableOption("resizableRowGuide", false);
    }
    initialize() {
      if (this.table.options.resizableRows) {
        this.subscribe("row-layout-after", this.initializeRow.bind(this));
      }
    }
    initializeRow(row) {
      var self = this, rowEl = row.getElement();
      var handle2 = document.createElement("div");
      handle2.className = "tabulator-row-resize-handle";
      var prevHandle = document.createElement("div");
      prevHandle.className = "tabulator-row-resize-handle prev";
      handle2.addEventListener("click", function(e) {
        e.stopPropagation();
      });
      var handleDown = function(e) {
        self.startRow = row;
        self._mouseDown(e, row, handle2);
      };
      handle2.addEventListener("mousedown", handleDown);
      handle2.addEventListener("touchstart", handleDown, { passive: true });
      prevHandle.addEventListener("click", function(e) {
        e.stopPropagation();
      });
      var prevHandleDown = function(e) {
        var prevRow = self.table.rowManager.prevDisplayRow(row);
        if (prevRow) {
          self.startRow = prevRow;
          self._mouseDown(e, prevRow, prevHandle);
        }
      };
      prevHandle.addEventListener("mousedown", prevHandleDown);
      prevHandle.addEventListener("touchstart", prevHandleDown, { passive: true });
      rowEl.appendChild(handle2);
      rowEl.appendChild(prevHandle);
    }
    resize(e, row) {
      row.setHeight(this.startHeight + ((typeof e.screenY === "undefined" ? e.touches[0].screenY : e.screenY) - this.startY));
    }
    calcGuidePosition(e, row, handle2) {
      var mouseY = typeof e.screenY === "undefined" ? e.touches[0].screenY : e.screenY, handleY = handle2.getBoundingClientRect().y - this.table.element.getBoundingClientRect().y, tableY = this.table.element.getBoundingClientRect().y, rowY = row.element.getBoundingClientRect().top - tableY, mouseDiff = mouseY - this.startY;
      return Math.max(handleY + mouseDiff, rowY);
    }
    _mouseDown(e, row, handle2) {
      var self = this, guideEl;
      self.dispatchExternal("rowResizing", row.getComponent());
      if (self.table.options.resizableRowGuide) {
        guideEl = document.createElement("span");
        guideEl.classList.add("tabulator-row-resize-guide");
        self.table.element.appendChild(guideEl);
        setTimeout(() => {
          guideEl.style.top = self.calcGuidePosition(e, row, handle2) + "px";
        });
      }
      self.table.element.classList.add("tabulator-block-select");
      function mouseMove(e2) {
        if (self.table.options.resizableRowGuide) {
          guideEl.style.top = self.calcGuidePosition(e2, row, handle2) + "px";
        } else {
          self.resize(e2, row);
        }
      }
      function mouseUp(e2) {
        if (self.table.options.resizableRowGuide) {
          self.resize(e2, row);
          guideEl.remove();
        }
        document.body.removeEventListener("mouseup", mouseMove);
        document.body.removeEventListener("mousemove", mouseMove);
        handle2.removeEventListener("touchmove", mouseMove);
        handle2.removeEventListener("touchend", mouseUp);
        self.table.element.classList.remove("tabulator-block-select");
        self.dispatchExternal("rowResized", row.getComponent());
      }
      e.stopPropagation();
      self.startY = typeof e.screenY === "undefined" ? e.touches[0].screenY : e.screenY;
      self.startHeight = row.getHeight();
      document.body.addEventListener("mousemove", mouseMove);
      document.body.addEventListener("mouseup", mouseUp);
      handle2.addEventListener("touchmove", mouseMove, { passive: true });
      handle2.addEventListener("touchend", mouseUp);
    }
  };
  __publicField(ResizeRows, "moduleName", "resizeRows");
  var RangeComponent = class {
    constructor(range2) {
      this._range = range2;
      return new Proxy(this, {
        get: function(target, name, receiver) {
          if (typeof target[name] !== "undefined") {
            return target[name];
          } else {
            return target._range.table.componentFunctionBinder.handle("range", target._range, name);
          }
        }
      });
    }
    getElement() {
      return this._range.element;
    }
    getData() {
      return this._range.getData();
    }
    getCells() {
      return this._range.getCells(true, true);
    }
    getStructuredCells() {
      return this._range.getStructuredCells();
    }
    getRows() {
      return this._range.getRows().map((row) => row.getComponent());
    }
    getColumns() {
      return this._range.getColumns().map((column) => column.getComponent());
    }
    getBounds() {
      return this._range.getBounds();
    }
    getTopEdge() {
      return this._range.top;
    }
    getBottomEdge() {
      return this._range.bottom;
    }
    getLeftEdge() {
      return this._range.left;
    }
    getRightEdge() {
      return this._range.right;
    }
    setBounds(start, end) {
      if (this._range.destroyedGuard("setBounds")) {
        this._range.setBounds(start ? start._cell : start, end ? end._cell : end);
      }
    }
    setStartBound(start) {
      if (this._range.destroyedGuard("setStartBound")) {
        this._range.setEndBound(start ? start._cell : start);
        this._range.rangeManager.layoutElement();
      }
    }
    setEndBound(end) {
      if (this._range.destroyedGuard("setEndBound")) {
        this._range.setEndBound(end ? end._cell : end);
        this._range.rangeManager.layoutElement();
      }
    }
    clearValues() {
      if (this._range.destroyedGuard("clearValues")) {
        this._range.clearValues();
      }
    }
    remove() {
      if (this._range.destroyedGuard("remove")) {
        this._range.destroy(true);
      }
    }
  };
  var Range = class extends CoreFeature {
    constructor(table, rangeManager, start, end) {
      super(table);
      this.rangeManager = rangeManager;
      this.element = null;
      this.initialized = false;
      this.initializing = {
        start: false,
        end: false
      };
      this.destroyed = false;
      this.top = 0;
      this.bottom = 0;
      this.left = 0;
      this.right = 0;
      this.table = table;
      this.start = { row: void 0, col: void 0 };
      this.end = { row: void 0, col: void 0 };
      if (this.rangeManager.rowHeader) {
        this.left = 1;
        this.right = 1;
        this.start.col = 1;
        this.end.col = 1;
      }
      this.initElement();
      setTimeout(() => {
        this.initBounds(start, end);
      });
    }
    initElement() {
      this.element = document.createElement("div");
      this.element.classList.add("tabulator-range");
    }
    initBounds(start, end) {
      this._updateMinMax();
      if (start) {
        this.setBounds(start, end || start);
      }
    }
    ///////////////////////////////////
    ///////   Boundary Setup    ///////
    ///////////////////////////////////
    setStart(row, col) {
      if (this.start.row !== row || this.start.col !== col) {
        this.start.row = row;
        this.start.col = col;
        this.initializing.start = true;
        this._updateMinMax();
      }
    }
    setEnd(row, col) {
      if (this.end.row !== row || this.end.col !== col) {
        this.end.row = row;
        this.end.col = col;
        this.initializing.end = true;
        this._updateMinMax();
      }
    }
    setBounds(start, end, visibleRows) {
      if (start) {
        this.setStartBound(start);
      }
      this.setEndBound(end || start);
      this.rangeManager.layoutElement(visibleRows);
    }
    setStartBound(element) {
      var row, col;
      if (element.type === "column") {
        if (this.rangeManager.columnSelection) {
          this.setStart(0, element.getPosition() - 1);
        }
      } else {
        row = element.row.position - 1;
        col = element.column.getPosition() - 1;
        if (element.column === this.rangeManager.rowHeader) {
          this.setStart(row, 1);
        } else {
          this.setStart(row, col);
        }
      }
    }
    setEndBound(element) {
      var rowsCount = this._getTableRows().length, row, col, isRowHeader;
      if (element.type === "column") {
        if (this.rangeManager.columnSelection) {
          if (this.rangeManager.selecting === "column") {
            this.setEnd(rowsCount - 1, element.getPosition() - 1);
          } else if (this.rangeManager.selecting === "cell") {
            this.setEnd(0, element.getPosition() - 1);
          }
        }
      } else {
        row = element.row.position - 1;
        col = element.column.getPosition() - 1;
        isRowHeader = element.column === this.rangeManager.rowHeader;
        if (this.rangeManager.selecting === "row") {
          this.setEnd(row, this._getTableColumns().length - 1);
        } else if (this.rangeManager.selecting !== "row" && isRowHeader) {
          this.setEnd(row, 0);
        } else if (this.rangeManager.selecting === "column") {
          this.setEnd(rowsCount - 1, col);
        } else {
          this.setEnd(row, col);
        }
      }
    }
    _updateMinMax() {
      this.top = Math.min(this.start.row, this.end.row);
      this.bottom = Math.max(this.start.row, this.end.row);
      this.left = Math.min(this.start.col, this.end.col);
      this.right = Math.max(this.start.col, this.end.col);
      if (this.initialized) {
        this.dispatchExternal("rangeChanged", this.getComponent());
      } else {
        if (this.initializing.start && this.initializing.end) {
          this.initialized = true;
          this.dispatchExternal("rangeAdded", this.getComponent());
        }
      }
    }
    _getTableColumns() {
      return this.table.columnManager.getVisibleColumnsByIndex();
    }
    _getTableRows() {
      return this.table.rowManager.getDisplayRows().filter((row) => row.type === "row");
    }
    ///////////////////////////////////
    ///////      Rendering      ///////
    ///////////////////////////////////
    layout() {
      var _vDomTop = this.table.rowManager.renderer.vDomTop, _vDomBottom = this.table.rowManager.renderer.vDomBottom, _vDomLeft = this.table.columnManager.renderer.leftCol, _vDomRight = this.table.columnManager.renderer.rightCol, top, bottom, left, right, topLeftCell, bottomRightCell, topLeftCellEl, bottomRightCellEl, topLeftRowEl, bottomRightRowEl;
      if (this.table.options.renderHorizontal === "virtual" && this.rangeManager.rowHeader) {
        _vDomRight += 1;
      }
      if (_vDomTop == null) {
        _vDomTop = 0;
      }
      if (_vDomBottom == null) {
        _vDomBottom = Infinity;
      }
      if (_vDomLeft == null) {
        _vDomLeft = 0;
      }
      if (_vDomRight == null) {
        _vDomRight = Infinity;
      }
      if (this.overlaps(_vDomLeft, _vDomTop, _vDomRight, _vDomBottom)) {
        top = Math.max(this.top, _vDomTop);
        bottom = Math.min(this.bottom, _vDomBottom);
        left = Math.max(this.left, _vDomLeft);
        right = Math.min(this.right, _vDomRight);
        topLeftCell = this.rangeManager.getCell(top, left);
        bottomRightCell = this.rangeManager.getCell(bottom, right);
        topLeftCellEl = topLeftCell.getElement();
        bottomRightCellEl = bottomRightCell.getElement();
        topLeftRowEl = topLeftCell.row.getElement();
        bottomRightRowEl = bottomRightCell.row.getElement();
        this.element.classList.add("tabulator-range-active");
        if (this.table.rtl) {
          this.element.style.right = topLeftRowEl.offsetWidth - topLeftCellEl.offsetLeft - topLeftCellEl.offsetWidth + "px";
          this.element.style.width = topLeftCellEl.offsetLeft + topLeftCellEl.offsetWidth - bottomRightCellEl.offsetLeft + "px";
        } else {
          this.element.style.left = topLeftRowEl.offsetLeft + topLeftCellEl.offsetLeft + "px";
          this.element.style.width = bottomRightCellEl.offsetLeft + bottomRightCellEl.offsetWidth - topLeftCellEl.offsetLeft + "px";
        }
        this.element.style.top = topLeftRowEl.offsetTop + "px";
        this.element.style.height = bottomRightRowEl.offsetTop + bottomRightRowEl.offsetHeight - topLeftRowEl.offsetTop + "px";
      }
    }
    atTopLeft(cell) {
      return cell.row.position - 1 === this.top && cell.column.getPosition() - 1 === this.left;
    }
    atBottomRight(cell) {
      return cell.row.position - 1 === this.bottom && cell.column.getPosition() - 1 === this.right;
    }
    occupies(cell) {
      return this.occupiesRow(cell.row) && this.occupiesColumn(cell.column);
    }
    occupiesRow(row) {
      return this.top <= row.position - 1 && row.position - 1 <= this.bottom;
    }
    occupiesColumn(col) {
      return this.left <= col.getPosition() - 1 && col.getPosition() - 1 <= this.right;
    }
    overlaps(left, top, right, bottom) {
      if (this.left > right || left > this.right || (this.top > bottom || top > this.bottom)) {
        return false;
      }
      return true;
    }
    getData() {
      var data = [], rows = this.getRows(), columns = this.getColumns();
      rows.forEach((row) => {
        var rowData = row.getData(), result = {};
        columns.forEach((column) => {
          result[column.field] = rowData[column.field];
        });
        data.push(result);
      });
      return data;
    }
    getCells(structured, component) {
      var cells = [], rows = this.getRows(), columns = this.getColumns();
      if (structured) {
        cells = rows.map((row) => {
          var arr = [];
          row.getCells().forEach((cell) => {
            if (columns.includes(cell.column)) {
              arr.push(component ? cell.getComponent() : cell);
            }
          });
          return arr;
        });
      } else {
        rows.forEach((row) => {
          row.getCells().forEach((cell) => {
            if (columns.includes(cell.column)) {
              cells.push(component ? cell.getComponent() : cell);
            }
          });
        });
      }
      return cells;
    }
    getStructuredCells() {
      return this.getCells(true, true);
    }
    getRows() {
      return this._getTableRows().slice(this.top, this.bottom + 1);
    }
    getColumns() {
      return this._getTableColumns().slice(this.left, this.right + 1);
    }
    clearValues() {
      var cells = this.getCells();
      var clearValue = this.table.options.selectableRangeClearCellsValue;
      this.table.blockRedraw();
      cells.forEach((cell) => {
        cell.setValue(clearValue);
      });
      this.table.restoreRedraw();
    }
    getBounds(component) {
      var cells = this.getCells(false, component), output = {
        start: null,
        end: null
      };
      if (cells.length) {
        output.start = cells[0];
        output.end = cells[cells.length - 1];
      } else {
        console.warn("No bounds defined on range");
      }
      return output;
    }
    getComponent() {
      if (!this.component) {
        this.component = new RangeComponent(this);
      }
      return this.component;
    }
    destroy(notify) {
      this.destroyed = true;
      this.element.remove();
      if (notify) {
        this.rangeManager.rangeRemoved(this);
      }
      if (this.initialized) {
        this.dispatchExternal("rangeRemoved", this.getComponent());
      }
    }
    destroyedGuard(func) {
      if (this.destroyed) {
        console.warn("You cannot call the " + func + " function on a destroyed range");
      }
      return !this.destroyed;
    }
  };
  var bindings = {
    rangeJumpUp: ["ctrl + 38", "meta + 38"],
    rangeJumpDown: ["ctrl + 40", "meta + 40"],
    rangeJumpLeft: ["ctrl + 37", "meta + 37"],
    rangeJumpRight: ["ctrl + 39", "meta + 39"],
    rangeExpandUp: "shift + 38",
    rangeExpandDown: "shift + 40",
    rangeExpandLeft: "shift + 37",
    rangeExpandRight: "shift + 39",
    rangeExpandJumpUp: ["ctrl + shift + 38", "meta + shift + 38"],
    rangeExpandJumpDown: ["ctrl + shift + 40", "meta + shift + 40"],
    rangeExpandJumpLeft: ["ctrl + shift + 37", "meta + shift + 37"],
    rangeExpandJumpRight: ["ctrl + shift + 39", "meta + shift + 39"]
  };
  var actions = {
    rangeJumpLeft: function(e) {
      this.dispatch("keybinding-nav-range", e, "left", true, false);
    },
    rangeJumpRight: function(e) {
      this.dispatch("keybinding-nav-range", e, "right", true, false);
    },
    rangeJumpUp: function(e) {
      this.dispatch("keybinding-nav-range", e, "up", true, false);
    },
    rangeJumpDown: function(e) {
      this.dispatch("keybinding-nav-range", e, "down", true, false);
    },
    rangeExpandLeft: function(e) {
      this.dispatch("keybinding-nav-range", e, "left", false, true);
    },
    rangeExpandRight: function(e) {
      this.dispatch("keybinding-nav-range", e, "right", false, true);
    },
    rangeExpandUp: function(e) {
      this.dispatch("keybinding-nav-range", e, "up", false, true);
    },
    rangeExpandDown: function(e) {
      this.dispatch("keybinding-nav-range", e, "down", false, true);
    },
    rangeExpandJumpLeft: function(e) {
      this.dispatch("keybinding-nav-range", e, "left", true, true);
    },
    rangeExpandJumpRight: function(e) {
      this.dispatch("keybinding-nav-range", e, "right", true, true);
    },
    rangeExpandJumpUp: function(e) {
      this.dispatch("keybinding-nav-range", e, "up", true, true);
    },
    rangeExpandJumpDown: function(e) {
      this.dispatch("keybinding-nav-range", e, "down", true, true);
    }
  };
  var pasteActions = {
    range: function(data) {
      var rows = [], range2 = this.table.modules.selectRange.activeRange, singleCell = false, bounds, startCell, startRow, rowWidth, dataLength;
      dataLength = data.length;
      if (range2) {
        bounds = range2.getBounds();
        startCell = bounds.start;
        if (bounds.start === bounds.end) {
          singleCell = true;
        }
        if (startCell) {
          rows = this.table.rowManager.activeRows.slice();
          startRow = rows.indexOf(startCell.row);
          if (singleCell) {
            rowWidth = data.length;
          } else {
            rowWidth = rows.indexOf(bounds.end.row) - startRow + 1;
          }
          if (startRow > -1) {
            this.table.blockRedraw();
            rows = rows.slice(startRow, startRow + rowWidth);
            rows.forEach((row, i) => {
              row.updateData(data[i % dataLength]);
            });
            this.table.restoreRedraw();
          }
        }
      }
      return rows;
    }
  };
  var pasteParsers = {
    range: function(clipboard) {
      var data = [], rows = [], range2 = this.table.modules.selectRange.activeRange, singleCell = false, bounds, startCell, colWidth, columnMap, startCol;
      if (range2) {
        bounds = range2.getBounds();
        startCell = bounds.start;
        if (bounds.start === bounds.end) {
          singleCell = true;
        }
        if (startCell) {
          clipboard = clipboard.split("\n");
          clipboard.forEach(function(row) {
            data.push(row.split("	"));
          });
          if (data.length) {
            columnMap = this.table.columnManager.getVisibleColumnsByIndex();
            startCol = columnMap.indexOf(startCell.column);
            if (startCol > -1) {
              if (singleCell) {
                colWidth = data[0].length;
              } else {
                colWidth = columnMap.indexOf(bounds.end.column) - startCol + 1;
              }
              columnMap = columnMap.slice(startCol, startCol + colWidth);
              data.forEach((item) => {
                var row = {};
                var itemLength = item.length;
                columnMap.forEach(function(col, i) {
                  row[col.field] = item[i % itemLength];
                });
                rows.push(row);
              });
              return rows;
            }
          }
        }
      }
      return false;
    }
  };
  var columnLookups = {
    range: function() {
      var columns = this.modules.selectRange.selectedColumns();
      if (this.columnManager.rowHeader) {
        columns.unshift(this.columnManager.rowHeader);
      }
      return columns;
    }
  };
  var rowLookups = {
    range: function() {
      return this.modules.selectRange.selectedRows();
    }
  };
  var extensions = {
    keybindings: {
      bindings,
      actions
    },
    clipboard: {
      pasteActions,
      pasteParsers
    },
    export: {
      columnLookups,
      rowLookups
    }
  };
  var SelectRange = class extends Module {
    constructor(table) {
      super(table);
      this.selecting = "cell";
      this.mousedown = false;
      this.ranges = [];
      this.overlay = null;
      this.rowHeader = null;
      this.layoutChangeTimeout = null;
      this.columnSelection = false;
      this.rowSelection = false;
      this.maxRanges = 0;
      this.activeRange = false;
      this.blockKeydown = false;
      this.keyDownEvent = this._handleKeyDown.bind(this);
      this.mouseUpEvent = this._handleMouseUp.bind(this);
      this.registerTableOption("selectableRange", false);
      this.registerTableOption("selectableRangeColumns", false);
      this.registerTableOption("selectableRangeRows", false);
      this.registerTableOption("selectableRangeClearCells", false);
      this.registerTableOption("selectableRangeClearCellsValue", void 0);
      this.registerTableOption("selectableRangeAutoFocus", true);
      this.registerTableOption("selectableRangeInitializeDefault", true);
      this.registerTableOption("selectableRangeBlurEditOnNavigate", void 0);
      this.registerTableFunction("getRangesData", this.getRangesData.bind(this));
      this.registerTableFunction("getRanges", this.getRanges.bind(this));
      this.registerTableFunction("addRange", this.addRangeFromComponent.bind(this));
      this.registerComponentFunction("cell", "getRanges", this.cellGetRanges.bind(this));
      this.registerComponentFunction("row", "getRanges", this.rowGetRanges.bind(this));
      this.registerComponentFunction("column", "getRanges", this.colGetRanges.bind(this));
    }
    ///////////////////////////////////
    ///////    Initialization   ///////
    ///////////////////////////////////
    initialize() {
      if (this.options("selectableRange")) {
        if (!this.options("selectableRows")) {
          this.maxRanges = this.options("selectableRange");
          this.initializeTable();
          this.initializeWatchers();
        } else {
          console.warn("SelectRange functionality cannot be used in conjunction with row selection");
        }
        if (this.options("columns").findIndex((column) => column.frozen) > 0) {
          console.warn("Having frozen column in arbitrary position with selectRange option may result in unpredictable behavior.");
        }
        if (this.options("columns").filter((column) => column.frozen) > 1) {
          console.warn("Having multiple frozen columns with selectRange option may result in unpredictable behavior.");
        }
      }
      this.subscribe("edit-nav-disabled", () => {
        return true;
      });
    }
    initializeTable() {
      this.overlay = document.createElement("div");
      this.overlay.classList.add("tabulator-range-overlay");
      this.rangeContainer = document.createElement("div");
      this.rangeContainer.classList.add("tabulator-range-container");
      this.activeRangeCellElement = document.createElement("div");
      this.activeRangeCellElement.classList.add("tabulator-range-cell-active");
      this.overlay.appendChild(this.rangeContainer);
      this.overlay.appendChild(this.activeRangeCellElement);
      this.table.rowManager.element.addEventListener("keydown", this.keyDownEvent);
      this.setDefaultRange();
      this.table.rowManager.element.appendChild(this.overlay);
      this.table.columnManager.element.setAttribute("tabindex", 0);
      this.table.element.classList.add("tabulator-ranges");
    }
    initializeWatchers() {
      this.columnSelection = this.options("selectableRangeColumns");
      this.rowSelection = this.options("selectableRangeRows");
      this.subscribe("column-init", this.initializeColumn.bind(this));
      this.subscribe("column-mousedown", this.handleColumnMouseDown.bind(this));
      this.subscribe("column-mousemove", this.handleColumnMouseMove.bind(this));
      this.subscribe("column-resized", this.handleColumnResized.bind(this));
      this.subscribe("column-moving", this.handleColumnMoving.bind(this));
      this.subscribe("column-moved", this.handleColumnMoved.bind(this));
      this.subscribe("column-width", this.layoutChange.bind(this));
      this.subscribe("column-height", this.layoutChange.bind(this));
      this.subscribe("column-resized", this.layoutChange.bind(this));
      this.subscribe("columns-loaded", this.updateHeaderColumn.bind(this));
      this.subscribe("cell-height", this.layoutChange.bind(this));
      this.subscribe("cell-rendered", this.renderCell.bind(this));
      this.subscribe("cell-mousedown", this.handleCellMouseDown.bind(this));
      this.subscribe("cell-mousemove", this.handleCellMouseMove.bind(this));
      this.subscribe("cell-click", this.handleCellClick.bind(this));
      this.subscribe("cell-editing", this.handleEditingCell.bind(this));
      this.subscribe("page-changed", this.redraw.bind(this));
      this.subscribe("scroll-vertical", this.layoutChange.bind(this));
      this.subscribe("scroll-horizontal", this.layoutChange.bind(this));
      this.subscribe("data-destroy", this.tableDestroyed.bind(this));
      this.subscribe("data-processed", this.setDefaultRange.bind(this));
      this.subscribe("table-layout", this.layoutElement.bind(this));
      this.subscribe("table-redraw", this.redraw.bind(this));
      this.subscribe("table-destroy", this.tableDestroyed.bind(this));
      this.subscribe("edit-editor-clear", this.finishEditingCell.bind(this));
      this.subscribe("edit-blur", this.restoreFocus.bind(this));
      this.subscribe("keybinding-nav-prev", this.keyNavigate.bind(this, "prev"));
      this.subscribe("keybinding-nav-next", this.keyNavigate.bind(this, "next"));
      this.subscribe("keybinding-nav-left", this.keyNavigate.bind(this, "left"));
      this.subscribe("keybinding-nav-right", this.keyNavigate.bind(this, "right"));
      this.subscribe("keybinding-nav-up", this.keyNavigate.bind(this, "up"));
      this.subscribe("keybinding-nav-down", this.keyNavigate.bind(this, "down"));
      this.subscribe("keybinding-nav-range", this.keyNavigateRange.bind(this));
    }
    initializeColumn(column) {
      if (this.columnSelection && column.definition.headerSort && this.options("headerSortClickElement") !== "icon") {
        console.warn("Using column headerSort with selectableRangeColumns option may result in unpredictable behavior. Consider using headerSortClickElement: 'icon'.");
      }
    }
    updateHeaderColumn() {
      var frozenCols;
      if (this.rowSelection) {
        this.rowHeader = this.table.columnManager.getVisibleColumnsByIndex()[0];
        if (this.rowHeader) {
          this.rowHeader.definition.cssClass = this.rowHeader.definition.cssClass + " tabulator-range-row-header";
          if (this.rowHeader.definition.headerSort) {
            console.warn("Using column headerSort with selectableRangeRows option may result in unpredictable behavior");
          }
          if (this.rowHeader.definition.editor) {
            console.warn("Using column editor with selectableRangeRows option may result in unpredictable behavior");
          }
        }
      }
      if (this.table.modules.frozenColumns && this.table.modules.frozenColumns.active) {
        frozenCols = this.table.modules.frozenColumns.getFrozenColumns();
        if (frozenCols.length > 1 || frozenCols.length === 1 && frozenCols[0] !== this.rowHeader) {
          console.warn("Using frozen columns that are not the range header in combination with the selectRange option may result in unpredictable behavior");
        }
      }
    }
    ///////////////////////////////////
    ///////   Table Functions   ///////
    ///////////////////////////////////
    getRanges() {
      return this.ranges.map((range2) => range2.getComponent());
    }
    getRangesData() {
      return this.ranges.map((range2) => range2.getData());
    }
    addRangeFromComponent(start, end) {
      start = start ? start._cell : null;
      end = end ? end._cell : null;
      return this.addRange(start, end);
    }
    ///////////////////////////////////
    /////// Component Functions ///////
    ///////////////////////////////////
    cellGetRanges(cell) {
      var ranges = [];
      if (cell.column === this.rowHeader) {
        ranges = this.ranges.filter((range2) => range2.occupiesRow(cell.row));
      } else {
        ranges = this.ranges.filter((range2) => range2.occupies(cell));
      }
      return ranges.map((range2) => range2.getComponent());
    }
    rowGetRanges(row) {
      var ranges = this.ranges.filter((range2) => range2.occupiesRow(row));
      return ranges.map((range2) => range2.getComponent());
    }
    colGetRanges(col) {
      var ranges = this.ranges.filter((range2) => range2.occupiesColumn(col));
      return ranges.map((range2) => range2.getComponent());
    }
    ///////////////////////////////////
    ////////// Event Handlers /////////
    ///////////////////////////////////
    _handleMouseUp(e) {
      this.mousedown = false;
      document.removeEventListener("mouseup", this.mouseUpEvent);
    }
    _handleKeyDown(e) {
      if (!this.blockKeydown && (!this.table.modules.edit || this.table.modules.edit && !this.table.modules.edit.currentCell)) {
        if (e.key === "Enter") {
          if (this.table.modules.edit && this.table.modules.edit.currentCell) {
            return;
          }
          var activeCell = this.getActiveCell();
          if (!activeCell) {
            return;
          }
          this.table.modules.edit.editCell(activeCell);
          e.preventDefault();
        }
        if ((e.key === "Backspace" || e.key === "Delete") && this.options("selectableRangeClearCells")) {
          if (this.activeRange) {
            this.activeRange.clearValues();
          }
        }
      }
    }
    initializeFocus(cell) {
      var range2;
      this.restoreFocus();
      try {
        if (document.selection) {
          range2 = document.body.createTextRange();
          range2.moveToElementText(cell.getElement());
          range2.select();
        } else if (window.getSelection) {
          range2 = document.createRange();
          range2.selectNode(cell.getElement());
          window.getSelection().removeAllRanges();
          window.getSelection().addRange(range2);
        }
      } catch (e) {
      }
    }
    restoreFocus(element) {
      this.table.rowManager.element.focus();
      return true;
    }
    ///////////////////////////////////
    ////// Column Functionality ///////
    ///////////////////////////////////
    handleColumnResized(column) {
      var selected;
      if (this.selecting !== "column" && this.selecting !== "all") {
        return;
      }
      selected = this.ranges.some((range2) => range2.occupiesColumn(column));
      if (!selected) {
        return;
      }
      this.ranges.forEach((range2) => {
        var selectedColumns = range2.getColumns(true);
        selectedColumns.forEach((selectedColumn) => {
          if (selectedColumn !== column) {
            selectedColumn.setWidth(column.width);
          }
        });
      });
    }
    handleColumnMoving(_event, column) {
      this.resetRanges().setBounds(column);
      this.overlay.style.visibility = "hidden";
    }
    handleColumnMoved(from, _to, _after) {
      this.activeRange.setBounds(from);
      this.layoutElement();
    }
    handleColumnMouseDown(event, column) {
      if (event.button === 2 && (this.selecting === "column" || this.selecting === "all") && this.activeRange.occupiesColumn(column)) {
        return;
      }
      if (this.table.options.movableColumns && this.selecting === "column" && this.activeRange.occupiesColumn(column)) {
        return;
      }
      this.mousedown = true;
      document.addEventListener("mouseup", this.mouseUpEvent);
      this.newSelection(event, column);
    }
    handleColumnMouseMove(e, column) {
      if (column === this.rowHeader || !this.mousedown || this.selecting === "all") {
        return;
      }
      this.activeRange.setBounds(false, column, true);
    }
    ///////////////////////////////////
    //////// Cell Functionality ///////
    ///////////////////////////////////
    renderCell(cell) {
      var el = cell.getElement(), rangeIdx = this.ranges.findIndex((range2) => range2.occupies(cell));
      el.classList.toggle("tabulator-range-selected", rangeIdx !== -1);
      el.classList.toggle("tabulator-range-only-cell-selected", this.ranges.length === 1 && this.ranges[0].atTopLeft(cell) && this.ranges[0].atBottomRight(cell));
      el.dataset.range = rangeIdx;
    }
    handleCellMouseDown(event, cell) {
      if (event.button === 2 && (this.activeRange.occupies(cell) || (this.selecting === "row" || this.selecting === "all") && this.activeRange.occupiesRow(cell.row))) {
        return;
      }
      this.mousedown = true;
      document.addEventListener("mouseup", this.mouseUpEvent);
      this.newSelection(event, cell);
    }
    handleCellMouseMove(e, cell) {
      if (!this.mousedown || this.selecting === "all") {
        return;
      }
      this.activeRange.setBounds(false, cell, true);
    }
    handleCellClick(e, cell) {
      this.initializeFocus(cell);
    }
    handleEditingCell(cell) {
      if (this.activeRange) {
        this.activeRange.setBounds(cell);
      }
    }
    finishEditingCell() {
      this.blockKeydown = true;
      this.table.rowManager.element.focus();
      setTimeout(() => {
        this.blockKeydown = false;
      }, 10);
    }
    ///////////////////////////////////
    ///////     Navigation      ///////
    ///////////////////////////////////
    keyNavigate(dir, e) {
      if (this.options("selectableRangeBlurEditOnNavigate")) {
        const isEditing = this.chain("edit-check-editing");
        if (isEditing) {
          if (dir === "next" || dir === "prev") {
            this.dispatch("edit-cancel-cell");
          } else {
            return false;
          }
        }
      }
      if (dir === "prev") {
        dir = "left";
      } else if (dir === "next") {
        dir = "right";
      }
      if (this.navigate(false, false, dir)) {
        e.preventDefault();
      }
    }
    keyNavigateRange(e, dir, jump, expand) {
      if (this.navigate(jump, expand, dir)) {
        e.preventDefault();
      }
    }
    navigate(jump, expand, dir) {
      var moved = false, range2, rangeEdge, prevRect, nextRow, nextCol, row, column, rowRect, rowManagerRect, columnRect, columnManagerRect;
      if (this.table.modules.edit && this.table.modules.edit.currentCell) {
        return false;
      }
      if (this.ranges.length > 1) {
        this.ranges = this.ranges.filter((range3) => {
          if (range3 === this.activeRange) {
            range3.setEnd(range3.start.row, range3.start.col);
            return true;
          }
          range3.destroy();
          return false;
        });
      }
      range2 = this.activeRange;
      prevRect = {
        top: range2.top,
        bottom: range2.bottom,
        left: range2.left,
        right: range2.right
      };
      rangeEdge = expand ? range2.end : range2.start;
      nextRow = rangeEdge.row;
      nextCol = rangeEdge.col;
      if (jump) {
        switch (dir) {
          case "left":
            nextCol = this.findJumpCellLeft(range2.start.row, rangeEdge.col);
            break;
          case "right":
            nextCol = this.findJumpCellRight(range2.start.row, rangeEdge.col);
            break;
          case "up":
            nextRow = this.findJumpCellUp(rangeEdge.row, range2.start.col);
            break;
          case "down":
            nextRow = this.findJumpCellDown(rangeEdge.row, range2.start.col);
            break;
        }
      } else {
        if (expand) {
          if (this.selecting === "row" && (dir === "left" || dir === "right") || this.selecting === "column" && (dir === "up" || dir === "down")) {
            return;
          }
        }
        switch (dir) {
          case "left":
            nextCol = Math.max(nextCol - 1, 0);
            break;
          case "right":
            nextCol = Math.min(nextCol + 1, this.getTableColumns().length - 1);
            break;
          case "up":
            nextRow = Math.max(nextRow - 1, 0);
            break;
          case "down":
            nextRow = Math.min(nextRow + 1, this.getTableRows().length - 1);
            break;
        }
      }
      if (this.rowHeader && nextCol === 0) {
        nextCol = 1;
      }
      if (!expand) {
        range2.setStart(nextRow, nextCol);
      }
      range2.setEnd(nextRow, nextCol);
      if (!expand) {
        this.selecting = "cell";
      }
      moved = prevRect.top !== range2.top || prevRect.bottom !== range2.bottom || prevRect.left !== range2.left || prevRect.right !== range2.right;
      if (moved) {
        row = this.getRowByRangePos(range2.end.row);
        column = this.getColumnByRangePos(range2.end.col);
        rowRect = row.getElement().getBoundingClientRect();
        columnRect = column.getElement().getBoundingClientRect();
        rowManagerRect = this.table.rowManager.getElement().getBoundingClientRect();
        columnManagerRect = this.table.columnManager.getElement().getBoundingClientRect();
        if (!(rowRect.top >= rowManagerRect.top && rowRect.bottom <= rowManagerRect.bottom)) {
          if (row.getElement().parentNode && column.getElement().parentNode) {
            this.autoScroll(range2, row.getElement(), column.getElement());
          } else {
            row.getComponent().scrollTo(void 0, false);
          }
        }
        if (!(columnRect.left >= columnManagerRect.left + this.getRowHeaderWidth() && columnRect.right <= columnManagerRect.right)) {
          if (row.getElement().parentNode && column.getElement().parentNode) {
            this.autoScroll(range2, row.getElement(), column.getElement());
          } else {
            column.getComponent().scrollTo(void 0, false);
          }
        }
        this.layoutElement();
      }
      return true;
    }
    rangeRemoved(removed) {
      this.ranges = this.ranges.filter((range2) => range2 !== removed);
      if (this.activeRange === removed) {
        if (this.ranges.length) {
          this.activeRange = this.ranges[this.ranges.length - 1];
        } else {
          this.addRange();
        }
      }
      this.layoutElement(true);
    }
    findJumpRow(column, rows, reverse, emptyStart, emptySide) {
      if (reverse) {
        rows = rows.reverse();
      }
      return this.findJumpItem(emptyStart, emptySide, rows, function(row) {
        return row.getData()[column.getField()];
      });
    }
    findJumpCol(row, columns, reverse, emptyStart, emptySide) {
      if (reverse) {
        columns = columns.reverse();
      }
      return this.findJumpItem(emptyStart, emptySide, columns, function(column) {
        return row.getData()[column.getField()];
      });
    }
    findJumpItem(emptyStart, emptySide, items, valueResolver) {
      var nextItem;
      for (let currentItem of items) {
        let currentValue = valueResolver(currentItem);
        if (emptyStart) {
          nextItem = currentItem;
          if (currentValue) {
            break;
          }
        } else {
          if (emptySide) {
            nextItem = currentItem;
            if (currentValue) {
              break;
            }
          } else {
            if (currentValue) {
              nextItem = currentItem;
            } else {
              break;
            }
          }
        }
      }
      return nextItem;
    }
    findJumpCellLeft(rowPos, colPos) {
      var row = this.getRowByRangePos(rowPos), columns = this.getTableColumns(), isStartingCellEmpty = this.isEmpty(row.getData()[columns[colPos].getField()]), isLeftOfStartingCellEmpty = columns[colPos - 1] ? this.isEmpty(row.getData()[columns[colPos - 1].getField()]) : false, targetCols = this.rowHeader ? columns.slice(1, colPos) : columns.slice(0, colPos), jumpCol = this.findJumpCol(row, targetCols, true, isStartingCellEmpty, isLeftOfStartingCellEmpty);
      if (jumpCol) {
        return jumpCol.getPosition() - 1;
      }
      return colPos;
    }
    findJumpCellRight(rowPos, colPos) {
      var row = this.getRowByRangePos(rowPos), columns = this.getTableColumns(), isStartingCellEmpty = this.isEmpty(row.getData()[columns[colPos].getField()]), isRightOfStartingCellEmpty = columns[colPos + 1] ? this.isEmpty(row.getData()[columns[colPos + 1].getField()]) : false, jumpCol = this.findJumpCol(row, columns.slice(colPos + 1, columns.length), false, isStartingCellEmpty, isRightOfStartingCellEmpty);
      if (jumpCol) {
        return jumpCol.getPosition() - 1;
      }
      return colPos;
    }
    findJumpCellUp(rowPos, colPos) {
      var column = this.getColumnByRangePos(colPos), rows = this.getTableRows(), isStartingCellEmpty = this.isEmpty(rows[rowPos].getData()[column.getField()]), isTopOfStartingCellEmpty = rows[rowPos - 1] ? this.isEmpty(rows[rowPos - 1].getData()[column.getField()]) : false, jumpRow = this.findJumpRow(column, rows.slice(0, rowPos), true, isStartingCellEmpty, isTopOfStartingCellEmpty);
      if (jumpRow) {
        return jumpRow.position - 1;
      }
      return rowPos;
    }
    findJumpCellDown(rowPos, colPos) {
      var column = this.getColumnByRangePos(colPos), rows = this.getTableRows(), isStartingCellEmpty = this.isEmpty(rows[rowPos].getData()[column.getField()]), isBottomOfStartingCellEmpty = rows[rowPos + 1] ? this.isEmpty(rows[rowPos + 1].getData()[column.getField()]) : false, jumpRow = this.findJumpRow(column, rows.slice(rowPos + 1, rows.length), false, isStartingCellEmpty, isBottomOfStartingCellEmpty);
      if (jumpRow) {
        return jumpRow.position - 1;
      }
      return rowPos;
    }
    ///////////////////////////////////
    ///////      Selection      ///////
    ///////////////////////////////////
    newSelection(event, element) {
      var range2;
      if (element.type === "column") {
        if (!this.columnSelection) {
          return;
        }
        if (element === this.rowHeader) {
          range2 = this.resetRanges();
          this.selecting = "all";
          var topLeftCell, bottomRightCell = this.getCell(-1, -1);
          if (this.rowHeader) {
            topLeftCell = this.getCell(0, 1);
          } else {
            topLeftCell = this.getCell(0, 0);
          }
          range2.setBounds(topLeftCell, bottomRightCell);
          return;
        } else {
          this.selecting = "column";
        }
      } else if (element.column === this.rowHeader) {
        this.selecting = "row";
      } else {
        this.selecting = "cell";
      }
      if (event.shiftKey) {
        this.activeRange.setBounds(false, element, true);
      } else if (event.ctrlKey) {
        this.addRange().setBounds(element, void 0, true);
      } else {
        this.resetRanges().setBounds(element, void 0, true);
      }
    }
    autoScroll(range2, row, column) {
      var tableHolder = this.table.rowManager.element, rect, view, withinHorizontalView, withinVerticalView;
      if (typeof row === "undefined") {
        row = this.getRowByRangePos(range2.end.row).getElement();
      }
      if (typeof column === "undefined") {
        column = this.getColumnByRangePos(range2.end.col).getElement();
      }
      rect = {
        left: column.offsetLeft,
        right: column.offsetLeft + column.offsetWidth,
        top: row.offsetTop,
        bottom: row.offsetTop + row.offsetHeight
      };
      view = {
        left: tableHolder.scrollLeft + this.getRowHeaderWidth(),
        right: Math.ceil(tableHolder.scrollLeft + tableHolder.clientWidth),
        top: tableHolder.scrollTop,
        bottom: tableHolder.scrollTop + tableHolder.offsetHeight - this.table.rowManager.scrollbarWidth
      };
      withinHorizontalView = view.left < rect.left && rect.left < view.right && view.left < rect.right && rect.right < view.right;
      withinVerticalView = view.top < rect.top && rect.top < view.bottom && view.top < rect.bottom && rect.bottom < view.bottom;
      if (!withinHorizontalView) {
        if (rect.left < view.left) {
          tableHolder.scrollLeft = rect.left - this.getRowHeaderWidth();
        } else if (rect.right > view.right) {
          tableHolder.scrollLeft = Math.min(rect.right - tableHolder.clientWidth, rect.left - this.getRowHeaderWidth());
        }
      }
      if (!withinVerticalView) {
        if (rect.top < view.top) {
          tableHolder.scrollTop = rect.top;
        } else if (rect.bottom > view.bottom) {
          tableHolder.scrollTop = rect.bottom - tableHolder.clientHeight;
        }
      }
    }
    ///////////////////////////////////
    ///////       Layout        ///////
    ///////////////////////////////////
    layoutChange() {
      this.overlay.style.visibility = "hidden";
      clearTimeout(this.layoutChangeTimeout);
      this.layoutChangeTimeout = setTimeout(this.layoutRanges.bind(this), 200);
    }
    redraw(force) {
      if (force) {
        this.selecting = "cell";
        this.setDefaultRange();
        this.layoutElement();
      }
    }
    layoutElement(visibleRows) {
      var rows;
      if (visibleRows) {
        rows = this.table.rowManager.getVisibleRows(true);
      } else {
        rows = this.table.rowManager.getRows();
      }
      rows.forEach((row) => {
        if (row.type === "row") {
          this.layoutRow(row);
          row.cells.forEach((cell) => this.renderCell(cell));
        }
      });
      this.getTableColumns().forEach((column) => {
        this.layoutColumn(column);
      });
      this.layoutRanges();
    }
    layoutRow(row) {
      var el = row.getElement(), selected = false, occupied = this.ranges.some((range2) => range2.occupiesRow(row));
      if (this.selecting === "row") {
        selected = occupied;
      } else if (this.selecting === "all") {
        selected = true;
      }
      el.classList.toggle("tabulator-range-selected", selected);
      el.classList.toggle("tabulator-range-highlight", occupied);
    }
    layoutColumn(column) {
      var el = column.getElement(), selected = false, occupied = this.ranges.some((range2) => range2.occupiesColumn(column));
      if (this.selecting === "column") {
        selected = occupied;
      } else if (this.selecting === "all") {
        selected = true;
      }
      el.classList.toggle("tabulator-range-selected", selected);
      el.classList.toggle("tabulator-range-highlight", occupied);
    }
    layoutRanges() {
      var activeCell, activeCellEl, activeRowEl;
      if (!this.table.initialized) {
        return;
      }
      activeCell = this.getActiveCell();
      if (!activeCell) {
        return;
      }
      activeCellEl = activeCell.getElement();
      activeRowEl = activeCell.row.getElement();
      if (this.table.rtl) {
        this.activeRangeCellElement.style.right = activeRowEl.offsetWidth - activeCellEl.offsetLeft - activeCellEl.offsetWidth + "px";
      } else {
        this.activeRangeCellElement.style.left = activeRowEl.offsetLeft + activeCellEl.offsetLeft + "px";
      }
      this.activeRangeCellElement.style.top = activeRowEl.offsetTop + "px";
      this.activeRangeCellElement.style.width = activeCellEl.offsetWidth + "px";
      this.activeRangeCellElement.style.height = activeRowEl.offsetHeight + "px";
      this.ranges.forEach((range2) => range2.layout());
      this.overlay.style.visibility = "visible";
    }
    ///////////////////////////////////
    ///////  Helper Functions   ///////
    ///////////////////////////////////	
    getCell(rowIdx, colIdx) {
      var row;
      if (colIdx < 0) {
        colIdx = this.getTableColumns().length + colIdx;
        if (colIdx < 0) {
          return null;
        }
      }
      if (rowIdx < 0) {
        rowIdx = this.getTableRows().length + rowIdx;
      }
      row = this.table.rowManager.getRowFromPosition(rowIdx + 1);
      return row ? row.getCells(false, true).filter((cell) => cell.column.visible)[colIdx] : null;
    }
    getActiveCell() {
      if (!this.activeRange) return;
      return this.getCell(this.activeRange.start.row, this.activeRange.start.col);
    }
    getRowByRangePos(pos) {
      return this.getTableRows()[pos];
    }
    getColumnByRangePos(pos) {
      return this.getTableColumns()[pos];
    }
    getTableRows() {
      return this.table.rowManager.getDisplayRows().filter((row) => row.type === "row");
    }
    getTableColumns() {
      return this.table.columnManager.getVisibleColumnsByIndex();
    }
    addRange(start, end) {
      var range2;
      if (this.maxRanges !== true && this.ranges.length >= this.maxRanges) {
        this.ranges.shift().destroy();
      }
      range2 = new Range(this.table, this, start, end);
      this.activeRange = range2;
      this.ranges.push(range2);
      this.rangeContainer.appendChild(range2.element);
      return range2;
    }
    createDefaultRange() {
      var range2, cell, visibleCells;
      range2 = this.addRange();
      if (this.table.rowManager.activeRows.length) {
        visibleCells = this.table.rowManager.activeRows[0].cells.filter((cell2) => cell2.column.visible);
        cell = visibleCells[this.rowHeader ? 1 : 0];
        if (cell) {
          range2.setBounds(cell);
          if (this.options("selectableRangeAutoFocus")) {
            this.initializeFocus(cell);
          }
        }
      }
      return range2;
    }
    clearRanges() {
      this.ranges.forEach((range2) => range2.destroy());
      this.ranges = [];
    }
    setDefaultRange() {
      this.clearRanges();
      if (this.options("selectableRangeInitializeDefault")) {
        this.createDefaultRange();
      }
    }
    resetRanges() {
      this.clearRanges();
      return this.createDefaultRange();
    }
    tableDestroyed() {
      document.removeEventListener("mouseup", this.mouseUpEvent);
      this.table.rowManager.element.removeEventListener("keydown", this.keyDownEvent);
    }
    selectedRows(component) {
      return component ? this.activeRange.getRows().map((row) => row.getComponent()) : this.activeRange.getRows();
    }
    selectedColumns(component) {
      return component ? this.activeRange.getColumns().map((col) => col.getComponent()) : this.activeRange.getColumns();
    }
    getRowHeaderWidth() {
      if (!this.rowHeader) {
        return 0;
      }
      return this.rowHeader.getElement().offsetWidth;
    }
    isEmpty(value) {
      return value === null || value === void 0 || value === "";
    }
  };
  __publicField(SelectRange, "moduleName", "selectRange");
  __publicField(SelectRange, "moduleInitOrder", 1);
  __publicField(SelectRange, "moduleExtensions", extensions);
  var GridCalculator = class {
    constructor(columns, rows) {
      this.columnCount = columns;
      this.rowCount = rows;
      this.columnString = [];
      this.columns = [];
      this.rows = [];
    }
    genColumns(data) {
      var colCount = Math.max(this.columnCount, Math.max(...data.map((item) => item.length)));
      this.columnString = [];
      this.columns = [];
      for (let i = 1; i <= colCount; i++) {
        this.incrementChar(this.columnString.length - 1);
        this.columns.push(this.columnString.join(""));
      }
      return this.columns;
    }
    genRows(data) {
      var rowCount = Math.max(this.rowCount, data.length);
      this.rows = [];
      for (let i = 1; i <= rowCount; i++) {
        this.rows.push(i);
      }
      return this.rows;
    }
    incrementChar(i) {
      let char = this.columnString[i];
      if (char) {
        if (char !== "Z") {
          this.columnString[i] = String.fromCharCode(this.columnString[i].charCodeAt(0) + 1);
        } else {
          this.columnString[i] = "A";
          if (i) {
            this.incrementChar(i - 1);
          } else {
            this.columnString.push("A");
          }
        }
      } else {
        this.columnString.push("A");
      }
    }
    setRowCount(count) {
      this.rowCount = count;
    }
    setColumnCount(count) {
      this.columnCount = count;
    }
  };
  var SheetComponent = class {
    constructor(sheet) {
      this._sheet = sheet;
      return new Proxy(this, {
        get: function(target, name, receiver) {
          if (typeof target[name] !== "undefined") {
            return target[name];
          } else {
            return target._sheet.table.componentFunctionBinder.handle("sheet", target._sheet, name);
          }
        }
      });
    }
    getTitle() {
      return this._sheet.title;
    }
    getKey() {
      return this._sheet.key;
    }
    getDefinition() {
      return this._sheet.getDefinition();
    }
    getData() {
      return this._sheet.getData();
    }
    setData(data) {
      return this._sheet.setData(data);
    }
    clear() {
      return this._sheet.clear();
    }
    remove() {
      return this._sheet.remove();
    }
    active() {
      return this._sheet.active();
    }
    setTitle(title) {
      return this._sheet.setTitle(title);
    }
    setRows(rows) {
      return this._sheet.setRows(rows);
    }
    setColumns(columns) {
      return this._sheet.setColumns(columns);
    }
  };
  var Sheet = class extends CoreFeature {
    constructor(spreadsheetManager, definition) {
      super(spreadsheetManager.table);
      this.spreadsheetManager = spreadsheetManager;
      this.definition = definition;
      this.title = this.definition.title || "";
      this.key = this.definition.key || this.definition.title;
      this.rowCount = this.definition.rows;
      this.columnCount = this.definition.columns;
      this.data = this.definition.data || [];
      this.element = null;
      this.isActive = false;
      this.grid = new GridCalculator(this.columnCount, this.rowCount);
      this.defaultColumnDefinition = { width: 100, headerHozAlign: "center", headerSort: false };
      this.columnDefinition = Object.assign(this.defaultColumnDefinition, this.options("spreadsheetColumnDefinition"));
      this.columnDefs = [];
      this.rowDefs = [];
      this.columnFields = [];
      this.columns = [];
      this.rows = [];
      this.scrollTop = null;
      this.scrollLeft = null;
      this.initialize();
      this.dispatchExternal("sheetAdded", this.getComponent());
    }
    ///////////////////////////////////
    ///////// Initialization //////////
    ///////////////////////////////////
    initialize() {
      this.initializeElement();
      this.initializeColumns();
      this.initializeRows();
    }
    reinitialize() {
      this.initializeColumns();
      this.initializeRows();
    }
    initializeElement() {
      this.element = document.createElement("div");
      this.element.classList.add("tabulator-spreadsheet-tab");
      this.element.innerText = this.title;
      this.element.addEventListener("click", () => {
        this.spreadsheetManager.loadSheet(this);
      });
    }
    initializeColumns() {
      this.grid.setColumnCount(this.columnCount);
      this.columnFields = this.grid.genColumns(this.data);
      this.columnDefs = [];
      this.columnFields.forEach((ref) => {
        var def = Object.assign({}, this.columnDefinition);
        def.field = ref;
        def.title = ref;
        this.columnDefs.push(def);
      });
    }
    initializeRows() {
      var refs;
      this.grid.setRowCount(this.rowCount);
      refs = this.grid.genRows(this.data);
      this.rowDefs = [];
      refs.forEach((ref, i) => {
        var def = { "_id": ref };
        var data = this.data[i];
        if (data) {
          data.forEach((val, j) => {
            var field = this.columnFields[j];
            if (field) {
              def[field] = val;
            }
          });
        }
        this.rowDefs.push(def);
      });
    }
    unload() {
      this.isActive = false;
      this.scrollTop = this.table.rowManager.scrollTop;
      this.scrollLeft = this.table.rowManager.scrollLeft;
      this.data = this.getData(true);
      this.element.classList.remove("tabulator-spreadsheet-tab-active");
    }
    load() {
      var wasInactive = !this.isActive;
      this.isActive = true;
      this.table.blockRedraw();
      this.table.setData([]);
      this.table.setColumns(this.columnDefs);
      this.table.setData(this.rowDefs);
      this.table.restoreRedraw();
      if (wasInactive && this.scrollTop !== null) {
        this.table.rowManager.element.scrollLeft = this.scrollLeft;
        this.table.rowManager.element.scrollTop = this.scrollTop;
      }
      this.element.classList.add("tabulator-spreadsheet-tab-active");
      this.dispatchExternal("sheetLoaded", this.getComponent());
    }
    ///////////////////////////////////
    //////// Helper Functions /////////
    ///////////////////////////////////
    getComponent() {
      return new SheetComponent(this);
    }
    getDefinition() {
      return {
        title: this.title,
        key: this.key,
        rows: this.rowCount,
        columns: this.columnCount,
        data: this.getData()
      };
    }
    getData(full) {
      var output = [], rowWidths, outputWidth, outputHeight;
      this.rowDefs.forEach((rowData) => {
        var row = [];
        this.columnFields.forEach((field) => {
          row.push(rowData[field]);
        });
        output.push(row);
      });
      if (!full && !this.options("spreadsheetOutputFull")) {
        rowWidths = output.map((row) => row.findLastIndex((val) => typeof val !== "undefined") + 1);
        outputWidth = Math.max(...rowWidths);
        outputHeight = rowWidths.findLastIndex((width) => width > 0) + 1;
        output = output.slice(0, outputHeight);
        output = output.map((row) => row.slice(0, outputWidth));
      }
      return output;
    }
    setData(data) {
      this.data = data;
      this.reinitialize();
      this.dispatchExternal("sheetUpdated", this.getComponent());
      if (this.isActive) {
        this.load();
      }
    }
    clear() {
      this.setData([]);
    }
    setTitle(title) {
      this.title = title;
      this.element.innerText = title;
      this.dispatchExternal("sheetUpdated", this.getComponent());
    }
    setRows(rows) {
      this.rowCount = rows;
      this.initializeRows();
      this.dispatchExternal("sheetUpdated", this.getComponent());
      if (this.isActive) {
        this.load();
      }
    }
    setColumns(columns) {
      this.columnCount = columns;
      this.reinitialize();
      this.dispatchExternal("sheetUpdated", this.getComponent());
      if (this.isActive) {
        this.load();
      }
    }
    remove() {
      this.spreadsheetManager.removeSheet(this);
    }
    destroy() {
      if (this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
      this.dispatchExternal("sheetRemoved", this.getComponent());
    }
    active() {
      this.spreadsheetManager.loadSheet(this);
    }
  };
  var Spreadsheet = class extends Module {
    constructor(table) {
      super(table);
      this.sheets = [];
      this.element = null;
      this.registerTableOption("spreadsheet", false);
      this.registerTableOption("spreadsheetRows", 50);
      this.registerTableOption("spreadsheetColumns", 50);
      this.registerTableOption("spreadsheetColumnDefinition", {});
      this.registerTableOption("spreadsheetOutputFull", false);
      this.registerTableOption("spreadsheetData", false);
      this.registerTableOption("spreadsheetSheets", false);
      this.registerTableOption("spreadsheetSheetTabs", false);
      this.registerTableOption("spreadsheetSheetTabsElement", false);
      this.registerTableFunction("setSheets", this.setSheets.bind(this));
      this.registerTableFunction("addSheet", this.addSheet.bind(this));
      this.registerTableFunction("getSheets", this.getSheets.bind(this));
      this.registerTableFunction("getSheetDefinitions", this.getSheetDefinitions.bind(this));
      this.registerTableFunction("setSheetData", this.setSheetData.bind(this));
      this.registerTableFunction("getSheet", this.getSheet.bind(this));
      this.registerTableFunction("getSheetData", this.getSheetData.bind(this));
      this.registerTableFunction("clearSheet", this.clearSheet.bind(this));
      this.registerTableFunction("removeSheet", this.removeSheetFunc.bind(this));
      this.registerTableFunction("activeSheet", this.activeSheetFunc.bind(this));
    }
    ///////////////////////////////////
    ////// Module Initialization //////
    ///////////////////////////////////
    initialize() {
      if (this.options("spreadsheet")) {
        this.subscribe("table-initialized", this.tableInitialized.bind(this));
        this.subscribe("data-loaded", this.loadRemoteData.bind(this));
        this.table.options.index = "_id";
        if (this.options("spreadsheetData") && this.options("spreadsheetSheets")) {
          console.warn("You cannot use spreadsheetData and spreadsheetSheets at the same time, ignoring spreadsheetData");
          this.table.options.spreadsheetData = false;
        }
        this.compatibilityCheck();
        if (this.options("spreadsheetSheetTabs")) {
          this.initializeTabset();
        }
      }
    }
    compatibilityCheck() {
      if (this.options("data")) {
        console.warn("Do not use the data option when working with spreadsheets, use either spreadsheetData or spreadsheetSheets to pass data into the table");
      }
      if (this.options("pagination")) {
        console.warn("The spreadsheet module is not compatible with the pagination module");
      }
      if (this.options("groupBy")) {
        console.warn("The spreadsheet module is not compatible with the row grouping module");
      }
      if (this.options("responsiveCollapse")) {
        console.warn("The spreadsheet module is not compatible with the responsive collapse module");
      }
    }
    initializeTabset() {
      this.element = document.createElement("div");
      this.element.classList.add("tabulator-spreadsheet-tabs");
      var altContainer = this.options("spreadsheetSheetTabsElement");
      if (altContainer && !(altContainer instanceof HTMLElement)) {
        altContainer = document.querySelector(altContainer);
        if (!altContainer) {
          console.warn("Unable to find element matching spreadsheetSheetTabsElement selector:", this.options("spreadsheetSheetTabsElement"));
        }
      }
      if (altContainer) {
        altContainer.appendChild(this.element);
      } else {
        this.footerAppend(this.element);
      }
    }
    tableInitialized() {
      if (this.sheets.length) {
        this.loadSheet(this.sheets[0]);
      } else {
        if (this.options("spreadsheetSheets")) {
          this.loadSheets(this.options("spreadsheetSheets"));
        } else if (this.options("spreadsheetData")) {
          this.loadData(this.options("spreadsheetData"));
        }
      }
    }
    ///////////////////////////////////
    /////////// Ajax Parsing //////////
    ///////////////////////////////////
    loadRemoteData(data, data1, data2) {
      console.log("data", data, data1, data2);
      if (Array.isArray(data)) {
        this.table.dataLoader.clearAlert();
        this.dispatchExternal("dataLoaded", data);
        if (!data.length || Array.isArray(data[0])) {
          this.loadData(data);
        } else {
          this.loadSheets(data);
        }
      } else {
        console.error("Spreadsheet Loading Error - Unable to process remote data due to invalid data type \nExpecting: array \nReceived: ", typeof data, "\nData:     ", data);
      }
      return false;
    }
    ///////////////////////////////////
    ///////// Sheet Management ////////
    ///////////////////////////////////
    loadData(data) {
      var def = {
        data
      };
      this.loadSheet(this.newSheet(def));
    }
    destroySheets() {
      this.sheets.forEach((sheet) => {
        sheet.destroy();
      });
      this.sheets = [];
      this.activeSheet = null;
    }
    loadSheets(sheets) {
      if (!Array.isArray(sheets)) {
        sheets = [];
      }
      this.destroySheets();
      sheets.forEach((def) => {
        this.newSheet(def);
      });
      this.loadSheet(this.sheets[0]);
    }
    loadSheet(sheet) {
      if (this.activeSheet !== sheet) {
        if (this.activeSheet) {
          this.activeSheet.unload();
        }
        this.activeSheet = sheet;
        sheet.load();
      }
    }
    newSheet(definition = {}) {
      var sheet;
      if (!definition.rows) {
        definition.rows = this.options("spreadsheetRows");
      }
      if (!definition.columns) {
        definition.columns = this.options("spreadsheetColumns");
      }
      sheet = new Sheet(this, definition);
      this.sheets.push(sheet);
      if (this.element) {
        this.element.appendChild(sheet.element);
      }
      return sheet;
    }
    removeSheet(sheet) {
      var index = this.sheets.indexOf(sheet), prevSheet;
      if (this.sheets.length > 1) {
        if (index > -1) {
          this.sheets.splice(index, 1);
          sheet.destroy();
          if (this.activeSheet === sheet) {
            prevSheet = this.sheets[index - 1] || this.sheets[0];
            if (prevSheet) {
              this.loadSheet(prevSheet);
            } else {
              this.activeSheet = null;
            }
          }
        }
      } else {
        console.warn("Unable to remove sheet, at least one sheet must be active");
      }
    }
    lookupSheet(key) {
      if (!key) {
        return this.activeSheet;
      } else if (key instanceof Sheet) {
        return key;
      } else if (key instanceof SheetComponent) {
        return key._sheet;
      } else {
        return this.sheets.find((sheet) => sheet.key === key) || false;
      }
    }
    ///////////////////////////////////
    //////// Public Functions /////////
    ///////////////////////////////////
    setSheets(sheets) {
      this.loadSheets(sheets);
      return this.getSheets();
    }
    addSheet(sheet) {
      return this.newSheet(sheet).getComponent();
    }
    getSheetDefinitions() {
      return this.sheets.map((sheet) => sheet.getDefinition());
    }
    getSheets() {
      return this.sheets.map((sheet) => sheet.getComponent());
    }
    getSheet(key) {
      var sheet = this.lookupSheet(key);
      return sheet ? sheet.getComponent() : false;
    }
    setSheetData(key, data) {
      if (key && !data) {
        data = key;
        key = false;
      }
      var sheet = this.lookupSheet(key);
      return sheet ? sheet.setData(data) : false;
    }
    getSheetData(key) {
      var sheet = this.lookupSheet(key);
      return sheet ? sheet.getData() : false;
    }
    clearSheet(key) {
      var sheet = this.lookupSheet(key);
      return sheet ? sheet.clear() : false;
    }
    removeSheetFunc(key) {
      var sheet = this.lookupSheet(key);
      if (sheet) {
        this.removeSheet(sheet);
      }
    }
    activeSheetFunc(key) {
      var sheet = this.lookupSheet(key);
      return sheet ? this.loadSheet(sheet) : false;
    }
  };
  __publicField(Spreadsheet, "moduleName", "spreadsheet");
  var defaultOptions = {
    debugEventsExternal: false,
    //flag to console log events
    debugEventsInternal: false,
    //flag to console log events
    debugInvalidOptions: true,
    //allow toggling of invalid option warnings
    debugInvalidComponentFuncs: true,
    //allow toggling of invalid component warnings
    debugInitialization: true,
    //allow toggling of pre initialization function call warnings
    debugDeprecation: true,
    //allow toggling of deprecation warnings
    height: false,
    //height of tabulator
    minHeight: false,
    //minimum height of tabulator
    maxHeight: false,
    //maximum height of tabulator
    columnHeaderVertAlign: "top",
    //vertical alignment of column headers
    popupContainer: false,
    columns: [],
    //store for colum header info
    columnDefaults: {},
    //store column default props
    rowHeader: false,
    data: false,
    //default starting data
    autoColumns: false,
    //build columns from data row structure
    autoColumnsDefinitions: false,
    nestedFieldSeparator: ".",
    //separator for nested data
    footerElement: false,
    //hold footer element
    index: "id",
    //filed for row index
    textDirection: "auto",
    addRowPos: "bottom",
    //position to insert blank rows, top|bottom
    headerVisible: true,
    //hide header
    renderVertical: "virtual",
    renderHorizontal: "basic",
    renderVerticalBuffer: 0,
    // set virtual DOM buffer size
    scrollToRowPosition: "top",
    scrollToRowIfVisible: true,
    scrollToColumnPosition: "left",
    scrollToColumnIfVisible: true,
    rowFormatter: false,
    rowFormatterPrint: null,
    rowFormatterClipboard: null,
    rowFormatterHtmlOutput: null,
    rowHeight: null,
    placeholder: false,
    dataLoader: true,
    dataLoaderLoading: false,
    dataLoaderError: false,
    dataLoaderErrorTimeout: 3e3,
    dataSendParams: {},
    dataReceiveParams: {},
    dependencies: {}
  };
  var OptionsList = class {
    constructor(table, msgType, defaults = {}) {
      this.table = table;
      this.msgType = msgType;
      this.registeredDefaults = Object.assign({}, defaults);
    }
    register(option, value) {
      this.registeredDefaults[option] = value;
    }
    generate(defaultOptions2, userOptions = {}) {
      var output = Object.assign({}, this.registeredDefaults), warn = this.table.options.debugInvalidOptions || userOptions.debugInvalidOptions === true;
      Object.assign(output, defaultOptions2);
      for (let key in userOptions) {
        if (!output.hasOwnProperty(key)) {
          if (warn) {
            console.warn("Invalid " + this.msgType + " option:", key);
          }
          output[key] = userOptions.key;
        }
      }
      for (let key in output) {
        if (key in userOptions) {
          output[key] = userOptions[key];
        } else {
          if (Array.isArray(output[key])) {
            output[key] = Object.assign([], output[key]);
          } else if (typeof output[key] === "object" && output[key] !== null) {
            output[key] = Object.assign({}, output[key]);
          } else if (typeof output[key] === "undefined") {
            delete output[key];
          }
        }
      }
      return output;
    }
  };
  var Renderer = class extends CoreFeature {
    constructor(table) {
      super(table);
      this.elementVertical = table.rowManager.element;
      this.elementHorizontal = table.columnManager.element;
      this.tableElement = table.rowManager.tableElement;
      this.verticalFillMode = "fit";
    }
    ///////////////////////////////////
    /////// Internal Bindings /////////
    ///////////////////////////////////
    initialize() {
    }
    clearRows() {
    }
    clearColumns() {
    }
    reinitializeColumnWidths(columns) {
    }
    renderRows() {
    }
    renderColumns() {
    }
    rerenderRows(callback) {
      if (callback) {
        callback();
      }
    }
    rerenderColumns(update, blockRedraw) {
    }
    renderRowCells(row) {
    }
    rerenderRowCells(row, force) {
    }
    scrollColumns(left, dir) {
    }
    scrollRows(top, dir) {
    }
    resize() {
    }
    scrollToRow(row) {
    }
    scrollToRowNearestTop(row) {
    }
    visibleRows(includingBuffer) {
      return [];
    }
    ///////////////////////////////////
    //////// Helper Functions /////////
    ///////////////////////////////////
    rows() {
      return this.table.rowManager.getDisplayRows();
    }
    styleRow(row, index) {
      var rowEl = row.getElement();
      if (index % 2) {
        rowEl.classList.add("tabulator-row-even");
        rowEl.classList.remove("tabulator-row-odd");
      } else {
        rowEl.classList.add("tabulator-row-odd");
        rowEl.classList.remove("tabulator-row-even");
      }
    }
    ///////////////////////////////////
    /////// External Triggers /////////
    /////// (DO NOT OVERRIDE) /////////
    ///////////////////////////////////
    clear() {
      this.clearRows();
      this.clearColumns();
    }
    render() {
      this.renderRows();
      this.renderColumns();
    }
    rerender(callback) {
      this.rerenderRows();
      this.rerenderColumns();
    }
    scrollToRowPosition(row, position, ifVisible) {
      var rowIndex = this.rows().indexOf(row), rowEl = row.getElement(), offset = 0;
      return new Promise((resolve, reject) => {
        if (rowIndex > -1) {
          if (typeof ifVisible === "undefined") {
            ifVisible = this.table.options.scrollToRowIfVisible;
          }
          if (!ifVisible) {
            if (Helpers.elVisible(rowEl)) {
              offset = Helpers.elOffset(rowEl).top - Helpers.elOffset(this.elementVertical).top;
              if (offset > 0 && offset < this.elementVertical.clientHeight - rowEl.offsetHeight) {
                resolve();
                return false;
              }
            }
          }
          if (typeof position === "undefined") {
            position = this.table.options.scrollToRowPosition;
          }
          if (position === "nearest") {
            position = this.scrollToRowNearestTop(row) ? "top" : "bottom";
          }
          this.scrollToRow(row);
          switch (position) {
            case "middle":
            case "center":
              if (this.elementVertical.scrollHeight - this.elementVertical.scrollTop == this.elementVertical.clientHeight) {
                this.elementVertical.scrollTop = this.elementVertical.scrollTop + (rowEl.offsetTop - this.elementVertical.scrollTop) - (this.elementVertical.scrollHeight - rowEl.offsetTop) / 2;
              } else {
                this.elementVertical.scrollTop = this.elementVertical.scrollTop - this.elementVertical.clientHeight / 2;
              }
              break;
            case "bottom":
              if (this.elementVertical.scrollHeight - this.elementVertical.scrollTop == this.elementVertical.clientHeight) {
                this.elementVertical.scrollTop = this.elementVertical.scrollTop - (this.elementVertical.scrollHeight - rowEl.offsetTop) + rowEl.offsetHeight;
              } else {
                this.elementVertical.scrollTop = this.elementVertical.scrollTop - this.elementVertical.clientHeight + rowEl.offsetHeight;
              }
              break;
            case "top":
              this.elementVertical.scrollTop = rowEl.offsetTop;
              break;
          }
          resolve();
        } else {
          console.warn("Scroll Error - Row not visible");
          reject("Scroll Error - Row not visible");
        }
      });
    }
  };
  var BasicHorizontal = class extends Renderer {
    constructor(table) {
      super(table);
    }
    renderRowCells(row, inFragment) {
      const rowFrag = document.createDocumentFragment();
      row.cells.forEach((cell) => {
        rowFrag.appendChild(cell.getElement());
      });
      row.element.appendChild(rowFrag);
      if (!inFragment) {
        row.cells.forEach((cell) => {
          cell.cellRendered();
        });
      }
    }
    reinitializeColumnWidths(columns) {
      columns.forEach(function(column) {
        column.reinitializeWidth();
      });
    }
  };
  var VirtualDomHorizontal = class extends Renderer {
    constructor(table) {
      super(table);
      this.leftCol = 0;
      this.rightCol = 0;
      this.scrollLeft = 0;
      this.vDomScrollPosLeft = 0;
      this.vDomScrollPosRight = 0;
      this.vDomPadLeft = 0;
      this.vDomPadRight = 0;
      this.fitDataColAvg = 0;
      this.windowBuffer = 200;
      this.visibleRows = null;
      this.initialized = false;
      this.isFitData = false;
      this.columns = [];
    }
    initialize() {
      this.compatibilityCheck();
      this.layoutCheck();
      this.vertScrollListen();
    }
    compatibilityCheck() {
      if (this.options("layout") == "fitDataTable") {
        console.warn("Horizontal Virtual DOM is not compatible with fitDataTable layout mode");
      }
      if (this.options("responsiveLayout")) {
        console.warn("Horizontal Virtual DOM is not compatible with responsive columns");
      }
      if (this.options("rtl")) {
        console.warn("Horizontal Virtual DOM is not currently compatible with RTL text direction");
      }
    }
    layoutCheck() {
      this.isFitData = this.options("layout").startsWith("fitData");
    }
    vertScrollListen() {
      this.subscribe("scroll-vertical", this.clearVisRowCache.bind(this));
      this.subscribe("data-refreshed", this.clearVisRowCache.bind(this));
    }
    clearVisRowCache() {
      this.visibleRows = null;
    }
    //////////////////////////////////////
    ///////// Public Functions ///////////
    //////////////////////////////////////
    renderColumns(row, force) {
      this.dataChange();
    }
    scrollColumns(left, dir) {
      if (this.scrollLeft != left) {
        this.scrollLeft = left;
        this.scroll(left - (this.vDomScrollPosLeft + this.windowBuffer));
      }
    }
    calcWindowBuffer() {
      var buffer = this.elementVertical.clientWidth;
      this.table.columnManager.columnsByIndex.forEach((column) => {
        if (column.visible) {
          var width = column.getWidth();
          if (width > buffer) {
            buffer = width;
          }
        }
      });
      this.windowBuffer = buffer * 2;
    }
    rerenderColumns(update, blockRedraw) {
      var old = {
        cols: this.columns,
        leftCol: this.leftCol,
        rightCol: this.rightCol
      }, colPos = 0;
      if (update && !this.initialized) {
        return;
      }
      this.clear();
      this.calcWindowBuffer();
      this.scrollLeft = this.elementVertical.scrollLeft;
      this.vDomScrollPosLeft = this.scrollLeft - this.windowBuffer;
      this.vDomScrollPosRight = this.scrollLeft + this.elementVertical.clientWidth + this.windowBuffer;
      this.table.columnManager.columnsByIndex.forEach((column) => {
        var config = {}, width;
        if (column.visible) {
          if (!column.modules.frozen) {
            width = column.getWidth();
            config.leftPos = colPos;
            config.rightPos = colPos + width;
            config.width = width;
            if (this.isFitData) {
              config.fitDataCheck = column.modules.vdomHoz ? column.modules.vdomHoz.fitDataCheck : true;
            }
            if (colPos + width > this.vDomScrollPosLeft && colPos < this.vDomScrollPosRight) {
              if (this.leftCol == -1) {
                this.leftCol = this.columns.length;
                this.vDomPadLeft = colPos;
              }
              this.rightCol = this.columns.length;
            } else {
              if (this.leftCol !== -1) {
                this.vDomPadRight += width;
              }
            }
            this.columns.push(column);
            column.modules.vdomHoz = config;
            colPos += width;
          }
        }
      });
      this.tableElement.style.paddingLeft = this.vDomPadLeft + "px";
      this.tableElement.style.paddingRight = this.vDomPadRight + "px";
      this.initialized = true;
      if (!blockRedraw) {
        if (!update || this.reinitChanged(old)) {
          this.reinitializeRows();
        }
      }
      this.elementVertical.scrollLeft = this.scrollLeft;
    }
    renderRowCells(row) {
      if (this.initialized) {
        this.initializeRow(row);
      } else {
        const rowFrag = document.createDocumentFragment();
        row.cells.forEach((cell) => {
          rowFrag.appendChild(cell.getElement());
        });
        row.element.appendChild(rowFrag);
        row.cells.forEach((cell) => {
          cell.cellRendered();
        });
      }
    }
    rerenderRowCells(row, force) {
      this.reinitializeRow(row, force);
    }
    reinitializeColumnWidths(columns) {
      for (let i = this.leftCol; i <= this.rightCol; i++) {
        let col = this.columns[i];
        if (col) {
          col.reinitializeWidth();
        }
      }
    }
    //////////////////////////////////////
    //////// Internal Rendering //////////
    //////////////////////////////////////
    deinitialize() {
      this.initialized = false;
    }
    clear() {
      this.columns = [];
      this.leftCol = -1;
      this.rightCol = 0;
      this.vDomScrollPosLeft = 0;
      this.vDomScrollPosRight = 0;
      this.vDomPadLeft = 0;
      this.vDomPadRight = 0;
    }
    dataChange() {
      var change = false, row, rowEl;
      if (this.isFitData) {
        this.table.columnManager.columnsByIndex.forEach((column) => {
          if (!column.definition.width && column.visible) {
            change = true;
          }
        });
        if (change && this.table.rowManager.getDisplayRows().length) {
          this.vDomScrollPosRight = this.scrollLeft + this.elementVertical.clientWidth + this.windowBuffer;
          row = this.chain("rows-sample", [1], [], () => {
            return this.table.rowManager.getDisplayRows();
          })[0];
          if (row) {
            rowEl = row.getElement();
            row.generateCells();
            this.tableElement.appendChild(rowEl);
            for (let colEnd = 0; colEnd < row.cells.length; colEnd++) {
              let cell = row.cells[colEnd];
              rowEl.appendChild(cell.getElement());
              cell.column.reinitializeWidth();
            }
            rowEl.parentNode.removeChild(rowEl);
            this.rerenderColumns(false, true);
          }
        }
      } else {
        if (this.options("layout") === "fitColumns") {
          this.layoutRefresh();
          this.rerenderColumns(false, true);
        }
      }
    }
    reinitChanged(old) {
      var match = true;
      if (old.cols.length !== this.columns.length || old.leftCol !== this.leftCol || old.rightCol !== this.rightCol) {
        return true;
      }
      old.cols.forEach((col, i) => {
        if (col !== this.columns[i]) {
          match = false;
        }
      });
      return !match;
    }
    reinitializeRows() {
      var visibleRows = this.getVisibleRows(), otherRows = this.table.rowManager.getRows().filter((row) => !visibleRows.includes(row));
      visibleRows.forEach((row) => {
        this.reinitializeRow(row, true);
      });
      otherRows.forEach((row) => {
        row.deinitialize();
      });
    }
    getVisibleRows() {
      if (!this.visibleRows) {
        this.visibleRows = this.table.rowManager.getVisibleRows();
      }
      return this.visibleRows;
    }
    scroll(diff) {
      this.vDomScrollPosLeft += diff;
      this.vDomScrollPosRight += diff;
      if (Math.abs(diff) > this.windowBuffer / 2) {
        this.rerenderColumns();
      } else {
        if (diff > 0) {
          this.addColRight();
          this.removeColLeft();
        } else {
          this.addColLeft();
          this.removeColRight();
        }
      }
    }
    colPositionAdjust(start, end, diff) {
      for (let i = start; i < end; i++) {
        let column = this.columns[i];
        column.modules.vdomHoz.leftPos += diff;
        column.modules.vdomHoz.rightPos += diff;
      }
    }
    addColRight() {
      var changes = false, working = true;
      while (working) {
        let column = this.columns[this.rightCol + 1];
        if (column) {
          if (column.modules.vdomHoz.leftPos <= this.vDomScrollPosRight) {
            changes = true;
            this.getVisibleRows().forEach((row) => {
              if (row.type !== "group") {
                var cell = row.getCell(column);
                row.getElement().insertBefore(cell.getElement(), row.getCell(this.columns[this.rightCol]).getElement().nextSibling);
                cell.cellRendered();
              }
            });
            this.fitDataColActualWidthCheck(column);
            this.rightCol++;
            this.getVisibleRows().forEach((row) => {
              if (row.type !== "group") {
                row.modules.vdomHoz.rightCol = this.rightCol;
              }
            });
            if (this.rightCol >= this.columns.length - 1) {
              this.vDomPadRight = 0;
            } else {
              this.vDomPadRight -= column.getWidth();
            }
          } else {
            working = false;
          }
        } else {
          working = false;
        }
      }
      if (changes) {
        this.tableElement.style.paddingRight = this.vDomPadRight + "px";
      }
    }
    addColLeft() {
      var changes = false, working = true;
      while (working) {
        let column = this.columns[this.leftCol - 1];
        if (column) {
          if (column.modules.vdomHoz.rightPos >= this.vDomScrollPosLeft) {
            changes = true;
            this.getVisibleRows().forEach((row) => {
              if (row.type !== "group") {
                var cell = row.getCell(column);
                row.getElement().insertBefore(cell.getElement(), row.getCell(this.columns[this.leftCol]).getElement());
                cell.cellRendered();
              }
            });
            this.leftCol--;
            this.getVisibleRows().forEach((row) => {
              if (row.type !== "group") {
                row.modules.vdomHoz.leftCol = this.leftCol;
              }
            });
            if (this.leftCol <= 0) {
              this.vDomPadLeft = 0;
            } else {
              this.vDomPadLeft -= column.getWidth();
            }
            let diff = this.fitDataColActualWidthCheck(column);
            if (diff) {
              this.scrollLeft = this.elementVertical.scrollLeft = this.elementVertical.scrollLeft + diff;
              this.vDomPadRight -= diff;
            }
          } else {
            working = false;
          }
        } else {
          working = false;
        }
      }
      if (changes) {
        this.tableElement.style.paddingLeft = this.vDomPadLeft + "px";
      }
    }
    removeColRight() {
      var changes = false, working = true;
      while (working) {
        let column = this.columns[this.rightCol];
        if (column) {
          if (column.modules.vdomHoz.leftPos > this.vDomScrollPosRight) {
            changes = true;
            this.getVisibleRows().forEach((row) => {
              if (row.type !== "group") {
                var cell = row.getCell(column);
                try {
                  row.getElement().removeChild(cell.getElement());
                } catch (ex) {
                  console.warn("Could not removeColRight", ex.message);
                }
              }
            });
            this.vDomPadRight += column.getWidth();
            this.rightCol--;
            this.getVisibleRows().forEach((row) => {
              if (row.type !== "group") {
                row.modules.vdomHoz.rightCol = this.rightCol;
              }
            });
          } else {
            working = false;
          }
        } else {
          working = false;
        }
      }
      if (changes) {
        this.tableElement.style.paddingRight = this.vDomPadRight + "px";
      }
    }
    removeColLeft() {
      var changes = false, working = true;
      while (working) {
        let column = this.columns[this.leftCol];
        if (column) {
          if (column.modules.vdomHoz.rightPos < this.vDomScrollPosLeft) {
            changes = true;
            this.getVisibleRows().forEach((row) => {
              if (row.type !== "group") {
                var cell = row.getCell(column);
                try {
                  row.getElement().removeChild(cell.getElement());
                } catch (ex) {
                  console.warn("Could not removeColLeft", ex.message);
                }
              }
            });
            this.vDomPadLeft += column.getWidth();
            this.leftCol++;
            this.getVisibleRows().forEach((row) => {
              if (row.type !== "group") {
                row.modules.vdomHoz.leftCol = this.leftCol;
              }
            });
          } else {
            working = false;
          }
        } else {
          working = false;
        }
      }
      if (changes) {
        this.tableElement.style.paddingLeft = this.vDomPadLeft + "px";
      }
    }
    fitDataColActualWidthCheck(column) {
      var newWidth, widthDiff;
      if (column.modules.vdomHoz.fitDataCheck) {
        column.reinitializeWidth();
        newWidth = column.getWidth();
        widthDiff = newWidth - column.modules.vdomHoz.width;
        if (widthDiff) {
          column.modules.vdomHoz.rightPos += widthDiff;
          column.modules.vdomHoz.width = newWidth;
          this.colPositionAdjust(this.columns.indexOf(column) + 1, this.columns.length, widthDiff);
        }
        column.modules.vdomHoz.fitDataCheck = false;
      }
      return widthDiff;
    }
    initializeRow(row) {
      if (row.type !== "group") {
        row.modules.vdomHoz = {
          leftCol: this.leftCol,
          rightCol: this.rightCol
        };
        if (this.table.modules.frozenColumns) {
          this.table.modules.frozenColumns.leftColumns.forEach((column) => {
            this.appendCell(row, column);
          });
        }
        for (let i = this.leftCol; i <= this.rightCol; i++) {
          this.appendCell(row, this.columns[i]);
        }
        if (this.table.modules.frozenColumns) {
          this.table.modules.frozenColumns.rightColumns.forEach((column) => {
            this.appendCell(row, column);
          });
        }
      }
    }
    appendCell(row, column) {
      if (column && column.visible) {
        let cell = row.getCell(column);
        row.getElement().appendChild(cell.getElement());
        cell.cellRendered();
      }
    }
    reinitializeRow(row, force) {
      if (row.type !== "group") {
        if (force || !row.modules.vdomHoz || row.modules.vdomHoz.leftCol !== this.leftCol || row.modules.vdomHoz.rightCol !== this.rightCol) {
          var rowEl = row.getElement();
          while (rowEl.firstChild) rowEl.removeChild(rowEl.firstChild);
          this.initializeRow(row);
        }
      }
    }
  };
  var ColumnManager = class extends CoreFeature {
    constructor(table) {
      super(table);
      this.blockHozScrollEvent = false;
      this.headersElement = null;
      this.contentsElement = null;
      this.rowHeader = null;
      this.element = null;
      this.columns = [];
      this.columnsByIndex = [];
      this.columnsByField = {};
      this.scrollLeft = 0;
      this.optionsList = new OptionsList(this.table, "column definition", defaultColumnOptions);
      this.redrawBlock = false;
      this.redrawBlockUpdate = null;
      this.renderer = null;
    }
    ////////////// Setup Functions /////////////////
    initialize() {
      this.initializeRenderer();
      this.headersElement = this.createHeadersElement();
      this.contentsElement = this.createHeaderContentsElement();
      this.element = this.createHeaderElement();
      this.contentsElement.insertBefore(this.headersElement, this.contentsElement.firstChild);
      this.element.insertBefore(this.contentsElement, this.element.firstChild);
      this.initializeScrollWheelWatcher();
      this.subscribe("scroll-horizontal", this.scrollHorizontal.bind(this));
      this.subscribe("scrollbar-vertical", this.padVerticalScrollbar.bind(this));
    }
    padVerticalScrollbar(width) {
      if (this.table.rtl) {
        this.headersElement.style.marginLeft = width + "px";
      } else {
        this.headersElement.style.marginRight = width + "px";
      }
    }
    initializeRenderer() {
      var renderClass;
      var renderers = {
        "virtual": VirtualDomHorizontal,
        "basic": BasicHorizontal
      };
      if (typeof this.table.options.renderHorizontal === "string") {
        renderClass = renderers[this.table.options.renderHorizontal];
      } else {
        renderClass = this.table.options.renderHorizontal;
      }
      if (renderClass) {
        this.renderer = new renderClass(this.table, this.element, this.tableElement);
        this.renderer.initialize();
      } else {
        console.error("Unable to find matching renderer:", this.table.options.renderHorizontal);
      }
    }
    createHeadersElement() {
      var el = document.createElement("div");
      el.classList.add("tabulator-headers");
      el.setAttribute("role", "row");
      return el;
    }
    createHeaderContentsElement() {
      var el = document.createElement("div");
      el.classList.add("tabulator-header-contents");
      return el;
    }
    createHeaderElement() {
      var el = document.createElement("div");
      el.classList.add("tabulator-header");
      el.setAttribute("role", "rowgroup");
      if (!this.table.options.headerVisible) {
        el.classList.add("tabulator-header-hidden");
      }
      return el;
    }
    //return containing element
    getElement() {
      return this.element;
    }
    //return containing contents element
    getContentsElement() {
      return this.contentsElement;
    }
    //return header containing element
    getHeadersElement() {
      return this.headersElement;
    }
    //scroll horizontally to match table body
    scrollHorizontal(left) {
      this.contentsElement.scrollLeft = left;
      this.scrollLeft = left;
      this.renderer.scrollColumns(left);
    }
    initializeScrollWheelWatcher() {
      this.contentsElement.addEventListener("wheel", (e) => {
        var left;
        if (e.deltaX) {
          left = this.contentsElement.scrollLeft + e.deltaX;
          this.table.rowManager.scrollHorizontal(left);
          this.table.columnManager.scrollHorizontal(left);
        }
      });
    }
    ///////////// Column Setup Functions /////////////
    generateColumnsFromRowData(data) {
      var cols = [], collProgress = {}, rowSample = this.table.options.autoColumns === "full" ? data : [data[0]], definitions = this.table.options.autoColumnsDefinitions;
      if (data && data.length) {
        rowSample.forEach((row) => {
          Object.keys(row).forEach((key, index) => {
            let value = row[key], col;
            if (!collProgress[key]) {
              col = {
                field: key,
                title: key,
                sorter: this.calculateSorterFromValue(value)
              };
              cols.splice(index, 0, col);
              collProgress[key] = typeof value === "undefined" ? col : true;
            } else if (collProgress[key] !== true) {
              if (typeof value !== "undefined") {
                collProgress[key].sorter = this.calculateSorterFromValue(value);
                collProgress[key] = true;
              }
            }
          });
        });
        if (definitions) {
          switch (typeof definitions) {
            case "function":
              this.table.options.columns = definitions.call(this.table, cols);
              break;
            case "object":
              if (Array.isArray(definitions)) {
                cols.forEach((col) => {
                  var match = definitions.find((def) => {
                    return def.field === col.field;
                  });
                  if (match) {
                    Object.assign(col, match);
                  }
                });
              } else {
                cols.forEach((col) => {
                  if (definitions[col.field]) {
                    Object.assign(col, definitions[col.field]);
                  }
                });
              }
              this.table.options.columns = cols;
              break;
          }
        } else {
          this.table.options.columns = cols;
        }
        this.setColumns(this.table.options.columns);
      }
    }
    calculateSorterFromValue(value) {
      var sorter;
      switch (typeof value) {
        case "undefined":
          sorter = "string";
          break;
        case "boolean":
          sorter = "boolean";
          break;
        case "number":
          sorter = "number";
          break;
        case "object":
          if (Array.isArray(value)) {
            sorter = "array";
          } else {
            sorter = "string";
          }
          break;
        default:
          if (!isNaN(Number(value)) && value !== "") {
            sorter = "number";
          } else {
            if (value.match(/((^[0-9]+[a-z]+)|(^[a-z]+[0-9]+))+$/i)) {
              sorter = "alphanum";
            } else {
              sorter = "string";
            }
          }
          break;
      }
      return sorter;
    }
    setColumns(cols, row) {
      while (this.headersElement.firstChild) this.headersElement.removeChild(this.headersElement.firstChild);
      this.columns = [];
      this.columnsByIndex = [];
      this.columnsByField = {};
      this.dispatch("columns-loading");
      this.dispatchExternal("columnsLoading");
      if (this.table.options.rowHeader) {
        this.rowHeader = new Column(this.table.options.rowHeader === true ? {} : this.table.options.rowHeader, this, true);
        this.columns.push(this.rowHeader);
        this.headersElement.appendChild(this.rowHeader.getElement());
        this.rowHeader.columnRendered();
      }
      cols.forEach((def, i) => {
        this._addColumn(def);
      });
      this._reIndexColumns();
      this.dispatch("columns-loaded");
      if (this.subscribedExternal("columnsLoaded")) {
        this.dispatchExternal("columnsLoaded", this.getComponents());
      }
      this.rerenderColumns(false, true);
      this.redraw(true);
    }
    _addColumn(definition, before, nextToColumn) {
      var column = new Column(definition, this), colEl = column.getElement(), index = nextToColumn ? this.findColumnIndex(nextToColumn) : nextToColumn;
      if (before && this.rowHeader && (!nextToColumn || nextToColumn === this.rowHeader)) {
        before = false;
        nextToColumn = this.rowHeader;
        index = 0;
      }
      if (nextToColumn && index > -1) {
        var topColumn = nextToColumn.getTopColumn();
        var parentIndex = this.columns.indexOf(topColumn);
        var nextEl = topColumn.getElement();
        if (before) {
          this.columns.splice(parentIndex, 0, column);
          nextEl.parentNode.insertBefore(colEl, nextEl);
        } else {
          this.columns.splice(parentIndex + 1, 0, column);
          nextEl.parentNode.insertBefore(colEl, nextEl.nextSibling);
        }
      } else {
        if (before) {
          this.columns.unshift(column);
          this.headersElement.insertBefore(column.getElement(), this.headersElement.firstChild);
        } else {
          this.columns.push(column);
          this.headersElement.appendChild(column.getElement());
        }
      }
      column.columnRendered();
      return column;
    }
    registerColumnField(col) {
      if (col.definition.field) {
        this.columnsByField[col.definition.field] = col;
      }
    }
    registerColumnPosition(col) {
      this.columnsByIndex.push(col);
    }
    _reIndexColumns() {
      this.columnsByIndex = [];
      this.columns.forEach(function(column) {
        column.reRegisterPosition();
      });
    }
    //ensure column headers take up the correct amount of space in column groups
    verticalAlignHeaders() {
      var minHeight = 0;
      if (!this.redrawBlock) {
        this.headersElement.style.height = "";
        this.columns.forEach((column) => {
          column.clearVerticalAlign();
        });
        this.columns.forEach((column) => {
          var height = column.getHeight();
          if (height > minHeight) {
            minHeight = height;
          }
        });
        this.headersElement.style.height = minHeight + "px";
        this.columns.forEach((column) => {
          column.verticalAlign(this.table.options.columnHeaderVertAlign, minHeight);
        });
        this.table.rowManager.adjustTableSize();
      }
    }
    //////////////// Column Details /////////////////
    findColumn(subject) {
      var columns;
      if (typeof subject == "object") {
        if (subject instanceof Column) {
          return subject;
        } else if (subject instanceof ColumnComponent) {
          return subject._getSelf() || false;
        } else if (typeof HTMLElement !== "undefined" && subject instanceof HTMLElement) {
          columns = [];
          this.columns.forEach((column) => {
            columns.push(column);
            columns = columns.concat(column.getColumns(true));
          });
          let match = columns.find((column) => {
            return column.element === subject;
          });
          return match || false;
        }
      } else {
        return this.columnsByField[subject] || false;
      }
      return false;
    }
    getColumnByField(field) {
      return this.columnsByField[field];
    }
    getColumnsByFieldRoot(root) {
      var matches = [];
      Object.keys(this.columnsByField).forEach((field) => {
        var fieldRoot = this.table.options.nestedFieldSeparator ? field.split(this.table.options.nestedFieldSeparator)[0] : field;
        if (fieldRoot === root) {
          matches.push(this.columnsByField[field]);
        }
      });
      return matches;
    }
    getColumnByIndex(index) {
      return this.columnsByIndex[index];
    }
    getFirstVisibleColumn() {
      var index = this.columnsByIndex.findIndex((col) => {
        return col.visible;
      });
      return index > -1 ? this.columnsByIndex[index] : false;
    }
    getVisibleColumnsByIndex() {
      return this.columnsByIndex.filter((col) => col.visible);
    }
    getColumns() {
      return this.columns;
    }
    findColumnIndex(column) {
      return this.columnsByIndex.findIndex((col) => {
        return column === col;
      });
    }
    //return all columns that are not groups
    getRealColumns() {
      return this.columnsByIndex;
    }
    //traverse across columns and call action
    traverse(callback) {
      this.columnsByIndex.forEach((column, i) => {
        callback(column, i);
      });
    }
    //get definitions of actual columns
    getDefinitions(active) {
      var output = [];
      this.columnsByIndex.forEach((column) => {
        if (!active || active && column.visible) {
          output.push(column.getDefinition());
        }
      });
      return output;
    }
    //get full nested definition tree
    getDefinitionTree() {
      var output = [];
      this.columns.forEach((column) => {
        output.push(column.getDefinition(true));
      });
      return output;
    }
    getComponents(structured) {
      var output = [], columns = structured ? this.columns : this.columnsByIndex;
      columns.forEach((column) => {
        output.push(column.getComponent());
      });
      return output;
    }
    getWidth() {
      var width = 0;
      this.columnsByIndex.forEach((column) => {
        if (column.visible) {
          width += column.getWidth();
        }
      });
      return width;
    }
    moveColumn(from, to, after) {
      to.element.parentNode.insertBefore(from.element, to.element);
      if (after) {
        to.element.parentNode.insertBefore(to.element, from.element);
      }
      this.moveColumnActual(from, to, after);
      this.verticalAlignHeaders();
      this.table.rowManager.reinitialize();
    }
    moveColumnActual(from, to, after) {
      if (from.parent.isGroup) {
        this._moveColumnInArray(from.parent.columns, from, to, after);
      } else {
        this._moveColumnInArray(this.columns, from, to, after);
      }
      this._moveColumnInArray(this.columnsByIndex, from, to, after, true);
      this.rerenderColumns(true);
      this.dispatch("column-moved", from, to, after);
      if (this.subscribedExternal("columnMoved")) {
        this.dispatchExternal("columnMoved", from.getComponent(), this.table.columnManager.getComponents());
      }
    }
    _moveColumnInArray(columns, from, to, after, updateRows) {
      var fromIndex = columns.indexOf(from), toIndex, rows = [];
      if (fromIndex > -1) {
        columns.splice(fromIndex, 1);
        toIndex = columns.indexOf(to);
        if (toIndex > -1) {
          if (after) {
            toIndex = toIndex + 1;
          }
        } else {
          toIndex = fromIndex;
        }
        columns.splice(toIndex, 0, from);
        if (updateRows) {
          rows = this.chain("column-moving-rows", [from, to, after], null, []) || [];
          rows = rows.concat(this.table.rowManager.rows);
          rows.forEach(function(row) {
            if (row.cells.length) {
              var cell = row.cells.splice(fromIndex, 1)[0];
              row.cells.splice(toIndex, 0, cell);
            }
          });
        }
      }
    }
    scrollToColumn(column, position, ifVisible) {
      var left = 0, offset = column.getLeftOffset(), adjust = 0, colEl = column.getElement();
      return new Promise((resolve, reject) => {
        if (typeof position === "undefined") {
          position = this.table.options.scrollToColumnPosition;
        }
        if (typeof ifVisible === "undefined") {
          ifVisible = this.table.options.scrollToColumnIfVisible;
        }
        if (column.visible) {
          switch (position) {
            case "middle":
            case "center":
              adjust = -this.element.clientWidth / 2;
              break;
            case "right":
              adjust = colEl.clientWidth - this.headersElement.clientWidth;
              break;
          }
          if (!ifVisible) {
            if (offset > 0 && offset + colEl.offsetWidth < this.element.clientWidth) {
              return false;
            }
          }
          left = offset + adjust;
          left = Math.max(Math.min(left, this.table.rowManager.element.scrollWidth - this.table.rowManager.element.clientWidth), 0);
          this.table.rowManager.scrollHorizontal(left);
          this.scrollHorizontal(left);
          resolve();
        } else {
          console.warn("Scroll Error - Column not visible");
          reject("Scroll Error - Column not visible");
        }
      });
    }
    //////////////// Cell Management /////////////////
    generateCells(row) {
      var cells = [];
      this.columnsByIndex.forEach((column) => {
        cells.push(column.generateCell(row));
      });
      return cells;
    }
    //////////////// Column Management /////////////////
    getFlexBaseWidth() {
      var totalWidth = this.table.element.clientWidth, fixedWidth = 0;
      if (this.table.rowManager.element.scrollHeight > this.table.rowManager.element.clientHeight) {
        totalWidth -= this.table.rowManager.element.offsetWidth - this.table.rowManager.element.clientWidth;
      }
      this.columnsByIndex.forEach(function(column) {
        var width, minWidth, colWidth;
        if (column.visible) {
          width = column.definition.width || 0;
          minWidth = parseInt(column.minWidth);
          if (typeof width == "string") {
            if (width.indexOf("%") > -1) {
              colWidth = totalWidth / 100 * parseInt(width);
            } else {
              colWidth = parseInt(width);
            }
          } else {
            colWidth = width;
          }
          fixedWidth += colWidth > minWidth ? colWidth : minWidth;
        }
      });
      return fixedWidth;
    }
    addColumn(definition, before, nextToColumn) {
      return new Promise((resolve, reject) => {
        var column = this._addColumn(definition, before, nextToColumn);
        this._reIndexColumns();
        this.dispatch("column-add", definition, before, nextToColumn);
        if (this.layoutMode() != "fitColumns") {
          column.reinitializeWidth();
        }
        this.redraw(true);
        this.table.rowManager.reinitialize();
        this.rerenderColumns();
        resolve(column);
      });
    }
    //remove column from system
    deregisterColumn(column) {
      var field = column.getField(), index;
      if (field) {
        delete this.columnsByField[field];
      }
      index = this.columnsByIndex.indexOf(column);
      if (index > -1) {
        this.columnsByIndex.splice(index, 1);
      }
      index = this.columns.indexOf(column);
      if (index > -1) {
        this.columns.splice(index, 1);
      }
      this.verticalAlignHeaders();
      this.redraw();
    }
    rerenderColumns(update, silent) {
      if (!this.redrawBlock) {
        this.renderer.rerenderColumns(update, silent);
      } else {
        if (update === false || update === true && this.redrawBlockUpdate === null) {
          this.redrawBlockUpdate = update;
        }
      }
    }
    blockRedraw() {
      this.redrawBlock = true;
      this.redrawBlockUpdate = null;
    }
    restoreRedraw() {
      this.redrawBlock = false;
      this.verticalAlignHeaders();
      this.renderer.rerenderColumns(this.redrawBlockUpdate);
    }
    //redraw columns
    redraw(force) {
      if (Helpers.elVisible(this.element)) {
        this.verticalAlignHeaders();
      }
      if (force) {
        this.table.rowManager.resetScroll();
        this.table.rowManager.reinitialize();
      }
      if (!this.confirm("table-redrawing", force)) {
        this.layoutRefresh(force);
      }
      this.dispatch("table-redraw", force);
      this.table.footerManager.redraw();
    }
  };
  var BasicVertical = class extends Renderer {
    constructor(table) {
      super(table);
      this.verticalFillMode = "fill";
      this.scrollTop = 0;
      this.scrollLeft = 0;
      this.scrollTop = 0;
      this.scrollLeft = 0;
    }
    clearRows() {
      var element = this.tableElement;
      while (element.firstChild) element.removeChild(element.firstChild);
      element.scrollTop = 0;
      element.scrollLeft = 0;
      element.style.minWidth = "";
      element.style.minHeight = "";
      element.style.display = "";
      element.style.visibility = "";
    }
    renderRows() {
      var element = this.tableElement, onlyGroupHeaders = true, tableFrag = document.createDocumentFragment(), rows = this.rows();
      rows.forEach((row, index) => {
        this.styleRow(row, index);
        row.initialize(false, true);
        if (row.type !== "group") {
          onlyGroupHeaders = false;
        }
        tableFrag.appendChild(row.getElement());
      });
      element.appendChild(tableFrag);
      rows.forEach((row) => {
        row.rendered();
        if (!row.heightInitialized) {
          row.calcHeight(true);
        }
      });
      rows.forEach((row) => {
        if (!row.heightInitialized) {
          row.setCellHeight();
        }
      });
      if (onlyGroupHeaders) {
        element.style.minWidth = this.table.columnManager.getWidth() + "px";
      } else {
        element.style.minWidth = "";
      }
    }
    rerenderRows(callback) {
      this.clearRows();
      if (callback) {
        callback();
      }
      this.renderRows();
      if (!this.rows().length) {
        this.table.rowManager.tableEmpty();
      }
    }
    scrollToRowNearestTop(row) {
      var rowTop = Helpers.elOffset(row.getElement()).top;
      return !(Math.abs(this.elementVertical.scrollTop - rowTop) > Math.abs(this.elementVertical.scrollTop + this.elementVertical.clientHeight - rowTop));
    }
    scrollToRow(row) {
      var rowEl = row.getElement();
      this.elementVertical.scrollTop = Helpers.elOffset(rowEl).top - Helpers.elOffset(this.elementVertical).top + this.elementVertical.scrollTop;
    }
    visibleRows(includingBuffer) {
      return this.rows();
    }
  };
  var VirtualDomVertical = class extends Renderer {
    constructor(table) {
      super(table);
      this.verticalFillMode = "fill";
      this.scrollTop = 0;
      this.scrollLeft = 0;
      this.vDomRowHeight = 20;
      this.vDomTop = 0;
      this.vDomBottom = 0;
      this.vDomScrollPosTop = 0;
      this.vDomScrollPosBottom = 0;
      this.vDomTopPad = 0;
      this.vDomBottomPad = 0;
      this.vDomMaxRenderChain = 90;
      this.vDomWindowBuffer = 0;
      this.vDomWindowMinTotalRows = 20;
      this.vDomWindowMinMarginRows = 5;
      this.vDomTopNewRows = [];
      this.vDomBottomNewRows = [];
    }
    //////////////////////////////////////
    ///////// Public Functions ///////////
    //////////////////////////////////////
    clearRows() {
      var element = this.tableElement;
      while (element.firstChild) element.removeChild(element.firstChild);
      element.style.paddingTop = "";
      element.style.paddingBottom = "";
      element.style.minHeight = "";
      element.style.display = "";
      element.style.visibility = "";
      this.elementVertical.scrollTop = 0;
      this.elementVertical.scrollLeft = 0;
      this.scrollTop = 0;
      this.scrollLeft = 0;
      this.vDomTop = 0;
      this.vDomBottom = 0;
      this.vDomTopPad = 0;
      this.vDomBottomPad = 0;
      this.vDomScrollPosTop = 0;
      this.vDomScrollPosBottom = 0;
    }
    renderRows() {
      this._virtualRenderFill();
    }
    rerenderRows(callback) {
      var scrollTop = this.elementVertical.scrollTop;
      var topRow = false;
      var topOffset = false;
      var left = this.table.rowManager.scrollLeft;
      var rows = this.rows();
      for (var i = this.vDomTop; i <= this.vDomBottom; i++) {
        if (rows[i]) {
          var diff = scrollTop - rows[i].getElement().offsetTop;
          if (topOffset === false || Math.abs(diff) < topOffset) {
            topOffset = diff;
            topRow = i;
          } else {
            break;
          }
        }
      }
      rows.forEach((row) => {
        row.deinitializeHeight();
      });
      if (callback) {
        callback();
      }
      if (this.rows().length) {
        this._virtualRenderFill(topRow === false ? this.rows.length - 1 : topRow, true, topOffset || 0);
      } else {
        this.clear();
        this.table.rowManager.tableEmpty();
      }
      this.scrollColumns(left);
    }
    scrollColumns(left) {
      this.table.rowManager.scrollHorizontal(left);
    }
    scrollRows(top, dir) {
      var topDiff = top - this.vDomScrollPosTop;
      var bottomDiff = top - this.vDomScrollPosBottom;
      var margin = this.vDomWindowBuffer * 2;
      var rows = this.rows();
      this.scrollTop = top;
      if (-topDiff > margin || bottomDiff > margin) {
        var left = this.table.rowManager.scrollLeft;
        this._virtualRenderFill(Math.floor(this.elementVertical.scrollTop / this.elementVertical.scrollHeight * rows.length));
        this.scrollColumns(left);
      } else {
        if (dir) {
          if (topDiff < 0) {
            this._addTopRow(rows, -topDiff);
          }
          if (bottomDiff < 0) {
            if (this.vDomScrollHeight - this.scrollTop > this.vDomWindowBuffer) {
              this._removeBottomRow(rows, -bottomDiff);
            } else {
              this.vDomScrollPosBottom = this.scrollTop;
            }
          }
        } else {
          if (bottomDiff >= 0) {
            this._addBottomRow(rows, bottomDiff);
          }
          if (topDiff >= 0) {
            if (this.scrollTop > this.vDomWindowBuffer) {
              this._removeTopRow(rows, topDiff);
            } else {
              this.vDomScrollPosTop = this.scrollTop;
            }
          }
        }
      }
    }
    resize() {
      this.vDomWindowBuffer = this.table.options.renderVerticalBuffer || this.elementVertical.clientHeight;
    }
    scrollToRowNearestTop(row) {
      var rowIndex = this.rows().indexOf(row);
      return !(Math.abs(this.vDomTop - rowIndex) > Math.abs(this.vDomBottom - rowIndex));
    }
    scrollToRow(row) {
      var index = this.rows().indexOf(row);
      if (index > -1) {
        this._virtualRenderFill(index, true);
      }
    }
    visibleRows(includingBuffer) {
      var topEdge = this.elementVertical.scrollTop, bottomEdge = this.elementVertical.clientHeight + topEdge, topFound = false, topRow = 0, bottomRow = 0, rows = this.rows();
      if (includingBuffer) {
        topRow = this.vDomTop;
        bottomRow = this.vDomBottom;
      } else {
        for (var i = this.vDomTop; i <= this.vDomBottom; i++) {
          if (rows[i]) {
            if (!topFound) {
              if (topEdge - rows[i].getElement().offsetTop >= 0) {
                topRow = i;
              } else {
                topFound = true;
                if (bottomEdge - rows[i].getElement().offsetTop >= 0) {
                  bottomRow = i;
                } else {
                  break;
                }
              }
            } else {
              if (bottomEdge - rows[i].getElement().offsetTop >= 0) {
                bottomRow = i;
              } else {
                break;
              }
            }
          }
        }
      }
      return rows.slice(topRow, bottomRow + 1);
    }
    //////////////////////////////////////
    //////// Internal Rendering //////////
    //////////////////////////////////////
    //full virtual render
    _virtualRenderFill(position, forceMove, offset) {
      var element = this.tableElement, holder = this.elementVertical, topPad = 0, rowsHeight = 0, rowHeight = 0, heightOccupied = 0, topPadHeight = 0, i = 0, rows = this.rows(), rowsCount = rows.length, index = 0, row, rowFragment, renderedRows = [], totalRowsRendered = 0, rowsToRender = 0, fixedHeight = this.table.rowManager.fixedHeight, containerHeight = this.elementVertical.clientHeight, avgRowHeight = this.table.options.rowHeight, resized = true;
      position = position || 0;
      offset = offset || 0;
      if (!position) {
        this.clear();
      } else {
        while (element.firstChild) element.removeChild(element.firstChild);
        heightOccupied = (rowsCount - position + 1) * this.vDomRowHeight;
        if (heightOccupied < containerHeight) {
          position -= Math.ceil((containerHeight - heightOccupied) / this.vDomRowHeight);
          if (position < 0) {
            position = 0;
          }
        }
        topPad = Math.min(Math.max(Math.floor(this.vDomWindowBuffer / this.vDomRowHeight), this.vDomWindowMinMarginRows), position);
        position -= topPad;
      }
      if (rowsCount && Helpers.elVisible(this.elementVertical)) {
        this.vDomTop = position;
        this.vDomBottom = position - 1;
        if (fixedHeight || this.table.options.maxHeight) {
          if (avgRowHeight) {
            rowsToRender = containerHeight / avgRowHeight + this.vDomWindowBuffer / avgRowHeight;
          }
          rowsToRender = Math.max(this.vDomWindowMinTotalRows, Math.ceil(rowsToRender));
        } else {
          rowsToRender = rowsCount;
        }
        while ((rowsToRender == rowsCount || rowsHeight <= containerHeight + this.vDomWindowBuffer || totalRowsRendered < this.vDomWindowMinTotalRows) && this.vDomBottom < rowsCount - 1) {
          renderedRows = [];
          rowFragment = document.createDocumentFragment();
          i = 0;
          while (i < rowsToRender && this.vDomBottom < rowsCount - 1) {
            index = this.vDomBottom + 1, row = rows[index];
            this.styleRow(row, index);
            row.initialize(false, true);
            if (!row.heightInitialized && !this.table.options.rowHeight) {
              row.clearCellHeight();
            }
            rowFragment.appendChild(row.getElement());
            renderedRows.push(row);
            this.vDomBottom++;
            i++;
          }
          if (!renderedRows.length) {
            break;
          }
          element.appendChild(rowFragment);
          renderedRows.forEach((row2) => {
            row2.rendered();
          });
          const rowsNeedingHeightInit = [];
          renderedRows.forEach((row2) => {
            if (!row2.heightInitialized || !row2.getHeight()) {
              row2.calcHeight(true);
              rowsNeedingHeightInit.push(row2);
            }
          });
          rowsNeedingHeightInit.forEach((row2) => {
            row2.setCellHeight();
          });
          renderedRows.forEach((row2) => {
            rowHeight = row2.getHeight() || this.vDomRowHeight;
            if (totalRowsRendered < topPad) {
              topPadHeight += rowHeight;
            } else {
              rowsHeight += rowHeight;
            }
            if (rowHeight > this.vDomWindowBuffer) {
              this.vDomWindowBuffer = rowHeight * 2;
            }
            totalRowsRendered++;
          });
          resized = this.table.rowManager.adjustTableSize();
          containerHeight = this.elementVertical.clientHeight;
          if (resized && (fixedHeight || this.table.options.maxHeight)) {
            avgRowHeight = rowsHeight / totalRowsRendered;
            rowsToRender = Math.max(this.vDomWindowMinTotalRows, Math.ceil(containerHeight / avgRowHeight + this.vDomWindowBuffer / avgRowHeight));
          }
        }
        if (!position) {
          this.vDomTopPad = 0;
          this.vDomRowHeight = Math.floor((rowsHeight + topPadHeight) / totalRowsRendered);
          this.vDomBottomPad = this.vDomRowHeight * (rowsCount - this.vDomBottom - 1);
          this.vDomScrollHeight = topPadHeight + rowsHeight + this.vDomBottomPad - containerHeight;
        } else {
          this.vDomTopPad = !forceMove ? this.scrollTop - topPadHeight : this.vDomRowHeight * this.vDomTop + offset;
          this.vDomBottomPad = this.vDomBottom == rowsCount - 1 ? 0 : Math.max(this.vDomScrollHeight - this.vDomTopPad - rowsHeight - topPadHeight, 0);
        }
        element.style.paddingTop = this.vDomTopPad + "px";
        element.style.paddingBottom = this.vDomBottomPad + "px";
        if (forceMove) {
          this.scrollTop = this.vDomTopPad + topPadHeight + offset - (this.elementVertical.scrollWidth > this.elementVertical.clientWidth ? this.elementVertical.offsetHeight - containerHeight : 0);
        }
        this.scrollTop = Math.min(this.scrollTop, this.elementVertical.scrollHeight - containerHeight);
        if (this.elementVertical.scrollWidth > this.elementVertical.clientWidth && forceMove) {
          this.scrollTop += this.elementVertical.offsetHeight - containerHeight;
        }
        this.vDomScrollPosTop = this.scrollTop;
        this.vDomScrollPosBottom = this.scrollTop;
        holder.scrollTop = this.scrollTop;
        this.dispatch("render-virtual-fill");
      }
    }
    _addTopRow(rows, fillableSpace) {
      var table = this.tableElement, addedRows = [], paddingAdjust = 0, index = this.vDomTop - 1, i = 0, working = true;
      while (working) {
        if (this.vDomTop) {
          let row = rows[index], rowHeight, initialized;
          if (row && i < this.vDomMaxRenderChain) {
            rowHeight = row.getHeight() || this.vDomRowHeight;
            initialized = row.initialized;
            if (fillableSpace >= rowHeight) {
              this.styleRow(row, index);
              table.insertBefore(row.getElement(), table.firstChild);
              if (!row.initialized || !row.heightInitialized) {
                addedRows.push(row);
              }
              row.initialize();
              if (!initialized) {
                rowHeight = row.getElement().offsetHeight;
                if (rowHeight > this.vDomWindowBuffer) {
                  this.vDomWindowBuffer = rowHeight * 2;
                }
              }
              fillableSpace -= rowHeight;
              paddingAdjust += rowHeight;
              this.vDomTop--;
              index--;
              i++;
            } else {
              working = false;
            }
          } else {
            working = false;
          }
        } else {
          working = false;
        }
      }
      for (let row of addedRows) {
        row.clearCellHeight();
      }
      this._quickNormalizeRowHeight(addedRows);
      if (paddingAdjust) {
        this.vDomTopPad -= paddingAdjust;
        if (this.vDomTopPad < 0) {
          this.vDomTopPad = index * this.vDomRowHeight;
        }
        if (index < 1) {
          this.vDomTopPad = 0;
        }
        table.style.paddingTop = this.vDomTopPad + "px";
        this.vDomScrollPosTop -= paddingAdjust;
      }
    }
    _removeTopRow(rows, fillableSpace) {
      var removableRows = [], paddingAdjust = 0, i = 0, working = true;
      while (working) {
        let row = rows[this.vDomTop], rowHeight;
        if (row && i < this.vDomMaxRenderChain) {
          rowHeight = row.getHeight() || this.vDomRowHeight;
          if (fillableSpace >= rowHeight) {
            this.vDomTop++;
            fillableSpace -= rowHeight;
            paddingAdjust += rowHeight;
            removableRows.push(row);
            i++;
          } else {
            working = false;
          }
        } else {
          working = false;
        }
      }
      for (let row of removableRows) {
        let rowEl = row.getElement();
        if (rowEl.parentNode) {
          rowEl.parentNode.removeChild(rowEl);
        }
      }
      if (paddingAdjust) {
        this.vDomTopPad += paddingAdjust;
        this.tableElement.style.paddingTop = this.vDomTopPad + "px";
        this.vDomScrollPosTop += this.vDomTop ? paddingAdjust : paddingAdjust + this.vDomWindowBuffer;
      }
    }
    _addBottomRow(rows, fillableSpace) {
      var table = this.tableElement, addedRows = [], paddingAdjust = 0, index = this.vDomBottom + 1, i = 0, working = true;
      while (working) {
        let row = rows[index], rowHeight, initialized;
        if (row && i < this.vDomMaxRenderChain) {
          rowHeight = row.getHeight() || this.vDomRowHeight;
          initialized = row.initialized;
          if (fillableSpace >= rowHeight) {
            this.styleRow(row, index);
            table.appendChild(row.getElement());
            if (!row.initialized || !row.heightInitialized) {
              addedRows.push(row);
            }
            row.initialize();
            if (!initialized) {
              rowHeight = row.getElement().offsetHeight;
              if (rowHeight > this.vDomWindowBuffer) {
                this.vDomWindowBuffer = rowHeight * 2;
              }
            }
            fillableSpace -= rowHeight;
            paddingAdjust += rowHeight;
            this.vDomBottom++;
            index++;
            i++;
          } else {
            working = false;
          }
        } else {
          working = false;
        }
      }
      for (let row of addedRows) {
        row.clearCellHeight();
      }
      this._quickNormalizeRowHeight(addedRows);
      if (paddingAdjust) {
        this.vDomBottomPad -= paddingAdjust;
        if (this.vDomBottomPad < 0 || index == rows.length - 1) {
          this.vDomBottomPad = 0;
        }
        table.style.paddingBottom = this.vDomBottomPad + "px";
        this.vDomScrollPosBottom += paddingAdjust;
      }
    }
    _removeBottomRow(rows, fillableSpace) {
      var removableRows = [], paddingAdjust = 0, i = 0, working = true;
      while (working) {
        let row = rows[this.vDomBottom], rowHeight;
        if (row && i < this.vDomMaxRenderChain) {
          rowHeight = row.getHeight() || this.vDomRowHeight;
          if (fillableSpace >= rowHeight) {
            this.vDomBottom--;
            fillableSpace -= rowHeight;
            paddingAdjust += rowHeight;
            removableRows.push(row);
            i++;
          } else {
            working = false;
          }
        } else {
          working = false;
        }
      }
      for (let row of removableRows) {
        let rowEl = row.getElement();
        if (rowEl.parentNode) {
          rowEl.parentNode.removeChild(rowEl);
        }
      }
      if (paddingAdjust) {
        this.vDomBottomPad += paddingAdjust;
        if (this.vDomBottomPad < 0) {
          this.vDomBottomPad = 0;
        }
        this.tableElement.style.paddingBottom = this.vDomBottomPad + "px";
        this.vDomScrollPosBottom -= paddingAdjust;
      }
    }
    _quickNormalizeRowHeight(rows) {
      for (let row of rows) {
        row.calcHeight();
      }
      for (let row of rows) {
        row.setCellHeight();
      }
    }
  };
  var RowManager = class extends CoreFeature {
    constructor(table) {
      super(table);
      this.element = this.createHolderElement();
      this.tableElement = this.createTableElement();
      this.heightFixer = this.createTableElement();
      this.placeholder = null;
      this.placeholderContents = null;
      this.firstRender = false;
      this.renderMode = "virtual";
      this.fixedHeight = false;
      this.rows = [];
      this.activeRowsPipeline = [];
      this.activeRows = [];
      this.activeRowsCount = 0;
      this.displayRows = [];
      this.displayRowsCount = 0;
      this.scrollTop = 0;
      this.scrollLeft = 0;
      this.redrawBlock = false;
      this.redrawBlockRestoreConfig = false;
      this.redrawBlockRenderInPosition = false;
      this.dataPipeline = [];
      this.displayPipeline = [];
      this.scrollbarWidth = 0;
      this.renderer = null;
    }
    //////////////// Setup Functions /////////////////
    createHolderElement() {
      var el = document.createElement("div");
      el.classList.add("tabulator-tableholder");
      el.setAttribute("tabindex", 0);
      return el;
    }
    createTableElement() {
      var el = document.createElement("div");
      el.classList.add("tabulator-table");
      el.setAttribute("role", "rowgroup");
      el.setAttribute("id", "tabulator-table-body");
      return el;
    }
    initializePlaceholder() {
      var placeholder = this.table.options.placeholder;
      if (typeof placeholder === "function") {
        placeholder = placeholder.call(this.table);
      }
      placeholder = this.chain("placeholder", [placeholder], placeholder, placeholder) || placeholder;
      if (placeholder) {
        let el = document.createElement("div");
        el.classList.add("tabulator-placeholder");
        if (typeof placeholder == "string") {
          let contents = document.createElement("div");
          contents.classList.add("tabulator-placeholder-contents");
          contents.innerHTML = placeholder;
          el.appendChild(contents);
          this.placeholderContents = contents;
        } else if (typeof HTMLElement !== "undefined" && placeholder instanceof HTMLElement) {
          el.appendChild(placeholder);
          this.placeholderContents = placeholder;
        } else {
          console.warn("Invalid placeholder provided, must be string or HTML Element", placeholder);
          this.el = null;
        }
        this.placeholder = el;
      }
    }
    //return containing element
    getElement() {
      return this.element;
    }
    //return table element
    getTableElement() {
      return this.tableElement;
    }
    initialize() {
      this.initializePlaceholder();
      this.initializeRenderer();
      this.element.appendChild(this.tableElement);
      this.firstRender = true;
      this.element.addEventListener("scroll", () => {
        var left = this.element.scrollLeft, leftDir = this.scrollLeft > left, top = this.element.scrollTop, topDir = this.scrollTop > top;
        if (this.scrollLeft != left) {
          this.scrollLeft = left;
          this.dispatch("scroll-horizontal", left, leftDir);
          this.dispatchExternal("scrollHorizontal", left, leftDir);
          this._positionPlaceholder();
        }
        if (this.scrollTop != top) {
          this.scrollTop = top;
          this.renderer.scrollRows(top, topDir);
          this.dispatch("scroll-vertical", top, topDir);
          this.dispatchExternal("scrollVertical", top, topDir);
        }
      });
    }
    ////////////////// Row Manipulation //////////////////
    findRow(subject) {
      if (typeof subject == "object") {
        if (subject instanceof Row) {
          return subject;
        } else if (subject instanceof RowComponent) {
          return subject._getSelf() || false;
        } else if (typeof HTMLElement !== "undefined" && subject instanceof HTMLElement) {
          let match = this.rows.find((row) => {
            return row.getElement() === subject;
          });
          return match || false;
        } else if (subject === null) {
          return false;
        }
      } else if (typeof subject == "undefined") {
        return false;
      } else {
        let match = this.rows.find((row) => {
          return row.data[this.table.options.index] == subject;
        });
        return match || false;
      }
      return false;
    }
    getRowFromDataObject(data) {
      var match = this.rows.find((row) => {
        return row.data === data;
      });
      return match || false;
    }
    getRowFromPosition(position) {
      return this.getDisplayRows().find((row) => {
        return row.type === "row" && row.getPosition() === position && row.isDisplayed();
      });
    }
    scrollToRow(row, position, ifVisible) {
      return this.renderer.scrollToRowPosition(row, position, ifVisible);
    }
    ////////////////// Data Handling //////////////////
    setData(data, renderInPosition, columnsChanged) {
      return new Promise((resolve, reject) => {
        if (renderInPosition && this.getDisplayRows().length) {
          if (this.table.options.pagination) {
            this._setDataActual(data, true);
          } else {
            this.reRenderInPosition(() => {
              this._setDataActual(data);
            });
          }
        } else {
          if (this.table.options.autoColumns && columnsChanged && this.table.initialized) {
            this.table.columnManager.generateColumnsFromRowData(data);
          }
          this.resetScroll();
          this._setDataActual(data);
        }
        resolve();
      });
    }
    _setDataActual(data, renderInPosition) {
      this.dispatchExternal("dataProcessing", data);
      this._wipeElements();
      if (Array.isArray(data)) {
        this.dispatch("data-processing", data);
        data.forEach((def, i) => {
          if (def && typeof def === "object") {
            var row = new Row(def, this);
            this.rows.push(row);
          } else {
            console.warn("Data Loading Warning - Invalid row data detected and ignored, expecting object but received:", def);
          }
        });
        this.refreshActiveData(false, false, renderInPosition);
        this.dispatch("data-processed", data);
        this.dispatchExternal("dataProcessed", data);
      } else {
        console.error("Data Loading Error - Unable to process data due to invalid data type \nExpecting: array \nReceived: ", typeof data, "\nData:     ", data);
      }
    }
    _wipeElements() {
      this.dispatch("rows-wipe");
      this.destroy();
      this.adjustTableSize();
      this.dispatch("rows-wiped");
    }
    destroy() {
      this.rows.forEach((row) => {
        row.wipe();
      });
      this.rows = [];
      this.activeRows = [];
      this.activeRowsPipeline = [];
      this.activeRowsCount = 0;
      this.displayRows = [];
      this.displayRowsCount = 0;
    }
    deleteRow(row, blockRedraw) {
      var allIndex = this.rows.indexOf(row), activeIndex = this.activeRows.indexOf(row);
      if (activeIndex > -1) {
        this.activeRows.splice(activeIndex, 1);
      }
      if (allIndex > -1) {
        this.rows.splice(allIndex, 1);
      }
      this.setActiveRows(this.activeRows);
      this.displayRowIterator((rows) => {
        var displayIndex = rows.indexOf(row);
        if (displayIndex > -1) {
          rows.splice(displayIndex, 1);
        }
      });
      if (!blockRedraw) {
        this.reRenderInPosition();
      }
      this.regenerateRowPositions();
      this.dispatchExternal("rowDeleted", row.getComponent());
      if (!this.displayRowsCount) {
        this.tableEmpty();
      }
      if (this.subscribedExternal("dataChanged")) {
        this.dispatchExternal("dataChanged", this.getData());
      }
    }
    addRow(data, pos, index, blockRedraw) {
      var row = this.addRowActual(data, pos, index, blockRedraw);
      return row;
    }
    //add multiple rows
    addRows(data, pos, index, refreshDisplayOnly) {
      var rows = [];
      return new Promise((resolve, reject) => {
        pos = this.findAddRowPos(pos);
        if (!Array.isArray(data)) {
          data = [data];
        }
        if (typeof index == "undefined" && pos || typeof index !== "undefined" && !pos) {
          data.reverse();
        }
        data.forEach((item, i) => {
          var row = this.addRow(item, pos, index, true);
          rows.push(row);
          this.dispatch("row-added", row, item, pos, index);
        });
        this.refreshActiveData(refreshDisplayOnly ? "displayPipeline" : false, false, true);
        this.regenerateRowPositions();
        if (this.displayRowsCount) {
          this._clearPlaceholder();
        }
        resolve(rows);
      });
    }
    findAddRowPos(pos) {
      if (typeof pos === "undefined") {
        pos = this.table.options.addRowPos;
      }
      if (pos === "pos") {
        pos = true;
      }
      if (pos === "bottom") {
        pos = false;
      }
      return pos;
    }
    addRowActual(data, pos, index, blockRedraw) {
      var row = data instanceof Row ? data : new Row(data || {}, this), top = this.findAddRowPos(pos), allIndex = -1, activeIndex, chainResult;
      if (!index) {
        chainResult = this.chain("row-adding-position", [row, top], null, { index, top });
        index = chainResult.index;
        top = chainResult.top;
      }
      if (typeof index !== "undefined") {
        index = this.findRow(index);
      }
      index = this.chain("row-adding-index", [row, index, top], null, index);
      if (index) {
        allIndex = this.rows.indexOf(index);
      }
      if (index && allIndex > -1) {
        activeIndex = this.activeRows.indexOf(index);
        this.displayRowIterator(function(rows) {
          var displayIndex = rows.indexOf(index);
          if (displayIndex > -1) {
            rows.splice(top ? displayIndex : displayIndex + 1, 0, row);
          }
        });
        if (activeIndex > -1) {
          this.activeRows.splice(top ? activeIndex : activeIndex + 1, 0, row);
        }
        this.rows.splice(top ? allIndex : allIndex + 1, 0, row);
      } else {
        if (top) {
          this.displayRowIterator(function(rows) {
            rows.unshift(row);
          });
          this.activeRows.unshift(row);
          this.rows.unshift(row);
        } else {
          this.displayRowIterator(function(rows) {
            rows.push(row);
          });
          this.activeRows.push(row);
          this.rows.push(row);
        }
      }
      this.setActiveRows(this.activeRows);
      this.dispatchExternal("rowAdded", row.getComponent());
      if (this.subscribedExternal("dataChanged")) {
        this.dispatchExternal("dataChanged", this.table.rowManager.getData());
      }
      if (!blockRedraw) {
        this.reRenderInPosition();
      }
      return row;
    }
    moveRow(from, to, after) {
      this.dispatch("row-move", from, to, after);
      this.moveRowActual(from, to, after);
      this.regenerateRowPositions();
      this.dispatch("row-moved", from, to, after);
      this.dispatchExternal("rowMoved", from.getComponent());
    }
    moveRowActual(from, to, after) {
      this.moveRowInArray(this.rows, from, to, after);
      this.moveRowInArray(this.activeRows, from, to, after);
      this.displayRowIterator((rows) => {
        this.moveRowInArray(rows, from, to, after);
      });
      this.dispatch("row-moving", from, to, after);
    }
    moveRowInArray(rows, from, to, after) {
      var fromIndex, toIndex, start, end;
      if (from !== to) {
        fromIndex = rows.indexOf(from);
        if (fromIndex > -1) {
          rows.splice(fromIndex, 1);
          toIndex = rows.indexOf(to);
          if (toIndex > -1) {
            if (after) {
              rows.splice(toIndex + 1, 0, from);
            } else {
              rows.splice(toIndex, 0, from);
            }
          } else {
            rows.splice(fromIndex, 0, from);
          }
        }
        if (rows === this.getDisplayRows()) {
          start = fromIndex < toIndex ? fromIndex : toIndex;
          end = toIndex > fromIndex ? toIndex : fromIndex + 1;
          for (let i = start; i <= end; i++) {
            if (rows[i]) {
              this.styleRow(rows[i], i);
            }
          }
        }
      }
    }
    clearData() {
      this.setData([]);
    }
    getRowIndex(row) {
      return this.findRowIndex(row, this.rows);
    }
    getDisplayRowIndex(row) {
      var index = this.getDisplayRows().indexOf(row);
      return index > -1 ? index : false;
    }
    nextDisplayRow(row, rowOnly) {
      var index = this.getDisplayRowIndex(row), nextRow = false;
      if (index !== false && index < this.displayRowsCount - 1) {
        nextRow = this.getDisplayRows()[index + 1];
      }
      if (nextRow && (!(nextRow instanceof Row) || nextRow.type != "row")) {
        return this.nextDisplayRow(nextRow, rowOnly);
      }
      return nextRow;
    }
    prevDisplayRow(row, rowOnly) {
      var index = this.getDisplayRowIndex(row), prevRow = false;
      if (index) {
        prevRow = this.getDisplayRows()[index - 1];
      }
      if (rowOnly && prevRow && (!(prevRow instanceof Row) || prevRow.type != "row")) {
        return this.prevDisplayRow(prevRow, rowOnly);
      }
      return prevRow;
    }
    findRowIndex(row, list2) {
      var rowIndex;
      row = this.findRow(row);
      if (row) {
        rowIndex = list2.indexOf(row);
        if (rowIndex > -1) {
          return rowIndex;
        }
      }
      return false;
    }
    getData(active, transform) {
      var output = [], rows = this.getRows(active);
      rows.forEach(function(row) {
        if (row.type == "row") {
          output.push(row.getData(transform || "data"));
        }
      });
      return output;
    }
    getComponents(active) {
      var output = [], rows = this.getRows(active);
      rows.forEach(function(row) {
        output.push(row.getComponent());
      });
      return output;
    }
    getDataCount(active) {
      var rows = this.getRows(active);
      return rows.length;
    }
    scrollHorizontal(left) {
      this.scrollLeft = left;
      this.element.scrollLeft = left;
      this.dispatch("scroll-horizontal", left);
    }
    registerDataPipelineHandler(handler, priority) {
      if (typeof priority !== "undefined") {
        this.dataPipeline.push({ handler, priority });
        this.dataPipeline.sort((a, b) => {
          return a.priority - b.priority;
        });
      } else {
        console.error("Data pipeline handlers must have a priority in order to be registered");
      }
    }
    registerDisplayPipelineHandler(handler, priority) {
      if (typeof priority !== "undefined") {
        this.displayPipeline.push({ handler, priority });
        this.displayPipeline.sort((a, b) => {
          return a.priority - b.priority;
        });
      } else {
        console.error("Display pipeline handlers must have a priority in order to be registered");
      }
    }
    //set active data set
    refreshActiveData(handler, skipStage, renderInPosition) {
      var table = this.table, stage = "", index = 0, cascadeOrder = ["all", "dataPipeline", "display", "displayPipeline", "end"];
      if (!this.table.destroyed) {
        if (typeof handler === "function") {
          index = this.dataPipeline.findIndex((item) => {
            return item.handler === handler;
          });
          if (index > -1) {
            stage = "dataPipeline";
            if (skipStage) {
              if (index == this.dataPipeline.length - 1) {
                stage = "display";
              } else {
                index++;
              }
            }
          } else {
            index = this.displayPipeline.findIndex((item) => {
              return item.handler === handler;
            });
            if (index > -1) {
              stage = "displayPipeline";
              if (skipStage) {
                if (index == this.displayPipeline.length - 1) {
                  stage = "end";
                } else {
                  index++;
                }
              }
            } else {
              console.error("Unable to refresh data, invalid handler provided", handler);
              return;
            }
          }
        } else {
          stage = handler || "all";
          index = 0;
        }
        if (this.redrawBlock) {
          if (!this.redrawBlockRestoreConfig || this.redrawBlockRestoreConfig && (this.redrawBlockRestoreConfig.stage === stage && index < this.redrawBlockRestoreConfig.index || cascadeOrder.indexOf(stage) < cascadeOrder.indexOf(this.redrawBlockRestoreConfig.stage))) {
            this.redrawBlockRestoreConfig = {
              handler,
              skipStage,
              renderInPosition,
              stage,
              index
            };
          }
          return;
        } else {
          if (Helpers.elVisible(this.element)) {
            if (renderInPosition) {
              this.reRenderInPosition(this.refreshPipelines.bind(this, handler, stage, index, renderInPosition));
            } else {
              this.refreshPipelines(handler, stage, index, renderInPosition);
              if (!handler) {
                this.table.columnManager.renderer.renderColumns();
              }
              this.renderTable();
              if (table.options.layoutColumnsOnNewData) {
                this.table.columnManager.redraw(true);
              }
            }
          } else {
            this.refreshPipelines(handler, stage, index, renderInPosition);
          }
          this.dispatch("data-refreshed");
        }
      }
    }
    refreshPipelines(handler, stage, index, renderInPosition) {
      this.dispatch("data-refreshing");
      if (!handler || !this.activeRowsPipeline[0]) {
        this.activeRowsPipeline[0] = this.rows.slice(0);
      }
      switch (stage) {
        case "all":
        //handle case where all data needs refreshing
        case "dataPipeline":
          for (let i = index; i < this.dataPipeline.length; i++) {
            let result = this.dataPipeline[i].handler(this.activeRowsPipeline[i].slice(0));
            this.activeRowsPipeline[i + 1] = result || this.activeRowsPipeline[i].slice(0);
          }
          this.setActiveRows(this.activeRowsPipeline[this.dataPipeline.length]);
        case "display":
          index = 0;
          this.resetDisplayRows();
        case "displayPipeline":
          for (let i = index; i < this.displayPipeline.length; i++) {
            let result = this.displayPipeline[i].handler((i ? this.getDisplayRows(i - 1) : this.activeRows).slice(0), renderInPosition);
            this.setDisplayRows(result || this.getDisplayRows(i - 1).slice(0), i);
          }
        case "end":
          this.regenerateRowPositions();
      }
      if (this.getDisplayRows().length) {
        this._clearPlaceholder();
      }
    }
    //regenerate row positions
    regenerateRowPositions() {
      var rows = this.getDisplayRows();
      var index = 1;
      rows.forEach((row) => {
        if (row.type === "row") {
          row.setPosition(index);
          index++;
        }
      });
    }
    setActiveRows(activeRows) {
      this.activeRows = this.activeRows = Object.assign([], activeRows);
      this.activeRowsCount = this.activeRows.length;
    }
    //reset display rows array
    resetDisplayRows() {
      this.displayRows = [];
      this.displayRows.push(this.activeRows.slice(0));
      this.displayRowsCount = this.displayRows[0].length;
    }
    //set display row pipeline data
    setDisplayRows(displayRows, index) {
      this.displayRows[index] = displayRows;
      if (index == this.displayRows.length - 1) {
        this.displayRowsCount = this.displayRows[this.displayRows.length - 1].length;
      }
    }
    getDisplayRows(index) {
      if (typeof index == "undefined") {
        return this.displayRows.length ? this.displayRows[this.displayRows.length - 1] : [];
      } else {
        return this.displayRows[index] || [];
      }
    }
    getVisibleRows(chain, viewable) {
      var rows = Object.assign([], this.renderer.visibleRows(!viewable));
      if (chain) {
        rows = this.chain("rows-visible", [viewable], rows, rows);
      }
      return rows;
    }
    //repeat action across display rows
    displayRowIterator(callback) {
      this.activeRowsPipeline.forEach(callback);
      this.displayRows.forEach(callback);
      this.displayRowsCount = this.displayRows[this.displayRows.length - 1].length;
    }
    //return only actual rows (not group headers etc)
    getRows(type) {
      var rows = [];
      switch (type) {
        case "active":
          rows = this.activeRows;
          break;
        case "display":
          rows = this.table.rowManager.getDisplayRows();
          break;
        case "visible":
          rows = this.getVisibleRows(false, true);
          break;
        default:
          rows = this.chain("rows-retrieve", type, null, this.rows) || this.rows;
      }
      return rows;
    }
    ///////////////// Table Rendering /////////////////
    //trigger rerender of table in current position
    reRenderInPosition(callback) {
      if (this.redrawBlock) {
        if (callback) {
          callback();
        } else {
          this.redrawBlockRenderInPosition = true;
        }
      } else {
        this.dispatchExternal("renderStarted");
        this.renderer.rerenderRows(callback);
        if (!this.fixedHeight) {
          this.adjustTableSize();
        }
        this.scrollBarCheck();
        this.dispatchExternal("renderComplete");
      }
    }
    scrollBarCheck() {
      var scrollbarWidth = 0;
      if (this.element.scrollHeight > this.element.clientHeight) {
        scrollbarWidth = this.element.offsetWidth - this.element.clientWidth;
      }
      if (scrollbarWidth !== this.scrollbarWidth) {
        this.scrollbarWidth = scrollbarWidth;
        this.dispatch("scrollbar-vertical", scrollbarWidth);
      }
    }
    initializeRenderer() {
      var renderClass;
      var renderers = {
        "virtual": VirtualDomVertical,
        "basic": BasicVertical
      };
      if (typeof this.table.options.renderVertical === "string") {
        renderClass = renderers[this.table.options.renderVertical];
      } else {
        renderClass = this.table.options.renderVertical;
      }
      if (renderClass) {
        this.renderMode = this.table.options.renderVertical;
        this.renderer = new renderClass(this.table, this.element, this.tableElement);
        this.renderer.initialize();
        if ((this.table.element.clientHeight || this.table.options.height) && !(this.table.options.minHeight && this.table.options.maxHeight)) {
          this.fixedHeight = true;
        } else {
          this.fixedHeight = false;
        }
      } else {
        console.error("Unable to find matching renderer:", this.table.options.renderVertical);
      }
    }
    getRenderMode() {
      return this.renderMode;
    }
    renderTable() {
      this.dispatchExternal("renderStarted");
      this.element.scrollTop = 0;
      this._clearTable();
      if (this.displayRowsCount) {
        this.renderer.renderRows();
        if (this.firstRender) {
          this.firstRender = false;
          if (!this.fixedHeight) {
            this.adjustTableSize();
          }
          this.layoutRefresh(true);
        }
      } else {
        this.renderEmptyScroll();
      }
      if (!this.fixedHeight) {
        this.adjustTableSize();
      }
      this.dispatch("table-layout");
      if (!this.displayRowsCount) {
        this._showPlaceholder();
      }
      this.scrollBarCheck();
      this.dispatchExternal("renderComplete");
    }
    //show scrollbars on empty table div
    renderEmptyScroll() {
      if (this.placeholder) {
        this.tableElement.style.display = "none";
      } else {
        this.tableElement.style.minWidth = this.table.columnManager.getWidth() + "px";
      }
    }
    _clearTable() {
      this._clearPlaceholder();
      this.scrollTop = 0;
      this.scrollLeft = 0;
      this.renderer.clearRows();
    }
    tableEmpty() {
      this.renderEmptyScroll();
      this._showPlaceholder();
    }
    checkPlaceholder() {
      if (this.displayRowsCount) {
        this._clearPlaceholder();
      } else {
        this.tableEmpty();
      }
    }
    _showPlaceholder() {
      if (this.placeholder) {
        if (this.placeholder && this.placeholder.parentNode) {
          this.placeholder.parentNode.removeChild(this.placeholder);
        }
        this.initializePlaceholder();
        this.placeholder.setAttribute("tabulator-render-mode", this.renderMode);
        this.getElement().appendChild(this.placeholder);
        this._positionPlaceholder();
        this.adjustTableSize();
      }
    }
    _clearPlaceholder() {
      if (this.placeholder && this.placeholder.parentNode) {
        this.placeholder.parentNode.removeChild(this.placeholder);
      }
      this.tableElement.style.minWidth = "";
      this.tableElement.style.display = "";
    }
    _positionPlaceholder() {
      if (this.placeholder && this.placeholder.parentNode) {
        this.placeholder.style.width = this.table.columnManager.getWidth() + "px";
        this.placeholderContents.style.width = this.table.rowManager.element.clientWidth + "px";
        this.placeholderContents.style.marginLeft = this.scrollLeft + "px";
      }
    }
    styleRow(row, index) {
      var rowEl = row.getElement();
      if (index % 2) {
        rowEl.classList.add("tabulator-row-even");
        rowEl.classList.remove("tabulator-row-odd");
      } else {
        rowEl.classList.add("tabulator-row-odd");
        rowEl.classList.remove("tabulator-row-even");
      }
    }
    //normalize height of active rows
    normalizeHeight(force) {
      this.activeRows.forEach(function(row) {
        row.normalizeHeight(force);
      });
    }
    //adjust the height of the table holder to fit in the Tabulator element
    adjustTableSize() {
      let initialHeight = this.element.clientHeight, minHeight;
      let resized = false;
      if (this.renderer.verticalFillMode === "fill") {
        let otherHeight = Math.floor(this.table.columnManager.getElement().getBoundingClientRect().height + (this.table.footerManager && this.table.footerManager.active && !this.table.footerManager.external ? this.table.footerManager.getElement().getBoundingClientRect().height : 0));
        if (this.fixedHeight) {
          minHeight = isNaN(this.table.options.minHeight) ? this.table.options.minHeight : this.table.options.minHeight + "px";
          const height = "calc(100% - " + otherHeight + "px)";
          this.element.style.minHeight = minHeight || "calc(100% - " + otherHeight + "px)";
          this.element.style.height = height;
          this.element.style.maxHeight = height;
        } else {
          this.element.style.height = "";
          this.element.style.height = this.table.element.clientHeight - otherHeight + "px";
          this.element.scrollTop = this.scrollTop;
        }
        this.renderer.resize();
        if (!this.fixedHeight && initialHeight != this.element.clientHeight) {
          resized = true;
          if (!this.redrawing) {
            this.redrawing = true;
            if (this.subscribed("table-resize")) {
              this.dispatch("table-resize");
            } else {
              this.redraw();
            }
            this.redrawing = false;
          }
        }
        this.scrollBarCheck();
      }
      this._positionPlaceholder();
      return resized;
    }
    //reinitialize all rows
    reinitialize() {
      this.rows.forEach(function(row) {
        row.reinitialize(true);
      });
    }
    //prevent table from being redrawn
    blockRedraw() {
      this.redrawBlock = true;
      this.redrawBlockRestoreConfig = false;
    }
    //restore table redrawing
    restoreRedraw() {
      this.redrawBlock = false;
      if (this.redrawBlockRestoreConfig) {
        this.refreshActiveData(this.redrawBlockRestoreConfig.handler, this.redrawBlockRestoreConfig.skipStage, this.redrawBlockRestoreConfig.renderInPosition);
        this.redrawBlockRestoreConfig = false;
      } else {
        if (this.redrawBlockRenderInPosition) {
          this.reRenderInPosition();
        }
      }
      this.redrawBlockRenderInPosition = false;
    }
    //redraw table
    redraw(force) {
      this.adjustTableSize();
      this.table.tableWidth = this.table.element.clientWidth;
      if (!force) {
        this.reRenderInPosition();
        this.scrollHorizontal(this.scrollLeft);
      } else {
        this.renderTable();
      }
    }
    resetScroll() {
      this.element.scrollLeft = 0;
      this.element.scrollTop = 0;
      if (this.table.browser === "ie") {
        var event = document.createEvent("Event");
        event.initEvent("scroll", false, true);
        this.element.dispatchEvent(event);
      } else {
        this.element.dispatchEvent(new Event("scroll"));
      }
    }
  };
  var FooterManager = class extends CoreFeature {
    constructor(table) {
      super(table);
      this.active = false;
      this.element = this.createElement();
      this.containerElement = this.createContainerElement();
      this.external = false;
    }
    initialize() {
      this.initializeElement();
    }
    createElement() {
      var el = document.createElement("div");
      el.classList.add("tabulator-footer");
      return el;
    }
    createContainerElement() {
      var el = document.createElement("div");
      el.classList.add("tabulator-footer-contents");
      this.element.appendChild(el);
      return el;
    }
    initializeElement() {
      if (this.table.options.footerElement) {
        switch (typeof this.table.options.footerElement) {
          case "string":
            if (this.table.options.footerElement[0] === "<") {
              this.containerElement.innerHTML = this.table.options.footerElement;
            } else {
              this.external = true;
              this.containerElement = document.querySelector(this.table.options.footerElement);
            }
            break;
          default:
            this.element = this.table.options.footerElement;
            break;
        }
      }
    }
    getElement() {
      return this.element;
    }
    append(element) {
      this.activate();
      this.containerElement.appendChild(element);
      this.table.rowManager.adjustTableSize();
    }
    prepend(element) {
      this.activate();
      this.element.insertBefore(element, this.element.firstChild);
      this.table.rowManager.adjustTableSize();
    }
    remove(element) {
      element.parentNode.removeChild(element);
      this.deactivate();
    }
    deactivate(force) {
      if (!this.element.firstChild || force) {
        if (!this.external) {
          this.element.parentNode.removeChild(this.element);
        }
        this.active = false;
      }
    }
    activate() {
      if (!this.active) {
        this.active = true;
        if (!this.external) {
          this.table.element.appendChild(this.getElement());
          this.table.element.style.display = "";
        }
      }
    }
    redraw() {
      this.dispatch("footer-redraw");
    }
  };
  var InteractionManager = class extends CoreFeature {
    constructor(table) {
      super(table);
      this.el = null;
      this.abortClasses = ["tabulator-headers", "tabulator-table"];
      this.previousTargets = {};
      this.listeners = [
        "click",
        "dblclick",
        "contextmenu",
        "mouseenter",
        "mouseleave",
        "mouseover",
        "mouseout",
        "mousemove",
        "mouseup",
        "mousedown",
        "touchstart",
        "touchend"
      ];
      this.componentMap = {
        "tabulator-cell": "cell",
        "tabulator-row": "row",
        "tabulator-group": "group",
        "tabulator-col": "column"
      };
      this.pseudoTrackers = {
        "row": {
          subscriber: null,
          target: null
        },
        "cell": {
          subscriber: null,
          target: null
        },
        "group": {
          subscriber: null,
          target: null
        },
        "column": {
          subscriber: null,
          target: null
        }
      };
      this.pseudoTracking = false;
    }
    initialize() {
      this.el = this.table.element;
      this.buildListenerMap();
      this.bindSubscriptionWatchers();
    }
    buildListenerMap() {
      var listenerMap = {};
      this.listeners.forEach((listener) => {
        listenerMap[listener] = {
          handler: null,
          components: []
        };
      });
      this.listeners = listenerMap;
    }
    bindPseudoEvents() {
      Object.keys(this.pseudoTrackers).forEach((key) => {
        this.pseudoTrackers[key].subscriber = this.pseudoMouseEnter.bind(this, key);
        this.subscribe(key + "-mouseover", this.pseudoTrackers[key].subscriber);
      });
      this.pseudoTracking = true;
    }
    pseudoMouseEnter(key, e, target) {
      if (this.pseudoTrackers[key].target !== target) {
        if (this.pseudoTrackers[key].target) {
          this.dispatch(key + "-mouseleave", e, this.pseudoTrackers[key].target);
        }
        this.pseudoMouseLeave(key, e);
        this.pseudoTrackers[key].target = target;
        this.dispatch(key + "-mouseenter", e, target);
      }
    }
    pseudoMouseLeave(key, e) {
      var leaveList = Object.keys(this.pseudoTrackers), linkedKeys = {
        "row": ["cell"],
        "cell": ["row"]
      };
      leaveList = leaveList.filter((item) => {
        var links = linkedKeys[key];
        return item !== key && (!links || links && !links.includes(item));
      });
      leaveList.forEach((key2) => {
        var target = this.pseudoTrackers[key2].target;
        if (this.pseudoTrackers[key2].target) {
          this.dispatch(key2 + "-mouseleave", e, target);
          this.pseudoTrackers[key2].target = null;
        }
      });
    }
    bindSubscriptionWatchers() {
      var listeners = Object.keys(this.listeners), components = Object.values(this.componentMap);
      for (let comp of components) {
        for (let listener of listeners) {
          let key = comp + "-" + listener;
          this.subscriptionChange(key, this.subscriptionChanged.bind(this, comp, listener));
        }
      }
      this.subscribe("table-destroy", this.clearWatchers.bind(this));
    }
    subscriptionChanged(component, key, added) {
      var listener = this.listeners[key].components, index = listener.indexOf(component), changed = false;
      if (added) {
        if (index === -1) {
          listener.push(component);
          changed = true;
        }
      } else {
        if (!this.subscribed(component + "-" + key)) {
          if (index > -1) {
            listener.splice(index, 1);
            changed = true;
          }
        }
      }
      if ((key === "mouseenter" || key === "mouseleave") && !this.pseudoTracking) {
        this.bindPseudoEvents();
      }
      if (changed) {
        this.updateEventListeners();
      }
    }
    updateEventListeners() {
      for (let key in this.listeners) {
        let listener = this.listeners[key];
        if (listener.components.length) {
          if (!listener.handler) {
            listener.handler = this.track.bind(this, key);
            this.el.addEventListener(key, listener.handler);
          }
        } else {
          if (listener.handler) {
            this.el.removeEventListener(key, listener.handler);
            listener.handler = null;
          }
        }
      }
    }
    track(type, e) {
      var path = e.composedPath && e.composedPath() || e.path;
      var targets = this.findTargets(path);
      targets = this.bindComponents(type, targets);
      this.triggerEvents(type, e, targets);
      if (this.pseudoTracking && (type == "mouseover" || type == "mouseleave") && !Object.keys(targets).length) {
        this.pseudoMouseLeave("none", e);
      }
    }
    findTargets(path) {
      var targets = {};
      let componentMap = Object.keys(this.componentMap);
      for (let el of path) {
        let classList = el.classList ? [...el.classList] : [];
        let abort = classList.filter((item) => {
          return this.abortClasses.includes(item);
        });
        if (abort.length) {
          break;
        }
        let elTargets = classList.filter((item) => {
          return componentMap.includes(item);
        });
        for (let target of elTargets) {
          if (!targets[this.componentMap[target]]) {
            targets[this.componentMap[target]] = el;
          }
        }
      }
      if (targets.group && targets.group === targets.row) {
        delete targets.row;
      }
      return targets;
    }
    bindComponents(type, targets) {
      var keys = Object.keys(targets).reverse(), listener = this.listeners[type], matches = {}, output = {}, targetMatches = {};
      for (let key of keys) {
        let component, target = targets[key], previousTarget = this.previousTargets[key];
        if (previousTarget && previousTarget.target === target) {
          component = previousTarget.component;
        } else {
          switch (key) {
            case "row":
            case "group":
              if (listener.components.includes("row") || listener.components.includes("cell") || listener.components.includes("group")) {
                let rows = this.table.rowManager.getVisibleRows(true);
                component = rows.find((row) => {
                  return row.getElement() === target;
                });
                if (targets["row"] && targets["row"].parentNode && targets["row"].parentNode.closest(".tabulator-row")) {
                  targets[key] = false;
                }
              }
              break;
            case "column":
              if (listener.components.includes("column")) {
                component = this.table.columnManager.findColumn(target);
              }
              break;
            case "cell":
              if (listener.components.includes("cell")) {
                if (matches["row"] instanceof Row) {
                  component = matches["row"].findCell(target);
                } else {
                  if (targets["row"]) {
                    console.warn("Event Target Lookup Error - The row this cell is attached to cannot be found, has the table been reinitialized without being destroyed first?");
                  }
                }
              }
              break;
          }
        }
        if (component) {
          matches[key] = component;
          targetMatches[key] = {
            target,
            component
          };
        }
      }
      this.previousTargets = targetMatches;
      Object.keys(targets).forEach((key) => {
        let value = matches[key];
        output[key] = value;
      });
      return output;
    }
    triggerEvents(type, e, targets) {
      var listener = this.listeners[type];
      for (let key in targets) {
        if (targets[key] && listener.components.includes(key)) {
          this.dispatch(key + "-" + type, e, targets[key]);
        }
      }
    }
    clearWatchers() {
      for (let key in this.listeners) {
        let listener = this.listeners[key];
        if (listener.handler) {
          this.el.removeEventListener(key, listener.handler);
          listener.handler = null;
        }
      }
    }
  };
  var ComponentFunctionBinder = class {
    constructor(table) {
      this.table = table;
      this.bindings = {};
    }
    bind(type, funcName, handler) {
      if (!this.bindings[type]) {
        this.bindings[type] = {};
      }
      if (this.bindings[type][funcName]) {
        console.warn("Unable to bind component handler, a matching function name is already bound", type, funcName, handler);
      } else {
        this.bindings[type][funcName] = handler;
      }
    }
    handle(type, component, name) {
      if (this.bindings[type] && this.bindings[type][name] && typeof this.bindings[type][name].bind === "function") {
        return this.bindings[type][name].bind(null, component);
      } else {
        if (name !== "then" && typeof name === "string" && !name.startsWith("_")) {
          if (this.table.options.debugInvalidComponentFuncs) {
            console.error("The " + type + " component does not have a " + name + " function, have you checked that you have the correct Tabulator module installed?");
          }
        }
      }
    }
  };
  var DataLoader = class extends CoreFeature {
    constructor(table) {
      super(table);
      this.requestOrder = 0;
      this.loading = false;
    }
    initialize() {
    }
    load(data, params, config, replace, silent, columnsChanged) {
      var requestNo = ++this.requestOrder;
      if (this.table.destroyed) {
        return Promise.resolve();
      }
      this.dispatchExternal("dataLoading", data);
      if (data && (data.indexOf("{") == 0 || data.indexOf("[") == 0)) {
        data = JSON.parse(data);
      }
      if (this.confirm("data-loading", [data, params, config, silent])) {
        this.loading = true;
        if (!silent) {
          this.alertLoader();
        }
        params = this.chain("data-params", [data, config, silent], params || {}, params || {});
        params = this.mapParams(params, this.table.options.dataSendParams);
        var result = this.chain("data-load", [data, params, config, silent], false, Promise.resolve([]));
        return result.then((response) => {
          if (!this.table.destroyed) {
            if (!Array.isArray(response) && typeof response == "object") {
              response = this.mapParams(response, this.objectInvert(this.table.options.dataReceiveParams));
            }
            var rowData = this.chain("data-loaded", [response], null, response);
            if (requestNo == this.requestOrder) {
              this.clearAlert();
              if (rowData !== false) {
                this.dispatchExternal("dataLoaded", rowData);
                this.table.rowManager.setData(rowData, replace, typeof columnsChanged === "undefined" ? !replace : columnsChanged);
              }
            } else {
              console.warn("Data Load Response Blocked - An active data load request was blocked by an attempt to change table data while the request was being made");
            }
          } else {
            console.warn("Data Load Response Blocked - Table has been destroyed");
          }
        }).catch((error) => {
          console.error("Data Load Error: ", error);
          this.dispatchExternal("dataLoadError", error);
          if (!silent) {
            this.alertError();
          }
          setTimeout(() => {
            this.clearAlert();
          }, this.table.options.dataLoaderErrorTimeout);
        }).finally(() => {
          this.loading = false;
        });
      } else {
        this.dispatchExternal("dataLoaded", data);
        if (!data) {
          data = [];
        }
        this.table.rowManager.setData(data, replace, typeof columnsChanged === "undefined" ? !replace : columnsChanged);
        return Promise.resolve();
      }
    }
    mapParams(params, map) {
      var output = {};
      for (let key in params) {
        output[map.hasOwnProperty(key) ? map[key] : key] = params[key];
      }
      return output;
    }
    objectInvert(obj) {
      var output = {};
      for (let key in obj) {
        output[obj[key]] = key;
      }
      return output;
    }
    blockActiveLoad() {
      this.requestOrder++;
    }
    alertLoader() {
      var shouldLoad = typeof this.table.options.dataLoader === "function" ? this.table.options.dataLoader() : this.table.options.dataLoader;
      if (shouldLoad) {
        this.table.alertManager.alert(this.table.options.dataLoaderLoading || this.langText("data|loading"));
      }
    }
    alertError() {
      this.table.alertManager.alert(this.table.options.dataLoaderError || this.langText("data|error"), "error");
    }
    clearAlert() {
      this.table.alertManager.clear();
    }
  };
  var ExternalEventBus = class {
    constructor(table, optionsList, debug) {
      this.table = table;
      this.events = {};
      this.optionsList = optionsList || {};
      this.subscriptionNotifiers = {};
      this.dispatch = debug ? this._debugDispatch.bind(this) : this._dispatch.bind(this);
      this.debug = debug;
    }
    subscriptionChange(key, callback) {
      if (!this.subscriptionNotifiers[key]) {
        this.subscriptionNotifiers[key] = [];
      }
      this.subscriptionNotifiers[key].push(callback);
      if (this.subscribed(key)) {
        this._notifySubscriptionChange(key, true);
      }
    }
    subscribe(key, callback) {
      if (!this.events[key]) {
        this.events[key] = [];
      }
      this.events[key].push(callback);
      this._notifySubscriptionChange(key, true);
    }
    unsubscribe(key, callback) {
      var index;
      if (this.events[key]) {
        if (callback) {
          index = this.events[key].findIndex((item) => {
            return item === callback;
          });
          if (index > -1) {
            this.events[key].splice(index, 1);
          } else {
            console.warn("Cannot remove event, no matching event found:", key, callback);
            return;
          }
        } else {
          delete this.events[key];
        }
      } else {
        console.warn("Cannot remove event, no events set on:", key);
        return;
      }
      this._notifySubscriptionChange(key, false);
    }
    subscribed(key) {
      return this.events[key] && this.events[key].length;
    }
    _notifySubscriptionChange(key, subscribed) {
      var notifiers = this.subscriptionNotifiers[key];
      if (notifiers) {
        notifiers.forEach((callback) => {
          callback(subscribed);
        });
      }
    }
    _dispatch() {
      var args = Array.from(arguments), key = args.shift(), result;
      if (this.events[key]) {
        this.events[key].forEach((callback, i) => {
          let callResult = callback.apply(this.table, args);
          if (!i) {
            result = callResult;
          }
        });
      }
      return result;
    }
    _debugDispatch() {
      var args = Array.from(arguments), key = args[0];
      args[0] = "ExternalEvent:" + args[0];
      if (this.debug === true || this.debug.includes(key)) {
        console.log(...args);
      }
      return this._dispatch(...arguments);
    }
  };
  var InternalEventBus = class {
    constructor(debug) {
      this.events = {};
      this.subscriptionNotifiers = {};
      this.dispatch = debug ? this._debugDispatch.bind(this) : this._dispatch.bind(this);
      this.chain = debug ? this._debugChain.bind(this) : this._chain.bind(this);
      this.confirm = debug ? this._debugConfirm.bind(this) : this._confirm.bind(this);
      this.debug = debug;
    }
    subscriptionChange(key, callback) {
      if (!this.subscriptionNotifiers[key]) {
        this.subscriptionNotifiers[key] = [];
      }
      this.subscriptionNotifiers[key].push(callback);
      if (this.subscribed(key)) {
        this._notifySubscriptionChange(key, true);
      }
    }
    subscribe(key, callback, priority = 1e4) {
      if (!this.events[key]) {
        this.events[key] = [];
      }
      this.events[key].push({ callback, priority });
      this.events[key].sort((a, b) => {
        return a.priority - b.priority;
      });
      this._notifySubscriptionChange(key, true);
    }
    unsubscribe(key, callback) {
      var index;
      if (this.events[key]) {
        if (callback) {
          index = this.events[key].findIndex((item) => {
            return item.callback === callback;
          });
          if (index > -1) {
            this.events[key].splice(index, 1);
          } else {
            console.warn("Cannot remove event, no matching event found:", key, callback);
            return;
          }
        }
      } else {
        console.warn("Cannot remove event, no events set on:", key);
        return;
      }
      this._notifySubscriptionChange(key, false);
    }
    subscribed(key) {
      return this.events[key] && this.events[key].length;
    }
    _chain(key, args, initialValue, fallback) {
      var value = initialValue;
      if (!Array.isArray(args)) {
        args = [args];
      }
      if (this.subscribed(key)) {
        this.events[key].forEach((subscriber, i) => {
          value = subscriber.callback.apply(this, args.concat([value]));
        });
        return value;
      } else {
        return typeof fallback === "function" ? fallback() : fallback;
      }
    }
    _confirm(key, args) {
      var confirmed = false;
      if (!Array.isArray(args)) {
        args = [args];
      }
      if (this.subscribed(key)) {
        this.events[key].forEach((subscriber, i) => {
          if (subscriber.callback.apply(this, args)) {
            confirmed = true;
          }
        });
      }
      return confirmed;
    }
    _notifySubscriptionChange(key, subscribed) {
      var notifiers = this.subscriptionNotifiers[key];
      if (notifiers) {
        notifiers.forEach((callback) => {
          callback(subscribed);
        });
      }
    }
    _dispatch() {
      var args = Array.from(arguments), key = args.shift();
      if (this.events[key]) {
        this.events[key].forEach((subscriber) => {
          subscriber.callback.apply(this, args);
        });
      }
    }
    _debugDispatch() {
      var args = Array.from(arguments), key = args[0];
      args[0] = "InternalEvent:" + key;
      if (this.debug === true || this.debug.includes(key)) {
        console.log(...args);
      }
      return this._dispatch(...arguments);
    }
    _debugChain() {
      var args = Array.from(arguments), key = args[0];
      args[0] = "InternalEvent:" + key;
      if (this.debug === true || this.debug.includes(key)) {
        console.log(...args);
      }
      return this._chain(...arguments);
    }
    _debugConfirm() {
      var args = Array.from(arguments), key = args[0];
      args[0] = "InternalEvent:" + key;
      if (this.debug === true || this.debug.includes(key)) {
        console.log(...args);
      }
      return this._confirm(...arguments);
    }
  };
  var DeprecationAdvisor = class extends CoreFeature {
    constructor(table) {
      super(table);
    }
    _warnUser() {
      if (this.options("debugDeprecation")) {
        console.warn(...arguments);
      }
    }
    check(oldOption, newOption, convert) {
      var msg = "";
      if (typeof this.options(oldOption) !== "undefined") {
        msg = "Deprecated Setup Option - Use of the %c" + oldOption + "%c option is now deprecated";
        if (newOption) {
          msg = msg + ", Please use the %c" + newOption + "%c option instead";
          this._warnUser(msg, "font-weight: bold;", "font-weight: normal;", "font-weight: bold;", "font-weight: normal;");
          if (convert) {
            this.table.options[newOption] = this.table.options[oldOption];
          }
        } else {
          this._warnUser(msg, "font-weight: bold;", "font-weight: normal;");
        }
        return false;
      } else {
        return true;
      }
    }
    checkMsg(oldOption, msg) {
      if (typeof this.options(oldOption) !== "undefined") {
        this._warnUser("%cDeprecated Setup Option - Use of the %c" + oldOption + " %c option is now deprecated, " + msg, "font-weight: normal;", "font-weight: bold;", "font-weight: normal;");
        return false;
      } else {
        return true;
      }
    }
    msg(msg) {
      this._warnUser(msg);
    }
  };
  var DependencyRegistry = class extends CoreFeature {
    constructor(table) {
      super(table);
      this.deps = {};
      this.props = {};
    }
    initialize() {
      this.deps = Object.assign({}, this.options("dependencies"));
    }
    lookup(key, prop, silent) {
      if (Array.isArray(key)) {
        for (const item of key) {
          var match = this.lookup(item, prop, true);
          if (match) {
            break;
          }
        }
        if (match) {
          return match;
        } else {
          this.error(key);
        }
      } else {
        if (prop) {
          return this.lookupProp(key, prop, silent);
        } else {
          return this.lookupKey(key, silent);
        }
      }
    }
    lookupProp(key, prop, silent) {
      var dependency;
      if (this.props[key] && this.props[key][prop]) {
        return this.props[key][prop];
      } else {
        dependency = this.lookupKey(key, silent);
        if (dependency) {
          if (!this.props[key]) {
            this.props[key] = {};
          }
          this.props[key][prop] = dependency[prop] || dependency;
          return this.props[key][prop];
        }
      }
    }
    lookupKey(key, silent) {
      var dependency;
      if (this.deps[key]) {
        dependency = this.deps[key];
      } else if (window[key]) {
        this.deps[key] = window[key];
        dependency = this.deps[key];
      } else {
        if (!silent) {
          this.error(key);
        }
      }
      return dependency;
    }
    error(key) {
      console.error("Unable to find dependency", key, "Please check documentation and ensure you have imported the required library into your project");
    }
  };
  function fitData(columns, forced) {
    if (forced) {
      this.table.columnManager.renderer.reinitializeColumnWidths(columns);
    }
    if (this.table.options.responsiveLayout && this.table.modExists("responsiveLayout", true)) {
      this.table.modules.responsiveLayout.update();
    }
  }
  function fitDataGeneral(columns, forced) {
    columns.forEach(function(column) {
      column.reinitializeWidth();
    });
    if (this.table.options.responsiveLayout && this.table.modExists("responsiveLayout", true)) {
      this.table.modules.responsiveLayout.update();
    }
  }
  function fitDataStretch(columns, forced) {
    var colsWidth = 0, tableWidth = this.table.rowManager.element.clientWidth, gap = 0, lastCol = false;
    columns.forEach((column, i) => {
      if (!column.widthFixed) {
        column.reinitializeWidth();
      }
      if (this.table.options.responsiveLayout ? column.modules.responsive.visible : column.visible) {
        lastCol = column;
      }
      if (column.visible) {
        colsWidth += column.getWidth();
      }
    });
    if (lastCol) {
      gap = tableWidth - colsWidth + lastCol.getWidth();
      if (this.table.options.responsiveLayout && this.table.modExists("responsiveLayout", true)) {
        lastCol.setWidth(0);
        this.table.modules.responsiveLayout.update();
      }
      if (gap > 0) {
        lastCol.setWidth(gap);
      } else {
        lastCol.reinitializeWidth();
      }
    } else {
      if (this.table.options.responsiveLayout && this.table.modExists("responsiveLayout", true)) {
        this.table.modules.responsiveLayout.update();
      }
    }
  }
  function fitColumns(columns, forced) {
    var totalWidth = this.table.rowManager.element.getBoundingClientRect().width;
    var fixedWidth = 0;
    var flexWidth = 0;
    var flexGrowUnits = 0;
    var flexColWidth = 0;
    var flexColumns = [];
    var fixedShrinkColumns = [];
    var flexShrinkUnits = 0;
    var overflowWidth = 0;
    var gapFill = 0;
    function calcWidth(width) {
      var colWidth;
      if (typeof width == "string") {
        if (width.indexOf("%") > -1) {
          colWidth = totalWidth / 100 * parseInt(width);
        } else {
          colWidth = parseInt(width);
        }
      } else {
        colWidth = width;
      }
      return colWidth;
    }
    function scaleColumns(columns2, freeSpace, colWidth, shrinkCols) {
      var oversizeCols = [], oversizeSpace = 0, remainingSpace = 0, nextColWidth = 0, remainingFlexGrowUnits = flexGrowUnits, gap = 0, changeUnits = 0, undersizeCols = [];
      function calcGrow(col) {
        return colWidth * (col.column.definition.widthGrow || 1);
      }
      function calcShrink(col) {
        return calcWidth(col.width) - colWidth * (col.column.definition.widthShrink || 0);
      }
      columns2.forEach(function(col, i) {
        var width = shrinkCols ? calcShrink(col) : calcGrow(col);
        if (col.column.minWidth >= width) {
          oversizeCols.push(col);
        } else {
          if (col.column.maxWidth && col.column.maxWidth < width) {
            col.width = col.column.maxWidth;
            freeSpace -= col.column.maxWidth;
            remainingFlexGrowUnits -= shrinkCols ? col.column.definition.widthShrink || 1 : col.column.definition.widthGrow || 1;
            if (remainingFlexGrowUnits) {
              colWidth = Math.floor(freeSpace / remainingFlexGrowUnits);
            }
          } else {
            undersizeCols.push(col);
            changeUnits += shrinkCols ? col.column.definition.widthShrink || 1 : col.column.definition.widthGrow || 1;
          }
        }
      });
      if (oversizeCols.length) {
        oversizeCols.forEach(function(col) {
          oversizeSpace += shrinkCols ? col.width - col.column.minWidth : col.column.minWidth;
          col.width = col.column.minWidth;
        });
        remainingSpace = freeSpace - oversizeSpace;
        nextColWidth = changeUnits ? Math.floor(remainingSpace / changeUnits) : remainingSpace;
        gap = scaleColumns(undersizeCols, remainingSpace, nextColWidth, shrinkCols);
      } else {
        gap = changeUnits ? freeSpace - Math.floor(freeSpace / changeUnits) * changeUnits : freeSpace;
        undersizeCols.forEach(function(column) {
          column.width = shrinkCols ? calcShrink(column) : calcGrow(column);
        });
      }
      return gap;
    }
    if (this.table.options.responsiveLayout && this.table.modExists("responsiveLayout", true)) {
      this.table.modules.responsiveLayout.update();
    }
    if (this.table.rowManager.element.scrollHeight > this.table.rowManager.element.clientHeight) {
      totalWidth -= this.table.rowManager.element.offsetWidth - this.table.rowManager.element.clientWidth;
    }
    columns.forEach(function(column) {
      var width, minWidth, colWidth;
      if (column.visible) {
        width = column.definition.width;
        minWidth = parseInt(column.minWidth);
        if (width) {
          colWidth = calcWidth(width);
          fixedWidth += colWidth > minWidth ? colWidth : minWidth;
          if (column.definition.widthShrink) {
            fixedShrinkColumns.push({
              column,
              width: colWidth > minWidth ? colWidth : minWidth
            });
            flexShrinkUnits += column.definition.widthShrink;
          }
        } else {
          flexColumns.push({
            column,
            width: 0
          });
          flexGrowUnits += column.definition.widthGrow || 1;
        }
      }
    });
    flexWidth = totalWidth - fixedWidth;
    flexColWidth = Math.floor(flexWidth / flexGrowUnits);
    gapFill = scaleColumns(flexColumns, flexWidth, flexColWidth, false);
    if (flexColumns.length && gapFill > 0) {
      flexColumns[flexColumns.length - 1].width += gapFill;
    }
    flexColumns.forEach(function(col) {
      flexWidth -= col.width;
    });
    overflowWidth = Math.abs(gapFill) + flexWidth;
    if (overflowWidth > 0 && flexShrinkUnits) {
      gapFill = scaleColumns(fixedShrinkColumns, overflowWidth, Math.floor(overflowWidth / flexShrinkUnits), true);
    }
    if (gapFill && fixedShrinkColumns.length) {
      fixedShrinkColumns[fixedShrinkColumns.length - 1].width -= gapFill;
    }
    flexColumns.forEach(function(col) {
      col.column.setWidth(col.width);
    });
    fixedShrinkColumns.forEach(function(col) {
      col.column.setWidth(col.width);
    });
  }
  var defaultModes = {
    fitData,
    fitDataFill: fitDataGeneral,
    fitDataTable: fitDataGeneral,
    fitDataStretch,
    fitColumns
  };
  var _Layout = class _Layout extends Module {
    constructor(table) {
      super(table, "layout");
      this.mode = null;
      this.registerTableOption("layout", "fitData");
      this.registerTableOption("layoutColumnsOnNewData", false);
      this.registerColumnOption("widthGrow");
      this.registerColumnOption("widthShrink");
    }
    //initialize layout system
    initialize() {
      var layout = this.table.options.layout;
      if (_Layout.modes[layout]) {
        this.mode = layout;
      } else {
        console.warn("Layout Error - invalid mode set, defaulting to 'fitData' : " + layout);
        this.mode = "fitData";
      }
      this.table.element.setAttribute("tabulator-layout", this.mode);
      this.subscribe("column-init", this.initializeColumn.bind(this));
    }
    initializeColumn(column) {
      if (column.definition.widthGrow) {
        column.definition.widthGrow = Number(column.definition.widthGrow);
      }
      if (column.definition.widthShrink) {
        column.definition.widthShrink = Number(column.definition.widthShrink);
      }
    }
    getMode() {
      return this.mode;
    }
    //trigger table layout
    layout(dataChanged) {
      var variableHeight = this.table.columnManager.columnsByIndex.find((column) => column.definition.variableHeight || column.definition.formatter === "textarea");
      this.dispatch("layout-refreshing");
      _Layout.modes[this.mode].call(this, this.table.columnManager.columnsByIndex, dataChanged);
      if (variableHeight) {
        this.table.rowManager.normalizeHeight(true);
      }
      this.dispatch("layout-refreshed");
    }
  };
  __publicField(_Layout, "moduleName", "layout");
  //load defaults
  __publicField(_Layout, "modes", defaultModes);
  var Layout = _Layout;
  var defaultLangs = {
    "default": {
      //hold default locale text
      "groups": {
        "item": "item",
        "items": "items"
      },
      "columns": {},
      "data": {
        "loading": "Loading",
        "error": "Error"
      },
      "pagination": {
        "page_size": "Page Size",
        "page_title": "Show Page",
        "first": "First",
        "first_title": "First Page",
        "last": "Last",
        "last_title": "Last Page",
        "prev": "Prev",
        "prev_title": "Prev Page",
        "next": "Next",
        "next_title": "Next Page",
        "all": "All",
        "counter": {
          "showing": "Showing",
          "of": "of",
          "rows": "rows",
          "pages": "pages"
        }
      },
      "headerFilters": {
        "default": "filter column...",
        "columns": {}
      }
    }
  };
  var _Localize = class _Localize extends Module {
    constructor(table) {
      super(table);
      this.locale = "default";
      this.lang = false;
      this.bindings = {};
      this.langList = {};
      this.registerTableOption("locale", false);
      this.registerTableOption("langs", {});
    }
    initialize() {
      this.langList = Helpers.deepClone(_Localize.langs);
      if (this.table.options.columnDefaults.headerFilterPlaceholder !== false) {
        this.setHeaderFilterPlaceholder(this.table.options.columnDefaults.headerFilterPlaceholder);
      }
      for (let locale in this.table.options.langs) {
        this.installLang(locale, this.table.options.langs[locale]);
      }
      this.setLocale(this.table.options.locale);
      this.registerTableFunction("setLocale", this.setLocale.bind(this));
      this.registerTableFunction("getLocale", this.getLocale.bind(this));
      this.registerTableFunction("getLang", this.getLang.bind(this));
    }
    //set header placeholder
    setHeaderFilterPlaceholder(placeholder) {
      this.langList.default.headerFilters.default = placeholder;
    }
    //setup a lang description object
    installLang(locale, lang) {
      if (this.langList[locale]) {
        this._setLangProp(this.langList[locale], lang);
      } else {
        this.langList[locale] = lang;
      }
    }
    _setLangProp(lang, values) {
      for (let key in values) {
        if (lang[key] && typeof lang[key] == "object") {
          this._setLangProp(lang[key], values[key]);
        } else {
          lang[key] = values[key];
        }
      }
    }
    //set current locale
    setLocale(desiredLocale) {
      desiredLocale = desiredLocale || "default";
      function traverseLang(trans, path) {
        for (var prop in trans) {
          if (typeof trans[prop] == "object") {
            if (!path[prop]) {
              path[prop] = {};
            }
            traverseLang(trans[prop], path[prop]);
          } else {
            path[prop] = trans[prop];
          }
        }
      }
      if (desiredLocale === true && navigator.language) {
        desiredLocale = navigator.language.toLowerCase();
      }
      if (desiredLocale) {
        if (!this.langList[desiredLocale]) {
          let prefix = desiredLocale.split("-")[0];
          if (this.langList[prefix]) {
            console.warn("Localization Error - Exact matching locale not found, using closest match: ", desiredLocale, prefix);
            desiredLocale = prefix;
          } else {
            console.warn("Localization Error - Matching locale not found, using default: ", desiredLocale);
            desiredLocale = "default";
          }
        }
      }
      this.locale = desiredLocale;
      this.lang = Helpers.deepClone(this.langList.default || {});
      if (desiredLocale != "default") {
        traverseLang(this.langList[desiredLocale], this.lang);
      }
      this.dispatchExternal("localized", this.locale, this.lang);
      this._executeBindings();
    }
    //get current locale
    getLocale(locale) {
      return this.locale;
    }
    //get lang object for given local or current if none provided
    getLang(locale) {
      return locale ? this.langList[locale] : this.lang;
    }
    //get text for current locale
    getText(path, value) {
      var fillPath = value ? path + "|" + value : path, pathArray = fillPath.split("|"), text = this._getLangElement(pathArray, this.locale);
      return text || "";
    }
    //traverse langs object and find localized copy
    _getLangElement(path, locale) {
      var root = this.lang;
      path.forEach(function(level) {
        var rootPath;
        if (root) {
          rootPath = root[level];
          if (typeof rootPath != "undefined") {
            root = rootPath;
          } else {
            root = false;
          }
        }
      });
      return root;
    }
    //set update binding
    bind(path, callback) {
      if (!this.bindings[path]) {
        this.bindings[path] = [];
      }
      this.bindings[path].push(callback);
      callback(this.getText(path), this.lang);
    }
    //iterate through bindings and trigger updates
    _executeBindings() {
      for (let path in this.bindings) {
        this.bindings[path].forEach((binding) => {
          binding(this.getText(path), this.lang);
        });
      }
    }
  };
  __publicField(_Localize, "moduleName", "localize");
  //load defaults
  __publicField(_Localize, "langs", defaultLangs);
  var Localize = _Localize;
  var Comms = class extends Module {
    constructor(table) {
      super(table);
    }
    initialize() {
      this.registerTableFunction("tableComms", this.receive.bind(this));
    }
    getConnections(selectors) {
      var connections = [], connection;
      connection = this.table.constructor.registry.lookupTable(selectors);
      connection.forEach((con) => {
        if (this.table !== con) {
          connections.push(con);
        }
      });
      return connections;
    }
    send(selectors, module, action, data) {
      var connections = this.getConnections(selectors);
      connections.forEach((connection) => {
        connection.tableComms(this.table.element, module, action, data);
      });
      if (!connections.length && selectors) {
        console.warn("Table Connection Error - No tables matching selector found", selectors);
      }
    }
    receive(table, module, action, data) {
      if (this.table.modExists(module)) {
        return this.table.modules[module].commsReceived(table, action, data);
      } else {
        console.warn("Inter-table Comms Error - no such module:", module);
      }
    }
  };
  __publicField(Comms, "moduleName", "comms");
  var coreModules = /* @__PURE__ */ Object.freeze({
    __proto__: null,
    CommsModule: Comms,
    LayoutModule: Layout,
    LocalizeModule: Localize
  });
  var _TableRegistry = class _TableRegistry {
    static findTable(query) {
      var results = _TableRegistry.registry.lookupTable(query, true);
      return Array.isArray(results) && !results.length ? false : results;
    }
  };
  __publicField(_TableRegistry, "registry", {
    tables: [],
    register(table) {
      _TableRegistry.registry.tables.push(table);
    },
    deregister(table) {
      var index = _TableRegistry.registry.tables.indexOf(table);
      if (index > -1) {
        _TableRegistry.registry.tables.splice(index, 1);
      }
    },
    lookupTable(query, silent) {
      var results = [], matches, match;
      if (typeof query === "string") {
        matches = document.querySelectorAll(query);
        if (matches.length) {
          for (var i = 0; i < matches.length; i++) {
            match = _TableRegistry.registry.matchElement(matches[i]);
            if (match) {
              results.push(match);
            }
          }
        }
      } else if (typeof HTMLElement !== "undefined" && query instanceof HTMLElement || query instanceof _TableRegistry) {
        match = _TableRegistry.registry.matchElement(query);
        if (match) {
          results.push(match);
        }
      } else if (Array.isArray(query)) {
        query.forEach(function(item) {
          results = results.concat(_TableRegistry.registry.lookupTable(item));
        });
      } else {
        if (!silent) {
          console.warn("Table Connection Error - Invalid Selector", query);
        }
      }
      return results;
    },
    matchElement(element) {
      return _TableRegistry.registry.tables.find(function(table) {
        return element instanceof _TableRegistry ? table === element : table.element === element;
      });
    }
  });
  var TableRegistry = _TableRegistry;
  var _ModuleBinder = class _ModuleBinder extends TableRegistry {
    constructor() {
      super();
    }
    static initializeModuleBinder(defaultModules) {
      if (!_ModuleBinder.modulesRegistered) {
        _ModuleBinder.modulesRegistered = true;
        _ModuleBinder._registerModules(coreModules, true);
        if (defaultModules) {
          _ModuleBinder._registerModules(defaultModules);
        }
      }
    }
    static _extendModule(name, property, values) {
      if (_ModuleBinder.moduleBindings[name]) {
        var source = _ModuleBinder.moduleBindings[name][property];
        if (source) {
          if (typeof values == "object") {
            for (let key in values) {
              source[key] = values[key];
            }
          } else {
            console.warn("Module Error - Invalid value type, it must be an object");
          }
        } else {
          console.warn("Module Error - property does not exist:", property);
        }
      } else {
        console.warn("Module Error - module does not exist:", name);
      }
    }
    static _registerModules(modules, core) {
      var mods = Object.values(modules);
      if (core) {
        mods.forEach((mod) => {
          mod.prototype.moduleCore = true;
        });
      }
      _ModuleBinder._registerModule(mods);
    }
    static _registerModule(modules) {
      if (!Array.isArray(modules)) {
        modules = [modules];
      }
      modules.forEach((mod) => {
        _ModuleBinder._registerModuleBinding(mod);
        _ModuleBinder._registerModuleExtensions(mod);
      });
    }
    static _registerModuleBinding(mod) {
      if (mod.moduleName) {
        _ModuleBinder.moduleBindings[mod.moduleName] = mod;
      } else {
        console.error("Unable to bind module, no moduleName defined", mod.moduleName);
      }
    }
    static _registerModuleExtensions(mod) {
      var extensions2 = mod.moduleExtensions;
      if (mod.moduleExtensions) {
        for (let modKey in extensions2) {
          let ext = extensions2[modKey];
          if (_ModuleBinder.moduleBindings[modKey]) {
            for (let propKey in ext) {
              _ModuleBinder._extendModule(modKey, propKey, ext[propKey]);
            }
          } else {
            if (!_ModuleBinder.moduleExtensions[modKey]) {
              _ModuleBinder.moduleExtensions[modKey] = {};
            }
            for (let propKey in ext) {
              if (!_ModuleBinder.moduleExtensions[modKey][propKey]) {
                _ModuleBinder.moduleExtensions[modKey][propKey] = {};
              }
              Object.assign(_ModuleBinder.moduleExtensions[modKey][propKey], ext[propKey]);
            }
          }
        }
      }
      _ModuleBinder._extendModuleFromQueue(mod);
    }
    static _extendModuleFromQueue(mod) {
      var extensions2 = _ModuleBinder.moduleExtensions[mod.moduleName];
      if (extensions2) {
        for (let propKey in extensions2) {
          _ModuleBinder._extendModule(mod.moduleName, propKey, extensions2[propKey]);
        }
      }
    }
    //ensure that module are bound to instantiated function
    _bindModules() {
      var orderedStartMods = [], orderedEndMods = [], unOrderedMods = [];
      this.modules = {};
      for (var name in _ModuleBinder.moduleBindings) {
        let mod = _ModuleBinder.moduleBindings[name];
        let module = new mod(this);
        this.modules[name] = module;
        if (mod.prototype.moduleCore) {
          this.modulesCore.push(module);
        } else {
          if (mod.moduleInitOrder) {
            if (mod.moduleInitOrder < 0) {
              orderedStartMods.push(module);
            } else {
              orderedEndMods.push(module);
            }
          } else {
            unOrderedMods.push(module);
          }
        }
      }
      orderedStartMods.sort((a, b) => a.moduleInitOrder > b.moduleInitOrder ? 1 : -1);
      orderedEndMods.sort((a, b) => a.moduleInitOrder > b.moduleInitOrder ? 1 : -1);
      this.modulesRegular = orderedStartMods.concat(unOrderedMods.concat(orderedEndMods));
    }
  };
  __publicField(_ModuleBinder, "moduleBindings", {});
  __publicField(_ModuleBinder, "moduleExtensions", {});
  __publicField(_ModuleBinder, "modulesRegistered", false);
  __publicField(_ModuleBinder, "defaultModules", false);
  var ModuleBinder = _ModuleBinder;
  var Alert = class extends CoreFeature {
    constructor(table) {
      super(table);
      this.element = this._createAlertElement();
      this.msgElement = this._createMsgElement();
      this.type = null;
      this.element.appendChild(this.msgElement);
    }
    _createAlertElement() {
      var el = document.createElement("div");
      el.classList.add("tabulator-alert");
      return el;
    }
    _createMsgElement() {
      var el = document.createElement("div");
      el.classList.add("tabulator-alert-msg");
      el.setAttribute("role", "alert");
      return el;
    }
    _typeClass() {
      return "tabulator-alert-state-" + this.type;
    }
    alert(content, type = "msg") {
      if (content) {
        this.clear();
        this.dispatch("alert-show", type);
        this.type = type;
        while (this.msgElement.firstChild) this.msgElement.removeChild(this.msgElement.firstChild);
        this.msgElement.classList.add(this._typeClass());
        if (typeof content === "function") {
          content = content();
        }
        if (content instanceof HTMLElement) {
          this.msgElement.appendChild(content);
        } else {
          this.msgElement.innerHTML = content;
        }
        this.table.element.appendChild(this.element);
      }
    }
    clear() {
      this.dispatch("alert-hide", this.type);
      if (this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
      this.msgElement.classList.remove(this._typeClass());
    }
  };
  var _Tabulator = class _Tabulator extends ModuleBinder {
    static extendModule() {
      _Tabulator.initializeModuleBinder();
      _Tabulator._extendModule(...arguments);
    }
    static registerModule() {
      _Tabulator.initializeModuleBinder();
      _Tabulator._registerModule(...arguments);
    }
    constructor(element, options, modules) {
      super();
      _Tabulator.initializeModuleBinder(modules);
      this.options = {};
      this.columnManager = null;
      this.rowManager = null;
      this.footerManager = null;
      this.alertManager = null;
      this.vdomHoz = null;
      this.externalEvents = null;
      this.eventBus = null;
      this.interactionMonitor = false;
      this.browser = "";
      this.browserSlow = false;
      this.browserMobile = false;
      this.rtl = false;
      this.originalElement = null;
      this.componentFunctionBinder = new ComponentFunctionBinder(this);
      this.dataLoader = false;
      this.modules = {};
      this.modulesCore = [];
      this.modulesRegular = [];
      this.deprecationAdvisor = new DeprecationAdvisor(this);
      this.optionsList = new OptionsList(this, "table constructor");
      this.dependencyRegistry = new DependencyRegistry(this);
      this.initialized = false;
      this.destroyed = false;
      if (this.initializeElement(element)) {
        this.initializeCoreSystems(options);
        setTimeout(() => {
          this._create();
        });
      }
      this.constructor.registry.register(this);
    }
    initializeElement(element) {
      if (typeof HTMLElement !== "undefined" && element instanceof HTMLElement) {
        this.element = element;
        return true;
      } else if (typeof element === "string") {
        this.element = document.querySelector(element);
        if (this.element) {
          return true;
        } else {
          console.error("Tabulator Creation Error - no element found matching selector: ", element);
          return false;
        }
      } else {
        console.error("Tabulator Creation Error - Invalid element provided:", element);
        return false;
      }
    }
    initializeCoreSystems(options) {
      this.columnManager = new ColumnManager(this);
      this.rowManager = new RowManager(this);
      this.footerManager = new FooterManager(this);
      this.dataLoader = new DataLoader(this);
      this.alertManager = new Alert(this);
      this._bindModules();
      this.options = this.optionsList.generate(_Tabulator.defaultOptions, options);
      this._clearObjectPointers();
      this._mapDeprecatedFunctionality();
      this.externalEvents = new ExternalEventBus(this, this.options, this.options.debugEventsExternal);
      this.eventBus = new InternalEventBus(this.options.debugEventsInternal);
      this.interactionMonitor = new InteractionManager(this);
      this.dataLoader.initialize();
      this.footerManager.initialize();
      this.dependencyRegistry.initialize();
    }
    //convert deprecated functionality to new functions
    _mapDeprecatedFunctionality() {
    }
    _clearSelection() {
      this.element.classList.add("tabulator-block-select");
      if (window.getSelection) {
        if (window.getSelection().empty) {
          window.getSelection().empty();
        } else if (window.getSelection().removeAllRanges) {
          window.getSelection().removeAllRanges();
        }
      } else if (document.selection) {
        document.selection.empty();
      }
      this.element.classList.remove("tabulator-block-select");
    }
    //create table
    _create() {
      this.externalEvents.dispatch("tableBuilding");
      this.eventBus.dispatch("table-building");
      this._rtlCheck();
      this._buildElement();
      this._initializeTable();
      this.initialized = true;
      this._loadInitialData().finally(() => {
        this.eventBus.dispatch("table-initialized");
        this.externalEvents.dispatch("tableBuilt");
      });
    }
    _rtlCheck() {
      var style = window.getComputedStyle(this.element);
      switch (this.options.textDirection) {
        case "auto":
          if (style.direction !== "rtl") {
            break;
          }
        case "rtl":
          this.element.classList.add("tabulator-rtl");
          this.rtl = true;
          break;
        case "ltr":
          this.element.classList.add("tabulator-ltr");
        default:
          this.rtl = false;
      }
    }
    //clear pointers to objects in default config object
    _clearObjectPointers() {
      this.options.columns = this.options.columns.slice(0);
      if (Array.isArray(this.options.data) && !this.options.reactiveData) {
        this.options.data = this.options.data.slice(0);
      }
    }
    //build tabulator element
    _buildElement() {
      var element = this.element, options = this.options, newElement;
      if (element.tagName === "TABLE") {
        this.originalElement = this.element;
        newElement = document.createElement("div");
        var attributes = element.attributes;
        for (var i in attributes) {
          if (typeof attributes[i] == "object") {
            newElement.setAttribute(attributes[i].name, attributes[i].value);
          }
        }
        element.parentNode.replaceChild(newElement, element);
        this.element = element = newElement;
      }
      element.classList.add("tabulator");
      element.setAttribute("role", "grid");
      element.setAttribute("aria-owns", "tabulator-table-body");
      while (element.firstChild) element.removeChild(element.firstChild);
      if (options.height) {
        options.height = isNaN(options.height) ? options.height : options.height + "px";
        element.style.height = options.height;
      }
      if (options.minHeight !== false) {
        options.minHeight = isNaN(options.minHeight) ? options.minHeight : options.minHeight + "px";
        element.style.minHeight = options.minHeight;
      }
      if (options.maxHeight !== false) {
        options.maxHeight = isNaN(options.maxHeight) ? options.maxHeight : options.maxHeight + "px";
        element.style.maxHeight = options.maxHeight;
      }
    }
    //initialize core systems and modules
    _initializeTable() {
      var element = this.element, options = this.options;
      this.interactionMonitor.initialize();
      this.columnManager.initialize();
      this.rowManager.initialize();
      this._detectBrowser();
      this.modulesCore.forEach((mod) => {
        mod.initialize();
      });
      element.appendChild(this.columnManager.getElement());
      element.appendChild(this.rowManager.getElement());
      if (options.footerElement) {
        this.footerManager.activate();
      }
      if (options.autoColumns && options.data) {
        this.columnManager.generateColumnsFromRowData(this.options.data);
      }
      this.modulesRegular.forEach((mod) => {
        mod.initialize();
      });
      this.columnManager.setColumns(options.columns);
      this.eventBus.dispatch("table-built");
    }
    _loadInitialData() {
      return this.dataLoader.load(this.options.data).finally(() => {
        this.columnManager.verticalAlignHeaders();
      });
    }
    //deconstructor
    destroy() {
      var element = this.element;
      this.destroyed = true;
      this.constructor.registry.deregister(this);
      this.eventBus.dispatch("table-destroy");
      this.rowManager.destroy();
      while (element.firstChild) element.removeChild(element.firstChild);
      element.classList.remove("tabulator");
      element.removeAttribute("tabulator-layout");
      this.externalEvents.dispatch("tableDestroyed");
    }
    _detectBrowser() {
      var ua = navigator.userAgent || navigator.vendor || window.opera;
      if (ua.indexOf("Trident") > -1) {
        this.browser = "ie";
        this.browserSlow = true;
      } else if (ua.indexOf("Edge") > -1) {
        this.browser = "edge";
        this.browserSlow = true;
      } else if (ua.indexOf("Firefox") > -1) {
        this.browser = "firefox";
        this.browserSlow = false;
      } else if (ua.indexOf("Mac OS") > -1) {
        this.browser = "safari";
        this.browserSlow = false;
      } else {
        this.browser = "other";
        this.browserSlow = false;
      }
      this.browserMobile = /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino|android|ipad|playbook|silk/i.test(ua) || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw-(n|u)|c55\/|capi|ccwa|cdm-|cell|chtm|cldc|cmd-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc-s|devi|dica|dmob|do(c|p)o|ds(12|-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(-|_)|g1 u|g560|gene|gf-5|g-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd-(m|p|t)|hei-|hi(pt|ta)|hp( i|ip)|hs-c|ht(c(-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i-(20|go|ma)|i230|iac( |-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|-[a-w])|libw|lynx|m1-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|-([1-8]|c))|phil|pire|pl(ay|uc)|pn-2|po(ck|rt|se)|prox|psio|pt-g|qa-a|qc(07|12|21|32|60|-[2-7]|i-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h-|oo|p-)|sdk\/|se(c(-|0|1)|47|mc|nd|ri)|sgh-|shar|sie(-|m)|sk-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h-|v-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl-|tdg-|tel(i|m)|tim-|t-mo|to(pl|sh)|ts(70|m-|m3|m5)|tx-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas-|your|zeto|zte-/i.test(ua.slice(0, 4));
    }
    initGuard(func, msg) {
      var stack, line;
      if (this.options.debugInitialization && !this.initialized) {
        if (!func) {
          stack = new Error().stack.split("\n");
          line = stack[0] == "Error" ? stack[2] : stack[1];
          if (line[0] == " ") {
            func = line.trim().split(" ")[1].split(".")[1];
          } else {
            func = line.trim().split("@")[0];
          }
        }
        console.warn("Table Not Initialized - Calling the " + func + " function before the table is initialized may result in inconsistent behavior, Please wait for the `tableBuilt` event before calling this function." + (msg ? " " + msg : ""));
      }
      return this.initialized;
    }
    ////////////////// Data Handling //////////////////
    //block table redrawing
    blockRedraw() {
      this.initGuard();
      this.eventBus.dispatch("redraw-blocking");
      this.rowManager.blockRedraw();
      this.columnManager.blockRedraw();
      this.eventBus.dispatch("redraw-blocked");
    }
    //restore table redrawing
    restoreRedraw() {
      this.initGuard();
      this.eventBus.dispatch("redraw-restoring");
      this.rowManager.restoreRedraw();
      this.columnManager.restoreRedraw();
      this.eventBus.dispatch("redraw-restored");
    }
    //load data
    setData(data, params, config) {
      this.initGuard(false, "To set initial data please use the 'data' property in the table constructor.");
      return this.dataLoader.load(data, params, config, false);
    }
    //clear data
    clearData() {
      this.initGuard();
      this.dataLoader.blockActiveLoad();
      this.rowManager.clearData();
    }
    //get table data array
    getData(active) {
      return this.rowManager.getData(active);
    }
    //get table data array count
    getDataCount(active) {
      return this.rowManager.getDataCount(active);
    }
    //replace data, keeping table in position with same sort
    replaceData(data, params, config) {
      this.initGuard();
      return this.dataLoader.load(data, params, config, true, true);
    }
    //update table data
    updateData(data) {
      var responses = 0;
      this.initGuard();
      return new Promise((resolve, reject) => {
        this.dataLoader.blockActiveLoad();
        if (typeof data === "string") {
          data = JSON.parse(data);
        }
        if (data && data.length > 0) {
          data.forEach((item) => {
            var row = this.rowManager.findRow(item[this.options.index]);
            if (row) {
              responses++;
              row.updateData(item).then(() => {
                responses--;
                if (!responses) {
                  resolve();
                }
              }).catch((e) => {
                reject("Update Error - Unable to update row", item, e);
              });
            } else {
              reject("Update Error - Unable to find row", item);
            }
          });
        } else {
          console.warn("Update Error - No data provided");
          reject("Update Error - No data provided");
        }
      });
    }
    addData(data, pos, index) {
      this.initGuard();
      return new Promise((resolve, reject) => {
        this.dataLoader.blockActiveLoad();
        if (typeof data === "string") {
          data = JSON.parse(data);
        }
        if (data) {
          this.rowManager.addRows(data, pos, index).then((rows) => {
            var output = [];
            rows.forEach(function(row) {
              output.push(row.getComponent());
            });
            resolve(output);
          });
        } else {
          console.warn("Update Error - No data provided");
          reject("Update Error - No data provided");
        }
      });
    }
    //update table data
    updateOrAddData(data) {
      var rows = [], responses = 0;
      this.initGuard();
      return new Promise((resolve, reject) => {
        this.dataLoader.blockActiveLoad();
        if (typeof data === "string") {
          data = JSON.parse(data);
        }
        if (data && data.length > 0) {
          data.forEach((item) => {
            var row = this.rowManager.findRow(item[this.options.index]);
            responses++;
            if (row) {
              row.updateData(item).then(() => {
                responses--;
                rows.push(row.getComponent());
                if (!responses) {
                  resolve(rows);
                }
              });
            } else {
              this.rowManager.addRows(item).then((newRows) => {
                responses--;
                rows.push(newRows[0].getComponent());
                if (!responses) {
                  resolve(rows);
                }
              });
            }
          });
        } else {
          console.warn("Update Error - No data provided");
          reject("Update Error - No data provided");
        }
      });
    }
    //get row object
    getRow(index) {
      var row = this.rowManager.findRow(index);
      if (row) {
        return row.getComponent();
      } else {
        console.warn("Find Error - No matching row found:", index);
        return false;
      }
    }
    //get row object
    getRowFromPosition(position) {
      var row = this.rowManager.getRowFromPosition(position);
      if (row) {
        return row.getComponent();
      } else {
        console.warn("Find Error - No matching row found:", position);
        return false;
      }
    }
    //delete row from table
    deleteRow(index) {
      var foundRows = [];
      this.initGuard();
      if (!Array.isArray(index)) {
        index = [index];
      }
      for (let item of index) {
        let row = this.rowManager.findRow(item, true);
        if (row) {
          foundRows.push(row);
        } else {
          console.error("Delete Error - No matching row found:", item);
          return Promise.reject("Delete Error - No matching row found");
        }
      }
      foundRows.sort((a, b) => {
        return this.rowManager.rows.indexOf(a) > this.rowManager.rows.indexOf(b) ? 1 : -1;
      });
      foundRows.forEach((row) => {
        row.delete();
      });
      this.rowManager.reRenderInPosition();
      return Promise.resolve();
    }
    //add row to table
    addRow(data, pos, index) {
      this.initGuard();
      if (typeof data === "string") {
        data = JSON.parse(data);
      }
      return this.rowManager.addRows(data, pos, index, true).then((rows) => {
        return rows[0].getComponent();
      });
    }
    //update a row if it exists otherwise create it
    updateOrAddRow(index, data) {
      var row = this.rowManager.findRow(index);
      this.initGuard();
      if (typeof data === "string") {
        data = JSON.parse(data);
      }
      if (row) {
        return row.updateData(data).then(() => {
          return row.getComponent();
        });
      } else {
        return this.rowManager.addRows(data).then((rows) => {
          return rows[0].getComponent();
        });
      }
    }
    //update row data
    updateRow(index, data) {
      var row = this.rowManager.findRow(index);
      this.initGuard();
      if (typeof data === "string") {
        data = JSON.parse(data);
      }
      if (row) {
        return row.updateData(data).then(() => {
          return Promise.resolve(row.getComponent());
        });
      } else {
        console.warn("Update Error - No matching row found:", index);
        return Promise.reject("Update Error - No matching row found");
      }
    }
    //scroll to row in DOM
    scrollToRow(index, position, ifVisible) {
      var row = this.rowManager.findRow(index);
      if (row) {
        return this.rowManager.scrollToRow(row, position, ifVisible);
      } else {
        console.warn("Scroll Error - No matching row found:", index);
        return Promise.reject("Scroll Error - No matching row found");
      }
    }
    moveRow(from, to, after) {
      var fromRow = this.rowManager.findRow(from);
      this.initGuard();
      if (fromRow) {
        fromRow.moveToRow(to, after);
      } else {
        console.warn("Move Error - No matching row found:", from);
      }
    }
    getRows(active) {
      return this.rowManager.getComponents(active);
    }
    //get position of row in table
    getRowPosition(index) {
      var row = this.rowManager.findRow(index);
      if (row) {
        return row.getPosition();
      } else {
        console.warn("Position Error - No matching row found:", index);
        return false;
      }
    }
    /////////////// Column Functions  ///////////////
    setColumns(definition) {
      this.initGuard(false, "To set initial columns please use the 'columns' property in the table constructor");
      this.columnManager.setColumns(definition);
    }
    getColumns(structured) {
      return this.columnManager.getComponents(structured);
    }
    getColumn(field) {
      var column = this.columnManager.findColumn(field);
      if (column) {
        return column.getComponent();
      } else {
        console.warn("Find Error - No matching column found:", field);
        return false;
      }
    }
    getColumnDefinitions() {
      return this.columnManager.getDefinitionTree();
    }
    showColumn(field) {
      var column = this.columnManager.findColumn(field);
      this.initGuard();
      if (column) {
        column.show();
      } else {
        console.warn("Column Show Error - No matching column found:", field);
        return false;
      }
    }
    hideColumn(field) {
      var column = this.columnManager.findColumn(field);
      this.initGuard();
      if (column) {
        column.hide();
      } else {
        console.warn("Column Hide Error - No matching column found:", field);
        return false;
      }
    }
    toggleColumn(field) {
      var column = this.columnManager.findColumn(field);
      this.initGuard();
      if (column) {
        if (column.visible) {
          column.hide();
        } else {
          column.show();
        }
      } else {
        console.warn("Column Visibility Toggle Error - No matching column found:", field);
        return false;
      }
    }
    addColumn(definition, before, field) {
      var column = this.columnManager.findColumn(field);
      this.initGuard();
      return this.columnManager.addColumn(definition, before, column).then((column2) => {
        return column2.getComponent();
      });
    }
    deleteColumn(field) {
      var column = this.columnManager.findColumn(field);
      this.initGuard();
      if (column) {
        return column.delete();
      } else {
        console.warn("Column Delete Error - No matching column found:", field);
        return Promise.reject();
      }
    }
    updateColumnDefinition(field, definition) {
      var column = this.columnManager.findColumn(field);
      this.initGuard();
      if (column) {
        return column.updateDefinition(definition);
      } else {
        console.warn("Column Update Error - No matching column found:", field);
        return Promise.reject();
      }
    }
    moveColumn(from, to, after) {
      var fromColumn = this.columnManager.findColumn(from), toColumn = this.columnManager.findColumn(to);
      this.initGuard();
      if (fromColumn) {
        if (toColumn) {
          this.columnManager.moveColumn(fromColumn, toColumn, after);
        } else {
          console.warn("Move Error - No matching column found:", toColumn);
        }
      } else {
        console.warn("Move Error - No matching column found:", from);
      }
    }
    //scroll to column in DOM
    scrollToColumn(field, position, ifVisible) {
      return new Promise((resolve, reject) => {
        var column = this.columnManager.findColumn(field);
        if (column) {
          return this.columnManager.scrollToColumn(column, position, ifVisible);
        } else {
          console.warn("Scroll Error - No matching column found:", field);
          return Promise.reject("Scroll Error - No matching column found");
        }
      });
    }
    //////////// General Public Functions ////////////
    //redraw list without updating data
    redraw(force) {
      this.initGuard();
      this.columnManager.redraw(force);
      this.rowManager.redraw(force);
    }
    setHeight(height) {
      this.options.height = isNaN(height) ? height : height + "px";
      this.element.style.height = this.options.height;
      this.rowManager.initializeRenderer();
      this.rowManager.redraw(true);
    }
    setMaxHeight(maxHeight) {
      this.options.maxHeight = isNaN(maxHeight) ? maxHeight : maxHeight + "px";
      this.element.style.maxHeight = this.options.maxHeight;
      this.rowManager.initializeRenderer();
      this.rowManager.redraw(true);
    }
    setMinHeight(minHeight) {
      this.options.minHeight = isNaN(minHeight) ? minHeight : minHeight + "px";
      this.element.style.minHeight = this.options.minHeight;
      this.rowManager.initializeRenderer();
      this.rowManager.redraw(true);
    }
    //////////////////// Event Bus ///////////////////
    on(key, callback) {
      this.externalEvents.subscribe(key, callback);
    }
    off(key, callback) {
      this.externalEvents.unsubscribe(key, callback);
    }
    dispatchEvent() {
      var args = Array.from(arguments);
      args.shift();
      this.externalEvents.dispatch(...arguments);
    }
    //////////////////// Alerts ///////////////////
    alert(contents, type) {
      this.initGuard();
      this.alertManager.alert(contents, type);
    }
    clearAlert() {
      this.initGuard();
      this.alertManager.clear();
    }
    ////////////// Extension Management //////////////
    modExists(plugin, required) {
      if (this.modules[plugin]) {
        return true;
      } else {
        if (required) {
          console.error("Tabulator Module Not Installed: " + plugin);
        }
        return false;
      }
    }
    module(key) {
      var mod = this.modules[key];
      if (!mod) {
        console.error("Tabulator module not installed: " + key);
      }
      return mod;
    }
  };
  //default setup options
  __publicField(_Tabulator, "defaultOptions", defaultOptions);
  var Tabulator = _Tabulator;

  // frontend/app/features/table-controller.ts
  if (typeof window !== "undefined") {
    Tabulator.registerModule([
      Spreadsheet,
      Edit2,
      SelectRange,
      Clipboard,
      History,
      Keybindings,
      ResizeColumns,
      ResizeRows,
      Format,
      Interaction
    ]);
  }
  function decodeHtmlEntities(value) {
    const entityMap = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&#39;": "'",
      "&apos;": "'",
      "&nbsp;": "\xA0"
    };
    return String(value || "").replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/gi, (match) => entityMap[match.toLowerCase()] ?? match).replace(/&#(\d+);/g, (_, code) => {
      const numeric = Number(code);
      return Number.isSafeInteger(numeric) && numeric >= 0 && numeric <= 1114111 ? String.fromCodePoint(numeric) : "";
    }).replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
      const numeric = Number.parseInt(code, 16);
      return Number.isSafeInteger(numeric) && numeric >= 0 && numeric <= 1114111 ? String.fromCodePoint(numeric) : "";
    });
  }
  function decodeMarkdownCell(value) {
    if (!value) return "";
    let text = String(value).replace(/<\s*br\s*\/?>/gi, "\n");
    text = decodeHtmlEntities(text);
    text = text.replace(/\\([\\|`*_\[\]!])/g, "$1");
    return text;
  }
  function encodeMarkdownCell(value) {
    if (!value) return "";
    const lines = String(value).split("\n").map((line) => {
      const normalized = line.trim().replace(/[ \t]+/g, " ");
      let escaped = normalized.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\\", "\\\\");
      for (const character of ["|", "`", "*", "_", "[", "]", "!"]) {
        escaped = escaped.replaceAll(character, `\\${character}`);
      }
      return escaped;
    });
    return lines.join("<br>");
  }
  function parseAlignment(cell) {
    const trimmed = cell.trim();
    if (!/^:?-{3,}:?$/.test(trimmed)) return void 0;
    const left = trimmed.startsWith(":");
    const right = trimmed.endsWith(":");
    if (left && right) return "center";
    if (left) return "left";
    if (right) return "right";
    return null;
  }
  function alignmentSeparator(alignment) {
    switch (alignment) {
      case "left":
        return ":---";
      case "center":
        return ":---:";
      case "right":
        return "---:";
      default:
        return "---";
    }
  }
  function trimOuterPipes(line) {
    let source = line.trim();
    if (source.startsWith("|")) {
      source = source.slice(1);
    }
    const trimmedEnd = source.trimEnd();
    if (trimmedEnd.endsWith("|")) {
      let backslashCount = 0;
      for (let index = trimmedEnd.length - 2; index >= 0 && trimmedEnd[index] === "\\"; index -= 1) {
        backslashCount += 1;
      }
      if (backslashCount % 2 === 0) {
        source = trimmedEnd.slice(0, -1);
      }
    }
    return source;
  }
  function splitPipeRow(line) {
    const source = trimOuterPipes(line);
    const cells = [];
    let cell = "";
    let escaped = false;
    for (const character of source) {
      if (escaped) {
        cell += "\\" + character;
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
  function parseMarkdownPipeTables(markdown) {
    const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
    const tables = [];
    for (let separatorIndex = 1; separatorIndex < lines.length; separatorIndex += 1) {
      const headerLine = lines[separatorIndex - 1];
      const separatorLine = lines[separatorIndex];
      if (!headerLine.includes("|") || !separatorLine.includes("|")) continue;
      const rawHeaders = splitPipeRow(headerLine);
      const rawSeparators = splitPipeRow(separatorLine);
      if (!rawHeaders.length || rawSeparators.length !== rawHeaders.length) continue;
      const alignments = [];
      let validSeparators = true;
      for (const sep of rawSeparators) {
        const align = parseAlignment(sep);
        if (align === void 0) {
          validSeparators = false;
          break;
        }
        alignments.push(align);
      }
      if (!validSeparators) continue;
      const headers = rawHeaders.map(decodeMarkdownCell);
      const rows = [];
      let rowIndex = separatorIndex + 1;
      while (rowIndex < lines.length && lines[rowIndex].trim() && lines[rowIndex].includes("|")) {
        const cells = splitPipeRow(lines[rowIndex]).slice(0, headers.length).map(decodeMarkdownCell);
        while (cells.length < headers.length) cells.push("");
        rows.push(cells);
        rowIndex += 1;
      }
      tables.push({ headers, rows, alignments });
      separatorIndex = rowIndex - 1;
    }
    return tables;
  }
  function serializeMarkdownPipeTable(table) {
    const columnCount = Math.max(
      table.headers.length,
      ...table.rows.map((row) => row.length),
      table.alignments?.length || 0,
      1
    );
    const padRow = (cells) => {
      const padded = cells.slice(0, columnCount);
      while (padded.length < columnCount) padded.push("");
      return padded;
    };
    const headers = padRow(table.headers).map(encodeMarkdownCell);
    const alignments = [];
    for (let index = 0; index < columnCount; index += 1) {
      alignments.push(table.alignments?.[index] ?? null);
    }
    const separators = alignments.map(alignmentSeparator);
    const rows = table.rows.map((row) => padRow(row).map(encodeMarkdownCell));
    const renderRow = (cells) => `| ${cells.join(" | ")} |`;
    return [
      renderRow(headers),
      renderRow(separators),
      ...rows.map(renderRow)
    ].join("\n");
  }
  function markdownPipeTableToSpreadsheetData(table) {
    if (!table.headers.length && !table.rows.length) return [[""]];
    const maxCols = Math.max(
      table.headers.length,
      ...table.rows.map((r) => r.length),
      table.alignments?.length || 0,
      1
    );
    const pad = (arr) => {
      const res = [...arr];
      while (res.length < maxCols) res.push("");
      return res;
    };
    return [pad(table.headers), ...table.rows.map(pad)];
  }
  function spreadsheetDataToMarkdownPipeTable(data, alignments = []) {
    if (!data || !data.length) return { headers: [""], rows: [], alignments: [null] };
    const rawHeaders = (data[0] || []).map((v) => String(v ?? ""));
    const rawRows = data.slice(1).map((r) => (r || []).map((v) => String(v ?? "")));
    const maxCols = Math.max(
      rawHeaders.length,
      ...rawRows.map((r) => r.length),
      alignments?.length || 0,
      1
    );
    const pad = (arr) => {
      const res = [...arr];
      while (res.length < maxCols) res.push("");
      return res;
    };
    const headers = pad(rawHeaders);
    const rows = rawRows.map(pad);
    const nextAlignments = [];
    for (let i = 0; i < maxCols; i += 1) {
      nextAlignments.push(alignments?.[i] ?? null);
    }
    return { headers, rows, alignments: nextAlignments };
  }
  function spreadsheetFieldToIndex(field) {
    let index = 0;
    for (let i = 0; i < field.length; i += 1) {
      index = index * 26 + (field.charCodeAt(i) - 64);
    }
    return index - 1;
  }
  function addRowToTable(table) {
    const colCount = Math.max(table.headers.length, 1);
    return {
      headers: [...table.headers],
      alignments: [...table.alignments],
      rows: [...table.rows, new Array(colCount).fill("")]
    };
  }
  function removeRowFromTable(table) {
    if (table.rows.length === 0) return table;
    return {
      headers: [...table.headers],
      alignments: [...table.alignments],
      rows: table.rows.slice(0, -1)
    };
  }
  function addColumnToTable(table) {
    return {
      headers: [...table.headers, ""],
      alignments: [...table.alignments, null],
      rows: table.rows.map((r) => [...r, ""])
    };
  }
  function removeColumnFromTable(table) {
    if (table.headers.length <= 1) return table;
    return {
      headers: table.headers.slice(0, -1),
      alignments: table.alignments.slice(0, -1),
      rows: table.rows.map((r) => r.slice(0, -1))
    };
  }
  function buildTabulatorSpreadsheetOptions({
    data,
    getAlignments
  }) {
    const rowCount = Math.max(data.length, 1);
    const colCount = Math.max(data[0]?.length || 1, 1);
    return {
      spreadsheet: true,
      spreadsheetRows: rowCount,
      spreadsheetColumns: colCount,
      spreadsheetData: data,
      spreadsheetOutputFull: true,
      spreadsheetColumnDefinition: {
        editor: "textarea",
        headerSort: false,
        resizable: true,
        formatter: (cell) => {
          const value = cell.getValue();
          const field = cell.getColumn().getField();
          const colIndex = spreadsheetFieldToIndex(field);
          const alignments = getAlignments();
          const align = alignments?.[colIndex];
          const el = cell.getElement();
          if (align) {
            el.style.textAlign = align;
          } else {
            el.style.textAlign = "";
          }
          const wrapper = document.createElement("div");
          wrapper.className = "table-cell-content";
          wrapper.textContent = String(value ?? "");
          return wrapper;
        }
      },
      rowHeader: {
        resizable: false,
        frozen: true,
        width: 40,
        hozAlign: "center",
        formatter: "rownum",
        field: "rownum",
        accessorClipboard: "rownum"
      },
      selectableRange: 1,
      selectableRangeColumns: true,
      selectableRangeRows: true,
      selectableRangeClearCells: true,
      clipboard: true,
      clipboardCopyRowRange: "range",
      clipboardPasteParser: "range",
      clipboardPasteAction: "range",
      clipboardCopyConfig: {
        rowHeaders: false,
        columnHeaders: false
      },
      clipboardCopyStyled: false,
      history: true,
      editTriggerEvent: "click",
      layout: "fitDataFill"
    };
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
  function renderCellContent(target, text) {
    const lines = text.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      if (index > 0) target.appendChild(document.createElement("br"));
      target.appendChild(document.createTextNode(lines[index]));
    }
  }
  function buildPipeTable({ headers, rows, alignments }) {
    const table = document.createElement("table");
    const head = document.createElement("thead");
    const headingRow = document.createElement("tr");
    headers.forEach((value, index) => {
      const cell = document.createElement("th");
      const alignment = alignments?.[index];
      if (alignment) cell.style.textAlign = alignment;
      renderCellContent(cell, value);
      headingRow.append(cell);
    });
    head.append(headingRow);
    const body = document.createElement("tbody");
    for (const row of rows) {
      const tableRow = document.createElement("tr");
      row.forEach((value, index) => {
        const cell = document.createElement("td");
        const alignment = alignments?.[index];
        if (alignment) cell.style.textAlign = alignment;
        renderCellContent(cell, value);
        tableRow.append(cell);
      });
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
      const input2 = document.createElement("textarea");
      input2.value = value;
      input2.style.position = "fixed";
      input2.style.left = "-9999px";
      document.body.append(input2);
      input2.select();
      const copied = document.execCommand("copy");
      input2.remove();
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
    const tableContainer = $("#table-spreadsheet-container");
    const tableSelect = $("#table-editor-select");
    const multiSelectShell = $("#table-multi-select-shell");
    let editorTable = { headers: [""], rows: [], alignments: [null] };
    let parsedTables = [];
    let activeTableIndex = 0;
    let syncing = false;
    let tabulator = null;
    const renderRecognized = () => {
      renderTableSource(recognizedSource.value, recognizedPreview, recognizedStatus);
      continueButton.disabled = !recognizedSource.value.trim();
    };
    const renderEditor = () => renderTableSource(editorSource.value, editorPreview, editorStatus);
    function getSpreadsheetData() {
      return markdownPipeTableToSpreadsheetData(editorTable);
    }
    function updateTableSelector() {
      if (!tableSelect || !multiSelectShell) return;
      if (parsedTables.length <= 1) {
        multiSelectShell.hidden = true;
        return;
      }
      multiSelectShell.hidden = false;
      tableSelect.replaceChildren();
      parsedTables.forEach((_, idx) => {
        const option = document.createElement("option");
        option.value = String(idx);
        option.textContent = `\u8868\u683C ${idx + 1}`;
        if (idx === activeTableIndex) option.selected = true;
        tableSelect.appendChild(option);
      });
    }
    function updateTabulatorData() {
      if (!tabulator) return;
      const data2D = getSpreadsheetData();
      const rowCount = Math.max(data2D.length, 1);
      const colCount = Math.max(data2D[0]?.length || 1, 1);
      try {
        tabulator.setSheetData(data2D);
        const sheet = tabulator.getSheet();
        if (sheet) {
          const def = sheet.getDefinition();
          if (def && typeof def.rows === "number" && def.rows !== rowCount) {
            sheet.setRows(rowCount);
          }
          if (def && typeof def.columns === "number" && def.columns !== colCount) {
            sheet.setColumns(colCount);
          }
        }
      } catch (e) {
        console.warn("Updating Tabulator sheet data failed:", e);
      }
    }
    function initTabulator() {
      if (!tableContainer || typeof window === "undefined") return;
      const initialData = getSpreadsheetData();
      const options = buildTabulatorSpreadsheetOptions({
        data: initialData,
        getAlignments: () => editorTable.alignments
      });
      tabulator = new Tabulator(tableContainer, options);
      const onVisualChange = () => {
        if (syncing || !tabulator) return;
        syncing = true;
        try {
          const rawData = tabulator.getSheetData();
          if (Array.isArray(rawData) && rawData.length > 0) {
            editorTable = spreadsheetDataToMarkdownPipeTable(rawData, editorTable.alignments);
            let fullMarkdown = "";
            if (parsedTables.length > 1) {
              parsedTables[activeTableIndex] = editorTable;
              fullMarkdown = parsedTables.map(serializeMarkdownPipeTable).join("\n\n");
            } else {
              parsedTables = [editorTable];
              fullMarkdown = serializeMarkdownPipeTable(editorTable);
            }
            editorSource.value = fullMarkdown;
            setRecognizedMarkdown(fullMarkdown, true);
            renderEditor();
          }
        } catch (err) {
          console.warn("Sync visual to markdown failed:", err);
        } finally {
          syncing = false;
        }
      };
      tabulator.on("cellEdited", onVisualChange);
      tabulator.on("historyUndo", onVisualChange);
      tabulator.on("historyRedo", onVisualChange);
      tabulator.on("clipboardPasted", onVisualChange);
    }
    const setEditorMarkdown = (value, skipSyncRecognized = false) => {
      if (editorSource.value !== value) editorSource.value = value;
      parsedTables = parseMarkdownPipeTables(value);
      if (parsedTables.length === 0) {
        editorTable = { headers: [""], rows: [], alignments: [null] };
        parsedTables = [editorTable];
        activeTableIndex = 0;
      } else {
        if (activeTableIndex >= parsedTables.length) activeTableIndex = 0;
        editorTable = parsedTables[activeTableIndex];
      }
      updateTableSelector();
      updateTabulatorData();
      renderEditor();
      if (!skipSyncRecognized && !syncing) {
        syncing = true;
        setRecognizedMarkdown(value, true);
        syncing = false;
      }
    };
    const setRecognizedMarkdown = (value, skipSyncEditor = false) => {
      if (recognizedSource.value !== value) recognizedSource.value = value;
      renderRecognized();
      if (!skipSyncEditor && !syncing) {
        syncing = true;
        setEditorMarkdown(value, true);
        syncing = false;
      }
    };
    function setTableInputMode(mode) {
      document.querySelectorAll("[data-table-input-mode]").forEach((tab) => {
        const active = tab.dataset.tableInputMode === mode;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      document.querySelectorAll("[data-table-input-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.tableInputPanel !== mode;
      });
      if (mode === "visual" && tabulator) {
        window.requestAnimationFrame(() => {
          try {
            tabulator?.redraw(true);
          } catch {
          }
        });
      } else if (mode === "source") {
        editorSource.focus();
      }
    }
    recognizedSource.addEventListener("input", () => setRecognizedMarkdown(recognizedSource.value));
    editorSource.addEventListener("input", () => setEditorMarkdown(editorSource.value));
    $("#copy-table-markdown").addEventListener("click", () => copyMarkdown(recognizedSource.value, recognizedStatus));
    $("#copy-table-editor-markdown").addEventListener("click", () => copyMarkdown(editorSource.value, editorStatus));
    $("#clear-table-editor").addEventListener("click", () => {
      setEditorMarkdown("");
      if (tableContainer) updateTabulatorData();
    });
    continueButton.addEventListener("click", () => {
      setEditorMarkdown(recognizedSource.value);
      setTableInputMode("visual");
      showWorkbenchPage("table-editor");
    });
    tableSelect?.addEventListener("change", () => {
      activeTableIndex = Number(tableSelect.value) || 0;
      editorTable = parsedTables[activeTableIndex] || { headers: [""], rows: [], alignments: [null] };
      updateTabulatorData();
    });
    $("#table-add-row")?.addEventListener("click", () => {
      editorTable = addRowToTable(editorTable);
      if (parsedTables.length > 0) parsedTables[activeTableIndex] = editorTable;
      updateTabulatorData();
      const markdown = parsedTables.map(serializeMarkdownPipeTable).join("\n\n");
      editorSource.value = markdown;
      setRecognizedMarkdown(markdown, true);
      renderEditor();
    });
    $("#table-remove-row")?.addEventListener("click", () => {
      editorTable = removeRowFromTable(editorTable);
      if (parsedTables.length > 0) parsedTables[activeTableIndex] = editorTable;
      updateTabulatorData();
      const markdown = parsedTables.map(serializeMarkdownPipeTable).join("\n\n");
      editorSource.value = markdown;
      setRecognizedMarkdown(markdown, true);
      renderEditor();
    });
    $("#table-add-col")?.addEventListener("click", () => {
      editorTable = addColumnToTable(editorTable);
      if (parsedTables.length > 0) parsedTables[activeTableIndex] = editorTable;
      updateTabulatorData();
      const markdown = parsedTables.map(serializeMarkdownPipeTable).join("\n\n");
      editorSource.value = markdown;
      setRecognizedMarkdown(markdown, true);
      renderEditor();
    });
    $("#table-remove-col")?.addEventListener("click", () => {
      editorTable = removeColumnFromTable(editorTable);
      if (parsedTables.length > 0) parsedTables[activeTableIndex] = editorTable;
      updateTabulatorData();
      const markdown = parsedTables.map(serializeMarkdownPipeTable).join("\n\n");
      editorSource.value = markdown;
      setRecognizedMarkdown(markdown, true);
      renderEditor();
    });
    document.querySelectorAll("[data-table-input-mode]").forEach((tab) => {
      tab.addEventListener("click", () => {
        const mode = tab.dataset.tableInputMode || "visual";
        setTableInputMode(mode);
      });
    });
    initTabulator();
    renderRecognized();
    renderEditor();
    setTableInputMode("visual");
    return {
      setTableResults(tables) {
        const markdown = tables.map((table) => table.markdown.trim()).filter(Boolean).join("\n\n");
        setRecognizedMarkdown(markdown);
      },
      redrawVisualTable() {
        try {
          tabulator?.redraw(true);
        } catch {
        }
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
