/**
 * 产品主图上传前压缩：最长边 1600px、JPEG 质量 0.85。
 * 非图片或压缩失败时回退原 File，由调用方继续走 FileReader。
 *
 * 注意：canvas 导出 JPEG 时透明像素默认变黑；须先铺白底再 drawImage，
 * 否则抠图 PNG 会变成「黑底图」写入 imageUrl。
 */

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image load failed'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/**
 * @returns 压缩后的 File（通常为 image/jpeg）；失败或无需压缩时返回原 file
 */
export async function compressImageFile(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  // GIF 动图压成静态 JPEG 会丢帧，跳过
  if (file.type === 'image/gif') return file;

  try {
    const img = await loadImageFromFile(file);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return file;

    const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));

    // 已足够小且本就是 JPEG：不必再编码
    if (scale >= 1 && file.type === 'image/jpeg' && file.size <= 400_000) {
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // 白底再绘制：保留抠图透明区为白，避免 JPEG 把透明变成黑
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tw, th);
    ctx.drawImage(img, 0, 0, tw, th);

    const blob = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY);
    if (!blob || blob.size <= 0) return file;
    // 压缩后反而更大则保留原文件
    if (blob.size >= file.size && scale >= 1) return file;

    const base = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}

/** File → data URL（供压缩后写入 imageUrl） */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error ?? new Error('readAsDataURL failed'));
    r.readAsDataURL(file);
  });
}
