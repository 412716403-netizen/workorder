/**
 * 处理不良提交 payload（对齐 Web ReworkDefectiveActionModal）
 */

const _require = require('./reworkSplitByProductOrders.js'),splitQtyBySourceDefectiveAcrossParentOrders = _require.splitQtyBySourceDefectiveAcrossParentOrders;
const _require2 = require('./reworkDocNo.js'),getNextDefectTreatmentDocNo = _require2.getNextDefectTreatmentDocNo;

const DEFECT_TREATMENT_CUSTOM_DATA_KEY = 'defectTreatmentCustomData';

function productHasColorSizeMatrix(product, category) {
  if (!product) return false;
  if (product.hasColorSizeMatrix === true) return true;
  if (category && category.hasColorSizeMatrix === true) return true;
  const variants = product.variants || [];
  return variants.some((v) => v.colorId || v.sizeId);
}

function buildDefectPendingByVariant(row, ctx) {
  const _ctx$records =




    ctx.records,records = _ctx$records === void 0 ? [] : _ctx$records,_ctx$orders = ctx.orders,orders = _ctx$orders === void 0 ? [] : _ctx$orders,_ctx$productMilestone = ctx.productMilestoneProgresses,productMilestoneProgresses = _ctx$productMilestone === void 0 ? [] : _ctx$productMilestone,product = ctx.product;

  const defectiveByVariant = {};
  if (row.scope === 'product') {
    (productMilestoneProgresses || []).
    filter((p) => p.productId === row.productId && p.milestoneTemplateId === row.nodeId).
    forEach((pmp) => {
      (pmp.reports || []).forEach((r) => {var _r$defectiveQuantity;
        const vid = r.variantId || '';
        defectiveByVariant[vid] = (defectiveByVariant[vid] || 0) + ((_r$defectiveQuantity = r.defectiveQuantity) != null ? _r$defectiveQuantity : 0);
      });
    });
    (orders || []).forEach((o) => {
      if (o.productId !== row.productId) return;
      const ms = (o.milestones || []).find((m) => m.templateId === row.nodeId);
      (ms && ms.reports || []).forEach((r) => {var _r$defectiveQuantity2;
        const vid = r.variantId || '';
        defectiveByVariant[vid] = (defectiveByVariant[vid] || 0) + ((_r$defectiveQuantity2 = r.defectiveQuantity) != null ? _r$defectiveQuantity2 : 0);
      });
    });
  } else {
    const order = (orders || []).find((o) => o.id === row.orderId);
    const ms = order && (order.milestones || []).find((m) => m.templateId === row.nodeId);
    (ms && ms.reports || []).forEach((r) => {var _r$defectiveQuantity3;
      const vid = r.variantId || '';
      defectiveByVariant[vid] = (defectiveByVariant[vid] || 0) + ((_r$defectiveQuantity3 = r.defectiveQuantity) != null ? _r$defectiveQuantity3 : 0);
    });
  }

  const reworkByVariant = {};
  if (row.scope === 'product') {
    (records || []).
    filter((r) => r.type === 'REWORK' &&
    r.productId === row.productId &&
    (r.sourceNodeId || r.nodeId) === row.nodeId).
    forEach((r) => {
      const vid = r.variantId || '';
      reworkByVariant[vid] = (reworkByVariant[vid] || 0) + (Number(r.quantity) || 0);
    });
  } else {
    (records || []).
    filter((r) => r.type === 'REWORK' &&
    r.orderId === row.orderId &&
    (r.sourceNodeId || r.nodeId) === row.nodeId).
    forEach((r) => {
      const vid = r.variantId || '';
      reworkByVariant[vid] = (reworkByVariant[vid] || 0) + (Number(r.quantity) || 0);
    });
  }

  const scrapByVariant = {};
  if (row.scope === 'product') {
    (records || []).
    filter((r) => r.type === 'SCRAP' &&
    r.productId === row.productId &&
    r.nodeId === row.nodeId).
    forEach((r) => {
      const vid = r.variantId || '';
      scrapByVariant[vid] = (scrapByVariant[vid] || 0) + (Number(r.quantity) || 0);
    });
  } else {
    (records || []).
    filter((r) => r.type === 'SCRAP' &&
    r.orderId === row.orderId &&
    r.nodeId === row.nodeId).
    forEach((r) => {
      const vid = r.variantId || '';
      scrapByVariant[vid] = (scrapByVariant[vid] || 0) + (Number(r.quantity) || 0);
    });
  }

  const pending = {};
  const allVariantIds = new Set([
  ...Object.keys(defectiveByVariant),
  ...Object.keys(reworkByVariant),
  ...Object.keys(scrapByVariant)]
  );
  if (product && product.variants) {
    product.variants.forEach((v) => allVariantIds.add(v.id));
  }
  allVariantIds.forEach((vid) => {
    const d = defectiveByVariant[vid] || 0;
    const rw = reworkByVariant[vid] || 0;
    const sp = scrapByVariant[vid] || 0;
    const p = Math.max(0, d - rw - sp);
    if (p > 0 || vid !== '') pending[vid] = p;
  });
  return pending;
}

