/**
 * STOCK_IN 记录构造（对齐 utils/pendingStockRecordBuilders.ts）
 */

const SCAN_ITEM_CODE_IDS_KEY = '__scanItemCodeIds';

function makeRecordId(seq) {
  return `rec-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`;
}

function stockInCollabFromCustomData(customData) {
  if (!customData || !Object.keys(customData).length) return {};
  return { collabData: { stockInCustomData: { ...customData } } };
}

function buildSingleStockInRecords(args) {
  const
    order =















    args.order,ordersInRow = args.ordersInRow,productionLinkMode = args.productionLinkMode,hasColorSize = args.hasColorSize,hasVariants = args.hasVariants,variantQuantities = args.variantQuantities,singleQuantity = args.singleQuantity,warehouseId = args.warehouseId,customData = args.customData,virtualBatchId = args.virtualBatchId,itemCodeId = args.itemCodeId,operator = args.operator,timestamp = args.timestamp,prodRecords = args.prodRecords,scanItemCodeIdsByVid = args.scanItemCodeIdsByVid,hadBatchScan = args.hadBatchScan;

  const collab = stockInCollabFromCustomData(customData || {});
  const traceFields = {
    ...(virtualBatchId ? { virtualBatchId } : {}),
    ...(itemCodeId ? { itemCodeId } : {})
  };
  const itemCodesByVid = scanItemCodeIdsByVid || {};
  const assignedScanKeys = new Set();
  const spreadScanList = (vid) => {
    if (hadBatchScan) return {};
    const akey = vid === null ? '__ALL__' : vid || '';
    if (assignedScanKeys.has(akey)) return {};
    const list = vid === null ?
    [...new Set(Object.values(itemCodesByVid).flat())] :
    itemCodesByVid[vid] || [];
    if (!list.length) return {};
    assignedScanKeys.add(akey);
    return { customData: { [SCAN_ITEM_CODE_IDS_KEY]: list } };
  };

  const isProductMulti = productionLinkMode === 'product' && (ordersInRow || []).length > 1;
  const records = [];
  let seq = 0;
  const whFields = {
    warehouseId: warehouseId || undefined
  };

  if (isProductMulti) {
    const sortedOrders = [...ordersInRow].sort((a, b) =>
    (a.orderNumber || '').localeCompare(b.orderNumber || '', 'zh-CN')
    );

    if (hasColorSize && hasVariants) {
      const variantEntries = Object.entries(variantQuantities || {}).filter(([, q]) => (Number(q) || 0) > 0);
      variantEntries.forEach(([vid, totalQty]) => {
        let remain = Number(totalQty) || 0;
        sortedOrders.forEach((o) => {
          if (remain <= 0) return;
          const orderVarQty = (o.items || []).
          filter((i) => (i.variantId || '') === vid).
          reduce((s, i) => s + (Number(i.quantity) || 0), 0);
          if (orderVarQty <= 0) return;
          const orderStockIn = (prodRecords || []).
          filter((r) => {var _r$variantId;return r.type === 'STOCK_IN' && r.orderId === o.id && ((_r$variantId = r.variantId) != null ? _r$variantId : '') === vid;}).
          reduce((s, r) => s + (Number(r.quantity) || 0), 0);
          const cap = Math.max(0, orderVarQty - orderStockIn);
          if (cap <= 0) return;
          const alloc = Math.min(remain, cap);
          remain -= alloc;
          seq += 1;
          records.push({
            id: makeRecordId(seq),
            type: 'STOCK_IN',
            orderId: o.id,
            productId: o.productId,
            variantId: vid || undefined,
            quantity: alloc,
            operator,
            timestamp,
            status: '已完成',
            ...whFields,
            ...collab,
            ...traceFields,
            ...spreadScanList(vid)
          });
        });
        if (remain > 0) {
          const fallback = sortedOrders[sortedOrders.length - 1];
          seq += 1;
          records.push({
            id: makeRecordId(seq),
            type: 'STOCK_IN',
            orderId: fallback.id,
            productId: fallback.productId,
            variantId: vid || undefined,
            quantity: remain,
            operator,
            timestamp,
            status: '已完成',
            ...whFields,
            ...collab,
            ...traceFields,
            ...spreadScanList(vid)
          });
        }
      });
      return records;
    }

    let remain = Number(singleQuantity) || 0;
    sortedOrders.forEach((o) => {
      if (remain <= 0) return;
      const oTotal = (o.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
      const oIn = (prodRecords || []).
      filter((r) => r.type === 'STOCK_IN' && r.orderId === o.id).
      reduce((s, r) => s + (Number(r.quantity) || 0), 0);
      const cap = Math.max(0, oTotal - oIn);
      if (cap <= 0) return;
      const alloc = Math.min(remain, cap);
      remain -= alloc;
      seq += 1;
      records.push({
        id: makeRecordId(seq),
        type: 'STOCK_IN',
        orderId: o.id,
        productId: o.productId,
        quantity: alloc,
        operator,
        timestamp,
        status: '已完成',
        ...whFields,
        ...collab,
        ...traceFields,
        ...spreadScanList(null)
      });
    });
    if (remain > 0) {
      const fallback = sortedOrders[sortedOrders.length - 1];
      seq += 1;
      records.push({
        id: makeRecordId(seq),
        type: 'STOCK_IN',
        orderId: fallback.id,
        productId: fallback.productId,
        quantity: remain,
        operator,
        timestamp,
        status: '已完成',
        ...whFields,
        ...collab,
        ...traceFields,
        ...spreadScanList(null)
      });
    }
    return records;
  }

  if (hasColorSize && hasVariants) {
    return Object.entries(variantQuantities || {}).
    filter(([, qty]) => (Number(qty) || 0) > 0).
    map(([variantId, qty]) => {
      seq += 1;
      return {
        id: makeRecordId(seq),
        type: 'STOCK_IN',
        orderId: order.id,
        productId: order.productId,
        variantId: variantId || undefined,
        quantity: Number(qty) || 0,
        operator,
        timestamp,
        status: '已完成',
        ...whFields,
        ...collab,
        ...traceFields,
        ...spreadScanList(variantId)
      };
    });
  }

  const qty = Number(singleQuantity) || 0;
  if (qty <= 0) return [];
  return [{
    id: makeRecordId(1),
    type: 'STOCK_IN',
    orderId: order.id,
    productId: order.productId,
    quantity: qty,
    operator,
    timestamp,
    status: '已完成',
    ...whFields,
    ...collab,
    ...traceFields,
    ...spreadScanList(null)
  }];
}

module.exports = {
  SCAN_ITEM_CODE_IDS_KEY,
  buildSingleStockInRecords
};