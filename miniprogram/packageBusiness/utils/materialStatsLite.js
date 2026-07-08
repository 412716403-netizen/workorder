/**
 * 工单 / 成品维度生产物料统计（对齐 Web computeOrderMaterialStats + stockMaterialPanelHelpers）
 */

function getOrderFamilyIds(orders, parentId, childrenByParentId) {
  const ids = [parentId];
  const queue = [parentId];
  while (queue.length > 0) {
    const pid = queue.shift();
    const children = childrenByParentId ?
    childrenByParentId.get(pid) || [] :
    orders.filter((o) => o.parentOrderId === pid);
    children.forEach((o) => {
      ids.push(o.id);
      queue.push(o.id);
    });
  }
  return ids;
}

function matRowReportCost(row) {
  return Math.round((Number(row.theoryCost) + Number(row.actualCost)) * 100) / 100;
}

function filterMaterialRowsWithActivity(materials) {
  return (materials || []).filter((m) => {
    if (m.issue !== 0 || m.returnQty !== 0) return true;
    const th = Math.round(Number(m.theoryCost) * 100) / 100;
    const ac = Math.round(Number(m.actualCost) * 100) / 100;
    return th !== 0 || ac !== 0;
  });
}

function displayMaterialsForKeyword(materials, materialKw, productsById) {
  const kw = String(materialKw || '').trim().toLowerCase();
  if (!kw) return materials;
  const hit = (materials || []).filter((m) => {
    const p = productsById.get(m.productId);
    return ((p == null ? void 0 : p.name) || '').toLowerCase().includes(kw) ||
    ((p == null ? void 0 : p.sku) || '').toLowerCase().includes(kw);
  });
  return hit.length > 0 ? hit : materials;
}

function visibleMaterialRowsForList(materials, materialKw, productsById) {
  return filterMaterialRowsWithActivity(
    displayMaterialsForKeyword(materials, materialKw, productsById)
  );
}

function resolveBomItems(productsById, bomsById, bomsByParentProduct, productId, nodeId, variantId) {
  const product = productsById.get(productId);
  if (!product) return [];
  const items = [];
  const variants = product.variants || [];

  if (variantId && variants.length > 0) {
    const v = variants.find((vv) => vv.id === variantId);
    if (v && v.nodeBoms) {
      const bomId = v.nodeBoms[nodeId];
      if (bomId) {
        const bom = bomsById.get(bomId);
        if (bom) {
          bom.items.forEach((bi) => items.push({
            productId: bi.productId,
            quantity: Number(bi.quantity)
          }));
          return items;
        }
      }
    }
    (bomsByParentProduct.get(product.id) || []).
    filter((b) => b.nodeId === nodeId && b.variantId === variantId).
    forEach((bom) => bom.items.forEach((bi) => items.push({
      productId: bi.productId,
      quantity: Number(bi.quantity)
    })));
    if (items.length > 0) return items;
  }

  (bomsByParentProduct.get(product.id) || []).
  filter((b) => b.nodeId === nodeId).
  forEach((bom) => bom.items.forEach((bi) => items.push({
    productId: bi.productId,
    quantity: Number(bi.quantity)
  })));
  return items;
}

function applyMaterialBreakdown(source, addToTheory, weightEnabled) {
  if (!weightEnabled) return false;
  const raw = source ? source.materialBreakdown : null;
  const mb = Array.isArray(raw) ? raw : null;
  if (!mb || mb.length === 0) return false;
  mb.forEach((row) => {
    const pid = row && row.materialProductId;
    const amt = Number(row && row.actualWeight);
    if (!pid || !Number.isFinite(amt) || amt <= 0) return;
    addToTheory(pid, amt);
  });
  return true;
}

function emptyAcc() {
  return { issue: 0, returnQty: 0, theoryCost: 0, actualCost: 0 };
}

function matMapToRows(prodMap) {
  return Array.from(prodMap.entries()).map(([productId, v]) => ({ productId, ...v }));
}

function resolveOrderRootId(orderId, ordersById) {
  let cur = orderId;
  for (let i = 0; i < 24; i++) {
    const o = ordersById.get(cur);
    if (!o) return cur;
    if (!o.parentOrderId) return o.id;
    cur = o.parentOrderId;
  }
  return cur;
}

