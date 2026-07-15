const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 =



  require('../../utils/financeApi.js'),fetchAllFinanceRecords = _require3.fetchAllFinanceRecords,partnerOpeningBalance = _require3.partnerOpeningBalance,normalizeMasterList = _require3.normalizeMasterList;
const _require4 = require('../../utils/psiApi.js'),fetchAllPsiRecords = _require4.fetchAllPsiRecords;
const _require5 =





  require('../../utils/orderApi.js'),fetchProductionRecords = _require5.fetchProductionRecords,listReportHistory = _require5.listReportHistory,fetchWorkersAll = _require5.fetchWorkersAll,fetchNodesAll = _require5.fetchNodesAll,fetchProductsAll = _require5.fetchProductsAll;
const _require6 =


  require('../../utils/planApi.js'),fetchPartnersAll = _require6.fetchPartnersAll,fetchPartnerCategoriesAll = _require6.fetchPartnerCategoriesAll;
const _require7 = require('../../utils/purchaseOrders.js'),buildProductMap = _require7.buildProductMap;
const _require8 =



















  require('../utils/financeReconciliation.js'),buildPartnerReconList = _require8.buildPartnerReconList,buildPartnerReconBalances = _require8.buildPartnerReconBalances,summarizePartnerReconBalances = _require8.summarizePartnerReconBalances,filterPartnerReconList = _require8.filterPartnerReconList,buildSettlementReconList = _require8.buildSettlementReconList,buildSettlementReconBalances = _require8.buildSettlementReconBalances,summarizeSettlementReconBalances = _require8.summarizeSettlementReconBalances,computeSettlementOpeningBalance = _require8.computeSettlementOpeningBalance,filterSettlementReconList = _require8.filterSettlementReconList,buildPartnerProductLineReconList = _require8.buildPartnerProductLineReconList,filterPartnerProductReconList = _require8.filterPartnerProductReconList,buildSettlementProductLineReconList = _require8.buildSettlementProductLineReconList,filterSettlementProductReconList = _require8.filterSettlementProductReconList,mapPartnerBalancedCard = _require8.mapPartnerBalancedCard,mapSettlementBalancedCard = _require8.mapSettlementBalancedCard,mapProductLineCard = _require8.mapProductLineCard,mapSummaryView = _require8.mapSummaryView,dateRangeToQuery = _require8.dateRangeToQuery,dateToEndExclusiveIso = _require8.dateToEndExclusiveIso;
const _require9 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require9.readNavBarMetrics,readWindowMetrics = _require9.readWindowMetrics;

const WORK_DETAIL_STORAGE_KEY = 'financeReconWorkDetail';

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil(win.windowWidth / 750 * 8);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function buildWorkerMap(workers) {
  const map = new Map();
  (workers || []).forEach((w) => {
    if (w && w.id) map.set(w.id, w);
  });
  return map;
}

function attachMilestoneNames(productReports, nodes) {
  const nodeMap = new Map();
  (nodes || []).forEach((n) => {
    if (n && n.id) nodeMap.set(n.id, n.name || '');
  });
  return (productReports || []).map((r) =>
  Object.assign({}, r, {
    milestoneName: nodeMap.get(r.templateId) || r.milestoneName || ''
  })
  );
}

