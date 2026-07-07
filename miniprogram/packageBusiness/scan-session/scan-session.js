const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { getScanType } = require('../../config/scanTypes.js');
const { normalizeListBody } = require('../../utils/listResponse.js');
const { parseScanPayload, getUnrecognizedScanImeHint } = require('../utils/scanPayload.js');
const { request } = require('../../utils/request.js');
const { fetchScanByPayload, fetchProductionRecords } = require('../utils/scanApi.js');
const { failScan } = require('../utils/scanCommon.js');
const { dispatchScanHandler } = require('../utils/scanHandlers/index.js');
const {
  buildOutsourceReceiveAggregates,
  filterAggregatesByPartner,
} = require('../utils/outsourceReceiveAggregates.js');
const { buildOutsourcePartnerOptions } = require('../utils/outsourcePartnerOptions.js');
const { listReworkNodeIdsWithPending } = require('../utils/reworkReportPathsLite.js');
const {
  SCAN_DEBOUNCE_CONTINUOUS_MS,
  ensureCameraAuth,
  openAppSetting,
  vibrateOnScan,
} = require('../utils/scanCamera.js');

const WAREHOUSE_PREF_KEY = 'scanStockInWarehouseId';

function decodeOpt(v) {
  if (v == null || v === '') return '';
  try {
    return decodeURIComponent(String(v));
  } catch {
    return String(v);
  }
}

function buildSessionTitle(scanType, typeLabel, ctx) {
  const parts = [typeLabel];
  if (scanType === 'report' && ctx.nodeName) parts.push(ctx.nodeName);
  if (scanType === 'outsource' && ctx.partnerName) parts.push(ctx.partnerName);
  if (scanType === 'rework' && ctx.reworkNodeName) parts.push(ctx.reworkNodeName);
  if (scanType === 'stock_in' && ctx.defaultWarehouseName) parts.push(ctx.defaultWarehouseName);
  return parts.join(' · ');
}

