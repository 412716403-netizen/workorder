/**
 * Phase 3.H：产品主图缩略图生成。
 * - data:image/...;base64,... → sharp 缩到最长边 256px 的 JPEG data URL
 * - http(s) 外链 → 直接复用链接（不做下载重编码）
 * - 空/解码失败 → null
 *
 * 抠图透明 PNG：flatten 白底。
 * 历史上被压成「黑底 JPEG」：可选边缘 flood-fill（仅缩略图 / 回填脚本启用，避免保存大图时卡死）。
 */
import sharp from 'sharp';

/** 列表缩略图最长边；256 兼顾清晰度与体积（相对 512 约 1/4） */
const THUMB_MAX_EDGE = 256;
const THUMB_JPEG_QUALITY = 75;
/** 原图归一化最长边（与前端 compressImageFile 对齐） */
const FULL_MAX_EDGE = 1600;
const FULL_JPEG_QUALITY = 85;
/** 近黑判定阈值（0–255）；角点采样用于识别「黑底抠图」 */
const NEAR_BLACK = 40;

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

function isNearBlack(r: number, g: number, b: number, threshold = NEAR_BLACK): boolean {
  return r <= threshold && g <= threshold && b <= threshold;
}

/**
 * 从四边种子 flood-fill，把连通的近黑像素换成白。
 * 仅当 ≥3 个角点近黑时启用，避免误伤普通暗色摄影。
 */
function floodReplaceNearBlackBackdrop(
  data: Buffer,
  width: number,
  height: number,
  threshold = NEAR_BLACK,
): boolean {
  if (width < 2 || height < 2) return false;

  const corners: Array<[number, number]> = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  let blackCorners = 0;
  for (const [x, y] of corners) {
    const o = (y * width + x) * 4;
    if (isNearBlack(data[o]!, data[o + 1]!, data[o + 2]!, threshold)) blackCorners += 1;
  }
  if (blackCorners < 3) return false;

  const visited = new Uint8Array(width * height);
  const stack: number[] = [];

  const tryPush = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (visited[i]) return;
    const o = i * 4;
    if (!isNearBlack(data[o]!, data[o + 1]!, data[o + 2]!, threshold)) return;
    visited[i] = 1;
    stack.push(i);
  };

  for (let x = 0; x < width; x += 1) {
    tryPush(x, 0);
    tryPush(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    tryPush(0, y);
    tryPush(width - 1, y);
  }

  while (stack.length > 0) {
    const i = stack.pop()!;
    const o = i * 4;
    data[o] = 255;
    data[o + 1] = 255;
    data[o + 2] = 255;
    data[o + 3] = 255;
    const x = i % width;
    const y = (i / width) | 0;
    tryPush(x + 1, y);
    tryPush(x - 1, y);
    tryPush(x, y + 1);
    tryPush(x, y - 1);
  }
  return true;
}

export type EncodeProductImageOptions = {
  maxEdge?: number;
  quality?: number;
  /**
   * 是否对「黑底抠图 JPEG」做边缘 flood-fill。
   * 大图极慢，保存接口禁止开启；仅缩略图 / 回填脚本使用。
   */
  replaceBlackBackdrop?: boolean;
};

/**
 * 将任意图片 Buffer 归一为白底 JPEG Buffer。
 * - 默认：sharp flatten 透明→白（快，适合保存路径）
 * - replaceBlackBackdrop：额外 flood-fill 近黑背景（慢，适合 ≤256 缩略图或离线回填）
 */
export async function encodeProductImageOnWhite(
  buf: Buffer,
  opts?: EncodeProductImageOptions,
): Promise<Buffer | null> {
  if (!buf || buf.length === 0) return null;
  const maxEdge = opts?.maxEdge ?? FULL_MAX_EDGE;
  const quality = opts?.quality ?? FULL_JPEG_QUALITY;
  const replaceBlackBackdrop = Boolean(opts?.replaceBlackBackdrop);

  try {
    if (!replaceBlackBackdrop) {
      return sharp(buf)
        .rotate()
        .resize({
          width: maxEdge,
          height: maxEdge,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
    }

    const resized = await sharp(buf)
      .rotate()
      .resize({
        width: maxEdge,
        height: maxEdge,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = resized;
    const width = info.width;
    const height = info.height;
    const pixels = Buffer.from(data);

    for (let i = 0; i < pixels.length; i += 4) {
      const a = pixels[i + 3]!;
      if (a < 255) {
        const t = a / 255;
        pixels[i] = Math.round(255 * (1 - t) + pixels[i]! * t);
        pixels[i + 1] = Math.round(255 * (1 - t) + pixels[i + 1]! * t);
        pixels[i + 2] = Math.round(255 * (1 - t) + pixels[i + 2]! * t);
        pixels[i + 3] = 255;
      }
    }

    floodReplaceNearBlackBackdrop(pixels, width, height);

    return sharp(pixels, { raw: { width, height, channels: 4 } })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * 归一化产品主图 data URL（http 外链原样返回）。
 * 仅 flatten 白底，不做大图 flood-fill（供离线回填；保存路径默认不重写原图）。
 */
export async function normalizeProductImageDataUrl(
  imageUrl: string | null | undefined,
  opts?: { replaceBlackBackdrop?: boolean },
): Promise<string | null> {
  if (imageUrl == null) return null;
  const raw = String(imageUrl).trim();
  if (!raw) return null;
  if (isHttpUrl(raw)) return raw;
  if (!raw.startsWith('data:')) return raw;

  const buf = bufferFromDataUrl(raw);
  if (!buf) return null;
  const out = await encodeProductImageOnWhite(buf, {
    maxEdge: FULL_MAX_EDGE,
    quality: FULL_JPEG_QUALITY,
    replaceBlackBackdrop: Boolean(opts?.replaceBlackBackdrop),
  });
  if (!out) return raw;
  return `data:image/jpeg;base64,${out.toString('base64')}`;
}

/**
 * 根据 imageUrl 生成列表用缩略图。
 * 请求热路径只用 flatten（快）；黑底 flood-fill 留给回填脚本。
 * @returns data URL / http(s) URL / null
 */
export async function buildImageThumb(
  imageUrl: string | null | undefined,
  opts?: { replaceBlackBackdrop?: boolean },
): Promise<string | null> {
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

  const out = await encodeProductImageOnWhite(buf, {
    maxEdge: THUMB_MAX_EDGE,
    quality: THUMB_JPEG_QUALITY,
    replaceBlackBackdrop: Boolean(opts?.replaceBlackBackdrop),
  });
  if (!out) return null;
  return `data:image/jpeg;base64,${out.toString('base64')}`;
}
