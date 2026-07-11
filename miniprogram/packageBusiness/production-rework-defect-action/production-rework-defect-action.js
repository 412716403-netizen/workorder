const _excluded = ["_clientId"],_excluded2 = ["_clientId"];function _objectWithoutPropertiesLoose(r, e) {if (null == r) return {};var t = {};for (var n in r) if ({}.hasOwnProperty.call(r, n)) {if (-1 !== e.indexOf(n)) continue;t[n] = r[n];}return t;}const _require = require('../../utils/session.js'),readTenantCtx = _require.readTenantCtx,readOperatorDisplayName = _require.readOperatorDisplayName;
const _require2 = require('../../utils/permissions.js'),hasPermission = _require2.hasPermission;
const _require3 =




  require('../utils/reworkDefectAction.js'),buildDefectPendingByVariant = _require3.buildDefectPendingByVariant,shouldTreatMatrixAsAggregate = _require3.shouldTreatMatrixAsAggregate,productHasColorSizeMatrix = _require3.productHasColorSizeMatrix,buildDefectActionRecords = _require3.buildDefectActionRecords;
const _require4 =




  require('../utils/reworkTargetNodeLite.js'),buildReworkTargetNodeOptions = _require4.buildReworkTargetNodeOptions,countCheckedReworkTargetNodes = _require4.countCheckedReworkTargetNodes,collectCheckedReworkTargetNodeIds = _require4.collectCheckedReworkTargetNodeIds,toggleReworkTargetNode = _require4.toggleReworkTargetNode;
const _require5 = require('../utils/reworkPendingLite.js'),buildReworkPendingRows = _require5.buildReworkPendingRows;
const _require6 = require('../utils/reworkRecordsLoad.js'),fetchReworkRecordsForPanel = _require6.fetchReworkRecordsForPanel;
const _require7 = require('../utils/pendingStockBadge.js'),fetchAllOrdersPaginated = _require7.fetchAllOrdersPaginated;
const _require8 =







  require('../utils/orderApi.js'),fetchTenantConfig = _require8.fetchTenantConfig,fetchProductsAll = _require8.fetchProductsAll,fetchCategoriesAll = _require8.fetchCategoriesAll,fetchNodesAll = _require8.fetchNodesAll,listProductProgressAll = _require8.listProductProgressAll,createProductionRecord = _require8.createProductionRecord,createProductionRecordBatch = _require8.createProductionRecordBatch;
const _require9 = require('../utils/planApi.js'),fetchPartnersAll = _require9.fetchPartnersAll,fetchPartnerCategoriesAll = _require9.fetchPartnerCategoriesAll,fetchDictionaries = _require9.fetchDictionaries;
const _require0 = require('../utils/outsourceConfirm.js'),resolveOutsourceDocNo = _require0.resolveOutsourceDocNo;
const _require1 = require('../utils/productionOrders.js'),normalizeMasterList = _require1.normalizeMasterList;
const _require10 = require('../utils/variantQtyMatrix.js'),buildVariantMatrixUiModel = _require10.buildVariantMatrixUiModel;
const _require11 =






  require('../utils/matrixQtyKeyboard.js'),activateMatrixKeyboardCell = _require11.activateMatrixKeyboardCell,applyMatrixKeyboardKey = _require11.applyMatrixKeyboardKey,buildMatrixKeyboardPreview = _require11.buildMatrixKeyboardPreview,createMatrixKeyboardInputSession = _require11.createMatrixKeyboardInputSession,getNextMatrixVariantIdInColumn = _require11.getNextMatrixVariantIdInColumn,getNextMatrixVariantIdInRow = _require11.getNextMatrixVariantIdInRow;
