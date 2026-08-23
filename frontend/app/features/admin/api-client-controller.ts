import { $, endpoint } from '../../core/dom.ts';
import type { ApiConfiguration, JsonObject } from '../../types.ts';

export function initializeApiClientController({
  apiConfiguration,
  rememberApiSettings,
}: {
  apiConfiguration: ApiConfiguration;
  rememberApiSettings: (payload: JsonObject) => void;
}) {
  const dialog = $('#api-setup-dialog');

  function generateApiScriptCode() {
    const host = window.location.hostname;
    const isIPv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(host) && host !== '127.0.0.1';
    const serverIp = isIPv4 ? host : '填写你的局域网 IP';
    const port = apiConfiguration.port || '8504';
    const token = apiConfiguration.token || '请重新打开客户端示例以读取 Token';
    return `import requests
from PIL import ImageGrab
import pyperclip
import io

# 🔴 飞牛 NAS 宿主机统一放行的局域网独立 API 端口 ${port}
SERVER_IP = "${serverIp}"
SERVER_URL = f"http://{SERVER_IP}:${port}/predict"
API_TOKEN = "${token}"
RECOGNITION_KIND = "formula"  # 改为 "table" 可识别表格

def main():
    img = ImageGrab.grabclipboard()
    if img is None:
        print("❌ 错误：剪切板中没有图片！请先截图。")
        return

    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='PNG')
    img_byte_arr.seek(0)

    files = {'file': ('screenshot.png', img_byte_arr, 'image/png')}
    session = requests.Session()
    session.trust_env = False  # 禁用代理环境

    try:
        response = session.post(
            SERVER_URL,
            headers={"Authorization": f"Bearer {API_TOKEN}"},
            files=files,
            data={"kind": RECOGNITION_KIND},
            timeout=(5, ${apiConfiguration.requestTimeout}),
        )
        print(f"DEBUG - 状态码: {response.status_code}, 内容类型: {response.headers.get('Content-Type')}")

        try:
            result = response.json()
        except Exception:
            print(f"❌ 返回的内容不是 JSON：\\n{response.text[:300]}")
            return

        if not response.ok:
            error_message = result.get("detail") or result.get("message") or str(result)
            print(f"❌ 请求失败：{error_message}")
            if response.status_code == 401:
                print("请重新打开 Python 客户端示例并复制包含最新 API_TOKEN 的代码。")
            return

        if result.get("status") == "success":
            if RECOGNITION_KIND == "table":
                markdown = "\\n\\n".join(table.get("markdown", "") for table in result.get("tables", []))
                pyperclip.copy(markdown)
                print("✅ 识别成功！表格 Markdown 已复制到剪贴板。")
            else:
                latex = result.get("latex")
                pyperclip.copy(latex)
                print("✅ 识别成功！公式代码已复制到剪贴板。")
        else:
            print(f"❌ 识别失败：{result.get('message') or result.get('detail') or result}")

    except Exception as e:
        print(f"❌ 连接失败: {e}")

if __name__ == "__main__":
    main()`;
  }

  function highlightPythonCode(code: string) {
    const escapeCode = (value: unknown) => String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const highlightPlain = (value: string) => escapeCode(value)
      .replace(/\b(import|from|def|if|else|try|except|return|print|as|None|True|False|is|not|in|and|or)\b|\b(\d+)\b|\b([a-zA-Z_]\w*)(?=\()/g, (match, keyword, number) => {
        if (keyword) return `<span class="py-keyword">${match}</span>`;
        if (number) return `<span class="py-number">${match}</span>`;
        return `<span class="py-function">${match}</span>`;
      });
    return code.split('\n').map((line) => {
      const parts: string[] = [];
      let plainStart = 0;
      for (let index = 0; index < line.length;) {
        const char = line[index];
        if (char === '#') {
          parts.push(highlightPlain(line.slice(plainStart, index)));
          parts.push(`<span class="py-comment">${escapeCode(line.slice(index))}</span>`);
          return parts.join('');
        }
        if (char === '"' || char === "'") {
          parts.push(highlightPlain(line.slice(plainStart, index)));
          const quote = char;
          let end = index + 1;
          while (end < line.length) {
            if (line[end] === quote && line[end - 1] !== '\\') {
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
      return parts.join('');
    }).join('\n');
  }

  function renderApiClientCode() {
    const code = generateApiScriptCode();
    $('#api-client-code-block').innerHTML = highlightPythonCode(code);
    const rawInput = $('#api-raw-code-input');
    if (rawInput) rawInput.value = code;
  }

  async function refreshApiClientCredentials() {
    const statusElement = $('#api-client-credential-status');
    if (statusElement) statusElement.textContent = '正在读取当前 API Token…';
    try {
      const response = await fetch(endpoint('api/admin/api-client'));
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.api_server_token) {
        if (statusElement) {
          statusElement.textContent = payload.detail
            ? `未能自动读取 Token：${payload.detail}`
            : '未能自动读取 Token。';
        }
        return false;
      }
      rememberApiSettings(payload);
      if (statusElement) {
        statusElement.textContent = '当前有效 Token 仅显示在下方示例代码中，可直接复制运行。';
      }
      return true;
    } catch (error) {
      if (statusElement) statusElement.textContent = `读取 Token 失败：${error.message}`;
      return false;
    }
  }

  $('#open-api-setup')?.addEventListener('click', async (event: MouseEvent) => {
    event.stopPropagation();
    if (!dialog) return;
    dialog.showModal();
    await refreshApiClientCredentials();
    renderApiClientCode();
  });
  $('#api-setup-close')?.addEventListener('click', () => dialog?.close());
  $('#regenerate-api-token')?.addEventListener('click', async () => {
    if (!window.confirm('重新生成后，所有使用旧 Token 的客户端会立即无法访问。确定继续吗？')) return;
    const button = $('#regenerate-api-token');
    const statusElement = $('#api-client-credential-status');
    button.disabled = true;
    if (statusElement) statusElement.textContent = '正在使旧 Token 失效…';
    try {
      const response = await fetch(endpoint('api/admin/api-token'), { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.api_server_token) {
        throw new Error(payload.detail || '重新生成 Token 失败。');
      }
      rememberApiSettings(payload);
      renderApiClientCode();
      if (statusElement) {
        statusElement.textContent = 'Token 已重新生成；新 Token 仅显示在下方示例代码中。';
      }
    } catch (error) {
      if (statusElement) statusElement.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  $('#copy-api-script')?.addEventListener('click', async (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const button = $('#copy-api-script');
    if (button) button.blur();
    const rawCode = generateApiScriptCode();
    const rawInput = $('#api-raw-code-input');
    if (rawInput) rawInput.value = rawCode;
    const selection = window.getSelection();
    if (selection) selection.removeAllRanges();
    let copied = false;
    if (rawInput) {
      try {
        rawInput.focus();
        rawInput.select();
        rawInput.setSelectionRange(0, rawCode.length);
        copied = document.execCommand('copy');
      } catch {}
    }
    if (!copied && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(rawCode);
        copied = true;
      } catch {}
    }
    if (selection) selection.removeAllRanges();
    if (copied) {
      if (button) {
        const originalText = button.textContent;
        button.textContent = '已复制！';
        setTimeout(() => { button.textContent = originalText; }, 2000);
      }
      return;
    }
    const codeBlock = $('#api-client-code-block');
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
      button.textContent = '已选中代码，请按 Ctrl+C / ⌘C';
      setTimeout(() => { button.textContent = originalText; }, 2500);
    }
  });
}
