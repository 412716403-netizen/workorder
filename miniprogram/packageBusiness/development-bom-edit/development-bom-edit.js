const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { loadFeaturePlugins, isPluginEnabled } = require('../../utils/featurePlugins.js');
const {
  readNavBarMetrics,
  readWindowMetrics,
  computePlanCreateHeaderHeight,
} = require('../../utils/windowMetrics.js');
const { fetchDictionaries, fetchPartnersAll, fetchCategoriesAll } = require('../../utils/planApi.js');
const { normalizeAppDictionaries } = require('../../utils/productionPlans.js');
const { fetchProductsAll, fetchNodesAll } = require('../../utils/orderApi.js');
const { resolveImageDisplaySrc } = require('../../utils/fileBase64.js');
const {
  getDevStyle,
  listDevBoms,
  createDevBom,
  updateDevBom,
  deleteDevBom,
  syncVariantNodeBoms,
} = require('../utils/developmentApi.js');
const {
  genBomId,
  buildBomCells,
  findBomForCell,
  buildBomItemsUi,
  itemsFromUi,
  buildBomStyleHeader,
  shouldSkipBomCellsList,
} = require('../utils/devBomEdit.js');

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  const rpx = win.windowWidth / 750;
  const footerPx = Math.ceil(128 * rpx) + (win.safeAreaBottom || 0);
  const headerPx = computePlanCreateHeaderHeight(nav);
  return Math.max(200, (win.windowHeight || 667) - headerPx - footerPx);
}

function emptyItemRow() {
  return {
    rowKey: `new-${Date.now()}`,
    productId: '',
    productName: '',
    productSku: '',
    showProductSku: false,
    quantityText: '',
    note: '',
  };
}

