const pad = (n: number) => String(n).padStart(2, '0');

/** yyyy-MM-dd HH:mm 格式化展示 */
export function formatTimestamp(ts: string | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local 输入值 → yyyy-MM-dd HH:mm 字符串 */
export function timestampFromDatetimeLocal(local: string): string {
  const d = new Date(local);
  if (isNaN(d.getTime())) return nowTimestamp();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 当前时刻 yyyy-MM-dd HH:mm */
export function nowTimestamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const ZH_CN_DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
};

/** zh-CN 本地化日期时间（含秒），无效值返回原字符串，空值返回 '—' */
export function fmtDT(ts: string | Date | undefined | null): string {
  if (!ts) return '—';
  const d = new Date(ts as string | number);
  if (isNaN(d.getTime())) return String(ts);
  return d.toLocaleString('zh-CN', ZH_CN_DATETIME_OPTS);
}
