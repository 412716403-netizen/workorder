const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission,hasPrefixPermission = _require2.hasPrefixPermission;
const _require3 = require('../config/productionOrders.js'),OrderDispatchStatus = _require3.OrderDispatchStatus;
const _require4 =






  require('../utils/productionOrders.js'),mapOrderDetailView = _require4.mapOrderDetailView,buildOrderDispatchConfirmMessage = _require4.buildOrderDispatchConfirmMessage,buildOrderReportSummaryRows = _require4.buildOrderReportSummaryRows,getProductUnitName = _require4.getProductUnitName,normalizeMasterList = _require4.normalizeMasterList,formatOrderDate = _require4.formatOrderDate;
const {
  buildOrderProcessChips,
  buildOutOfSequenceTemplateIds,
} = require('../utils/orderProcessChips.js');
const { buildDefectiveReworkByOrderMilestone } = require('../utils/outsourceDispatchMatrix.js');
const _require5 = require('../../utils/orderReportHistory.js'),buildReportHistoryDateRangeForOrder = _require5.buildReportHistoryDateRangeForOrder;
const _require6 = require('../utils/pendingStockComputeLite.js'),stockInAggregatesForOrder = _require6.stockInAggregatesForOrder;
const _require7 =












  require('../../utils/orderApi.js'),getOrder = _require7.getOrder,updateOrder = _require7.updateOrder,updateOrderDispatchStatus = _require7.updateOrderDispatchStatus,fetchTenantConfig = _require7.fetchTenantConfig,fetchProductsAll = _require7.fetchProductsAll,fetchCategoriesAll = _require7.fetchCategoriesAll,fetchProductionRecords = _require7.fetchProductionRecords,fetchBomsAll = _require7.fetchBomsAll,fetchNodesAll = _require7.fetchNodesAll,listProductProgressAll = _require7.listProductProgressAll,getPlan = _require7.getPlan,listOrdersPaginated = _require7.listOrdersPaginated;
const _require8 =



  require('../utils/orderDetailExtras.js'),buildOrderFamilyIds = _require8.buildOrderFamilyIds,buildOrderDetailMaterialRows = _require8.buildOrderDetailMaterialRows,buildOrderDetailOutsourceCards = _require8.buildOrderDetailOutsourceCards;
const _require9 = require('../utils/materialStockPanel.js'),buildMaterialIndexes = _require9.buildMaterialIndexes;
const _require0 = require('../../utils/planApi.js'),fetchDictionaries = _require0.fetchDictionaries;
const _require1 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require1.readNavBarMetrics,readWindowMetrics = _require1.readWindowMetrics;
const {
  fetchAllOrdersByProductId,
  fetchOrdersForProductMaterialFamily,
} = require('../utils/productReportHints.js');
const { loadFeaturePlugins, isPluginEnabled } = require('../../utils/featurePlugins.js');
const { openTodoEdit } = require('../utils/todosApi.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const tailPx = Math.ceil(win.windowWidth / 750 * 16);
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
    startDate: formatOrderDate(order.startDate) || ''
  };
}

