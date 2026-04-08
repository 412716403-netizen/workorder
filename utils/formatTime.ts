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
