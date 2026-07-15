const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx,readOperatorDisplayName = _require.readOperatorDisplayName;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 = require('../config/salesOrders.js'),PSI_TYPE = _require3.PSI_TYPE;
const _require4 =



  require('../utils/salesOrders.js'),buildPendingShipmentGroups = _require4.buildPendingShipmentGroups,buildProductMap = _require4.buildProductMap,buildWarehouseMap = _require4.buildWarehouseMap;
const _require5 =


  require('../utils/salesOrderPendingShip.js'),buildSalesBillRecordsFromPending = _require5.buildSalesBillRecordsFromPending,buildShippedOrderUpdates = _require5.buildShippedOrderUpdates;
const _require6 =




  require('../../utils/psiApi.js'),fetchAllPsiRecords = _require6.fetchAllPsiRecords,createPsiRecordsBatch = _require6.createPsiRecordsBatch,replacePsiRecords = _require6.replacePsiRecords,nextPsiDocNumber = _require6.nextPsiDocNumber;
const _require7 = require('../../utils/planApi.js'),fetchProductsAll = _require7.fetchProductsAll;
const _require8 = require('../../utils/orderApi.js'),fetchWarehousesAll = _require8.fetchWarehousesAll;
const _require9 = require('../../utils/windowMetrics.js'),readNavBarMetrics = _require9.readNavBarMetrics,readWindowMetrics = _require9.readWindowMetrics;
const _require0 = require('../../utils/saveNavigation.js'),LIST_ROUTES = _require0.LIST_ROUTES,afterSaveReturnToList = _require0.afterSaveReturnToList,shouldHubListRefetch = _require0.shouldHubListRefetch,trackHubListHidden = _require0.trackHubListHidden;

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const toolsPx = Math.ceil(win.windowWidth / 750 * 96);
  return nav.statusBarHeight + nav.navBarHeight + toolsPx;
}

