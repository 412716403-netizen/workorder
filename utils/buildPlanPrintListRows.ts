import type {
  AppDictionaries,
  BOM,
  GlobalNodeTemplate,
  PlanOrder,
  PrintListRow,
  Product,
  ProductCategory,
  ProductVariant,
} from '../types';
import { getProductCategoryCustomFieldEntries } from './reportCustomDocField';
import { buildSalesBillPrintListRowsByProductLine, type SalesBillLineInput } from './buildSalesBillPrintContext';
import {
  COLOR_MATERIAL_MATRIX_JSON_KEY,
  type ColorMaterialMatrixColorRow,
  type ColorMaterialMatrixNodeBlock,
  type ColorMaterialMatrixPayload,
  serializeColorMaterialMatrixPayload,
} from './colorMaterialMatrixPrint';
import { applyLoss, getMaterialLossRates } from './materialLoss';

/** 与计划单用料清单一致：BOM 子项单件用量 */
function bomLineUnitQty(quantity: unknown): number {
  const q = Number(quantity);
  return Number.isFinite(q) ? q : 0;
}

function formatMaterialQty(q: number): string {
  if (!Number.isFinite(q)) return '';
  const s = q.toFixed(4).replace(/\.?0+$/, '');
  return s === '' ? '0' : s;
}

/** 分组键：有颜色按颜色 id；否则每个规格单独一行 */
function stableVariantGroupKey(v: ProductVariant): string {
  return v.colorId ? `c:${v.colorId}` : `v:${v.id}`;
}

function colorDisplayName(
  groupKey: string,
  repVariantId: string,
  product: Product,
  dictionaries: AppDictionaries,
): string {
  const v = product.variants.find(x => x.id === repVariantId);
  if (!v) return '—';
  if (groupKey.startsWith('c:')) {
    const cid = groupKey.slice(2);
    const nm = dictionaries.colors?.find(c => c.id === cid)?.name;
    if (nm != null && String(nm).trim() !== '') return String(nm);
    return cid.trim() !== '' ? cid : '—';
  }
  return (v.skuSuffix ?? '').trim() || '—';
}

function materialFormSummary(
  materialProducts: Map<string, Product>,
  categoryById: Map<string, ProductCategory>,
  materialId: string,
): string | undefined {
  const mat = materialProducts.get(materialId);
  const cat = mat?.categoryId ? categoryById.get(mat.categoryId) : undefined;
  const tags = getProductCategoryCustomFieldEntries(mat ?? null, cat ?? null, { includeFile: false });
  return tags.length > 0 ? tags.map(t => `${t.field.label}: ${t.display}`).join(' · ') : undefined;
}

type MaterialAcc = Map<string, number>;
type ColorAcc = Map<string, MaterialAcc>;
type NodeAcc = Map<string, ColorAcc>;