function finishedProductHasBom(fpId, productsById, bomsById, bomsByParentProduct) {
  const ordProduct = productsById.get(fpId);
  if (!ordProduct) return false;
  const variants = ordProduct.variants || [];
  if (variants.length > 0) {
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      if (v.nodeBoms) {
        const bomIds = Object.values(v.nodeBoms);
        for (let j = 0; j < bomIds.length; j++) {
          const bom = bomsById.get(bomIds[j]);
          if (bom && bom.items.length > 0) return true;
        }
      }
    }
  }
  const parentBoms = bomsByParentProduct.get(ordProduct.id) || [];
  return parentBoms.some((b) => b.nodeId && b.items.length > 0);
}

function computeOrderFamilyMaterialStats(params) {
  const
    rootOrderId =







    params.rootOrderId,orders = params.orders,productsById = params.productsById,bomsById = params.bomsById,bomsByParentProduct = params.bomsByParentProduct,childrenByParentId = params.childrenByParentId,stockRecords = params.stockRecords,nodeWeightEnabledMap = params.nodeWeightEnabledMap;

  const familyIds = new Set(getOrderFamilyIds(orders, rootOrderId, childrenByParentId));
  const prodMap = new Map();

  const addTheory = (bi, qty) => {
    const theory = Number(bi.quantity) * qty;
    if (!prodMap.has(bi.productId)) prodMap.set(bi.productId, emptyAcc());
    prodMap.get(bi.productId).theoryCost += theory;
  };
  const addActual = (productId, amount) => {
    if (!prodMap.has(productId)) prodMap.set(productId, emptyAcc());
    prodMap.get(productId).actualCost += amount;
  };

  const familyOrders = orders.filter((o) => familyIds.has(o.id));
  familyOrders.forEach((ord) => {
    const ordProduct = productsById.get(ord.productId);
    const variants = ordProduct && ordProduct.variants || [];
    const bestMsIdx = ord.milestones.reduce(
      (bi, ms, i) => {var _ord$milestones$bi$co, _ord$milestones$bi;return ms.completedQuantity > ((_ord$milestones$bi$co = (_ord$milestones$bi = ord.milestones[bi]) == null ? void 0 : _ord$milestones$bi.completedQuantity) != null ? _ord$milestones$bi$co : 0) ? i : bi;},
      0
    );
    const bestMs = ord.milestones[bestMsIdx];
    const variantCompletedMap = new Map();
    let totalCompleted = 0;
    if (bestMs) {
      const bestMsWeightOn = !!nodeWeightEnabledMap.get(bestMs.templateId);
      (bestMs.reports || []).forEach((r) => {
        if (applyMaterialBreakdown(r, addActual, bestMsWeightOn)) return;
        const qty = Number(r.quantity);
        totalCompleted += qty;
        const vid = r.variantId || '';
        variantCompletedMap.set(vid, (variantCompletedMap.get(vid) || 0) + qty);
      });
    } else {
      totalCompleted = ord.milestones.reduce(
        (max, ms) => Math.max(max, ms.completedQuantity),
        0
      );
    }

    const hasReportQtyForAnyProductVariant = variants.some(
      (v) => (variantCompletedMap.get(v.id) || 0) > 0
    );
    if (variants.length > 0 && variantCompletedMap.size > 0 && hasReportQtyForAnyProductVariant) {
      variants.forEach((v) => {
        const vCompleted = variantCompletedMap.get(v.id) || 0;
        if (vCompleted <= 0) return;
        const seenBomIds = new Set();
        if (v.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
          Object.values(v.nodeBoms).forEach((bomId) => {
            if (seenBomIds.has(bomId)) return;
            seenBomIds.add(bomId);
            const bom = bomsById.get(bomId);
            if (bom) bom.items.forEach((bi) => addTheory(bi, vCompleted));
          });
        } else if (ordProduct) {
          (bomsByParentProduct.get(ordProduct.id) || []).
          filter((b) => b.variantId === v.id && b.nodeId).
          forEach((bom) => {
            if (seenBomIds.has(bom.id)) return;
            seenBomIds.add(bom.id);
            bom.items.forEach((bi) => addTheory(bi, vCompleted));
          });
        }
      });
    } else if (variants.length > 0) {
      variants.forEach((v) => {
        const seenBomIds = new Set();
        if (v.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
          Object.values(v.nodeBoms).forEach((bomId) => {
            if (seenBomIds.has(bomId)) return;
            seenBomIds.add(bomId);
            const bom = bomsById.get(bomId);
            if (bom) bom.items.forEach((bi) => addTheory(bi, totalCompleted));
          });
        }
      });
      if (prodMap.size === 0 && ordProduct) {
        (bomsByParentProduct.get(ordProduct.id) || []).
        filter((b) => b.nodeId).
        forEach((bom) => bom.items.forEach((bi) => addTheory(bi, totalCompleted)));
      }
    } else if (ordProduct) {
      (bomsByParentProduct.get(ordProduct.id) || []).
      filter((b) => b.nodeId).
      forEach((bom) => bom.items.forEach((bi) => addTheory(bi, totalCompleted)));
    }
  });

  (stockRecords || []).forEach((r) => {
    if (r.type !== 'STOCK_OUT' && r.type !== 'STOCK_RETURN') return;
    if (!r.orderId || !familyIds.has(r.orderId)) return;
    if (!prodMap.has(r.productId)) prodMap.set(r.productId, emptyAcc());
    const cur = prodMap.get(r.productId);
    if (r.type === 'STOCK_OUT') cur.issue += r.quantity;else
    cur.returnQty += r.quantity;
  });

  return matMapToRows(prodMap);
}