function buildSummaryStats(order, product, dictionaries, prodRecords) {
  const unitName = getProductUnitName(product, dictionaries);
  const totalQty = (order.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  const _stockInAggregatesFor = stockInAggregatesForOrder(order, prodRecords),alreadyIn = _stockInAggregatesFor.alreadyIn;
  const milestones = order.milestones || [];
  const completed = milestones.length ?
  Number(milestones[milestones.length - 1].completedQuantity) || 0 :
  0;
  const pendingTotal = Math.max(0, completed - alreadyIn);
  return {
    unitName,
    totalText: `${totalQty} ${unitName}`,
    stockInText: `${alreadyIn} ${unitName}`,
    pendingText: `${pendingTotal} ${unitName}`,
    showPending: pendingTotal > 0
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
    processChips: [],
    showProcessChips: false,
    canReport: false,
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
    showTodoBtn: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this._nav = nav;
    this._loadSeq = 0;
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav)
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
      return;
    }
    loadFeaturePlugins().then((plugins) => {
      this.setData({ showTodoBtn: isPluginEnabled(plugins, 'todo_reminder') });
    });
  },

  updateScrollHeight(editing) {
    const nav = this._nav || readNavBarMetrics();
    this.setData({ scrollHeight: computeScrollHeight(nav, editing) });
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onAddTodoTap() {
    if (!this.data.showTodoBtn || !this._order) return;
    const order = this._order;
    const productName =
      (this.data.productHero && this.data.productHero.productName) ||
      order.productName ||
      '';
    openTodoEdit({
      seed: {
        sourceType: 'production_order',
        sourceId: order.id,
        sourceDocNo: '工单中心',
        sourceTitle: `${order.orderNumber || ''}${productName ? ` · ${productName}` : ''}`,
        href: `/production?tab=orders&orderId=${order.id}`,
      },
    });
  },

  onEditTap() {
    if (!this.data.canEdit || !this._order) return;
    this.setData({
      editing: true,
      editForm: buildEditForm(this._order)
    });
    this.updateScrollHeight(true);
  },

  onEditCancel() {
    this.setData({ editing: false });
    this.updateScrollHeight(false);
  },

  onEditFieldInput(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    this.setData({ [`editForm.${field}`]: e.detail.value || '' });
  },

  onEditDateChange(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    this.setData({ [`editForm.${field}`]: e.detail.value || '' });
  },

  async onEditSave() {
    if (!this._order) return;
    const editForm = this.data.editForm;
    wx.showLoading({ title: '保存中' });
    try {
      await updateOrder(this._orderId, {
        customer: editForm.customer,
        dueDate: editForm.dueDate || null,
        startDate: editForm.startDate || null
      });
      wx.showToast({ title: '已保存', icon: 'success' });
      this.setData({ editing: false });
      this.updateScrollHeight(false);
      await this.loadDetail();
    } catch (err) {
      wx.showToast({ title: err && err.message || '保存失败', icon: 'none' });
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
    const next = current === OrderDispatchStatus.COMPLETED ?
    OrderDispatchStatus.IN_PROGRESS :
    OrderDispatchStatus.COMPLETED;
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
          wx.showToast({ title: err && err.message || '更新失败', icon: 'none' });
        }
      }
    });
  },

  onReportHistoryTap() {
    const id = encodeURIComponent(this._orderId);
    const range = buildReportHistoryDateRangeForOrder(this._order || {});
    const dateFrom = encodeURIComponent(range.start);
    const dateTo = encodeURIComponent(range.end);
    wx.navigateTo({
      url: `/packageBusiness/production-order-report-history/production-order-report-history?orderId=${id}&dateFrom=${dateFrom}&dateTo=${dateTo}`
    });
  },

  onPendingStockTap() {
    if (!this.data.canViewPendingStock || !this._orderId) return;
    wx.navigateTo({
      url: `/packageBusiness/production-order-stock-in-confirm/production-order-stock-in-confirm?mode=single&rowKeys=${encodeURIComponent(this._orderId)}`
    });
  },

  onPlanLinkTap(e) {
    const planId = e.currentTarget.dataset.planId;
    if (!planId) return;
    wx.navigateTo({
      url: `/packageBusiness/production-plan-detail/production-plan-detail?id=${encodeURIComponent(planId)}`
    });
  },

  onChildOrderTap(e) {
    const orderId = e.currentTarget.dataset.orderId;
    if (!orderId || orderId === this._orderId) return;
    wx.navigateTo({
      url: `/packageBusiness/production-order-detail/production-order-detail?id=${encodeURIComponent(orderId)}`
    });
  },

  onOutsourceChipTap(e) {
    this.navigateOutsourceFromChip(e.currentTarget.dataset);
  },

  onOutsourceDetailTap(e) {
    this.navigateOutsourceFromChip(e.currentTarget.dataset);
  },

  navigateOutsourceFromChip(d) {
    const _ref =







      d || {},orderId = _ref.orderId,productId = _ref.productId,nodeId = _ref.nodeId,nodeName = _ref.nodeName,partner = _ref.partner,productName = _ref.productName,orderNumber = _ref.orderNumber;
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
      `orderNumber=${encodeURIComponent(orderNumber || '')}`];

      if (orderId) q.push(`orderId=${encodeURIComponent(orderId)}`);
      wx.navigateTo({
        url: `/packageBusiness/production-outsource-partner-detail/production-outsource-partner-detail?${q.join('&')}`
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
    `milestoneNodeId=${encodeURIComponent(nodeId || '')}`];

    wx.navigateTo({
      url: `/packageBusiness/production-outsource-flow/production-outsource-flow?${q.join('&')}`
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
    const canReport = hasPermission(perms, 'production:orders_report_records:create');
    const canViewReportHistory = hasPermission(perms, 'production:orders_report_records:view');
    const canViewPendingStock = hasPrefixPermission(perms, 'production:orders_pending_stock_in');
    const canViewOutsourceFlow = hasPermission(perms, 'production:outsource_records:view');
    const canViewOutsourcePartnerDetail = hasPermission(perms, 'production:outsource_list:allow');

    this.setData({
      canEdit,
      canReport,
      canViewReportHistory,
      canViewPendingStock,
      canViewOutsourceFlow,
      canViewOutsourcePartnerDetail,
      loading: true
    });

    try {
      const _await$Promise$all = await Promise.all([
        getOrder(this._orderId),
        fetchTenantConfig(),
        fetchDictionaries()]
        ),order = _await$Promise$all[0],config = _await$Promise$all[1],dictionariesRaw = _await$Promise$all[2];
      if (seq !== this._loadSeq) return;
      if (!order || !order.id) throw new Error('工单不存在');

      this._order = order;
      this._productionLinkMode = config && config.productionLinkMode || 'order';
      this._processSequenceMode = config && config.processSequenceMode || 'sequential';
      const planFormSettings = config && config.planFormSettings || {};
      const showDeliveryDate = (planFormSettings.listDisplay || {}).showDeliveryDate !== false;
      const dictionaries = dictionariesRaw || { colors: [], sizes: [], units: [] };

      this.setData({ title: order.orderNumber || '工单详情' });

      const _await$Promise$all2 = await Promise.all([
        fetchProductsAll(),
        fetchCategoriesAll(),
        order.planOrderId ? getPlan(order.planOrderId) : Promise.resolve(null),
        fetchProductionRecords({
          types: 'STOCK_IN,SCRAP,REWORK,REWORK_REPORT',
          orderIds: this._orderId,
          all: 'true',
        }),
        order.productId
          ? (this._productionLinkMode === 'product'
            ? fetchOrdersForProductMaterialFamily(listOrdersPaginated, order.productId)
            : fetchAllOrdersByProductId(listOrdersPaginated, order.productId))
          : Promise.resolve([order]),
        fetchBomsAll(),
        fetchNodesAll(),
        this._productionLinkMode === 'product' ? listProductProgressAll() : Promise.resolve([])]
        ),productsRaw = _await$Promise$all2[0],categoriesRaw = _await$Promise$all2[1],plan = _await$Promise$all2[2],prodRecordsRaw = _await$Promise$all2[3],relatedOrders = _await$Promise$all2[4],bomsRaw = _await$Promise$all2[5],nodesRaw = _await$Promise$all2[6],pmpRaw = _await$Promise$all2[7];
      if (seq !== this._loadSeq) return;

      const orders = relatedOrders && relatedOrders.length ? relatedOrders : [order];
      const familyOrderIds = buildOrderFamilyIds(order, orders, buildMaterialIndexes(productsRaw, bomsRaw, orders));
      const stockRecordsRaw = await fetchProductionRecords({
        types: 'STOCK_OUT,STOCK_RETURN',
        all: 'true',
        orderIds: familyOrderIds.join(','),
        ...(this._productionLinkMode === 'product' && order.productId ?
        { sourceProductIds: order.productId } :
        {})
      });
      const outsourceRecordsRaw = await fetchProductionRecords({
        types: 'OUTSOURCE',
        all: 'true',
        orderIds: this._orderId
      });
      if (seq !== this._loadSeq) return;

      const products = normalizeMasterList(productsRaw);
      const categories = normalizeMasterList(categoriesRaw);
      const nodes = normalizeMasterList(nodesRaw);
      const boms = normalizeMasterList(bomsRaw);
      const productMilestoneProgresses = Array.isArray(pmpRaw) ? pmpRaw : [];
      const product = products.find((p) => p.id === order.productId) || null;
      const category = product ? categories.find((c) => c.id === product.categoryId) : null;
      const prodRecords = Array.isArray(prodRecordsRaw) ?
      prodRecordsRaw :
      prodRecordsRaw && prodRecordsRaw.data || [];
      const stockRecords = Array.isArray(stockRecordsRaw) ?
      stockRecordsRaw :
      stockRecordsRaw && stockRecordsRaw.data || [];
      const outsourceRecords = Array.isArray(outsourceRecordsRaw) ?
      outsourceRecordsRaw :
      outsourceRecordsRaw && outsourceRecordsRaw.data || [];
      const outsourceFormSettings = config && config.outsourceFormSettings || {};

      const unitName = getProductUnitName(product, dictionaries);
      const reportSummaryRows = buildOrderReportSummaryRows(order, prodRecords, unitName);
      const summaryStats = buildSummaryStats(order, product, dictionaries, prodRecords);

      const _buildOrderDetailMate = buildOrderDetailMaterialRows({
          order,
          orders,
          products,
          boms,
          nodes,
          stockRecords,
          productMilestoneProgresses,
          productionLinkMode: this._productionLinkMode
        }),materialRows = _buildOrderDetailMate.rows,materialEmptyText = _buildOrderDetailMate.emptyText;
      const outsourceCards = buildOrderDetailOutsourceCards({
        order,
        records: outsourceRecords,
        hideZeroPendingPartnerOnList: outsourceFormSettings.hideZeroPendingPartnerOnList === true,
        productName: product && product.name || order.productName || '',
        orderNumber: order.orderNumber || '',
        productionLinkMode: this._productionLinkMode
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
        processRows: []
      });

      // 基础信息与工单明细保留；工序进度改用 chips 区展示（对齐列表 / Web strip）
      const sections = view.sections.filter((s) => s.kind !== 'hint' && s.id !== 'process');

      const outOfSequenceIds = buildOutOfSequenceTemplateIds(nodes);
      const drMap = buildDefectiveReworkByOrderMilestone([order], prodRecords);
      const getDefectiveRework = (orderId, templateId) =>
        drMap.get(`${orderId}|${templateId}`) || {
          defective: 0,
          rework: 0,
          reworkByVariant: {},
        };
      const processChips =
        this._productionLinkMode === 'order'
          ? buildOrderProcessChips(order, {
              processSequenceMode: this._processSequenceMode || 'sequential',
              outOfSequenceTemplateIds: outOfSequenceIds,
              canReport,
              getDefectiveRework,
            })
          : [];

      this.setData({
        loading: false,
        title: order.orderNumber || '工单详情',
        orderNumber: order.orderNumber || '',
        productHero: view.productHero,
        summaryStats,
        sections,
        processChips,
        showProcessChips: processChips.length > 0,
        reportSummaryRows,
        showReportSummary: reportSummaryRows.length > 0,
        showMaterialSection: true,
        materialRows,
        materialEmptyText,
        showMaterialHint: this._productionLinkMode === 'product',
        showOutsourceSection: outsourceCards.length > 0,
        outsourceCards,
        showPartnerFlowDetailOnList: outsourceFormSettings.showPartnerFlowDetailOnList === true
      });
      this.updateScrollHeight(this.data.editing);
    } catch (err) {
      if (seq !== this._loadSeq) return;
      this.setData({
        loading: false,
        sections: [],
        productHero: null,
        summaryStats: null,
        processChips: [],
        showProcessChips: false,
        reportSummaryRows: [],
        showReportSummary: false,
        showMaterialSection: false,
        materialRows: [],
        showOutsourceSection: false,
        outsourceCards: []
      });
      wx.showToast({ title: err && err.message || '加载失败', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1000);
    }
  },

  onProcessChipTap(e) {
    if (!this.data.canReport) {
      wx.showToast({ title: '暂无报工权限', icon: 'none' });
      return;
    }
    const detail = e.detail || {};
    const orderId = detail.orderId || this._orderId;
    const milestoneId = detail.milestoneId;
    if (!orderId || !milestoneId) return;
    wx.navigateTo({
      url: `/packageBusiness/production-order-report/production-order-report?orderId=${encodeURIComponent(orderId)}&milestoneId=${encodeURIComponent(milestoneId)}`
    });
  },
});