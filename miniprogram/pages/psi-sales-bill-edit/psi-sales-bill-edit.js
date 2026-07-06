const { readTenantCtx, readOperatorDisplayName } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { PSI_TYPE } = require('../../config/salesBills.js');
const {
  buildInitialForm,
  createEmptyLine,
  recordsToLineItems,
  enrichLineForUi,
  computeFormTotals,
  validateSalesBillSave,
  buildSalesBillSaveRecords,
  resolvePreferredWarehouse,
  writeWarehousePreference,
} = require('../../utils/salesBillForm.js');
const { attachMergeBatchesToLine } = require('../../utils/purchaseBillBatch.js');
const { buildProductMap, buildCategoryMap } = require('../../utils/purchaseOrders.js');
const { groupRecordsByDocNumber } = require('../../utils/psiOpsAggregators.js');
const { resolveDefaultSalesPrice } = require('../../utils/psiPartnerProductLastPrice.js');
const {
  fetchAllPsiRecords,
  createPsiRecordsBatch,
  replacePsiRecords,
  deletePsiRecords,
  nextPsiDocNumber,
} = require('../../utils/psiApi.js');
const {
  fetchProductsAll,
  fetchCategoriesAll,
  fetchPartnersAll,
  fetchPartnerCategoriesAll,
  fetchDictionaries,
} = require('../../utils/planApi.js');
const { fetchWarehousesAll } = require('../../utils/orderApi.js');
const { normalizeAppDictionaries, normalizeMasterList } = require('../../utils/productionPlans.js');
const {
  activateMatrixKeyboardCell,
  applyMatrixKeyboardKey,
  buildMatrixKeyboardPreview,
  createMatrixKeyboardInputSession,
  getNextMatrixVariantIdInColumn,
  getNextMatrixVariantIdInRow,
} = require('../../utils/matrixQtyKeyboard.js');
const { readNavBarMetrics, readWindowMetrics, computePlanCreateHeaderHeight } = require('../../utils/windowMetrics.js');
const { afterMatrixKeyboardOpen } = require('../../utils/matrixKeyboardLayout.js');
const { LIST_ROUTES, afterSaveReturnToList } = require('../../utils/saveNavigation.js');

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
    title: '登记销售单',
    form: buildInitialForm(),
    lines: [],
    products: [],
    categories: [],
    partners: [],
    partnerCategories: [],
    warehouseNames: [],
    warehouseIndex: 0,
    totalQtyText: '0 PCS',
    totalAmountText: '',
    showAmount: false,
    canSubmit: false,
    canDelete: false,
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
      title: editing ? '编辑销售单' : '登记销售单',
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      scrollHeight: computeScrollHeight(nav),
      showAmount: hasPermission((ctx && ctx.permissions) || [], 'psi:sales_bill:amount'),
      canDelete: editing && hasPermission((ctx && ctx.permissions) || [], 'psi:sales_bill:delete'),
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
        salesBills, purchaseBills,
      ] = await Promise.all([
        fetchProductsAll(),
        fetchCategoriesAll(),
        fetchPartnersAll(),
        fetchPartnerCategoriesAll(),
        fetchDictionaries().catch(() => ({})),
        fetchWarehousesAll().catch(() => []),
        fetchAllPsiRecords(PSI_TYPE).catch(() => []),
        fetchAllPsiRecords('PURCHASE_BILL').catch(() => []),
      ]);

      this._products = normalizeMasterList(products);
      this._categories = normalizeMasterList(categories);
      this._productMap = buildProductMap(this._products);
      this._categoryMap = buildCategoryMap(this._categories);
      this._dictionaries = normalizeAppDictionaries(dictionaries);
      this._allRecords = salesBills || [];
      this._priceRecords = [...(salesBills || []), ...(purchaseBills || [])];
      this._psiRecordsForBatch = this._priceRecords;

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
          wx.showToast({ title: '未找到销售单', icon: 'none' });
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

      this._lines = lines.length ? lines : [createEmptyLine()];
      this._form = form;

      this.setData({
        loading: false,
        form,
        warehouseNames,
        warehouseIndex: this._editingDocNumber
          ? Math.max(0, whList.findIndex((w) => w.id === form.warehouseId))
          : warehouseIndex,
        products: this._products,
        categories: this._categories,
        partners: normalizeMasterList(partners),
        partnerCategories: normalizeMasterList(partnerCategories),
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
      canSubmit: totals.canSubmit && Boolean(String(this._form.partner || '').trim()),
    });
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
  },

  onPartnerChange(e) {
    const { name, id } = e.detail || {};
    this._form = { ...this._form, partner: name || '', partnerId: id || '' };
    this.refreshLinesUi();
    if (!this._editingDocNumber && name) {
      nextPsiDocNumber({
        prefix: 'XS',
        psiType: 'SALES_BILL',
        partnerId: id,
        partnerName: name,
        legacyPrefixes: ['SB'],
      }).then((res) => {
        if (res && res.docNumber) {
          this._form = { ...this._form, docNumber: res.docNumber };
          this.setData({ form: this._form });
        }
      }).catch(() => {});
    }
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
    const line = this._lines.find((l) => l.id === lineId);
    if (line && line.productId && this._form.partner) {
      const price = resolveDefaultSalesPrice(
        this._priceRecords || [],
        this._form.partnerId,
        this._form.partner,
        line.productId,
        this._productMap,
        this._editingDocNumber || '',
      );
      this._lines = this._lines.map((l) => {
        if (l.id !== lineId) return l;
        return { ...l, salesPrice: String(price) };
      });
    }
    this.refreshLinesUi();
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
      return { ...l, salesPrice: e.detail.value };
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

  async resolveDocNumber(partnerId, partnerName) {
    if (this._editingDocNumber) return this._editingDocNumber;
    try {
      const res = await nextPsiDocNumber({
        prefix: 'XS',
        psiType: 'SALES_BILL',
        partnerId,
        partnerName,
        legacyPrefixes: ['SB'],
      });
      return (res && res.docNumber) || '';
    } catch {
      return '';
    }
  },

  async onSubmit() {
    if (this.data.submitting) return;
    if (!validateSalesBillSave(this._form, this._lines, {
      psiRecordsForBatch: this._psiRecordsForBatch,
    })) return;

    let docNumber = this._form.docNumber;
    if (!docNumber) {
      docNumber = await this.resolveDocNumber(this._form.partnerId, this._form.partner);
      if (!docNumber) {
        wx.showToast({ title: '生成单号失败', icon: 'none' });
        return;
      }
    }

    const operator = readOperatorDisplayName();
    const uiCtx = {
      productMap: this._productMap,
      categoryMap: this._categoryMap,
      dictionaries: this._dictionaries,
      showAmount: this.data.showAmount,
    };
    const linesForSave = (this._lines || []).map((l) => enrichLineForUi(l, uiCtx));

    const newRecords = buildSalesBillSaveRecords({
      form: this._form,
      lines: linesForSave,
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
        listUrl: LIST_ROUTES.PSI_SALES_BILLS,
        toastTitle: '保存成功',
      });
    } catch (err) {
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  onDeleteTap() {
    if (!this.data.canDelete || !this._deleteIds || !this._deleteIds.length) return;
    wx.showModal({
      title: '删除销售单',
      content: `确定删除 ${this._editingDocNumber}？`,
      confirmColor: '#ef4444',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中…' });
        deletePsiRecords(this._deleteIds)
          .then(() => {
            wx.hideLoading();
            afterSaveReturnToList({
              listUrl: LIST_ROUTES.PSI_SALES_BILLS,
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
