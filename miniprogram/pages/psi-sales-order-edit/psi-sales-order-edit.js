const { readTenantCtx, readOperatorDisplayName } = require('../../utils/session.js');
const { hasPermission } = require('../../utils/permissions.js');
const { PSI_TYPE } = require('../../config/salesOrders.js');
const {
  buildInitialForm,
  createEmptyLine,
  recordsToLineItems,
  enrichLineForUi,
  computeFormTotals,
  validateSalesOrderSave,
  buildSalesOrderSaveRecords,
  applyDefaultSalesPrices,
} = require('../../utils/salesOrderForm.js');
const { buildProductMap, buildCategoryMap } = require('../../utils/salesOrders.js');
const { groupRecordsByDocNumber } = require('../../utils/psiOpsAggregators.js');
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
const { resolveDefaultSalesPrice } = require('../../utils/psiPartnerProductLastPrice.js');

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
    title: '登记销售订单',
    form: buildInitialForm(),
    lines: [],
    products: [],
    categories: [],
    partners: [],
    partnerCategories: [],
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
      title: editing ? '编辑销售订单' : '登记销售订单',
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeHeaderBlockHeight(nav),
      scrollHeight: computeScrollHeight(nav),
      showAmount: hasPermission((ctx && ctx.permissions) || [], 'psi:sales_order:amount'),
      canDelete: editing && hasPermission((ctx && ctx.permissions) || [], 'psi:sales_order:delete'),
    });
    this.bootstrap();
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const needPriceRecords = !this._editingDocNumber;
      const [products, categories, partners, partnerCategories, dictionaries, records, priceRecords] = await Promise.all([
        fetchProductsAll(),
        fetchCategoriesAll(),
        fetchPartnersAll(),
        fetchPartnerCategoriesAll(),
        fetchDictionaries().catch(() => ({})),
        this._editingDocNumber ? fetchAllPsiRecords(PSI_TYPE) : Promise.resolve([]),
        needPriceRecords
          ? Promise.all([fetchAllPsiRecords(PSI_TYPE), fetchAllPsiRecords('SALES_BILL')]).then(([a, b]) => [...(a || []), ...(b || [])])
          : Promise.resolve([]),
      ]);
      this._products = normalizeMasterList(products);
      this._categories = normalizeMasterList(categories);
      this._productMap = buildProductMap(this._products);
      this._categoryMap = buildCategoryMap(this._categories);
      this._dictionaries = normalizeAppDictionaries(dictionaries);
      this._allRecords = records || [];
      this._priceRecords = needPriceRecords ? priceRecords : records;

      let form = buildInitialForm();
      let lines = [createEmptyLine()];
      if (this._editingDocNumber) {
        const groups = groupRecordsByDocNumber(this._allRecords, PSI_TYPE);
        const items = groups[this._editingDocNumber];
        if (!items || !items.length) {
          wx.showToast({ title: '未找到订单', icon: 'none' });
          setTimeout(() => wx.navigateBack(), 800);
          return;
        }
        const first = items[0];
        form = {
          partner: first.partner || '',
          partnerId: first.partnerId || '',
          docNumber: this._editingDocNumber,
          operator: first.operator || '',
        };
        this._deleteIds = items.map((r) => r.id);
        lines = recordsToLineItems(items);
        if (!lines.length) lines = [createEmptyLine()];
      }

      this._lines = lines;
      this.setData({
        loading: false,
        form,
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
    const uiLines = (this._lines || []).map((line) => enrichLineForUi(line, ctx));
    const totals = computeFormTotals(this._lines, this.data.showAmount);
    this.setData({
      lines: uiLines,
      totalQtyText: totals.totalQtyText,
      totalAmountText: totals.totalAmountText,
      showAmount: totals.showAmount,
      canSubmit: totals.canSubmit && Boolean(String(this.data.form.partner || '').trim()),
    });
  },

  onPartnerChange(e) {
    const detail = e.detail || {};
    const form = {
      ...this.data.form,
      partner: detail.name || detail.value || '',
      partnerId: detail.id || '',
    };
    this.setData({ form });
    if (!this._editingDocNumber && form.partner) {
      this._lines = applyDefaultSalesPrices(
        this._lines,
        this._priceRecords || [],
        form,
        this._productMap,
        '',
      );
    }
    this.refreshLinesUi();
    if (!this._editingDocNumber && form.partner) {
      nextPsiDocNumber({
        prefix: 'SO',
        psiType: 'SALES_ORDER',
        partnerId: form.partnerId,
        partnerName: form.partner,
      }).then((res) => {
        if (res && res.docNumber) {
          this.setData({ form: { ...form, docNumber: res.docNumber } });
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
    const next = (this._lines || []).filter((l) => l.id !== lineId);
    this._lines = next.length ? next : [createEmptyLine()];
    this.refreshLinesUi();
  },

  async onLineProductChange(e) {
    const lineId = e.currentTarget.dataset.lineId;
    const detail = e.detail || {};
    const productId = detail.id || '';
    this._lines = (this._lines || []).map((line) => {
      if (line.id !== lineId) return line;
      return {
        ...line,
        productId,
        productName: detail.name || '',
        quantity: '',
        variantQuantities: {},
      };
    });
    if (productId && this.data.form.partner) {
      const price = resolveDefaultSalesPrice(
        this._priceRecords || this._allRecords || [],
        this.data.form.partnerId,
        this.data.form.partner,
        productId,
        this._productMap,
        this._editingDocNumber || '',
      );
      this._lines = this._lines.map((line) => {
        if (line.id !== lineId) return line;
        return { ...line, salesPrice: String(price) };
      });
    }
    this.refreshLinesUi();
  },

  onLineQtyInput(e) {
    const lineId = e.currentTarget.dataset.lineId;
    const value = e.detail.value || '';
    this._lines = (this._lines || []).map((line) => {
      if (line.id !== lineId) return line;
      return { ...line, quantity: value };
    });
    this.refreshLinesUi();
  },

  onLinePriceInput(e) {
    const lineId = e.currentTarget.dataset.lineId;
    const value = e.detail.value || '';
    this._lines = (this._lines || []).map((line) => {
      if (line.id !== lineId) return line;
      return { ...line, salesPrice: value };
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

    const currentRaw = (rawLine.variantQuantities && rawLine.variantQuantities[variantId]) != null
      ? String(rawLine.variantQuantities[variantId])
      : '';
    const { value, replaceConsumed } = applyMatrixKeyboardKey(
      this._matrixKbInput,
      currentRaw,
      action,
      digit,
    );
    const parsed = value === '' || value === '-' || value === '-.' ? 0 : Number(value);
    const qty = Number.isFinite(parsed) ? parsed : 0;
    const vq = { ...(rawLine.variantQuantities || {}), [variantId]: qty };
    this._lines = this._lines.map((l) => {
      if (l.id !== lineId) return l;
      return { ...l, variantQuantities: vq };
    });
    this.setData({
      matrixKeyboardValue: value,
      matrixInputReplaceAll: replaceConsumed ? false : this.data.matrixInputReplaceAll,
    });
    this.refreshLinesUi();
  },

  async onSubmit() {
    if (this.data.submitting) return;
    if (!validateSalesOrderSave(this.data.form, this._lines)) return;

    let docNumber = this.data.form.docNumber;
    if (!docNumber) {
      try {
        const res = await nextPsiDocNumber({
          prefix: 'SO',
          psiType: 'SALES_ORDER',
          partnerId: this.data.form.partnerId,
          partnerName: this.data.form.partner,
        });
        docNumber = (res && res.docNumber) || '';
      } catch (err) {
        wx.showToast({ title: '生成单号失败', icon: 'none' });
        return;
      }
    }
    if (!docNumber) {
      wx.showToast({ title: '单号无效', icon: 'none' });
      return;
    }

    const operator = readOperatorDisplayName();
    const newRecords = buildSalesOrderSaveRecords({
      form: this.data.form,
      lines: this._lines,
      docNumber,
      editingDocNumber: this._editingDocNumber,
      existingRecords: this._allRecords,
      operator,
    });
    if (!newRecords.length) {
      wx.showToast({ title: '明细数量须大于 0', icon: 'none' });
      return;
    }

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
        listUrl: LIST_ROUTES.PSI_SALES_ORDERS,
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
      title: '删除销售订单',
      content: `确定删除 ${this._editingDocNumber}？`,
      confirmColor: '#ef4444',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中…' });
        deletePsiRecords(this._deleteIds)
          .then(() => {
            wx.hideLoading();
            afterSaveReturnToList({
              listUrl: LIST_ROUTES.PSI_SALES_ORDERS,
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
