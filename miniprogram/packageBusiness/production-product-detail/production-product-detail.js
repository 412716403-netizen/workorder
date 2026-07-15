const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const {
  fetchTenantConfig,
  fetchProductsAll,
  fetchCategoriesAll,
  fetchNodesAll,
  fetchBomsAll,
  fetchProductionRecords,
  listOrdersPaginated,
  listProductProgressByProductId,
} = require('../utils/orderApi.js');
const { fetchDictionaries } = require('../utils/planApi.js');
const { normalizeMasterList, getProductUnitName, productNameSkuParts } = require('../utils/productionOrders.js');
const { DEFAULT_PRODUCT_PLACEHOLDER_ICON } = require('../utils/listProductThumb.js');
const { mapProductCustomTags } = require('../utils/reportCustomDocField.js');
const { fetchOrdersForProductMaterialFamily } = require('../utils/productReportHints.js');
const {
  aggregateProductReportSummaryByNode,
  aggregateProductOutsourcePartners,
  productStockInAggregates,
  sumBlockOrderQty,
} = require('../utils/productProductionDetailLite.js');
const {
  buildOrderDetailMaterialRows,
} = require('../utils/orderDetailExtras.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const tailPx = Math.ceil((win.windowWidth / 750) * 16);
  return nav.statusBarHeight + nav.navBarHeight + tailPx;
}

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  const headerPx = computeHeaderBlockHeight(nav);
  return Math.max(200, (win.windowHeight || 667) - headerPx);
}

