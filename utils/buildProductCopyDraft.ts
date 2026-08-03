import type { BOM, Product, ProductVariant } from '../types';
import { bomHasConfiguredItems } from './bomEffective';
import { isProductNameTakenInCatalog } from './productCatalogUnique';

export const COPY_SUFFIX = '副本';

/** 非空字符串追加「-副本」；已带序号则递增 */
export function appendCopySuffix(value: string): string {
  const t = value.trim();
  if (!t) return '';
  const numbered = t.match(new RegExp(`-${COPY_SUFFIX}(\\d+)$`));
  if (numbered) {
    const n = Number(numbered[1]) + 1;
    return `${t.slice(0, -numbered[0].length)}-${COPY_SUFFIX}${n}`;
  }
  if (t.endsWith(`-${COPY_SUFFIX}`)) return `${t}2`;
  return `${t}-${COPY_SUFFIX}`;
}

/** 在目录内生成唯一的产品编号（name），必要时 -副本 / -副本2 / … */
export function uniqueCopiedProductName(
  sourceName: string,
  catalog: Product[],
  excludeProductId?: string,
): string {
  const base = sourceName.trim() || COPY_SUFFIX;
  let candidate = appendCopySuffix(base);
  if (!candidate) candidate = COPY_SUFFIX;
  let i = 2;
  const root = base
    .replace(new RegExp(`-${COPY_SUFFIX}\\d*$`), '')
    .replace(new RegExp(`-${COPY_SUFFIX}$`), '') || base;
  while (isProductNameTakenInCatalog(catalog, candidate, excludeProductId)) {
    candidate = `${root}-${COPY_SUFFIX}${i}`;
    i += 1;
    if (i > 200) break;
  }
  return candidate;
}

function newId(prefix: string, seed: () => string): string {
  return `${prefix}-${seed()}`;
}

export interface ProductCopyDraft {
  product: Product;
  boms: BOM[];
}

export interface BuildProductCopyDraftOptions {
  /** 已占用的产品编号去重用 */
  catalog?: Product[];
  /** 可注入，便于单测 */
  idFactory?: () => string;
  /**
   * 当前分类启用了自动编号规则时传 true：
   * 产品编号（name）留空，由新建页的自动取号逻辑填写；产品名称（sku）仍加「副本」后缀。
   */
  useAutoCode?: boolean;
}

/**
 * 从已有产品生成「新建用」草稿：新 product/variant/bom id，
 * 工序 / 规格 / BOM（含 nodeBoms 映射）一并带上；清除工序锁定标记。
 * - 手动编号：产品编号加「副本」并去重
 * - 自动编号（useAutoCode）：编号留空，交给新建页规则取号
 */
export function buildProductCopyDraft(
  source: Product,
  sourceBoms: BOM[],
  opts: BuildProductCopyDraftOptions = {},
): ProductCopyDraft {
  let seq = 0;
  const seed = opts.idFactory ?? (() => {
    seq += 1;
    return `${Date.now().toString(36)}-${seq}-${Math.random().toString(36).slice(2, 8)}`;
  });
  const catalog = opts.catalog ?? [];

  const newProductId = newId('p', seed);
  const variantIdMap = new Map<string, string>();
  const newVariants: ProductVariant[] = (source.variants ?? []).map((v) => {
    const nid = newId('pv', seed);
    variantIdMap.set(v.id, nid);
    return {
      ...(JSON.parse(JSON.stringify(v)) as ProductVariant),
      id: nid,
      nodeBoms: { ...(v.nodeBoms ?? {}) },
    };
  });

  const newName = opts.useAutoCode
    ? ''
    : uniqueCopiedProductName(source.name ?? '', catalog, source.id);
  const sourceSku = (source.sku ?? '').trim();
  const newSku = sourceSku ? appendCopySuffix(sourceSku) : '';

  const productBoms = sourceBoms.filter(
    (b) => b.parentProductId === source.id && bomHasConfiguredItems(b),
  );
  const bomIdMap = new Map<string, string>();
  for (const b of productBoms) {
    bomIdMap.set(b.id, newId('bom', seed));
  }

  for (const v of newVariants) {
    if (!v.nodeBoms) continue;
    const next: Record<string, string> = {};
    for (const [nodeId, bomId] of Object.entries(v.nodeBoms)) {
      next[nodeId] = bomIdMap.get(bomId) ?? bomId;
    }
    v.nodeBoms = next;
  }

  // BOM 名称里若含旧产品编号，自动编号时用「副本」占位展示名，避免空编号
  const nameForBomLabel = newName || uniqueCopiedProductName(source.name ?? '', catalog, source.id);

  const boms: BOM[] = productBoms.map((b) => {
    const newBomId = bomIdMap.get(b.id)!;
    const mappedVariantId = b.variantId ? (variantIdMap.get(b.variantId) ?? b.variantId) : b.variantId;
    const cloned = JSON.parse(JSON.stringify(b)) as BOM;
    let name = cloned.name ?? '';
    const srcName = (source.name ?? '').trim();
    if (srcName && name.includes(srcName)) {
      name = name.split(srcName).join(nameForBomLabel);
    }
    return {
      ...cloned,
      id: newBomId,
      name,
      parentProductId: newProductId,
      variantId: mappedVariantId,
      items: (cloned.items ?? []).map((it) => ({ ...it })),
    };
  });

  const product: Product = {
    ...(JSON.parse(JSON.stringify(source)) as Product),
    id: newProductId,
    name: newName,
    sku: newSku,
    variants: newVariants,
    processLocked: false,
    enabled: true,
  };

  return { product, boms };
}
