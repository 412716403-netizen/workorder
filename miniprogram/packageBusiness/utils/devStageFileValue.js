/**
 * 开发节点登记文件字段值：
 * - 兼容裸 data URL / URL 数组 / [{url,name}]
 * - 兼容 Web 写入的文件名头与详情 deferred stub
 */

const DEV_STAGE_FILE_MAX_COUNT = 9;
const FILE_NAMES_HEADER_PREFIX = '/*devStageFiles:';

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
  const name = sanitizeFileName(entry.name || entry.fileName || entry.filename || '');
  if (entry.deferred === true) {
    return { url: '', name, deferred: true };
  }
  const url = String(entry.url || entry.dataUrl || '').trim();
  if (url.indexOf('data:') !== 0) return null;
  return {
    url,
    name,
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

function peelDevStageFileNamesHeader(raw) {
  const s = String(raw || '');
  if (s.indexOf(FILE_NAMES_HEADER_PREFIX) !== 0) return { names: null, body: s };
  const end = s.indexOf('*/');
  if (end < 0) return { names: null, body: s };
  const jsonPart = s.slice(FILE_NAMES_HEADER_PREFIX.length, end);
  try {
    const parsed = JSON.parse(jsonPart);
    if (!Array.isArray(parsed)) return { names: null, body: s };
    return {
      names: parsed
        .slice(0, DEV_STAGE_FILE_MAX_COUNT)
        .map((name) => sanitizeFileName(name)),
      body: s.slice(end + 2),
    };
  } catch (_) {
    return { names: null, body: s };
  }
}

function parseBody(body) {
  const s = String(body || '').trim();
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

function parseDevStageFileItems(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return coerceList(raw);
  if (typeof raw !== 'string') return [];
  const s = String(raw).trim();
  if (!s) return [];
  const { names, body } = peelDevStageFileNamesHeader(s);
  const items = parseBody(body);
  if (items.length > 0) {
    return items.map((item, index) => ({
      ...item,
      name: item.name || (names && names[index]) || '',
    }));
  }
  if (names && names.length > 0) {
    return names.map((name, index) => ({
      url: '',
      name: name || `附件${index + 1}`,
      deferred: true,
    }));
  }
  return [];
}

function parseDevStageFileUrls(raw) {
  return parseDevStageFileItems(raw)
    .filter((i) => String(i.url || '').indexOf('data:') === 0)
    .map((i) => i.url);
}

function hasDevStageFileDeferred(raw) {
  return parseDevStageFileItems(raw).some((item) => item.deferred === true);
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
  const names = list.map((i) => i.name);
  const header = `${FILE_NAMES_HEADER_PREFIX}${JSON.stringify(names)}*/`;
  const anyName = list.some((i) => i.name);
  if (!anyName && list.length === 1) return `${header}${list[0].url}`;
  if (!anyName) return `${header}${JSON.stringify(list.map((i) => i.url))}`;
  return `${header}${JSON.stringify(list.map((i) => ({ name: i.name, url: i.url })))}`;
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
  hasDevStageFileDeferred,
  serializeDevStageFileItems,
  serializeDevStageFileUrls,
  isDevStageFileValueFilled,
  listDevStageImageUrls,
};
