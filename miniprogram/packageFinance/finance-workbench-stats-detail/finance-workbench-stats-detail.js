const { request } = require('../../utils/request.js');
const { readTenantCtx } = require('../../utils/session.js');
const { readNavBarMetrics } = require('../../utils/windowMetrics.js');
const {
  PERIOD_TABS,
  createDefaultPeriodState,
  derivePeriodState,
  buildPeriodFilter,
  buildStatsQueryString,
} = require('../../utils/workbenchPeriodFilter.js');
const { fetchFinanceCategoriesAll } = require('../../utils/financeApi.js');

const OTHER_TYPE_LABELS = { SETTLEMENT: '工资结算', RECONCILIATION: '财务对账' };

function amount(value, showAmount) {
  if (!showAmount) return '***';
  const number = Number(value);
  if (!Number.isFinite(number)) return '0.00';
  return number.toFixed(2);
}

function canViewAmount(ctx) {
  if (ctx && ctx.tenantRole === 'owner') return true;
  const permissions = (ctx && ctx.permissions) || [];
  if (permissions.includes('price_amount')) return true;
  return [
    'psi:purchase_order:amount',
    'psi:purchase_bill:amount',
    'psi:sales_order:amount',
    'psi:sales_bill:amount',
    'production:outsource_amount:allow',
    'collaboration:amount:allow',
  ].some((permission) => permissions.includes(permission));
}

function count(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : '0';
}

