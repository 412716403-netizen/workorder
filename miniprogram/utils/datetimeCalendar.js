/**
 * 创建时间日历月格 / 展示文案（无时间启用开关；时刻始终可选）
 */

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WEEKDAY_SHORT = ['日', '一', '二', '三', '四', '五', '六'];

function pad(n) {
  return String(n).padStart(2, '0');
}

function parseYmd(ymd) {
  const m = String(ymd || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

function parseHm(hm) {
  const m = String(hm || '').trim().match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) return { h: 0, mi: 0 };
  return {
    h: Math.min(23, Math.max(0, Number(m[1]) || 0)),
    mi: Math.min(59, Math.max(0, Number(m[2]) || 0)),
  };
}

function toYmd(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function toHm(h, mi) {
  return `${pad(h)}:${pad(mi)}`;
}

function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

function clampDay(y, m, d) {
  return Math.min(d, daysInMonth(y, m));
}

/** delta: -1 上月 / +1 下月 */
function shiftMonth(y, m, delta) {
  const d = new Date(y, m - 1 + (delta || 0), 1);
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}

function todayYmd() {
  const n = new Date();
  return toYmd(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

function formatDateCn(ymd) {
  const p = parseYmd(ymd);
  if (!p) return ymd || '';
  const wd = WEEKDAYS[new Date(p.y, p.m - 1, p.d).getDay()];
  return `${p.y}年${p.m}月${p.d}日 ${wd}`;
}

function formatMonthTitle(y, m) {
  return `${y}年${m}月`;
}

function buildMonthCells(viewYear, viewMonth, selectedYmd, today) {
  const firstDow = new Date(viewYear, viewMonth - 1, 1).getDay();
  const total = daysInMonth(viewYear, viewMonth);
  const cells = [];
  for (let i = 0; i < firstDow; i += 1) {
    cells.push({ key: `e-${i}`, empty: true });
  }
  for (let d = 1; d <= total; d += 1) {
    const ymd = toYmd(viewYear, viewMonth, d);
    cells.push({
      key: ymd,
      empty: false,
      day: d,
      ymd,
      isToday: ymd === today,
      isSelected: ymd === selectedYmd,
      label: ymd === today ? '今' : String(d),
    });
  }
  return cells;
}

function buildYearOptions(centerYear, span) {
  const start = Math.max(2000, centerYear - span);
  const end = centerYear + span;
  const years = [];
  for (let y = start; y <= end; y += 1) years.push(y);
  return years;
}

function buildHourOptions() {
  const hours = [];
  for (let h = 0; h < 24; h += 1) hours.push(pad(h));
  return hours;
}

function buildMinuteOptions() {
  const minutes = [];
  for (let m = 0; m < 60; m += 1) minutes.push(pad(m));
  return minutes;
}

module.exports = {
  WEEKDAYS,
  WEEKDAY_SHORT,
  pad,
  parseYmd,
  parseHm,
  toYmd,
  toHm,
  daysInMonth,
  clampDay,
  shiftMonth,
  todayYmd,
  formatDateCn,
  formatMonthTitle,
  buildMonthCells,
  buildYearOptions,
  buildHourOptions,
  buildMinuteOptions,
};