function computeAllParentMaterialStats(params) {
  const orders = params.orders,idx = params.idx,stockRecords = params.stockRecords,nodeWeightEnabledMap = params.nodeWeightEnabledMap;
  const result = new Map();
  const parentList = orders.filter((o) => !o.parentOrderId);
  parentList.forEach((parent) => {
    result.set(
      parent.id,
      computeOrderFamilyMaterialStats({
        rootOrderId: parent.id,
        orders,
        productsById: idx.productsById,
        bomsById: idx.bomsById,
        bomsByParentProduct: idx.bomsByParentProduct,
        childrenByParentId: idx.childrenByParentId,
        stockRecords,
        nodeWeightEnabledMap
      })
    );
  });
  return result;
}

function computeProductMaterialStats(params) {
  const
    fpId =





    params.productId,orders = params.orders,idx = params.idx,stockRecords = params.stockRecords,productMilestoneProgresses = params.productMilestoneProgresses,nodeWeightEnabledMap = params.nodeWeightEnabledMap;
  const
    productsById =






    idx.productsById,bomsById = idx.bomsById,bomsByParentProduct = idx.bomsByParentProduct,childrenByParentId = idx.childrenByParentId,rootOrdersByProductId = idx.rootOrdersByProductId,ordersByProductId = idx.ordersByProductId,ordersById = idx.ordersById;

  const roots = rootOrdersByProductId.get(fpId) || [];
  const ordersForThisProduct = ordersByProductId.get(fpId) || [];
  const allFamilyIds = new Set();
  if (roots.length > 0) {
    roots.forEach((p) => {
      getOrderFamilyIds(orders, p.id, childrenByParentId).forEach((id) => allFamilyIds.add(id));
    });
  } else {
    ordersForThisProduct.forEach((o) => {
      const rootId = resolveOrderRootId(o.id, ordersById);
      getOrderFamilyIds(orders, rootId, childrenByParentId).forEach((id) => allFamilyIds.add(id));
    });
  }

  const prodMap = new Map();
  const fpProduct = productsById.get(fpId);

  const addActual = (materialProductId, amount) => {
    if (!prodMap.has(materialProductId)) prodMap.set(materialProductId, emptyAcc());
    prodMap.get(materialProductId).actualCost += amount;
  };
  const addTheory = (materialProductId, amount) => {
    if (!prodMap.has(materialProductId)) prodMap.set(materialProductId, emptyAcc());
    prodMap.get(materialProductId).theoryCost += amount;
  };
  const applyBomForNode = (nodeId, variantId, qty) => {
    if (!fpProduct || qty <= 0 || !nodeId) return false;
    const bomItems = resolveBomItems(
      productsById,
      bomsById,
      bomsByParentProduct,
      fpId,
      nodeId,
      variantId || undefined
    );
    if (bomItems.length === 0) return false;
    bomItems.forEach((bi) => addTheory(bi.productId, Number(bi.quantity) * qty));
    return true;
  };

  let usedPmp = false;
  if ((productMilestoneProgresses || []).length > 0) {
    const pmpForProduct = productMilestoneProgresses.filter((p) => p.productId === fpId);
    pmpForProduct.forEach((p) => {
      const nodeId = p.milestoneTemplateId;
      const nodeWeightOn = !!nodeWeightEnabledMap.get(nodeId);
      const byVid = new Map();
      (p.reports || []).forEach((r) => {
        if (applyMaterialBreakdown(r, addActual, nodeWeightOn)) {
          usedPmp = true;
          return;
        }
        const qty = Number(r.quantity) || 0;
        if (qty <= 0) return;
        const vid = r.variantId || p.variantId || '';
        byVid.set(vid, (byVid.get(vid) || 0) + qty);
      });
      byVid.forEach((qty, vid) => {
        if (applyBomForNode(nodeId, vid, qty)) usedPmp = true;
      });
    });
  }

  if (!usedPmp) {
    const accumulateMilestoneForOrder = (ord) => {
      (ord.milestones || []).forEach((ms) => {
        if (!ms || !ms.templateId) return;
        const msWeightOn = !!nodeWeightEnabledMap.get(ms.templateId);
        const byVid = new Map();
        (ms.reports || []).forEach((r) => {
          if (applyMaterialBreakdown(r, addActual, msWeightOn)) return;
          const qty = Number(r.quantity) || 0;
          if (qty <= 0) return;
          const vid = r.variantId || '';
          byVid.set(vid, (byVid.get(vid) || 0) + qty);
        });
        byVid.forEach((qty, vid) => {
          applyBomForNode(ms.templateId, vid, qty);
        });
      });
    };
    if (roots.length > 0) {
      roots.forEach((parent) => {
        const familyIds = new Set(getOrderFamilyIds(orders, parent.id, childrenByParentId));
        orders.filter((o) => familyIds.has(o.id)).forEach(accumulateMilestoneForOrder);
      });
    } else {
      ordersForThisProduct.forEach(accumulateMilestoneForOrder);
    }
  }

  (stockRecords || []).forEach((r) => {
    if (r.type !== 'STOCK_OUT' && r.type !== 'STOCK_RETURN') return;
    const bySource = r.sourceProductId === fpId;
    const byOrder = r.orderId && allFamilyIds.has(r.orderId);
    if (!bySource && !byOrder) return;
    if (!prodMap.has(r.productId)) prodMap.set(r.productId, emptyAcc());
    const cur = prodMap.get(r.productId);
    if (r.type === 'STOCK_OUT') cur.issue += r.quantity;else
    cur.returnQty += r.quantity;
  });

  return matMapToRows(prodMap);
}

