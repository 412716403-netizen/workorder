/**
 * 开发节点登记 · 文件/图片字段值
 * - 历史：单个 data URL 字符串，或多 URL 的 JSON 字符串数组
 * - 现格式：JSON 数组 `[{url,name},...]`，保留原始文件名；最多 9 个
 */

export const DEV_STAGE_FILE_MAX_COUNT = 9;

export type DevStageFileItem = {
  url: string;
  /** 原始文件名；历史无名字段时为空串 */
  name: string;
};

function sanitizeFileName(name: string): string {
  return name
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '_')
    .slice(0, 200);
}

function extFromDataUrl(url: string): string {
  const m = url.match(/^data:([^;,]+)/i);
  if (!m?.[1]) return 'bin';
  const mime = m[1].toLowerCase();
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
  };
  if (map[mime]) return map[mime]!;
  if (mime.includes('wordprocessingml') || mime === 'application/msword') return 'docx';
  if (mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel') return 'xlsx';
  const sub = mime.split('/')[1] ?? '';
  const simple = sub.replace(/[^a-z0-9]+/gi, '').slice(0, 8);
  return simple || 'bin';
}

function coerceItem(entry: unknown): DevStageFileItem | null {
  if (typeof entry === 'string') {
    const url = entry.trim();
    if (!url.startsWith('data:')) return null;
    return { url, name: '' };
  }
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const o = entry as Record<string, unknown>;
  const url = String(o.url ?? o.dataUrl ?? '').trim();
  if (!url.startsWith('data:')) return null;
  const name = sanitizeFileName(String(o.name ?? o.fileName ?? o.filename ?? ''));
  return { url, name };
}

function coerceList(raw: unknown[]): DevStageFileItem[] {
  const out: DevStageFileItem[] = [];
  for (const entry of raw) {
    const item = coerceItem(entry);
    if (item) out.push(item);
    if (out.length >= DEV_STAGE_FILE_MAX_COUNT) break;
  }
  return out;
}

/** 解析为带文件名的条目列表（兼容裸 data URL / URL 数组 / {url,name} 数组） */
export function parseDevStageFileItems(raw: unknown): DevStageFileItem[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return coerceList(raw);
  if (typeof raw !== 'string') return [];
  const s = raw.trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(s);
      if (Array.isArray(parsed)) return coerceList(parsed);
    } catch {
      /* fall through */
    }
  }
  if (s.startsWith('data:')) return [{ url: s, name: '' }];
  return [];
}

export function parseDevStageFileUrls(raw: unknown): string[] {
  return parseDevStageFileItems(raw).map((i) => i.url);
}

/** 序列化：有文件名时统一存 `[{url,name},...]`；无文件名单文件仍存裸 data URL（兼容旧展示） */
export function serializeDevStageFileItems(items: DevStageFileItem[]): string {
  const list = items
    .filter((i) => typeof i?.url === 'string' && i.url.trim().startsWith('data:'))
    .map((i) => ({
      url: i.url.trim(),
      name: sanitizeFileName(i.name ?? ''),
    }))
    .slice(0, DEV_STAGE_FILE_MAX_COUNT);
  if (list.length === 0) return '';
  const anyName = list.some((i) => i.name);
  if (!anyName && list.length === 1) return list[0]!.url;
  if (!anyName) return JSON.stringify(list.map((i) => i.url));
  return JSON.stringify(list.map((i) => ({ url: i.url, name: i.name })));
}

/** @deprecated 优先用 serializeDevStageFileItems；无文件名时兼容旧调用 */
export function serializeDevStageFileUrls(urls: string[]): string {
  return serializeDevStageFileItems(urls.map((url) => ({ url, name: '' })));
}

export function isDevStageFileValueFilled(raw: unknown): boolean {
  return parseDevStageFileItems(raw).length > 0;
}

export function listDevStageImageUrls(raw: unknown): string[] {
  return parseDevStageFileUrls(raw).filter((u) => u.startsWith('data:image/'));
}

/** 下载用文件名：优先原始名，否则字段标签 + 序号 */
export function resolveDevStageFileDownloadName(
  item: DevStageFileItem,
  fallbackLabel: string,
  index = 0,
): string {
  if (item.name) return item.name;
  const label = (fallbackLabel || '附件').trim() || '附件';
  const ext = extFromDataUrl(item.url);
  return `${label}-${index + 1}.${ext}`;
}
