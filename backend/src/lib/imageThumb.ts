/**
 * Phase 3.H：产品主图缩略图生成。
 * - data:image/...;base64,... → sharp 缩到最长边 512px 的 JPEG data URL
 * - http(s) 外链 → 直接复用链接（不做下载重编码）
 * - 空/解码失败 → null
 */
import sharp from 'sharp';

const THUMB_MAX_EDGE = 512;
const THUMB_JPEG_QUALITY = 80;

const DATA_URL_RE = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i;

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

/** 从 data URL 取出 Buffer；非 base64 或非法时返回 null */
function bufferFromDataUrl(dataUrl: string): Buffer | null {
  const m = DATA_URL_RE.exec(dataUrl.trim());
  if (!m) return null;
  const isBase64 = Boolean(m[2] && m[2].toLowerCase().includes('base64'));
  const payload = m[3] ?? '';
  if (!payload) return null;
  try {
    if (isBase64) return Buffer.from(payload, 'base64');
    return Buffer.from(decodeURIComponent(payload), 'utf8');
  } catch {
    return null;
  }
}

/**
 * 根据 imageUrl 生成列表用缩略图。
 * @returns data URL / http(s) URL / null
 */
export async function buildImageThumb(imageUrl: string | null | undefined): Promise<string | null> {
  if (imageUrl == null) return null;
  const raw = String(imageUrl).trim();
  if (!raw) return null;

  if (isHttpUrl(raw)) return raw;

  if (!raw.startsWith('data:')) {
    // 其它形态（相对路径等）原样保留，避免列表无图
    return raw;
  }

  const buf = bufferFromDataUrl(raw);
  if (!buf || buf.length === 0) return null;

  try {
    const out = await sharp(buf)
      .rotate()
      .resize({
        width: THUMB_MAX_EDGE,
        height: THUMB_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: THUMB_JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${out.toString('base64')}`;
  } catch {
    return null;
  }
}
