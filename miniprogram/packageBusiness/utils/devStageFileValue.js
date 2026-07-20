/** 开发节点登记文件字段值：单图 data URL 或多图 JSON 数组 */

const DEV_STAGE_FILE_MAX_COUNT = 9;

function parseDevStageFileUrls(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw
      .filter((u) => typeof u === 'string' && String(u).trim() !== '')
      .map((u) => String(u).trim());
  }
  if (typeof raw !== 'string') return [];
  const s = raw.trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((u) => typeof u === 'string' && String(u).trim() !== '')
          .map((u) => String(u).trim());
      }
    } catch (_) {
      /* ignore */
    }
  }
  if (s.indexOf('data:') === 0) return [s];
  return [];
}

function serializeDevStageFileUrls(urls) {
  const list = (urls || [])
    .filter((u) => typeof u === 'string' && String(u).trim() !== '')
    .map((u) => String(u).trim())
    .slice(0, DEV_STAGE_FILE_MAX_COUNT);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  return JSON.stringify(list);
}

function isDevStageFileValueFilled(raw) {
  return parseDevStageFileUrls(raw).length > 0;
}

function listDevStageImageUrls(raw) {
  return parseDevStageFileUrls(raw).filter((u) => String(u).indexOf('data:image/') === 0);
}

module.exports = {
  DEV_STAGE_FILE_MAX_COUNT,
  parseDevStageFileUrls,
  serializeDevStageFileUrls,
  isDevStageFileValueFilled,
  listDevStageImageUrls,
};