function computeAllProductMaterialStats(params) {
  const orders = params.orders,idx = params.idx,stockRecords = params.stockRecords,productMilestoneProgresses = params.productMilestoneProgresses,nodeWeightEnabledMap = params.nodeWeightEnabledMap;
  const result = new Map();
  const finishedIds = [...new Set(orders.map((o) => o.productId).filter(Boolean))].
  filter((fpId) => finishedProductHasBom(
    fpId,
    idx.productsById,
    idx.bomsById,
    idx.bomsByParentProduct
  ));
  finishedIds.forEach((fpId) => {
    result.set(
      fpId,
      computeProductMaterialStats({
        productId: fpId,
        orders,
        idx,
        stockRecords,
        productMilestoneProgresses,
        nodeWeightEnabledMap
      })
    );
  });
  return result;
}

function buildNodeWeightEnabledMap(globalNodes) {
  const m = new Map();
  (globalNodes || []).forEach((n) => {
    if (n && n.id) m.set(n.id, !!n.enableWeightOnReport);
  });
  return m;
}

function getActiveOrderIdsCsv(orders) {
  return (orders || []).map((o) => o.id).filter(Boolean).join(',');
}

function getActiveSourceProductIdsCsv(orders) {
  const set = new Set();
  (orders || []).forEach((o) => {
    if (o.productId) set.add(o.productId);
  });
  return Array.from(set).join(',');
}