const _require12 = require('../utils/matrixKeyboardLayout.js'),afterMatrixKeyboardOpen = _require12.afterMatrixKeyboardOpen;
const _require13 = require('../utils/saveNavigation.js'),LIST_ROUTES = _require13.LIST_ROUTES,afterSaveReturnToList = _require13.afterSaveReturnToList;
const { applyPartnerCreatedOnPage } = require('../utils/mergePartnerList.js');
const _require14 =




  require('../../utils/windowMetrics.js'),readNavBarMetrics = _require14.readNavBarMetrics,readWindowMetrics = _require14.readWindowMetrics,computeSimplePlanHeaderHeight = _require14.computeSimplePlanHeaderHeight,computeFixedFooterInsetPx = _require14.computeFixedFooterInsetPx;

const MODE_OPTIONS = [
{ id: 'rework', label: '厂内返工' },
{ id: 'outsource_rework', label: '委外返工' },
{ id: 'scrap', label: '报损' }];


function computeScrollHeight(nav) {
  const win = readWindowMetrics();
  const headerPx = computeSimplePlanHeaderHeight(nav);
  const footerPx = computeFixedFooterInsetPx(128);
  return Math.max(200, win.windowHeight - headerPx - footerPx);
}

function decodeOpt(value) {
  if (value == null || value === '') return '';
  try {
    return decodeURIComponent(String(value));
  } catch {
    return String(value);
  }
}

function parseRowFromOptions(options) {
  const scope = decodeOpt(options.scope) === 'product' ? 'product' : 'order';
  return {
    scope,
    orderId: decodeOpt(options.orderId),
    orderNumber: decodeOpt(options.orderNumber),
    productId: decodeOpt(options.productId),
    productName: decodeOpt(options.productName),
    nodeId: decodeOpt(options.nodeId),
    milestoneName: decodeOpt(options.milestoneName),
    defectiveTotal: Number(decodeOpt(options.defectiveTotal)) || 0,
    reworkTotal: Number(decodeOpt(options.reworkTotal)) || 0,
    scrapTotal: Number(decodeOpt(options.scrapTotal)) || 0,
    pendingQty: Number(decodeOpt(options.pendingQty)) || 0
  };
}

function patchDefectMatrixLayout(matrixLayout, quantities, pendingByVariant) {
  if (!matrixLayout) return null;
  return {
    sizeColumns: matrixLayout.sizeColumns,
    colorRows: (matrixLayout.colorRows || []).map((row) => ({
      ...row,
      cells: (row.cells || []).map((cell) => {
        if (!cell.variantId) {
          return { ...cell, disabled: true, maxQtyLabel: '' };
        }
        const maxAllowed = Math.max(0, Number(pendingByVariant[cell.variantId]) || 0);
        return {
          ...cell,
          quantity: quantities[cell.variantId] != null ?
          String(quantities[cell.variantId]) :
          cell.quantity || '',
          disabled: maxAllowed <= 0,
          maxQtyLabel: maxAllowed > 0 ? `最多 ${maxAllowed}` : '—'
        };
      })
    }))
  };
}

function sumVariantQuantities(map) {
  return Object.values(map || {}).reduce((s, q) => s + (Number(q) || 0), 0);
}

function buildSubmitBatchPayload(result) {
  if (!result.batchMode) {
    return (result.records || []).map((rec) => {
      const _clientId = rec._clientId,rest = _objectWithoutPropertiesLoose(rec, _excluded);
      if (_clientId) return { ...rest, id: _clientId };
      return rest;
    });
  }
  const batch = [];
  (result.records || []).forEach((rec) => {
    const _clientId = rec._clientId,rest = _objectWithoutPropertiesLoose(rec, _excluded2);
    batch.push(_clientId ? { ...rest, id: _clientId } : rest);
  });
  (result.outsourceRecords || []).forEach((rec) => batch.push(rec));
  return batch;
}

