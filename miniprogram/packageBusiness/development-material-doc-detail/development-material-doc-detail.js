const { readTenantCtx, readOperatorDisplayName } = require('../../utils/session.js');
const { hasPermission, isTenantElevatedRole } = require('../../utils/permissions.js');
const { loadFeaturePlugins, isPluginEnabled } = require('../../utils/featurePlugins.js');
const {
  readNavBarMetrics,
  readWindowMetrics,
  computePlanCreateHeaderHeight,
} = require('../../utils/windowMetrics.js');
const { fetchWarehousesAll, fetchProductsAll, fetchCategoriesAll } = require('../../utils/orderApi.js');
const {
  listDevMaterialRecords,
  updateDevMaterialDoc,
  deleteDevMaterialDoc,
} = require('../utils/developmentApi.js');
const { categoryUsesBatchManagement } = require('../../utils/materialIssueBatch.js');

function computeHeaderBlockHeight(nav) {
  return computePlanCreateHeaderHeight(nav);
}

function computeScrollHeight(nav, hasFooter) {
  const win = readWindowMetrics();
  const rpx = (win.windowWidth || 375) / 750;
  const footerPx = hasFooter ? Math.ceil(120 * rpx) + (win.safeAreaBottom || 0) : 0;
  return Math.max(200, (win.windowHeight || 667) - computeHeaderBlockHeight(nav) - footerPx);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toDatetimeLocal(ts) {
  const d = ts ? new Date(ts) : new Date();
  if (Number.isNaN(d.getTime())) return toDatetimeLocal(new Date());
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function datetimeLocalToTimestamp(local) {
  const t = String(local || '').trim();
  if (!t) return new Date().toISOString();
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

Page({
  data: {
    loading: true,
    editing: false,
    saving: false,
    styleId: '',
    styleName: '',
    styleCode: '',
    docNo: '',
    typeLabel: '',
    timeText: '',
    operator: '',
    lines: [],
    editLines: [],
    warehouseNames: [],
    canEdit: false,
    canDelete: false,
    styleAllowsEdit: false,
    showFooter: false,
    showBatchCol: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    this.setData({
      styleId: options.styleId ? decodeURIComponent(options.styleId) : '',
      styleName: options.styleName ? decodeURIComponent(options.styleName) : '',
      styleCode: options.styleCode ? decodeURIComponent(options.styleCode) : '',
      docNo: options.docNo ? decodeURIComponent(options.docNo) : '',
      styleAllowsEdit: options.styleAllowsEdit === '1' || options.styleAllowsEdit === 'true',
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      scrollHeight: computeScrollHeight(nav, false),
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
    const elevated = isTenantElevatedRole(ctx && ctx.tenantRole);
    const canView =
      elevated ||
      hasPermission(perms, 'development:material_records:view') ||
      hasPermission(perms, 'development:material_issue:view') ||
      hasPermission(perms, 'development:material_return:view');
    if (!canView) {
      wx.showToast({ title: '无权查看', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    const canEdit =
      this.data.styleAllowsEdit &&
      (elevated || hasPermission(perms, 'development:material_records:edit'));
    const canDelete =
      this.data.styleAllowsEdit &&
      (elevated || hasPermission(perms, 'development:material_records:delete'));
    const showFooter = canEdit || canDelete;
    this._canEdit = canEdit;
    this._canDelete = canDelete;
    this.setData({
      canEdit,
      canDelete,
      showFooter,
      scrollHeight: computeScrollHeight(readNavBarMetrics(), showFooter),
    });
    await this.reload();
  },

  async reload() {
    if (!this.data.styleId || !this.data.docNo) {
      wx.showToast({ title: '缺少参数', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      const [materialData, warehouses, products, categories] = await Promise.all([
        listDevMaterialRecords(this.data.styleId),
        fetchWarehousesAll().catch(() => []),
        fetchProductsAll().catch(() => []),
        fetchCategoriesAll().catch(() => []),
      ]);
      this._warehouses = Array.isArray(warehouses) ? warehouses : [];
      this._productMap = new Map((products || []).map((p) => [p.id, p]));
      this._categoryMap = new Map((categories || []).map((c) => [c.id, c]));
      const whName = {};
      this._warehouses.forEach((w) => {
        whName[w.id] = w.name || w.code || w.id;
      });
      this._whName = whName;

      const docs = (materialData && materialData.docs) || [];
      const doc = docs.find((d) => d.docNo === this.data.docNo);
      if (!doc) {
        this.setData({ loading: false, lines: [] });
        wx.showToast({ title: '单据不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }

      // 服务端 canIssue 与款式 developing 一致；若入口未传，以此兜底
      if (materialData && typeof materialData.canIssue === 'boolean' && !this.data.styleAllowsEdit) {
        const allows = Boolean(materialData.canIssue);
        this.setData({ styleAllowsEdit: allows });
        const ctx = readTenantCtx();
        const perms = (ctx && ctx.permissions) || [];
        const elevated = isTenantElevatedRole(ctx && ctx.tenantRole);
        const canEdit = allows && (elevated || hasPermission(perms, 'development:material_records:edit'));
        const canDelete = allows && (elevated || hasPermission(perms, 'development:material_records:delete'));
        this._canEdit = canEdit;
        this._canDelete = canDelete;
        this.setData({
          canEdit,
          canDelete,
          showFooter: canEdit || canDelete,
        });
      }

      let showBatchCol = false;
      const lines = (doc.lines || []).map((line) => {
        const product = this._productMap.get(line.productId);
        const cat = product ? this._categoryMap.get(product.categoryId) : null;
        const usesBatch = categoryUsesBatchManagement(cat) || Boolean(line.batchNo);
        if (usesBatch) showBatchCol = true;
        return {
          id: line.id,
          productId: line.productId,
          productName: line.productName || line.productId,
          productSku: line.productSku || '',
          showProductSku: Boolean(line.productName && line.productSku && line.productName !== line.productSku),
          quantity: Number(line.quantity) || 0,
          warehouseId: line.warehouseId || '',
          warehouseName: line.warehouseId ? whName[line.warehouseId] || line.warehouseId : '—',
          batchNo: line.batchNo || '',
          batchText: line.batchNo || '无批号',
          usesBatch: categoryUsesBatchManagement(cat),
        };
      });

      this._doc = doc;
      this.setData({
        loading: false,
        typeLabel: doc.type === 'STOCK_OUT' ? '领料' : '退料',
        timeText: doc.timestamp ? new Date(doc.timestamp).toLocaleString() : '',
        operator: doc.operator || '—',
        lines,
        showBatchCol,
        scrollHeight: computeScrollHeight(readNavBarMetrics(), this.data.showFooter || this.data.editing),
      });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
    }
  },

  onHeaderBack() {
    if (this.data.editing) {
      this.onCancelEdit();
      return;
    }
    wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/home/home' }) });
  },

  onEnterEdit() {
    if (!this._canEdit || !this._doc) return;
    const warehouseNames = this._warehouses.map((w) => w.name || w.code || w.id);
    const editLines = this.data.lines.map((line) => {
      const whIndex = Math.max(
        0,
        this._warehouses.findIndex((w) => w.id === line.warehouseId),
      );
      return {
        id: line.id,
        productId: line.productId,
        productName: line.productName,
        productSku: line.productSku,
        showProductSku: line.showProductSku,
        quantity: String(line.quantity),
        warehouseId: line.warehouseId || (this._warehouses[0] && this._warehouses[0].id) || '',
        warehouseName: line.warehouseName,
        warehouseIndex: whIndex,
        batchNo: line.batchNo || '',
        usesBatch: line.usesBatch,
      };
    });
    this.setData({
      editing: true,
      showFooter: true,
      warehouseNames,
      editLines,
      scrollHeight: computeScrollHeight(readNavBarMetrics(), true),
    });
  },

  onCancelEdit() {
    this.setData({
      editing: false,
      editLines: [],
      showFooter: this._canEdit || this._canDelete,
      scrollHeight: computeScrollHeight(readNavBarMetrics(), this._canEdit || this._canDelete),
    });
  },

  onLineQtyInput(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ [`editLines[${index}].quantity`]: e.detail.value || '' });
  },

  onLineBatchInput(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ [`editLines[${index}].batchNo`]: e.detail.value || '' });
  },

  onLineWarehouseChange(e) {
    const index = Number(e.currentTarget.dataset.index);
    const whIndex = Number(e.detail.value) || 0;
    const wh = this._warehouses[whIndex];
    if (!wh) return;
    this.setData({
      [`editLines[${index}].warehouseIndex`]: whIndex,
      [`editLines[${index}].warehouseId`]: wh.id,
      [`editLines[${index}].warehouseName`]: wh.name || wh.code || wh.id,
      [`editLines[${index}].batchNo`]: '',
    });
  },

  onRemoveLine(e) {
    const index = Number(e.currentTarget.dataset.index);
    const editLines = this.data.editLines.slice();
    if (editLines.length <= 1) {
      wx.showToast({ title: '至少保留一条明细', icon: 'none' });
      return;
    }
    editLines.splice(index, 1);
    this.setData({ editLines });
  },

  async onSaveEdit() {
    if (this.data.saving || !this._canEdit) return;
    const editLines = this.data.editLines || [];
    if (!editLines.length) {
      wx.showToast({ title: '至少保留一条明细', icon: 'none' });
      return;
    }
    const lines = [];
    for (let i = 0; i < editLines.length; i++) {
      const row = editLines[i];
      const qty = Number(row.quantity);
      if (!row.warehouseId) {
        wx.showToast({ title: `第 ${i + 1} 行请选择仓库`, icon: 'none' });
        return;
      }
      if (!(qty > 0)) {
        wx.showToast({ title: `第 ${i + 1} 行数量须大于 0`, icon: 'none' });
        return;
      }
      if (row.usesBatch && !String(row.batchNo || '').trim()) {
        wx.showToast({ title: `第 ${i + 1} 行须填写批次`, icon: 'none' });
        return;
      }
      lines.push({
        id: row.id,
        quantity: qty,
        warehouseId: row.warehouseId,
        batchNo: String(row.batchNo || '').trim() || null,
      });
    }

    this.setData({ saving: true });
    try {
      await updateDevMaterialDoc(this.data.styleId, this.data.docNo, {
        lines,
        operator: readOperatorDisplayName(),
        timestamp: datetimeLocalToTimestamp(toDatetimeLocal(this._doc && this._doc.timestamp)),
      });
      wx.showToast({ title: '已保存', icon: 'success' });
      this.setData({ editing: false, saving: false });
      await this.reload();
    } catch (err) {
      this.setData({ saving: false });
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
    }
  },

  onDeleteTap() {
    if (!this._canDelete || !this._doc) return;
    const label = this._doc.type === 'STOCK_OUT' ? '领料' : '退料';
    wx.showModal({
      title: '确认删除',
      content: `确定删除该张${label}单 ${this.data.docNo} 的全部明细？此操作不可恢复。`,
      confirmColor: '#e11d48',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await deleteDevMaterialDoc(this.data.styleId, this.data.docNo);
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 500);
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
        }
      },
    });
  },
});
