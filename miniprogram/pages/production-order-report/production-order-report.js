const { readTenantCtx } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const {
  normalizeMasterList,
  normalizeAppDictionaries,
  variantLabel,
} = require('../../utils/productionPlans.js');
const { getProductUnitName } = require('../../utils/planFormCustomField.js');
const {
  getEffectiveReportTemplate,
  buildReportCustomFields,
  buildInitialReportCustomData,
  buildCustomDataPayload,
  normalizeWorkersList,
  filterEntitiesForNode,
  needEquipmentOnReport,
  buildQtyHintText,
  resolveReportFormMode,
  buildVariantRemainingMap,
  buildReportMatrixLayout,
  buildMultiVariantRows,
  parseNonNegativeInt,
  parsePositiveInt,
  sumMatrixQuantities,
  validateReportCustomFields,
  buildSubmitEntries,
  computeCanSubmit,
} = require('../../utils/orderReportForm.js');
const {
  getOrder,
  getOrderReportable,
  createOrderReport,
  fetchTenantConfig,
  fetchProductsAll,
  fetchCategoriesAll,
  fetchNodesAll,
  fetchWorkersForReport,
} = require('../../utils/orderApi.js');
const {
  fetchEquipmentAll,
  fetchDictionaries,
} = require('../../utils/planApi.js');
const { readNavBarMetrics, readWindowMetrics } = require('../../utils/windowMetrics.js');
const {
  applyMatrixKeyPress,
  buildMatrixKeyboardPreview,
  getNextMatrixVariantIdInColumn,
  getNextMatrixVariantIdInRow,
} = require('../../utils/matrixQtyKeyboard.js');

function computeHeaderBlockHeight(nav) {
  const win = readWindowMetrics();
  const tailPx = Math.ceil((win.windowWidth / 750) * 16);
  return nav.statusBarHeight + nav.navBarHeight + tailPx;
}

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  const rpx = win.windowWidth / 750;
  const footerPx = Math.ceil(128 * rpx) + (win.safeAreaBottom || 0);
  const headerPx = computeHeaderBlockHeight(nav);
  return Math.max(200, (win.windowHeight || 667) - headerPx - footerPx);
}

function findEquipmentIndex(equipment, equipmentId) {
  if (!equipmentId) return 0;
  const idx = (equipment || []).findIndex((e) => e.id === equipmentId);
  return idx >= 0 ? idx : 0;
}

function findVariantIndex(variantOptions, variantId) {
  if (!variantId) return 0;
  const idx = (variantOptions || []).findIndex((v) => v.id === variantId);
  return idx >= 0 ? idx : 0;
}

