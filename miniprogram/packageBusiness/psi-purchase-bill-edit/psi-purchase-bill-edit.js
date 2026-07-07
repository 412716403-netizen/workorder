const { readTenantCtx, readOperatorDisplayName } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { PSI_TYPE, PSI_ORDER_TYPE } = require('../config/purchaseBills.js');
const {
  buildInitialForm,
  createEmptyLine,
  recordsToLineItems,
  enrichLineForUi,
  computeFormTotals,
  validatePurchaseBillSave,
  validateFromOrderConvert,
  buildPurchaseBillSaveRecords,
  buildConvertFromOrderRecords,
  buildPendingPoDocs,
  filterPendingPoDocs,
  resolvePreferredWarehouse,
  writeWarehousePreference,
  applyLastPurchasePrices,
} = require('../utils/purchaseBillForm.js');
const { attachMergeBatchesToLine } = require('../utils/purchaseBillBatch.js');
const { buildProductMap, buildCategoryMap } = require('../utils/purchaseOrders.js');
const { groupRecordsByDocNumber, sumReceivedByOrderLine } = require('../utils/psiOpsAggregators.js');
const {
  fetchAllPsiRecords,
  createPsiRecordsBatch,
  replacePsiRecords,
  deletePsiRecords,
  nextPsiDocNumber,
  lastPurchasePrices,
} = require('../utils/psiApi.js');
const {
  fetchProductsAll,
  fetchCategoriesAll,
  fetchPartnersAll,
  fetchPartnerCategoriesAll,
  fetchDictionaries,
} = require('../utils/planApi.js');
const { fetchWarehousesAll } = require('../utils/orderApi.js');
const { normalizeAppDictionaries, normalizeMasterList } = require('../utils/productionPlans.js');
const {
  activateMatrixKeyboardCell,
  applyMatrixKeyboardKey,
  buildMatrixKeyboardPreview,
  createMatrixKeyboardInputSession,
  getNextMatrixVariantIdInColumn,
  getNextMatrixVariantIdInRow,
} = require('../utils/matrixQtyKeyboard.js');
const { readNavBarMetrics, readWindowMetrics, computePlanCreateHeaderHeight } = require('../../utils/windowMetrics.js');
const { afterMatrixKeyboardOpen } = require('../utils/matrixKeyboardLayout.js');
const { LIST_ROUTES, afterSaveReturnToList } = require('../utils/saveNavigation.js');

function computeHeaderBlockHeight(nav) {
  return computePlanCreateHeaderHeight(nav);
}

function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  const rpx = win.windowWidth / 750;
  const footerPx = Math.ceil(128 * rpx) + (win.safeAreaBottom || 0);
  const headerPx = computeHeaderBlockHeight(nav);
  return Math.max(200, (win.windowHeight || 667) - headerPx - footerPx);
}

function emptyMatrixKeyboardState() {
  return {
    matrixKeyboardVisible: false,
    matrixInputReplaceAll: false,
    activeMatrixVariantId: '',
    activeLineId: '',
    matrixKeyboardLabel: '',
    matrixKeyboardValue: '',
  };
}