Page({
  data: {
    loading: false,
    subTab: 'partner',
    viewMode: 'document',
    dateFrom: '',
    dateTo: '',
    partnerId: '',
    partnerName: '',
    workerId: '',
    workerName: '',
    partners: [],
    partnerCategories: [],
    workers: [],
    processNodes: [],
    canQuery: false,
    hasQueried: false,
    searchKeyword: '',
    summary: null,
    cards: [],
    emptyText: '该条件下暂无对账单据',
    hintText: '请选择合作单位后点击查询',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 64
  },

  onLoad() {
    const nav = readNavBarMetrics();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav)
    });
    this._cardsRaw = [];
    this._workerMap = new Map();
    this._productMap = new Map();
    this._queryToken = 0;
    this._partnerRows = [];
    this._settlementRows = [];
    this._psiRecords = [];
    this._prodRecords = [];
    this._openingBalance = 0;
  },

  onShow() {
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    const ctx = readTenantCtx();
    const perms = ctx && ctx.permissions || [];
    if (!hasPermission(perms, 'finance:reconciliation:allow')) {
      wx.showToast({ title: '无对账权限', icon: 'none' });
      setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/apps/apps' }) }), 600);
      return;
    }
    this.loadMasters();
  },

  onHeaderBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/apps/apps' }) });
  },

  async loadMasters() {
    try {
      const _await$Promise$all = await Promise.all([
        fetchPartnersAll().catch(() => []),
        fetchPartnerCategoriesAll().catch(() => []),
        fetchWorkersAll().catch(() => []),
        fetchNodesAll().catch(() => []),
        fetchProductsAll().catch(() => [])]
        ),partners = _await$Promise$all[0],partnerCategories = _await$Promise$all[1],workers = _await$Promise$all[2],nodes = _await$Promise$all[3],products = _await$Promise$all[4];
      const partnerList = normalizeMasterList(partners);
      const workerList = normalizeMasterList(workers);
      const nodeList = normalizeMasterList(nodes);
      const productList = normalizeMasterList(products);
      this._workerMap = buildWorkerMap(workerList);
      this._productMap = buildProductMap(productList);
      this._processNodes = nodeList;
      this.setData({
        partners: partnerList,
        partnerCategories: normalizeMasterList(partnerCategories),
        workers: workerList,
        processNodes: nodeList,
        canQuery: this.computeCanQuery()
      });
    } catch (e) {
      console.error('[finance-reconciliation] loadMasters', e);
    }
  },

  computeCanQuery() {
    if (this.data.subTab === 'partner') return !!this.data.partnerId;
    return !!this.data.workerId;
  },

  syncCanQuery() {
    this.setData({ canQuery: this.computeCanQuery() });
  },

  onSubTabTap(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.subTab) return;
    this.setData({
      subTab: tab,
      hasQueried: false,
      loading: false,
      cards: [],
      summary: null,
      searchKeyword: '',
      hintText: tab === 'partner' ? '请选择合作单位后点击查询' : '请选择工人后点击查询',
      emptyText: '该条件下暂无对账单据',
      canQuery: tab === 'partner' ? !!this.data.partnerId : !!this.data.workerId
    });
    this._cardsRaw = [];
    this._partnerRows = [];
    this._settlementRows = [];
    this._psiRecords = [];
    this._prodRecords = [];
    this._openingBalance = 0;
  },

  onViewModeTap(e) {
    const mode = e.currentTarget.dataset.mode;
    if (!mode || mode === this.data.viewMode) return;
    this.setData({ viewMode: mode });
    if (this.data.hasQueried) this.renderResultCards(this.data.searchKeyword);
  },

  onDateFromChange(e) {
    this.setData({ dateFrom: e.detail.value || '' });
  },

  onDateToChange(e) {
    this.setData({ dateTo: e.detail.value || '' });
  },

  onPartnerChange(e) {
    const detail = e.detail || {};
    this.setData({
      partnerId: detail.id || '',
      partnerName: detail.name || ''
    });
    this.syncCanQuery();
  },

  onWorkerChange(e) {
    const detail = e.detail || {};
    this.setData({
      workerId: detail.id || detail.workerId || '',
      workerName: detail.name || detail.workerName || ''
    });
    this.syncCanQuery();
  },

  onSearchInput(e) {
    const searchKeyword = e.detail.value || '';
    this.setData({ searchKeyword });
    this.renderResultCards(searchKeyword);
  },

  onSearchClear() {
    this.setData({ searchKeyword: '' });
    this.renderResultCards('');
  },

  renderResultCards(keyword) {
    if (!this.data.hasQueried) return;
    const q = keyword != null ? keyword : this.data.searchKeyword;
    const viewMode = this.data.viewMode;
    const openingBalance = this._openingBalance || 0;

    if (this.data.subTab === 'partner') {
      if (viewMode === 'product') {
        const allProductRows = buildPartnerProductLineReconList({
          documentRows: this._partnerRows || [],
          psiRecords: this._psiRecords || [],
          prodRecords: this._prodRecords || [],
          productMap: this._productMap,
          partnerName: this.data.partnerName,
          partnerId: this.data.partnerId,
          partnerOpeningBalance: openingBalance
        });
        const filtered = filterPartnerProductReconList(allProductRows, q);
        const cards = filtered.map((row, i) => mapProductLineCard(row, i, { partyMode: 'partner' }));
        this._cardsRaw = cards;
        this.setData({
          cards,
          emptyText:
          allProductRows.length > 0 && cards.length === 0 ?
          '无匹配项，请调整搜索关键词' :
          '该条件下暂无对账单据'
        });
        return;
      }

      const filtered = filterPartnerReconList(this._partnerRows || [], q);
      const allBalanced = buildPartnerReconBalances(this._partnerRows || [], openingBalance);
      const filteredSet = new Set(filtered);
      const cards = allBalanced.
      filter((b) => filteredSet.has(b.row)).
      map((b, i) => mapPartnerBalancedCard(b, i));
      this._cardsRaw = cards;
      this.setData({
        cards,
        emptyText:
        (this._partnerRows || []).length > 0 && cards.length === 0 ?
        '无匹配项，请调整搜索关键词' :
        '该条件下暂无对账单据'
      });
      return;
    }

    if (viewMode === 'product') {
      const allProductRows = buildSettlementProductLineReconList({
        documentRows: this._settlementRows || [],
        productMap: this._productMap,
        workerName: this.data.workerName,
        openingBalance
      });
      const filtered = filterSettlementProductReconList(allProductRows, q);
      const cards = filtered.map((row, i) => mapProductLineCard(row, i, { partyMode: 'worker' }));
      this._cardsRaw = cards;
      this.setData({
        cards,
        emptyText:
        allProductRows.length > 0 && cards.length === 0 ?
        '无匹配项，请调整搜索关键词' :
        '该条件下暂无对账单据'
      });
      return;
    }

    const filtered = filterSettlementReconList(this._settlementRows || [], q, this._workerMap);
    const allBalanced = buildSettlementReconBalances(this._settlementRows || [], openingBalance);
    const filteredSet = new Set(filtered);
    const cards = allBalanced.
    filter((b) => filteredSet.has(b.row)).
    map((b, i) => mapSettlementBalancedCard(b, i, this._workerMap));
    this._cardsRaw = cards;
    this.setData({
      cards,
      emptyText:
      (this._settlementRows || []).length > 0 && cards.length === 0 ?
      '无匹配项，请调整搜索关键词' :
      '该条件下暂无对账单据'
    });
  },

  onQueryTap() {
    if (!this.computeCanQuery()) {
      wx.showToast({
        title: this.data.subTab === 'partner' ? '请选择合作单位' : '请选择工人',
        icon: 'none'
      });
      return;
    }
    if (this.data.subTab === 'partner') this.runPartnerQuery();else
    this.runSettlementQuery();
  },

  async runPartnerQuery() {
    const token = ++this._queryToken;
    const _this$data = this.data,partnerId = _this$data.partnerId,partnerName = _this$data.partnerName,dateFrom = _this$data.dateFrom,dateTo = _this$data.dateTo;
    const dateQs = dateRangeToQuery(dateFrom, dateTo);
    this.setData({ loading: true, hasQueried: true, searchKeyword: '', summary: null, cards: [] });

    try {
      const _await$Promise$all2 = await Promise.all([
        fetchAllPsiRecords({ partnerId }).catch(() => []),
        fetchAllFinanceRecords({ partner: partnerName, ...dateQs }).catch(() => []),
        fetchProductionRecords({
          partner: partnerName,
          type: 'OUTSOURCE',
          status: '已收回',
          all: 'true',
          ...dateQs
        }).catch(() => []),
        dateFrom ?
        partnerOpeningBalance({
          partnerName,
          partnerId,
          before: dateToEndExclusiveIso(dateFrom)
        }) :
        Promise.resolve({ previousBalance: 0 })]
        ),psiRecords = _await$Promise$all2[0],financeRecords = _await$Promise$all2[1],prodRecords = _await$Promise$all2[2],openingResp = _await$Promise$all2[3];

      if (token !== this._queryToken) return;

      const openingBalance = Number(openingResp && openingResp.previousBalance) || 0;
      const rows = buildPartnerReconList({
        partnerId,
        partnerName,
        dateFrom,
        dateTo,
        psiRecords,
        prodRecords,
        financeRecords
      });
      const summary = mapSummaryView(summarizePartnerReconBalances(rows, openingBalance));

      this._partnerRows = rows;
      this._settlementRows = [];
      this._psiRecords = psiRecords;
      this._prodRecords = prodRecords;
      this._openingBalance = openingBalance;

      this.setData({ loading: false, summary, emptyText: '该条件下暂无对账单据' });
      this.renderResultCards('');
    } catch (e) {
      if (token !== this._queryToken) return;
      console.error('[finance-reconciliation] partner query', e);
      this.setData({ loading: false, cards: [], summary: null });
      wx.showToast({ title: e && e.message || '查询失败', icon: 'none' });
    }
  },

  async runSettlementQuery() {
    const token = ++this._queryToken;
    const _this$data2 = this.data,workerId = _this$data2.workerId,workerName = _this$data2.workerName,dateFrom = _this$data2.dateFrom,dateTo = _this$data2.dateTo;
    const dateQs = dateRangeToQuery(dateFrom, dateTo);
    const nodes = this._processNodes || this.data.processNodes || [];
    this.setData({ loading: true, hasQueried: true, searchKeyword: '', summary: null, cards: [] });

    try {
      const historyPeriodP = listReportHistory({
        ...dateQs,
        productionLinkMode: 'product'
      }).catch(() => ({ orderReports: [], productReports: [] }));

      const historyOpeningP = dateFrom ?
      listReportHistory({
        endDate: dateToEndExclusiveIso(dateFrom),
        productionLinkMode: 'product'
      }).catch(() => ({ orderReports: [], productReports: [] })) :
      Promise.resolve({ orderReports: [], productReports: [] });

      const financePeriodP = fetchAllFinanceRecords({ workerId, ...dateQs }).catch(() => []);
      const financeOpeningP = dateFrom ?
      fetchAllFinanceRecords({
        workerId,
        endDate: dateToEndExclusiveIso(dateFrom)
      }).catch(() => []) :
      Promise.resolve([]);

      const prodPeriodP = fetchProductionRecords({
        workerId,
        type: 'REWORK_REPORT',
        all: 'true',
        ...dateQs
      }).catch(() => []);
      const prodOpeningP = dateFrom ?
      fetchProductionRecords({
        workerId,
        type: 'REWORK_REPORT',
        all: 'true',
        endDate: dateToEndExclusiveIso(dateFrom)
      }).catch(() => []) :
      Promise.resolve([]);

      const _await$Promise$all3 =
        await Promise.all([
        historyPeriodP,
        historyOpeningP,
        financePeriodP,
        financeOpeningP,
        prodPeriodP,
        prodOpeningP]
        ),historyPeriod = _await$Promise$all3[0],historyOpening = _await$Promise$all3[1],financePeriod = _await$Promise$all3[2],financeOpening = _await$Promise$all3[3],prodPeriod = _await$Promise$all3[4],prodOpening = _await$Promise$all3[5];

      if (token !== this._queryToken) return;

      const orderReports = historyPeriod && historyPeriod.orderReports || [];
      const productReports = attachMilestoneNames(
        historyPeriod && historyPeriod.productReports || [],
        nodes
      );
      const openingOrderReports = historyOpening && historyOpening.orderReports || [];
      const openingProductReports = attachMilestoneNames(
        historyOpening && historyOpening.productReports || [],
        nodes
      );

      const listInput = {
        workerId,
        workerName,
        dateFrom,
        dateTo,
        orderReports,
        productReports,
        workerProdRecords: prodPeriod,
        workerFinanceRecords: financePeriod,
        openingOrderReports,
        openingProductReports,
        openingWorkerProdRecords: prodOpening,
        openingWorkerFinanceRecords: financeOpening
      };

      const openingBalance = computeSettlementOpeningBalance(listInput);
      const rows = buildSettlementReconList(listInput);
      const summary = mapSummaryView(summarizeSettlementReconBalances(rows, openingBalance));

      this._partnerRows = [];
      this._settlementRows = rows;
      this._psiRecords = [];
      this._prodRecords = [];
      this._openingBalance = openingBalance;

      this.setData({ loading: false, summary, emptyText: '该条件下暂无对账单据' });
      this.renderResultCards('');
    } catch (e) {
      if (token !== this._queryToken) return;
      console.error('[finance-reconciliation] settlement query', e);
      this.setData({ loading: false, cards: [], summary: null });
      wx.showToast({ title: e && e.message || '查询失败', icon: 'none' });
    }
  },

  onCardTap(e) {
    const index = Number(e.currentTarget.dataset.index);
    const card = (this._cardsRaw || this.data.cards || [])[index];
    if (!card || !card.canNavigate) return;

    if (card.navType === 'receipt' && card.navId) {
      wx.navigateTo({
        url: `/packageFinance/finance-receipt-detail/finance-receipt-detail?id=${encodeURIComponent(card.navId)}`
      });
      return;
    }
    if (card.navType === 'payment' && card.navId) {
      wx.navigateTo({
        url: `/packageFinance/finance-payment-detail/finance-payment-detail?id=${encodeURIComponent(card.navId)}`
      });
      return;
    }
    if (card.navType === 'purchase_bill' && card.navDocNo) {
      wx.navigateTo({
        url: `/packagePsi/psi-purchase-bill-detail/psi-purchase-bill-detail?docNumber=${encodeURIComponent(card.navDocNo)}`
      });
      return;
    }
    if (card.navType === 'sales_bill' && card.navDocNo) {
      wx.navigateTo({
        url: `/packagePsi/psi-sales-bill-detail/psi-sales-bill-detail?docNumber=${encodeURIComponent(card.navDocNo)}`
      });
      return;
    }
    if (card.navType === 'outsource' && card.navDocNo) {
      wx.navigateTo({
        url: `/packageBusiness/production-outsource-flow-detail/production-outsource-flow-detail?docNo=${encodeURIComponent(card.navDocNo)}`
      });
      return;
    }
    if (card.navType === 'rework_report' && card.navDocNo) {
      wx.navigateTo({
        url: `/packageBusiness/production-rework-report-flow-detail/production-rework-report-flow-detail?docNo=${encodeURIComponent(card.navDocNo)}`
      });
      return;
    }
    if (card.navType === 'work_report' && card.workDetail) {
      try {
        wx.setStorageSync(WORK_DETAIL_STORAGE_KEY, card.workDetail);
      } catch (err) {
        console.error('[finance-reconciliation] cache work detail', err);
      }
      wx.navigateTo({ url: '/packageFinance/finance-recon-work-detail/finance-recon-work-detail' });
    }
  }
});