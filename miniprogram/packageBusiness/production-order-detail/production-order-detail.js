const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission, hasPrefixPermission } = require('../../utils/permissions.js');
const { OrderDispatchStatus } = require('../config/productionOrders.js');
const {
  mapOrderDetailView,
  buildOrderDispatchConfirmMessage,
  buildOrderReportSummaryRows,
  getProductUnitName,
  normalizeMasterList,
  formatOrderDate,
} = require('../utils/productionOrders.js');
const { buildReportHistoryDateRangeForOrder } = require('../utils/orderReportHistory.js');
const { stockInAggregatesForOrder } = require('../utils/pendingStockComputeLite.js');
const {
  getOrder,
  updateOrder,
  updateOrderDispatchStatus,
  fetchTenantConfig,
  fetchProductsAll,
  fetchCategoriesAll,
  fetchProductionRecords,
  fetchBomsAll,
  fetchNodesAll,
  listProductProgressAll,
  getPlan,
  listOrdersPaginated,
} = require('../utils/orderApi.js');
const {
  buildOrderFamilyIds,
  buildOrderDetailMaterialRows,
  buildOrderDetailOutsourceCards,
} = require('../utils/orderDetailExtras.js');
const { buildMaterialIndexes } = require('../utils/materialStockPanel.js');
const { fetchDictionaries } = require('../utils/planApi.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');

async function fetchOrdersByProductId(productId) {
  const pageSize = 200;
  let page = 1;
  let total = Infinity;
  const all = [];
  while (all.length < total) {
    const result = await listOrdersPaginated({ page, pageSize, productId });
    const batch = result.data || [];
    all.push(...batch);
    total = typeof result.total === 'number' ? result.total : all.length;
    if (!batch.length || batch.length < pageSize) break;
    page += 1;
    if (page > 40) break;
  }
  return all;
}

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const tailPx = Math.ceil((win.windowWidth / 750) * 16);
  return nav.statusBarHeight + nav.navBarHeight + tailPx;
}

function computeScrollHeight(nav, hasFooter) {
  const win = readWindowMetrics();
  const rpx = win.windowWidth / 750;
  const footerPx = hasFooter ? Math.ceil(120 * rpx) + (win.safeAreaBottom || 0) : 0;
  const headerPx = computeHeaderBlockHeight(nav);
  return Math.max(200, (win.windowHeight || 667) - headerPx - footerPx);
}

function buildEditForm(order) {
  return {
    customer: order.customer || '',
    dueDate: formatOrderDate(order.dueDate) || '',
    startDate: formatOrderDate(order.startDate) || '',
  };
}

