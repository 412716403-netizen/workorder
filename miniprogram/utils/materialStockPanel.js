/**
 * 生产物料主列表面板 UI 模型（对齐 Web StockMaterialPanel）
 */

const { OrderDispatchStatus } = require('../config/productionOrders.js');
const { listProductNameSkuFields } = require('./listProductThumb.js');
const {
  computeAllParentMaterialStats,
  computeAllProductMaterialStats,
  visibleMaterialRowsForList,
  displayMaterialsForKeyword,
  filterMaterialRowsWithActivity,
  matRowReportCost,
  matRowNetIssue,
  matRowSurplus,
  roundQty,
  INTERNAL_PARTNER_KEY,
  computePartnerMaterialGroups,
} = require('./materialStatsLite.js');

const DEFAULT_PAGE_SIZE = 10;
const PARTNER_PAGE_SIZE = 5;

function buildMaterialIndexes(products, boms, orders) {
  const productsById = new Map((products || []).map((p) => [p.id, p]));
  const bomsById = new Map((boms || []).map((b) => [b.id, b]));
  const bomsByParentProduct = new Map();
  (boms || []).forEach((b) => {
    if (!b.parentProductId) return;
    if (!bomsByParentProduct.has(b.parentProductId)) {
      bomsByParentProduct.set(b.parentProductId, []);
    }
    bomsByParentProduct.get(b.parentProductId).push(b);
  });
  const childrenByParentId = new Map();
  (orders || []).forEach((o) => {
    if (!o.parentOrderId) return;
    if (!childrenByParentId.has(o.parentOrderId)) {
      childrenByParentId.set(o.parentOrderId, []);
    }
    childrenByParentId.get(o.parentOrderId).push(o);
  });
  const ordersById = new Map((orders || []).map((o) => [o.id, o]));
  const ordersByProductId = new Map();
  const rootOrdersByProductId = new Map();
  (orders || []).forEach((o) => {
    if (!o.productId) return;
    if (!ordersByProductId.has(o.productId)) ordersByProductId.set(o.productId, []);
    ordersByProductId.get(o.productId).push(o);
    if (!o.parentOrderId) {
      if (!rootOrdersByProductId.has(o.productId)) rootOrdersByProductId.set(o.productId, []);
      rootOrdersByProductId.get(o.productId).push(o);
    }
  });
  return {
    productsById,
    bomsById,
    bomsByParentProduct,
    childrenByParentId,
    ordersById,
    ordersByProductId,
    rootOrdersByProductId,
  };
}

function matRowToUiRow(row, productsById) {
  const p = productsById.get(row.productId);
  const issue = roundQty(row.issue);
  const returnQty = roundQty(row.returnQty);
  const net = matRowNetIssue(row);
  const reportCost = matRowReportCost(row);
  const surplus = matRowSurplus(row);
  return {
    productId: row.productId,
    name: (p && p.name) || row.productId,
    sku: (p && p.sku) || '',
    issue,
    returnQty,
    net,
    reportCost,
    surplus,
    issueText: String(issue),
    returnText: String(returnQty),
    netText: String(net),
    reportCostText: String(reportCost),
    surplusText: String(surplus),
    selected: false,
  };
}

function filterOrdersForPanel(orders, opts) {
  const {
    productionLinkMode,
    onlyShowIncomplete,
  } = opts || {};
  let list = (orders || []).filter((o) => !o.parentOrderId);
  if (productionLinkMode === 'order' && onlyShowIncomplete) {
    list = list.filter(
      (o) => (o.dispatchStatus || OrderDispatchStatus.IN_PROGRESS) !== OrderDispatchStatus.COMPLETED,
    );
  }
  return list;
}

function buildOrderScopeCard(scopeKey, materials, idx, partnerKey) {
  const order = idx.ordersById.get(scopeKey);
  if (!order) return null;
  const product = idx.productsById.get(order.productId);
  const nameSku = listProductNameSkuFields(product, { name: order.productName, sku: order.sku });
  return {
    partnerKey: partnerKey || INTERNAL_PARTNER_KEY,
    scopeKey: order.id,
    scopeType: 'order',
    orderId: order.id,
    sourceProductId: order.productId || '',
    orderNumber: order.orderNumber || '',
    productName: nameSku.productName,
    productSku: nameSku.productSku,
    showProductSku: nameSku.showProductSku,
    customerName: order.customerName || '',
    materialRows: materials.map((m) => matRowToUiRow(m, idx.productsById)),
  };
}