Page({
  data: {
    scanType: '',
    typeLabel: '',
    pageTitle: '扫码',
    nodeId: '',
    nodeName: '',
    reportNodes: [],
    partnerName: '',
    partnerOptions: [],
    partnerCategories: [],
    defaultWarehouseId: '',
    defaultWarehouseName: '',
    reworkNodeId: '',
    reworkNodeName: '',
    reworkNodes: [],
    scanning: false,
    processing: false,
    useCamera: false,
    cameraDenied: false,
    cameraReady: false,
    isDevtools: false,
    sessionLogs: [],
  },

  onLoad(options) {
    this._scanLock = false;
    this._globalNodes = [];
    this._orders = [];
    this._ordersById = new Map();
    this._allPartners = [];
    this._allOutsourceAggregates = [];
    this._pendingOutsourceRows = [];
    this._reworkRecords = [];

    const scanType = options.type || '';
    const typeDef = getScanType(scanType);
    if (!typeDef) {
      wx.showToast({ title: '无效的扫码类型', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    const session = {
      scanType,
      typeLabel: typeDef.label,
      nodeId: decodeOpt(options.nodeId),
      nodeName: decodeOpt(options.nodeName),
      partnerName: decodeOpt(options.partnerName),
      reworkNodeId: decodeOpt(options.reworkNodeId),
      reworkNodeName: decodeOpt(options.reworkNodeName),
      pageTitle: typeDef.label,
    };

    this.setData(session);
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
    const typeDef = getScanType(this.data.scanType);
    if (!typeDef || !hasPermission(ctx.permissions, typeDef.permission)) {
      wx.showToast({ title: '无权限进行此操作', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._tenantCtx = ctx;
    this.loadRuntimeData();
    this.initCamera();
  },

  onHide() {
    this.setData({ useCamera: false, cameraReady: false });
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  updatePageTitle() {
    const { scanType, typeLabel } = this.data;
    this.setData({
      pageTitle: buildSessionTitle(scanType, typeLabel, this.data),
    });
  },

  onReportNodeChange(e) {
    const { id, name } = e.detail || {};
    this.setData({ nodeId: id || '', nodeName: name || '' }, () => this.updatePageTitle());
  },

  onReworkNodeChange(e) {
    const { id, name } = e.detail || {};
    this.setData({ reworkNodeId: id || '', reworkNodeName: name || '' }, () => this.updatePageTitle());
  },

  onPartnerChange(e) {
    const { name } = e.detail || {};
    this.setData({ partnerName: name || '' }, () => {
      this.updatePageTitle();
      this.refreshOutsourcePending();
    });
  },

  guardScanConditions() {
    const { scanType, nodeId, reworkNodeId, partnerName } = this.data;
    if (scanType === 'report' && !nodeId) {
      wx.showToast({ title: '请先选择工序', icon: 'none' });
      return false;
    }
    if (scanType === 'rework' && !reworkNodeId) {
      wx.showToast({ title: '请先选择返工工序', icon: 'none' });
      return false;
    }
    if (scanType === 'outsource' && !partnerName) {
      wx.showToast({ title: '请先选择加工厂', icon: 'none' });
      return false;
    }
    return true;
  },

  async loadRuntimeData() {
    const { scanType } = this.data;
    try {
      if (scanType === 'report') {
        await Promise.all([this.loadReportOrders(), this.loadReportNodes()]);
      }
      if (scanType === 'stock_in') {
        await this.loadStockInRuntime();
      }
      if (scanType === 'outsource') {
        await this.loadOutsourceData();
        await this.loadOutsourcePickerData();
        this.refreshOutsourcePending();
      }
      if (scanType === 'rework') {
        await this.loadReworkRuntime();
        this.refreshReworkNodeOptions();
      }
    } catch {
      /* ignore */
    }
  },

  async loadReportOrders() {
    const orders = await request({
      path: '/orders?all=true&excludeCompleted=true',
      method: 'GET',
    }).catch(() => []);
    this._orders = normalizeListBody(orders);
  },

  async loadReportNodes() {
    const nodes = await request({ path: '/settings/nodes?all=true', method: 'GET' }).catch(() => []);
    const nodeList = normalizeListBody(nodes);
    this._globalNodes = nodeList;
    this.setData({
      reportNodes: nodeList.map((n) => ({ id: n.id, name: n.name })),
    });
  },

  async loadStockInRuntime() {
    const [orders, wh] = await Promise.all([
      request({
        path: '/orders?all=true&lite=true&excludeCompleted=true',
        method: 'GET',
      }).catch(() => []),
      request({ path: '/settings/warehouses?all=true', method: 'GET' }).catch(() => []),
    ]);
    this._orders = normalizeListBody(orders);
    const warehouses = normalizeListBody(wh);
    const savedId = wx.getStorageSync(WAREHOUSE_PREF_KEY) || '';
    let defaultWarehouseId = '';
    let defaultWarehouseName = '';
    if (savedId) {
      const saved = warehouses.find((w) => w.id === savedId);
      if (saved) {
        defaultWarehouseId = saved.id;
        defaultWarehouseName = saved.name;
      }
    }
    if (!defaultWarehouseId && warehouses.length > 0) {
      defaultWarehouseId = warehouses[0].id;
      defaultWarehouseName = warehouses[0].name;
    }
    this.setData({ defaultWarehouseId, defaultWarehouseName }, () => this.updatePageTitle());
  },

  async loadOutsourceData() {
    const [records, orders, nodes] = await Promise.all([
      fetchProductionRecords({ type: 'OUTSOURCE', all: 'true' }).catch(() => []),
      request({ path: '/orders?all=true&lite=true', method: 'GET' }).catch(() => []),
      request({ path: '/settings/nodes?all=true', method: 'GET' }).catch(() => []),
    ]);
    const orderList = normalizeListBody(orders);
    const nodeList = normalizeListBody(nodes);
    const recordList = normalizeListBody(records);
    const ordersById = new Map(orderList.map((o) => [o.id, o]));
    const productsById = new Map();
    orderList.forEach((o) => {
      if (o.productId) productsById.set(o.productId, { name: o.productName });
    });
    const nodesById = new Map(nodeList.map((n) => [n.id, n]));
    this._globalNodes = nodeList;
    this._ordersById = ordersById;
    const outsourceOnly = recordList.filter((r) => !r.sourceReworkId);
    this._allOutsourceAggregates = buildOutsourceReceiveAggregates(
      outsourceOnly,
      ordersById,
      productsById,
      nodesById,
    );
  },

  async loadOutsourcePickerData() {
    const [partners, categories] = await Promise.all([
      request({ path: '/master/partners?all=true', method: 'GET' }).catch(() => []),
      request({ path: '/settings/partner-categories?all=true', method: 'GET' }).catch(() => []),
    ]);
    this._allPartners = normalizeListBody(partners);
    const partnerCategories = normalizeListBody(categories);
    const partnerOptions = buildOutsourcePartnerOptions(
      this._allOutsourceAggregates,
      this._allPartners,
    );
    this.setData({ partnerOptions, partnerCategories });
  },

  refreshOutsourcePending() {
    const { partnerName } = this.data;
    const filtered = filterAggregatesByPartner(this._allOutsourceAggregates, partnerName);
    this._pendingOutsourceRows = filtered.filter((r) => r.pending > 0);
  },

  async loadReworkRuntime() {
    const [records, nodes] = await Promise.all([
      fetchProductionRecords({
        types: 'REWORK,REWORK_REPORT',
        all: 'true',
      }).catch(() => []),
      request({ path: '/settings/nodes?all=true', method: 'GET' }).catch(() => []),
    ]);
    this._reworkRecords = normalizeListBody(records);
    this._globalNodes = normalizeListBody(nodes);
  },

  refreshReworkNodeOptions() {
    const nodeIds = listReworkNodeIdsWithPending(
      this._reworkRecords,
      undefined,
      this._globalNodes,
    );
    const reworkNodes = nodeIds.map((id) => {
      const n = this._globalNodes.find((g) => g.id === id);
      return { id, name: n?.name || id };
    });
    this.setData({ reworkNodes });
  },

  async reloadOutsourceRecords() {
    const records = await fetchProductionRecords({ type: 'OUTSOURCE', all: 'true' }).catch(() => []);
    const recordList = normalizeListBody(records);
    const outsourceOnly = recordList.filter((r) => !r.sourceReworkId);
    const ordersById = this._ordersById || new Map();
    const productsById = new Map();
    ordersById.forEach((o) => {
      if (o.productId) productsById.set(o.productId, { name: o.productName });
    });
    const nodesById = new Map((this._globalNodes || []).map((n) => [n.id, n]));
    this._allOutsourceAggregates = buildOutsourceReceiveAggregates(
      outsourceOnly,
      ordersById,
      productsById,
      nodesById,
    );
    const partnerOptions = buildOutsourcePartnerOptions(
      this._allOutsourceAggregates,
      this._allPartners,
    );
    this.setData({ partnerOptions });
    this.refreshOutsourcePending();
  },

  async initCamera() {
    const auth = await ensureCameraAuth();
    if (auth === 'devtools') {
      this.setData({ isDevtools: true, useCamera: false, cameraDenied: false, cameraReady: false });
      return;
    }
    if (auth === 'granted') {
      this.setData({
        isDevtools: false,
        useCamera: true,
        cameraDenied: false,
        cameraReady: true,
      });
      return;
    }
    this.setData({ isDevtools: false, useCamera: false, cameraDenied: true, cameraReady: false });
  },

  onCameraError() {
    this.setData({ useCamera: false, cameraDenied: true, cameraReady: false });
  },

  onCameraScan(e) {
    if (this._scanLock || !this.data.cameraReady || this.data.processing) return;
    if (!this.guardScanConditions()) return;
    const code = e.detail && e.detail.result;
    if (!code) return;
    this._scanLock = true;
    this.handleScanResult(code);
    setTimeout(() => {
      this._scanLock = false;
    }, SCAN_DEBOUNCE_CONTINUOUS_MS);
  },

  onOpenSetting() {
    openAppSetting();
    setTimeout(() => this.initCamera(), 500);
  },

  onFallbackScan() {
    if (this.data.scanning || this.data.processing) return;
    if (!this.guardScanConditions()) return;
    this.setData({ scanning: true });
    wx.scanCode({
      onlyFromCamera: false,
      success: (res) => this.handleScanResult(res.result || ''),
      fail: () => wx.showToast({ title: '扫码已取消', icon: 'none' }),
      complete: () => this.setData({ scanning: false }),
    });
  },

  appendSessionLog(log) {
    if (!log) return;
    const sessionLogs = [log, ...this.data.sessionLogs].slice(0, 50);
    this.setData({ sessionLogs });
  },

  buildHandlerCtx() {
    const d = this.data;
    return {
      scanType: d.scanType,
      typeLabel: d.typeLabel,
      tenantCtx: this._tenantCtx,
      nodeId: d.nodeId,
      nodeName: d.nodeName,
      partnerName: d.partnerName,
      warehouseId: d.defaultWarehouseId,
      warehouseName: d.defaultWarehouseName,
      defaultWarehouseId: d.defaultWarehouseId,
      defaultWarehouseName: d.defaultWarehouseName,
      reworkNodeId: d.reworkNodeId,
      reworkNodeName: d.reworkNodeName,
      orders: this._orders || [],
      pendingRows: this._pendingOutsourceRows,
      allAggregates: this._allOutsourceAggregates,
      reworkRecords: this._reworkRecords,
      globalNodes: this._globalNodes,
    };
  },

  async handleScanResult(raw) {
    const code = String(raw).trim();
    if (!code || this.data.processing) return;
    if (!this.guardScanConditions()) return;

    const payload = parseScanPayload(code);
    const { scanType } = this.data;
    const ctx = this.buildHandlerCtx();

    if (payload.kind === 'UNKNOWN' || !payload.token) {
      const result = failScan(ctx, code, '无法识别扫码内容');
      this.appendSessionLog(result.sessionLog);
      if (getUnrecognizedScanImeHint(code)) {
        setTimeout(
          () => wx.showToast({ title: getUnrecognizedScanImeHint(code), icon: 'none', duration: 3000 }),
          2600,
        );
      }
      return;
    }

    this.setData({ processing: true });

    try {
      const scanRes = await fetchScanByPayload(payload);
      const result = await dispatchScanHandler(scanType, this.buildHandlerCtx(), scanRes, payload);

      if (result && result.sessionLog) {
        this.appendSessionLog(result.sessionLog);
      }

      if (result && result.ok) {
        vibrateOnScan();
        if (result.toast) wx.showToast({ title: result.toast, icon: 'success' });
        if (result.reloadOutsource) {
          await this.reloadOutsourceRecords();
        }
        if (result.reloadRework) {
          await this.loadReworkRuntime();
          this.refreshReworkNodeOptions();
        }
      }
    } catch (err) {
      const result = failScan(ctx, payload.raw, (err && err.message) || '扫码处理失败');
      this.appendSessionLog(result.sessionLog);
    } finally {
      this.setData({ processing: false });
      if (!this.data.useCamera) {
        setTimeout(() => this.onFallbackScan(), SCAN_DEBOUNCE_CONTINUOUS_MS);
      }
    }
  },
});
