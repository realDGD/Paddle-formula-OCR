(() => {
  const state = { file: null, originalFile: null, jobId: null, jobStatus: null, pollTimer: null, crop: null };
  const $ = (selector) => document.querySelector(selector);
  const endpoint = (path) => new URL(path, document.baseURI).toString();
  const imageInput = $('#image-input');
  const dropZone = $('#drop-zone');
  const imagePanel = $('#image-panel');
  const preview = $('#image-preview');
  const cropCanvas = $('#crop-canvas');
  const cropDialog = $('#crop-dialog');
  const latex = $('#latex-output');
  const latexEditor = window.FormulaLatexEditor?.create(latex, $('#latex-editor')) || null;
  const statusText = $('#job-status');
  const visualLatex = $('#visual-latex-output');
  const visualLatexEditor = window.FormulaLatexEditor?.create(visualLatex, $('#visual-latex-editor')) || null;
  const visualField = $('#visual-math-field');
  const visualStatus = $('#visual-editor-status');
  let syncingVisualEditor = false;

  async function refreshRuntimeAvailability() {
    try {
      const response = await fetch(endpoint('api/system-info'));
      const payload = await response.json();
      if (!response.ok) return;
      $('#runtime-setup-notice').hidden = Object.values(payload.runtimes || {}).some(Boolean);
    } catch (_) {
      // The normal recognition request will present any gateway error.
    }
  }

  let syncingCode = false;

  const getLatexValue = () => latexEditor ? latexEditor.getValue() : latex.value;
  const setLatexValue = (value, skipSyncVisual = false) => {
    const next = String(value || '');
    if (latexEditor) latexEditor.setValue(next);
    else latex.value = next;
    $('#continue-visual-edit').disabled = !next.trim();
    if (!skipSyncVisual && !syncingCode) {
      syncingCode = true;
      setVisualLatexValue(next, '已同步图片识别 LaTeX', true);
      syncingCode = false;
    }
  };

  const getVisualLatexValue = () => visualField?.getValue?.('latex') || (visualLatexEditor ? visualLatexEditor.getValue() : visualLatex.value);
  function setVisualStatus(message) {
    visualStatus.textContent = message;
  }
  function setVisualLatexValue(value, message = '已同步 LaTeX 源码', skipSyncOcr = false) {
    const next = String(value || '');
    if (syncingVisualEditor) return;
    syncingVisualEditor = true;
    if (visualField?.setValue && visualField.getValue('latex') !== next) visualField.setValue(next);
    if (visualLatexEditor) visualLatexEditor.setValue(next);
    else visualLatex.value = next;
    syncingVisualEditor = false;
    setVisualStatus(message);

    if (!skipSyncOcr && !syncingCode) {
      syncingCode = true;
      setLatexValue(next, true);
      renderLatex();
      syncingCode = false;
    }
  }
  function syncVisualFromField() {
    if (syncingVisualEditor || !visualField?.getValue) return;
    syncingVisualEditor = true;
    const next = visualField.getValue('latex');
    if (visualLatexEditor) visualLatexEditor.setValue(next);
    else visualLatex.value = next;
    syncingVisualEditor = false;
    setVisualStatus('可视化输入已同步');

    if (!syncingCode) {
      syncingCode = true;
      setLatexValue(next, true);
      renderLatex();
      syncingCode = false;
    }
  }
  function insertVisualLatex(value) {
    if (!visualField?.insert) {
      setVisualLatexValue(`${getVisualLatexValue()}${value}`, '已插入快捷工具');
      return;
    }
    visualField.focus();
    visualField.insert(value, { insertionMode: 'replaceSelection', focus: true });
    syncVisualFromField();
  }
  function showWorkbenchPage(page) {
    for (const candidate of ['ocr', 'editor']) {
      $(`#${candidate}-page`).hidden = candidate !== page;
    }
    document.querySelectorAll('.page-tab').forEach((tab) => {
      const active = tab.dataset.page === page;
      tab.classList.toggle('is-active', active);
      tab.classList.toggle('secondary', !active);
      tab.setAttribute('aria-current', active ? 'page' : 'false');
    });
    if (page === 'editor') window.setTimeout(() => visualField?.focus?.(), 0);
  }

  function renderDownloadSources(sources) {
    const container = $('#settings-sources');
    const entries = [
      ['CPU 运行时', sources.cpu_paddle || '未提供'],
      ['NVIDIA CUDA 11.8', sources.cuda118_paddle || '未提供'],
      ['NVIDIA CUDA 12.6', sources.cuda126_paddle || '未提供'],
      ['CUDA PaddleOCR', sources.cuda_paddleocr || '未提供'],
      ['模型', sources.formula_models || '未提供'],
    ];
    const title = document.createElement('h3'); title.textContent = '下载源';
    const list = document.createElement('dl');
    for (const [label, value] of entries) {
      const term = document.createElement('dt'); term.textContent = label;
      const detail = document.createElement('dd'); detail.textContent = value;
      list.append(term, detail);
    }
    container.replaceChildren(title, list);
  }

  function setStatus(message, error = false, phase = '') {
    statusText.textContent = message;
    statusText.style.color = error ? '#c13333' : '';
    statusText.dataset.phase = phase;
  }

  function jobIsActive(status = state.jobStatus) {
    return ['queued', 'loading_model', 'running'].includes(status);
  }

  function updateJobControls() {
    const active = jobIsActive();
    $('#recognize').disabled = !state.file || active;
    $('#cancel-job').hidden = !state.jobId || !jobIsActive();
    $('#clear-image').disabled = active;
    $('#crop-open').disabled = active;
  }

  function setImage(file, isCropped = false) {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setStatus('请选择 PNG、JPEG 或 WebP 图片。', true);
      return;
    }
    state.isCropped = isCropped;
    if (!isCropped) {
      state.originalFile = file;
    }
    state.file = file;
    preview.src = URL.createObjectURL(file);
    preview.onload = () => URL.revokeObjectURL(preview.src);
    dropZone.hidden = true;
    imagePanel.hidden = false;
    const restoreBtn = $('#restore-image');
    if (restoreBtn) restoreBtn.hidden = !state.isCropped;
    updateJobControls();
    $('#image-info').textContent = `${file.name || '粘贴图片'} · ${(file.size / 1024).toFixed(1)} KB${state.isCropped ? ' (已裁剪)' : ''}`;
    setStatus(state.isCropped ? '图片裁剪成功。误裁剪可点击“还原原图”。' : '图片已准备好。');
  }

  $('#select-image').addEventListener('click', () => imageInput.click());
  imageInput.addEventListener('change', () => setImage(imageInput.files[0]));
  dropZone.addEventListener('click', (event) => { if (event.target === dropZone) imageInput.click(); });
  dropZone.addEventListener('dragover', (event) => { event.preventDefault(); dropZone.classList.add('dragging'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
  dropZone.addEventListener('drop', (event) => { event.preventDefault(); dropZone.classList.remove('dragging'); setImage(event.dataTransfer.files[0]); });
  window.addEventListener('paste', (event) => {
    for (const item of event.clipboardData?.items || []) {
      if (item.type.startsWith('image/')) { setImage(item.getAsFile()); break; }
    }
  });
  $('#clear-image').addEventListener('click', () => {
    closeCrop();
    state.file = null; state.originalFile = null; state.isCropped = false; preview.removeAttribute('src'); imagePanel.hidden = true; dropZone.hidden = false; imageInput.value = '';
    const restoreBtn = $('#restore-image');
    if (restoreBtn) restoreBtn.hidden = true;
    updateJobControls();
    setStatus('请选择图片。');
  });
  $('#restore-image').addEventListener('click', () => {
    if (state.originalFile) {
      setImage(state.originalFile, false);
      setStatus('已成功还原为原始图片。');
    }
  });

  function prepareCropCanvas() {
    const sourceImg = state.cropImage || preview;
    const width = sourceImg.naturalWidth || sourceImg.width;
    const height = sourceImg.naturalHeight || sourceImg.height;
    const maxWidth = Math.min(width, 900);
    const ratio = maxWidth / width;
    cropCanvas.width = maxWidth; cropCanvas.height = Math.round(height * ratio);
    const context = cropCanvas.getContext('2d');
    state.crop = { start: null, end: null, context, ratio, dragging: false, sourceImg };
    drawCrop();
  }
  function drawCrop() {
    if (!state.crop) return;
    const { context, start, end, sourceImg } = state.crop;
    const img = sourceImg || preview;
    context.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
    context.drawImage(img, 0, 0, cropCanvas.width, cropCanvas.height);
    if (!start || !end) return;
    const x = Math.min(start.x, end.x), y = Math.min(start.y, end.y), w = Math.abs(start.x - end.x), h = Math.abs(start.y - end.y);
    context.fillStyle = 'rgba(0, 0, 0, .45)';
    context.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
    context.drawImage(img, x / state.crop.ratio, y / state.crop.ratio, w / state.crop.ratio, h / state.crop.ratio, x, y, w, h);
    context.strokeStyle = '#1769e0'; context.lineWidth = 2; context.strokeRect(x, y, w, h);
  }
  function canvasPoint(event) {
    const rect = cropCanvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * cropCanvas.width / rect.width, y: (event.clientY - rect.top) * cropCanvas.height / rect.height };
  }
  function openCrop() {
    const cropFile = state.originalFile || state.file;
    if (!cropFile) {
      setStatus('请先选择图片。', true);
      return;
    }
    const img = new Image();
    img.src = URL.createObjectURL(cropFile);
    img.onload = () => {
      state.cropImage = img;
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
  $('#crop-open').addEventListener('click', openCrop);
  $('#crop-close').addEventListener('click', closeCrop);
  $('#crop-cancel').addEventListener('click', closeCrop);
  $('#crop-reset').addEventListener('click', prepareCropCanvas);
  cropDialog.addEventListener('close', () => { closeCrop(); });
  cropCanvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !state.crop) return;
    cropCanvas.setPointerCapture(event.pointerId);
    const point = canvasPoint(event);
    state.crop.start = point;
    state.crop.end = point;
    state.crop.dragging = true;
    drawCrop();
  });
  cropCanvas.addEventListener('pointermove', (event) => {
    if (!state.crop?.dragging) return;
    state.crop.end = canvasPoint(event);
    drawCrop();
  });
  function finishCropDrag(event) {
    if (!state.crop?.dragging) return;
    state.crop.end = canvasPoint(event);
    state.crop.dragging = false;
    if (cropCanvas.hasPointerCapture(event.pointerId)) cropCanvas.releasePointerCapture(event.pointerId);
    drawCrop();
  }
  cropCanvas.addEventListener('pointerup', finishCropDrag);
  cropCanvas.addEventListener('pointercancel', finishCropDrag);
  $('#crop-apply').addEventListener('click', () => {
    const crop = state.crop;
    if (!crop?.start || !crop.end) { setStatus('请在图片上拖动以选择公式区域。', true); return; }
    const x = Math.min(crop.start.x, crop.end.x) / crop.ratio, y = Math.min(crop.start.y, crop.end.y) / crop.ratio;
    const width = Math.abs(crop.start.x - crop.end.x) / crop.ratio, height = Math.abs(crop.start.y - crop.end.y) / crop.ratio;
    if (width < 8 || height < 8) { setStatus('裁剪区域过小。', true); return; }
    const sourceImg = crop.sourceImg || preview;
    const output = document.createElement('canvas'); output.width = Math.round(width); output.height = Math.round(height);
    output.getContext('2d').drawImage(sourceImg, x, y, width, height, 0, 0, output.width, output.height);
    output.toBlob((blob) => {
      if (blob) setImage(new File([blob], 'formula-crop.png', { type: 'image/png' }), true);
      closeCrop();
    }, 'image/png');
  });

  async function formattedLatex() {
    const raw = getLatexValue().trim();
    if ($('#copy-format').value === 'mathml') {
      if (window.MathJax?.tex2mmlPromise) {
        try {
          return await window.MathJax.tex2mmlPromise(raw, { display: true });
        } catch {
          return raw;
        }
      }
    }
    switch ($('#copy-format').value) {
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
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    textarea.style.opacity = '0';
    parent.appendChild(textarea);
    textarea.focus();
    textarea.select();
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
  async function copyToWord(latexValue, buttonEl, isVisual = false) {
    const raw = (latexValue !== undefined && latexValue !== null ? latexValue : (isVisual ? getVisualLatexValue() : getLatexValue())).trim();
    const setStatusFn = isVisual ? setVisualStatus : setStatus;
    if (!raw) {
      setStatusFn('没有可复制的公式内容。', true);
      return;
    }
    try {
      let mml = '';
      if (window.MathJax?.tex2mmlPromise) {
        mml = await window.MathJax.tex2mmlPromise(raw, { display: true });
      } else {
        throw new Error('MathJax 引擎未就绪');
      }
      const htmlContent = `<!--StartFragment--><math xmlns="http://www.w3.org/1998/Math/MathML" display="block">${mml.replace(/^<math[^>]*>/, '').replace(/<\/math>$/, '')}</math><!--EndFragment-->`;
      let copied = false;
      if (navigator.clipboard?.write && window.ClipboardItem) {
        try {
          const item = new ClipboardItem({
            'text/html': new Blob([htmlContent], { type: 'text/html' }),
            'text/plain': new Blob([mml], { type: 'text/plain' }),
          });
          await navigator.clipboard.write([item]);
          copied = true;
        } catch (err) {
          console.warn('ClipboardItem write failed, fallbacking to execCommand:', err);
        }
      }
      if (!copied) {
        copied = fallbackCopyHtml(htmlContent);
      }
      if (copied) {
        if (buttonEl) {
          const originalText = buttonEl.textContent;
          buttonEl.textContent = '✓ 已复制 Word 公式';
          buttonEl.disabled = true;
          setTimeout(() => {
            buttonEl.textContent = originalText;
            buttonEl.disabled = false;
          }, 1600);
        }
        setStatusFn('已成功复制 Word 公式格式，可在 Word / WPS 中按 Ctrl+V 粘贴。');
      } else {
        throw new Error('所有复制途径均失败');
      }
    } catch (e) {
      console.warn('Word copy error:', e);
      try {
        const mml = window.MathJax?.tex2mmlPromise ? await window.MathJax.tex2mmlPromise(raw, { display: true }) : raw;
        if (fallbackCopyText(mml)) {
          setStatusFn('已复制 MathML 文本，可在 Word 中粘贴。');
        } else {
          setStatusFn('复制失败，请使用手动选择复制。', true);
        }
      } catch {
        setStatusFn('复制失败，请使用手动选择复制。', true);
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

  $('#copy').addEventListener('click', copyLatex);
  $('#copy-word').addEventListener('click', () => copyToWord(null, $('#copy-word'), false));
  $('#copy-format').addEventListener('change', () => localStorage.setItem('formula-ocr-copy-format', $('#copy-format').value));
  $('#auto-copy').addEventListener('change', () => {
    const isChecked = $('#auto-copy').checked;
    localStorage.setItem('formula-ocr-auto-copy', isChecked ? '1' : '0');
    if (isChecked) {
      checkHttpAutoCopyPermission();
    }
  });
  $('#copy-format').value = localStorage.getItem('formula-ocr-copy-format') || 'raw';
  $('#auto-copy').checked = localStorage.getItem('formula-ocr-auto-copy') === '1';

  async function copyInputElementValue(inputEl, buttonEl, successMsg) {
    if (!inputEl) return;
    const text = inputEl.value;
    let copied = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch {}
    }
    if (!copied) {
      inputEl.focus();
      inputEl.select();
      try {
        copied = document.execCommand('copy');
      } catch {}
    }
    if (!copied) {
      copied = fallbackCopyText(text);
    }
    if (copied) {
      if (buttonEl) {
        const orig = buttonEl.textContent;
        buttonEl.textContent = '✓ 已复制';
        buttonEl.disabled = true;
        setTimeout(() => { buttonEl.textContent = orig; buttonEl.disabled = false; }, 1500);
      }
      setStatus(successMsg);
    } else {
      setStatus('复制失败，请双击选中文本手动复制。', true);
    }
  }

  $('#copy-flag-link').addEventListener('click', () => {
    copyInputElementValue($('#http-setup-flag-link'), $('#copy-flag-link'), '已复制 Flag 链接，请在 Chrome 地址栏中粘贴打开。');
  });
  $('#copy-nas-origin').addEventListener('click', () => {
    copyInputElementValue($('#http-setup-nas-origin'), $('#copy-nas-origin'), '已复制当前 NAS 网址。');
  });
  $('#http-setup-close').addEventListener('click', () => $('#http-setup-dialog').close());

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function renderLatex() {
    const target = $('#latex-preview'); const value = getLatexValue().trim();
    if (!value) {
      target.textContent = '预览会显示在这里。';
      $('#render-status').textContent = '';
      $('#render-status').title = '';
      return;
    }
    target.textContent = `\\[${value}\\]`;
    try {
      if (!window.MathJax?.typesetPromise) throw new Error('MathJax 尚未加载');
      await window.MathJax.typesetPromise([target]);
      const errorNode = target.querySelector('.mjx-merror, [data-mjx-error], mjx-container[data-mjx-error], .merror');
      if (errorNode) {
        const errorText = errorNode.textContent || 'LaTeX 语法不完整或存在错误';
        target.innerHTML = `<div class="preview-error-box"><div class="error-title">⚠️ 公式语法不完整或存在错误</div><div class="error-detail">${escapeHtml(errorText)}</div></div>`;
        $('#render-status').textContent = '语法错误';
        $('#render-status').title = errorText;
      } else {
        $('#render-status').textContent = '';
        $('#render-status').title = '';
      }
    } catch (error) {
      const msg = error.message || String(error);
      target.innerHTML = `<div class="preview-error-box"><div class="error-title">⚠️ 公式渲染失败</div><div class="error-detail">${escapeHtml(msg)}</div></div>`;
      $('#render-status').textContent = '预览失败';
      $('#render-status').title = msg;
    }
  }
  latex.addEventListener('input', () => {
    $('#continue-visual-edit').disabled = !getLatexValue().trim();
    renderLatex();
  });

  const formulaTemplates = {
    quadratic: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
    binomial: '(a+b)^n = \\sum_{k=0}^{n} \\binom{n}{k}a^{n-k}b^k',
    gaussian: '\\int_{-\\infty}^{\\infty} e^{-x^2} \\, \\mathrm{d}x = \\sqrt{\\pi}',
    piecewise: 'f(x)=\\begin{cases}x^2, & x \\geq 0\\\\-x, & x < 0\\end{cases}',
    matrix: '\\det\\begin{pmatrix}a & b\\\\c & d\\end{pmatrix}=ad-bc',
    fourier: 'f(x) = \\frac{a_0}{2} + \\sum_{n=1}^{\\infty}\\left(a_n\\cos nx+b_n\\sin nx\\right)',
  };
  document.querySelectorAll('#visual-tool-groups [data-insert]').forEach((button) => {
    button.addEventListener('click', () => insertVisualLatex(button.dataset.insert));
  });
  $('#insert-template').addEventListener('click', () => {
    const template = formulaTemplates[$('#formula-template').value];
    if (!template) { setVisualStatus('请先选择一个公式模板'); return; }
    insertVisualLatex(template);
  });
  latex.addEventListener('input', () => {
    if (syncingCode) return;
    syncingCode = true;
    setVisualLatexValue(getLatexValue(), '已同步图片识别 LaTeX', true);
    renderLatex();
    syncingCode = false;
  });
  visualField?.addEventListener('input', syncVisualFromField);
  visualLatex.addEventListener('input', () => {
    if (syncingVisualEditor) return;
    setVisualLatexValue(visualLatexEditor ? visualLatexEditor.getValue() : visualLatex.value);
  });
  $('#visual-clear').addEventListener('click', () => setVisualLatexValue('', '已清空公式'));
  $('#visual-copy').addEventListener('click', async () => {
    const value = getVisualLatexValue().trim();
    if (!value) { setVisualStatus('没有可复制的 LaTeX'); return; }
    try {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(value);
          setVisualStatus('已复制 LaTeX 源码');
          return;
        } catch {}
      }
      if (fallbackCopyText(value)) {
        setVisualStatus('已复制 LaTeX 源码');
      } else {
        setVisualStatus('浏览器拒绝剪贴板访问，请手动复制源码');
      }
    } catch { setVisualStatus('浏览器拒绝剪贴板访问，请手动复制源码'); }
  });
  $('#visual-copy-word').addEventListener('click', () => copyToWord(null, $('#visual-copy-word'), true));
  $('#continue-visual-edit').addEventListener('click', () => {
    const value = getLatexValue();
    if (!value.trim()) return;
    setVisualLatexValue(value, '已从图片识别结果导入');
    showWorkbenchPage('editor');
  });
  document.querySelectorAll('.page-tab').forEach((tab) => {
    tab.addEventListener('click', () => showWorkbenchPage(tab.dataset.page));
  });

  const handwritingCanvas = $('#handwriting-canvas');
  const handwritingContext = handwritingCanvas.getContext('2d');
  const handwriting = { strokes: [], activeStroke: null };
  function handwritingPoint(event) {
    const rect = handwritingCanvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * handwritingCanvas.width / rect.width,
      y: (event.clientY - rect.top) * handwritingCanvas.height / rect.height,
    };
  }
  function drawHandwriting() {
    handwritingContext.clearRect(0, 0, handwritingCanvas.width, handwritingCanvas.height);
    const dark = document.documentElement.dataset.fnosTheme === 'dark'
      || (!document.documentElement.dataset.fnosTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    handwritingContext.strokeStyle = dark ? '#d8e6fb' : '#173860';
    handwritingContext.lineWidth = 5;
    handwritingContext.lineCap = 'round';
    handwritingContext.lineJoin = 'round';
    for (const stroke of handwriting.strokes) {
      if (!stroke.length) continue;
      handwritingContext.beginPath();
      handwritingContext.moveTo(stroke[0].x, stroke[0].y);
      for (const point of stroke.slice(1)) handwritingContext.lineTo(point.x, point.y);
      handwritingContext.stroke();
    }
  }
  function clearHandwriting() {
    handwriting.strokes = [];
    handwriting.activeStroke = null;
    drawHandwriting();
    $('#handwriting-candidates').replaceChildren(Object.assign(document.createElement('p'), { className: 'subtle', textContent: '请画一个数学符号，再获取候选。' }));
  }
  handwritingCanvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    handwritingCanvas.setPointerCapture(event.pointerId);
    handwriting.activeStroke = [handwritingPoint(event)];
    handwriting.strokes.push(handwriting.activeStroke);
    drawHandwriting();
  });
  handwritingCanvas.addEventListener('pointermove', (event) => {
    if (!handwriting.activeStroke) return;
    handwriting.activeStroke.push(handwritingPoint(event));
    drawHandwriting();
  });
  function finishHandwritingStroke(event) {
    if (!handwriting.activeStroke) return;
    handwriting.activeStroke.push(handwritingPoint(event));
    handwriting.activeStroke = null;
    if (handwritingCanvas.hasPointerCapture(event.pointerId)) handwritingCanvas.releasePointerCapture(event.pointerId);
    drawHandwriting();
    runHandwritingRecognition();
  }
  handwritingCanvas.addEventListener('pointerup', finishHandwritingStroke);
  handwritingCanvas.addEventListener('pointercancel', finishHandwritingStroke);
  let detexifyDataset = null;
  let loadingDetexifyDataset = false;

  async function loadDetexifyDataset() {
    if (detexifyDataset) return detexifyDataset;
    if (loadingDetexifyDataset) {
      while (loadingDetexifyDataset) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return detexifyDataset;
    }
    loadingDetexifyDataset = true;
    try {
      const response = await fetch(endpoint('vendor/detexify/detexify-dataset.json'));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      detexifyDataset = await response.json();
    } catch (e) {
      console.warn('Failed to load Detexify dataset:', e);
      detexifyDataset = [];
    } finally {
      loadingDetexifyDataset = false;
    }
    return detexifyDataset;
  }

  const LATEX_UNICODE_MAP = {
    '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\epsilon': 'ϵ',
    '\\varepsilon': 'ε', '\\zeta': 'ζ', '\\eta': 'η', '\\theta': 'θ', '\\vartheta': 'ϑ',
    '\\iota': 'ι', '\\kappa': 'κ', '\\lambda': 'λ', '\\mu': 'μ', '\\nu': 'ν',
    '\\xi': 'ξ', '\\pi': 'π', '\\varpi': 'ϖ', '\\rho': 'ρ', '\\varrho': 'ϱ',
    '\\sigma': 'σ', '\\varsigma': 'ς', '\\tau': 'τ', '\\upsilon': 'υ', '\\phi': 'ϕ',
    '\\varphi': 'φ', '\\chi': 'χ', '\\psi': 'ψ', '\\omega': 'ω',
    '\\Gamma': 'Γ', '\\Delta': 'Δ', '\\Theta': 'Θ', '\\Lambda': 'Λ', '\\Xi': 'Ξ',
    '\\Pi': 'Π', '\\Sigma': 'Σ', '\\Upsilon': 'Υ', '\\Phi': 'Φ', '\\Psi': 'Ψ', '\\Omega': 'Ω',
    '\\sum': '∑', '\\prod': '∏', '\\coprod': '∐', '\\int': '∫', '\\iint': '∬', '\\iiint': '∭',
    '\\oint': '∮', '\\bigcap': '⋂', '\\bigcup': '⋃', '\\bigsqcup': '⊔', '\\bigvee': '⋁', '\\bigwedge': '⋀',
    '\\pm': '±', '\\mp': '∓', '\\times': '×', '\\div': '÷', '\\cdot': '⋅', '\\star': '⋆',
    '\\circ': '∘', '\\bullet': '•', '\\cap': '∩', '\\cup': '∪', '\\uplus': '⊎', '\\sqcap': '⊓',
    '\\sqcup': '⊔', '\\vee': '∨', '\\wedge': '∧', '\\setminus': '∖', '\\wr': '≀',
    '\\le': '≤', '\\leq': '≤', '\\ge': '≥', '\\geq': '≥', '\\ne': '≠', '\\neq': '≠',
    '\\ll': '≪', '\\gg': '≫', '\\lll': '⋘', '\\ggg': '⋙', '\\approx': '≈', '\\sim': '∼', '\\simeq': '≃', '\\equiv': '≡',
    '\\in': '∈', '\\notin': '∉', '\\subset': '⊂', '\\supset': '⊃', '\\subseteq': '⊆', '\\supseteq': '⊇',
    '\\rightarrow': '→', '\\to': '→', '\\leftarrow': '←', '\\Rightarrow': '⇒', '\\Leftarrow': '⇐',
    '\\leftrightarrow': '↔', '\\Leftrightarrow': '⇔', '\\uparrow': '↑', '\\downarrow': '↓',
    '\\Uparrow': '⇑', '\\Downarrow': '⇓', '\\mapsto': '↦', '\\nearrow': '↗', '\\searrow': '↘',
    '\\nwarrow': '↖', '\\swarrow': '↙', '\\infty': '∞', '\\partial': '∂', '\\nabla': '∇',
    '\\surd': '√', '\\sqrt': '√', '\\angle': '∠', '\\bot': '⊥', '\\top': '⊤', '\\forall': '∀',
    '\\exists': '∃', '\\nexists': '∄', '\\emptyset': '∅', '\\hbar': 'ℏ', '\\ell': 'ℓ',
    '\\Im': 'ℑ', '\\Re': 'ℜ', '\\wp': '℘', '\\aleph': 'ℵ', '\\flat': '♭', '\\natural': '♮',
    '\\sharp': '♯', '\\clubsuit': '♣', '\\diamondsuit': '♢', '\\heartsuit': '♡', '\\spadesuit': '♠',
    '\\dotsb': '⋯', '\\dotsc': '…', '\\dotsi': '⋯', '\\dotsm': '⋯', '\\dotso': '…', '\\ldots': '…',
    '\\cdots': '⋯', '\\vdots': '⋮', '\\ddots': '⋱', '\\triangle': '△', '\\square': '□', '\\lozenge': '◊',
    '\\circledS': 'Ⓢ', '\\blacktriangle': '▲', '\\blacktriangledown': '▼', '\\triangledown': '▽',
    '\\blacksquare': '■', '\\blacklozenge': '⧫', '\\bigstar': '★', '\\centerdot': '·',
    '\\boxdot': '⊡', '\\boxplus': '⊞', '\\boxtimes': '⊠', '\\circledast': '⊛', '\\circledcirc': '⊚', '\\circleddash': '⊝'
  };

  function renderSymbolGlyph(item) {
    const span = document.createElement('span');
    span.className = 'candidate-glyph';
    const cmd = typeof item === 'string' ? item : (item && item.cmd ? item.cmd : '');

    // 1. MathLive static markup for 100% matching visual rendering with math-field
    if (window.MathfieldElement && typeof window.MathfieldElement.toMarkup === 'function') {
      try {
        const markup = window.MathfieldElement.toMarkup(cmd, 'math');
        if (markup) {
          span.innerHTML = markup;
          return span;
        }
      } catch (_) {}
    }

    // 2. MathLive read-only element fallback
    try {
      const mf = document.createElement('math-field');
      mf.readOnly = true;
      mf.value = cmd;
      mf.setAttribute('style', 'border:none; background:transparent; font-size:1.25rem; pointer-events:none; min-height:auto; display:inline-block; vertical-align:middle;');
      span.appendChild(mf);
      return span;
    } catch (_) {}

    span.textContent = cmd.replace(/^\\/, '');
    return span;
  }

  function handwritingCandidates() {
    if (!handwriting.strokes || !handwriting.strokes.length || !handwriting.strokes.some((s) => s && s.length)) return [];
    if (!detexifyDataset || !window.DetexifyClassifier) return [];
    const rawResults = window.DetexifyClassifier.classify(handwriting.strokes, detexifyDataset, 12);
    return rawResults.map((res) => res.item);
  }

  async function runHandwritingRecognition() {
    const container = $('#handwriting-candidates');
    if (!handwriting.strokes || !handwriting.strokes.length || !handwriting.strokes.some((s) => s && s.length)) {
      container.replaceChildren(Object.assign(document.createElement('p'), { className: 'subtle', textContent: '在上方画布绘制符号，松笔后自动产生匹配候选。' }));
      return;
    }

    const dataset = await loadDetexifyDataset();
    let candidates = [];
    if (window.DetexifyClassifier && dataset && dataset.length) {
      candidates = handwritingCandidates();
    }

    if (!candidates.length) {
      container.replaceChildren(Object.assign(document.createElement('p'), { className: 'subtle', textContent: '未找到匹配候选符号，请尝试重新书写。' }));
      return;
    }

    const note = document.createElement('p');
    note.className = 'subtle';
    note.textContent = `原生内置符号匹配（常用 550+ 符号，前 ${candidates.length} 个候选）：`;

    const list = document.createElement('div');
    list.className = 'candidate-list';

    for (const item of candidates) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'candidate-button';
      const pkgInfo = item.pkg ? `<small class="subtle" style="margin-left:0.3rem">(${item.pkg})</small>` : '';
      
      const leftDiv = document.createElement('div');
      leftDiv.innerHTML = `<code>${item.cmd}</code>${pkgInfo}`;

      const glyphSpan = renderSymbolGlyph(item);

      button.append(leftDiv, glyphSpan);
      button.title = `点击插入命令 ${item.cmd}`;
      button.addEventListener('click', () => insertVisualLatex(item.cmd));
      list.append(button);
    }

    container.replaceChildren(note, list);

  }

  $('#recognize-handwriting').addEventListener('click', runHandwritingRecognition);
  $('#handwriting-clear').addEventListener('click', () => {
    clearHandwriting();
    const container = $('#handwriting-candidates');
    container.replaceChildren(Object.assign(document.createElement('p'), { className: 'subtle', textContent: '在上方画布绘制符号，松笔后自动产生匹配候选。' }));
  });
  $('#handwriting-undo').addEventListener('click', () => {
    handwriting.strokes.pop();
    drawHandwriting();
    runHandwritingRecognition();
  });
  drawHandwriting();

  async function pollJob() {
    if (!state.jobId) return;
    const response = await fetch(endpoint(`api/jobs/${state.jobId}`));
    const payload = await response.json();
    if (!response.ok) { setStatus(payload.detail || '无法读取任务状态。', true); return; }
    const job = payload.job;
    state.jobStatus = job.status;
    const labels = {
      queued: `正在排队，第 ${job.queue_position || '?'} 位`,
      loading_model: '正在加载模型（首次加载或切换模型时需要等待）…',
      running: '正在识别公式…',
      succeeded: '识别完成。',
      failed: `识别失败：${job.error_message || '未知错误'}`,
      timed_out: '识别超时。',
      cancelled: '任务已取消；当前底层推理会自然结束，模型保持加载。',
    };
    setStatus(labels[job.status] || job.status, ['failed', 'timed_out'].includes(job.status), job.status);
    if (job.status === 'succeeded') {
      setLatexValue(job.latex_raw || ''); await renderLatex();
      if ($('#auto-copy').checked) await copyLatex();
    }
    updateJobControls();
    if (['succeeded', 'failed', 'timed_out', 'cancelled'].includes(job.status)) {
      clearInterval(state.pollTimer); state.pollTimer = null; state.jobId = null; updateJobControls();
    }
  }
  $('#recognize').addEventListener('click', async () => {
    if (!state.file) return;
    const body = new FormData(); body.append('image', state.file, state.file.name);
    $('#recognize').disabled = true; setStatus('正在创建任务…', false, 'queued');
    try {
      const response = await fetch(endpoint('api/jobs'), { method: 'POST', body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || '创建任务失败。');
      state.jobId = payload.job.id; state.jobStatus = 'queued'; updateJobControls(); await pollJob();
      clearInterval(state.pollTimer); state.pollTimer = setInterval(pollJob, 750);
    } catch (error) { state.jobId = null; state.jobStatus = null; updateJobControls(); setStatus(error.message, true); }
  });
  $('#cancel-job').addEventListener('click', async () => {
    if (!state.jobId) return;
    $('#cancel-job').disabled = true;
    try {
      const response = await fetch(endpoint(`api/jobs/${state.jobId}`), { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.detail || '无法取消任务。');
      }
      state.jobStatus = 'cancelled';
      setStatus('任务已取消；当前底层推理会自然结束，模型保持加载。', false, 'cancelled');
      clearInterval(state.pollTimer); state.pollTimer = null; state.jobId = null; updateJobControls();
    } catch (error) { setStatus(error.message, true); }
    finally { $('#cancel-job').disabled = false; }
  });

  const dialog = $('#settings-dialog');
  const settingsForm = $('#settings-form');
  const bootstrapDialog = $('#bootstrap-dialog');
  const logsDialog = $('#logs-dialog');
  $('#open-settings').addEventListener('click', async () => {
    try {
      const response = await fetch(endpoint('api/settings')); const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || '无管理员权限。');
      for (const [key, value] of Object.entries(payload.settings)) {
        const field = settingsForm.elements.namedItem(key);
        if (field) field.value = value;
      }
      for (const profile of ['cpu', 'cuda118', 'cuda126']) {
        $(`#runtime-status-${profile}`).textContent = payload.runtimes[profile] ? '已安装' : '未安装';
      }
      renderDownloadSources(payload.download_sources || {});
      dialog.showModal();
      await resumeRuntimeInstallation();
    } catch (error) { setStatus(error.message, true); }
  });
  $('#close-settings').addEventListener('click', () => dialog.close());
  settingsForm.addEventListener('submit', async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const data = Object.fromEntries(form);
    for (const key of ['execution_timeout_seconds', 'cpu_threads']) data[key] = Number(data[key]);
    const response = await fetch(endpoint('api/settings'), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const payload = await response.json(); $('#settings-message').textContent = response.ok ? '设置已保存。' : (payload.detail || '保存失败。');
  });
  let runtimeInstallTimer = null;
  const runtimeProfiles = ['cpu', 'cuda118', 'cuda126'];
  function updateRuntimeInstallControls(installation) {
    const active = ['installing', 'cancelling'].includes(installation?.state);
    const activeProfile = active ? installation.profile : null;
    for (const profile of runtimeProfiles) {
      $(`#cancel-install-${profile}`).hidden = profile !== activeProfile;
      $(`#install-${profile}`).disabled = active;
    }
  }
  function formatInstallation(installation) {
    const lines = [
      `运行时：${installation.profile || '未知'}`,
      `状态：${installation.state || '未知'}`,
      `阶段：${installation.phase || '等待开始。'}`,
    ];
    if (installation.started_at) lines.push(`开始时间：${new Date(installation.started_at).toLocaleString()}`);
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
    $('#settings-message').textContent = '正在检测运行时…';
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
    if (progress.profiles?.length) lines.push(`运行时：${progress.profiles.join('、')}`);
    if (progress.logs?.length) lines.push('', '最近输出：', ...progress.logs.slice(-10));
    if (progress.error) lines.push('', '错误：', progress.error);
    if (progress.result) lines.push('', '结果：', JSON.stringify(progress.result, null, 2));
    return lines.join('\n');
  }
  let bootstrapTimer = null;
  async function pollBootstrap() {
    const response = await fetch(endpoint('api/admin/bootstrap/status'));
    const payload = await response.json();
    if (!response.ok) { $('#settings-message').textContent = payload.detail || '无法读取初始化进度。'; return; }
    const progress = payload.bootstrap;
    $('#settings-message').textContent = formatBootstrap(progress);
    if (progress.state === 'running') bootstrapTimer = window.setTimeout(pollBootstrap, 1000);
    else {
      bootstrapTimer = null;
      refreshRuntimeAvailability();
    }
  }
  async function openBootstrapDialog() {
    const response = await fetch(endpoint('api/admin/bootstrap/plan'));
    const payload = await response.json();
    if (!response.ok) { $('#settings-message').textContent = payload.detail || '无法检测显卡。'; return; }
    const nvidia = payload.nvidia || {};
    const hasNvidia = Boolean(nvidia.available);
    $('#bootstrap-gpu-choice').hidden = !hasNvidia;
    $('#bootstrap-profile-set').value = 'cpu';
    $('#bootstrap-plan').textContent = hasNvidia
      ? `检测到 NVIDIA 显卡：${(nvidia.gpus || []).join('；')}。请选择要安装的 CUDA 运行时。`
      : `未检测到可用 NVIDIA 显卡或驱动。将只安装 CPU 运行时。${nvidia.reason ? `（${nvidia.reason}）` : ''}`;
    bootstrapDialog.showModal();
  }
  $('#bootstrap-runtime').addEventListener('click', openBootstrapDialog);
  $('#bootstrap-close').addEventListener('click', () => bootstrapDialog.close());
  $('#bootstrap-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const selection = $('#bootstrap-gpu-choice').hidden ? 'cpu' : $('#bootstrap-profile-set').value;
    const profiles = {
      cpu: ['cpu'], cuda118: ['cpu', 'cuda118'], cuda126: ['cpu', 'cuda126'], all: ['cpu', 'cuda118', 'cuda126'],
    }[selection];
    const response = await fetch(endpoint('api/admin/bootstrap'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profiles, model_name: settingsForm.elements.namedItem('active_model').value }),
    });
    const payload = await response.json();
    if (!response.ok) { $('#bootstrap-plan').textContent = payload.detail || '无法启动一键初始化。'; return; }
    bootstrapDialog.close();
    $('#settings-message').textContent = formatBootstrap(payload.bootstrap);
    if (bootstrapTimer) window.clearTimeout(bootstrapTimer);
    pollBootstrap();
  });
  async function showLogs() {
    logsDialog.showModal();
    $('#logs-output').textContent = '正在读取日志…';
    const response = await fetch(endpoint('api/admin/logs'));
    const payload = await response.json();
    $('#logs-output').textContent = response.ok
      ? (payload.lines?.join('\n') || '暂无日志。')
      : (payload.detail || '无法读取日志。');
  }
  $('#open-logs').addEventListener('click', showLogs);
  $('#refresh-logs').addEventListener('click', showLogs);
  $('#logs-close').addEventListener('click', () => logsDialog.close());
  $('#open-runtime-setup').addEventListener('click', () => $('#open-settings').click());
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
  refreshRuntimeAvailability();
})();
