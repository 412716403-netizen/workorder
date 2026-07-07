/**
 * 计划详情 BOM 用料清单（对齐 Web PlanDetailPanel materialRequirements useMemo）
 */

const { getMaterialLossRates, applyLoss } = require('./materialLoss.js');
const { mapProductCustomTags } = require('./reportCustomDocField.js');
const {
  buildReceivedByOrderLine,
  buildRelatedPOsByMaterial,
  getInboundProgress,
} = require('./planDetailHelpers.js');

function purchaseProgressMeta(purchaseProgress, pct) {
  if (pct == null || !purchaseProgress) {
    return {
      progressLabel: '',
      progressComplete: false,
      progressOverReceived: false,
      progressOrderedBarPct: 0,
      progressOverBarPct: 0,
    };
  }
  const ordered = Number(purchaseProgress.ordered) || 0;
  const received = Number(purchaseProgress.received) || 0;
  const progressOverReceived = ordered > 0 && received > ordered;
  const progressComplete = pct >= 100 && !progressOverReceived;
  let progressLabel;
  if (progressOverReceived) progressLabel = '采购已超收';
  else if (progressComplete) progressLabel = '采购已完成';
  else progressLabel = `采购 ${pct}%`;

  let progressOrderedBarPct = pct;
  let progressOverBarPct = 0;
  if (progressOverReceived && received > 0) {
    progressOrderedBarPct = Math.round((ordered / received) * 100);
    progressOverBarPct = 100 - progressOrderedBarPct;
  }

  return {
    progressLabel,
    progressComplete,
    progressOverReceived,
    progressOrderedBarPct,
    progressOverBarPct,
  };
}

function findSubPlanForMaterial(materialId, nodeId, rootPlanId, plans) {
  const queue = [rootPlanId];
  while (queue.length > 0) {
    const pid = queue.shift();
    const child = (plans || []).find(
      (p) => p.parentPlanId === pid
        && p.productId === materialId
        && String(p.bomNodeId || '') === String(nodeId || ''),
    );
    if (child) return child;
    (plans || []).filter((p) => p.parentPlanId === pid).forEach((p) => queue.push(p.id));
  }
  return null;
}

function getEffectiveQty(materialId, nodeId, rootPlanId, plans, fallback) {
  const subPlan = findSubPlanForMaterial(materialId, nodeId, rootPlanId, plans);
  const subQty = (subPlan && subPlan.items)
    ? subPlan.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0)
    : 0;
  if (subPlan && subQty > 0) return subQty;
  return fallback;
}

function aggregatePending(items) {
  const map = {};
  items.forEach(({ productId, nodeId, parentProductId, unitPerParent }) => {
    const k = `${productId}-${nodeId}-${parentProductId}`;
    if (!map[k]) map[k] = { productId, nodeId, parentProductId, unitPerParent };
  });
  return Object.values(map);
}

function formatQty(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '0';
  return String(Math.round(x * 100) / 100);
}

function buildMaterialStatusMeta(req, ctx) {
  const {
    products,
    viewPlan,
    plans,
    relatedPOsByMaterial,
    receivedByOrderLine,
    getUnitName,
  } = ctx;

  const materialProduct = products.find((p) => p.id === req.materialId);
  const isProducible = Boolean(
    materialProduct && materialProduct.milestoneNodeIds && materialProduct.milestoneNodeIds.length,
  );
  const subPlan = viewPlan
    ? findSubPlanForMaterial(req.materialId, req.nodeId, viewPlan.id, plans)
    : null;
  const subPlanQty = (subPlan && subPlan.items)
    ? subPlan.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0)
    : 0;
  const hasSubPlan = Boolean(subPlan && subPlanQty > 0);

  if (isProducible) {
    if (hasSubPlan) {
      return { kind: 'text', text: '已生成生产计划', tone: 'success' };
    }
    return { kind: 'text', text: '未生成计划单', tone: 'muted' };
  }

  const poList = relatedPOsByMaterial[req.materialId] || [];
  const poQty = poList.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const progress = getInboundProgress(req.materialId, relatedPOsByMaterial, receivedByOrderLine);

  if (progress && progress.ordered > 0) {
    const pct = Math.min(100, Math.round((progress.received / progress.ordered) * 100));
    const meta = purchaseProgressMeta(
      { received: progress.received, ordered: progress.ordered },
      pct,
    );
    return {
      kind: 'progress',
      progressPct: pct,
      progressLabel: meta.progressLabel,
      progressComplete: meta.progressComplete,
      progressOverReceived: meta.progressOverReceived,
      progressOrderedBarPct: meta.progressOrderedBarPct,
      progressOverBarPct: meta.progressOverBarPct,
    };
  }

  if (poList.length > 0) {
    return {
      kind: 'text',
      text: `已下采购 ${formatQty(poQty)} ${getUnitName(req.materialId)}`,
      tone: 'info',
    };
  }

  return { kind: 'text', text: '未生成采购单', tone: 'muted' };
}

