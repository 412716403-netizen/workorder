function pad(n) {
  return String(n).padStart(2, '0');
}

function localTodayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 当前本地日期时间，供小程序 picker mode=datetime，格式 `YYYY-MM-DD HH:mm` */
function localNowForDatetimePicker() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addDaysYmd(ymd, days) {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 本地日历日 0 点 → ISO（与采购单等 PSI 落库口径一致） */
function localCalendarYmdStartToIso(ymd) {
  const s = String(ymd || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date().toISOString();
  return `${s}T00:00:00.000Z`;
}

module.exports = {
  localTodayYmd,
  localNowForDatetimePicker,
  addDaysYmd,
  localCalendarYmdStartToIso,
};
