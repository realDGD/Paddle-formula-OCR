import { $, endpoint } from '../core/dom.js';

export function initializeHandwritingController({ insertVisualLatex }) {
  const canvas = $('#handwriting-canvas');
  const context = canvas.getContext('2d');
  const state = {
    activeStroke: null,
    dataset: null,
    datasetPromise: null,
    recognitionGeneration: 0,
    strokes: [],
  };

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * canvas.width / rect.width,
      y: (event.clientY - rect.top) * canvas.height / rect.height,
    };
  }

  function draw() {
    context.clearRect(0, 0, canvas.width, canvas.height);
    const dark = document.documentElement.dataset.fnosTheme === 'dark'
      || (!document.documentElement.dataset.fnosTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    context.strokeStyle = dark ? '#d8e6fb' : '#173860';
    context.lineWidth = 5;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    for (const stroke of state.strokes) {
      if (!stroke.length) continue;
      context.beginPath();
      context.moveTo(stroke[0].x, stroke[0].y);
      for (const point of stroke.slice(1)) context.lineTo(point.x, point.y);
      context.stroke();
    }
  }

  function candidateMessage(text) {
    return Object.assign(document.createElement('p'), {
      className: 'subtle',
      textContent: text,
    });
  }

  function clear() {
    state.recognitionGeneration += 1;
    state.strokes = [];
    state.activeStroke = null;
    draw();
    $('#handwriting-candidates').replaceChildren(
      candidateMessage('请画一个数学符号，再获取候选。'),
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
          const response = await fetch(endpoint('vendor/detexify/detexify-dataset.json'));
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return await response.json();
        } catch (error) {
          console.warn('Failed to load Detexify dataset:', error);
          return [];
        }
      })();
    }
    state.dataset = await state.datasetPromise;
    return state.dataset;
  }

  async function renderSymbolGlyph(item, span) {
    const command = item?.cmd || '';
    span.textContent = `\\(${command}\\)`;
    try {
      if (!window.MathJax?.typesetPromise) throw new Error('MathJax 尚未加载');
      await window.MathJax.typesetPromise([span]);
      if (span.querySelector('.mjx-merror, [data-mjx-error], mjx-container[data-mjx-error], .merror')) {
        throw new Error('MathJax 未能渲染此符号');
      }
    } catch (error) {
      span.textContent = command;
      span.title = error.message || String(error);
      span.classList.add('candidate-glyph-error');
    }
  }

  function classify(strokes, dataset) {
    if (!hasStrokes(strokes) || !dataset.length || !window.DetexifyClassifier) return [];
    const rawResults = window.DetexifyClassifier.classify(strokes, dataset, 24);
    const seen = new Set();
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
    const container = $('#handwriting-candidates');
    const strokes = state.strokes.map((stroke) => stroke.map((point) => ({ ...point })));
    if (!hasStrokes(strokes)) {
      container.replaceChildren(
        candidateMessage('在上方画布绘制符号，松笔后自动产生匹配候选。'),
      );
      return;
    }

    const dataset = await loadDataset();
    if (generation !== state.recognitionGeneration) return;
    const candidates = classify(strokes, dataset);
    if (!candidates.length) {
      container.replaceChildren(
        candidateMessage('未找到匹配候选符号，请尝试重新书写。'),
      );
      return;
    }

    const note = document.createElement('p');
    note.className = 'subtle';
    const uniqueSymbols = new Set(dataset.map((item) => item.cmd || item.id)).size;
    note.textContent = `原生内置符号匹配（${uniqueSymbols} 个符号命令，前 ${candidates.length} 个候选）：`;
    const list = document.createElement('div');
    list.className = 'candidate-list';

    for (const item of candidates) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'candidate-button';
      const commandContainer = document.createElement('div');
      commandContainer.className = 'candidate-command';
      const commandCode = document.createElement('code');
      commandCode.textContent = item.cmd;
      commandContainer.append(commandCode);
      if (item.pkg) {
        const packageInfo = document.createElement('small');
        packageInfo.className = 'subtle';
        packageInfo.textContent = `(${item.pkg})`;
        commandContainer.append(packageInfo);
      }
      const glyph = document.createElement('span');
      glyph.className = 'candidate-glyph';
      button.append(commandContainer, glyph);
      button.title = `点击插入命令 ${item.cmd}`;
      button.addEventListener('click', () => insertVisualLatex(item.cmd));
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

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    state.activeStroke = [pointFromEvent(event)];
    state.strokes.push(state.activeStroke);
    draw();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!state.activeStroke) return;
    state.activeStroke.push(pointFromEvent(event));
    draw();
  });
  canvas.addEventListener('pointerup', finishStroke);
  canvas.addEventListener('pointercancel', finishStroke);
  $('#handwriting-clear').addEventListener('click', () => {
    clear();
    $('#handwriting-candidates').replaceChildren(
      candidateMessage('在上方画布绘制符号，松笔后自动产生匹配候选。'),
    );
  });
  $('#handwriting-undo').addEventListener('click', () => {
    state.strokes.pop();
    draw();
    recognize();
  });

  draw();
}
