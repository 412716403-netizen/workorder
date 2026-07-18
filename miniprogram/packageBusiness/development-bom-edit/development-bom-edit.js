const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { loadFeaturePlugins, isPluginEnabled } = require('../../utils/featurePlugins.js');
const {
  readNavBarMetrics,
  readWindowMetrics,
  computePlanCreateHeaderHeight,
} = require('../../utils/windowMetrics.js');
const { fetchCategoriesAll, fetchDictionaries } = require('../../utils/planApi.js');
const { normalizeAppDictionaries } = require('../../utils/productionPlans.js');
const { request } = require('../../utils/request.js');
const { fetchProductsAll } = require('../utils/productApi.js');
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
} = require('../utils/devBomEdit.js');
const { promptCreateTodo } = require('../utils/devTodoCreate.js');

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  const rpx = win.windowWidth / 750;
  const footerPx = Math.ceil(128 * rpx) + (win.safeAreaBottom || 0);
  const headerPx = computePlanCreateHeaderHeight(nav);
  return Math.max(200, (win.windowHeight || 667) - headerPx - footerPx);
}

Page({
  data: {
    loading: true,
    submitting: false,
    styleId: '',
    mode: 'cells', // cells | items
    cells: [],
    activeCell: null,
    itemRows: [],
    products: [],
    categories: [],
    pickerSheetOpen: false,
    showTodoBtn: false,
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
      this.setData({ showTodoBtn: isPluginEnabled(plugins, 'todo_reminder') });
      if (this.data.mode === 'cells') this.bootstrap();
    });
  },

  onHeaderBack() {
    if (this.data.mode === 'items') {
      this.setData({ mode: 'cells', activeCell: null, itemRows: [] });
      this.bootstrap();
      return;
    }
    wx.navigateBack();
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const [style, boms, products, categories, dictRaw, nodesRaw] = await Promise.all([
        getDevStyle(this.data.styleId),
        listDevBoms({ parentStyleId: this.data.styleId }),
        fetchProductsAll().catch(() => []),
        fetchCategoriesAll().catch(() => []),
        fetchDictionaries().catch(() => ({})),
        request({ path: '/settings/nodes?all=true', method: 'GET', timeout: 60000 }).catch(() => []),
      ]);
      this._style = style;
      this._boms = boms || [];
      this._products = products || [];
      this._dictionaries = normalizeAppDictionaries(dictRaw);
      this._globalNodes = Array.isArray(nodesRaw) ? nodesRaw : [];
      const cells = buildBomCells(style, this._globalNodes, this._dictionaries, {
        colorId: this._colorId,
        sizeId: this._sizeId,
      });
      this.setData({
        loading: false,
        cells,
        mode: 'cells',
        products: this._products,
        categories: categories || [],
      });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  onCellTap(e) {
    const key = e.currentTarget.dataset.key;
    const cell = (this.data.cells || []).find((c) => c.key === key);
    if (!cell) return;
    if (!(this._style.milestoneNodeIds || []).length) {
      wx.showToast({ title: '请先配置大货工序', icon: 'none' });
      return;
    }
    const bom = findBomForCell(this._boms, this._style.id, cell.variantId, cell.nodeId);
    const itemRows = buildBomItemsUi(bom, this._products);
    this._editingBom = bom || null;
    this.setData({
      mode: 'items',
      activeCell: cell,
      itemRows: itemRows.length
        ? itemRows
        : [{ rowKey: 'new-0', productId: '', productName: '', productSku: '', showProductSku: false, quantityText: '', note: '' }],
    });
  },

  onAddItemRow() {
    const itemRows = [
      ...(this.data.itemRows || []),
      {
        rowKey: `new-${Date.now()}`,
        productId: '',
        productName: '',
        productSku: '',
        showProductSku: false,
        quantityText: '',
        note: '',
      },
    ];
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

  onNoteInput(e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value || '';
    const itemRows = (this.data.itemRows || []).map((r) =>
      r.rowKey === key ? { ...r, note: value } : r,
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

  async onSaveItems() {
    if (this.data.submitting || !this.data.activeCell) return;
    const cell = this.data.activeCell;
    const items = itemsFromUi(this.data.itemRows);
    if (!items.length) {
      // 清空：有旧 BOM 则删除并清 nodeBoms
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
          this.setData({ mode: 'cells', submitting: false });
          this.bootstrap();
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
      wx.showToast({ title: '已保存', icon: 'success' });
      this.setData({ mode: 'cells', submitting: false });
      this.bootstrap();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  },

  onAddTodoTap() {
    if (!this.data.showTodoBtn || !this._style) return;
    const sampleQs = this._sampleId
      ? `&devSampleId=${encodeURIComponent(this._sampleId)}`
      : '';
    promptCreateTodo({
      sourceType: 'dev_bom',
      sourceId: this._style.id,
      sourceDocNo: '开发管理',
      sourceTitle: `${this._style.name || this._style.code || ''} · BOM 录入`,
      href: `/development?styleId=${encodeURIComponent(this._style.id)}${sampleQs}`,
    });
  },
});
