import type {
  AppDictionaries,
  BOM,
  BOMItem,
  GlobalNodeTemplate,
  PlanOrder,
  PrintListRow,
  Product,
  ProductVariant,
} from '../types';
import { bomHasConfiguredItems } from './bomEffective';
import { buildSalesBillPrintListRowsByProductLine, type SalesBillLineInput } from './buildSalesBillPrintContext';
import {
  COLOR_MATERIAL_MATRIX_JSON_KEY,
  type ColorMaterialMatrixColorRow,
  type ColorMaterialMatrixNodeBlock,
  type ColorMaterialMatrixPayload,
  serializeColorMaterialMatrixPayload,
} from './colorMaterialMatrixPrint';

function bomQuantityDisplay(it: BOMItem, multiplier = 1): string {
  const inp = it.quantityInput;
  const fromInput =
    inp !== undefined && String(inp).trim() !== '' ? Number(String(inp).trim()) : undefined;
  const qRaw = Number.isFinite(fromInput) ? (fromInput as number) : typeof it.quantity === 'number' ? it.quantity : Number(it.quantity);
  const q = qRaw * (Number.isFinite(multiplier) ? multiplier : 1);
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

function resolveBomForVariantNode(product: Product, variantId: string, nodeId: string, boms: BOM[]): BOM | undefined {
  const variant = product.variants.find(v => v.id === variantId);
  const bomIdFromMap = variant?.nodeBoms?.[nodeId];
  if (bomIdFromMap) {
    const b = boms.find(x => x.id === bomIdFromMap && x.parentProductId === product.id);
    if (b && bomHasConfiguredItems(b)) return b;
  }
  return boms.find(
    b =>
      b.parentProductId === product.id &&
      b.variantId === variantId &&
      b.nodeId === nodeId &&
      bomHasConfiguredItems(b),
  );
}

function buildMaterialsFromBom(
  bom: BOM,
  materialProducts: Map<string, Product>,
  planQtyMultiplier: number,
): ColorMaterialMatrixColorRow['materials'] {
  const out: ColorMaterialMatrixColorRow['materials'] = [];
  for (const it of bom.items ?? []) {
    if (!(it.productId ?? '').trim()) continue;
    const name = materialProducts.get(it.productId)?.name ?? '';
    out.push({ name, ratio: bomQuantityDisplay(it, planQtyMultiplier) });
  }
  return out;
}

/** 计划单列表打印用：按节点 × 计划涉及颜色的 BOM 子项构造矩阵 JSON */
export function buildColorMaterialMatrixPayloadForPlan(opts: {
  plan: PlanOrder;
  product: Product;
  dictionaries: AppDictionaries;
  globalNodes: GlobalNodeTemplate[];
  boms: BOM[];
  products: Product[];
  hasVariantQty: boolean;
  qtyNoVariant: number;
}): ColorMaterialMatrixPayload {
  const { plan, product, dictionaries, globalNodes, boms, products, hasVariantQty, qtyNoVariant } = opts;

  const materialProducts = new Map(products.map(p => [p.id, p]));

  const colorOrder: string[] = [];
  const repVariantByGroup = new Map<string, string>();
  const plannedQtyByGroup = new Map<string, number>();

  if (hasVariantQty) {
    for (const it of plan.items ?? []) {
      const q = Number(it.quantity) || 0;
      if (q <= 0 || !it.variantId) continue;
      const v = product.variants.find(x => x.id === it.variantId);
      if (!v) continue;
      const gk = stableVariantGroupKey(v);
      if (!repVariantByGroup.has(gk)) {
        repVariantByGroup.set(gk, v.id);
        colorOrder.push(gk);
      }
      plannedQtyByGroup.set(gk, (plannedQtyByGroup.get(gk) ?? 0) + q);
    }
  } else if (qtyNoVariant > 0) {
    const sid = `single-${product.id}`;
    colorOrder.push('sku:single');
    repVariantByGroup.set('sku:single', sid);
    plannedQtyByGroup.set('sku:single', qtyNoVariant);
  }

  const nodeIds = (product.milestoneNodeIds ?? []) as string[];
  const selectedNodesOrdered = nodeIds
    .map(id => globalNodes.find(gn => gn.id === id))
    .filter((n): n is GlobalNodeTemplate => Boolean(n));
  const enabledBOMNodes = selectedNodesOrdered.filter(n => n.hasBOM);

  const nodeBlocks: ColorMaterialMatrixNodeBlock[] = [];

  for (const node of enabledBOMNodes) {
    const nodeId = node.id;
    const nodeName = node.name ?? nodeId;
    const colorRows: ColorMaterialMatrixColorRow[] = [];
    let anyConfigured = false;

    for (const gk of colorOrder) {
      const repVid = repVariantByGroup.get(gk);
      if (!repVid) continue;
      const bom = resolveBomForVariantNode(product, repVid, nodeId, boms);
      const colorPlanQty = plannedQtyByGroup.get(gk) ?? 0;
      const materials = bom ? buildMaterialsFromBom(bom, materialProducts, colorPlanQty) : [];
      if (materials.length > 0) anyConfigured = true;
      const colorName =
        gk === 'sku:single' ? '—' : colorDisplayName(gk, repVid, product, dictionaries);
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

  const payload = buildColorMaterialMatrixPayloadForPlan({
    plan,
    product,
    dictionaries,
    globalNodes: gn,
    boms: bm,
    products: pr.length > 0 ? pr : [product],
    hasVariantQty,
    qtyNoVariant,
  });

  const json = serializeColorMaterialMatrixPayload(payload);
  return rows.map(r => ({ ...r, [COLOR_MATERIAL_MATRIX_JSON_KEY]: json }));
}
