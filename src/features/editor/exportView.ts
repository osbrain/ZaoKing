import type { SceneDocument } from '@/core/types';
import { serializeDesignPackage } from '@/core/designPackage';

export type ImageFormat = 'image/png' | 'image/jpeg';

function safeFileName(name: string) {
  return name.trim().replace(/[\\/:*?"<>|\s]+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'zaoking-design';
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = fileName;
  window.document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function requiredElement<T extends Element>(selector: string, label: string) {
  const element = window.document.querySelector<T>(selector);
  if (!element) throw new Error(`${label}当前不可用，请切换到对应视图后重试`);
  return element;
}

export function exportProjectFile(document: SceneDocument) {
  download(
    new Blob([serializeDesignPackage(document)], { type: 'application/json;charset=utf-8' }),
    `${safeFileName(document.meta.name)}.zaoking.json`,
  );
}

function clonePlanSvg() {
  const source = requiredElement<SVGSVGElement>('[data-editor-export="plan"]', '2D 户型图');
  const clone = source.cloneNode(true) as SVGSVGElement;
  const bounds = source.getBoundingClientRect();
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(Math.max(1, Math.round(bounds.width))));
  clone.setAttribute('height', String(Math.max(1, Math.round(bounds.height))));
  clone.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, PingFang SC, sans-serif');
  clone.querySelectorAll('[data-export-ignore]').forEach((element) => element.remove());
  const viewBox = source.viewBox.baseVal;
  const background = window.document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  background.setAttribute('x', String(viewBox.x));
  background.setAttribute('y', String(viewBox.y));
  background.setAttribute('width', String(viewBox.width));
  background.setAttribute('height', String(viewBox.height));
  background.setAttribute('fill', '#f7f4ee');
  clone.insertBefore(background, clone.firstChild);
  return { clone, width: Math.max(1, Math.round(bounds.width)), height: Math.max(1, Math.round(bounds.height)) };
}

export function exportPlanSvg(document: SceneDocument) {
  const { clone } = clonePlanSvg();
  const source = new XMLSerializer().serializeToString(clone);
  download(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }), `${safeFileName(document.meta.name)}.svg`);
}

function blobFromCanvas(canvas: HTMLCanvasElement, format: ImageFormat) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('图片生成失败，请重试'));
    }, format, format === 'image/jpeg' ? 0.94 : undefined);
  });
}

async function exportPlanImage(document: SceneDocument, format: ImageFormat) {
  const { clone, width, height } = clonePlanSvg();
  const svgBlob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' });
  const sourceUrl = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    image.src = sourceUrl;
    await image.decode();
    const scale = Math.min(3, Math.max(1, window.devicePixelRatio * 1.5));
    const canvas = window.document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法创建图片画布');
    context.fillStyle = '#f7f4ee';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const extension = format === 'image/jpeg' ? 'jpg' : 'png';
    download(await blobFromCanvas(canvas, format), `${safeFileName(document.meta.name)}-2d.${extension}`);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function exportSceneImage(document: SceneDocument, format: ImageFormat) {
  const scene = requiredElement<HTMLDivElement>('[data-editor-export="scene3d"]', '3D 场景');
  const canvas = scene.querySelector('canvas');
  if (!canvas) throw new Error('3D 场景尚未准备完成，请稍后重试');
  const extension = format === 'image/jpeg' ? 'jpg' : 'png';
  download(await blobFromCanvas(canvas, format), `${safeFileName(document.meta.name)}-3d.${extension}`);
}

export async function exportCurrentViewImage(document: SceneDocument, viewMode: '2d' | '3d', format: ImageFormat) {
  if (viewMode === '2d') await exportPlanImage(document, format);
  else await exportSceneImage(document, format);
}