function buildProductScopeCard(scopeKey, materials, idx, partnerKey) {
  const product = idx.productsById.get(scopeKey);
  const nameSku = listProductNameSkuFields(product, { name: scopeKey });
  return {
    partnerKey: partnerKey || INTERNAL_PARTNER_KEY,
    scopeKey,
    scopeType: 'product',
    orderId: '',
    sourceProductId: scopeKey,
    orderNumber: '',
    productName: nameSku.productName,
    productSku: nameSku.productSku,
    showProductSku: nameSku.showProductSku,
    customerName: '',
    materialRows: materials.map((m) => matRowToUiRow(m, idx.productsById)),
  };
}

function buildPartnerGroupCards(partnerGroup, params) {
  const {
    idx,
    productionLinkMode,
    materialKw,
    onlyShowIncomplete,
  } = params;
  const { partnerKey, data } = partnerGroup;
  const cards = [];

  data.forEach((materials, scopeKey) => {
    const searched = displayMaterialsForKeyword(materials, materialKw, idx.productsById);
    const displayMaterials = partnerKey === INTERNAL_PARTNER_KEY
      ? filterMaterialRowsWithActivity(searched)
      : searched;
    if (!displayMaterials.length) return;

    if (productionLinkMode === 'product') {
      cards.push(buildProductScopeCard(scopeKey, displayMaterials, idx, partnerKey));
    } else {
      const order = idx.ordersById.get(scopeKey);
      if (!order) return;
      if (onlyShowIncomplete
        && (order.dispatchStatus || OrderDispatchStatus.IN_PROGRESS) === OrderDispatchStatus.COMPLETED) {
        return;
      }
      const card = buildOrderScopeCard(scopeKey, displayMaterials, idx, partnerKey);
      if (card) cards.push(card);
    }
  });

  if (productionLinkMode === 'product') {
    cards.sort((a, b) => (a.productName || '').localeCompare(b.productName || '', 'zh-CN'));
  }
  return cards.filter(Boolean);
}

function filterPartnerGroupsBySearch(partnerGroups, params) {
  const {
    searchKeyword,
    materialKw,
    idx,
    productionLinkMode,
    onlyShowIncomplete,
  } = params;
  const kw = String(searchKeyword || materialKw || '').trim().toLowerCase();
  if (!kw) return partnerGroups;

  return (partnerGroups || []).map((pg) => {
    const partnerHit = (pg.partnerLabel || '').toLowerCase().includes(kw)
      || (pg.partnerKey !== INTERNAL_PARTNER_KEY && (pg.partnerKey || '').toLowerCase().includes(kw));
    if (partnerHit) return pg;

    const nextData = new Map();
    pg.data.forEach((materials, scopeKey) => {
      const searched = displayMaterialsForKeyword(materials, materialKw, idx.productsById);
      const visible = pg.partnerKey === INTERNAL_PARTNER_KEY
        ? filterMaterialRowsWithActivity(searched)
        : searched;
      if (!visible.length) return;

      if (productionLinkMode === 'product') {
        const fp = idx.productsById.get(scopeKey);
        const hay = [
          fp?.name,
          fp?.sku,
          ...(idx.ordersByProductId.get(scopeKey) || []).map((o) => `${o.orderNumber} ${o.customerName}`),
        ].join(' ').toLowerCase();
        if (hay.includes(kw) || visible.some((m) => {
          const p = idx.productsById.get(m.productId);
          return (p?.name || '').toLowerCase().includes(kw) || (p?.sku || '').toLowerCase().includes(kw);
        })) {
          nextData.set(scopeKey, materials);
        }
      } else {
        const order = idx.ordersById.get(scopeKey);
        if (!order) return;
        if (onlyShowIncomplete
          && (order.dispatchStatus || OrderDispatchStatus.IN_PROGRESS) === OrderDispatchStatus.COMPLETED) {
          return;
        }
        const prod = idx.productsById.get(order.productId);
        const hay = [
          order.orderNumber,
          order.customerName,
          order.productName,
          prod?.name,
          prod?.sku,
        ].join(' ').toLowerCase();
        if (hay.includes(kw) || visible.some((m) => {
          const p = idx.productsById.get(m.productId);
          return (p?.name || '').toLowerCase().includes(kw) || (p?.sku || '').toLowerCase().includes(kw);
        })) {
          nextData.set(scopeKey, materials);
        }
      }
    });
    return { ...pg, data: nextData };
  }).filter((pg) => pg.data.size > 0);
}