Page({
  data: {
    loading: true,
    submitting: false,
    rows: [],
    selectedCount: 0,
    searchKeyword: '',
    emptyText: '暂无待发货项，请先在销售订单中完成配货',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88
  },

  onLoad() {
    const nav = readNavBarMetrics();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav)
    });
  },

  onShow() {
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    const ctx = readTenantCtx();
    if (!hasPermission(ctx && ctx.permissions || [], 'psi:sales_order_pending_shipment:allow')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    if (shouldHubListRefetch(this, LIST_ROUTES.PSI_SALES_ORDER_PENDING_SHIP)) {
      this.bootstrap();
      return;
    }
    if (!this._bootstrapped) {
      this.bootstrap();
    }
  },

  onHide() {
    trackHubListHidden(this);
  },

  onPullDownRefresh() {
    this.bootstrap().finally(() => wx.stopPullDownRefresh());
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value || '' });
    this.applyFilter();
  },

  onSearchClear() {
    this.setData({ searchKeyword: '' });
    this.applyFilter();
  },

  onToggleSelect(e) {
    const groupKey = e.currentTarget.dataset.groupKey;
    this.toggleGroupSelection(groupKey);
  },

  onRowTap(e) {
    const groupKey = e.currentTarget.dataset.groupKey;
    this.toggleGroupSelection(groupKey);
  },

  onDetailTap(e) {
    const docNumber = e.currentTarget.dataset.docNumber;
    const lineGroupId = e.currentTarget.dataset.lineGroupId;
    if (!docNumber || !lineGroupId) return;
    wx.navigateTo({
      url: `/packagePsi/psi-sales-order-pending-ship-detail/psi-sales-order-pending-ship-detail?docNumber=${encodeURIComponent(docNumber)}&lineGroupId=${encodeURIComponent(lineGroupId)}`
    });
  },

  toggleGroupSelection(groupKey) {
    if (!groupKey) return;
    const group = (this._allGroups || []).find((g) => g.groupKey === groupKey);
    if (!group) return;
    const selected = { ...(this._selected || {}) };
    const isChecked = Boolean(selected[groupKey]);
    if (!isChecked && Object.keys(selected).length > 0) {
      const firstKey = Object.keys(selected)[0];
      const firstGroup = (this._allGroups || []).find((g) => g.groupKey === firstKey);
      if (
      firstGroup && (
      firstGroup.partner !== group.partner || firstGroup.warehouseId !== group.warehouseId))
      {
        wx.showToast({ title: '只能选同一客户、同一仓库', icon: 'none' });
        return;
      }
    }
    if (isChecked) delete selected[groupKey];else
    selected[groupKey] = true;
    this._selected = selected;
    this.syncSelectionUi();
  },

  onProductImageError(e) {
    const groupKey = e.currentTarget.dataset.groupKey;
    const rows = (this.data.rows || []).map((row) => {
      if (row.groupKey !== groupKey) return row;
      return { ...row, showProductImage: false };
    });
    this.setData({ rows });
  },

  syncSelectionUi() {
    const selected = this._selected || {};
    const rows = (this.data.rows || []).map((row) => ({
      ...row,
      checked: Boolean(selected[row.groupKey])
    }));
    const selectedCount = Object.keys(selected).length;
    this.setData({ rows, selectedCount });
  },

  applyFilter() {
    const kw = String(this.data.searchKeyword || '').trim().toLowerCase();
    let list = this._allGroups || [];
    if (kw) {
      list = list.filter((row) => {
        const fields = [row.docNumber, row.partner, row.productName, row.productSku, row.warehouseName];
        return fields.some((f) => f && String(f).toLowerCase().includes(kw));
      });
    }
    const selected = this._selected || {};
    const rows = list.map((row) => ({
      ...row,
      checked: Boolean(selected[row.groupKey]),
      qtyText: `${row.totalQuantity} PCS`
    }));
    this.setData({
      rows,
      emptyText: list.length ? '' : this._allGroups && this._allGroups.length ? '无匹配项' : '暂无待发货项，请先在销售订单中完成配货'
    });
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const _await$Promise$all = await Promise.all([
        fetchAllPsiRecords(PSI_TYPE),
        fetchProductsAll().catch(() => []),
        fetchWarehousesAll().catch(() => [])]
        ),records = _await$Promise$all[0],products = _await$Promise$all[1],warehousesRaw = _await$Promise$all[2];
      const whList = Array.isArray(warehousesRaw) ? warehousesRaw : warehousesRaw.data || [];
      this._allRecords = records || [];
      this._allGroups = buildPendingShipmentGroups(
        this._allRecords,
        buildProductMap(products || []),
        buildWarehouseMap(whList)
      );
      this._selected = {};
      this._bootstrapped = true;
      this.setData({ loading: false, selectedCount: 0 });
      this.applyFilter();
    } catch (err) {
      this.setData({ loading: false, rows: [] });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  async onGenerateBill() {
    if (this.data.submitting) return;
    const selectedKeys = Object.keys(this._selected || {}).filter((k) => this._selected[k]);
    if (!selectedKeys.length) {
      wx.showToast({ title: '请先选择待发货项', icon: 'none' });
      return;
    }
    const selectedGroups = (this._allGroups || []).filter((g) => selectedKeys.includes(g.groupKey));
    const selectedRecords = selectedGroups.flatMap((g) => g.records || []);
    const first = selectedRecords[0];
    const partnerName = first && first.partner;
    const partnerId = first && first.partnerId || '';
    const warehouseId = first && (first.allocationWarehouseId || first.warehouseId) || '';
    if (!partnerName || !warehouseId) {
      wx.showToast({ title: '缺少客户或仓库信息', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '生成中…' });
    try {
      const docRes = await nextPsiDocNumber({
        prefix: 'XS',
        psiType: 'SALES_BILL',
        partnerId,
        partnerName,
        legacyPrefixes: ['SB']
      });
      const docNumber = docRes && docRes.docNumber || '';
      if (!docNumber) throw new Error('no doc number');

      const operator = readOperatorDisplayName();
      const billRecords = buildSalesBillRecordsFromPending(selectedRecords, docNumber, operator);
      await createPsiRecordsBatch(billRecords);

      const docNumbersToUpdate = [...new Set(selectedRecords.map((r) => r.docNumber))];
      for (const docNum of docNumbersToUpdate) {
        const docRecords = (this._allRecords || []).filter(
          (r) => r.type === PSI_TYPE && r.docNumber === docNum
        );
        const shippedIds = selectedRecords.filter((r) => r.docNumber === docNum).map((r) => r.id);
        const newRecords = buildShippedOrderUpdates(docRecords, shippedIds);
        const deleteIds = docRecords.map((r) => r.id);
        await replacePsiRecords(deleteIds, newRecords);
      }

      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showModal({
        title: '销售单已生成',
        content: `单号 ${docNumber}，共 ${billRecords.length} 条明细`,
        showCancel: false,
        success: () => {
          afterSaveReturnToList({
            listUrl: LIST_ROUTES.PSI_SALES_ORDERS,
            toastTitle: '',
            delay: 0
          });
        }
      });
    } catch (err) {
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: '生成失败', icon: 'none' });
    }
  }
});