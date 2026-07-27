import { $ } from '../core/dom.js';

const SUPPORTED_IMAGE_TYPE = /^image\/(png|jpeg|webp)$/;

export function initializeImageController({
  isJobActive,
  onImageChanged,
  setStatus,
}) {
  const imageInput = $('#image-input');
  const dropZone = $('#drop-zone');
  const imagePanel = $('#image-panel');
  const preview = $('#image-preview');
  const cropCanvas = $('#crop-canvas');
  const cropDialog = $('#crop-dialog');
  const state = {
    crop: null,
    cropImage: null,
    file: null,
    isCropped: false,
    originalFile: null,
  };

  function notifyImageChanged() {
    onImageChanged?.();
  }

  function setImage(file, isCropped = false) {
    if (!file || !SUPPORTED_IMAGE_TYPE.test(file.type)) {
      setStatus('请选择 PNG、JPEG 或 WebP 图片。', true);
      return;
    }
    state.isCropped = isCropped;
    if (!isCropped) state.originalFile = file;
    state.file = file;
    preview.src = URL.createObjectURL(file);
    preview.onload = () => URL.revokeObjectURL(preview.src);
    dropZone.hidden = true;
    imagePanel.hidden = false;
    const restoreButton = $('#restore-image');
    if (restoreButton) restoreButton.hidden = !state.isCropped;
    notifyImageChanged();
    $('#image-info').textContent = `${file.name || '粘贴图片'} · ${(file.size / 1024).toFixed(1)} KB${state.isCropped ? ' (已裁剪)' : ''}`;
    setStatus(state.isCropped ? '图片裁剪成功。误裁剪可点击“还原原图”。' : '图片已准备好。');
  }

  function prepareCropCanvas() {
    const sourceImage = state.cropImage || preview;
    const width = sourceImage.naturalWidth || sourceImage.width;
    const height = sourceImage.naturalHeight || sourceImage.height;
    const maxWidth = Math.min(width, 900);
    const ratio = maxWidth / width;
    cropCanvas.width = maxWidth;
    cropCanvas.height = Math.round(height * ratio);
    const context = cropCanvas.getContext('2d');
    state.crop = {
      context,
      dragging: false,
      end: null,
      ratio,
      sourceImage,
      start: null,
    };
    drawCrop();
  }

  function drawCrop() {
    if (!state.crop) return;
    const {
      context,
      start,
      end,
      sourceImage,
    } = state.crop;
    const image = sourceImage || preview;
    context.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
    context.drawImage(image, 0, 0, cropCanvas.width, cropCanvas.height);
    if (!start || !end) return;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(start.x - end.x);
    const height = Math.abs(start.y - end.y);
    context.fillStyle = 'rgba(0, 0, 0, .45)';
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
      height,
    );
    context.strokeStyle = '#1769e0';
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
  }

  function canvasPoint(event) {
    const rect = cropCanvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * cropCanvas.width / rect.width,
      y: (event.clientY - rect.top) * cropCanvas.height / rect.height,
    };
  }

  function openCrop() {
    const cropFile = state.originalFile || state.file;
    if (!cropFile) {
      setStatus('请先选择图片。', true);
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

  $('#select-image').addEventListener('click', () => imageInput.click());
  imageInput.addEventListener('change', () => setImage(imageInput.files[0]));
  dropZone.addEventListener('click', (event) => {
    if (event.target === dropZone) imageInput.click();
  });
  dropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZone.classList.add('dragging');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
  dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZone.classList.remove('dragging');
    setImage(event.dataTransfer.files[0]);
  });
  window.addEventListener('paste', (event) => {
    for (const item of event.clipboardData?.items || []) {
      if (!item.type.startsWith('image/')) continue;
      if (isJobActive()) {
        setStatus('识别任务进行中，已忽略新的剪贴板图片。', true);
        return;
      }
      setImage(item.getAsFile());
      break;
    }
  });

  $('#clear-image').addEventListener('click', () => {
    closeCrop();
    state.file = null;
    state.originalFile = null;
    state.isCropped = false;
    preview.removeAttribute('src');
    imagePanel.hidden = true;
    dropZone.hidden = false;
    imageInput.value = '';
    const restoreButton = $('#restore-image');
    if (restoreButton) restoreButton.hidden = true;
    notifyImageChanged();
    setStatus('请选择图片。');
  });
  $('#restore-image').addEventListener('click', () => {
    if (!state.originalFile) return;
    setImage(state.originalFile, false);
    setStatus('已成功还原为原始图片。');
  });
  $('#crop-open').addEventListener('click', openCrop);
  $('#crop-close').addEventListener('click', closeCrop);
  $('#crop-cancel').addEventListener('click', closeCrop);
  $('#crop-reset').addEventListener('click', prepareCropCanvas);
  cropDialog.addEventListener('close', closeCrop);
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
  cropCanvas.addEventListener('pointerup', finishCropDrag);
  cropCanvas.addEventListener('pointercancel', finishCropDrag);
  $('#crop-apply').addEventListener('click', () => {
    const crop = state.crop;
    if (!crop?.start || !crop.end) {
      setStatus('请在图片上拖动以选择公式区域。', true);
      return;
    }
    const x = Math.min(crop.start.x, crop.end.x) / crop.ratio;
    const y = Math.min(crop.start.y, crop.end.y) / crop.ratio;
    const width = Math.abs(crop.start.x - crop.end.x) / crop.ratio;
    const height = Math.abs(crop.start.y - crop.end.y) / crop.ratio;
    if (width < 8 || height < 8) {
      setStatus('裁剪区域过小。', true);
      return;
    }
    const sourceImage = crop.sourceImage || preview;
    const output = document.createElement('canvas');
    output.width = Math.round(width);
    output.height = Math.round(height);
    output.getContext('2d').drawImage(
      sourceImage,
      x,
      y,
      width,
      height,
      0,
      0,
      output.width,
      output.height,
    );
    output.toBlob((blob) => {
      if (blob) setImage(new File([blob], 'formula-crop.png', { type: 'image/png' }), true);
      closeCrop();
    }, 'image/png');
  });

  return {
    getFile: () => state.file,
    setJobActive(active) {
      $('#clear-image').disabled = active;
      $('#crop-open').disabled = active;
    },
  };
}