function buildPartnerModeGroups(params) {
  const {
    orders,
    idx,
    stockRecords,
    outsourceRecords,
    nodeWeightEnabledMap,
    productMilestoneProgresses,
    productionLinkMode,
    materialPanelSettings,
    searchKeyword,
    materialKw,
  } = params;

  const onlyShowIncomplete = productionLinkMode === 'order'
    && materialPanelSettings
    && materialPanelSettings.onlyShowNotCompletedOrder === true;
  const kw = materialKw !== undefined ? materialKw : '';

  const parentMaterialStats = productionLinkMode === 'product'
    ? null
    : computeAllParentMaterialStats({ orders, idx, stockRecords, nodeWeightEnabledMap });
  const productMaterialStatsByProduct = productionLinkMode === 'product'
    ? computeAllProductMaterialStats({
      orders,
      idx,
      stockRecords,
      productMilestoneProgresses,
      nodeWeightEnabledMap,
    })
    : null;

  let partnerGroups = computePartnerMaterialGroups({
    productionLinkMode,
    idx,
    stockRecords,
    outsourceRecords,
    nodeWeightEnabledMap,
    parentMaterialStats,
    productMaterialStatsByProduct,
  });

  partnerGroups = filterPartnerGroupsBySearch(partnerGroups, {
    searchKeyword,
    materialKw: kw,
    idx,
    productionLinkMode,
    onlyShowIncomplete,
  });

  return partnerGroups.map((pg) => {
    const cards = buildPartnerGroupCards(pg, {
      idx,
      productionLinkMode,
      materialKw: kw,
      onlyShowIncomplete,
    });
    return {
      partnerKey: pg.partnerKey,
      partnerLabel: pg.partnerLabel,
      isInternal: pg.partnerKey === INTERNAL_PARTNER_KEY,
      cardCount: cards.length,
      cards,
    };
  }).filter((pg) => pg.cards.length > 0);
}

function paginatePartnerGroups(groups, page, pageSize) {
  const size = pageSize || PARTNER_PAGE_SIZE;
  const p = Math.max(1, page || 1);
  const start = (p - 1) * size;
  const list = groups || [];
  return {
    rows: list.slice(start, start + size),
    total: list.length,
    page: p,
    pageSize: size,
    hasMore: start + size < list.length,
  };
}

function decoratePartnerGroups(groups, selectState) {
  return (groups || []).map((group) => ({
    ...group,
    cards: decorateCards(group.cards, selectState),
  }));
}

function decorateCards(cards, selectState) {
  const state = selectState || {};
  return (cards || []).map((card) => {
    const partnerKey = card.partnerKey || INTERNAL_PARTNER_KEY;
    const selecting = state.partnerKey === partnerKey
      && state.scopeKey === card.scopeKey
      && !!state.mode;
    const selectedIds = selecting ? (state.selectedIds || new Set()) : new Set();
    const materialRows = (card.materialRows || []).map((m) => ({
      ...m,
      selected: selectedIds.has(m.productId),
    }));
    const selectedCount = materialRows.filter((m) => m.selected).length;
    return {
      ...card,
      partnerKey,
      selecting,
      selectedCount,
      materialRows,
    };
  });
}

function flattenPartnerGroups(groups) {
  const cards = [];
  (groups || []).forEach((g) => {
    (g.cards || []).forEach((c) => cards.push(c));
  });
  return cards;
}

function findCardInPartnerGroups(groups, scopeKey, partnerKey) {
  const pk = partnerKey || INTERNAL_PARTNER_KEY;
  for (const g of groups || []) {
    if (g.partnerKey !== pk) continue;
    const card = (g.cards || []).find((c) => c.scopeKey === scopeKey);
    if (card) return card;
  }
  return null;
}

function buildOrderModeCards(params) {
  const {
    orders,
    idx,
    stockRecords,
    nodeWeightEnabledMap,
    materialKw,
    productionLinkMode,
    onlyShowIncomplete,
  } = params;

  const statsMap = computeAllParentMaterialStats({
    orders,
    idx,
    stockRecords,
    nodeWeightEnabledMap,
  });

  const parentOrders = filterOrdersForPanel(orders, { productionLinkMode, onlyShowIncomplete });
  const cards = [];

  parentOrders.forEach((order) => {
    const materials = statsMap.get(order.id) || [];
    const visible = visibleMaterialRowsForList(materials, materialKw, idx.productsById);
    if (visible.length === 0) return;

    const product = idx.productsById.get(order.productId);
    cards.push({
      partnerKey: INTERNAL_PARTNER_KEY,
      scopeKey: order.id,
      scopeType: 'order',
      orderId: order.id,
      sourceProductId: order.productId || '',
      orderNumber: order.orderNumber || '',
      productName: (product && product.name) || order.productName || '—',
      productSku: (product && product.sku) || order.sku || '',
      customerName: order.customerName || '',
      materialRows: visible.map((m) => matRowToUiRow(m, idx.productsById)),
    });
  });

  return cards;
}

