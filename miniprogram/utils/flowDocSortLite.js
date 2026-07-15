/**
 * 流水单据时间排序（对齐 utils/flowDocSort.ts 核心部分）
 */

function parseProductionOpTimestampMs(ts) {
  if (ts == null) return 0;
  if (typeof ts === 'number' && !Number.isNaN(ts)) return ts;
  const d = new Date(ts);
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
}

function recordDocLineTimeMs(r) {
  const ts = r && r.timestamp;
  if (ts != null && String(ts).trim() !== '') {
    const t = parseProductionOpTimestampMs(ts);
    if (t > 0) return t;
  }
  if (typeof r._savedAtMs === 'number' && !Number.isNaN(r._savedAtMs) && r._savedAtMs > 0) {
    return r._savedAtMs;
  }
  return parseProductionOpTimestampMs(r && r.createdAt);
}

function flowRecordsEarliestMs(records) {
  let min = 0;
  (records || []).forEach((r) => {
    const t = recordDocLineTimeMs(r);
    if (t <= 0) return;
    if (min === 0 || t < min) min = t;
  });
  return min;
}

function formatLocalDateTimeZh(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

module.exports = {
  flowRecordsEarliestMs,
  formatLocalDateTimeZh,
  recordDocLineTimeMs,
};
