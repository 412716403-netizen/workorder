const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const { getProduct, fetchProductsAll, fetchBomsAll } = require('../utils/productApi.js');
const {
  fetchCategoriesAll,
  fetchDictionaries,
  fetchPartnersAll,
  fetchNodesAll,
} = require('../../utils/planApi.js');
const { normalizeMasterList } = require('../utils/productionOrders.js');
const { normalizeAppDictionaries } = require('../../utils/productionPlans.js');
const { DEFAULT_PRODUCT_PLACEHOLDER_ICON } = require('../../utils/listProductThumb.js');
const {
  buildKnowledgeProductDetailView,
  sanitizeProductForMiniView,
  slimProductsForBomLookup,
} = require('../utils/knowledgeProductDetailView.js');

function computeHeaderBlockHeight(nav) {
  return nav.statusBarHeight + nav.navBarHeight;
}

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  return Math.max(200, (win.windowHeight || 667) - computeHeaderBlockHeight(nav));
}

/** 将 data URL 写到本地临时路径，供 image / previewImage 使用（避免大 base64 进 setData） */
function writeDataUrlTempFile(dataUrl, productId) {
  return new Promise((resolve) => {
    if (!dataUrl || typeof dataUrl !== 'string' || dataUrl.indexOf('data:') !== 0) {
      resolve('');
      return;
    }
    const comma = dataUrl.indexOf(',');
    if (comma < 0) {
      resolve('');
      return;
    }
    const meta = dataUrl.slice(0, comma);
    const b64 = dataUrl.slice(comma + 1);
    const mimeMatch = /data:([^;]+)/.exec(meta);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    let ext = 'jpg';
    if (mime.indexOf('png') >= 0) ext = 'png';
    else if (mime.indexOf('webp') >= 0) ext = 'webp';
    else if (mime.indexOf('gif') >= 0) ext = 'gif';
    const base =
      (typeof wx !== 'undefined' && wx.env && wx.env.USER_DATA_PATH) || '';
    if (!base || typeof wx === 'undefined' || !wx.getFileSystemManager) {
      resolve('');
      return;
    }
    const filePath = `${base}/kb-prod-img-${String(productId || 'x').replace(/[^\w-]/g, '')}.${ext}`;
    try {
      wx.getFileSystemManager().writeFile({
        filePath,
        data: b64,
        encoding: 'base64',
        success: () => resolve(filePath),
        fail: () => resolve(''),
      });
    } catch {
      resolve('');
    }
  });
}

Page({
  data: {
    loading: true,
    found: false,
    emptyText: '产品不存在',
    hero: null,
    rows: [],
    customRows: [],
    showCustomSection: false,
    processRows: [],
    processEmpty: true,
    showBomSection: false,
    bomSkuOptions: [],
    showBomSkuTabs: false,
    bomGroups: [],
    bomEmptyText: '',
    showBomEmpty: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 64,
    scrollHeight: 600,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this._productId = options.id ? decodeURIComponent(options.id) : '';
    this._bomSkuId = '';
    this._imageTempPath = '';
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      scrollHeight: computeScrollHeight(nav),
    });
  },

  onUnload() {
    const path = this._imageTempPath;
    if (!path || typeof wx === 'undefined' || !wx.getFileSystemManager) return;
    try {
      wx.getFileSystemManager().unlinkSync(path);
    } catch {
      // ignore
    }
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
    if (!hasPermission(ctx.permissions || [], 'basic:products:view')) {
      wx.showToast({ title: '无产品查看权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    if (!this._loaded) {
      this.loadProduct();
    }
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onPreviewImage() {
    const url = this.data.hero && this.data.hero.imageUrl;
    if (!url) return;
    wx.previewImage({ current: url, urls: [url] });
  },

  onBomSkuTap(e) {
    const id = e.detail && e.detail.id;
    if (!id || id === this._bomSkuId) return;
    this._bomSkuId = id;
    this.applyView();
  },

  onCustomKnowledgeTap(e) {
    const id = e.detail && e.detail.id;
    if (!id) return;
    const title = (e.detail && e.detail.title) || '资料库文件';
    wx.navigateTo({
      url: `/packageBusiness/knowledge-doc-detail/knowledge-doc-detail?id=${encodeURIComponent(id)}&title=${encodeURIComponent(title)}`,
    });
  },

  applyView() {
    if (!this._product) return;
    const view = buildKnowledgeProductDetailView({
      product: this._product,
      category: this._category,
      dictionaries: this._dictionaries,
      partners: this._partners,
      globalNodes: this._nodes,
      boms: this._boms,
      products: this._products,
      bomSkuId: this._bomSkuId,
    });
    if (!this._bomSkuId && view.defaultBomSkuId) {
      this._bomSkuId = view.defaultBomSkuId;
      return this.applyView();
    }
    this.setData({
      loading: false,
      found: true,
      hero: {
        productName: view.productName,
        productSku: view.productSku,
        showProductSku: view.showProductSku,
        categoryName: view.categoryName,
        imageUrl: view.imageUrl,
        showImage: view.showImage,
        placeholderIconSrc: DEFAULT_PRODUCT_PLACEHOLDER_ICON,
      },
      rows: view.rows || [],
      customRows: view.customRows || [],
      showCustomSection: view.showCustomSection,
      processRows: view.processRows || [],
      processEmpty: view.processEmpty,
      showBomSection: view.showBomSection,
      bomSkuOptions: view.bomSkuOptions || [],
      showBomSkuTabs: view.showBomSkuTabs,
      bomGroups: view.bomGroups || [],
      bomEmptyText: view.bomEmptyText || '',
      showBomEmpty: view.showBomEmpty,
    });
  },

  async loadProduct() {
    const id = this._productId;
    if (!id) {
      this.setData({ loading: false, found: false, emptyText: '缺少产品 id' });
      return;
    }
    this.setData({ loading: true });
    try {
      const [
        productRaw,
        categoriesRaw,
        dictionariesRaw,
        partnersRaw,
        nodesRaw,
        bomsRaw,
        productsRaw,
      ] = await Promise.all([
        getProduct(id),
        fetchCategoriesAll(),
        fetchDictionaries(),
        fetchPartnersAll().catch(() => []),
        fetchNodesAll().catch(() => []),
        fetchBomsAll().catch(() => []),
        fetchProductsAll().catch(() => []),
      ]);
      if (!productRaw) {
        this.setData({ loading: false, found: false });
        return;
      }
      const product = sanitizeProductForMiniView(productRaw);
      const dataUrlForTemp = product._imageDataUrlForTemp || '';
      delete product._imageDataUrlForTemp;

      if (dataUrlForTemp) {
        const localPath = await writeDataUrlTempFile(dataUrlForTemp, id);
        if (localPath) {
          product.imageLocalPath = localPath;
          this._imageTempPath = localPath;
        }
      }

      this._loaded = true;
      this._product = product;
      this._categories = normalizeMasterList(categoriesRaw);
      this._dictionaries = normalizeAppDictionaries(dictionariesRaw);
      this._partners = normalizeMasterList(partnersRaw);
      this._nodes = normalizeMasterList(nodesRaw);
      this._boms = Array.isArray(bomsRaw) ? bomsRaw : normalizeMasterList(bomsRaw);
      this._products = slimProductsForBomLookup(normalizeMasterList(productsRaw));
      this._category = product.categoryId
        ? this._categories.find((c) => c.id === product.categoryId)
        : null;
      this._bomSkuId = '';
      this.applyView();
    } catch (err) {
      this.setData({
        loading: false,
        found: false,
        emptyText: (err && err.message) || '加载失败',
      });
    }
  },
});
