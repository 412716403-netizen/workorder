const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission, filterByPermission } = require('../../utils/permissions.js');
const { DEFAULT_PAGE_SIZE, ORDER_CENTER_SHORTCUTS } = require('../../config/productionOrders.js');
const {
  parseOrderSearch,
  buildOrderListBlocks,
  flattenBlockOrders,
  mapOrderListRow,
  normalizeMasterList,
  productNameSkuParts,
} = require('../../utils/productionOrders.js');
const { buildOrderProcessChips, buildOutOfSequenceTemplateIds } = require('../../utils/orderProcessChips.js');
const {
  listOrdersPaginated,
  fetchTenantConfig,
  fetchProductsAll,
  fetchCategoriesAll,
  fetchNodesAll,
  listReportHistory,
} = require('../../utils/orderApi.js');
const { mapProductCustomTags } = require('../../utils/reportCustomDocField.js');
const { buildScanSessionUrl } = require('../../utils/scanNav.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const { computePendingStockCount, loadPendingStockRows, fetchAllOrdersPaginated } = require('../../utils/pendingStockBadge.js');
const {
  localTodayYmd,
  filterOrdersForFlow,
  computeFlowStats,
  mapFlowRow,
} = require('../../utils/orderFlow.js');
const { ORDER_DISPATCH_STATUS_LABEL, OrderDispatchStatus } = require('../../config/productionOrders.js');
const {
  defaultDateRange,
  dateInputToIsoStart,
  dateInputToIsoEndExclusive,
} = require('../../utils/orderReportHistory.js');

function buildFilterShortcuts(permissions, pendingStockCount) {
  return filterByPermission(ORDER_CENTER_SHORTCUTS, permissions || []).map((item) => ({
    ...item,
    badgeText: item.showBadge && pendingStockCount > 0 ? `(${pendingStockCount})` : '',
  }));
}

function dispatchMetaForFlow(order) {
  const status = order.dispatchStatus || OrderDispatchStatus.IN_PROGRESS;
  const label = ORDER_DISPATCH_STATUS_LABEL[status] || status;
  const pillClass = status === OrderDispatchStatus.COMPLETED
    ? 'st-pill--success'
    : 'st-pill--primary';
  return { dispatchLabel: label, dispatchPillClass: pillClass };
}

function formatReportTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function mapOrderReportRowForEmbed(r, idx, showOrderNumber) {
  const qty = Number(r.quantity) || 0;
  const defective = Number(r.defectiveQuantity) || 0;
  const milestoneName = r.milestoneName || r.nodeName || '工序';
  const titleLine = showOrderNumber
    ? `${r.orderNumber || '—'} · ${milestoneName}`
    : milestoneName;
  const metaParts = [`良品 ${qty} 件`];
  if (defective > 0) metaParts.push(`不良 ${defective}`);
  if (r.productName) metaParts.unshift(r.productName);
  return {
    id: r.reportId || r.id || `order-${idx}`,
    titleLine,
    metaLine: metaParts.join(' · '),
    operatorLine: r.operator ? `操作人：${r.operator}` : '',
    timeLabel: formatReportTime(r.timestamp),
    timestampMs: new Date(r.timestamp || 0).getTime() || 0,
    goodQty: qty,
    defectiveQty: defective,
    _orderNumber: r.orderNumber || '',
    _productName: r.productName || '',
  };
}

function mapProductReportRowForEmbed(r, idx) {
  const qty = Number(r.quantity) || 0;
  const defective = Number(r.defectiveQuantity) || 0;
  const milestoneName = r.milestoneName || r.nodeName || '工序';
  return {
    id: r.reportId || r.id || `product-${idx}`,
    titleLine: `${r.productName || '产品'} · ${milestoneName}`,
    metaLine: [`良品 ${qty} 件`, defective > 0 ? `不良 ${defective}` : ''].filter(Boolean).join(' · '),
    operatorLine: r.operator ? `操作人：${r.operator}` : '',
    timeLabel: formatReportTime(r.timestamp),
    timestampMs: new Date(r.timestamp || 0).getTime() || 0,
    goodQty: qty,
    defectiveQty: defective,
    _orderNumber: r.orderNumber || '',
    _productName: r.productName || '',
  };
}

function mapPendingStockListRow(row, isProductMode) {
  return {
    rowKey: row.rowKey,
    orderId: row.orderId,
    titleLine: isProductMode ? (row.productName || row.orderNumber) : (row.orderNumber || ''),
    subtitleLine: isProductMode ? `涉及 ${row.productBlockOrderTotal || row.orderTotal} 件工单总量` : (row.productName || ''),
    orderTotal: row.orderTotal,
    alreadyIn: row.alreadyIn,
    pendingTotal: row.pendingTotal,
  };
}

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil((win.windowWidth / 750) * 128);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

function slimOrderListRow(row) {
  const productCustomTags = (row.productCustomTags || []).slice(0, 5).map((t) => ({
    id: t.id,
    label: t.label,
    display: String(t.display || '').slice(0, 48),
  }));
  return {
    rowKey: row.rowKey,
    id: row.id,
    navigateId: row.navigateId,
    orderNumber: row.orderNumber,
    productName: row.productName,
    productSku: row.productSku,
    showProductSku: row.showProductSku,
    productCustomTags,
    showProductCustomTags: productCustomTags.length > 0,
    productImageUrl: row.productImageUrl,
    showProductImage: row.showProductImage,
    placeholderIconSrc: row.placeholderIconSrc,
    customer: row.customer || '',
    showCustomer: !!row.showCustomer,
    quantityText: row.quantityText,
    showQuantity: row.showQuantity,
    dispatchLabel: row.dispatchLabel,
    dispatchPillClass: row.dispatchPillClass,
    dueDateLabel: row.dueDateLabel || '',
    showDueDate: row.showDueDate,
    processChips: row.processChips,
    showProcessChips: row.showProcessChips,
    reworkOrderId: row.reworkOrderId,
    productId: row.productId,
    depth: row.depth,
    blockType: row.blockType,
    productGroupLabel: row.productGroupLabel,
    showProductGroupLabel: row.showProductGroupLabel,
    expanded: row.expanded,
    hasChildren: row.hasChildren,
    blockKey: row.blockKey,
  };
}

Page({
  data: {
    loading: true,
    loadingMore: false,
    rows: [],
    searchKeyword: '',
    excludeCompleted: false,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: 0,
    hasMore: false,
    canReport: false,
    canViewDetail: false,
    canMaterial: false,
    canRework: false,
    emptyText: '暂无工单',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 120,
    showFilterPanel: false,
    filterActive: false,
    filterShortcuts: [],
    pendingStockCount: 0,
    // 面板内嵌功能：null | 'order-flow' | 'report-history' | 'pending-stock'
    activeShortcut: null,
    // 工单流水内嵌数据
    orderFlowLoading: false,
    orderFlowRows: [],
    orderFlowDateFrom: '',
    orderFlowDateTo: '',
    orderFlowOrderNumberKeyword: '',
    orderFlowProductNameKeyword: '',
    orderFlowStats: { count: 0, totalQty: 0 },
    // 报工流水内嵌数据
    reportHistoryLoading: false,
    reportHistoryRows: [],
    reportHistoryDateFrom: '',
    reportHistoryDateTo: '',
    reportHistoryOrderNumberKeyword: '',
    reportHistoryProductKeyword: '',
    reportHistoryStats: { batchCount: 0, goodTotal: 0, defectiveTotal: 0 },
    reportHistoryIsGlobal: true,
    // 待入库清单内嵌数据
    pendingStockListLoading: false,
    pendingStockListRows: [],
    pendingStockListIsProductMode: false,
  },

  _pendingExcludeCompleted: false,

  onLoad(options) {
    this._expandedBlocks = new Set();
    const nav = readNavBarMetrics();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
    });

    const orderId = options.orderId ? decodeURIComponent(options.orderId) : '';
    if (orderId) {
      wx.redirectTo({
        url: `/pages/production-order-detail/production-order-detail?id=${encodeURIComponent(orderId)}`,
      });
      return;
    }
    this._initialized = false;
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
    this._tenantCtx = ctx;
    const permissions = ctx.permissions || [];
    this.setData({
      canReport: hasPermission(permissions, 'production:orders_report_records:create'),
      canViewDetail: hasPermission(permissions, 'production:orders_detail:view'),
      canMaterial: hasPermission(permissions, 'production:orders_material:allow'),
      canRework: hasPermission(permissions, 'production:orders_rework:allow'),
      filterShortcuts: buildFilterShortcuts(permissions, this.data.pendingStockCount),
    });
    if (!this._initialized) {
      this.bootstrap();
    } else {
      this.reloadList();
      this.refreshPendingStockBadge();
    }
  },

  onPullDownRefresh() {
    this.reloadList().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return;
    this.loadPage(this.data.page + 1, true);
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onFilterTap() {
    if (this.data.showFilterPanel) {
      this.closeFilterPanel();
      return;
    }
    this.refreshPendingStockBadge();
    this.setData({ showFilterPanel: true });
  },

  closeFilterPanel() {
    if (!this.data.showFilterPanel) return;
    this.setData({ showFilterPanel: false });
  },

  onPageScroll() {
    this.closeFilterPanel();
  },

  onShortcutTap(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    // 使用字面量路径跳转到独立页面（依赖分析器只认字面量）
    this.setData({ showFilterPanel: false, activeShortcut: null });
    if (id === 'order-flow') {
      wx.navigateTo({ url: '/pages/production-order-flow/production-order-flow' });
      return;
    }
    if (id === 'report-history') {
      wx.navigateTo({ url: '/pages/production-order-report-history/production-order-report-history' });
      return;
    }
    if (id === 'pending-stock') {
      wx.navigateTo({ url: '/pages/production-order-pending-stock/production-order-pending-stock' });
    }
  },

  onBackToShortcuts() {
    this.setData({ activeShortcut: null });
  },

  async _fetchAllOrdersForEmbed() {
    return fetchAllOrdersPaginated({});
  },

  // ==================== 工单流水内嵌 ====================
  async loadOrderFlowData() {
    this._orderFlowLoaded = true;
    this.setData({ orderFlowLoading: true });
    try {
      const config = await fetchTenantConfig();
      const planFormSettings = (config && config.planFormSettings) || {};
      const planListDisplay = planFormSettings.listDisplay || {};
      this._orderFlowProductionLinkMode = (config && config.productionLinkMode) || 'order';
      this._orderFlowShowDueDate = planListDisplay.showDeliveryDate !== false;
      this._orderFlowShowDispatch = this._orderFlowProductionLinkMode !== 'product';

      const today = localTodayYmd();
      this.setData({
        orderFlowDateFrom: today,
        orderFlowDateTo: today,
      });

      const allOrders = await this._fetchAllOrdersForEmbed();
      this._orderFlowAllOrders = allOrders;
      this.applyOrderFlowFilters();
    } catch {
      this.setData({ orderFlowLoading: false, orderFlowRows: [], orderFlowStats: { count: 0, totalQty: 0 } });
    }
  },

  applyOrderFlowFilters() {
    const filtered = filterOrdersForFlow(this._orderFlowAllOrders || [], {
      dateFrom: this.data.orderFlowDateFrom,
      dateTo: this.data.orderFlowDateTo,
      orderNumberKeyword: this.data.orderFlowOrderNumberKeyword,
      productNameKeyword: this.data.orderFlowProductNameKeyword,
    });
    const stats = computeFlowStats(filtered);
    const rows = filtered.map((order) => {
      const meta = dispatchMetaForFlow(order);
      return mapFlowRow(order, {
        showDispatch: this._orderFlowShowDispatch,
        showDueDate: this._orderFlowShowDueDate,
        dispatchLabel: meta.dispatchLabel,
        dispatchPillClass: meta.dispatchPillClass,
      });
    });
    this.setData({
      orderFlowLoading: false,
      orderFlowRows: rows,
      orderFlowStats: stats,
    });
  },

  onOrderFlowDateFromChange(e) {
    this.setData({ orderFlowDateFrom: e.detail.value || '' });
    this.applyOrderFlowFilters();
  },

  onOrderFlowDateToChange(e) {
    this.setData({ orderFlowDateTo: e.detail.value || '' });
    this.applyOrderFlowFilters();
  },

  onOrderFlowOrderNumberInput(e) {
    this.setData({ orderFlowOrderNumberKeyword: e.detail.value || '' });
    clearTimeout(this._orderFlowFilterTimer);
    this._orderFlowFilterTimer = setTimeout(() => this.applyOrderFlowFilters(), 300);
  },

  onOrderFlowProductNameInput(e) {
    this.setData({ orderFlowProductNameKeyword: e.detail.value || '' });
    clearTimeout(this._orderFlowFilterTimer);
    this._orderFlowFilterTimer = setTimeout(() => this.applyOrderFlowFilters(), 300);
  },

  onOrderFlowRowTap(e) {
    this.closeFilterPanel();
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    wx.navigateTo({
      url: `/pages/production-order-detail/production-order-detail?id=${encodeURIComponent(id)}`,
    });
  },

  // ==================== 报工流水内嵌 ====================
  async loadReportHistoryData() {
    this._reportHistoryLoaded = true;
    this.setData({ reportHistoryLoading: true });
    try {
      const config = await fetchTenantConfig();
      this._reportHistoryProductionLinkMode = (config && config.productionLinkMode) || 'order';

      const today = localTodayYmd();
      this.setData({
        reportHistoryDateFrom: today,
        reportHistoryDateTo: today,
        reportHistoryIsGlobal: true,
      });

      await this.applyReportHistoryFilters();
    } catch {
      this.setData({ reportHistoryLoading: false, reportHistoryRows: [], reportHistoryStats: { batchCount: 0, goodTotal: 0, defectiveTotal: 0 } });
    }
  },

  async applyReportHistoryFilters() {
    this.setData({ reportHistoryLoading: true });
    try {
      const params = {
        startDate: dateInputToIsoStart(this.data.reportHistoryDateFrom),
        endDate: dateInputToIsoEndExclusive(this.data.reportHistoryDateTo),
        productionLinkMode: this._reportHistoryProductionLinkMode,
      };

      const res = await listReportHistory(params);
      const orderReports = (res && res.orderReports) || [];
      const productReports = (res && res.productReports) || [];

      let mapped = orderReports.map((r, idx) => mapOrderReportRowForEmbed(r, idx, true));
      if (this._reportHistoryProductionLinkMode === 'product') {
        const productMapped = productReports.map((r, idx) => mapProductReportRowForEmbed(r, idx));
        mapped = mapped.concat(productMapped);
      }

      mapped.sort((a, b) => b.timestampMs - a.timestampMs);
      this._reportHistoryRawRows = mapped;
      this.applyReportHistoryClientFilters();
    } catch {
      this.setData({ reportHistoryLoading: false, reportHistoryRows: [], reportHistoryStats: { batchCount: 0, goodTotal: 0, defectiveTotal: 0 } });
    }
  },

  applyReportHistoryClientFilters() {
    let list = this._reportHistoryRawRows || [];
    if (this.data.reportHistoryOrderNumberKeyword.trim()) {
      const kw = this.data.reportHistoryOrderNumberKeyword.trim().toLowerCase();
      list = list.filter((row) => (row._orderNumber || '').toLowerCase().includes(kw));
    }
    if (this.data.reportHistoryProductKeyword.trim()) {
      const kw = this.data.reportHistoryProductKeyword.trim().toLowerCase();
      list = list.filter((row) => (row._productName || '').toLowerCase().includes(kw));
    }
    const stats = list.reduce(
      (acc, row) => ({
        batchCount: acc.batchCount + 1,
        goodTotal: acc.goodTotal + (row.goodQty || 0),
        defectiveTotal: acc.defectiveTotal + (row.defectiveQty || 0),
      }),
      { batchCount: 0, goodTotal: 0, defectiveTotal: 0 },
    );
    this.setData({
      reportHistoryLoading: false,
      reportHistoryRows: list,
      reportHistoryStats: stats,
    });
  },

  onReportHistoryDateFromChange(e) {
    this.setData({ reportHistoryDateFrom: e.detail.value || '' });
    this.applyReportHistoryFilters();
  },

  onReportHistoryDateToChange(e) {
    this.setData({ reportHistoryDateTo: e.detail.value || '' });
    this.applyReportHistoryFilters();
  },

  onReportHistoryOrderNumberInput(e) {
    this.setData({ reportHistoryOrderNumberKeyword: e.detail.value || '' });
    clearTimeout(this._reportHistoryFilterTimer);
    this._reportHistoryFilterTimer = setTimeout(() => this.applyReportHistoryClientFilters(), 300);
  },

  onReportHistoryProductInput(e) {
    this.setData({ reportHistoryProductKeyword: e.detail.value || '' });
    clearTimeout(this._reportHistoryFilterTimer);
    this._reportHistoryFilterTimer = setTimeout(() => this.applyReportHistoryClientFilters(), 300);
  },

  // ==================== 待入库清单内嵌 ====================
  async loadPendingStockListData() {
    this._pendingStockLoaded = true;
    this.setData({ pendingStockListLoading: true });
    try {
      const config = await fetchTenantConfig();
      const productionLinkMode = (config && config.productionLinkMode) || 'order';
      this.setData({ pendingStockListIsProductMode: productionLinkMode === 'product' });

      const rawRows = await loadPendingStockRows();
      const rows = rawRows.map((row) => mapPendingStockListRow(row, productionLinkMode === 'product'));
      this.setData({ pendingStockListLoading: false, pendingStockListRows: rows });
    } catch {
      this.setData({ pendingStockListLoading: false, pendingStockListRows: [] });
    }
  },

  onPendingStockListRowTap(e) {
    this.closeFilterPanel();
    const { orderId } = e.currentTarget.dataset;
    if (!orderId) return;
    wx.navigateTo({
      url: `/pages/production-order-stock-in-confirm/production-order-stock-in-confirm?mode=single&rowKeys=${encodeURIComponent(orderId)}`,
    });
  },

  refreshPendingStockBadge() {
    const permissions = (this._tenantCtx && this._tenantCtx.permissions) || [];
    const shortcuts = filterByPermission(ORDER_CENTER_SHORTCUTS, permissions);
    const needsBadge = shortcuts.some((item) => item.showBadge);
    if (!needsBadge) return;

    computePendingStockCount()
      .then((count) => {
        this.setData({
          pendingStockCount: count,
          filterShortcuts: buildFilterShortcuts(permissions, count),
        });
      })
      .catch(() => {});
  },

  onExcludeToggle() {
    const excludeCompleted = !this.data.excludeCompleted;
    this.setData({
      excludeCompleted,
      filterActive: excludeCompleted,
    });
    this.reloadList();
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value || '' });
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.reloadList(), 350);
  },

  onSearchClear() {
    this.setData({ searchKeyword: '' });
    this.reloadList();
  },

  onDetailTap(e) {
    this.closeFilterPanel();
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    wx.navigateTo({
      url: `/pages/production-order-detail/production-order-detail?id=${encodeURIComponent(id)}`,
    });
  },

  onMaterialTap(e) {
    this.closeFilterPanel();
    const { id, productId, blockType } = e.currentTarget.dataset;
    if (this._productionLinkMode === 'product' && productId) {
      wx.navigateTo({
        url: `/pages/production-order-material/production-order-material?productId=${encodeURIComponent(productId)}`,
      });
      return;
    }
    if (!id) return;
    wx.navigateTo({
      url: `/pages/production-order-material/production-order-material?orderId=${encodeURIComponent(id)}`,
    });
  },

  onReworkTap(e) {
    this.closeFilterPanel();
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    wx.navigateTo({ url: buildScanSessionUrl({ type: 'rework' }) });
  },

  onToggleExpand(e) {
    this.closeFilterPanel();
    const { key } = e.currentTarget.dataset;
    if (!key) return;
    if (this._expandedBlocks.has(key)) {
      this._expandedBlocks.delete(key);
    } else {
      this._expandedBlocks.add(key);
    }
    this.setData({ rows: this.buildRowsFromOrders(this._allOrders) });
  },

  onProcessChipTap(e) {
    this.closeFilterPanel();
    if (!this.data.canReport) {
      wx.showToast({ title: '暂无报工权限', icon: 'none' });
      return;
    }
    const { orderId, milestoneId } = e.detail || {};
    if (!orderId || !milestoneId) return;
    wx.navigateTo({
      url: `/pages/production-order-report/production-order-report?orderId=${encodeURIComponent(orderId)}&milestoneId=${encodeURIComponent(milestoneId)}`,
    });
  },

  onProductImageError(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    const rows = (this.data.rows || []).map((row) =>
      row.id === id ? { ...row, showProductImage: false } : row,
    );
    this.setData({ rows });
  },

  productMetaForOrder(order) {
    const product = this._productMap.get(order.productId);
    if (!product) {
      return {
        name: order.productName || '',
        sku: order.sku || '',
        showSku: Boolean(order.sku),
        imageUrl: '',
        customTags: [],
      };
    }
    const category = product.categoryId ? this._categoryMap.get(product.categoryId) : null;
    const customTags = mapProductCustomTags(product, category, { includeFile: false });
    const display = productNameSkuParts(product);
    return {
      name: display.name,
      sku: display.sku,
      showSku: display.showSku,
      imageUrl: product.imageUrl || '',
      customTags,
    };
  },

  buildRowsFromOrders(orders) {
    const blocks = buildOrderListBlocks(
      orders,
      this._productionLinkMode || 'order',
      this._productMap,
    );
    const canReport = this.data.canReport;
    const out = [];

    blocks.forEach((block) => {
      const flat = flattenBlockOrders(block);
      const blockKey = block.type === 'parentChild'
        ? block.parent.id
        : block.type === 'productGroup'
          ? block.productId
          : flat[0]?.order?.id || '';
      const hasChildren = block.type === 'parentChild' && (block.children || []).length > 0;
      const expanded = !hasChildren || this._expandedBlocks.has(blockKey);

      flat.forEach((item, idx) => {
        if (hasChildren && !expanded && idx > 0) return;
        const meta = this.productMetaForOrder(item.order);
        const chips = buildOrderProcessChips(item.order, {
          processSequenceMode: this._processSequenceMode || 'sequential',
          outOfSequenceTemplateIds: this._outOfSequenceIds || new Set(),
          canReport,
        });
        const row = mapOrderListRow(item.order, {
          productName: meta.name,
          productSku: meta.sku,
          showProductSku: meta.showSku,
          productImageUrl: meta.imageUrl,
          productCustomTags: meta.customTags,
          showDeliveryDate: this._showDeliveryDate !== false,
          processChips: chips,
          depth: item.depth,
          blockType: block.type,
          productGroupLabel: item.productGroupLabel || '',
          expanded,
          hasChildren: idx === 0 && hasChildren,
          canReport,
          productionLinkMode: this._productionLinkMode || 'order',
        });
        out.push(slimOrderListRow({
          ...row,
          rowKey: `${item.order.id}-${idx}`,
          blockKey,
        }));
      });
    });

    return out;
  },

  async bootstrap() {
    this._initialized = true;
    this._productMap = new Map();
    this._categoryMap = new Map();
    this._expandedBlocks = new Set();

    try {
      const config = await fetchTenantConfig();
      const orderFormSettings = config.orderFormSettings || {};
      const listDisplay = orderFormSettings.listDisplay || {};
      const planFormSettings = config.planFormSettings || {};
      const planListDisplay = planFormSettings.listDisplay || {};
      this._productionLinkMode = config.productionLinkMode || 'order';
      this._processSequenceMode = config.processSequenceMode || 'sequential';
      this._showDeliveryDate = planListDisplay.showDeliveryDate !== false;

      this.setData({
        excludeCompleted: !!listDisplay.onlyShowNotCompleted,
        filterActive: !!listDisplay.onlyShowNotCompleted,
      });

      const [productsRaw, categoriesRaw, nodesRaw] = await Promise.all([
        fetchProductsAll(),
        fetchCategoriesAll(),
        fetchNodesAll(),
      ]);
      const products = normalizeMasterList(productsRaw);
      const categories = normalizeMasterList(categoriesRaw);
      const nodes = normalizeMasterList(nodesRaw);
      this._productMap = new Map(products.map((p) => [p.id, p]));
      this._categoryMap = new Map(categories.map((c) => [c.id, c]));
      this._outOfSequenceIds = buildOutOfSequenceTemplateIds(nodes);
    } catch {
      this._productionLinkMode = 'order';
      this._processSequenceMode = 'sequential';
      this._outOfSequenceIds = new Set();
    }

    await this.reloadList();
    this.refreshPendingStockBadge();
  },

  async reloadList() {
    this._allOrders = [];
    this.setData({ page: 1, rows: [], hasMore: false, loading: true });
    await this.loadPage(1, false);
  },

  async loadPage(page, append) {
    if (append) this.setData({ loadingMore: true });
    else if (!this.data.loading) this.setData({ loading: true });

    try {
      const parsed = parseOrderSearch(this.data.searchKeyword);
      const params = {
        page,
        pageSize: this.data.pageSize,
      };
      if (parsed.search) params.search = parsed.search;
      if (this.data.excludeCompleted) params.excludeCompleted = 'true';

      const result = await listOrdersPaginated(params);
      const pageOrders = result.data || [];

      if (append) {
        const byId = new Map((this._allOrders || []).map((o) => [o.id, o]));
        pageOrders.forEach((o) => {
          if (o && o.id) byId.set(o.id, o);
        });
        this._allOrders = [...byId.values()];
      } else {
        this._allOrders = pageOrders;
      }

      const rows = this.buildRowsFromOrders(pageOrders);
      const loaded = append ? this.data.rows.length + rows.length : rows.length;
      const hasMore = loaded < (result.total || 0);

      this.setData({
        rows: append ? this.buildRowsFromOrders(this._allOrders) : rows,
        page,
        total: result.total || 0,
        hasMore,
        emptyText: this.data.searchKeyword ? '无搜索结果' : '暂无工单',
        loading: false,
        loadingMore: false,
      });
    } catch {
      this.setData({
        loading: false,
        loadingMore: false,
        rows: append ? this.data.rows : [],
        hasMore: false,
      });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },
});
