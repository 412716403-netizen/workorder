/**
 * 工单中心 UI 模型（对齐 Web OrderListView / OrderDetailModal）
 */

const _require =


  require('../config/productionOrders.js'),OrderDispatchStatus = _require.OrderDispatchStatus,ORDER_DISPATCH_STATUS_LABEL = _require.ORDER_DISPATCH_STATUS_LABEL;
const _require2 = require('./orderProcessChips.js'),buildOrderProcessChips = _require2.buildOrderProcessChips,sumOrderQty = _require2.sumOrderQty;
const _require3 = require('../../utils/reportCustomDocField.js'),mapProductCustomTags = _require3.mapProductCustomTags;
const _require4 = require('../../utils/listProductThumb.js'),DEFAULT_PRODUCT_PLACEHOLDER_ICON = _require4.DEFAULT_PRODUCT_PLACEHOLDER_ICON;
const _require5 = require('../../utils/variantQtyMatrix.js'),buildVariantMatrixUiModel = _require5.buildVariantMatrixUiModel;
const _require6 = require('../../utils/listResponse.js'),normalizeListBody = _require6.normalizeListBody;
const _require7 = require('../../utils/productionPlans.js'),productHasColorSizeMatrix = _require7.productHasColorSizeMatrix,variantLabel = _require7.variantLabel;

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatOrderDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const s = String(iso).slice(0, 10);
    return s.length === 10 ? s : String(iso);
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function orderCreatedMs(o) {
  if (!o) return 0;
  if (o.createdAt) {
    const t = new Date(o.createdAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  const m = String(o.id || '').match(/^ord-([^-]+)-/);
  if (m) {
    const ts = parseInt(m[1], 36);
    if (!Number.isNaN(ts)) return ts;
  }
  return 0;
}

function getRootOrderNumber(orderNumber) {
  let s = orderNumber || '';
  for (;;) {
    const m = s.match(/^(.+)-([1-9]\d?)$/);
    if (!m) return s;
    s = m[1];
  }
}

function dispatchStatusPillClass(status) {
  return status === OrderDispatchStatus.COMPLETED ? 'st-pill--info' : 'st-pill--pending';
}

function dispatchStatusLabel(status) {
  return ORDER_DISPATCH_STATUS_LABEL[status] || ORDER_DISPATCH_STATUS_LABEL.IN_PROGRESS;
}

function productNameSkuParts(product) {
  if (!product) return { name: '—', sku: '', showSku: false };
  const name = product.name || product.sku || '—';
  const sku = product.sku || '';
  return { name, sku, showSku: Boolean(sku && product.name) };
}

function normalizeMasterList(body) {
  return normalizeListBody(body);
}

function parseOrderSearch(raw) {
  const trimmed = String(raw != null ? raw : '').trim();
  return trimmed ? { search: trimmed } : { search: '' };
}

/** 构建 parentToSub 映射 */
function buildParentToSubOrders(orders) {
  const map = new Map();
  (orders || []).filter((o) => o.parentOrderId).forEach((o) => {
    const pid = o.parentOrderId;
    if (!map.has(pid)) map.set(pid, []);
    map.get(pid).push(o);
  });
  map.forEach((arr) => {
    arr.sort(
      (a, b) => orderCreatedMs(b) - orderCreatedMs(a) ||
      String(a.orderNumber || '').localeCompare(String(b.orderNumber || ''))
    );
  });
  return map;
}

function buildRootToOrders(orders) {
  const map = new Map();
  (orders || []).forEach((o) => {
    const root = getRootOrderNumber(o.orderNumber || '');
    if (!map.has(root)) map.set(root, []);
    map.get(root).push(o);
  });
  const multi = new Map();
  map.forEach((arr, root) => {
    if (arr.length >= 2) multi.set(root, arr);
  });
  return multi;
}

function blockOrderCreatedMs(block, parentToSub) {
  switch (block.type) {
    case 'single':
      return orderCreatedMs(block.order);
    case 'orderGroup':
      return Math.max(0, ...block.orders.map(orderCreatedMs));
    case 'parentChild':{
        let m = orderCreatedMs(block.parent);
        const stack = [...(parentToSub.get(block.parent.id) || [])];
        while (stack.length) {
          const x = stack.pop();
          m = Math.max(m, orderCreatedMs(x));
          (parentToSub.get(x.id) || []).forEach((c) => stack.push(c));
        }
        return m;
      }
    case 'productGroup':
      return Math.max(0, ...block.orders.map(orderCreatedMs));
    default:
      return 0;
  }
}

function blockSortTieId(block) {
  switch (block.type) {
    case 'single':
      return block.order.id;
    case 'orderGroup':
      return block.groupKey;
    case 'parentChild':
      return block.parent.id;
    case 'productGroup':
      return block.productId;
    default:
      return '';
  }
}

/**
 * 列表块构建（对齐 utils/orderCenterSort + OrderListView listBlocks）
 */
function buildOrderListBlocks(orders, productionLinkMode, productMap) {
  if (productionLinkMode === 'product') {
    const byProduct = new Map();
    (orders || []).forEach((order) => {
      const pid = order.productId || 'unknown';
      if (!byProduct.has(pid)) byProduct.set(pid, []);
      byProduct.get(pid).push(order);
    });
    return Array.from(byProduct.entries()).
    map(([productId, ords]) => {var _sortedOrds$;
      const sortedOrds = [...ords].sort(
        (a, b) => orderCreatedMs(b) - orderCreatedMs(a) ||
        String(a.orderNumber || '').localeCompare(String(b.orderNumber || ''))
      );
      const product = productMap && productMap.get ? productMap.get(productId) : null;
      return {
        type: 'productGroup',
        productId,
        productName: ((_sortedOrds$ = sortedOrds[0]) == null ? void 0 : _sortedOrds$.productName) || (product == null ? void 0 : product.name) || '未知产品',
        orders: sortedOrds
      };
    }).
    sort(
      (a, b) => Math.max(0, ...b.orders.map(orderCreatedMs)) -
      Math.max(0, ...a.orders.map(orderCreatedMs)) ||
      String(a.productId).localeCompare(String(b.productId))
    );
  }

  const parentToSub = buildParentToSubOrders(orders);
  const rootToOrders = buildRootToOrders(orders);
  const blocks = [];
  const used = new Set();

  const getAllDescendants = (orderId, depth) => {
    const direct = parentToSub.get(orderId) || [];
    const result = [];
    direct.forEach((o) => {
      result.push({ order: o, depth });
      result.push(...getAllDescendants(o.id, depth + 1));
    });
    return result;
  };

  (orders || []).forEach((order) => {
    if (used.has(order.id)) return;
    if (order.parentOrderId) return;
    const root = getRootOrderNumber(order.orderNumber || '');
    if (rootToOrders.has(root)) {
      const groupOrders = rootToOrders.get(root);
      groupOrders.forEach((o) => used.add(o.id));
      blocks.push({
        type: 'orderGroup',
        groupKey: root,
        orders: [...groupOrders].sort(
          (a, b) => orderCreatedMs(b) - orderCreatedMs(a) ||
          String(a.orderNumber || '').localeCompare(String(b.orderNumber || ''))
        )
      });
    } else {
      const children = parentToSub.get(order.id) || [];
      if (children.length > 0) {
        used.add(order.id);
        getAllDescendants(order.id, 1).forEach(({ order: o }) => used.add(o.id));
        blocks.push({ type: 'parentChild', parent: order, children });
      } else {
        used.add(order.id);
        blocks.push({ type: 'single', order });
      }
    }
  });

  return blocks.sort(
    (a, b) => blockOrderCreatedMs(b, parentToSub) - blockOrderCreatedMs(a, parentToSub) ||
    blockSortTieId(a).localeCompare(blockSortTieId(b))
  );
}

function flattenBlockOrders(block) {
  switch (block.type) {
    case 'single':
      return [{ order: block.order, depth: 0, isPrimary: true }];
    case 'orderGroup':
      return block.orders.map((order, i) => ({ order, depth: 0, isPrimary: i === 0 }));
    case 'parentChild':{
        const rows = [{ order: block.parent, depth: 0, isPrimary: true, blockKey: block.parent.id }];
        const walk = (parentId, depth) => {
          const children = (block.children || []).filter((c) => c.parentOrderId === parentId);
          children.forEach((c) => {
            rows.push({ order: c, depth, isPrimary: false, blockKey: block.parent.id });
            walk(c.id, depth + 1);
          });
        };
        walk(block.parent.id, 1);
        return rows;
      }
    case 'productGroup':
      // 产品模式由 mapProductGroupRow 直接产出单卡，不再逐工单展开
      return block.orders.map((order, i) => ({
        order,
        depth: 0,
        isPrimary: i === 0,
        productGroupLabel: block.productName,
        productId: block.productId
      }));
    default:
      return [];
  }
}

/**
 * 产品模式产品组卡行（对齐 Web OrderListView productGroup：一产品一卡）
 */
function mapProductGroupRow(block, ctx = {}) {
  const product = ctx.product || null;
  const parts = productNameSkuParts(product);
  const productName =
    parts.name !== '—'
      ? parts.name
      : block.productName || (block.orders && block.orders[0] && block.orders[0].productName) || '—';
  const productSku =
    parts.sku ||
    (product && product.sku) ||
    (block.orders && block.orders[0] && block.orders[0].sku) ||
    '';
  const processChips = ctx.processChips || [];
  const totalQty = (block.orders || []).reduce((s, o) => s + sumOrderQty(o), 0);
  const showConfigureProcessHint = !!ctx.showConfigureProcessHint;
  const imageUrl = (product && (product.imageThumb || product.imageUrl)) || '';
  const customTags = ctx.productCustomTags || [];

  return {
    id: block.productId,
    rowType: 'productGroup',
    orderNumber: '',
    productName,
    productSku,
    showProductSku: Boolean(productSku && productName),
    productImageUrl: imageUrl,
    showProductImage: Boolean(String(imageUrl).trim()),
    productCustomTags: customTags,
    showProductCustomTags: customTags.length > 0,
    placeholderIconSrc: DEFAULT_PRODUCT_PLACEHOLDER_ICON,
    customer: '',
    showCustomer: false,
    dueDateLabel: '',
    showDueDate: false,
    showSubRow: false,
    quantityText: totalQty > 0 ? `合计 ${totalQty} 件` : '',
    showQuantity: totalQty > 0,
    dispatchLabel: '',
    dispatchPillClass: '',
    showDispatchPill: false,
    processChips,
    showProcessChips: processChips.length > 0,
    showConfigureProcessHint,
    configureProcessHintText: showConfigureProcessHint
      ? processChips.length > 0
        ? '工单上的工序来自历史复制，请先在产品管理中为本产品绑定工序。'
        : '本产品尚未配置工序，无法报工。'
      : '',
    depth: 0,
    blockType: 'productGroup',
    productGroupLabel: '',
    showProductGroupLabel: false,
    expanded: true,
    hasChildren: false,
    canReport: !!ctx.canReport,
    navigateId: '',
    productId: block.productId,
    reworkOrderId: '',
    showDetailAction: ctx.canViewDetail !== false,
    showReworkAction: false,
    showMaterialAction: ctx.canMaterial !== false,
    orderCount: (block.orders || []).length,
  };
}

function mapOrderListRow(order, ctx = {}) {
  const _ctx$productName =














    ctx.productName,productName = _ctx$productName === void 0 ? '' : _ctx$productName,_ctx$productSku = ctx.productSku,productSku = _ctx$productSku === void 0 ? '' : _ctx$productSku,showProductSku = ctx.showProductSku,_ctx$productImageUrl = ctx.productImageUrl,productImageUrl = _ctx$productImageUrl === void 0 ? '' : _ctx$productImageUrl,_ctx$productCustomTag = ctx.productCustomTags,productCustomTags = _ctx$productCustomTag === void 0 ? [] : _ctx$productCustomTag,_ctx$showDeliveryDate = ctx.showDeliveryDate,showDeliveryDate = _ctx$showDeliveryDate === void 0 ? true : _ctx$showDeliveryDate,_ctx$processChips = ctx.processChips,processChips = _ctx$processChips === void 0 ? [] : _ctx$processChips,_ctx$depth = ctx.depth,depth = _ctx$depth === void 0 ? 0 : _ctx$depth,_ctx$blockType = ctx.blockType,blockType = _ctx$blockType === void 0 ? 'single' : _ctx$blockType,_ctx$productGroupLabe = ctx.productGroupLabel,productGroupLabel = _ctx$productGroupLabe === void 0 ? '' : _ctx$productGroupLabe,_ctx$expanded = ctx.expanded,expanded = _ctx$expanded === void 0 ? true : _ctx$expanded,_ctx$hasChildren = ctx.hasChildren,hasChildren = _ctx$hasChildren === void 0 ? false : _ctx$hasChildren,_ctx$canReport = ctx.canReport,canReport = _ctx$canReport === void 0 ? false : _ctx$canReport,_ctx$productionLinkMo = ctx.productionLinkMode,productionLinkMode = _ctx$productionLinkMo === void 0 ? 'order' : _ctx$productionLinkMo;

  const dispatchStatus = order.dispatchStatus || OrderDispatchStatus.IN_PROGRESS;
  const qty = sumOrderQty(order);
  const customer = String(order.customer || '').trim();
  const dueDateLabel = showDeliveryDate && order.dueDate ?
  `交期 ${formatOrderDate(order.dueDate)}` :
  '';

  return {
    id: order.id,
    orderNumber: order.orderNumber || '',
    productName: productName || order.productName || '—',
    productSku: productSku || order.sku || '',
    showProductSku: showProductSku != null ?
    !!showProductSku :
    Boolean(String(productSku || order.sku || '').trim()),
    productImageUrl: productImageUrl || '',
    showProductImage: Boolean(String(productImageUrl || '').trim()),
    productCustomTags: productCustomTags || [],
    showProductCustomTags: (productCustomTags || []).length > 0,
    placeholderIconSrc: DEFAULT_PRODUCT_PLACEHOLDER_ICON,
    customer,
    showCustomer: productionLinkMode !== 'product' && Boolean(customer),
    dueDateLabel,
    showDueDate: Boolean(dueDateLabel),
    showSubRow: Boolean(customer || dueDateLabel),
    quantityText: qty > 0 ? `${qty} 件` : '',
    showQuantity: qty > 0,
    dispatchLabel: dispatchStatusLabel(dispatchStatus),
    dispatchPillClass: dispatchStatusPillClass(dispatchStatus),
    showDispatchPill: productionLinkMode !== 'product',
    processChips,
    showProcessChips: processChips.length > 0,
    depth,
    blockType,
    productGroupLabel,
    showProductGroupLabel: blockType === 'productGroup' && Boolean(productGroupLabel),
    expanded,
    hasChildren,
    canReport,
    navigateId: order.id,
    productId: order.productId,
    reworkOrderId: order.parentOrderId || order.id
  };
}

function buildOrderItemQtyMap(order) {
  const map = {};
  (order.items || []).forEach((it) => {
    if (it && it.variantId != null) {
      map[it.variantId] = it.quantity != null ? String(it.quantity) : '';
    }
  });
  return map;
}

function getProductUnitName(product, dictionaries) {
  const unitId = product && product.unitId;
  if (!unitId) return '件';
  const units = dictionaries && dictionaries.units || [];
  const u = units.find((x) => x.id === unitId);
  return u && String(u.name || '').trim() || '件';
}

function formatOrderDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildOrderReportSummaryRows(order, prodRecords, unitName) {
  const rows = [];
  (order.milestones || []).forEach((m) => {
    const goodQty = (m.reports || []).reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    const defQty = (m.reports || []).reduce((s, r) => s + (Number(r.defectiveQuantity) || 0), 0);
    const scrapQty = (prodRecords || []).
    filter((r) => r.type === 'SCRAP' && r.orderId === order.id && r.nodeId === m.templateId).
    reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    if (goodQty === 0 && defQty === 0 && scrapQty === 0) return;
    rows.push({
      milestoneId: m.id,
      name: m.name || '—',
      goodText: `${goodQty} ${unitName}`,
      defText: defQty > 0 ? `${defQty} ${unitName}` : '—',
      scrapText: scrapQty > 0 ? `${scrapQty} ${unitName}` : '—'
    });
  });
  return rows;
}

function buildQuantitySection(order, product, category, dictionaries) {
  const unitName = getProductUnitName(product, dictionaries);
  const items = order.items || [];
  if (!items.length) {
    return { id: 'quantity', title: '工单明细', kind: 'rows', rows: [{ label: '工单数量', value: '—' }], unitName };
  }

  const hasMatrix = productHasColorSizeMatrix(product, category);

  if (hasMatrix) {
    const matrixLayout = buildVariantMatrixUiModel(
      product,
      dictionaries,
      buildOrderItemQtyMap(order)
    );
    if (matrixLayout) {
      const total = sumOrderQty(order);
      return {
        id: 'quantity',
        title: '工单明细',
        kind: 'matrix',
        matrixLayout,
        totalQuantity: total,
        showTotal: total > 0,
        unitName
      };
    }
  }

  if (items.some((it) => it.variantId != null) && product && product.variants) {
    const rows = items.map((item) => {
      const variant = product.variants.find((v) => v.id === item.variantId);
      const label = variantLabel(variant, dictionaries) || variant && variant.skuSuffix || '规格';
      const qty = item.quantity != null ? Number(item.quantity) : 0;
      return { label, value: `${qty} ${unitName}` };
    });
    const total = sumOrderQty(order);
    return {
      id: 'quantity',
      title: '工单明细',
      kind: 'rows',
      rows,
      unitName,
      totalText: `${total} ${unitName}`
    };
  }

  const total = sumOrderQty(order);
  return {
    id: 'quantity',
    title: '工单明细',
    kind: 'rows',
    rows: [{ label: '工单数量', value: `${total} ${unitName}` }],
    unitName,
    totalText: `${total} ${unitName}`
  };
}

function mapOrderDetailView(order, ctx = {}) {
  const
    product =










    ctx.product,category = ctx.category,dictionaries = ctx.dictionaries,plan = ctx.plan,_ctx$childOrders = ctx.childOrders,childOrders = _ctx$childOrders === void 0 ? [] : _ctx$childOrders,_ctx$productionLinkMo2 = ctx.productionLinkMode,productionLinkMode = _ctx$productionLinkMo2 === void 0 ? 'order' : _ctx$productionLinkMo2,_ctx$showDeliveryDate2 = ctx.showDeliveryDate,showDeliveryDate = _ctx$showDeliveryDate2 === void 0 ? true : _ctx$showDeliveryDate2,_ctx$processRows = ctx.processRows,processRows = _ctx$processRows === void 0 ? [] : _ctx$processRows,_ctx$canEdit = ctx.canEdit,canEdit = _ctx$canEdit === void 0 ? false : _ctx$canEdit,_ctx$editing = ctx.editing,editing = _ctx$editing === void 0 ? false : _ctx$editing,_ctx$editForm = ctx.editForm,editForm = _ctx$editForm === void 0 ? null : _ctx$editForm;

  const dispatchStatus = order.dispatchStatus || OrderDispatchStatus.IN_PROGRESS;
  const parts = productNameSkuParts(product);
  const customTags = mapProductCustomTags(product, category, { includeFile: false });

  const dueDateLabel = showDeliveryDate && order.dueDate ?
  `交期 ${formatOrderDate(order.dueDate)}` :
  '';
  const unitName = getProductUnitName(product, dictionaries);
  const qty = sumOrderQty(order);

  const productHero = {
    orderNumber: order.orderNumber || '',
    productName: parts.name || order.productName || '—',
    productSku: parts.sku || order.sku || '',
    showProductSku: parts.showSku,
    productImageUrl: product && (product.imageThumb || product.imageUrl) || '',
    showProductImage: Boolean(product && (product.imageThumb || product.imageUrl)),
    productCustomTags: customTags,
    showProductCustomTags: customTags.length > 0,
    placeholderIconSrc: DEFAULT_PRODUCT_PLACEHOLDER_ICON,
    dispatchLabel: dispatchStatusLabel(dispatchStatus),
    dispatchPillClass: dispatchStatusPillClass(dispatchStatus),
    showDispatchPill: productionLinkMode === 'order',
    quantityText: qty > 0 ? `${qty} ${unitName}` : '',
    showQuantity: qty > 0,
    dueDateLabel,
    showDueDate: Boolean(dueDateLabel),
    unitName
  };

  const basicRows = [
  { label: '工单号', value: order.orderNumber || '—' },
  { label: '产品', value: parts.showSku ? `${parts.name} ${parts.sku}` : parts.name }];

  if (productionLinkMode !== 'product') {
    basicRows.push({ label: '客户', value: order.customer || '—', field: 'customer', editable: canEdit });
  }
  basicRows.push({
    label: '开始日期',
    value: order.startDate ? formatOrderDate(order.startDate) : '—',
    field: 'startDate',
    editable: canEdit
  });
  if (showDeliveryDate && productionLinkMode !== 'product') {
    basicRows.push({
      label: '交货日期',
      value: order.dueDate ? formatOrderDate(order.dueDate) : '—',
      field: 'dueDate',
      editable: canEdit
    });
  }
  if (order.createdAt) {
    basicRows.push({ label: '创建时间', value: formatOrderDateTime(order.createdAt) });
  }

  const sections = [
  { id: 'basic', title: '基础信息', rows: basicRows },
  buildQuantitySection(order, product, category, dictionaries)];


  if (processRows.length) {
    sections.push({
      id: 'process',
      title: '工序进度',
      rows: processRows,
      kind: 'process'
    });
  }

  const linkRows = [];
  (childOrders || []).forEach((c) => {
    linkRows.push({ label: '子工单', value: c.orderNumber || c.id, linkOrderId: c.id });
  });
  if (linkRows.length) {
    sections.push({ id: 'links', title: '关联工单', rows: linkRows });
  }

  return {
    productHero,
    sections,
    editing,
    editForm,
    orderNumber: order.orderNumber || '',
    dispatchStatus,
    planOrderId: order.planOrderId || (plan == null ? void 0 : plan.id) || ''
  };
}

function buildOrderDispatchConfirmMessage(orderNumber, fromStatus, toStatus) {
  const fromLabel = ORDER_DISPATCH_STATUS_LABEL[fromStatus] || fromStatus;
  const toLabel = ORDER_DISPATCH_STATUS_LABEL[toStatus] || toStatus;
  return `工单【${orderNumber}】将从「${fromLabel}」切换为「${toLabel}」。切换后该工单将被标记为手动状态，后续入库的自动推进逻辑将不再修改本工单状态。是否确认？`;
}

module.exports = {
  formatOrderDate,
  formatOrderDateTime,
  orderCreatedMs,
  getRootOrderNumber,
  dispatchStatusPillClass,
  dispatchStatusLabel,
  productNameSkuParts,
  normalizeMasterList,
  parseOrderSearch,
  buildOrderListBlocks,
  flattenBlockOrders,
  mapOrderListRow,
  mapProductGroupRow,
  mapOrderDetailView,
  buildOrderDispatchConfirmMessage,
  buildOrderReportSummaryRows,
  getProductUnitName,
  buildOrderItemQtyMap,
  sumOrderQty
};