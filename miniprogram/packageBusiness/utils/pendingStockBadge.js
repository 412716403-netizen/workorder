/**
 * 待入库角标与清单数据加载（对齐 Web OrderListView pendingStockOrders）
 */
const {
  listOrdersPaginated,
  fetchProductionRecords,
  listProductProgressAll,
  fetchTenantConfig,
} = require('../../utils/orderApi.js');
const { computePendingStockOrders } = require('./pendingStockComputeLite.js');

async function fetchAllOrdersPaginated(params) {
  const pageSize = 100;
  let page = 1;
  let all = [];
  let total = Infinity;

  while (all.length < total) {
    const result = await listOrdersPaginated({ ...params, page, pageSize });
    const data = result.data || [];
    total = typeof result.total === 'number' ? result.total : data.length;
    all = all.concat(data);
    if (!data.length || data.length < pageSize) break;
    page += 1;
  }

  return all;
}

function uniqueProductIds(orders) {
  const set = new Set();
  (orders || []).forEach((o) => {
    if (o && o.productId) set.add(o.productId);
  });
  return [...set];
}

/** 对齐 Web fetchProductionByFilter：orderIds + productIds 窄拉 STOCK_IN */
async function fetchStockInRecordsForScope(orderIds, productIds) {
  const ids = (orderIds || []).filter(Boolean);
  const pids = (productIds || []).filter(Boolean);
  if (!ids.length && !pids.length) return [];

  const batchSize = 40;
  let all = [];

  if (ids.length <= batchSize) {
    const records = await fetchProductionRecords({
      type: 'STOCK_IN',
      all: 'true',
      orderIds: ids.join(','),
      productIds: pids.join(','),
    });
    const list = Array.isArray(records) ? records : (records.data || []);
    return list;
  }

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const records = await fetchProductionRecords({
      type: 'STOCK_IN',
      all: 'true',
      orderIds: batch.join(','),
      productIds: pids.join(','),
    });
    const list = Array.isArray(records) ? records : (records.data || []);
    all = all.concat(list);
  }

  return all;
}

async function loadPendingStockRows() {
  const config = await fetchTenantConfig();
  const productionLinkMode = (config && config.productionLinkMode) || 'order';

  // 与 Web 一致：用全量工单（不收窄 excludeCompleted）
  const orders = await fetchAllOrdersPaginated({});
  const orderIds = orders.map((o) => o.id).filter(Boolean);
  const productIds = uniqueProductIds(orders);
  const prodRecords = await fetchStockInRecordsForScope(orderIds, productIds);

  let pmp = [];
  if (productionLinkMode === 'product') {
    const raw = await listProductProgressAll();
    pmp = Array.isArray(raw) ? raw : (raw.data || []);
  }

  const rows = computePendingStockOrders(orders, prodRecords, {
    productionLinkMode,
    productMilestoneProgresses: pmp,
  });

  return rows.filter((row) => row.pendingTotal > 0);
}

async function computePendingStockCount() {
  const rows = await loadPendingStockRows();
  return rows.length;
}

module.exports = {
  fetchAllOrdersPaginated,
  fetchStockInRecordsForScope,
  loadPendingStockRows,
  computePendingStockCount,
};