function isoRange(filter) {
  const start = new Date();
  const end = new Date();
  if (filter.mode === 'custom') {
    const [sy, sm, sd] = filter.startDate.split('-').map(Number);
    const [ey, em, ed] = filter.endDate.split('-').map(Number);
    start.setFullYear(sy, sm - 1, sd);
    end.setFullYear(ey, em - 1, ed);
  } else if (filter.period === 'yesterday') {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  } else if (filter.period === 'month') {
    start.setDate(1);
  }
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

function buildCategoryRows(summary, categories, total, showAmount) {
  const names = new Map((categories || []).map((item) => [item.id, item.name]));
  return ((summary && summary.byCategory) || [])
    .filter((item) => Number(item.amount) > 0)
    .map((item) => ({
      key: item.categoryId || '__none',
      name: item.categoryId ? (names.get(item.categoryId) || '未知分类') : '未分类',
      rawAmount: Number(item.amount) || 0,
      amountText: amount(item.amount, showAmount),
      sub: `${count(item.count)} 笔`,
      pct: total > 0 ? `${((Number(item.amount) / total) * 100).toFixed(1)}%` : '0.0%',
    }))
    .sort((a, b) => b.rawAmount - a.rawAmount);
}

function buildPartnerRows(items, total, showAmount) {
  return (items || [])
    .filter((item) => Number(item.amount) > 0)
    .map((item) => ({
      key: item.partner,
      name: item.partner || '未命名合作单位',
      amountText: amount(item.amount, showAmount),
      pct: total > 0 ? `${((Number(item.amount) / total) * 100).toFixed(1)}%` : '0.0%',
    }));
}

Page({
  data: Object.assign({}, createDefaultPeriodState(), {
    periodTabs: PERIOD_TABS,
    statusBarHeight: 20,
    navBarHeight: 44,
    loading: true,
    refreshing: false,
    loadError: false,
    noPermission: false,
    canViewAmount: false,
    overview: null,
    receipt: null,
    payment: null,
    partnerSections: [],
    otherTypes: [],
  }),

  onLoad() {
    const nav = readNavBarMetrics();
    this.setData({ statusBarHeight: nav.statusBarHeight, navBarHeight: nav.navBarHeight });
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
    this.setData({ canViewAmount: canViewAmount(ctx) });
    this.loadData();
  },

  onPullDownRefresh() {
    this.loadData(true).finally(() => wx.stopPullDownRefresh());
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onPeriodTabTap(e) {
    const periodTab = e.currentTarget.dataset.key;
    if (!periodTab || periodTab === this.data.periodTab) return;
    const state = derivePeriodState(periodTab, this.data.customStart, this.data.customEnd);
    this.setData(state, () => {
      if (state.queryEnabled) this.loadData();
    });
  },

  onCustomStartChange(e) {
    const state = derivePeriodState(this.data.periodTab, e.detail.value, this.data.customEnd);
    this.setData(state, () => {
      if (state.queryEnabled) this.loadData();
    });
  },

  onCustomEndChange(e) {
    const state = derivePeriodState(this.data.periodTab, this.data.customStart, e.detail.value);
    this.setData(state, () => {
      if (state.queryEnabled) this.loadData();
    });
  },

  loadData(pullRefresh) {
    if (!this.data.queryEnabled) return Promise.resolve();
    const filter = buildPeriodFilter(this.data.periodTab, this.data.customStart, this.data.customEnd);
    const statsQuery = buildStatsQueryString(filter);
    const range = isoRange(filter);
    const dateQuery = `startDate=${encodeURIComponent(range.startDate)}&endDate=${encodeURIComponent(range.endDate)}`;
    const showAmount = this.data.canViewAmount;
    this.setData({
      loading: !pullRefresh,
      refreshing: !!pullRefresh,
      loadError: false,
      noPermission: false,
    });

    return Promise.all([
      request({ path: `/dashboard/stats?${statsQuery}`, method: 'GET' }).catch(() => null),
      request({ path: `/finance/summary?${dateQuery}`, method: 'GET' }).catch(() => null),
      request({ path: `/finance/summary?${dateQuery}&type=RECEIPT`, method: 'GET' }).catch(() => null),
      request({ path: `/finance/summary?${dateQuery}&type=PAYMENT`, method: 'GET' }).catch(() => null),
      request({ path: `/dashboard/finance-partner-stats?${statsQuery}`, method: 'GET' }).catch(() => null),
      fetchFinanceCategoriesAll(),
    ]).then((results) => {
      const stats = results[0];
      const summary = results[1];
      const receiptSummary = results[2];
      const paymentSummary = results[3];
      const partnerStats = results[4];
      const categories = Array.isArray(results[5]) ? results[5] : [];
      const finance = stats && stats.finance;
      if (!finance) {
        this.setData({ loading: false, refreshing: false, noPermission: true });
        return;
      }

      const partnerSummary = (partnerStats && partnerStats.summary) || {};
      const receiptAmount = Number(finance.receiptAmount) || 0;
      const paymentAmount = Number(finance.paymentAmount) || 0;
      const overview = {
        cashFlowText: amount(finance.cashFlow, showAmount),
        receiptHint: `收款 ${count(finance.receiptCount)} 笔 · 付款 ${count(finance.paymentCount)} 笔`,
        cashFlowTone: Number(finance.cashFlow) > 0 ? 'ok' : Number(finance.cashFlow) < 0 ? 'warn' : 'default',
      };
      const receipt = {
        label: `${this.data.periodLabel}收款`, amountText: amount(receiptAmount, showAmount),
        sub: `${count(finance.receiptCount)} 笔`, tone: 'receipt',
        rows: buildCategoryRows(receiptSummary, categories.filter((c) => c.kind === 'RECEIPT'), receiptAmount, showAmount),
      };
      const payment = {
        label: `${this.data.periodLabel}支出`, amountText: amount(paymentAmount, showAmount),
        sub: `${count(finance.paymentCount)} 笔`, tone: 'payment',
        rows: buildCategoryRows(paymentSummary, categories.filter((c) => c.kind === 'PAYMENT'), paymentAmount, showAmount),
      };
      const partnerSections = [
        ['本期应收款', '本期累计增加', 'receivable', partnerSummary.periodReceivable, partnerStats && partnerStats.periodReceivableByPartner],
        ['本期应付款', '本期累计减少', 'payable', partnerSummary.periodPayable, partnerStats && partnerStats.periodPayableByPartner],
        ['剩余应收款', '期末正余额合计', 'receivable', partnerSummary.remainingReceivable, partnerStats && partnerStats.remainingReceivableByPartner],
        ['剩余应付款', '期末负余额合计', 'payable', partnerSummary.remainingPayable, partnerStats && partnerStats.remainingPayableByPartner],
      ].map((item) => ({
        label: item[0], sub: item[1], tone: item[2], amountText: amount(item[3], showAmount),
        rows: buildPartnerRows(item[4], Number(item[3]) || 0, showAmount),
      }));
      const otherTypes = ((summary && summary.byType) || [])
        .filter((item) => item.type === 'SETTLEMENT' || item.type === 'RECONCILIATION')
        .filter((item) => Number(item.amount) !== 0 || Number(item.count) !== 0)
        .map((item) => ({
          label: OTHER_TYPE_LABELS[item.type] || item.type,
          amountText: amount(item.amount, showAmount), countText: count(item.count),
        }));
      this.setData({ overview, receipt, payment, partnerSections, otherTypes, loading: false, refreshing: false });
    }).catch(() => {
      this.setData({ loading: false, refreshing: false, loadError: true });
    });
  },
});
