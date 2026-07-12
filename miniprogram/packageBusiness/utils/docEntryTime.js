const { localTodayYmd, localCalendarYmdStartToIso } = require('./dateYmd.js');
const { formatPlanCreatedDateList } = require('./planDetailHelpers.js');

function pad(n) {
  return String(n).padStart(2, '0');
}

function defaultPlanEntryDate() {
  return localTodayYmd();
}

function hydratePlanEntryDate(createdAt) {
  if (createdAt == null || createdAt === '') return defaultPlanEntryDate();
  const ymd = formatPlanCreatedDateList(createdAt);
  if (ymd && ymd !== '—') return ymd;
  const raw = String(createdAt).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : defaultPlanEntryDate();
}

function planEntryDateToCreatedAt(ymd) {
  const t = String(ymd || '').trim();
  if (!t) return localCalendarYmdStartToIso(defaultPlanEntryDate());
  return localCalendarYmdStartToIso(t);
}

function planEntryDatetimeToCreatedAt(local) {
  const t = String(local || '').trim();
  if (!t) return entryDateAndTimeToIso(defaultEntryDate(), defaultEntryTimeHm());
  if (t.includes('T')) {
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return planEntryDateToCreatedAt(t.slice(0, 10));
    return d.toISOString();
  }
  return planEntryDateToCreatedAt(t);
}

function hydratePlanEntryDatetime(createdAt) {
  if (createdAt == null || createdAt === '') {
    return `${defaultEntryDate()}T${defaultEntryTimeHm()}`;
  }
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return `${defaultEntryDate()}T${defaultEntryTimeHm()}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultPlanEntryDatetime() {
  return `${defaultEntryDate()}T${defaultEntryTimeHm()}`;
}

function defaultEntryDate() {
  return defaultPlanEntryDate();
}

function hydrateEntryDate(createdAt) {
  return hydratePlanEntryDate(createdAt);
}

function entryDateToCreatedAt(ymd) {
  return planEntryDateToCreatedAt(ymd);
}

function psiEntryTimestampsFromDate(ymd) {
  const createdAt = entryDateToCreatedAt(ymd);
  return { createdAt, timestamp: createdAt };
}

function psiEntryTimestampsFromDatetime(dateYmd, timeHm) {
  const d = String(dateYmd || '').trim();
  const tm = timeHm != null ? String(timeHm).trim() : '';
  if (d.includes('T')) {
    const dt = new Date(d);
    if (!Number.isNaN(dt.getTime())) {
      const ymd = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
      const hm = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
      return {
        createdAt: entryDateAndTimeToIso(ymd, hm),
        timestamp: entryDateAndTimeToTimestamp(ymd, hm),
      };
    }
  }
  if (tm) {
    return {
      createdAt: entryDateAndTimeToIso(d || defaultEntryDate(), tm),
      timestamp: entryDateAndTimeToTimestamp(d || defaultEntryDate(), tm),
    };
  }
  return psiEntryTimestampsFromDate(d || defaultEntryDate());
}

function hydratePsiEntryFields(ts) {
  return {
    createdAt: hydrateEntryDate(ts),
    createdAtTime: hydrateEntryTimeHm(ts),
  };
}

function defaultEntryTimeHm() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function hydrateEntryTimeHm(ts) {
  if (ts == null || ts === '') return defaultEntryTimeHm();
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return defaultEntryTimeHm();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function entryDateAndTimeToIso(dateYmd, timeHm) {
  const d = String(dateYmd || '').trim() || defaultEntryDate();
  const tm = String(timeHm || '').trim() || '00:00';
  const parts = tm.split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const ymd = d.split('-').map((x) => parseInt(x, 10));
  return new Date(ymd[0], ymd[1] - 1, ymd[2], h, m, 0, 0).toISOString();
}

/** date + time → yyyy-MM-dd HH:mm（对齐 Web entryDatetimeLocalToTimestamp） */
function entryDateAndTimeToTimestamp(dateYmd, timeHm) {
  const d = String(dateYmd || '').trim() || defaultEntryDate();
  const tm = String(timeHm || '').trim() || '00:00';
  const parts = tm.split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const ymd = d.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(ymd[0], ymd[1] - 1, ymd[2], h, m, 0, 0);
  return `${pad(dt.getFullYear())}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

module.exports = {
  defaultPlanEntryDate,
  hydratePlanEntryDate,
  planEntryDateToCreatedAt,
  planEntryDatetimeToCreatedAt,
  defaultPlanEntryDatetime,
  hydratePlanEntryDatetime,
  defaultEntryDate,
  hydrateEntryDate,
  entryDateToCreatedAt,
  psiEntryTimestampsFromDate,
  psiEntryTimestampsFromDatetime,
  hydratePsiEntryFields,
  defaultEntryTimeHm,
  hydrateEntryTimeHm,
  entryDateAndTimeToIso,
  entryDateAndTimeToTimestamp,
};