Page({
  data: {
    loading: true,
    submitting: false,
    mode: 'rework',
    modeOptions: MODE_OPTIONS,
    canOutsourceRework: false,
    titleLine: '',
    milestoneLine: '',
    pendingQty: 0,
    pendingQtyText: '',
    useVariantQtyGrid: false,
    matrixAggregate: false,
    matrixLayout: null,
    variantTotal: 0,
    qty: '',
    reworkProductNodes: [],
    reworkOtherNodes: [],
    reworkNodeHint: '可多选',
    selectedNodeCount: 0,
    partners: [],
    partnerCategories: [],
    partnerName: '',
    matrixKeyboardVisible: false,
    matrixInputReplaceAll: false,
    activeMatrixVariantId: '',
    matrixKeyboardLabel: '',
    matrixKeyboardValue: '',
    statusBarHeight: 20,
    navBarHeight: 44,
    headerBlockHeight: 88,
    scrollHeight: 400,
    matrixScrollTop: 0
  },

  onLoad(options) {
    const nav = readNavBarMetrics();
    const ctx = readTenantCtx();
    const permissions = ctx && ctx.permissions || [];
    if (!hasPermission(permissions, 'production:rework_defective:allow')) {
      wx.showToast({ title: '无权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    this._row = parseRowFromOptions(options || {});
    this._canOutsourceRework = hasPermission(permissions, 'production:rework_outsource:allow');
    this._variantQty = {};
    this._matrixKbInput = createMatrixKeyboardInputSession();

    if (!this._row.productId || !this._row.nodeId) {
      wx.showToast({ title: '参数不完整', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    this.setData({
      statusBarHeight: nav.statusBarHeight,
      navBarHeight: nav.navBarHeight,
      headerBlockHeight: computeSimplePlanHeaderHeight(nav),
      scrollHeight: computeScrollHeight(nav),
      canOutsourceRework: this._canOutsourceRework,
      modeOptions: this._canOutsourceRework ?
      MODE_OPTIONS :
      MODE_OPTIONS.filter((m) => m.id !== 'outsource_rework'),
      titleLine: this._row.productName || '—',
      milestoneLine: `${this._row.milestoneName || '—'} · 待处理 ${this._row.pendingQty} 件`,
      pendingQty: this._row.pendingQty,
      pendingQtyText: `${this._row.pendingQty} 件`
    });
    this.bootstrap();
  },

  onHeaderBack() {
    wx.navigateBack();
  },

  onModeTap(e) {
    const mode = e.currentTarget.dataset.mode;
    if (!mode) return;
    if (mode === 'outsource_rework' && !this._canOutsourceRework) {
      wx.showToast({ title: '无委外返工权限', icon: 'none' });
      return;
    }
    if (this.data.mode === mode) return;
    this._variantQty = {};
    this.setData({
      mode,
      qty: '',
      partnerName: '',
      variantTotal: 0
    });
    this.rebuildUi();
  },

  onPartnerChange(e) {
    const name = e.detail && e.detail.name ? String(e.detail.name) : '';
    this.setData({ partnerName: name });
  },

  onPartnerCreated(e) {
    applyPartnerCreatedOnPage(this, e, { cacheKey: '_partners' });
  },

  onQtyInput(e) {
    this.setData({ qty: e.detail.value || '' });
  },

  onNodeToggle(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const toggled = toggleReworkTargetNode(
      this.data.reworkProductNodes,
      this.data.reworkOtherNodes,
      id
    );
    this.setData({
      reworkProductNodes: toggled.productNodes,
      reworkOtherNodes: toggled.otherNodes,
      selectedNodeCount: countCheckedReworkTargetNodes(
        toggled.productNodes,
        toggled.otherNodes
      )
    });
  },

  rebuildUi() {
    const row = this._row;
    const product = this._product;
    const category = this._category;
    const pendingByVariant = buildDefectPendingByVariant(row, {
      records: this._records || [],
      orders: this._orders || [],
      productMilestoneProgresses: this._pmp || [],
      product
    });
    this._pendingByVariant = pendingByVariant;

    const hasMatrix = productHasColorSizeMatrix(product, category);
    const matrixAggregate = shouldTreatMatrixAsAggregate(
      product,
      category,
      pendingByVariant,
      row.pendingQty
    );
    const useVariantQtyGrid = hasMatrix && !matrixAggregate;

    let matrixLayout = null;
    let variantTotal = 0;
    if (useVariantQtyGrid && product) {
      matrixLayout = patchDefectMatrixLayout(
        buildVariantMatrixUiModel(product, this._dictionaries, this._variantQty),
        this._variantQty,
        pendingByVariant
      );
      variantTotal = sumVariantQuantities(this._variantQty);
    }

    const prevChecked = collectCheckedReworkTargetNodeIds(
      this.data.reworkProductNodes,
      this.data.reworkOtherNodes
    );
    const showReworkNodes = this.data.mode === 'rework' || this.data.mode === 'outsource_rework';
    const nodeOptions = showReworkNodes ?
    buildReworkTargetNodeOptions(
      product,
      this._nodes || [],
      this._nodesById || new Map(),
      prevChecked
    ) :
    { productNodes: [], otherNodes: [] };

    this.setData({
      useVariantQtyGrid,
      matrixAggregate,
      matrixLayout,
      variantTotal,
      reworkProductNodes: nodeOptions.productNodes,
      reworkOtherNodes: nodeOptions.otherNodes,
      reworkNodeHint: row.scope === 'product' ?
      '按产品工艺顺序，可多选' :
      '可多选',
      selectedNodeCount: countCheckedReworkTargetNodes(
        nodeOptions.productNodes,
        nodeOptions.otherNodes
      ),
      pendingQty: row.pendingQty,
      pendingQtyText: `${row.pendingQty} 件`,
      milestoneLine: `${row.milestoneName || '—'} · 待处理 ${row.pendingQty} 件`
    });
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const config = await fetchTenantConfig().catch(() => ({}));
      this._productionLinkMode = config.productionLinkMode || 'order';

      const _await$Promise$all = await Promise.all([
        fetchAllOrdersPaginated({}),
        fetchProductsAll(),
        fetchCategoriesAll(),
        fetchNodesAll(),
        listProductProgressAll(),
        fetchPartnersAll(),
        fetchPartnerCategoriesAll().catch(() => []),
        fetchDictionaries().catch(() => ({}))]
        ),orders = _await$Promise$all[0],productsRaw = _await$Promise$all[1],categoriesRaw = _await$Promise$all[2],nodesRaw = _await$Promise$all[3],pmpRaw = _await$Promise$all[4],partnersRaw = _await$Promise$all[5],partnerCategoriesRaw = _await$Promise$all[6],dictionariesRaw = _await$Promise$all[7];

      this._orders = orders || [];
      this._products = normalizeMasterList(productsRaw);
      this._categories = normalizeMasterList(categoriesRaw);
      this._nodes = normalizeMasterList(nodesRaw);
      this._nodesById = new Map(this._nodes.map((n) => [n.id, n]));
      this._pmp = Array.isArray(pmpRaw) ? pmpRaw : [];
      this._dictionaries = dictionariesRaw || { colors: [], sizes: [], units: [] };
      this._partners = normalizeMasterList(partnersRaw).filter((p) => p.name);
      this._records = await fetchReworkRecordsForPanel({
        productionLinkMode: this._productionLinkMode,
        orders: this._orders,
        products: this._products
      });

      this._product = this._products.find((p) => p.id === this._row.productId) || null;
      this._category = this._product ?
      this._categories.find((c) => c.id === this._product.categoryId) :
      null;

      const freshRows = buildReworkPendingRows({
        productionLinkMode: this._productionLinkMode,
        records: this._records,
        orders: this._orders,
        products: this._products,
        nodes: this._nodes,
        productMilestoneProgresses: this._pmp
      });
      const rowKey = this._row.scope === 'product' ?
      `${this._row.productId}|${this._row.nodeId}` :
      `${this._row.orderId}|${this._row.nodeId}`;
      const fresh = freshRows.find((r) => r.rowKey === rowKey);

      if (fresh) {
        this._row = { ...this._row, ...fresh };
      } else if (this._row.pendingQty <= 0) {
        wx.showToast({ title: '该项已处理完毕', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }

      this.setData({
        loading: false,
        partners: this._partners,
        partnerCategories: normalizeMasterList(partnerCategoriesRaw),
        titleLine: this._row.productName || '—'
      });
      this.rebuildUi();
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: err && err.message || '加载失败', icon: 'none' });
    }
  },

  onMatrixCellTap(e) {
    const variantId = e.currentTarget.dataset.variantId;
    if (!variantId) return;
    const maxAllowed = Math.max(0, Number((this._pendingByVariant || {})[variantId]) || 0);
    if (maxAllowed <= 0) return;

    activateMatrixKeyboardCell(this._matrixKbInput);
    const preview = buildMatrixKeyboardPreview(
      this.data.matrixLayout,
      variantId,
      this._variantQty
    );
    const nav = { statusBarHeight: this.data.statusBarHeight, navBarHeight: this.data.navBarHeight };
    const win = readWindowMetrics();
    const fullScroll = Math.max(200, win.windowHeight - computeSimplePlanHeaderHeight(nav));
    this.setData({
      matrixKeyboardVisible: true,
      matrixInputReplaceAll: true,
      activeMatrixVariantId: variantId,
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value,
      scrollHeight: fullScroll
    }, () => {
      afterMatrixKeyboardOpen(this, '.defect-action-scroll');
    });
  },

  _dismissMatrixKeyboard() {
    const nav = { statusBarHeight: this.data.statusBarHeight, navBarHeight: this.data.navBarHeight };
    this.setData({
      matrixKeyboardVisible: false,
      matrixInputReplaceAll: false,
      activeMatrixVariantId: '',
      matrixKeyboardLabel: '',
      matrixKeyboardValue: '',
      scrollHeight: computeScrollHeight(nav)
    });
  },

  _clampActiveMatrixCell() {
    const activeMatrixVariantId = this.data.activeMatrixVariantId;
    if (!activeMatrixVariantId) return;
    const maxAllowed = Math.max(0, Number((this._pendingByVariant || {})[activeMatrixVariantId]) || 0);
    const qty = Number(this._variantQty[activeMatrixVariantId]) || 0;
    if (qty > maxAllowed) {
      this._variantQty[activeMatrixVariantId] = maxAllowed > 0 ? String(maxAllowed) : '';
      wx.showToast({ title: `最多 ${maxAllowed}`, icon: 'none' });
      this.rebuildUi();
    }
  },

  _moveMatrixFocus(nextVariantId) {
    if (!nextVariantId) {
      this._dismissMatrixKeyboard();
      return;
    }
    const maxAllowed = Math.max(0, Number((this._pendingByVariant || {})[nextVariantId]) || 0);
    if (maxAllowed <= 0) {
      this._dismissMatrixKeyboard();
      return;
    }
    activateMatrixKeyboardCell(this._matrixKbInput);
    const preview = buildMatrixKeyboardPreview(
      this.data.matrixLayout,
      nextVariantId,
      this._variantQty
    );
    this.setData({
      activeMatrixVariantId: nextVariantId,
      matrixInputReplaceAll: true,
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value
    }, () => {
      afterMatrixKeyboardOpen(this, '.defect-action-scroll');
    });
  },

  onMatrixKeyboardAction(e) {
    const _ref = e.detail || {},action = _ref.action,digit = _ref.digit;
    if (action === 'confirm') {
      this._clampActiveMatrixCell();
      this._dismissMatrixKeyboard();
      return;
    }
    const _this$data = this.data,activeMatrixVariantId = _this$data.activeMatrixVariantId,matrixLayout = _this$data.matrixLayout;
    if (action === 'enter') {
      this._clampActiveMatrixCell();
      this._moveMatrixFocus(getNextMatrixVariantIdInRow(matrixLayout, activeMatrixVariantId));
      return;
    }
    if (action === 'next') {
      this._clampActiveMatrixCell();
      this._moveMatrixFocus(getNextMatrixVariantIdInColumn(matrixLayout, activeMatrixVariantId));
      return;
    }
    if (!activeMatrixVariantId) return;

    const current = this._variantQty[activeMatrixVariantId] != null ?
    String(this._variantQty[activeMatrixVariantId]) :
    '';
    const _applyMatrixKeyboardK = applyMatrixKeyboardKey(
        this._matrixKbInput,
        current,
        action,
        digit
      ),value = _applyMatrixKeyboardK.value,replaceConsumed = _applyMatrixKeyboardK.replaceConsumed;
    this._variantQty[activeMatrixVariantId] = value;
    if (replaceConsumed) {
      this.setData({ matrixInputReplaceAll: false });
    }
    this.rebuildUi();
    const preview = buildMatrixKeyboardPreview(matrixLayout, activeMatrixVariantId, this._variantQty);
    this.setData({
      matrixKeyboardLabel: preview.label,
      matrixKeyboardValue: preview.value
    });
  },

  _collectVariantQuantities() {
    const out = {};
    Object.keys(this._variantQty || {}).forEach((vid) => {
      const q = Number(this._variantQty[vid]);
      if (Number.isFinite(q) && q > 0) out[vid] = q;
    });
    return out;
  },

  async onSubmit() {
    if (this.data.submitting || this.data.loading) return;

    const mode = this.data.mode;
    let reworkNodeIds = [];
    if (mode === 'rework' || mode === 'outsource_rework') {
      reworkNodeIds = collectCheckedReworkTargetNodeIds(
        this.data.reworkProductNodes,
        this.data.reworkOtherNodes
      );
      if (!reworkNodeIds.length) {
        wx.showToast({ title: '请选择返工目标工序', icon: 'none' });
        return;
      }
    }
    if (mode === 'outsource_rework' && !String(this.data.partnerName || '').trim()) {
      wx.showToast({ title: '请选择加工厂', icon: 'none' });
      return;
    }

    let outsourceDocNo = '';
    if (mode === 'outsource_rework') {
      outsourceDocNo = resolveOutsourceDocNo(
        'dispatch',
        this._partners || [],
        this._records || [],
        String(this.data.partnerName).trim()
      );
    }

    const result = buildDefectActionRecords({
      mode,
      row: this._row,
      records: this._records || [],
      orders: this._orders || [],
      productMilestoneProgresses: this._pmp || [],
      product: this._product,
      category: this._category,
      qty: Number(this.data.qty) || 0,
      variantQuantities: this._collectVariantQuantities(),
      reworkNodeIds,
      outsourcePartner: this.data.partnerName,
      operator: readOperatorDisplayName(readTenantCtx()),
      outsourceDocNo
    });

    if (result.error) {
      wx.showToast({ title: result.error, icon: 'none' });
      return;
    }

    const batch = buildSubmitBatchPayload(result);
    if (!batch.length) {
      wx.showToast({ title: '请填写数量', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中' });
    try {
      if (batch.length === 1) {
        await createProductionRecord(batch[0]);
      } else {
        await createProductionRecordBatch(batch);
      }
      wx.hideLoading();
      const toastTitle = mode === 'scrap' ?
      '报损成功' :
      mode === 'outsource_rework' ? '委外返工成功' : '返工成功';
      afterSaveReturnToList({
        listUrl: LIST_ROUTES.REWORK_HUB,
        toastTitle
      });
    } catch (err) {
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: err && err.message || '提交失败', icon: 'none' });
    }
  }
});