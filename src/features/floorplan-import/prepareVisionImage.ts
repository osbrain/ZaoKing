const MAX_VISION_EDGE_PX = 2560;
const TARGET_IMAGE_BYTES = 8 * 1024 * 1024;

export interface PreparedVisionImage {
  file: File;
  widthPx: number;
  heightPx: number;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('图片压缩失败，请换一张图片重试'));
    }, 'image/jpeg', quality);
  });
}

/** Shrink large screenshots before sending them to vision models while preserving their aspect ratio. */
export async function prepareVisionImage(file: File): Promise<PreparedVisionImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_VISION_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const widthPx = Math.max(1, Math.round(bitmap.width * scale));
    const heightPx = Math.max(1, Math.round(bitmap.height * scale));
    if (scale === 1 && file.size <= TARGET_IMAGE_BYTES) return { file, widthPx, heightPx };

    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法处理这张图片');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, widthPx, heightPx);
    context.drawImage(bitmap, 0, 0, widthPx, heightPx);

    let blob: Blob | null = null;
    for (const quality of [0.92, 0.86, 0.78]) {
      blob = await canvasToJpeg(canvas, quality);
      if (blob.size <= TARGET_IMAGE_BYTES) break;
    }
    if (!blob || blob.size > 10 * 1024 * 1024) {
      throw new Error('图片压缩后仍超过 10 MB，请换一张更小的户型图');
    }

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'floorplan';
    return {
      file: new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }),
      widthPx,
      heightPx,
    };
  } finally {
    bitmap.close();
  }
}
