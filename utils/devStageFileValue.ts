/**
 * 开发节点登记 · 文件/图片字段值
 * - 历史：单个 data URL 字符串
 * - 多图：JSON 数组字符串 `["data:image/...","data:image/..."]`
 */

export const DEV_STAGE_FILE_MAX_COUNT = 9;

export function parseDevStageFileUrls(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw
      .filter((u): u is string => typeof u === 'string' && u.trim() !== '')
      .map((u) => u.trim());
  }
  if (typeof raw !== 'string') return [];
  const s = raw.trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(s);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((u): u is string => typeof u === 'string' && u.trim() !== '')
          .map((u) => u.trim());
      }
    } catch {
      /* fall through */
    }
  }
  if (s.startsWith('data:')) return [s];
  return [];
}

/** 单张仍存裸 data URL（兼容旧展示）；多张存 JSON 数组 */
export function serializeDevStageFileUrls(urls: string[]): string {
  const list = urls
    .filter((u) => typeof u === 'string' && u.trim() !== '')
    .map((u) => u.trim())
    .slice(0, DEV_STAGE_FILE_MAX_COUNT);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  return JSON.stringify(list);
}

export function isDevStageFileValueFilled(raw: unknown): boolean {
  return parseDevStageFileUrls(raw).length > 0;
}

export function listDevStageImageUrls(raw: unknown): string[] {
  return parseDevStageFileUrls(raw).filter((u) => u.startsWith('data:image/'));
}
