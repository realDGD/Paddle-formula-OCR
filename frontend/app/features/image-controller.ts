import { $ } from '../core/dom.ts';
import type { StatusSetter } from '../types.ts';

const SUPPORTED_IMAGE_TYPE = /^image\/(png|jpeg|webp)$/;

type Point = { x: number; y: number };
type Crop = {
  context: CanvasRenderingContext2D;
  dragging: boolean;
  end: Point | null;
  ratio: number;
  sourceImage: CanvasImageSource;
  start: Point | null;
};

export function initializeImageController({
  idPrefix = '',
  isJobActive,
  onImageChanged,
  setStatus,
}: {
  idPrefix?: string;
  isJobActive: () => boolean;
  onImageChanged?: () => void;
  setStatus: StatusSetter;
}) {
  const element = <T extends Element = any>(id: string): T => $<T>(`#${idPrefix}${id}`);
  const imageInput = element<HTMLInputElement>('image-input');
  const dropZone = element('drop-zone');
  const imagePanel = element('image-panel');
  const preview = element<HTMLImageElement>('image-preview');
  const cropCanvas = element<HTMLCanvasElement>('crop-canvas');
  const cropDialog = element<HTMLDialogElement>('crop-dialog');
  const page = element<HTMLElement>('ocr-page');
  const subject = idPrefix ? '表格' : '公式';
  const state = {
    crop: null as Crop | null,
    cropImage: null as HTMLImageElement | null,
    file: null as File | null,
    isCropped: false,
    originalFile: null as File | null,
  };

  function notifyImageChanged() {
    onImageChanged?.();
  }

  function setImage(file: File | null | undefined, isCropped = false) {
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
    const restoreButton = element('restore-image');
    if (restoreButton) restoreButton.hidden = !state.isCropped;
    notifyImageChanged();
    element('image-info').textContent = `${file.name || '粘贴图片'} · ${(file.size / 1024).toFixed(1)} KB${state.isCropped ? ' (已裁剪)' : ''}`;
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
    const context = cropCanvas.getContext('2d')!;
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

  function canvasPoint(event: PointerEvent) {
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

  function finishCropDrag(event: PointerEvent) {
    if (!state.crop?.dragging) return;
    state.crop.end = canvasPoint(event);
    state.crop.dragging = false;
    if (cropCanvas.hasPointerCapture(event.pointerId)) {
      cropCanvas.releasePointerCapture(event.pointerId);
    }
    drawCrop();
  }

  element('select-image').addEventListener('click', () => imageInput.click());
  imageInput.addEventListener('change', () => setImage(imageInput.files?.[0]));
  dropZone.addEventListener('click', (event: MouseEvent) => {
    if (event.target === dropZone) imageInput.click();
  });
  dropZone.addEventListener('keydown', (event: KeyboardEvent) => {
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    imageInput.click();
  });
  dropZone.addEventListener('dragover', (event: DragEvent) => {
    event.preventDefault();
    dropZone.classList.add('dragging');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
  dropZone.addEventListener('drop', (event: DragEvent) => {
    event.preventDefault();
    dropZone.classList.remove('dragging');
    setImage(event.dataTransfer?.files[0]);
  });
  window.addEventListener('paste', (event: ClipboardEvent) => {
    if (page.hidden) return;
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

  element('clear-image').addEventListener('click', () => {
    closeCrop();
    state.file = null;
    state.originalFile = null;
    state.isCropped = false;
    preview.removeAttribute('src');
    imagePanel.hidden = true;
    dropZone.hidden = false;
    imageInput.value = '';
    const restoreButton = element('restore-image');
    if (restoreButton) restoreButton.hidden = true;
    notifyImageChanged();
    setStatus('请选择图片。');
  });
  element('restore-image').addEventListener('click', () => {
    if (!state.originalFile) return;
    setImage(state.originalFile, false);
    setStatus('已成功还原为原始图片。');
  });
  element('crop-open').addEventListener('click', openCrop);
  element('crop-close').addEventListener('click', closeCrop);
  element('crop-cancel').addEventListener('click', closeCrop);
  element('crop-reset').addEventListener('click', prepareCropCanvas);
  cropDialog.addEventListener('close', closeCrop);
  cropCanvas.addEventListener('pointerdown', (event: PointerEvent) => {
    if (event.button !== 0 || !state.crop) return;
    cropCanvas.setPointerCapture(event.pointerId);
    const point = canvasPoint(event);
    state.crop.start = point;
    state.crop.end = point;
    state.crop.dragging = true;
    drawCrop();
  });
  cropCanvas.addEventListener('pointermove', (event: PointerEvent) => {
    if (!state.crop?.dragging) return;
    state.crop.end = canvasPoint(event);
    drawCrop();
  });
  cropCanvas.addEventListener('pointerup', finishCropDrag);
  cropCanvas.addEventListener('pointercancel', finishCropDrag);
  element('crop-apply').addEventListener('click', () => {
    const crop = state.crop;
    if (!crop?.start || !crop.end) {
      setStatus(`请在图片上拖动以选择${subject}区域。`, true);
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
    output.getContext('2d')!.drawImage(
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
      if (blob) setImage(new File([blob], `${idPrefix || 'formula-'}crop.png`, { type: 'image/png' }), true);
      closeCrop();
    }, 'image/png');
  });

  return {
    getFile: () => state.file,
    setJobActive(active: boolean) {
      element<HTMLButtonElement>('clear-image').disabled = active;
      element<HTMLButtonElement>('crop-open').disabled = active;
    },
  };
}
