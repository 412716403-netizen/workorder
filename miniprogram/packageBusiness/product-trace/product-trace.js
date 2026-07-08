const { readTenantCtx } = require('../../utils/session.js');
const { readNavBarMetrics, readWindowMetrics, computeFixedFooterInsetPx } = require('../../utils/windowMetrics.js');
const {
  parseScanPayload,
  getUnrecognizedScanImeHint,
  rewriteScanApiErrorForIme,
} = require('../utils/scanPayload.js');
const { fetchScanByPayload, fetchItemTrace } = require('../utils/scanApi.js');
const {
  buildSerialLabel,
  buildSummaryFields,
  buildCallerContextText,
  buildTraceEventRow,
  buildTraceStatsText,
  buildLoadMoreText,
} = require('./traceViewHelpers.js');
const { vibrateOnScan } = require('../utils/scanCamera.js');
const { loadTraceabilityScanEnabled } = require('../../utils/featurePlugins.js');

const TRACE_PAGE_SIZE = 50;

function computeHeaderBlockHeight(nav) {
  return nav.statusBarHeight + nav.navBarHeight;
}

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 64,
    scrollHeight: 600,
    footerInsetPx: 140,
    loading: false,
    error: '',
    hasResult: false,
    isVoided: false,
    voidedMessage: '',
    serialLabel: '',
    summaryFields: [],
    callerContextText: '',
    traceItemSerialLabel: '',
    traceEvents: [],
    traceStatsText: '',
    scopeNote: '',
    traceEmpty: false,
    hasMore: false,
    loadingMore: false,
    loadMoreText: '',
    scanEnabled: false,
  },

  _traceToken: null,
  _tracePage: 1,
  _traceState: null,

  onLoad() {
    const nav = readNavBarMetrics();
    const win = readWindowMetrics();

    loadTraceabilityScanEnabled().then((scanEnabled) => {
      if (!scanEnabled) {
        wx.showToast({ title: '追溯码插件未开启', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      this.setData({ scanEnabled: true });
    });

    const headerBlockHeight = computeHeaderBlockHeight(nav);
    const footerInsetPx = computeFixedFooterInsetPx(152);
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight,
      footerInsetPx,
      scrollHeight: Math.max(320, win.windowHeight - headerBlockHeight),
    });
  },

  onShow() {
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    const ctx = readTenantCtx();
    if (!ctx || !ctx.tenantId) {
      wx.reLaunch({ url: '/pages/tenant-select/tenant-select' });
      return;
    }
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onScanTap() {
    if (this.data.loading) return;
    wx.scanCode({
      onlyFromCamera: false,
      success: (res) => {
        this.executeTrace(res.result || '');
      },
      fail: () => {
        wx.showToast({ title: '扫码已取消', icon: 'none' });
      },
    });
  },

  onLoadMoreTap() {
    this.loadMoreTrace();
  },

  executeTrace(raw) {
    const payload = parseScanPayload(raw);
    if (payload.kind === 'UNKNOWN' || !payload.token) {
      const preview = `${String(raw).slice(0, 32)}${String(raw).length > 32 ? '…' : ''}`;
      const imeHint = getUnrecognizedScanImeHint(raw);
      wx.showToast({
        title: imeHint ? '无法识别，请切换英文输入法' : `无法识别：${preview}`,
        icon: 'none',
        duration: 2800,
      });
      return;
    }
    if (payload.kind === 'BATCH') {
      wx.showToast({ title: '产品追溯仅支持扫单品码', icon: 'none' });
      return;
    }

    this._traceToken = payload.token;
    this._tracePage = 1;
    this._traceState = null;
    this.setData({
      loading: true,
      error: '',
      hasResult: false,
      isVoided: false,
      voidedMessage: '',
      serialLabel: '',
      summaryFields: [],
      callerContextText: '',
      traceItemSerialLabel: '',
      traceEvents: [],
      traceStatsText: '',
      scopeNote: '',
      traceEmpty: false,
      hasMore: false,
      loadMoreText: '',
    });

    fetchScanByPayload({ kind: 'ITEM', token: payload.token })
      .then((scan) => {
        if (!scan || scan.kind !== 'ITEM_CODE') {
          throw new Error('扫码结果类型异常');
        }
        return fetchItemTrace(payload.token, 1, TRACE_PAGE_SIZE)
          .then((trace) => ({ scan, trace }))
          .catch((traceErr) => ({
            scan,
            trace: null,
            traceError: (traceErr && traceErr.message) || '加载生产链路时间轴失败',
          }));
      })
      .then(({ scan, trace, traceError }) => {
        vibrateOnScan();
        const serialLabel = buildSerialLabel(scan);
        const isVoided = scan.status === 'VOIDED';
        const traceEvents = trace && Array.isArray(trace.events)
          ? trace.events.map(buildTraceEventRow)
          : [];
        this._traceState = trace;
        this.setData({
          loading: false,
          hasResult: true,
          isVoided,
          voidedMessage: isVoided ? (scan.message || '该单品码已作废') : '',
          serialLabel,
          summaryFields: buildSummaryFields(scan),
          callerContextText: buildCallerContextText(scan),
          traceItemSerialLabel: (trace && trace.itemSerialLabel) || serialLabel,
          traceEvents,
          traceStatsText: buildTraceStatsText(trace),
          scopeNote: (trace && trace.scopeNote && String(trace.scopeNote).trim()) || '',
          traceEmpty: !trace || traceEvents.length === 0,
          hasMore: !!(trace && trace.hasMore),
          loadMoreText: buildLoadMoreText(trace),
          error: traceError || '',
        });
        if (traceError) {
          wx.showToast({ title: traceError, icon: 'none' });
        }
      })
      .catch((err) => {
        const msg = rewriteScanApiErrorForIme(raw, (err && err.message) || '查询失败');
        this.setData({
          loading: false,
          error: msg,
          hasResult: false,
        });
        wx.showToast({ title: msg, icon: 'none' });
      });
  },

  loadMoreTrace() {
    if (!this._traceToken || !this._traceState || !this._traceState.hasMore || this.data.loadingMore) {
      return;
    }
    const nextPage = this._tracePage + 1;
    this.setData({ loadingMore: true });
    fetchItemTrace(this._traceToken, nextPage, TRACE_PAGE_SIZE)
      .then((t) => {
        const prevEvents = this._traceState && Array.isArray(this._traceState.events)
          ? this._traceState.events
          : [];
        const merged = {
          ...this._traceState,
          events: prevEvents.concat(Array.isArray(t.events) ? t.events : []),
          total: t.total,
          page: t.page,
          pageSize: t.pageSize,
          hasMore: t.hasMore,
        };
        this._tracePage = nextPage;
        this._traceState = merged;
        const traceEvents = merged.events.map(buildTraceEventRow);
        this.setData({
          loadingMore: false,
          traceEvents,
          traceStatsText: buildTraceStatsText(merged),
          hasMore: !!merged.hasMore,
          loadMoreText: buildLoadMoreText(merged),
          traceEmpty: traceEvents.length === 0,
        });
      })
      .catch((err) => {
        this.setData({ loadingMore: false });
        wx.showToast({ title: (err && err.message) || '加载更多失败', icon: 'none' });
      });
  },
});
