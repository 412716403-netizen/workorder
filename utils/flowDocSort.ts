import { formatLocalDateTimeZh, parsePsiCreatedAtForSortMs, parseProductionOpTimestampMs } from './localDateTime';

/**
 * 单条明细上的时间：优先 **timestamp**（保存时的真实时刻 ISO），再 _savedAtMs，最后 **createdAt**（多为「添加日期」日历日，单独解析避免 UTC 午夜变东八区 8 点）。
 */
export function recordDocLineTimeMs(
  r: { timestamp?: string | null; createdAt?: string | Date | null; _savedAtMs?: number | null },
): number {
  const ts = r.timestamp;
  if (ts != null && String(ts).trim() !== '') {
    const t = parseProductionOpTimestampMs(ts as string | Date);
    if (t > 0) return t;
  }
  if (typeof r._savedAtMs === 'number' && !Number.isNaN(r._savedAtMs) && r._savedAtMs > 0) return r._savedAtMs;
  return parsePsiCreatedAtForSortMs(r.createdAt);
}

/**
 * 同一单据下多条明细时，取组内最早的一条时间（ms），作为「开单/制单时间」，用于列表按制单时间倒序；
 * 编辑后续行通常不改变该值（若各行的 createdAt 一致则与单据时间一致）。
 */
export function flowRecordsEarliestMs(
  records: { timestamp?: string | null; createdAt?: string | Date | null; _savedAtMs?: number | null }[],
): number {
  let m = 0;
  for (const r of records) {
    const t = recordDocLineTimeMs(r);
    if (t <= 0) continue;
    if (m === 0 || t < m) m = t;
  }
  return m;
}

/** 进销存四类单据列表卡片：统一用组内最早可解析时间做展示，避免取首行 timestamp 为不可解析的本地化字符串 */
export function formatPsiDocListTime(docLines: any[]): string {
  const ms = flowRecordsEarliestMs(docLines);
  if (ms > 0) return formatLocalDateTimeZh(new Date(ms));
  const t0 = docLines[0]?.timestamp;
  if (t0 != null && String(t0).trim() !== '') return String(t0);
  return '—';
}