function resolvePlannedQtyDisplay(req, ctx) {
  const { viewPlan, plans, relatedPOsByMaterial, getUnitName } = ctx;
  const unit = getUnitName(req.materialId);
  const subPlan = viewPlan
    ? findSubPlanForMaterial(req.materialId, req.nodeId, viewPlan.id, plans)
    : null;
  const subPlanQty = (subPlan && subPlan.items)
    ? subPlan.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0)
    : 0;
  if (subPlan && subPlanQty > 0) {
    return `${formatQty(subPlanQty)} ${unit}`;
  }
  const poList = relatedPOsByMaterial[req.materialId] || [];
  if (poList.length > 0) {
    const poQty = poList.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    return `${formatQty(poQty)} ${unit}`;
  }
  const qty = Number(req.plannedQty) || 0;
  return qty > 0 ? `${formatQty(qty)} ${unit}` : '—';
}

/**
 * @returns {Array<object>} 排序后的用料行（只读展示）
 */
function computePlanMaterialRequirements({
  plan,
  product,
  items,
  boms = [],
  products = [],
  categories = [],
  globalNodes = [],
  stockMap = {},
  stockReady = false,
  plans = [],
  planNumbersForPO = [],
  planRelated = {},
  materialLossEnabled = false,
  customData = {},
  plannedQtyByKey = {},
  getUnitName,
}) {
  if (!plan || !product || !items || !items.length) return [];

  const lossRates = getMaterialLossRates(customData);
  const viewPlan = plan;
  const viewProduct = product;

  const getServerStockQty = (materialId) => (stockReady ? (stockMap[materialId] ?? 0) : null);

  const relatedPOsByMaterial = buildRelatedPOsByMaterial(
    planRelated.purchaseOrders,
    planNumbersForPO,
    viewPlan,
  );
  const receivedByOrderLine = buildReceivedByOrderLine(planRelated.purchaseBills);

  const ctx = {
    products,
    viewPlan,
    plans,
    relatedPOsByMaterial,
    receivedByOrderLine,
    getUnitName,
  };

  const reqMap = {};
  const shortageDrivenList = [];

  const addToReqMap = (productId, quantity, nodeId, visited, level, parentProductId) => {
    if (quantity <= 0) return;
    if (visited.has(productId)) return;
    const key = `${productId}-${nodeId}`;
    if (!reqMap[key]) {
      reqMap[key] = {
        materialId: productId, nodeId, quantity: 0, level, parentProductId,
      };
    }
    reqMap[key].quantity += quantity;
    if (level > (reqMap[key].level || 0)) reqMap[key].level = level;
    if (parentProductId) reqMap[key].parentProductId = parentProductId;

    const subBom = boms.find((b) => b.parentProductId === productId);
    if (!subBom || !subBom.items || !subBom.items.length) return;
    visited.add(productId);
    subBom.items.forEach((bomItem) => {
      shortageDrivenList.push({
        productId: bomItem.productId,
        nodeId,
        parentProductId: productId,
        unitPerParent: Number(bomItem.quantity) || 0,
      });
    });
    visited.delete(productId);
  };

  items.forEach((item) => {
    const planQty = Number(item.quantity) || 0;
    if (planQty <= 0) return;
    const variantId = item.variantId || `single-${viewProduct.id}`;
    const variantBoms = boms.filter(
      (b) => b.parentProductId === viewProduct.id && b.variantId === variantId && b.nodeId,
    );
    variantBoms.forEach((bom) => {
      if (bom.nodeId) {
        (bom.items || []).forEach((bomItem) => {
          addToReqMap(
            bomItem.productId,
            Number(bomItem.quantity) * planQty,
            bom.nodeId,
            new Set(),
            1,
          );
        });
      }
    });
  });

  const list = [];
  Object.values(reqMap).forEach((req) => {
    const material = products.find((p) => p.id === req.materialId);
    const node = globalNodes.find((n) => n.id === req.nodeId);
    const stockQty = getServerStockQty(req.materialId);
    const stock = stockQty ?? 0;
    const parentId = req.parentProductId || viewProduct.id;
    const rowKey = `${req.materialId}-${req.nodeId}-${parentId}`;
    const totalNeeded = materialLossEnabled
      ? applyLoss(req.quantity, lossRates[rowKey])
      : req.quantity;
    const shortage = stockQty === null ? 0 : Math.max(0, totalNeeded - stockQty);
    const plannedFallback = plannedQtyByKey[rowKey] !== undefined
      ? (plannedQtyByKey[rowKey] ?? 0)
      : shortage;
    const plannedQty = getEffectiveQty(
      req.materialId,
      req.nodeId,
      viewPlan.id,
      plans,
      plannedFallback,
    );
    list.push({
      rowKey,
      materialId: req.materialId,
      materialName: material ? material.name : '未知物料',
      materialSku: material && material.sku ? material.sku : '-',
      nodeName: node ? node.name : '未知工序',
      nodeId: req.nodeId,
      totalNeeded,
      stock,
      shortage,
      level: req.level,
      parentProductId: req.parentProductId,
      plannedQty,
      stockReady,
    });
  });

  let pending = aggregatePending(shortageDrivenList);
  let currentLevel = 2;
  while (pending.length > 0) {
    const nextPending = [];
    pending.forEach(({ productId, nodeId, parentProductId, unitPerParent }) => {
      const parentRow = list.find(
        (r) => r.materialId === parentProductId && r.nodeId === nodeId,
      );
      const parentFallback = parentRow
        ? (plannedQtyByKey[parentRow.rowKey] !== undefined
          ? (plannedQtyByKey[parentRow.rowKey] ?? 0)
          : parentRow.shortage)
        : 0;
      const parentPlannedQty = parentRow
        ? getEffectiveQty(parentProductId, nodeId, viewPlan.id, plans, parentFallback)
        : 0;
      const rowKey = `${productId}-${nodeId}-${parentProductId}`;
      const baseNeeded = parentPlannedQty * unitPerParent;
      const totalNeeded = materialLossEnabled
        ? applyLoss(baseNeeded, lossRates[rowKey])
        : baseNeeded;
      const material = products.find((p) => p.id === productId);
      const node = globalNodes.find((n) => n.id === nodeId);
      const stockQty = getServerStockQty(productId);
      const stock = stockQty ?? 0;
      const shortage = stockQty === null ? 0 : Math.max(0, totalNeeded - stockQty);
      const plannedQty = plannedQtyByKey[rowKey] !== undefined
        ? (plannedQtyByKey[rowKey] ?? 0)
        : shortage;
      list.push({
        rowKey,
        materialId: productId,
        materialName: material ? material.name : '未知物料',
        materialSku: material && material.sku ? material.sku : '-',
        nodeName: node ? node.name : '未知工序',
        nodeId,
        totalNeeded,
        stock,
        shortage,
        level: currentLevel,
        parentProductId,
        plannedQty,
        stockReady,
      });
      const subBom = boms.find((b) => b.parentProductId === productId);
      if (subBom && subBom.items && subBom.items.length) {
        subBom.items.forEach((bomItem) => {
          nextPending.push({
            productId: bomItem.productId,
            nodeId,
            parentProductId: productId,
            unitPerParent: Number(bomItem.quantity) || 0,
          });
        });
      }
    });
    pending = aggregatePending(nextPending);
    currentLevel += 1;
  }

  const level1Rows = list.filter((r) => r.level === 1);
  const appendSubtree = (out, parentId, nid) => {
    list
      .filter((r) => r.parentProductId === parentId && r.nodeId === nid)
      .forEach((c) => {
        out.push(c);
        appendSubtree(out, c.materialId, c.nodeId);
      });
  };
  const sorted = [];
  level1Rows.forEach((p) => {
    sorted.push(p);
    appendSubtree(sorted, p.materialId, p.nodeId);
  });
  sorted.push(...list.filter((r) => !sorted.includes(r)));

  return sorted.map((req) => {
    const material = products.find((p) => p.id === req.materialId);
    const category = material
      ? categories.find((c) => c.id === material.categoryId)
      : null;
    const customTags = mapProductCustomTags(material, category, { includeFile: false });
    const unit = getUnitName(req.materialId);
    const lossPct = lossRates[req.rowKey];
    const status = buildMaterialStatusMeta(req, ctx);

    let shortageText = '…';
    if (req.stockReady) {
      shortageText = req.shortage > 0
        ? `${formatQty(req.shortage)} ${unit}`
        : '库存充沛';
    } else if (!stockReady) {
      shortageText = '…';
    }

    return {
      rowKey: req.rowKey,
      materialName: req.materialName,
      materialSku: req.materialSku,
      nodeName: req.nodeName,
      level: req.level,
      showLevel: (req.level || 1) >= 2,
      levelLabel: req.level === 2 ? '二级' : req.level === 3 ? '三级' : `${req.level}级`,
      indentRpx: (req.level || 1) >= 2 ? 24 + ((req.level || 2) - 1) * 20 : 0,
      customTags,
      showCustomTags: customTags.length > 0,
      showLoss: materialLossEnabled,
      lossText: lossPct != null && lossPct > 0 ? `${lossPct}%` : '—',
      totalNeededText: `${formatQty(req.totalNeeded)} ${unit}`,
      stockText: req.stockReady
        ? `${formatQty(req.stock)} ${unit}`
        : '…',
      stockLow: req.stockReady && req.stock < req.totalNeeded,
      shortageText,
      shortageHighlight: req.stockReady && req.shortage > 0,
      shortageIsOk: req.stockReady && req.shortage <= 0,
      stockLoading: !req.stockReady,
      showSku: Boolean(req.materialSku && req.materialSku !== '-'),
      plannedQtyText: resolvePlannedQtyDisplay(req, ctx),
      status,
      statusTone: status.kind === 'progress'
        ? 'progress'
        : (status.tone || 'muted'),
    };
  });
}

module.exports = {
  computePlanMaterialRequirements,
};