function buildSummaryStats(order, product, dictionaries, prodRecords) {
  const unitName = getProductUnitName(product, dictionaries);
  const totalQty = (order.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  const { alreadyIn } = stockInAggregatesForOrder(order, prodRecords);
  const milestones = order.milestones || [];
  const completed = milestones.length
    ? Number(milestones[milestones.length - 1].completedQuantity) || 0
    : 0;
  const pendingTotal = Math.max(0, completed - alreadyIn);
  return {
    unitName,
    totalText: `${totalQty} ${unitName}`,
    stockInText: `${alreadyIn} ${unitName}`,
    pendingText: `${pendingTotal} ${unitName}`,
    showPending: pendingTotal > 0,
  };
}

Page({
  data: {
    loading: true,
    title: '工单详情',
    orderId: '',
    orderNumber: '',
    productHero: null,
    summaryStats: null,
    sections: [],
    reportSummaryRows: [],
    showReportSummary: false,
    showMaterialSection: false,
    materialRows: [],
    materialEmptyText: '',
    showMaterialHint: false,
    showOutsourceSection: false,
    outsourceCards: [],
    canViewOutsourceFlow: false,
    canViewOutsourcePartnerDetail: false,
    showPartnerFlowDetailOnList: false,
    editing: false,
    editForm: { customer: '', dueDate: '', startDate: '' },
    canEdit: false,
    canViewReportHistory: false,
    canViewPendingStock: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this._nav = nav;
    this._loadSeq = 0;
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
    });

    this._orderId = options.id ? decodeURIComponent(options.id) : '';
    if (!this._orderId) {
      wx.showToast({ title: '缺少工单 ID', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.setData({ orderId: this._orderId });
    this.loadDetail();
  },

  onShow() {
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
    }
  },

  updateScrollHeight(editing) {
    const nav = this._nav || readNavBarMetrics();
    this.setData({ scrollHeight: computeScrollHeight(nav, editing) });
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onEditTap() {
    if (!this.data.canEdit || !this._order) return;
    this.setData({
      editing: true,
      editForm: buildEditForm(this._order),
    });
    this.updateScrollHeight(true);
  },

  onEditCancel() {
    this.setData({ editing: false });
    this.updateScrollHeight(false);
  },

  onEditFieldInput(e) {
    const { field } = e.currentTarget.dataset;
    if (!field) return;
    this.setData({ [`editForm.${field}`]: e.detail.value || '' });
  },

  onEditDateChange(e) {
    const { field } = e.currentTarget.dataset;
    if (!field) return;
    this.setData({ [`editForm.${field}`]: e.detail.value || '' });
  },

  async onEditSave() {
    if (!this._order) return;
    const { editForm } = this.data;
    wx.showLoading({ title: '保存中' });
    try {
      await updateOrder(this._orderId, {
        customer: editForm.customer,
        dueDate: editForm.dueDate || null,
        startDate: editForm.startDate || null,
      });
      wx.showToast({ title: '已保存', icon: 'success' });
      this.setData({ editing: false });
      this.updateScrollHeight(false);
      await this.loadDetail();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onDispatchPillTap() {
    if (this._productionLinkMode !== 'order') return;
    if (!hasPermission((readTenantCtx() || {}).permissions || [], 'production:orders_detail:edit')) {
      wx.showToast({ title: '暂无编辑权限', icon: 'none' });
      return;
    }
    const order = this._order;
    if (!order) return;
    const current = order.dispatchStatus || OrderDispatchStatus.IN_PROGRESS;
    const next = current === OrderDispatchStatus.COMPLETED
      ? OrderDispatchStatus.IN_PROGRESS
      : OrderDispatchStatus.COMPLETED;
    wx.showModal({
      title: '切换完成状态',
      content: buildOrderDispatchConfirmMessage(order.orderNumber, current, next),
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await updateOrderDispatchStatus(order.id, next);
          wx.showToast({ title: '已更新', icon: 'success' });
          await this.loadDetail();
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '更新失败', icon: 'none' });
        }
      },
    });
  },

  onReportHistoryTap() {
    const id = encodeURIComponent(this._orderId);
    const range = buildReportHistoryDateRangeForOrder(this._order || {});
    const dateFrom = encodeURIComponent(range.start);
    const dateTo = encodeURIComponent(range.end);
    wx.navigateTo({
      url: `/packageBusiness/production-order-report-history/production-order-report-history?orderId=${id}&dateFrom=${dateFrom}&dateTo=${dateTo}`,
    });
  },

  onPendingStockTap() {
    if (!this.data.canViewPendingStock || !this._orderId) return;
    wx.navigateTo({
      url: `/packageBusiness/production-order-stock-in-confirm/production-order-stock-in-confirm?mode=single&rowKeys=${encodeURIComponent(this._orderId)}`,
    });
  },

  onPlanLinkTap(e) {
    const { planId } = e.currentTarget.dataset;
    if (!planId) return;
    wx.navigateTo({
      url: `/packageBusiness/production-plan-detail/production-plan-detail?id=${encodeURIComponent(planId)}`,
    });
  },

  onChildOrderTap(e) {
    const { orderId } = e.currentTarget.dataset;
    if (!orderId || orderId === this._orderId) return;
    wx.navigateTo({
      url: `/packageBusiness/production-order-detail/production-order-detail?id=${encodeURIComponent(orderId)}`,
    });
  },

  onOutsourceChipTap(e) {
    this.navigateOutsourceFromChip(e.currentTarget.dataset);
  },

  onOutsourceDetailTap(e) {
    this.navigateOutsourceFromChip(e.currentTarget.dataset);
  },

  navigateOutsourceFromChip(d) {
    const {
      orderId,
      productId,
      nodeId,
      nodeName,
      partner,
      productName,
      orderNumber,
    } = d || {};
    if (!partner || !nodeId) return;

    if (this.data.showPartnerFlowDetailOnList) {
      if (!this.data.canViewOutsourcePartnerDetail) {
        wx.showToast({ title: '无查看权限', icon: 'none' });
        return;
      }
      const q = [
        `productId=${encodeURIComponent(productId || '')}`,
        `nodeId=${encodeURIComponent(nodeId || '')}`,
        `partner=${encodeURIComponent(partner || '')}`,
        `nodeName=${encodeURIComponent(nodeName || '')}`,
        `productName=${encodeURIComponent(productName || '')}`,
        `orderNumber=${encodeURIComponent(orderNumber || '')}`,
      ];
      if (orderId) q.push(`orderId=${encodeURIComponent(orderId)}`);
      wx.navigateTo({
        url: `/packageBusiness/production-outsource-partner-detail/production-outsource-partner-detail?${q.join('&')}`,
      });
      return;
    }

    if (!this.data.canViewOutsourceFlow) {
      wx.showToast({ title: '无查看权限', icon: 'none' });
      return;
    }
    const q = [
      `orderKeyword=${encodeURIComponent(orderNumber || '')}`,
      `productKeyword=${encodeURIComponent(productName || '')}`,
      `partnerKeyword=${encodeURIComponent(partner || '')}`,
      `milestoneNodeId=${encodeURIComponent(nodeId || '')}`,
    ];
    wx.navigateTo({
      url: `/packageBusiness/production-outsource-flow/production-outsource-flow?${q.join('&')}`,
    });
  },

  async loadDetail() {
    const ctx = readTenantCtx();
    if (!ctx || !ctx.tenantId) {
      wx.reLaunch({ url: '/pages/tenant-select/tenant-select' });
      return;
    }

    const seq = (this._loadSeq || 0) + 1;
    this._loadSeq = seq;

    const perms = ctx.permissions || [];
    const canEdit = hasPermission(perms, 'production:orders_detail:edit');
    const canViewReportHistory = hasPermission(perms, 'production:orders_report_records:view');
    const canViewPendingStock = hasPrefixPermission(perms, 'production:orders_pending_stock_in');
    const canViewOutsourceFlow = hasPermission(perms, 'production:outsource_records:view');
    const canViewOutsourcePartnerDetail = hasPermission(perms, 'production:outsource_list:allow');

    this.setData({
      canEdit,
      canViewReportHistory,
      canViewPendingStock,
      canViewOutsourceFlow,
      canViewOutsourcePartnerDetail,
      loading: true,
    });

    try {
      const [order, config, dictionariesRaw] = await Promise.all([
        getOrder(this._orderId),
        fetchTenantConfig(),
        fetchDictionaries(),
      ]);
      if (seq !== this._loadSeq) return;
      if (!order || !order.id) throw new Error('工单不存在');

      this._order = order;
      this._productionLinkMode = (config && config.productionLinkMode) || 'order';
      const planFormSettings = (config && config.planFormSettings) || {};
      const showDeliveryDate = (planFormSettings.listDisplay || {}).showDeliveryDate !== false;
      const dictionaries = dictionariesRaw || { colors: [], sizes: [], units: [] };

      this.setData({ title: order.orderNumber || '工单详情' });

      const [productsRaw, categoriesRaw, plan, prodRecordsRaw, relatedOrders, bomsRaw, nodesRaw, pmpRaw] = await Promise.all([
        fetchProductsAll(),
        fetchCategoriesAll(),
        order.planOrderId ? getPlan(order.planOrderId) : Promise.resolve(null),
        fetchProductionRecords({
          types: 'STOCK_IN',
          orderIds: this._orderId,
        }),
        order.productId ? fetchOrdersByProductId(order.productId) : Promise.resolve([order]),
        fetchBomsAll(),
        fetchNodesAll(),
        this._productionLinkMode === 'product' ? listProductProgressAll() : Promise.resolve([]),
      ]);
      if (seq !== this._loadSeq) return;

      const orders = (relatedOrders && relatedOrders.length) ? relatedOrders : [order];
      const familyOrderIds = buildOrderFamilyIds(order, orders, buildMaterialIndexes(productsRaw, bomsRaw, orders));
      const stockRecordsRaw = await fetchProductionRecords({
        types: 'STOCK_OUT,STOCK_RETURN',
        orderIds: familyOrderIds.join(','),
        ...(this._productionLinkMode === 'product' && order.productId
          ? { sourceProductIds: order.productId }
          : {}),
      });
      const outsourceRecordsRaw = await fetchProductionRecords({
        types: 'OUTSOURCE',
        orderIds: this._orderId,
      });
      if (seq !== this._loadSeq) return;

      const products = normalizeMasterList(productsRaw);
      const categories = normalizeMasterList(categoriesRaw);
      const nodes = normalizeMasterList(nodesRaw);
      const boms = normalizeMasterList(bomsRaw);
      const productMilestoneProgresses = Array.isArray(pmpRaw) ? pmpRaw : [];
      const product = products.find((p) => p.id === order.productId) || null;
      const category = product ? categories.find((c) => c.id === product.categoryId) : null;
      const prodRecords = Array.isArray(prodRecordsRaw)
        ? prodRecordsRaw
        : (prodRecordsRaw && prodRecordsRaw.data) || [];
      const stockRecords = Array.isArray(stockRecordsRaw)
        ? stockRecordsRaw
        : (stockRecordsRaw && stockRecordsRaw.data) || [];
      const outsourceRecords = Array.isArray(outsourceRecordsRaw)
        ? outsourceRecordsRaw
        : (outsourceRecordsRaw && outsourceRecordsRaw.data) || [];
      const outsourceFormSettings = (config && config.outsourceFormSettings) || {};

      const unitName = getProductUnitName(product, dictionaries);
      const reportSummaryRows = buildOrderReportSummaryRows(order, prodRecords, unitName);
      const summaryStats = buildSummaryStats(order, product, dictionaries, prodRecords);

      const { rows: materialRows, emptyText: materialEmptyText } = buildOrderDetailMaterialRows({
        order,
        orders,
        products,
        boms,
        nodes,
        stockRecords,
        productMilestoneProgresses,
        productionLinkMode: this._productionLinkMode,
      });
      const outsourceCards = buildOrderDetailOutsourceCards({
        order,
        records: outsourceRecords,
        hideZeroPendingPartnerOnList: outsourceFormSettings.hideZeroPendingPartnerOnList === true,
        productName: (product && product.name) || order.productName || '',
        orderNumber: order.orderNumber || '',
        productionLinkMode: this._productionLinkMode,
      });

      const view = mapOrderDetailView(order, {
        product,
        category,
        dictionaries,
        plan,
        childOrders: order.childOrders || [],
        productionLinkMode: this._productionLinkMode,
        showDeliveryDate,
        canEdit,
        processRows: [],
      });

      const sections = view.sections.filter((s) => s.kind !== 'hint' && s.id !== 'process' && s.id !== 'basic');

      this.setData({
        loading: false,
        title: order.orderNumber || '工单详情',
        orderNumber: order.orderNumber || '',
        productHero: view.productHero,
        summaryStats,
        sections,
        reportSummaryRows,
        showReportSummary: reportSummaryRows.length > 0,
        showMaterialSection: true,
        materialRows,
        materialEmptyText,
        showMaterialHint: this._productionLinkMode === 'product',
        showOutsourceSection: outsourceCards.length > 0,
        outsourceCards,
        showPartnerFlowDetailOnList: outsourceFormSettings.showPartnerFlowDetailOnList === true,
      });
      this.updateScrollHeight(this.data.editing);
    } catch (err) {
      if (seq !== this._loadSeq) return;
      this.setData({
        loading: false,
        sections: [],
        productHero: null,
        summaryStats: null,
        reportSummaryRows: [],
        showReportSummary: false,
        showMaterialSection: false,
        materialRows: [],
        showOutsourceSection: false,
        outsourceCards: [],
      });
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1000);
    }
  },
});