Page({
  data: {
    loading: true,
    submitting: false,
    styleId: '',
    mode: 'cells', // cells | items
    cells: [],
    styleHeader: null,
    activeCell: null,
    itemRows: [],
    products: [],
    categories: [],
    partners: [],
    pickerSheetOpen: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this.setData({
      styleId: options.styleId ? decodeURIComponent(options.styleId) : '',
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computePlanCreateHeaderHeight(nav),
      scrollHeight: computeScrollHeight(nav),
    });
    this._sampleId = options.sampleId ? decodeURIComponent(options.sampleId) : '';
    this._colorId = options.colorId ? decodeURIComponent(options.colorId) : '';
    this._sizeId = options.sizeId ? decodeURIComponent(options.sizeId) : '';
    this._bootstrapped = false;
    this._productsReady = false;
    this._productsLoading = null;
    /** 单规格仅一格：跳过格子页，返回/保存直接回上一页 */
    this._skipCellsOnBack = false;
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
    loadFeaturePlugins().then((plugins) => {
      if (!isPluginEnabled(plugins, 'development')) {
        wx.showToast({ title: '开发管理插件未开启', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      if (!hasPermission(ctx.permissions || [], 'development:styles:edit')) {
        wx.showToast({ title: '无编辑权限', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      // 仅格子列表态需要首屏 bootstrap；已加载过则跳过，避免每次 onShow 重拉全量
      if (this.data.mode === 'cells' && !this._bootstrapped) {
        this.bootstrap();
      }
    });
  },

  onHeaderBack() {
    if (this.data.mode === 'items') {
      if (this._skipCellsOnBack) {
        wx.navigateBack();
        return;
      }
      this.setData({ mode: 'cells', activeCell: null, itemRows: [] });
      this.refreshCells();
      return;
    }
    wx.navigateBack();
  },

  async leaveItemsMode() {
    if (this._skipCellsOnBack) {
      this.setData({ submitting: false });
      wx.navigateBack();
      return;
    }
    this.setData({ mode: 'cells', submitting: false, activeCell: null, itemRows: [] });
    await this.refreshCells();
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      // 首屏只拉格子所需：款式 + BOM + 工序 + 颜色尺码字典（产品/分类/合作单位延后到进编辑）
      const [style, boms, dictRaw, nodesRaw] = await Promise.all([
        getDevStyle(this.data.styleId),
        listDevBoms({ parentStyleId: this.data.styleId }),
        fetchDictionaries().catch(() => ({})),
        fetchNodesAll().catch(() => []),
      ]);
      this._style = style;
      this._boms = boms || [];
      this._dictionaries = normalizeAppDictionaries(dictRaw);
      this._globalNodes = Array.isArray(nodesRaw) ? nodesRaw : [];
      this._bootstrapped = true;
      const header = buildBomStyleHeader(style);
      const cells = buildBomCells(style, this._globalNodes, this._dictionaries, {
        colorId: this._colorId,
        sizeId: this._sizeId,
        boms: this._boms,
      });
      const styleHeader = {
        productName: header.productName,
        productSku: header.productSku,
        showProductSku: header.showProductSku,
        productImageUrl: header.productImageUrl,
        showProductImage: header.showProductImage,
        placeholderIconSrc: header.placeholderIconSrc,
        isSingleSku: header.isSingleSku,
      };
      this._skipCellsOnBack = shouldSkipBomCellsList(style, cells);
      if (this._skipCellsOnBack) {
        // 不闪格子页：保持 loading，直接进编辑
        this.setData({ cells, styleHeader });
        this.primeStyleHeaderImage(header._rawImageSrc, style && style.id);
        try {
          await this.openCellEditor(cells[0], { showLoadingToast: false });
          this.setData({ loading: false });
        } catch {
          this._skipCellsOnBack = false;
          this.setData({ loading: false, mode: 'cells' });
        }
        return;
      }
      this.setData({
        loading: false,
        cells,
        styleHeader,
        mode: 'cells',
      });
      this.primeStyleHeaderImage(header._rawImageSrc, style && style.id);
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  async refreshCells() {
    try {
      const boms = await listDevBoms({ parentStyleId: this.data.styleId });
      this._boms = boms || [];
      const cells = buildBomCells(this._style, this._globalNodes, this._dictionaries, {
        colorId: this._colorId,
        sizeId: this._sizeId,
        boms: this._boms,
      });
      this.setData({ cells, mode: 'cells' });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '刷新失败', icon: 'none' });
    }
  },

  async primeStyleHeaderImage(rawSrc, styleId) {
    if (!rawSrc || this.data.styleHeader && this.data.styleHeader.showProductImage) return;
    const path = await resolveImageDisplaySrc(rawSrc, styleId || this.data.styleId || 'bom');
    if (!path) return;
    if (!this.data.styleHeader) return;
    this.setData({
      'styleHeader.productImageUrl': path,
      'styleHeader.showProductImage': true,
    });
  },

  ensureProductsLoaded() {
    if (this._productsReady) return Promise.resolve();
    if (this._productsLoading) return this._productsLoading;
    this._productsLoading = Promise.all([
      fetchProductsAll().catch(() => []),
      fetchCategoriesAll().catch(() => []),
      fetchPartnersAll().catch(() => []),
    ])
      .then(([products, categories, partners]) => {
        this._products = products || [];
        this._productsReady = true;
        this.setData({
          products: this._products,
          categories: categories || [],
          partners: partners || [],
        });
      })
      .finally(() => {
        this._productsLoading = null;
      });
    return this._productsLoading;
  },

  async openCellEditor(cell, opts) {
    if (!cell || !this._style) return;
    if (!(this._style.milestoneNodeIds || []).length) {
      wx.showToast({ title: '请先配置大货工序', icon: 'none' });
      return;
    }
    const showToast = !(opts && opts.showLoadingToast === false);
    if (showToast) wx.showLoading({ title: '加载物料…', mask: true });
    try {
      await this.ensureProductsLoaded();
      const bom = findBomForCell(this._boms, this._style.id, cell.variantId, cell.nodeId);
      const itemRows = buildBomItemsUi(bom, this._products);
      this._editingBom = bom || null;
      this.setData({
        mode: 'items',
        activeCell: cell,
        itemRows: itemRows.length ? itemRows : [emptyItemRow()],
      });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      throw err;
    } finally {
      if (showToast) wx.hideLoading();
    }
  },

  async onCellTap(e) {
    const key = e.currentTarget.dataset.key;
    const cell = (this.data.cells || []).find((c) => c.key === key);
    if (!cell) return;
    try {
      await this.openCellEditor(cell);
    } catch {
      // toast 已在 openCellEditor 内提示
    }
  },

  onAddItemRow() {
    const itemRows = [...(this.data.itemRows || []), emptyItemRow()];
    this.setData({ itemRows });
  },

  onQtyInput(e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value || '';
    const itemRows = (this.data.itemRows || []).map((r) =>
      r.rowKey === key ? { ...r, quantityText: value } : r,
    );
    this.setData({ itemRows });
  },

  onRemoveItem(e) {
    const key = e.currentTarget.dataset.key;
    const itemRows = (this.data.itemRows || []).filter((r) => r.rowKey !== key);
    this.setData({ itemRows });
  },

  onProductChange(e) {
    const key = e.currentTarget.dataset.key;
    const detail = e.detail || {};
    const product = detail.product || null;
    const productId = detail.id || (product && product.id) || '';
    const name = (product && product.name) || detail.name || '';
    const sku = (product && product.sku) || '';
    const itemRows = (this.data.itemRows || []).map((r) => {
      if (r.rowKey !== key) return r;
      return {
        ...r,
        productId,
        productName: name || sku || productId,
        productSku: sku,
        showProductSku: !!(name && sku && name !== sku),
        categoryId: product && product.categoryId,
      };
    });
    this.setData({ itemRows });
  },

  onPickerSheetOpen() {
    this.setData({ pickerSheetOpen: true });
  },

  onPickerSheetClose() {
    this.setData({ pickerSheetOpen: false });
  },

  onHeaderImageError() {
    if (!this.data.styleHeader) return;
    this.setData({
      'styleHeader.showProductImage': false,
      'styleHeader.productImageUrl': '',
    });
  },

  async onSaveItems() {
    if (this.data.submitting || !this.data.activeCell) return;
    const cell = this.data.activeCell;
    const items = itemsFromUi(this.data.itemRows);
    if (!items.length) {
      if (this._editingBom) {
        this.setData({ submitting: true });
        try {
          await deleteDevBom(this._editingBom.id);
          if (cell.variantId) {
            const variant = (this._style.variants || []).find((v) => v.id === cell.variantId);
            const nodeBoms = { ...((variant && variant.nodeBoms) || {}) };
            delete nodeBoms[cell.nodeId];
            await syncVariantNodeBoms(this._style.id, cell.variantId, nodeBoms);
          }
      wx.showToast({ title: '已清空', icon: 'success' });
          if (this._style && this._style.publishedProductId) {
            try {
              require('../../utils/masterDataCache.js').invalidateMasterDataCache('boms');
            } catch {
              // ignore
            }
          }
          await this.leaveItemsMode();
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
          this.setData({ submitting: false });
        }
      } else {
        wx.showToast({ title: '请添加物料', icon: 'none' });
      }
      return;
    }

    this.setData({ submitting: true });
    try {
      let bomId;
      if (this._editingBom) {
        const saved = await updateDevBom(this._editingBom.id, {
          ...this._editingBom,
          parentStyleId: this._style.id,
          variantId: cell.variantId || undefined,
          nodeId: cell.nodeId,
          items,
        });
        bomId = saved.id;
      } else {
        const saved = await createDevBom({
          id: genBomId(),
          parentStyleId: this._style.id,
          variantId: cell.variantId || undefined,
          nodeId: cell.nodeId,
          items,
        });
        bomId = saved.id;
      }
      if (cell.variantId) {
        const variant = (this._style.variants || []).find((v) => v.id === cell.variantId);
        const nodeBoms = { ...((variant && variant.nodeBoms) || {}), [cell.nodeId]: bomId };
        await syncVariantNodeBoms(this._style.id, cell.variantId, nodeBoms);
      }
      wx.showToast({
        title: this._style && this._style.publishedProductId ? '已保存并同步商品' : '已保存',
        icon: 'success',
      });
      if (this._style && this._style.publishedProductId) {
        try {
          require('../../utils/masterDataCache.js').invalidateMasterDataCache('boms');
        } catch {
          // ignore
        }
      }
      await this.leaveItemsMode();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  },
});
