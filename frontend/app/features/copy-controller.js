import { $ } from '../core/dom.js';
import { mathJaxToMathML } from '../core/mathjax-runtime.js';

export function initializeCopyController({
  getLatexValue,
  getVisualLatexValue,
  setStatus,
  setVisualStatus,
}) {
  const copyFormatControls = [$('#copy-format'), $('#visual-copy-format')].filter(Boolean);
  let copyFormat = localStorage.getItem('formula-ocr-copy-format') || 'raw';

  function synchronizeCopyFormat(value, persist = true) {
    const validFormats = new Set(['raw', 'inline-dollar', 'block-dollar', 'inline-paren', 'block-bracket', 'mathml']);
    copyFormat = validFormats.has(value) ? value : 'raw';
    copyFormatControls.forEach((control) => { control.value = copyFormat; });
    if (persist) localStorage.setItem('formula-ocr-copy-format', copyFormat);
  }

  async function formattedLatex(rawValue = getLatexValue(), format = copyFormat) {
    const raw = String(rawValue || '').trim();
    if (format === 'mathml') {
      try {
        return await mathJaxToMathML(raw, { display: true });
      } catch {
        return raw;
      }
    }
    switch (format) {
      case 'inline-dollar': return `$${raw}$`;
      case 'block-dollar': return `$$${raw}$$`;
      case 'inline-paren': return `\\(${raw}\\)`;
      case 'block-bracket': return `\\[${raw}\\]`;
      default: return raw;
    }
  }

  function fallbackCopyText(text) {
    const parent = document.querySelector('dialog[open]') || document.body;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '50%';
    textarea.style.top = '50%';
    textarea.style.width = '100px';
    textarea.style.height = '40px';
    textarea.style.opacity = '0.01';
    textarea.style.zIndex = '99999';
    parent.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    let successful = false;
    try {
      successful = document.execCommand('copy');
    } catch {}
    parent.removeChild(textarea);
    return successful;
  }

  function fallbackCopyHtml(htmlContent) {
    const parent = document.querySelector('dialog[open]') || document.body;
    const container = document.createElement('div');
    container.contentEditable = 'true';
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.opacity = '0';
    container.innerHTML = htmlContent;
    parent.appendChild(container);
    const range = document.createRange();
    range.selectNodeContents(container);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    let successful = false;
    try {
      successful = document.execCommand('copy');
    } catch {}
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
          setStatus('已复制到剪贴板。');
          return;
        } catch {}
      }
      if (fallbackCopyText(formatted)) {
        setStatus('已复制到剪贴板。');
      } else {
        setStatus('浏览器拒绝剪贴板访问，请使用手动选择复制。', true);
      }
    } catch {
      setStatus('浏览器拒绝剪贴板访问，请使用手动选择复制。', true);
    }
  }

  async function copyToWord(latexValue, buttonElement, isVisual = false) {
    const raw = (
      latexValue !== undefined && latexValue !== null
        ? latexValue
        : (isVisual ? getVisualLatexValue() : getLatexValue())
    ).trim();
    const setStatusForEditor = isVisual ? setVisualStatus : setStatus;
    if (!raw) {
      setStatusForEditor('没有可复制的公式内容。', true);
      return;
    }
    try {
      const mathml = await mathJaxToMathML(raw, { display: true });
      const htmlContent = `<!--StartFragment--><math xmlns="http://www.w3.org/1998/Math/MathML" display="block">${mathml.replace(/^<math[^>]*>/, '').replace(/<\/math>$/, '')}</math><!--EndFragment-->`;
      let copied = false;
      if (navigator.clipboard?.write && window.ClipboardItem) {
        try {
          const item = new ClipboardItem({
            'text/html': new Blob([htmlContent], { type: 'text/html' }),
            'text/plain': new Blob([mathml], { type: 'text/plain' }),
          });
          await navigator.clipboard.write([item]);
          copied = true;
        } catch (error) {
          console.warn('ClipboardItem write failed, fallbacking to execCommand:', error);
        }
      }
      if (!copied) copied = fallbackCopyHtml(htmlContent);
      if (!copied) throw new Error('所有复制途径均失败');
      if (buttonElement) {
        const originalText = buttonElement.textContent;
        buttonElement.textContent = '✓ 已复制 Word 公式';
        buttonElement.disabled = true;
        setTimeout(() => {
          buttonElement.textContent = originalText;
          buttonElement.disabled = false;
        }, 1600);
      }
      setStatusForEditor('已成功复制 Word 公式格式，可在 Word / WPS 中按 Ctrl+V 粘贴。');
    } catch (error) {
      console.warn('Word copy error:', error);
      try {
        const mathml = await mathJaxToMathML(raw, { display: true });
        if (fallbackCopyText(mathml)) {
          setStatusForEditor('已复制 MathML 文本，可在 Word 中粘贴。');
        } else {
          setStatusForEditor('复制失败，请使用手动选择复制。', true);
        }
      } catch {
        setStatusForEditor('复制失败，请使用手动选择复制。', true);
      }
    }
  }

  function checkHttpAutoCopyPermission() {
    const isHttp = location.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(location.hostname);
    if (isHttp && !window.isSecureContext) {
      $('#http-setup-nas-origin').value = location.origin;
      $('#http-setup-dialog').showModal();
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
      } catch {}
    }
    if (!copied) {
      inputElement.focus();
      inputElement.select();
      try {
        copied = document.execCommand('copy');
      } catch {}
    }
    if (!copied) copied = fallbackCopyText(text);
    if (copied) {
      if (buttonElement) {
        const originalText = buttonElement.textContent;
        buttonElement.textContent = '✓ 已复制';
        buttonElement.disabled = true;
        setTimeout(() => {
          buttonElement.textContent = originalText;
          buttonElement.disabled = false;
        }, 1500);
      }
      setStatus(successMessage);
    } else {
      setStatus('复制失败，请双击选中文本手动复制。', true);
    }
  }

  async function copyVisualLatex() {
    const value = getVisualLatexValue().trim();
    if (!value) {
      setVisualStatus('没有可复制的 LaTeX');
      return;
    }
    try {
      const formatted = await formattedLatex(value, copyFormat);
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(formatted);
          setVisualStatus('已按所选格式复制');
          return;
        } catch {}
      }
      if (fallbackCopyText(formatted)) {
        setVisualStatus('已按所选格式复制');
      } else {
        setVisualStatus('浏览器拒绝剪贴板访问，请手动复制源码');
      }
    } catch {
      setVisualStatus('浏览器拒绝剪贴板访问，请手动复制源码');
    }
  }

  $('#copy').addEventListener('click', copyLatex);
  $('#copy-word').addEventListener('click', () => copyToWord(null, $('#copy-word'), false));
  $('#visual-copy').addEventListener('click', copyVisualLatex);
  $('#visual-copy-word').addEventListener('click', () => copyToWord(null, $('#visual-copy-word'), true));
  copyFormatControls.forEach((control) => {
    control.addEventListener('change', () => synchronizeCopyFormat(control.value));
  });
  $('#auto-copy').addEventListener('change', () => {
    const isChecked = $('#auto-copy').checked;
    localStorage.setItem('formula-ocr-auto-copy', isChecked ? '1' : '0');
    if (isChecked) checkHttpAutoCopyPermission();
  });
  $('#copy-flag-link').addEventListener('click', () => {
    copyInputElementValue(
      $('#http-setup-flag-link'),
      $('#copy-flag-link'),
      '已复制 Flag 链接，请在 Chrome 地址栏中粘贴打开。',
    );
  });
  $('#copy-nas-origin').addEventListener('click', () => {
    copyInputElementValue($('#http-setup-nas-origin'), $('#copy-nas-origin'), '已复制当前 NAS 网址。');
  });
  $('#http-setup-close').addEventListener('click', () => $('#http-setup-dialog').close());

  synchronizeCopyFormat(copyFormat, false);
  $('#auto-copy').checked = localStorage.getItem('formula-ocr-auto-copy') === '1';

  return { copyLatex };
}