/** 计划单列表打印用：按节点 × 颜色汇总 BOM 子项（逐 plan item × 规格 BOM，与 PlanDetailPanel 用料清单同口径） */
export function buildColorMaterialMatrixPayloadForPlan(opts: {
  plan: PlanOrder;
  product: Product;
  dictionaries: AppDictionaries;
  globalNodes: GlobalNodeTemplate[];
  boms: BOM[];
  products: Product[];
  hasVariantQty: boolean;
  qtyNoVariant: number;
  categories?: ProductCategory[];
  materialLossEnabled?: boolean;
}): ColorMaterialMatrixPayload {
  const { plan, product, dictionaries, globalNodes, boms, products, hasVariantQty, qtyNoVariant } = opts;
  const categoryById = new Map((opts.categories ?? []).map(c => [c.id, c]));
  const materialProducts = new Map(products.map(p => [p.id, p]));
  const lossRates = opts.materialLossEnabled ? getMaterialLossRates(plan.customData) : {};

  const nodeIds = (product.milestoneNodeIds ?? []) as string[];
  const selectedNodesOrdered = nodeIds
    .map(id => globalNodes.find(gn => gn.id === id))
    .filter((n): n is GlobalNodeTemplate => Boolean(n));
  const enabledBOMNodes = selectedNodesOrdered.filter(n => n.hasBOM);
  const enabledNodeIdSet = new Set(enabledBOMNodes.map(n => n.id));

  const colorOrder: string[] = [];
  const repVariantByGroup = new Map<string, string>();
  /** nodeId → colorKey → 物料 id 出现顺序（与 BOM 行顺序一致） */
  const materialOrderByNodeColor = new Map<string, Map<string, string[]>>();
  const acc: NodeAcc = new Map();

  const ensureColor = (colorKey: string, variantId: string) => {
    if (!colorOrder.includes(colorKey)) colorOrder.push(colorKey);
    if (!repVariantByGroup.has(colorKey)) repVariantByGroup.set(colorKey, variantId);
  };

  const addMaterialQty = (nodeId: string, colorKey: string, materialId: string, delta: number) => {
    if (delta <= 0 || !enabledNodeIdSet.has(nodeId)) return;
    let nodeMap = acc.get(nodeId);
    if (!nodeMap) {
      nodeMap = new Map();
      acc.set(nodeId, nodeMap);
    }
    let colorMap = nodeMap.get(colorKey);
    if (!colorMap) {
      colorMap = new Map();
      nodeMap.set(colorKey, colorMap);
    }
    colorMap.set(materialId, (colorMap.get(materialId) ?? 0) + delta);

    let orderByColor = materialOrderByNodeColor.get(nodeId);
    if (!orderByColor) {
      orderByColor = new Map();
      materialOrderByNodeColor.set(nodeId, orderByColor);
    }
    const order = orderByColor.get(colorKey) ?? [];
    if (!order.includes(materialId)) {
      order.push(materialId);
      orderByColor.set(colorKey, order);
    }
  };

  const accumulateFromPlanItem = (variantId: string, planQty: number, colorKey: string) => {
    if (planQty <= 0) return;
    ensureColor(colorKey, variantId);
    const variantBoms = boms.filter(
      b => b.parentProductId === product.id && b.variantId === variantId && b.nodeId && enabledNodeIdSet.has(b.nodeId),
    );
    for (const bom of variantBoms) {
      const nodeId = bom.nodeId!;
      for (const bomItem of bom.items ?? []) {
        const materialId = (bomItem.productId ?? '').trim();
        if (!materialId) continue;
        const unit = bomLineUnitQty(bomItem.quantity);
        let needed = unit * planQty;
        if (opts.materialLossEnabled) {
          const rowKey = `${materialId}-${nodeId}-${product.id}`;
          needed = applyLoss(needed, lossRates[rowKey]);
        }
        addMaterialQty(nodeId, colorKey, materialId, needed);
      }
    }
  };

  if (hasVariantQty) {
    for (const it of plan.items ?? []) {
      const planQty = Number(it.quantity) || 0;
      if (planQty <= 0 || !it.variantId) continue;
      const v = product.variants.find(x => x.id === it.variantId);
      if (!v) continue;
      accumulateFromPlanItem(it.variantId, planQty, stableVariantGroupKey(v));
    }
  } else if (qtyNoVariant > 0) {
    const sid = `single-${product.id}`;
    accumulateFromPlanItem(sid, qtyNoVariant, 'sku:single');
  }

  const nodeBlocks: ColorMaterialMatrixNodeBlock[] = [];

  for (const node of enabledBOMNodes) {
    const nodeId = node.id;
    const nodeName = node.name ?? nodeId;
    const nodeMap = acc.get(nodeId);
    if (!nodeMap) continue;

    const colorRows: ColorMaterialMatrixColorRow[] = [];
    let anyConfigured = false;

    for (const gk of colorOrder) {
      const colorMap = nodeMap.get(gk);
      const repVid = repVariantByGroup.get(gk);
      const colorName = gk === 'sku:single' ? '—' : colorDisplayName(gk, repVid ?? '', product, dictionaries);
      const materialIds = materialOrderByNodeColor.get(nodeId)?.get(gk) ?? [];
      const materials: ColorMaterialMatrixColorRow['materials'] = [];

      for (const materialId of materialIds) {
        const qty = colorMap?.get(materialId) ?? 0;
        if (qty <= 0) continue;
        anyConfigured = true;
        const mat = materialProducts.get(materialId);
        const productFormSummary = materialFormSummary(materialProducts, categoryById, materialId);
        materials.push({
          name: mat?.name ?? '',
          ratio: formatMaterialQty(qty),
          ...(productFormSummary ? { productFormSummary } : {}),
        });
      }

      colorRows.push({ colorName, materials });
    }

    if (anyConfigured && colorRows.length > 0) {
      nodeBlocks.push({ nodeName, colorRows });
    }
  }

  return { nodeBlocks };
}

/**
 * 计划单列表打印：为动态列表提供 printListRows（一条计划产品块一行，含 colorSizeMatrixJson 与 colorMaterialMatrixJson）。
 * 将计划 items 的 variantId+quantity 汇总为一条「销售明细样式」行，复用 buildSalesBillPrintListRowsByProductLine 的矩阵逻辑。
 */
export function buildPlanPrintListRows(
  plan: PlanOrder,
  product: Product | undefined,
  dictionaries: AppDictionaries,
  opts?: {
    globalNodes?: GlobalNodeTemplate[];
    boms?: BOM[];
    products?: Product[];
    categories?: ProductCategory[];
    materialLossEnabled?: boolean;
  },
): PrintListRow[] {
  if (!plan?.productId || !product) return [];

  const variantQuantities: Record<string, number> = {};
  for (const it of plan.items || []) {
    if (!it.variantId) continue;
    variantQuantities[it.variantId] = (variantQuantities[it.variantId] ?? 0) + (Number(it.quantity) || 0);
  }

  let qtyNoVariant = 0;
  for (const it of plan.items || []) {
    if (!it.variantId) qtyNoVariant += Number(it.quantity) || 0;
  }

  const hasVariantQty = Object.values(variantQuantities).some(q => q > 0);
  if (!hasVariantQty && qtyNoVariant <= 0) return [];

  const line: SalesBillLineInput = {
    id: `plan-${plan.id}`,
    productId: plan.productId,
    salesPrice: 0,
    quantity: hasVariantQty ? undefined : qtyNoVariant,
    variantQuantities: hasVariantQty ? variantQuantities : undefined,
  };

  const productMap = new Map<string, Product>([[product.id, product]]);
  const rows = buildSalesBillPrintListRowsByProductLine([line], productMap, dictionaries);

  if (!opts) return rows;

  const gn = opts.globalNodes ?? [];
  const bm = opts.boms ?? [];
  const pr = opts.products ?? [];
  const cats = opts.categories ?? [];

  const payload = buildColorMaterialMatrixPayloadForPlan({
    plan,
    product,
    dictionaries,
    globalNodes: gn,
    boms: bm,
    products: pr.length > 0 ? pr : [product],
    hasVariantQty,
    qtyNoVariant,
    categories: cats,
    materialLossEnabled: opts.materialLossEnabled,
  });

  const json = serializeColorMaterialMatrixPayload(payload);
  return rows.map(r => ({ ...r, [COLOR_MATERIAL_MATRIX_JSON_KEY]: json }));
}
