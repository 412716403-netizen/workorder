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

/** `<input type="datetime-local" />` 存库：无时区的整串匹配（勿用 `Date` 解析，否则易被当成 UTC 导致打印偏差） */
const NAIVE_DATETIME_LOCAL_PRINT = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;

/** 是否带 ISO 时区（与无时区 datetime-local 区分） */
function hasExplicitIsoTimeZone(s: string): boolean {
  return /[zZ]$/.test(s) || /[+\-]\d{2}:?\d{2}$/.test(s);
}

/** 该瞬间是否为「UTC 日历日的 0 点」（常见于仅日期被 `new Date('YYYY-MM-DD')` 或后端 normalize 成 UTC 午夜，东八区展示会误成 08:00:00）。 */
function isUtcCalendarMidnightInstant(d: Date): boolean {
  return (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}

function formatUtcCalendarYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/**
 * 字符串是否「像」可解析的日期/时间（避免自由文本被 `new Date(文本)` 误解析，例如 `备注-01-01 00:00:00` 在 V8 中会解析成 2001-01-01）。
 */
function looksLikeParsableAsPrintDatetime(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (YMD_ONLY.test(t)) return true;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return true;
  if (/^\d{4}[/-]\d{1,2}[/-]\d{1,2}/.test(t)) return true;
  if (t.includes('T')) return true;
  if (/^(?:上午|下午)/.test(t)) return true;
  /** 纯数字：Unix 秒(10 位)或毫秒(13 位) */
  if (/^\d{10}$|^\d{13}$/.test(t)) return true;
  return false;
}

/**
 * 打印占位符中自定义字段值的展示（历史上函数名带 Datetime，实际用于所有自定义类型）。
 * - `YYYY-MM-DDTHH:mm`（无时区）按字面转为 `YYYY-MM-DD HH:mm`，与表单填写一致；
 * - 带 `Z` / `±hh:mm` 的 ISO 按本地时区格式化；
 * - 纯 `YYYY-MM-DD` 原样返回。
 * - **非**日期形态的字符串不再调用宽松 `parseProductionOpTimestampMs`，避免正文后出现 `-01-01 00:00:00` 等误解析尾巴。
 * - 数字：仅当像 Unix 毫秒(>1e11) 或 Unix 秒(2000–2100 范围整数)时才格式化为日期时间，否则按普通数字打印。
 */
export function formatCustomFieldDatetimeForPrint(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    const n = value;
    const abs = Math.abs(n);
    if (abs > 1e11) {
      return formatLocalDateTimeZh(new Date(n));
    }
    /** 2000-01-01 ~ 2100-01-01 的 Unix 秒 → 本地日期时间 */
    if (Number.isInteger(n) && abs >= 946684800 && abs < 4102444800) {
      return formatLocalDateTimeZh(new Date(n * 1000));
    }
    return String(n);
  }
  if (typeof value !== 'string') return String(value);
  const s = value.trim();
  if (!s) return '';
  if (YMD_ONLY.test(s)) return s;
  const naive = NAIVE_DATETIME_LOCAL_PRINT.exec(s);
  if (naive && naive[0] === s && !hasExplicitIsoTimeZone(s)) {
    const date = naive[1];
    const hh = naive[2];
    const mm = naive[3];
    const ss = naive[4];
    if (ss != null) return `${date} ${hh}:${mm}:${ss}`;
    return `${date} ${hh}:${mm}`;
  }
  if (hasExplicitIsoTimeZone(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return formatLocalDateTimeZh(d);
  }
  if (!looksLikeParsableAsPrintDatetime(s)) return s;
  const ms = parseProductionOpTimestampMs(s);
  if (ms > 0) return formatLocalDateTimeZh(new Date(ms));
  return s;
}

export function localTodayYmd(): string {
  return toLocalDateYmd(new Date());
}

/** 当前本地日期时间，供 `<input type="datetime-local" />`，格式 `YYYY-MM-DDTHH:mm` */
export function localNowForDatetimeLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${day}T${h}:${mi}`;
}

/** 将已存值规范为 datetime-local 可用的 `YYYY-MM-DDTHH:mm` */
export function toDatetimeLocalInputValue(raw: string | undefined | null): string {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.slice(0, 16);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${mo}-${day}T${h}:${mi}`;
  }
  return s.length > 16 ? s.slice(0, 16) : s;
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

/**
 * 计划单列表/详情：创建时间
 * - 纯 `YYYY-MM-DD` 原样；
 * - 带 `Z`/`±offset` 且为 **UTC 当日 0 点** 的 ISO（多为仅日期入库）→ 只显示 UTC 日历日 `YYYY-MM-DD`，避免东八区误显示成 `… 08:00:00`；
 * - 其它含时刻的值 → 本地 `YYYY-MM-DD HH:mm:ss`；
 * - 无值时从 `plan-` id 推断日期。
 */
export function formatPlanOrderCreatedAtForList(
  createdAt: string | undefined | null,
  planId: string,
): string {
  const raw = (createdAt ?? '').trim();
  const s = raw || planIdToLocalYmd(planId);
  if (!s) return '';
  if (YMD_ONLY.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return toLocalDateYmd(s) || s.slice(0, 10);
  if (hasExplicitIsoTimeZone(s) && isUtcCalendarMidnightInstant(d)) {
    return formatUtcCalendarYmd(d);
  }
  return formatLocalDateTimeZh(d);
}

function orderIdToFlowPlacedDisplay(orderId: string): string {
  const m = orderId.match(/^ord-([^-]+)-/);
  if (!m) return '';
  const ts = parseInt(m[1], 36);
  if (Number.isNaN(ts)) return '';
  return formatLocalDateTimeZh(new Date(ts));
}

/**
 * 工单流水列表「下单/下达时间」列（与 {@link ProductionOrder.createdAt} 多为仅日期一致）
 * - 纯 `YYYY-MM-DD` 原样，避免 `formatLocalDateTimeZh` 在东八区显示成 `… 08:00:00`；
 * - 无时区 `YYYY-MM-DDTHH:mm` 字面展开；
 * - 带 Z/偏移且为 UTC 当日 0 点的 ISO → 仅日历日；
 * - 其它含时刻 → 本地 `YYYY-MM-DD HH:mm:ss`；
 * - 无 createdAt 时从 `ord-` id 推断。
 */
export function formatOrderFlowPlacedDisplay(
  createdAt: string | undefined | null,
  orderId: string,
): string {
  const raw = (createdAt ?? '').trim();
  if (raw) {
    if (YMD_ONLY.test(raw)) return raw;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return toLocalDateYmd(raw) || raw.slice(0, 10);
    if (hasExplicitIsoTimeZone(raw) && isUtcCalendarMidnightInstant(d)) {
      return formatUtcCalendarYmd(d);
    }
    const naive = NAIVE_DATETIME_LOCAL_PRINT.exec(raw);
    if (naive && naive[0] === raw && !hasExplicitIsoTimeZone(raw)) {
      const date = naive[1];
      const hh = naive[2];
      const mm = naive[3];
      const ss = naive[4];
      if (ss != null) return `${date} ${hh}:${mm}:${ss}`;
      return `${date} ${hh}:${mm}`;
    }
    return formatLocalDateTimeZh(d);
  }
  return orderIdToFlowPlacedDisplay(orderId);
}
