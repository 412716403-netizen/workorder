/**
 * 工作台统计周期筛选（对齐 Web useWorkbenchPeriodFilter / shared/workbenchOrderStats）
 */

const PERIOD_LABELS = {
  today: '今日',
  yesterday: '昨日',
  month: '本月',
};

const PERIOD_TABS = [
  { key: 'today', label: PERIOD_LABELS.today },
  { key: 'yesterday', label: PERIOD_LABELS.yesterday },
  { key: 'month', label: PERIOD_LABELS.month },
  { key: 'custom', label: '自定义' },
];

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function localTodayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isWorkbenchStatsYmd(v) {
  return typeof v === 'string' && YMD_RE.test(v);
}

function isValidWorkbenchCustomRange(startDate, endDate) {
  return isWorkbenchStatsYmd(startDate) && isWorkbenchStatsYmd(endDate) && startDate <= endDate;
}

function formatCustomRangeLabel(startDate, endDate) {
  const fmt = (ymd) => {
    const parts = ymd.split('-');
    if (parts.length !== 3) return ymd;
    return `${Number(parts[1])}/${Number(parts[2])}`;
  };
  if (startDate === endDate) return fmt(startDate);
  return `${fmt(startDate)}–${fmt(endDate)}`;
}

function workbenchPeriodFilterLabel(filter) {
  if (filter.mode === 'custom') {
    return formatCustomRangeLabel(filter.startDate, filter.endDate);
  }
  return PERIOD_LABELS[filter.period] || PERIOD_LABELS.today;
}

function buildPeriodFilter(periodTab, customStart, customEnd) {
  if (periodTab === 'custom') {
    return { mode: 'custom', startDate: customStart, endDate: customEnd };
  }
  return { mode: 'preset', period: periodTab };
}

function buildStatsQueryString(filter) {
  if (filter.mode === 'custom') {
    return `startDate=${encodeURIComponent(filter.startDate)}&endDate=${encodeURIComponent(filter.endDate)}`;
  }
  return `period=${filter.period}`;
}

function isQueryEnabled(periodTab, customStart, customEnd) {
  return periodTab !== 'custom' || isValidWorkbenchCustomRange(customStart, customEnd);
}

function createDefaultPeriodState() {
  const today = localTodayYmd();
  return {
    periodTab: 'today',
    customStart: today,
    customEnd: today,
    periodLabel: PERIOD_LABELS.today,
    customRangeInvalid: false,
    queryEnabled: true,
  };
}

function derivePeriodState(periodTab, customStart, customEnd) {
  const filter = buildPeriodFilter(periodTab, customStart, customEnd);
  const customRangeInvalid = periodTab === 'custom' && !isValidWorkbenchCustomRange(customStart, customEnd);
  return {
    periodTab,
    customStart,
    customEnd,
    periodLabel: workbenchPeriodFilterLabel(filter),
    customRangeInvalid,
    queryEnabled: isQueryEnabled(periodTab, customStart, customEnd),
  };
}

module.exports = {
  PERIOD_TABS,
  PERIOD_LABELS,
  localTodayYmd,
  isValidWorkbenchCustomRange,
  workbenchPeriodFilterLabel,
  buildPeriodFilter,
  buildStatsQueryString,
  isQueryEnabled,
  createDefaultPeriodState,
  derivePeriodState,
};
