import type { GlobalNodeTemplate, Product, ProductVariant } from '../types';

/** 按产品标准路线顺序，取已开启「扫码称重」的工序 */
export function getProductScanWeighingNodes(
  milestoneNodeIds: string[],
  globalNodes: GlobalNodeTemplate[],
): GlobalNodeTemplate[] {
  return milestoneNodeIds
    .map(id => globalNodes.find(n => n.id === id))
    .filter((n): n is GlobalNodeTemplate => !!n && !!n.enableScanWeighing);
}

/** 从产品档案读取规格×工序单件标准重量(kg) */
export function getVariantNodeUnitWeightKg(
  products: Product[],
  productId: string,
  variantId: string,
  nodeId: string,
): number | undefined {
  if (!productId || !variantId || !nodeId) return undefined;
  const product = products.find(p => p.id === productId);
  if (!product) return undefined;
  const variant = product.variants.find(v => v.id === variantId);
  if (!variant?.nodeUnitWeights) return undefined;
  const raw = variant.nodeUnitWeights[nodeId];
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return undefined;
  return raw;
}

/** 规范化 nodeUnitWeights：去掉非正数与非法键 */
export function sanitizeNodeUnitWeights(
  input: Record<string, unknown> | undefined,
): Record<string, number> {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(input)) {
    const n = typeof v === 'number' ? v : Number(v);
    if (k && Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}

/** 统计规格×工序矩阵中已维护的单件重量项数 */
export function countConfiguredNodeUnitWeights(
  variants: ProductVariant[],
  nodeIds: string[],
): { filled: number; total: number } {
  const total = variants.length * nodeIds.length;
  if (total === 0) return { filled: 0, total: 0 };
  let filled = 0;
  for (const v of variants) {
    for (const nodeId of nodeIds) {
      const w = v.nodeUnitWeights?.[nodeId];
      if (w != null && Number.isFinite(w) && w > 0) filled++;
    }
  }
  return { filled, total };
}