Page({
  data: {
    loading: true,
    submitting: false,
    editing: false,
    title: '登记采购入库',
    creationMethod: 'MANUAL',
    form: buildInitialForm(),
    lines: [],
    products: [],
    categories: [],
    partners: [],
    partnerCategories: [],
    warehouses: [],
    warehouseNames: [],
    warehouseIndex: 0,
    pendingPoDocs: [],
    fromOrderSearch: '',
    totalQtyText: '0 PCS',
    totalAmountText: '',
    showAmount: false,
    canSubmit: false,
    canDelete: false,
    selectedFromOrderCount: 0,
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 500,
    matrixScrollTop: 0,
    ...emptyMatrixKeyboardState(),
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    const docNumber = options.docNumber ? decodeURIComponent(options.docNumber) : '';
    const ctx = readTenantCtx();
    const editing = Boolean(docNumber);
    this._editingDocNumber = docNumber;
    this._matrixKbInput = createMatrixKeyboardInputSession();
    this.setData({
      editing,
      title: editing ? '编辑采购入库' : '登记采购入库',
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      scrollHeight: computeScrollHeight(nav),
      showAmount: hasPermission((ctx && ctx.permissions) || [], 'psi:purchase_bill:amount'),
      canDelete: editing && hasPermission((ctx && ctx.permissions) || [], 'psi:purchase_bill:delete'),
    });
    this.bootstrap();
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const [
        products, categories, partners, partnerCategories, dictionaries, warehouses,
        purchaseBills, purchaseOrders,
      ] = await Promise.all([
        fetchProductsAll(),
        fetchCategoriesAll(),
        fetchPartnersAll(),
        fetchPartnerCategoriesAll(),
        fetchDictionaries().catch(() => ({})),
        fetchWarehousesAll().catch(() => []),
        fetchAllPsiRecords(PSI_TYPE).catch(() => []),
        fetchAllPsiRecords(PSI_ORDER_TYPE).catch(() => []),
      ]);

      this._products = normalizeMasterList(products);
      this._categories = normalizeMasterList(categories);
      this._productMap = buildProductMap(this._products);
      this._categoryMap = buildCategoryMap(this._categories);
      this._dictionaries = normalizeAppDictionaries(dictionaries);
      this._psiRecordsForBatch = purchaseBills || [];
      this._allRecords = purchaseBills || [];
      this._purchaseOrders = purchaseOrders || [];
      this._receivedByOrderLine = sumReceivedByOrderLine(purchaseBills || []);

      const whList = Array.isArray(warehouses) ? warehouses : (warehouses.data || []);
      this._warehouses = whList;
      const warehouseNames = whList.map((w) => w.name || w.id);
      const preferred = resolvePreferredWarehouse(whList);
      const warehouseIndex = preferred
        ? Math.max(0, whList.findIndex((w) => w.id === preferred.id))
        : 0;

      let form = buildInitialForm();
      let lines = [createEmptyLine()];
      if (this._editingDocNumber) {
        const groups = groupRecordsByDocNumber(this._allRecords, PSI_TYPE);
        const items = groups[this._editingDocNumber];
        if (!items || !items.length) {
          wx.showToast({ title: '未找到入库单', icon: 'none' });
          setTimeout(() => wx.navigateBack(), 800);
          return;
        }
        const first = items[0];
        const whIdx = first.warehouseId
          ? Math.max(0, whList.findIndex((w) => w.id === first.warehouseId))
          : warehouseIndex;
        form = {
          partner: first.partner || '',
          partnerId: first.partnerId || '',
          warehouseId: first.warehouseId || (whList[whIdx] && whList[whIdx].id) || '',
          warehouseName: (whList[whIdx] && whList[whIdx].name) || '',
          docNumber: this._editingDocNumber,
          operator: first.operator || '',
          note: first.note || '',
        };
        lines = recordsToLineItems(items);
        this._deleteIds = items.map((r) => r.id);
      } else {
        const wh = whList[warehouseIndex];
        form = {
          ...form,
          warehouseId: (wh && wh.id) || '',
          warehouseName: (wh && wh.name) || '',
        };
      }

      this._lines = lines;
      this._form = form;
      this._pendingPoDocs = !this._editingDocNumber
        ? buildPendingPoDocs(this._purchaseOrders, this._receivedByOrderLine, {
          productMap: this._productMap,
          categoryMap: this._categoryMap,
          dictionaries: this._dictionaries,
          receivedByOrderLine: this._receivedByOrderLine,
          showAmount: this.data.showAmount,
        })
        : [];

      this.setData({
        loading: false,
        form,
        warehouses: whList,
        warehouseNames,
        warehouseIndex: this._editingDocNumber
          ? Math.max(0, whList.findIndex((w) => w.id === form.warehouseId))
          : warehouseIndex,
        products: this._products,
        categories: this._categories,
        partners: partners || [],
        partnerCategories: partnerCategories || [],
        pendingPoDocs: this._pendingPoDocs,
      });
      this.refreshLinesUi();
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  refreshLinesUi() {
    const ctx = {
      productMap: this._productMap,
      categoryMap: this._categoryMap,
      dictionaries: this._dictionaries,
      showAmount: this.data.showAmount,
    };
    const whId = (this._form && this._form.warehouseId) || '';
    const lines = (this._lines || []).map((l) => {
      const enriched = enrichLineForUi(l, ctx);
      return attachMergeBatchesToLine(enriched, this._psiRecordsForBatch, whId);
    });
    const totals = computeFormTotals(this._lines, this.data.showAmount);
    this.setData({
      lines,
      form: this._form,
      totalQtyText: totals.totalQtyText,
      totalAmountText: totals.totalAmountText,
      canSubmit: totals.canSubmit,
    });
  },

  refreshPendingPoUi() {
    const whId = (this._form && this._form.warehouseId) || '';
    const filtered = filterPendingPoDocs(this._pendingPoDocs, this.data.fromOrderSearch).map((doc) => ({
      ...doc,
      lines: (doc.lines || []).map((line) =>
        attachMergeBatchesToLine(line, this._psiRecordsForBatch, whId)),
    }));
    let selectedFromOrderCount = 0;
    filtered.forEach((doc) => {
      (doc.lines || []).forEach((l) => {
        if (l.selected) selectedFromOrderCount += 1;
      });
    });
    this.setData({ pendingPoDocs: filtered, selectedFromOrderCount });
  },

  onCreationMethodTap(e) {
    if (this.data.editing) return;
    const method = e.currentTarget.dataset.method;
    if (!method || method === this.data.creationMethod) return;
    this.setData({ creationMethod: method });
  },

  onWarehouseChange(e) {
    const idx = Number(e.detail.value) || 0;
    const wh = (this._warehouses || [])[idx];
    if (!wh) return;
    this._form = {
      ...this._form,
      warehouseId: wh.id,
      warehouseName: wh.name || wh.id,
    };
    writeWarehousePreference(wh.id);
    this.setData({ warehouseIndex: idx, form: this._form });
    this.refreshLinesUi();
    this.refreshPendingPoUi();
  },

  onPartnerChange(e) {
    const { name, id } = e.detail || {};
    this._form = { ...this._form, partner: name || '', partnerId: id || '' };
    this.refreshLinesUi();
  },

  onAddLine() {
    this._lines = [...(this._lines || []), createEmptyLine()];
    this.refreshLinesUi();
  },

  onRemoveLine(e) {
    const lineId = e.currentTarget.dataset.lineId;
    this._lines = (this._lines || []).filter((l) => l.id !== lineId);
    if (!this._lines.length) this._lines = [createEmptyLine()];
    this.refreshLinesUi();
  },

  onLineProductChange(e) {
    const lineId = e.currentTarget.dataset.lineId;
    const { id, name } = e.detail || {};
    this._lines = (this._lines || []).map((l) => {
      if (l.id !== lineId) return l;
      return {
        ...l,
        productId: id || '',
        productName: name || '',
        variantQuantities: {},
        quantity: '',
        batch: '',
      };
    });
    this.refreshLinesUi();
    const line = this._lines.find((l) => l.id === lineId);
    if (line && line.productId && this._form.partnerId) {
      lastPurchasePrices([{ productId: line.productId, partnerId: this._form.partnerId }])
        .then((prices) => {
          this._lines = applyLastPurchasePrices(this._lines, prices);
          this.refreshLinesUi();
        })
        .catch(() => {});
    }
  },

  onLineQtyInput(e) {
    const lineId = e.currentTarget.dataset.lineId;
    this._lines = (this._lines || []).map((l) => {
      if (l.id !== lineId) return l;
      return { ...l, quantity: e.detail.value };
    });
    this.refreshLinesUi();
  },

  onLinePriceInput(e) {
    const lineId = e.currentTarget.dataset.lineId;
    this._lines = (this._lines || []).map((l) => {
      if (l.id !== lineId) return l;
      return { ...l, purchasePrice: e.detail.value };
    });
    this.refreshLinesUi();
  },

  onLineBatchChange(e) {
    const lineId = e.currentTarget.dataset.lineId;
    const value = e.detail && e.detail.value != null ? String(e.detail.value) : '';
    this._lines = (this._lines || []).map((l) => {
      if (l.id !== lineId) return l;
      return { ...l, batch: value };
    });
    this.refreshLinesUi();
  },

  onMatrixCellTap(e) {
    const lineId = e.currentTarget.dataset.lineId;
    const variantId = e.currentTarget.dataset.variantId;
    const uiLine = (this.data.lines || []).find((l) => l.id === lineId);
    if (!uiLine || !variantId || !uiLine.matrixLayout) return;
    activateMatrixKeyboardCell(this._matrixKbInput);
    const preview = buildMatrixKeyboardPreview(
      uiLine.matrixLayout,
      variantId,
      uiLine.variantQuantities || {},
    );
    this.setData({
      matrixKeyboardVisible: true,
      matrixInputReplaceAll: true,
      activeLineId: lineId,
      activeMatrixVariantId: variantId,
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value,
    }, () => {
      afterMatrixKeyboardOpen(this, '.plan-create-scroll');
    });
  },

  onMatrixKeyboardAction(e) {
    const { action, digit } = e.detail || {};
    if (action === 'confirm') {
      this.setData(emptyMatrixKeyboardState());
      return;
    }
    const lineId = this.data.activeLineId;
    const variantId = this.data.activeMatrixVariantId;
    const rawLine = (this._lines || []).find((l) => l.id === lineId);
    const uiLine = (this.data.lines || []).find((l) => l.id === lineId);
    if (!rawLine || !uiLine || !variantId || !uiLine.matrixLayout) return;
    const matrixLayout = uiLine.matrixLayout;

    if (action === 'enter') {
      const nextId = getNextMatrixVariantIdInRow(matrixLayout, variantId);
      if (nextId) {
        activateMatrixKeyboardCell(this._matrixKbInput);
        const preview = buildMatrixKeyboardPreview(matrixLayout, nextId, rawLine.variantQuantities || {});
        this.setData({
          activeMatrixVariantId: nextId,
          matrixInputReplaceAll: true,
          matrixKeyboardLabel: preview.label,
          matrixKeyboardValue: preview.value,
        }, () => afterMatrixKeyboardOpen(this, '.plan-create-scroll'));
      } else {
        this.setData(emptyMatrixKeyboardState());
      }
      return;
    }
    if (action === 'next') {
      const nextId = getNextMatrixVariantIdInColumn(matrixLayout, variantId);
      if (nextId) {
        activateMatrixKeyboardCell(this._matrixKbInput);
        const preview = buildMatrixKeyboardPreview(matrixLayout, nextId, rawLine.variantQuantities || {});
        this.setData({
          activeMatrixVariantId: nextId,
          matrixInputReplaceAll: true,
          matrixKeyboardLabel: preview.label,
          matrixKeyboardValue: preview.value,
        }, () => afterMatrixKeyboardOpen(this, '.plan-create-scroll'));
      } else {
        this.setData(emptyMatrixKeyboardState());
      }
      return;
    }

    const vq = rawLine.variantQuantities || {};
    const currentRaw = vq[variantId] != null ? String(vq[variantId]) : '';
    const { value, replaceConsumed } = applyMatrixKeyboardKey(
      this._matrixKbInput,
      currentRaw,
      action,
      digit,
    );
    const parsed = value === '' || value === '-.' ? 0 : Number(value);
    const qty = Number.isFinite(parsed) ? parsed : 0;
    const nextVq = { ...vq, [variantId]: qty };
    this._lines = (this._lines || []).map((l) => {
      if (l.id !== lineId) return l;
      return { ...l, variantQuantities: nextVq };
    });
    this.setData({
      matrixKeyboardValue: value,
      matrixInputReplaceAll: replaceConsumed ? false : this.data.matrixInputReplaceAll,
    });
    this.refreshLinesUi();
  },

  onFromOrderSearchInput(e) {
    this.setData({ fromOrderSearch: e.detail.value || '' });
    this.refreshPendingPoUi();
  },

  onPoDocToggle(e) {
    const docNumber = e.currentTarget.dataset.docNumber;
    this._pendingPoDocs = (this._pendingPoDocs || []).map((doc) => {
      if (doc.docNumber !== docNumber) return doc;
      return { ...doc, expanded: !doc.expanded };
    });
    this.refreshPendingPoUi();
  },

  onPoLineToggle(e) {
    const { docNumber, lineId } = e.currentTarget.dataset;
    this._pendingPoDocs = (this._pendingPoDocs || []).map((doc) => {
      if (doc.docNumber !== docNumber) return doc;
      return {
        ...doc,
        lines: (doc.lines || []).map((l) => {
          if (l.id !== lineId) return l;
          return { ...l, selected: !l.selected };
        }),
      };
    });
    this.refreshPendingPoUi();
  },

  onPoLineQtyInput(e) {
    const { docNumber, lineId } = e.currentTarget.dataset;
    const val = e.detail.value;
    this._pendingPoDocs = (this._pendingPoDocs || []).map((doc) => {
      if (doc.docNumber !== docNumber) return doc;
      return {
        ...doc,
        lines: (doc.lines || []).map((l) => {
          if (l.id !== lineId) return l;
          return { ...l, qty: val, selected: true };
        }),
      };
    });
    this.refreshPendingPoUi();
  },

  onPoLinePriceInput(e) {
    const { docNumber, lineId } = e.currentTarget.dataset;
    const val = e.detail.value;
    this._pendingPoDocs = (this._pendingPoDocs || []).map((doc) => {
      if (doc.docNumber !== docNumber) return doc;
      return {
        ...doc,
        lines: (doc.lines || []).map((l) => {
          if (l.id !== lineId) return l;
          return { ...l, purchasePrice: val };
        }),
      };
    });
    this.refreshPendingPoUi();
  },

  onPoLineBatchChange(e) {
    const { docNumber, lineId } = e.currentTarget.dataset;
    const val = e.detail && e.detail.value != null ? String(e.detail.value) : '';
    this._pendingPoDocs = (this._pendingPoDocs || []).map((doc) => {
      if (doc.docNumber !== docNumber) return doc;
      return {
        ...doc,
        lines: (doc.lines || []).map((l) => {
          if (l.id !== lineId) return l;
          return { ...l, batch: val };
        }),
      };
    });
    this.refreshPendingPoUi();
  },

  collectSelectedFromOrderLines() {
    const selected = [];
    (this._pendingPoDocs || []).forEach((doc) => {
      (doc.lines || []).forEach((l) => {
        if (!l.selected) return;
        const qty = Number(l.qty) || 0;
        if (qty <= 0) return;
        const poItem = (this._purchaseOrders || []).find((r) => r.id === l.id);
        selected.push({
          ...l,
          docNumber: doc.docNumber,
          partner: doc.partner,
          partnerId: poItem && poItem.partnerId ? poItem.partnerId : '',
        });
      });
    });
    return selected;
  },

  async resolveDocNumber(partnerId, partnerName) {
    if (this._editingDocNumber) return this._editingDocNumber;
    try {
      const res = await nextPsiDocNumber({
        prefix: 'PB',
        psiType: 'PURCHASE_BILL',
        partnerId,
        partnerName,
      });
      return (res && res.docNumber) || '';
    } catch {
      return '';
    }
  },

  async onSubmit() {
    if (this.data.submitting) return;

    if (this.data.creationMethod === 'FROM_ORDER' && !this.data.editing) {
      return this.onSubmitFromOrder();
    }

    if (!validatePurchaseBillSave(this._form, this._lines)) return;

    let docNumber = this._form.docNumber;
    if (!docNumber) {
      docNumber = await this.resolveDocNumber(this._form.partnerId, this._form.partner);
      if (!docNumber) {
        wx.showToast({ title: '生成单号失败', icon: 'none' });
        return;
      }
    }

    const operator = readOperatorDisplayName();
    const newRecords = buildPurchaseBillSaveRecords({
      form: this._form,
      lines: this._lines,
      docNumber,
      editingDocNumber: this._editingDocNumber,
      existingRecords: this._allRecords,
      operator,
    });
    if (!newRecords.length) {
      wx.showToast({ title: '明细数量不能为 0', icon: 'none' });
      return;
    }

    writeWarehousePreference(this._form.warehouseId);
    this.setData({ submitting: true });
    wx.showLoading({ title: '保存中…' });
    try {
      if (this._editingDocNumber) {
        await replacePsiRecords(this._deleteIds || [], newRecords);
      } else {
        await createPsiRecordsBatch(newRecords);
      }
      wx.hideLoading();
      this.setData({ submitting: false });
      afterSaveReturnToList({
        listUrl: LIST_ROUTES.PSI_PURCHASE_BILLS,
        toastTitle: '保存成功',
      });
    } catch (err) {
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  async onSubmitFromOrder() {
    if (this.data.submitting) return;
    const selectedLines = this.collectSelectedFromOrderLines();
    if (!validateFromOrderConvert(this._form, selectedLines)) return;

    const first = selectedLines[0];
    let docNumber = await this.resolveDocNumber(
      first.partnerId || this._form.partnerId,
      first.partner || this._form.partner,
    );
    if (!docNumber) {
      wx.showToast({ title: '生成单号失败', icon: 'none' });
      return;
    }

    const operator = readOperatorDisplayName();
    const newRecords = buildConvertFromOrderRecords({
      form: {
        ...this._form,
        partner: first.partner || this._form.partner,
        partnerId: first.partnerId || this._form.partnerId,
      },
      selectedLines,
      docNumber,
      operator,
    });
    if (!newRecords.length) {
      wx.showToast({ title: '入库数量须大于 0', icon: 'none' });
      return;
    }

    writeWarehousePreference(this._form.warehouseId);
    this.setData({ submitting: true });
    wx.showLoading({ title: '入库中…' });
    try {
      await createPsiRecordsBatch(newRecords);
      wx.hideLoading();
      this.setData({ submitting: false });
      afterSaveReturnToList({
        listUrl: LIST_ROUTES.PSI_PURCHASE_BILLS,
        toastTitle: '入库成功',
      });
    } catch (err) {
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: '入库失败', icon: 'none' });
    }
  },

  onDeleteTap() {
    if (!this.data.canDelete || !this._deleteIds || !this._deleteIds.length) return;
    wx.showModal({
      title: '删除采购入库',
      content: `确定删除 ${this._editingDocNumber}？`,
      confirmColor: '#ef4444',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中…' });
        deletePsiRecords(this._deleteIds)
          .then(() => {
            wx.hideLoading();
            afterSaveReturnToList({
              listUrl: LIST_ROUTES.PSI_PURCHASE_BILLS,
              toastTitle: '已删除',
            });
          })
          .catch(() => {
            wx.hideLoading();
            wx.showToast({ title: '删除失败', icon: 'none' });
          });
      },
    });
  },
});
