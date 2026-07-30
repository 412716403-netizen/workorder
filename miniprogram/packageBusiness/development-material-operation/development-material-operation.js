const { readTenantCtx, readOperatorDisplayName } = require('../../utils/session.js');
const { hasPermission, isTenantElevatedRole } = require('../../utils/permissions.js');
const { loadFeaturePlugins, isPluginEnabled } = require('../../utils/featurePlugins.js');
const {
  readNavBarMetrics,
  readWindowMetrics,
  computePlanCreateHeaderHeight,
} = require('../../utils/windowMetrics.js');
const {
  fetchWarehousesAll,
  fetchStockBatches,
  fetchStockSnapshot,
  fetchProductsAll,
  fetchCategoriesAll,
  fetchBomsAll,
} = require('../../utils/orderApi.js');
const { buildStockSnapshotIndex, formatStockQty } = require('../../utils/stockSnapshotIndex.js');
const {
  listDevMaterialRecords,
  listDevBoms,
  createDevMaterialIssueBatch,
  createDevMaterialReturnBatch,
} = require('../utils/developmentApi.js');
const {
  buildIssueUiRowsFromFlat,
  buildReturnUiRows,
  buildIssueLines,
  buildReturnLines,
  buildDevBomUnitQtyMap,
} = require('../utils/devMaterialLite.js');
const {
  buildProductBomChildIndex,
  resolveTopLevelRootIds,
  buildDevMaterialTree,
  flattenVisibleRows,
  collectTreeProductIds,
} = require('../utils/devMaterialTree.js');
const {
  decorateRowsWithBatchFlags,
  attachBatchOptionsToRows,
  applyBatchSelection,
  validateMaterialIssueBatchRows,
} = require('../../utils/materialIssueBatch.js');
const { defaultEntryDate, defaultEntryTimeHm, entryDateAndTimeToIso } = require('../../utils/docEntryTime.js');

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  return Math.max(200, (win.windowHeight || 667) - computePlanCreateHeaderHeight(nav));
}

/** 对齐 Web：有批次且已选批次 → 批次余量，否则仓库库存 */
function resolveRowStockText(row, warehouseId, stockIndex) {
  if (!stockIndex) return '0';
  const whId = warehouseId || row.warehouseId || '';
  if (!whId) return '0';
  const batchNo = String(row.batchNo || '').trim();
  if (row.needsBatch && batchNo && batchNo !== '无批号') {
    return formatStockQty(stockIndex.getBatchStock(row.productId, whId, batchNo));
  }
  return formatStockQty(stockIndex.getStock(row.productId, whId));
}

function withStockText(rows, warehouseId, stockIndex) {
  return (rows || []).map((row) => ({
    ...row,
    stockText: resolveRowStockText(row, warehouseId, stockIndex),
  }));
}

