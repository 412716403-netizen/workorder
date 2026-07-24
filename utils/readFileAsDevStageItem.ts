/**
 * 将本地 File 转为节点登记文件条目；图片先走 compressImageFile（对齐产品主图）。
 */
import { compressImageFile } from './compressImageFile';
import type { DevStageFileItem } from './devStageFileValue';

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

export async function readFileAsDevStageItem(file: File): Promise<DevStageFileItem | null> {
  const compressed = await compressImageFile(file);
  const url = await readAsDataUrl(compressed);
  if (!url.startsWith('data:')) return null;
  return { url, name: file.name || '' };
}