function shouldTreatMatrixAsAggregate(product, category, pendingByVariant, pendingQty) {
  if (!productHasColorSizeMatrix(product, category) || pendingQty <= 0) return false;
  const ids = (product && product.variants || []).map((v) => v.id);
  const onKnown = ids.reduce((s, id) => s + (pendingByVariant[id] || 0), 0);
  return onKnown <= 0;
}

function defectCollabFromValues(values) {
  const clean = Object.fromEntries(
    Object.entries(values || {}).filter(([, v]) => v !== '' && v != null && v !== undefined)
  );
  if (!Object.keys(clean).length) return {};
  return { collabData: { [DEFECT_TREATMENT_CUSTOM_DATA_KEY]: clean } };
}

function sortReworkNodeIds(nodeIds, product) {
  const seqPath = product && product.milestoneNodeIds || [];
  return [...nodeIds].sort((a, b) => {
    const ia = seqPath.indexOf(a);
    const ib = seqPath.indexOf(b);
    if (ia < 0 && ib < 0) return a.localeCompare(b);
    if (ia < 0) return 1;
    if (ib < 0) return -1;
    return ia - ib;
  });
}

function buildDefectActionRecords(opts) {
  const
    mode =














    opts.mode,row = opts.row,_opts$records = opts.records,records = _opts$records === void 0 ? [] : _opts$records,_opts$orders = opts.orders,orders = _opts$orders === void 0 ? [] : _opts$orders,_opts$productMileston = opts.productMilestoneProgresses,productMilestoneProgresses = _opts$productMileston === void 0 ? [] : _opts$productMileston,product = opts.product,category = opts.category,_opts$qty = opts.qty,qty = _opts$qty === void 0 ? 0 : _opts$qty,_opts$variantQuantiti = opts.variantQuantities,variantQuantities = _opts$variantQuantiti === void 0 ? {} : _opts$variantQuantiti,_opts$reworkNodeIds = opts.reworkNodeIds,reworkNodeIds = _opts$reworkNodeIds === void 0 ? [] : _opts$reworkNodeIds,_opts$outsourcePartne = opts.outsourcePartner,outsourcePartner = _opts$outsourcePartne === void 0 ? '' : _opts$outsourcePartne,_opts$operator = opts.operator,operator = _opts$operator === void 0 ? '' : _opts$operator,timestamp = opts.timestamp,_opts$customData = opts.customData,customData = _opts$customData === void 0 ? {} : _opts$customData,_opts$outsourceDocNo = opts.outsourceDocNo,outsourceDocNo = _opts$outsourceDocNo === void 0 ? '' : _opts$outsourceDocNo;

  const pendingByVariant = buildDefectPendingByVariant(row, {
    records, orders, productMilestoneProgresses, product
  });
  const treatAsAggregate = shouldTreatMatrixAsAggregate(
    product, category, pendingByVariant, row.pendingQty
  );
  const useVariantQtyGrid = productHasColorSizeMatrix(product, category) && !treatAsAggregate;
  const docNo = getNextDefectTreatmentDocNo(records);
  const collab = defectCollabFromValues(customData);
  const ts = timestamp || new Date().toISOString();
  const parents = (orders || []).filter((o) => !o.parentOrderId && o.productId === row.productId);
  const splitProduct = row.scope === 'product' && parents.length > 0;
  const out = [];

  const pushLine = (type, oid, vid, q, extra) => {
    if (q <= 0) return;
    out.push({
      type,
      orderId: oid || undefined,
      productId: row.productId,
      variantId: vid || undefined,
      quantity: q,
      operator,
      timestamp: ts,
      nodeId: type === 'SCRAP' ? row.nodeId : extra.nodeIdFirst || row.nodeId,
      sourceNodeId: type !== 'SCRAP' ? row.nodeId : undefined,
      docNo,
      status: type === 'REWORK' ? extra.isOutsource ? '委外返工中' : '待返工' : undefined,
      reworkNodeIds: extra.reworkNodeIdsSorted,
      partner: extra.partner,
      ...collab
    });
  };

  if (mode === 'scrap') {
    if (useVariantQtyGrid) {
      const total = Object.values(variantQuantities).reduce((s, q) => s + (Number(q) || 0), 0);
      if (total <= 0 || total > row.pendingQty) return { error: '数量无效' };
      if (splitProduct) {
        const qtyMap = {};
        Object.entries(variantQuantities).forEach(([vId, q]) => {
          const n = Number(q) || 0;
          if (n <= 0 || n > (pendingByVariant[vId] || 0)) return;
          qtyMap[vId] = n;
        });
        const splits = splitQtyBySourceDefectiveAcrossParentOrders(
          row.productId, row.nodeId, parents, productMilestoneProgresses, qtyMap
        );
        if (!splits.length) return { error: '无法拆分数量' };
        splits.forEach((sp) => pushLine('SCRAP', sp.orderId, sp.variantId, sp.quantity, {}));
      } else {
        Object.entries(variantQuantities).forEach(([variantId, qv]) => {
          const q = Number(qv) || 0;
          if (q <= 0 || q > (pendingByVariant[variantId] || 0)) return;
          pushLine('SCRAP', row.orderId, variantId, q, {});
        });
      }
    } else {
      const q = Number(qty) || 0;
      if (q <= 0 || q > row.pendingQty) return { error: '数量无效' };
      if (splitProduct) {
        const splits = splitQtyBySourceDefectiveAcrossParentOrders(
          row.productId, row.nodeId, parents, productMilestoneProgresses, { '': q }
        );
        if (!splits.length) return { error: '无法拆分数量' };
        splits.forEach((sp) => pushLine('SCRAP', sp.orderId, sp.variantId, sp.quantity, {}));
      } else {
        pushLine('SCRAP', row.orderId, undefined, q, {});
      }
    }
    if (!out.length) return { error: '请填写数量' };
    return { records: out, docNo };
  }

  if (mode === 'rework' || mode === 'outsource_rework') {
    const isOutsource = mode === 'outsource_rework';
    if (isOutsource && !String(outsourcePartner || '').trim()) {
      return { error: '请选择加工厂' };
    }
    const sortedPath = sortReworkNodeIds(reworkNodeIds, product);
    if (!sortedPath.length) return { error: '请选择返工目标工序' };
    const reworkNodeIdsSorted = sortedPath;
    const nodeIdFirst = sortedPath[0];
    const partner = isOutsource ? String(outsourcePartner).trim() : undefined;
    const reworkLines = [];

    if (useVariantQtyGrid) {
      const total = Object.values(variantQuantities).reduce((s, q) => s + (Number(q) || 0), 0);
      if (total <= 0 || total > row.pendingQty) return { error: '数量无效' };
      if (splitProduct) {
        const qtyMap = {};
        Object.entries(variantQuantities).forEach(([vId, q]) => {
          const n = Number(q) || 0;
          if (n <= 0 || n > (pendingByVariant[vId] || 0)) return;
          qtyMap[vId] = n;
        });
        const splits = splitQtyBySourceDefectiveAcrossParentOrders(
          row.productId, row.nodeId, parents, productMilestoneProgresses, qtyMap
        );
        if (!splits.length) return { error: '无法拆分数量' };
        splits.forEach((sp) => {
          reworkLines.push({
            orderId: sp.orderId, variantId: sp.variantId, quantity: sp.quantity
          });
        });
      } else {
        Object.entries(variantQuantities).forEach(([variantId, qv]) => {
          const q = Number(qv) || 0;
          if (q <= 0 || q > (pendingByVariant[variantId] || 0)) return;
          reworkLines.push({ orderId: row.orderId, variantId, quantity: q });
        });
      }
    } else {
      const q = Number(qty) || 0;
      if (q <= 0 || q > row.pendingQty) return { error: '数量无效' };
      if (splitProduct) {
        const splits = splitQtyBySourceDefectiveAcrossParentOrders(
          row.productId, row.nodeId, parents, productMilestoneProgresses, { '': q }
        );
        if (!splits.length) return { error: '无法拆分数量' };
        splits.forEach((sp) => {
          reworkLines.push({
            orderId: sp.orderId, variantId: sp.variantId, quantity: sp.quantity
          });
        });
      } else {
        reworkLines.push({ orderId: row.orderId, variantId: undefined, quantity: q });
      }
    }
    if (!reworkLines.length) return { error: '请填写数量' };

    const batch = [];
    reworkLines.forEach((line, i) => {
      const reworkId = `rework-${Date.now()}-${i}`;
      pushLine('REWORK', line.orderId, line.variantId, line.quantity, {
        isOutsource, reworkNodeIdsSorted, nodeIdFirst, partner
      });
      const last = out[out.length - 1];
      last._clientId = reworkId;
      if (isOutsource) {
        batch.push({
          type: 'OUTSOURCE',
          orderId: line.orderId || undefined,
          productId: row.productId,
          variantId: line.variantId || undefined,
          quantity: line.quantity,
          operator,
          timestamp: ts,
          nodeId: nodeIdFirst,
          partner,
          status: '加工中',
          docNo: outsourceDocNo || docNo,
          sourceReworkId: reworkId
        });
      }
    });

    if (isOutsource) {
      return { records: out, outsourceRecords: batch, docNo, batchMode: true };
    }
    return { records: out, docNo };
  }

  return { error: '未知处置方式' };
}

module.exports = {
  DEFECT_TREATMENT_CUSTOM_DATA_KEY,
  productHasColorSizeMatrix,
  buildDefectPendingByVariant,
  shouldTreatMatrixAsAggregate,
  buildDefectActionRecords,
  sortReworkNodeIds
};