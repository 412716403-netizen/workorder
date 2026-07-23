/** 开发节点登记文件字段值：兼容裸 data URL / URL 数组 / [{url,name}]，保留原文件名 */

const DEV_STAGE_FILE_MAX_COUNT = 9;

function sanitizeFileName(name) {
  return String(name || '')
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '_')
    .slice(0, 200);
}

function coerceItem(entry) {
  if (typeof entry === 'string') {
    const url = String(entry).trim();
    if (url.indexOf('data:') !== 0) return null;
    return { url, name: '' };
  }
  if (!entry || typeof entry !== 'object') return null;
  const url = String(entry.url || entry.dataUrl || '').trim();
  if (url.indexOf('data:') !== 0) return null;
  return {
    url,
    name: sanitizeFileName(entry.name || entry.fileName || entry.filename || ''),
  };
}

function coerceList(raw) {
  const out = [];
  for (let i = 0; i < (raw || []).length; i += 1) {
    const item = coerceItem(raw[i]);
    if (item) out.push(item);
    if (out.length >= DEV_STAGE_FILE_MAX_COUNT) break;
  }
  return out;
}

function parseDevStageFileItems(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return coerceList(raw);
  if (typeof raw !== 'string') return [];
  const s = String(raw).trim();
  if (!s) return [];
  if (s.indexOf('[') === 0) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return coerceList(parsed);
    } catch (_) {
      /* ignore */
    }
  }
  if (s.indexOf('data:') === 0) return [{ url: s, name: '' }];
  return [];
}

function parseDevStageFileUrls(raw) {
  return parseDevStageFileItems(raw).map((i) => i.url);
}

function serializeDevStageFileItems(items) {
  const list = (items || [])
    .filter((i) => i && typeof i.url === 'string' && String(i.url).trim().indexOf('data:') === 0)
    .map((i) => ({
      url: String(i.url).trim(),
      name: sanitizeFileName(i.name || ''),
    }))
    .slice(0, DEV_STAGE_FILE_MAX_COUNT);
  if (!list.length) return '';
  const anyName = list.some((i) => i.name);
  if (!anyName && list.length === 1) return list[0].url;
  if (!anyName) return JSON.stringify(list.map((i) => i.url));
  return JSON.stringify(list.map((i) => ({ url: i.url, name: i.name })));
}

function serializeDevStageFileUrls(urls) {
  return serializeDevStageFileItems((urls || []).map((url) => ({ url, name: '' })));
}

function isDevStageFileValueFilled(raw) {
  return parseDevStageFileItems(raw).length > 0;
}

function listDevStageImageUrls(raw) {
  return parseDevStageFileUrls(raw).filter((u) => String(u).indexOf('data:image/') === 0);
}

module.exports = {
  DEV_STAGE_FILE_MAX_COUNT,
  parseDevStageFileItems,
  parseDevStageFileUrls,
  serializeDevStageFileItems,
  serializeDevStageFileUrls,
  isDevStageFileValueFilled,
  listDevStageImageUrls,
};
