/**
 * 领退料确认提交（对齐 Web StockConfirmModal 基础规则）
 */

const { matRowNetIssue, getOrderFamilyIds, INTERNAL_PARTNER_KEY } = require('./materialStatsLite.js');
const { getProductUnitName } = require('./planFormCustomField.js');

/** 与 shared/types.ts BATCH_NO_UNTAGGED 一致 */
const BATCH_NO_UNTAGGED = '无批号';

function buildChildrenByParentId(orders) {
  const childrenByParentId = new Map();
  (orders || []).forEach((o) => {
    if (!o.parentOrderId) return;
    if (!childrenByParentId.has(o.parentOrderId)) {
      childrenByParentId.set(o.parentOrderId, []);
    }
    childrenByParentId.get(o.parentOrderId).push(o);
  });
  return childrenByParentId;
}

/**
 * 生产退料批次：本工单族/本产品下历史领料发出出现过的批号（对齐 Web stockReturnDispatchedBatchesByProduct）
 */
function buildReturnDispatchedBatchesByProduct(params) {
  const {
    records,
    orderId,
    sourceProductId,
    orders,
    partnerKey,
  } = params || {};
  const pkRaw = partnerKey || INTERNAL_PARTNER_KEY;
  const partnerMatch = (r) => {
    const rp = String(r.partner || '').trim();
    if (!pkRaw || pkRaw === INTERNAL_PARTNER_KEY) return !rp;
    return rp === pkRaw;
  };
  const childrenByParentId = buildChildrenByParentId(orders);
  const byMat = new Map();
  const addBatch = (r) => {
    const pid = r.productId;
    if (!pid) return;
    const bn = String(r.batchNo || '').trim() || BATCH_NO_UNTAGGED;
    if (!byMat.has(pid)) byMat.set(pid, new Set());
    byMat.get(pid).add(bn);
  };

  (records || []).forEach((r) => {
    if (r.type !== 'STOCK_OUT' || !partnerMatch(r)) return;
    let inScope = false;
    if (sourceProductId) {
      const target = sourceProductId;
      if (r.sourceProductId === target) inScope = true;
      else if (r.orderId) {
        const related = new Set((orders || []).filter((o) => o.productId === target).map((o) => o.id));
        if (related.has(r.orderId)) inScope = true;
      }
    } else if (orderId) {
      const fam = new Set(getOrderFamilyIds(orders || [], orderId, childrenByParentId));
      if (r.orderId && fam.has(r.orderId)) inScope = true;
    }
    if (!inScope) return;
    addBatch(r);
  });

  const out = {};
  byMat.forEach((set, pid) => {
    out[pid] = Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  });
  return out;
}

function attachConfirmRowUnits(rows, productsById, dictionaries) {
  return (rows || []).map((row) => {
    const product = productsById.get(row.productId);
    return {
      ...row,
      unitName: getProductUnitName(product, dictionaries),
    };
  });
}

function buildConfirmRows(selectedMaterials, mode) {
  return (selectedMaterials || []).map((m) => {
    const net = matRowNetIssue(m);
    let defaultQty = '';
    if (mode === 'stock_return' && net > 0) {
      defaultQty = String(net);
    }
    return {
      productId: m.productId,
      name: m.name,
      sku: m.sku || '',
      netIssued: net,
      maxQty: mode === 'stock_return' ? net : undefined,
      quantity: defaultQty,
    };
  });
}

function validateConfirmRows(rows, mode) {
  const errors = [];
  (rows || []).forEach((row) => {
    const qty = Number(row.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      errors.push(`${row.name}：请输入有效数量`);
      return;
    }
    if (mode === 'stock_return' && row.maxQty !== undefined && qty > row.maxQty) {
      errors.push(`${row.name}：退料不能超过净已领 ${row.maxQty}`);
    }
  });
  errors.push(...require('./materialIssueBatch.js').validateConfirmBatchRows(rows, mode));
  return errors;
}

function buildProductionRecordBatchPayload(params) {
  const {
    mode,
    rows,
    orderId,
    sourceProductId,
    warehouse,
    operator,
    partner,
    reason,
  } = params;

  const type = mode === 'stock_return' ? 'STOCK_RETURN' : 'STOCK_OUT';
  return (rows || []).map((row) => {
    const body = {
      type,
      productId: row.productId,
      quantity: Number(row.quantity),
      warehouseId: warehouse.id,
      operator: operator || '',
      status: '已完成',
    };
    if (orderId) body.orderId = orderId;
    if (sourceProductId) body.sourceProductId = sourceProductId;
    if (partner) body.partner = partner;
    if (reason) body.reason = reason;
    const batchNo = resolveBatchNoForWrite(row.batchNo);
    if (batchNo) body.batchNo = batchNo;
    return body;
  });
}

/** 显式「无批号」哨兵才写入；空串不传（由后端批次校验拦截） */
function resolveBatchNoForWrite(raw) {
  const s = String(raw || '').trim();
  if (!s) return undefined;
  if (s === BATCH_NO_UNTAGGED || s.startsWith(`${BATCH_NO_UNTAGGED}（`)) {
    return BATCH_NO_UNTAGGED;
  }
  return s;
}

function parseBatchErrorMessage(err) {
  const msg = (err && err.message) || String(err || '');
  return msg || '提交失败';
}

module.exports = {
  BATCH_NO_UNTAGGED,
  buildConfirmRows,
  attachConfirmRowUnits,
  buildReturnDispatchedBatchesByProduct,
  validateConfirmRows,
  buildProductionRecordBatchPayload,
  resolveBatchNoForWrite,
  parseBatchErrorMessage,
};