function buildProductModeCards(params) {
  const {
    orders,
    idx,
    stockRecords,
    nodeWeightEnabledMap,
    productMilestoneProgresses,
    materialKw,
  } = params;

  const statsMap = computeAllProductMaterialStats({
    orders,
    idx,
    stockRecords,
    productMilestoneProgresses: productMilestoneProgresses || [],
    nodeWeightEnabledMap,
  });

  const cards = [];
  statsMap.forEach((materials, productId) => {
    const visible = visibleMaterialRowsForList(materials, materialKw, idx.productsById);
    if (visible.length === 0) return;
    const product = idx.productsById.get(productId);
    cards.push({
      partnerKey: INTERNAL_PARTNER_KEY,
      scopeKey: productId,
      scopeType: 'product',
      orderId: '',
      sourceProductId: productId,
      orderNumber: '',
      productName: (product && product.name) || productId,
      productSku: (product && product.sku) || '',
      customerName: '',
      materialRows: visible.map((m) => matRowToUiRow(m, idx.productsById)),
    });
  });

  cards.sort((a, b) => (a.productName || '').localeCompare(b.productName || '', 'zh-CN'));
  return cards;
}

function filterCardsBySearchKeyword(cards, keyword) {
  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw) return cards;
  return (cards || []).filter((card) => {
    const hay = [
      card.orderNumber,
      card.productName,
      card.productSku,
      card.customerName,
      card.partnerKey !== INTERNAL_PARTNER_KEY ? card.partnerKey : '',
      ...(card.materialRows || []).map((r) => `${r.name} ${r.sku}`),
    ].join(' ').toLowerCase();
    return hay.includes(kw);
  });
}

function paginateCards(cards, page, pageSize) {
  const size = pageSize || DEFAULT_PAGE_SIZE;
  const p = Math.max(1, page || 1);
  const start = (p - 1) * size;
  return {
    rows: (cards || []).slice(start, start + size),
    total: (cards || []).length,
    page: p,
    pageSize: size,
    hasMore: start + size < (cards || []).length,
  };
}

function buildMaterialPanelCards(params) {
  const {
    orders,
    products,
    boms,
    stockRecords,
    outsourceRecords,
    globalNodes,
    productMilestoneProgresses,
    productionLinkMode,
    materialPanelSettings,
    searchKeyword,
    materialKw,
  } = params;

  const idx = buildMaterialIndexes(products, boms, orders);
  const nodeWeightEnabledMap = require('./materialStatsLite.js').buildNodeWeightEnabledMap(globalNodes);
  const groupByPartner = !!(materialPanelSettings && materialPanelSettings.groupByOutsourcePartner);

  if (groupByPartner) {
    const partnerGroups = buildPartnerModeGroups({
      orders,
      idx,
      stockRecords,
      outsourceRecords,
      nodeWeightEnabledMap,
      productMilestoneProgresses,
      productionLinkMode,
      materialPanelSettings,
      searchKeyword,
      materialKw,
    });
    const cards = flattenPartnerGroups(partnerGroups);
    return {
      cards,
      partnerGroups,
      groupByPartner: true,
      idx,
      nodeWeightEnabledMap,
    };
  }

  const onlyShowIncomplete = productionLinkMode === 'order'
    && materialPanelSettings
    && materialPanelSettings.onlyShowNotCompletedOrder === true;

  const kw = materialKw !== undefined ? materialKw : '';
  let cards;
  if (productionLinkMode === 'product') {
    cards = buildProductModeCards({
      orders,
      idx,
      stockRecords,
      nodeWeightEnabledMap,
      productMilestoneProgresses,
      materialKw: kw,
    });
  } else {
    cards = buildOrderModeCards({
      orders,
      idx,
      stockRecords,
      nodeWeightEnabledMap,
      materialKw: kw,
      productionLinkMode,
      onlyShowIncomplete,
    });
  }

  cards = filterCardsBySearchKeyword(cards, searchKeyword);
  return {
    cards,
    partnerGroups: [],
    groupByPartner: false,
    idx,
    nodeWeightEnabledMap,
  };
}

function hasMaterialModuleAccess(permissions) {
  const { hasPermission } = require('./permissions.js');
  const keys = [
    'production:material_list:allow',
    'production:material_issue:allow',
    'production:material_return:allow',
    'production:material_records:view',
  ];
  return keys.some((k) => hasPermission(permissions, k));
}

module.exports = {
  DEFAULT_PAGE_SIZE,
  PARTNER_PAGE_SIZE,
  INTERNAL_PARTNER_KEY,
  buildMaterialIndexes,
  buildMaterialPanelCards,
  filterCardsBySearchKeyword,
  paginateCards,
  paginatePartnerGroups,
  decorateCards,
  decoratePartnerGroups,
  flattenPartnerGroups,
  findCardInPartnerGroups,
  matRowToUiRow,
  hasMaterialModuleAccess,
};
