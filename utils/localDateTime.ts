/**
 * 浏览器本地时区的日历日期与时间展示（避免 toISOString().split('T')[0] 使用 UTC 导致东八区等日期错一天）
 */

/** 纯 YYYY-MM-DD 字符串直接返回，避免被解析成 UTC 午夜 */
export const YMD_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 表单「添加日期」仅 YYYY-MM-DD 时，转为该日 **本地 0 点** 的 UTC ISO 再提交，
 * 避免裸字符串被 `new Date('YYYY-MM-DD')` 当成 UTC 午夜 → 东八区列表显示成 8:00。
 */
export function localCalendarYmdStartToIso(ymd: string): string {
  const t = (ymd || '').trim();
  if (YMD_ONLY.test(t)) {
    const [y, mo, day] = t.split('-').map(Number);
    return new Date(y, mo - 1, day, 0, 0, 0, 0).toISOString();
  }
  const d = new Date(ymd);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/**
 * 解析进销存「添加日期」字段用于排序/展示：纯 YYYY-MM-DD 按本地 0 点；
 * 若已是 ISO 且为 **UTC 当天 0:00:00.000**（历史误存），按 UTC 日历日转本地 0 点，避免统一显示成 8 点。
 */
export function parsePsiCreatedAtForSortMs(raw: string | Date | null | undefined): number {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (YMD_ONLY.test(s)) {
      const [y, mo, d] = s.split('-').map(Number);
      return new Date(y, mo - 1, d, 0, 0, 0, 0).getTime();
    }
    if (s.includes('T')) {
      const d = new Date(s);
      const ms = d.getTime();
      if (Number.isNaN(ms) || ms <= 0) return 0;
      if (
        d.getUTCHours() === 0 &&
        d.getUTCMinutes() === 0 &&
        d.getUTCSeconds() === 0 &&
        d.getUTCMilliseconds() === 0
      ) {
        return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0).getTime();
      }
      return ms;
    }
  }
  const d = raw instanceof Date ? raw : new Date(raw as string);
  const ms = d.getTime();
  return Number.isNaN(ms) || ms <= 0 ? 0 : ms;
}

/**
 * 解析生产操作记录 `timestamp`：支持 ISO、纯 YYYY-MM-DD、以及浏览器 `toLocaleString()` 常见中文格式
 * （如 `2026/4/11 下午3:45:30`），避免 `new Date('…下午…')` 得到 Invalid Date 导致排序/筛选错乱。
 */
export function parseProductionOpTimestampMs(raw: string | Date | null | undefined): number {
  if (raw == null || raw === '') return 0;
  if (raw instanceof Date) {
    const ms = raw.getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }
  const s = String(raw).trim();
  if (!s) return 0;
  if (YMD_ONLY.test(s)) {
    const [y, mo, d] = s.split('-').map(Number);
    return new Date(y, mo - 1, d, 0, 0, 0, 0).getTime();
  }
  if (s.includes('T')) {
    const d = new Date(s);
    const ms = d.getTime();
    if (!Number.isNaN(ms) && ms > 0) return ms;
  }
  let d = new Date(s);
  let ms = d.getTime();
  if (!Number.isNaN(ms) && ms > 0) return ms;

  const mDate = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!mDate) return 0;
  const y = parseInt(mDate[1], 10);
  const mo = parseInt(mDate[2], 10) - 1;
  const day = parseInt(mDate[3], 10);
  let hour = 0;
  let min = 0;
  let sec = 0;
  const rest = s.slice(mDate[0].length).trim();
  const pm = rest.match(/下午\s*(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  const am = rest.match(/上午\s*(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  const plain = rest.match(/^[,，\s]*(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (pm) {
    hour = parseInt(pm[1], 10);
    min = parseInt(pm[2], 10);
    sec = pm[3] ? parseInt(pm[3], 10) : 0;
    if (hour >= 1 && hour <= 11) hour += 12;
  } else if (am) {
    hour = parseInt(am[1], 10);
    min = parseInt(am[2], 10);
    sec = am[3] ? parseInt(am[3], 10) : 0;
    if (hour === 12) hour = 0;
  } else if (plain) {
    hour = parseInt(plain[1], 10);
    min = parseInt(plain[2], 10);
    sec = plain[3] ? parseInt(plain[3], 10) : 0;
  }
  d = new Date(y, mo, day, hour, min, sec, 0);
  ms = d.getTime();
  return Number.isNaN(ms) || ms <= 0 ? 0 : ms;
}

/** 从生产记录 timestamp 得到本地日历日 YYYY-MM-DD（供日期筛选与 toLocalDateYmd 一致） */
export function toLocalDateYmdFromProductionTimestamp(input?: string | Date | null): string {
  if (input == null || input === '') return '';
  const ms = parseProductionOpTimestampMs(input);
  if (ms > 0) return toLocalDateYmd(new Date(ms));
  return toLocalDateYmd(input);
}

/** 本地日历日期 YYYY-MM-DD，用于筛选、排序、与日期输入框比较 */
export function toLocalDateYmd(input?: string | Date | null): string {
  if (input == null || input === '') return '';
  if (typeof input === 'string') {
    const t = input.trim();
    if (YMD_ONLY.test(t)) return t;
  }
  const d = typeof input === 'string' ? new Date(input) : input;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    if (typeof input === 'string') {
      const m = input.match(/^(\d{4}-\d{2}-\d{2})/);
      if (m) return m[1];
    }
    return '';
  }
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** 本地日期+时间 24h，例如 2026-04-09 17:30:05 */
export function formatLocalDateTimeZh(input?: string | Date | null): string {
  if (input == null || input === '') return '';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return typeof input === 'string' ? input : '';
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${mo}-${day} ${h}:${mi}:${s}`;
}

export function localTodayYmd(): string {
  return toLocalDateYmd(new Date());
}

/** yyyyMMdd，用于与业务单号中的日期段对齐（按本地日历日） */
export function toLocalCompactYmd(input?: string | Date | null): string {
  const ymd = toLocalDateYmd(input ?? new Date());
  return ymd.replace(/-/g, '');
}

/** plan-{base36 时间戳}-{rand}（与 genId('plan') 一致）→ 本地日历日 */
export function planIdToLocalYmd(planId: string): string {
  const m = planId.match(/^plan-([^-]+)-/);
  if (!m) return '';
  const ts = parseInt(m[1], 36);
  if (Number.isNaN(ts)) return '';
  return toLocalDateYmd(new Date(ts));
}