Page({
  data: {
    loading: true,
    title: '产品生产详情',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
    productHero: null,
    summaryStats: null,
    reportSummaryRows: [],
    showReportSummary: false,
    materialRows: [],
    materialEmptyText: '',
    showMaterialSection: true,
    outsourceCards: [],
    showOutsourceSection: false,
    relatedOrders: [],
    showRelatedOrders: false,
    canViewReportHistory: false,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this._nav = nav;
    this._loadSeq = 0;
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      scrollHeight: computeScrollHeight(nav),
    });

    this._productId = options.productId ? decodeURIComponent(options.productId) : '';
    if (!this._productId) {
      wx.showToast({ title: '缺少产品 ID', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.loadDetail();
  },

  onShow() {
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
    }
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onReportHistoryTap() {
    if (!this.data.canViewReportHistory) return;
    wx.navigateTo({
      url: '/packageBusiness/production-order-report-history/production-order-report-history',
    });
  },

  onOutsourceChipTap(e) {
    const ds = e.currentTarget.dataset || {};
    const productName = (this._product && this._product.name) || '';
    const q = [
      `productKeyword=${encodeURIComponent(productName)}`,
      `partnerKeyword=${encodeURIComponent(ds.partner || '')}`,
      `milestoneNodeId=${encodeURIComponent(ds.nodeId || '')}`,
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
    const canViewReportHistory = hasPermission(perms, 'production:orders_report_records:view');
    this.setData({ loading: true, canViewReportHistory });

    try {
      const [config, dictionariesRaw] = await Promise.all([
        fetchTenantConfig(),
        fetchDictionaries(),
      ]);
      if (seq !== this._loadSeq) return;

      const dictionaries = dictionariesRaw || { colors: [], sizes: [], units: [] };
      const hideZeroPending =
        (config && config.outsourceFormSettings &&
          config.outsourceFormSettings.hideZeroPendingPartnerOnList) === true;

      const [
        productsRaw,
        categoriesRaw,
        nodesRaw,
        bomsRaw,
        orders,
        pmp,
      ] = await Promise.all([
        fetchProductsAll(),
        fetchCategoriesAll(),
        fetchNodesAll(),
        fetchBomsAll(),
        fetchOrdersForProductMaterialFamily(listOrdersPaginated, this._productId),
        listProductProgressByProductId(this._productId).catch(() => []),
      ]);
      if (seq !== this._loadSeq) return;

      const products = normalizeMasterList(productsRaw);
      const categories = normalizeMasterList(categoriesRaw);
      const nodes = normalizeMasterList(nodesRaw);
      const boms = normalizeMasterList(bomsRaw);
      const product = products.find((p) => p.id === this._productId) || null;
      this._product = product;
      if (!product) throw new Error('产品不存在');

      const orderIds = orders.map((o) => o.id).filter(Boolean);
      const prodRecords = await fetchProductionRecords({
        types: 'STOCK_IN,STOCK_OUT,STOCK_RETURN,OUTSOURCE,SCRAP,REWORK,REWORK_REPORT',
        orderIds: orderIds.join(','),
        productIds: this._productId,
        sourceProductIds: this._productId,
        all: 'true',
      }).catch(() => []);
      if (seq !== this._loadSeq) return;

      const category = product.categoryId
        ? categories.find((c) => c.id === product.categoryId)
        : null;
      const parts = productNameSkuParts(product);
      const customTags = mapProductCustomTags(product, category, { includeFile: false });
      const unitName = getProductUnitName(product, dictionaries);
      // 汇总件数只计本成品工单，不把异产品子单数量算进产品合计
      const sameProductOrders = orders.filter((o) => o.productId === this._productId);
      const totalQty = sumBlockOrderQty(sameProductOrders);
      const stockIn = productStockInAggregates(this._productId, prodRecords).alreadyIn;

      const reportSummaryRows = aggregateProductReportSummaryByNode(
        this._productId,
        orders,
        pmp,
        prodRecords,
        nodes,
        product.milestoneNodeIds || [],
      ).map((r) => ({
        ...r,
        goodText: `${r.goodQty} ${unitName}`,
        defText: r.defQty > 0 ? `${r.defQty} ${unitName}` : '—',
        scrapText: r.scrapQty > 0 ? `${r.scrapQty} ${unitName}` : '—',
      }));

      let outsourceCards = aggregateProductOutsourcePartners(
        this._productId,
        prodRecords,
        nodes,
      );
      if (hideZeroPending) {
        outsourceCards = outsourceCards.filter((c) => c.pending > 0);
      }
      outsourceCards = outsourceCards.map((c) => ({
        ...c,
        productId: this._productId,
        productName: parts.name,
      }));

      const materialBuilt = buildOrderDetailMaterialRows({
        order: sameProductOrders[0] || null,
        scopeProductId: this._productId,
        orders,
        products,
        boms,
        nodes,
        stockRecords: prodRecords.filter(
          (r) => r.type === 'STOCK_OUT' || r.type === 'STOCK_RETURN',
        ),
        productMilestoneProgresses: pmp,
        productionLinkMode: 'product',
      });

      const relatedOrders = sameProductOrders.map((o) => {
        const qty = (o.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
        const alreadyIn = (prodRecords || [])
          .filter((r) => r.type === 'STOCK_IN' && r.orderId === o.id)
          .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
        return {
          id: o.id,
          orderNumber: o.orderNumber || o.id,
          quantityText: `${qty} ${unitName}`,
          stockInText: alreadyIn > 0 ? `已入库 ${alreadyIn}` : '',
          showStockIn: alreadyIn > 0,
        };
      });

      this.setData({
        loading: false,
        title: parts.name || '产品生产详情',
        productHero: {
          productName: parts.name,
          productSku: parts.sku,
          showProductSku: parts.showSku,
          productImageUrl: product.imageThumb || product.imageUrl || '',
          showProductImage: Boolean(product.imageThumb || product.imageUrl),
          placeholderIconSrc: DEFAULT_PRODUCT_PLACEHOLDER_ICON,
          productCustomTags: customTags,
          showProductCustomTags: customTags.length > 0,
        },
        summaryStats: {
          orderCountText: String(orders.length),
          totalText: `${totalQty} ${unitName}`,
          stockInText: `${stockIn} ${unitName}`,
        },
        reportSummaryRows,
        showReportSummary: reportSummaryRows.length > 0,
        materialRows: materialBuilt.rows || [],
        materialEmptyText: materialBuilt.emptyText || '暂无物料数据',
        showMaterialSection: true,
        outsourceCards,
        showOutsourceSection: outsourceCards.length > 0,
        relatedOrders,
        showRelatedOrders: relatedOrders.length > 0,
      });
    } catch (err) {
      if (seq !== this._loadSeq) return;
      this.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1000);
    }
  },
});
