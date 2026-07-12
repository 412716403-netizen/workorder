import { timestampFromDatetimeLocal, nowTimestamp } from './formatTime';
import { localCalendarYmdStartToIso, localTodayYmd, toLocalDateYmd } from './localDateTime';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 计划单新建：入单时间默认今天（本地日历日） */
export function defaultPlanEntryDate(): string {
  return localTodayYmd();
}

/** 从已存 createdAt 回填表单日期（YYYY-MM-DD） */
export function hydratePlanEntryDate(createdAt: string | Date | null | undefined): string {
  if (createdAt == null || createdAt === '') return defaultPlanEntryDate();
  const ymd = toLocalDateYmd(createdAt);
  if (ymd) return ymd;
  const raw = String(createdAt).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : defaultPlanEntryDate();
}

/** 计划单 / 进销存入单日期 → 落库 ISO（本地日历日 0 点） */
export function planEntryDateToCreatedAt(ymd: string): string {
  const t = (ymd || '').trim();
  if (!t) return localCalendarYmdStartToIso(defaultPlanEntryDate());
  return localCalendarYmdStartToIso(t);
}

/** 别名：仅日期单据通用 */
export const defaultEntryDate = defaultPlanEntryDate;
export const hydrateEntryDate = hydratePlanEntryDate;
export const entryDateToCreatedAt = planEntryDateToCreatedAt;

/** 进销存保存：createdAt 与 timestamp 同步为入单日期 ISO */
export function psiEntryTimestampsFromDate(ymd: string): { createdAt: string; timestamp: string } {
  const createdAt = entryDateToCreatedAt(ymd);
  return { createdAt, timestamp: createdAt };
}

/** 进销存 datetime-local → createdAt ISO + 业务 timestamp */
export function psiEntryTimestampsFromDatetime(local: string): { createdAt: string; timestamp: string } {
  const t = (local || '').trim();
  if (!t) {
    const def = defaultEntryDatetimeLocal();
    return { createdAt: planEntryDatetimeToCreatedAt(def), timestamp: entryDatetimeLocalToTimestamp(def) };
  }
  if (t.includes('T')) {
    return {
      createdAt: planEntryDatetimeToCreatedAt(t),
      timestamp: entryDatetimeLocalToTimestamp(t),
    };
  }
  return psiEntryTimestampsFromDate(t);
}

/** datetime-local 默认值（当前本地时刻） */
export function defaultEntryDatetimeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 从 timestamp / createdAt 回填 datetime-local */
export function hydrateEntryDatetimeLocal(ts: string | Date | null | undefined): string {
  if (ts == null || ts === '') return defaultEntryDatetimeLocal();
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) return defaultEntryDatetimeLocal();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 计划单 datetime-local → 落库 ISO（保留时刻）；纯 YMD 仍按本地 0 点 */
export function planEntryDatetimeToCreatedAt(local: string): string {
  const t = (local || '').trim();
  if (!t) return new Date(defaultEntryDatetimeLocal()).toISOString();
  if (t.includes('T')) {
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return planEntryDateToCreatedAt(t.slice(0, 10));
    return d.toISOString();
  }
  return planEntryDateToCreatedAt(t);
}

export const defaultPlanEntryDatetime = defaultEntryDatetimeLocal;
export const hydratePlanEntryDatetime = hydrateEntryDatetimeLocal;

/** datetime-local → 业务 timestamp 字符串（yyyy-MM-dd HH:mm） */
export function entryDatetimeLocalToTimestamp(local: string): string {
  const t = (local || '').trim();
  if (!t) return nowTimestamp();
  return timestampFromDatetimeLocal(t);
}

/** 小程序：date + time → ISO timestamp */
export function entryDateAndTimeToIso(dateYmd: string, timeHm: string): string {
  const d = (dateYmd || '').trim() || defaultEntryDate();
  const tm = (timeHm || '').trim() || '00:00';
  const [h, m] = tm.split(':').map(x => parseInt(x, 10) || 0);
  const [y, mo, day] = d.split('-').map(x => parseInt(x, 10));
  return new Date(y, mo - 1, day, h, m, 0, 0).toISOString();
}

export function defaultEntryTimeHm(): string {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function hydrateEntryTimeHm(ts: string | Date | null | undefined): string {
  if (ts == null || ts === '') return defaultEntryTimeHm();
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) return defaultEntryTimeHm();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