Page({
  data: {
    loading: true,
    submitting: false,
    orderId: '',
    milestoneId: '',
    orderNumber: '',
    productName: '',
    milestoneName: '',
    qtyHint: '',
    unitName: '件',
    formMode: 'single',
    useVariantMatrix: false,
    matrixLayout: null,
    variantRows: [],
    singleQuantity: '1',
    singleDefectiveQty: '0',
    variantOptions: [],
    variantPickerIndex: 0,
    variantId: '',
    variantLabel: '',
    workers: [],
    processNodes: [],
    currentNodeId: '',
    workerId: '',
    workerName: '',
    equipment: [],
    equipmentNames: [],
    equipmentPickerIndex: 0,
    equipmentId: '',
    equipmentName: '',
    needEquipment: false,
    reportCustomFields: [],
    customData: {},
    remaining: 0,
    allowExceedMaxReportQty: false,
    canSubmit: false,
    qtyInputMode: 'good',
    matrixKeyboardVisible: false,
    activeMatrixVariantId: '',
    matrixKeyboardLabel: '',
    matrixKeyboardValue: '',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
  },

  _quantities: {},
  _defectiveQuantities: {},

  onLoad(options) {
    const nav = readNavBarMetrics();
    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      scrollHeight: computeScrollHeight(nav),
      orderId: options.orderId ? decodeURIComponent(options.orderId) : '',
      milestoneId: options.milestoneId ? decodeURIComponent(options.milestoneId) : '',
    });

    if (!this.data.orderId || !this.data.milestoneId) {
      wx.showToast({ title: '参数不完整', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.bootstrap();
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
    if (!hasPermission(ctx.permissions || [], 'production:orders_report_records:create')) {
      wx.showToast({ title: '无报工权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
    }
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  async bootstrap() {
    const { orderId, milestoneId } = this.data;
    const ctx = readTenantCtx();
    try {
      const [
        config,
        order,
        reportableRaw,
        productsRaw,
        categoriesRaw,
        nodesRaw,
        workersRaw,
        equipmentRaw,
        dictionariesRaw,
      ] = await Promise.all([
        fetchTenantConfig(),
        getOrder(orderId),
        getOrderReportable(orderId),
        fetchProductsAll(),
        fetchCategoriesAll(),
        fetchNodesAll(),
        fetchWorkersForReport(ctx && ctx.tenantId),
        fetchEquipmentAll(),
        fetchDictionaries(),
      ]);

      const products = normalizeMasterList(productsRaw);
      const categories = normalizeMasterList(categoriesRaw);
      const globalNodes = normalizeMasterList(nodesRaw);
      const dictionaries = normalizeAppDictionaries(dictionariesRaw);
      const product = products.find((p) => p.id === order.productId) || null;
      const category = product && product.categoryId
        ? categories.find((c) => c.id === product.categoryId)
        : null;
      const milestone = (order.milestones || []).find((m) => m.id === milestoneId);
      if (!milestone) {
        wx.showToast({ title: '工序不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }

      const reportableList = Array.isArray(reportableRaw)
        ? reportableRaw
        : (reportableRaw && reportableRaw.milestones) || [];
      const reportable = reportableList.find(
        (m) => m.milestoneId === milestoneId || m.id === milestoneId,
      );
      const remaining = reportable && reportable.remaining != null
        ? Math.max(0, Number(reportable.remaining))
        : 0;

      const equipmentFeaturesEnabled = readTenantCtx()?.equipmentFeaturesEnabled !== false;
      const needEquipment = needEquipmentOnReport(
        globalNodes,
        milestone.templateId,
        equipmentFeaturesEnabled,
      );

      const template = getEffectiveReportTemplate(milestone, globalNodes);
      const reportCustomFields = buildReportCustomFields(template);
      const customData = buildInitialReportCustomData(reportCustomFields, product);
      const unitName = getProductUnitName(product, dictionaries);
      const qtyHint = buildQtyHintText(reportable, unitName);

      const orderItems = order.items || [];
      const formMode = resolveReportFormMode(product, category, orderItems);
      const variantRemainingMap = buildVariantRemainingMap(orderItems, milestone.reports || []);

      const workersNormalized = normalizeWorkersList(workersRaw).filter(
        (w) => !w.status || w.status === 'ACTIVE',
      );
      const processNodes = globalNodes.map((n) => ({ id: n.id, name: n.name || n.id }));
      const equipment = needEquipment
        ? filterEntitiesForNode(equipmentRaw, milestone.templateId)
        : [];
      const equipmentNames = equipment.map((e) => e.name || e.code || e.id);

      this._order = order;
      this._milestone = milestone;
      this._product = product;
      this._category = category;
      this._dictionaries = dictionaries;
      this._reportCustomFields = reportCustomFields;
      this._variantRemainingMap = variantRemainingMap;
      this._tenantDisplayName = readTenantCtx()?.displayName || readTenantCtx()?.tenantName || '';

      this._quantities = {};
      this._defectiveQuantities = {};

      let singleQuantity = remaining > 0 ? String(Math.min(1, remaining)) : '0';
      let variantOptions = [];
      let variantId = '';
      let variantLabelText = '';
      let matrixLayout = null;
      let variantRows = [];

      if (formMode === 'matrix' && product) {
        matrixLayout = buildReportMatrixLayout(product, dictionaries, this._quantities, this._defectiveQuantities);
      } else if (formMode === 'multi' && product) {
        variantRows = buildMultiVariantRows(
          product,
          category,
          dictionaries,
          orderItems,
          this._quantities,
          this._defectiveQuantities,
        );
      } else if (formMode === 'single') {
        const uniqueVariantIds = [...new Set(orderItems.map((it) => it.variantId).filter(Boolean))];
        if (uniqueVariantIds.length === 1) {
          variantId = uniqueVariantIds[0];
        } else if (uniqueVariantIds.length > 1) {
          variantOptions = uniqueVariantIds.map((vid) => {
            const variant = (product && product.variants || []).find((v) => v.id === vid);
            return {
              id: vid,
              label: variant ? variantLabel(variant, dictionaries) : vid,
            };
          });
          variantId = variantOptions[0].id;
          variantLabelText = variantOptions[0].label;
        }
      }

      const statePatch = {
        loading: false,
        orderNumber: order.orderNumber || '',
        productName: order.productName || (product && product.name) || '',
        milestoneName: milestone.name || '',
        qtyHint,
        unitName,
        formMode,
        useVariantMatrix: formMode === 'matrix',
        matrixLayout,
        variantRows,
        singleQuantity,
        singleDefectiveQty: '0',
        variantOptions,
        variantPickerIndex: findVariantIndex(variantOptions, variantId),
        variantId,
        variantLabel: variantLabelText,
        workers: workersNormalized,
        processNodes,
        currentNodeId: milestone.templateId,
        workerId: '',
        workerName: '',
        equipment,
        equipmentNames,
        equipmentPickerIndex: 0,
        equipmentId: '',
        equipmentName: '',
        needEquipment,
        reportCustomFields,
        customData,
        remaining,
        allowExceedMaxReportQty: !!(config && config.allowExceedMaxReportQty),
        qtyInputMode: 'good',
      };

      this.setData(statePatch);
      this.refreshCanSubmit();
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1200);
    }
  },

  refreshCanSubmit() {
    const canSubmit = computeCanSubmit({
      workerId: this.data.workerId,
      needEquipment: this.data.needEquipment,
      equipmentId: this.data.equipmentId,
      formMode: this.data.formMode,
      singleQuantity: this.data.singleQuantity,
      singleDefectiveQty: this.data.singleDefectiveQty,
      variantId: this.data.variantId,
      quantities: this._quantities,
      defectiveQuantities: this._defectiveQuantities,
      variantRows: this.data.variantRows,
    });
    if (canSubmit !== this.data.canSubmit) {
      this.setData({ canSubmit });
    }
  },

  onWorkerChange(e) {
    const { id, name } = e.detail || {};
    if (!id) return;
    this.setData({
      workerId: id,
      workerName: name || '',
    });
    this.refreshCanSubmit();
  },

  onEquipmentChange(e) {
    const idx = Number(e.detail.value) || 0;
    const eq = (this.data.equipment || [])[idx];
    if (!eq) return;
    this.setData({
      equipmentPickerIndex: idx,
      equipmentId: eq.id,
      equipmentName: eq.name || eq.code || '',
    });
    this.refreshCanSubmit();
  },

  onVariantChange(e) {
    const idx = Number(e.detail.value) || 0;
    const opt = (this.data.variantOptions || [])[idx];
    if (!opt) return;
    this.setData({
      variantPickerIndex: idx,
      variantId: opt.id,
      variantLabel: opt.label,
    });
    this.refreshCanSubmit();
  },

  onSingleQtyInput(e) {
    this.setData({ singleQuantity: e.detail.value || '' });
    this.refreshCanSubmit();
  },

  onSingleDefectiveInput(e) {
    this.setData({ singleDefectiveQty: e.detail.value || '' });
    this.refreshCanSubmit();
  },

  onSingleQtyStep(e) {
    const delta = Number(e.currentTarget.dataset.delta) || 0;
    const { remaining, allowExceedMaxReportQty } = this.data;
    let next = parsePositiveInt(this.data.singleQuantity, 1) + delta;
    if (next < 0) next = 0;
    if (!allowExceedMaxReportQty && remaining > 0 && next > remaining) next = remaining;
    this.setData({ singleQuantity: String(next) });
    this.refreshCanSubmit();
  },

  onSingleDefectiveStep(e) {
    const delta = Number(e.currentTarget.dataset.delta) || 0;
    let next = parseNonNegativeInt(this.data.singleDefectiveQty, 0) + delta;
    if (next < 0) next = 0;
    this.setData({ singleDefectiveQty: String(next) });
    this.refreshCanSubmit();
  },

  rebuildMatrixLayout() {
    this.setData({
      matrixLayout: buildReportMatrixLayout(
        this._product,
        this._dictionaries,
        this._quantities,
        this._defectiveQuantities,
      ),
    });
    this.syncMatrixKeyboardPreview();
    this.refreshCanSubmit();
  },

  syncMatrixKeyboardPreview(variantId) {
    const id = variantId !== undefined ? variantId : this.data.activeMatrixVariantId;
    const preview = buildMatrixKeyboardPreview(this.data.matrixLayout, id, this.getActiveMatrixQtyMap());
    this.setData({
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value,
    });
  },

  getActiveMatrixQtyMap() {
    return this.data.qtyInputMode === 'defective' ? this._defectiveQuantities : this._quantities;
  },

  setActiveMatrixQty(variantId, value) {
    if (this.data.qtyInputMode === 'defective') {
      this._defectiveQuantities[variantId] = value;
    } else {
      this._quantities[variantId] = value;
    }
  },

  onMatrixCellTap(e) {
    const { variantId } = e.currentTarget.dataset;
    if (!variantId) return;
    const preview = buildMatrixKeyboardPreview(
      this.data.matrixLayout,
      variantId,
      this.getActiveMatrixQtyMap(),
    );
    this.setData({
      matrixKeyboardVisible: true,
      activeMatrixVariantId: variantId,
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value,
    });
  },

  onMatrixKeyboardAction(e) {
    const { action, digit } = e.detail || {};
    if (action === 'confirm') {
      this.setData({
        matrixKeyboardVisible: false,
        activeMatrixVariantId: '',
        matrixKeyboardLabel: '',
        matrixKeyboardValue: '',
      });
      return;
    }
    const { activeMatrixVariantId, matrixLayout } = this.data;
    const qtyMap = this.getActiveMatrixQtyMap();
    if (action === 'enter') {
      const nextId = getNextMatrixVariantIdInRow(matrixLayout, activeMatrixVariantId);
      if (nextId) {
        const preview = buildMatrixKeyboardPreview(matrixLayout, nextId, qtyMap);
        this.setData({
          activeMatrixVariantId: nextId,
          matrixKeyboardLabel: preview.label,
          matrixKeyboardValue: preview.value,
        });
      } else {
        this.setData({
          matrixKeyboardVisible: false,
          activeMatrixVariantId: '',
          matrixKeyboardLabel: '',
          matrixKeyboardValue: '',
        });
      }
      return;
    }
    if (action === 'next') {
      const nextId = getNextMatrixVariantIdInColumn(matrixLayout, activeMatrixVariantId);
      if (nextId) {
        const preview = buildMatrixKeyboardPreview(matrixLayout, nextId, qtyMap);
        this.setData({
          activeMatrixVariantId: nextId,
          matrixKeyboardLabel: preview.label,
          matrixKeyboardValue: preview.value,
        });
      } else {
        this.setData({
          matrixKeyboardVisible: false,
          activeMatrixVariantId: '',
          matrixKeyboardLabel: '',
          matrixKeyboardValue: '',
        });
      }
      return;
    }
    if (!activeMatrixVariantId) return;
    const current = qtyMap[activeMatrixVariantId] || '';
    this.setActiveMatrixQty(activeMatrixVariantId, applyMatrixKeyPress(current, action, digit));
    this.rebuildMatrixLayout();
  },

  onVariantRowQtyInput(e) {
    const { index } = e.currentTarget.dataset;
    const idx = Number(index);
    if (!Number.isFinite(idx)) return;
    const rows = (this.data.variantRows || []).slice();
    if (!rows[idx]) return;
    rows[idx] = { ...rows[idx], quantity: e.detail.value || '' };
    this.setData({ variantRows: rows });
    this.refreshCanSubmit();
  },

  onVariantRowDefectiveInput(e) {
    const { index } = e.currentTarget.dataset;
    const idx = Number(index);
    if (!Number.isFinite(idx)) return;
    const rows = (this.data.variantRows || []).slice();
    if (!rows[idx]) return;
    rows[idx] = { ...rows[idx], defectiveQty: e.detail.value || '' };
    this.setData({ variantRows: rows });
    this.refreshCanSubmit();
  },

  onCustomDataChange(e) {
    const customData = (e.detail && e.detail.customData) || {};
    this.setData({ customData });
    this.refreshCanSubmit();
  },

  onQtyModeTap(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode !== 'good' && mode !== 'defective') return;
    if (mode === this.data.qtyInputMode) return;
    this.setData({
      qtyInputMode: mode,
      matrixKeyboardVisible: false,
      activeMatrixVariantId: '',
      matrixKeyboardLabel: '',
      matrixKeyboardValue: '',
    });
  },

  onGoScan() {
    const app = getApp();
    if (app.globalData) {
      app.globalData.scanPreset = {
        type: 'report',
        nodeId: this.data.milestoneId,
        nodeName: this.data.milestoneName,
        orderId: this.data.orderId,
      };
    }
    wx.switchTab({ url: '/pages/scan/scan' });
  },

  async onSubmit() {
    if (this.data.submitting || !this.data.canSubmit) return;

    const customErr = validateReportCustomFields(this._reportCustomFields, this.data.customData);
    if (customErr) {
      wx.showToast({ title: customErr, icon: 'none' });
      return;
    }

    if (!this.data.workerId) {
      wx.showToast({ title: '请选择生产人员', icon: 'none' });
      return;
    }
    if (this.data.needEquipment && !this.data.equipmentId) {
      wx.showToast({ title: '请选择设备', icon: 'none' });
      return;
    }

    const entries = buildSubmitEntries({
      formMode: this.data.formMode,
      singleQuantity: this.data.singleQuantity,
      singleDefectiveQty: this.data.singleDefectiveQty,
      variantId: this.data.variantId,
      quantities: this._quantities,
      defectiveQuantities: this._defectiveQuantities,
      variantRows: this.data.variantRows,
    });

    if (!entries.length) {
      wx.showToast({ title: '请填写报工数量', icon: 'none' });
      return;
    }

    const totalGood = entries.reduce((s, e) => s + e.quantity, 0);
    const { remaining, allowExceedMaxReportQty } = this.data;
    if (!allowExceedMaxReportQty && remaining > 0 && totalGood > remaining) {
      wx.showToast({ title: `良品最多可报 ${remaining} ${this.data.unitName}`, icon: 'none' });
      return;
    }

    const customData = buildCustomDataPayload(this._reportCustomFields, this.data.customData);
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const operator = this._tenantDisplayName || '';

    this.setData({ submitting: true });
    try {
      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        await createOrderReport(this.data.orderId, this.data.milestoneId, {
          quantity: entry.quantity,
          defectiveQuantity: entry.defectiveQuantity > 0 ? entry.defectiveQuantity : undefined,
          variantId: entry.variantId || undefined,
          workerId: this.data.workerId,
          equipmentId: this.data.equipmentId || undefined,
          customData: customData || {},
          reportBatchId: batchId,
          operator,
        });
      }
      wx.showToast({ title: '报工成功', icon: 'success' });
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/production-orders/production-orders' });
      }, 400);
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '报工失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
