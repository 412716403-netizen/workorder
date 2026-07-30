const {
  openBottomSheet,
  closeBottomSheet,
  clearBottomSheetTimers,
  DATETIME_SHEET_HEIGHT_RATIO,
} = require('../../../utils/bottomSheetAnim.js');
const { readWindowMetrics } = require('../../../utils/windowMetrics.js');
const {
  WEEKDAY_SHORT,
  parseYmd,
  parseHm,
  toYmd,
  toHm,
  clampDay,
  shiftMonth,
  todayYmd,
  formatDateCn,
  formatMonthTitle,
  buildMonthCells,
  buildYearOptions,
  buildHourOptions,
  buildMinuteOptions,
} = require('../../../utils/datetimeCalendar.js');

const YEAR_SPAN = 30;
const MONTH_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
/** 滚轮行高（rpx）；用 scroll-view 替代 picker-view，避免系统滚动音效 */
const WHEEL_ITEM_RPX = 80;
const WHEEL_VISIBLE = 5;

Component({
  options: {
    addGlobalClass: true,
  },
  properties: {
    label: { type: String, value: '创建时间' },
    date: { type: String, value: '' },
    time: { type: String, value: '' },
    placeholder: { type: String, value: '请选择' },
    disabled: { type: Boolean, value: false },
    required: { type: Boolean, value: false },
    last: { type: Boolean, value: false },
  },
  data: {
    open: false,
    sheetShow: false,
    sheetMotion: false,
    sheetHeightPx: 0,
    displayText: '',
    panel: 'calendar',
    weekdays: WEEKDAY_SHORT,
    draftDate: '',
    draftTime: '',
    viewYear: 2026,
    viewMonth: 1,
    monthTitle: '',
    monthPanels: [],
    swiperCurrent: 1,
    swiperDuration: 280,
    dateCn: '',
    yearOptions: [],
    monthOptions: MONTH_OPTIONS,
    yearIndex: 0,
    monthIndex: 0,
    hourOptions: buildHourOptions(),
    minuteOptions: buildMinuteOptions(),
    hourIndex: 0,
    minuteIndex: 0,
    yearScrollTop: 0,
    monthScrollTop: 0,
    hourScrollTop: 0,
    minuteScrollTop: 0,
    wheelItemPx: 40,
    wheelHeightPx: 200,
    wheelPadPx: 80,
  },
  observers: {
    'date, time': function (date, time) {
      const d = String(date || '').trim();
      const t = String(time || '').trim();
      this.setData({
        displayText: d && t ? `${d} ${t}` : d || t || '',
      });
    },
  },
  lifetimes: {
    attached() {
      this.refreshWheelMetrics();
    },
    detached() {
      this.clearWheelTimers();
      clearBottomSheetTimers(this);
    },
  },
  methods: {
    noop() {},

    refreshWheelMetrics() {
      const win = readWindowMetrics();
      const itemPx = Math.round(((win.windowWidth || 375) / 750) * WHEEL_ITEM_RPX);
      this._itemPx = itemPx;
      this.setData({
        wheelItemPx: itemPx,
        wheelHeightPx: itemPx * WHEEL_VISIBLE,
        wheelPadPx: itemPx * Math.floor(WHEEL_VISIBLE / 2),
      });
    },

    clearWheelTimers() {
      ['year', 'month', 'hour', 'minute'].forEach((key) => {
        const t = this[`_${key}ScrollTimer`];
        if (t) {
          clearTimeout(t);
          this[`_${key}ScrollTimer`] = null;
        }
      });
      if (this._swiperResetTimer) {
        clearTimeout(this._swiperResetTimer);
        this._swiperResetTimer = null;
      }
    },

    itemPx() {
      if (!this._itemPx) this.refreshWheelMetrics();
      return this._itemPx || 40;
    },

    snapIndex(scrollTop, maxIndex) {
      const h = this.itemPx();
      const idx = Math.round((scrollTop || 0) / h);
      return Math.max(0, Math.min(maxIndex, idx));
    },

    scrollTopOf(index) {
      return Math.max(0, index) * this.itemPx();
    },

    buildMonthPanel(year, month, draftDate) {
      const today = todayYmd();
      return {
        key: `${year}-${month}`,
        year,
        month,
        title: formatMonthTitle(year, month),
        cells: buildMonthCells(year, month, draftDate, today),
      };
    },

    buildMonthPanels(viewYear, viewMonth, draftDate) {
      const prev = shiftMonth(viewYear, viewMonth, -1);
      const next = shiftMonth(viewYear, viewMonth, 1);
      return [
        this.buildMonthPanel(prev.y, prev.m, draftDate),
        this.buildMonthPanel(viewYear, viewMonth, draftDate),
        this.buildMonthPanel(next.y, next.m, draftDate),
      ];
    },

    syncCalendarView(draftDate, viewYear, viewMonth) {
      return {
        monthTitle: formatMonthTitle(viewYear, viewMonth),
        monthPanels: this.buildMonthPanels(viewYear, viewMonth, draftDate),
        swiperCurrent: 1,
        swiperDuration: 280,
        dateCn: formatDateCn(draftDate),
      };
    },

    applyMonthCenter(viewYear, viewMonth, draftDate, opts) {
      const payload = {
        viewYear,
        viewMonth,
        ...this.syncCalendarView(draftDate, viewYear, viewMonth),
      };
      if (opts && opts.resetInstant) {
        payload.swiperDuration = 0;
        payload.swiperCurrent = 1;
      }
      this.setData(payload, () => {
        if (!(opts && opts.resetInstant)) return;
        if (this._swiperResetTimer) clearTimeout(this._swiperResetTimer);
        this._swiperResetTimer = setTimeout(() => {
          this._swiperResetTimer = null;
          this.setData({ swiperDuration: 280 });
        }, 40);
      });
    },

    syncTimeWheel(draftTime) {
      const { h, mi } = parseHm(draftTime);
      return {
        hourIndex: h,
        minuteIndex: mi,
        hourScrollTop: this.scrollTopOf(h),
        minuteScrollTop: this.scrollTopOf(mi),
      };
    },

    syncYearMonthWheel(viewYear, viewMonth, yearOptions) {
      const yi = Math.max(0, yearOptions.indexOf(viewYear));
      const mi = Math.max(0, viewMonth - 1);
      return {
        yearIndex: yi,
        monthIndex: mi,
        yearScrollTop: this.scrollTopOf(yi),
        monthScrollTop: this.scrollTopOf(mi),
      };
    },

    notifySheetOpen() {
      this.triggerEvent('sheetopen');
    },

    notifySheetClose() {
      this.triggerEvent('sheetclose');
    },

    onOpen() {
      if (this.data.disabled) return;
      if (typeof wx !== 'undefined' && typeof wx.hideKeyboard === 'function') {
        try {
          wx.hideKeyboard();
        } catch (_) {
          /* ignore */
        }
      }
      this.refreshWheelMetrics();
      const today = todayYmd();
      const draftDate = String(this.properties.date || '').trim() || today;
      const draftTime = String(this.properties.time || '').trim() || '00:00';
      const parsed = parseYmd(draftDate) || parseYmd(today);
      const viewYear = parsed.y;
      const viewMonth = parsed.m;
      const yearOptions = buildYearOptions(new Date().getFullYear(), YEAR_SPAN);
      const cal = this.syncCalendarView(draftDate, viewYear, viewMonth);
      this.notifySheetOpen();
      openBottomSheet(
        this,
        {
          panel: 'calendar',
          draftDate,
          draftTime,
          viewYear,
          viewMonth,
          yearOptions,
          ...cal,
          ...this.syncTimeWheel(draftTime),
          ...this.syncYearMonthWheel(viewYear, viewMonth, yearOptions),
        },
        { heightRatio: DATETIME_SHEET_HEIGHT_RATIO }
      );
    },

    onClose() {
      this.clearWheelTimers();
      this.notifySheetClose();
      closeBottomSheet(this, { panel: 'calendar' });
    },

    onDone() {
      this.clearWheelTimers();
      this.triggerEvent('change', {
        date: this.data.draftDate,
        time: this.data.draftTime,
      });
      this.notifySheetClose();
      closeBottomSheet(this, { panel: 'calendar' });
    },

    onPrevMonth() {
      const { viewYear, viewMonth, draftDate } = this.data;
      const p = shiftMonth(viewYear, viewMonth, -1);
      this.applyMonthCenter(p.y, p.m, draftDate, { resetInstant: true });
    },

    onNextMonth() {
      const { viewYear, viewMonth, draftDate } = this.data;
      const p = shiftMonth(viewYear, viewMonth, 1);
      this.applyMonthCenter(p.y, p.m, draftDate, { resetInstant: true });
    },

    onMonthSwiperChange(e) {
      const cur = Number(e.detail && e.detail.current);
      if (cur === 1 || this._swiperLock) return;
      const { viewYear, viewMonth, draftDate } = this.data;
      const delta = cur === 0 ? -1 : 1;
      const p = shiftMonth(viewYear, viewMonth, delta);
      this._swiperLock = true;
      this.applyMonthCenter(p.y, p.m, draftDate, { resetInstant: true });
      setTimeout(() => {
        this._swiperLock = false;
      }, 80);
    },

    onOpenYearMonth() {
      const { viewYear, viewMonth, yearOptions } = this.data;
      this.setData({
        panel: 'yearMonth',
        ...this.syncYearMonthWheel(viewYear, viewMonth, yearOptions),
      });
    },

    onWheelScroll(e) {
      const col = (e.currentTarget.dataset && e.currentTarget.dataset.col) || '';
      if (!col) return;
      const scrollTop = (e.detail && e.detail.scrollTop) || 0;
      const timerKey = `_${col}ScrollTimer`;
      if (this[timerKey]) clearTimeout(this[timerKey]);
      this[timerKey] = setTimeout(() => {
        this[timerKey] = null;
        this.snapWheelColumn(col, scrollTop);
      }, 90);
    },

    snapWheelColumn(col, scrollTop) {
      if (col === 'year') {
        const max = (this.data.yearOptions || []).length - 1;
        const idx = this.snapIndex(scrollTop, max);
        const y = this.data.yearOptions[idx];
        const m = (this.data.monthIndex || 0) + 1;
        this.setData({
          yearIndex: idx,
          yearScrollTop: this.scrollTopOf(idx),
          monthTitle: formatMonthTitle(y, m),
        });
        return;
      }
      if (col === 'month') {
        const idx = this.snapIndex(scrollTop, 11);
        const y = this.data.yearOptions[this.data.yearIndex] || new Date().getFullYear();
        this.setData({
          monthIndex: idx,
          monthScrollTop: this.scrollTopOf(idx),
          monthTitle: formatMonthTitle(y, idx + 1),
        });
        return;
      }
      if (col === 'hour') {
        const idx = this.snapIndex(scrollTop, 23);
        this.setData({
          hourIndex: idx,
          hourScrollTop: this.scrollTopOf(idx),
          draftTime: toHm(idx, this.data.minuteIndex),
        });
        return;
      }
      if (col === 'minute') {
        const idx = this.snapIndex(scrollTop, 59);
        this.setData({
          minuteIndex: idx,
          minuteScrollTop: this.scrollTopOf(idx),
          draftTime: toHm(this.data.hourIndex, idx),
        });
      }
    },

    onConfirmYearMonth() {
      const { yearOptions, yearIndex, monthIndex, draftDate } = this.data;
      const y = yearOptions[yearIndex] || new Date().getFullYear();
      const m = (monthIndex || 0) + 1;
      const parsed = parseYmd(draftDate);
      const day = clampDay(y, m, (parsed && parsed.d) || 1);
      const nextDate = toYmd(y, m, day);
      this.setData({
        panel: 'calendar',
        draftDate: nextDate,
      });
      this.applyMonthCenter(y, m, nextDate, { resetInstant: true });
    },

    onPickDay(e) {
      const ds = e.currentTarget.dataset || {};
      if (ds.empty) return;
      const ymd = ds.ymd || '';
      if (!ymd) return;
      const parsed = parseYmd(ymd);
      if (!parsed) return;
      this.setData({
        draftDate: ymd,
        viewYear: parsed.y,
        viewMonth: parsed.m,
        ...this.syncCalendarView(ymd, parsed.y, parsed.m),
      });
    },

    onOpenTime() {
      this.setData({
        panel: 'time',
        ...this.syncTimeWheel(this.data.draftTime),
        dateCn: formatDateCn(this.data.draftDate),
      });
    },

    onBackToCalendar() {
      const { draftDate, viewYear, viewMonth } = this.data;
      this.setData({ panel: 'calendar' });
      this.applyMonthCenter(viewYear, viewMonth, draftDate, { resetInstant: true });
    },
  },
});