Page({
  data: {
    mode: 'issue',
    isIssue: true,
    pageTitle: '开发领料',
    styleId: '',
    styleName: '',
    styleCode: '',
    loading: true,
    submitting: false,
    rows: [],
    warehouses: [],
    warehouseIndex: 0,
    warehouseId: '',
    entryDate: defaultEntryDate(),
    entryTime: defaultEntryTimeHm(),
    showBatchCol: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    const mode = options.mode === 'return' ? 'return' : 'issue';
    const isIssue = mode === 'issue';
    this._expandedKeys = new Set();
    this._qtyByProduct = {};
    this._batchMetaByProduct = new Map();
    this.setData({
      mode,
      isIssue,
      pageTitle: isIssue ? '开发领料' : '开发退料',
      styleId: options.styleId ? decodeURIComponent(options.styleId) : '',
      styleName: options.styleName ? decodeURIComponent(options.styleName) : '',
      styleCode: options.styleCode ? decodeURIComponent(options.styleCode) : '',
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computePlanCreateHeaderHeight(nav),
      scrollHeight: computeScrollHeight(nav),
    });
  },

  onShow() {
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.bootstrap();
  },

  async bootstrap() {
    const plugins = await loadFeaturePlugins();
    if (!isPluginEnabled(plugins, 'development')) {
      wx.showToast({ title: '开发管理未开启', icon: 'none' });
      return;
    }
    const ctx = readTenantCtx();
    const perms = (ctx && ctx.permissions) || [];
    const perm = this.data.isIssue
      ? 'development:material_issue:create'
      : 'development:material_return:create';
    if (!isTenantElevatedRole(ctx && ctx.tenantRole) && !hasPermission(perms, perm)) {
      wx.showToast({ title: '无权操作', icon: 'none' });
      return;
    }
    await this.reload();
  },

  /** 从树 + 展开集合 + 数量/批次态重建可见领料行 */
  async rebuildIssueVisibleRows(options) {
    const skipBatchFetch = options && options.skipBatchFetch;
    const warehouseId = this.data.warehouseId;
    const flat = flattenVisibleRows(this._issueTree || [], this._expandedKeys || new Set());
    let rows = buildIssueUiRowsFromFlat(flat, this._materialData, this._productsById, {
      qtyByProduct: this._qtyByProduct,
      batchMetaByProduct: this._batchMetaByProduct,
    });

    // 首次或切仓：为树内全部需批次物料拉批次选项（含未展开子料）
    if (!skipBatchFetch) {
      const treeIds = collectTreeProductIds(this._issueTree || []);
      const seed = treeIds.map((productId) => ({
        productId,
        materialProductId: productId,
      }));
      // 带上旧批号交给 attachBatchOptionsToRows：仍在新仓选项内则沿用，否则回落到首个批次
      let flagged = decorateRowsWithBatchFlags(seed, this._productsById, this._categoryById)
        .map((r) => {
          const prev = this._batchMetaByProduct.get(r.productId);
          return prev && prev.batchNo ? { ...r, batchNo: prev.batchNo } : r;
        });
      flagged = await attachBatchOptionsToRows(flagged, warehouseId, fetchStockBatches);
      const meta = new Map();
      flagged.forEach((r) => {
        meta.set(r.productId, {
          needsBatch: r.needsBatch,
          batchNo: r.batchNo || '',
          batchOptions: r.batchOptions || [],
          batchPickerRange: r.batchPickerRange || [],
          batchIndex: r.batchIndex || 0,
          batchDisplayText: r.batchDisplayText || '',
          batchStock: r.batchStock || 0,
          showBatchStock: Boolean(r.showBatchStock),
        });
      });
      this._batchMetaByProduct = meta;
      const showBatchCol = flagged.some((r) => r.needsBatch);
      rows = buildIssueUiRowsFromFlat(flat, this._materialData, this._productsById, {
        qtyByProduct: this._qtyByProduct,
        batchMetaByProduct: this._batchMetaByProduct,
      });
      rows = withStockText(rows, warehouseId, this._stockIndex);
      this.setData({ rows, showBatchCol });
      return;
    }

    rows = withStockText(rows, warehouseId, this._stockIndex);
    this.setData({ rows });
  },

  async reload() {
    const styleId = this.data.styleId;
    if (!styleId) return;
    this.setData({ loading: true });
    try {
      const [materialData, warehouses, products, categories, devBoms, productBoms] = await Promise.all([
        listDevMaterialRecords(styleId),
        fetchWarehousesAll(),
        fetchProductsAll(),
        fetchCategoriesAll(),
        this.data.isIssue ? listDevBoms({ parentStyleId: styleId }) : Promise.resolve([]),
        this.data.isIssue ? fetchBomsAll().catch(() => []) : Promise.resolve([]),
      ]);
      this._materialData = materialData;
      this._productsById = new Map((products || []).map((p) => [p.id, p]));
      this._categoryById = new Map((categories || []).map((c) => [c.id, c]));

      const whList = warehouses || [];
      const warehouseId = this.data.warehouseId || (whList[0] && whList[0].id) || '';
      const warehouseIndex = Math.max(0, whList.findIndex((w) => w.id === warehouseId));
      const warehouseNameById = {};
      whList.forEach((w) => { warehouseNameById[w.id] = w.name; });

      const snapshotRaw = await fetchStockSnapshot(
        this.data.isIssue && warehouseId ? { warehouseId } : {},
      );
      this._stockIndex = buildStockSnapshotIndex(snapshotRaw);

      if (this.data.isIssue) {
        if (!materialData.canIssue) {
          wx.showToast({ title: '当前款式不可领料', icon: 'none' });
        }
        const productBomIndex = buildProductBomChildIndex(productBoms || []);
        const childrenIndex = productBomIndex.childrenByParent;
        const rootUnitQty = buildDevBomUnitQtyMap(devBoms);
        const issueRootIds = resolveTopLevelRootIds(materialData.bomProductIds || [], childrenIndex);
        this._issueTree = buildDevMaterialTree(issueRootIds, childrenIndex, {
          rootUnitQty,
          childUnitQty: productBomIndex.unitQtyByParentChild,
        });
        // 切仓重载保留展开与数量；首次进入清空
        if (!this._expandedKeys) this._expandedKeys = new Set();
        if (!this._qtyByProduct) this._qtyByProduct = {};
        if (!this._batchMetaByProduct) this._batchMetaByProduct = new Map();

        this.setData({
          warehouses: whList,
          warehouseId,
          warehouseIndex: warehouseIndex < 0 ? 0 : warehouseIndex,
          loading: false,
        });
        await this.rebuildIssueVisibleRows({ skipBatchFetch: false });
      } else {
        let rows = buildReturnUiRows(materialData, warehouseNameById);
        const flagged = decorateRowsWithBatchFlags(
          rows.map((r) => ({ ...r, materialProductId: r.productId })),
          this._productsById,
          this._categoryById,
        );
        const showBatchCol = flagged.some((r) => r.needsBatch);
        rows = flagged.map((r, i) => ({
          ...rows[i],
          needsBatch: r.needsBatch,
        }));
        rows = withStockText(rows, '', this._stockIndex);
        this.setData({
          rows,
          warehouses: whList,
          warehouseId,
          warehouseIndex: warehouseIndex < 0 ? 0 : warehouseIndex,
          showBatchCol,
          loading: false,
        });
      }
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
    }
  },

  onHeaderBack() {
    wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/home/home' }) });
  },

  onToggleExpand(e) {
    const rowKey = e.currentTarget.dataset.rowKey;
    if (!rowKey || !this.data.isIssue) return;
    if (!this._expandedKeys) this._expandedKeys = new Set();
    if (this._expandedKeys.has(rowKey)) this._expandedKeys.delete(rowKey);
    else this._expandedKeys.add(rowKey);
    this.rebuildIssueVisibleRows({ skipBatchFetch: true });
  },

  onWarehouseChange(e) {
    const idx = Number(e.detail.value) || 0;
    const wh = this.data.warehouses[idx];
    const warehouseId = wh ? wh.id : '';
    this.setData({ warehouseIndex: idx, warehouseId });
    if (this.data.isIssue) this.reload();
  },

  onQtyInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    const field = this.data.isIssue ? 'issueQty' : 'returnQty';
    const rows = this.data.rows.slice();
    if (!rows[index]) return;
    const value = e.detail.value;
    rows[index] = { ...rows[index], [field]: value };
    if (this.data.isIssue) {
      if (!this._qtyByProduct) this._qtyByProduct = {};
      const productId = rows[index].productId;
      this._qtyByProduct[productId] = value;
      // 同一物料可出现在多个父料下，数量按 productId 共享，其余行同步显示
      rows.forEach((row, i) => {
        if (i !== index && row.productId === productId) {
          rows[i] = { ...row, issueQty: value };
        }
      });
    }
    this.setData({ rows });
  },

  onBatchChange(e) {
    const index = Number(e.currentTarget.dataset.index);
    const rows = this.data.rows.slice();
    if (!rows[index]) return;
    const next = applyBatchSelection(rows[index], e.detail.value);
    const withStock = {
      ...next,
      stockText: resolveRowStockText(next, this.data.warehouseId, this._stockIndex),
    };
    rows[index] = withStock;
    if (this.data.isIssue) {
      if (!this._batchMetaByProduct) this._batchMetaByProduct = new Map();
      this._batchMetaByProduct.set(withStock.productId, {
        needsBatch: withStock.needsBatch,
        batchNo: withStock.batchNo,
        batchOptions: withStock.batchOptions,
        batchPickerRange: withStock.batchPickerRange,
        batchIndex: withStock.batchIndex,
        batchDisplayText: withStock.batchDisplayText,
        batchStock: withStock.batchStock,
        showBatchStock: Boolean(withStock.showBatchStock),
      });
      rows.forEach((row, i) => {
        if (i !== index && row.productId === withStock.productId) {
          rows[i] = {
            ...row,
            needsBatch: withStock.needsBatch,
            batchNo: withStock.batchNo,
            batchOptions: withStock.batchOptions,
            batchPickerRange: withStock.batchPickerRange,
            batchIndex: withStock.batchIndex,
            batchDisplayText: withStock.batchDisplayText,
            batchStock: withStock.batchStock,
            showBatchStock: Boolean(withStock.showBatchStock),
            stockText: withStock.stockText,
          };
        }
      });
    }
    this.setData({ rows });
  },

  onEntryDateChange(e) {
    this.setData({ entryDate: e.detail.value });
  },

  onEntryTimeChange(e) {
    this.setData({ entryTime: e.detail.value });
  },

  async onSubmit() {
    if (this.data.submitting) return;
    const { isIssue, warehouseId, rows } = this.data;
    if (isIssue && !warehouseId) {
      wx.showToast({ title: '请选择仓库', icon: 'none' });
      return;
    }
    // 仅提交当前可见行（折叠子料不扣库，对齐 Web）
    const lines = isIssue
      ? buildIssueLines(rows, warehouseId)
      : buildReturnLines(rows);
    if (!lines.length) {
      wx.showToast({ title: isIssue ? '请填写领料数量' : '请填写退料数量', icon: 'none' });
      return;
    }
    if (isIssue) {
      const batchErrs = validateMaterialIssueBatchRows(rows.filter((r) => Number(r.issueQty) > 0));
      if (batchErrs && batchErrs.length) {
        wx.showToast({ title: batchErrs[0], icon: 'none' });
        return;
      }
    }
    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中' });
    try {
      const body = {
        lines,
        operator: readOperatorDisplayName(),
        timestamp: entryDateAndTimeToIso(this.data.entryDate, this.data.entryTime),
      };
      const result = isIssue
        ? await createDevMaterialIssueBatch(this.data.styleId, body)
        : await createDevMaterialReturnBatch(this.data.styleId, body);
      wx.hideLoading();
      wx.showToast({ title: `${isIssue ? '领料' : '退料'}成功`, icon: 'success' });
      setTimeout(() => {
        wx.navigateBack({
          fail: () => {
            wx.redirectTo({
              url: `/packageBusiness/development-style-detail/development-style-detail?styleId=${encodeURIComponent(this.data.styleId)}`,
            });
          },
        });
      }, 500);
      return result;
    } catch (err) {
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: (err && err.message) || '提交失败', icon: 'none' });
    }
  },
});
