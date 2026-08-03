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

export function asNodeBomsRecord(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = String(k).trim();
    const val = v == null ? '' : String(v).trim();
    if (!key || !val) continue;
    out[key] = val;
  }
  return out;
}

/**
 * 单条开发 BOM 变更时，解析应对齐到哪些商品规格。
 * 与 `buildBomPublishTargets` 同口径：单 SKU 通用 BOM 可落到全部真实规格。
 */
export function resolveProductVariantIdsForDevBom(
  styleId: string,
  styleVariants: Array<{ id: string }>,
  hasRealVariants: boolean,
  variantIdMap: Map<string, string>,
  defaultVariantId: string,
  devBomVariantId: string | null | undefined,
): string[] | null {
  if (hasRealVariants) {
    if (isSingleSkuDevBomVariant(devBomVariantId, styleId)) {
      const ids = styleVariants
        .map((v) => variantIdMap.get(v.id))
        .filter((id): id is string => Boolean(id));
      return ids.length > 0 ? ids : null;
    }
    if (!devBomVariantId) return null;
    const id = variantIdMap.get(devBomVariantId);
    return id ? [id] : null;
  }
  if (!isSingleSkuDevBomVariant(devBomVariantId, styleId)) return null;
  return defaultVariantId ? [defaultVariantId] : null;
}
