import { genId } from '../utils/genId.js';

const SINGLE_SKU_VARIANT_PREFIX = 'dvar-single-';

export type DevBomRow = {
  id: string;
  name: string | null;
  variantId: string | null;
  nodeId: string | null;
  items: Array<{
    categoryId: string | null;
    productId: string;
    quantity: unknown;
    note: string | null;
    useShortageOnly: boolean;
    excludeFromWeightShare: boolean;
    sortOrder: number;
  }>;
};

export type BomPublishTarget = {
  devBom: DevBomRow;
  productVariantId: string;
  newBomId: string;
};

export function isSingleSkuDevBomVariant(variantId: string | null | undefined, styleId: string): boolean {
  if (!variantId) return true;
  return variantId === `${SINGLE_SKU_VARIANT_PREFIX}${styleId}`;
}

export function effectiveDevBomItems(devBom: DevBomRow) {
  return devBom.items.filter((it) => String(it.productId ?? '').trim() !== '');
}

export function buildBomPublishTargets(
  styleBoms: DevBomRow[],
  styleVariants: Array<{ id: string }>,
  styleId: string,
  hasRealVariants: boolean,
  variantIdMap: Map<string, string>,
  defaultVariantId: string,
): BomPublishTarget[] {
  const targets: BomPublishTarget[] = [];

  for (const devBom of styleBoms) {
    if (!devBom.nodeId || effectiveDevBomItems(devBom).length === 0) continue;

    if (hasRealVariants) {
      if (isSingleSkuDevBomVariant(devBom.variantId, styleId)) {
        for (const v of styleVariants) {
          const productVariantId = variantIdMap.get(v.id);
          if (!productVariantId) continue;
          targets.push({
            devBom,
            productVariantId,
            newBomId: genId('bom'),
          });
        }
        continue;
      }
      if (!devBom.variantId) continue;
      const productVariantId = variantIdMap.get(devBom.variantId);
      if (!productVariantId) continue;
      targets.push({
        devBom,
        productVariantId,
        newBomId: genId('bom'),
      });
      continue;
    }

    if (!isSingleSkuDevBomVariant(devBom.variantId, styleId)) continue;
    targets.push({
      devBom,
      productVariantId: defaultVariantId,
      newBomId: genId('bom'),
    });
  }

  return targets;
}

export function remapNodeBomsForVariant(
  raw: Record<string, string>,
  productVariantId: string,
  targets: BomPublishTarget[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [nodeId, oldDevBomId] of Object.entries(raw)) {
    const hit = targets.find(
      (t) => t.productVariantId === productVariantId && t.devBom.id === oldDevBomId,
    );
    if (hit) out[nodeId] = hit.newBomId;
  }
  return out;
}

export function attachNodeBomsFromTargets(
  nodeBoms: Record<string, string>,
  productVariantId: string,
  targets: BomPublishTarget[],
): Record<string, string> {
  const next = { ...nodeBoms };
  for (const t of targets) {
    if (t.productVariantId !== productVariantId || !t.devBom.nodeId) continue;
    next[t.devBom.nodeId] = t.newBomId;
  }
  return next;
}