function roundQty(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function matRowNetIssue(row) {
  return roundQty((Number(row.issue) || 0) - (Number(row.returnQty) || 0));
}

function matRowSurplus(row) {
  const net = matRowNetIssue(row);
  const report = matRowReportCost(row);
  return roundQty(Math.max(0, net - report));
}

const INTERNAL_PARTNER_KEY = '__internal__';

function computePartnerMaterialGroups(params) {
  const
    productionLinkMode =






    params.productionLinkMode,idx = params.idx,stockRecords = params.stockRecords,outsourceRecords = params.outsourceRecords,nodeWeightEnabledMap = params.nodeWeightEnabledMap,parentMaterialStats = params.parentMaterialStats,productMaterialStatsByProduct = params.productMaterialStatsByProduct;

  const productsById = idx.productsById,bomsById = idx.bomsById,bomsByParentProduct = idx.bomsByParentProduct,ordersById = idx.ordersById;
  const buckets = new Map();

  const ensure = (pk, sk, matId) => {
    if (!buckets.has(pk)) buckets.set(pk, new Map());
    const pMap = buckets.get(pk);
    if (!pMap.has(sk)) pMap.set(sk, new Map());
    const sMap = pMap.get(sk);
    if (!sMap.has(matId)) sMap.set(matId, emptyAcc());
    return sMap.get(matId);
  };

  const getScopeKey = (r) => {
    if (productionLinkMode === 'product') {
      if (r.sourceProductId) return r.sourceProductId;
      if (r.orderId) {var _ordersById$get;
        const rootId = resolveOrderRootId(r.orderId, ordersById);
        return ((_ordersById$get = ordersById.get(rootId)) == null ? void 0 : _ordersById$get.productId) || null;
      }
      return null;
    }
    return r.orderId ? resolveOrderRootId(r.orderId, ordersById) : null;
  };

  const totalSource = productionLinkMode === 'product' ?
  productMaterialStatsByProduct :
  parentMaterialStats;
  if (totalSource) {
    totalSource.forEach((rows, scopeKey) => {
      (rows || []).forEach((row) => {
        const acc = ensure(INTERNAL_PARTNER_KEY, scopeKey, row.productId);
        acc.theoryCost = row.theoryCost;
        acc.actualCost = row.actualCost;
      });
    });
  }

  (stockRecords || []).forEach((r) => {
    if (r.type !== 'STOCK_OUT' && r.type !== 'STOCK_RETURN') return;
    const pk = r.partner && String(r.partner).trim() || INTERNAL_PARTNER_KEY;
    const sk = getScopeKey(r);
    if (!sk) return;
    const acc = ensure(pk, sk, r.productId);
    if (r.type === 'STOCK_OUT') acc.issue += Number(r.quantity) || 0;else
    acc.returnQty += Number(r.quantity) || 0;
  });

  (outsourceRecords || []).forEach((r) => {
    if (r.type !== 'OUTSOURCE' || r.status !== '已收回' || r.sourceReworkId) return;
    const pk = r.partner && String(r.partner).trim() || INTERNAL_PARTNER_KEY;
    if (pk === INTERNAL_PARTNER_KEY || !r.nodeId) return;

    let scopeKey = null;
    let productForBom = null;
    if (productionLinkMode === 'product') {
      scopeKey = r.productId;
      productForBom = r.productId;
    } else if (r.orderId) {var _ordersById$get2;
      scopeKey = resolveOrderRootId(r.orderId, ordersById);
      productForBom = ((_ordersById$get2 = ordersById.get(r.orderId)) == null ? void 0 : _ordersById$get2.productId) || null;
    }
    if (!scopeKey || !productForBom) return;

    const applyPartnerCost = (pid, amt, kind) => {
      ensure(pk, scopeKey, pid)[kind] += amt;
      const internal = ensure(INTERNAL_PARTNER_KEY, scopeKey, pid);
      internal[kind] = Math.max(0, internal[kind] - amt);
    };
    const nodeWeightOn = !!nodeWeightEnabledMap.get(r.nodeId);
    if (!applyMaterialBreakdown(r, (pid, amt) => applyPartnerCost(pid, amt, 'actualCost'), nodeWeightOn)) {
      const bomItems = resolveBomItems(
        productsById,
        bomsById,
        bomsByParentProduct,
        productForBom,
        r.nodeId,
        r.variantId || undefined
      );
      bomItems.forEach((bi) => {
        applyPartnerCost(bi.productId, Number(bi.quantity) * (Number(r.quantity) || 0), 'theoryCost');
      });
    }
  });

  const allKeys = [...buckets.keys()].sort((a, b) => {
    if (a === INTERNAL_PARTNER_KEY) return b === INTERNAL_PARTNER_KEY ? 0 : -1;
    if (b === INTERNAL_PARTNER_KEY) return 1;
    return a.localeCompare(b, 'zh-CN');
  });

  return allKeys.map((pk) => {
    const scopeMap = buckets.get(pk);
    const data = new Map();
    scopeMap.forEach((matMap, sk) => {
      data.set(sk, matMapToRows(matMap));
    });
    return {
      partnerKey: pk,
      partnerLabel: pk === INTERNAL_PARTNER_KEY ? '本厂' : pk,
      data
    };
  });
}

module.exports = {
  INTERNAL_PARTNER_KEY,
  getOrderFamilyIds,
  matRowReportCost,
  filterMaterialRowsWithActivity,
  displayMaterialsForKeyword,
  visibleMaterialRowsForList,
  resolveBomItems,
  applyMaterialBreakdown,
  computeOrderFamilyMaterialStats,
  computeAllParentMaterialStats,
  computeProductMaterialStats,
  computeAllProductMaterialStats,
  buildNodeWeightEnabledMap,
  getActiveOrderIdsCsv,
  getActiveSourceProductIdsCsv,
  roundQty,
  matRowNetIssue,
  matRowSurplus,
  computePartnerMaterialGroups
};