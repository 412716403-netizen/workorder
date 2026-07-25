export interface ImageNaturalSize {
  width: number;
  height: number;
}

/**
 * 读取图片文件的原始像素尺寸；解码失败或环境不支持时返回 null 由调用方降级。
 */
export function readImageNaturalSize(file: File): Promise<ImageNaturalSize | null> {
  if (typeof URL === 'undefined' || typeof Image === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const finish = (size: ImageNaturalSize | null) => {
      URL.revokeObjectURL(url);
      resolve(size);
    };
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      finish(width > 0 && height > 0 ? { width, height } : null);
    };
    img.onerror = () => finish(null);
    img.src = url;
  });
}
