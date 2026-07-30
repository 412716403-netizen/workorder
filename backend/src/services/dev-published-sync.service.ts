import type { TenantPrismaClient } from '../lib/prisma.js';
import { genId } from '../utils/genId.js';
import { updateProduct, createBom } from './products.service.js';
import {
  attachNodeBomsFromTargets,
  buildBomPublishTargets,
  effectiveDevBomItems,
  type DevBomRow,
} from './dev-publish.helpers.js';

type StyleVariantRow = {
  id: string;
  colorId: string | null;
  sizeId: string | null;
  skuSuffix: string | null;
};

function variantKey(colorId: string | null | undefined, sizeId: string | null | undefined): string {
  return `${colorId ?? ''}|${sizeId ?? ''}`;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((x) => String(x)) : [];
}

function asJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * 已生成商品的款式：把当前开发侧档案 + 色码/工序/变体 + 试制 BOM 覆盖写回产品档案。
 * 变体按 colorId×sizeId 对齐已有 `pv-*`（避免误删被引用规格）；BOM 全量替换并重映射 nodeBoms。
 * 注意：走 products.service 写产品，**不**经 HTTP controller，故不会反向触发 syncDevStyleFromPublishedProduct。
 */
export async function syncPublishedProductFromDevStyle(
  db: TenantPrismaClient,
  tenantId: string,
  styleId: string,
  productId: string,
): Promise<void> {
  const style = await db.devStyle.findUnique({
    where: { id: styleId },
    include: {
      variants: { orderBy: { id: 'asc' as const } },
      boms: { include: { items: { orderBy: { sortOrder: 'asc' as const } } } },
    },
  });
  if (!style) return;

  const existingPVs = await db.productVariant.findMany({
    where: { productId },
    select: { id: true, colorId: true, sizeId: true },
  });
  const pvByColorSize = new Map(
    existingPVs.map((v) => [variantKey(v.colorId, v.sizeId), v.id]),
  );

  const styleVariants = style.variants as StyleVariantRow[];
  const hasRealVariants = styleVariants.length > 0;
  const variantIdMap = new Map<string, string>();

  let productVariants: Array<{
    id: string;
    colorId: string;
    sizeId: string;
    skuSuffix: string;
    nodeBoms: Record<string, string>;
  }>;

  if (hasRealVariants) {
    productVariants = styleVariants.map((dv) => {
      const key = variantKey(dv.colorId, dv.sizeId);
      const pvId = pvByColorSize.get(key) ?? genId('pv');
      variantIdMap.set(dv.id, pvId);
      return {
        id: pvId,
        colorId: dv.colorId ?? '',
        sizeId: dv.sizeId ?? '',
        skuSuffix: dv.skuSuffix ?? '',
        nodeBoms: {},
      };
    });
  } else {
    const defaultId =
      existingPVs.find((v) => !v.colorId && !v.sizeId)?.id ??
      existingPVs[0]?.id ??
      genId('pv');
    variantIdMap.set('__single__', defaultId);
    productVariants = [
      {
        id: defaultId,
        colorId: '',
        sizeId: '',
        skuSuffix: style.code?.trim() ?? '',
        nodeBoms: {},
      },
    ];
  }

  const bomTargets = buildBomPublishTargets(
    style.boms as DevBomRow[],
    styleVariants,
    styleId,
    hasRealVariants,
    variantIdMap,
    productVariants[0].id,
  );

  productVariants = productVariants.map((v) => ({
    ...v,
    nodeBoms: attachNodeBomsFromTargets({}, v.id, bomTargets),
  }));

  await updateProduct(db, tenantId, productId, {
    name: style.name,
    sku: style.code ?? '',
    imageUrl: style.imageUrl ?? undefined,
    categoryId: style.categoryId,
    categoryCustomData: style.categoryCustomData,
    colorIds: style.colorIds,
    sizeIds: style.sizeIds,
    milestoneNodeIds: style.milestoneNodeIds,
    salesPrice: style.salesPrice != null ? Number(style.salesPrice) : undefined,
    purchasePrice: style.purchasePrice != null ? Number(style.purchasePrice) : undefined,
    unitId: style.unitId ?? undefined,
    supplierId: style.supplierId ?? undefined,
    variants: productVariants,
  });

  // 覆盖写回大货 BOM（与首次发布同口径：新 bom id + nodeBoms 已指向它们）
  await db.bom.deleteMany({ where: { parentProductId: productId } });
  for (const target of bomTargets) {
    const items = effectiveDevBomItems(target.devBom).map((item, idx) => ({
      categoryId: item.categoryId ?? undefined,
      productId: item.productId,
      quantity: Number(item.quantity),
      note: item.note ?? undefined,
      useShortageOnly: item.useShortageOnly,
      excludeFromWeightShare: item.excludeFromWeightShare,
      sortOrder: item.sortOrder ?? idx,
    }));
    await createBom(
      db,
      {
        id: target.newBomId,
        parentProductId: productId,
        variantId: target.productVariantId,
        nodeId: target.devBom.nodeId ?? undefined,
        name: target.devBom.name ?? undefined,
        items,
      },
      tenantId,
    );
  }
}

/**
 * 产品档案侧改动 → 回写关联开发款式（`publishedProductId` 指向本产品）。
 * 直接写 Prisma，不走 updateDevStyle / createDevBom，避免再触发开发→产品回写形成环。
 */
export async function syncDevStyleFromPublishedProduct(
  db: TenantPrismaClient,
  productId: string,
): Promise<void> {
  const style = await db.devStyle.findFirst({
    where: { publishedProductId: productId },
    include: { variants: { orderBy: { id: 'asc' as const } } },
  });
  if (!style) return;

  const product = await db.product.findUnique({
    where: { id: productId },
    include: { variants: { orderBy: { id: 'asc' as const } } },
  });
  if (!product) return;

  const productBoms = await db.bom.findMany({
    where: { parentProductId: productId },
    include: { items: { orderBy: { sortOrder: 'asc' as const } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  const existingByKey = new Map(
    style.variants.map((v) => [variantKey(v.colorId, v.sizeId), v.id]),
  );

  const productRealVariants = product.variants.filter(
    (v) => Boolean(v.colorId?.trim()) || Boolean(v.sizeId?.trim()),
  );
  const hasRealVariants = productRealVariants.length > 0;
  /** productVariantId → styleVariantId（单 SKU 时指向 dvar-single-*） */
  const pvToDv = new Map<string, string>();

  type StyleVariantWrite = {
    id: string;
    styleId: string;
    colorId: string | null;
    sizeId: string | null;
    skuSuffix: string | null;
    nodeBoms: Record<string, string>;
  };

  let styleVariants: StyleVariantWrite[];

  if (hasRealVariants) {
    styleVariants = productRealVariants.map((pv) => {
      const key = variantKey(pv.colorId, pv.sizeId);
      const id = existingByKey.get(key) ?? genId('dvar');
      pvToDv.set(pv.id, id);
      return {
        id,
        styleId: style.id,
        colorId: pv.colorId?.trim() ? pv.colorId : null,
        sizeId: pv.sizeId?.trim() ? pv.sizeId : null,
        skuSuffix: pv.skuSuffix?.trim() ? pv.skuSuffix : null,
        nodeBoms: {},
      };
    });
  } else {
    styleVariants = [];
    const singleId = `dvar-single-${style.id}`;
    const defaultPv =
      product.variants.find((v) => !v.colorId?.trim() && !v.sizeId?.trim()) ??
      product.variants[0];
    if (defaultPv) pvToDv.set(defaultPv.id, singleId);
  }

  type DevBomWrite = {
    id: string;
    tenantId: string;
    parentStyleId: string;
    variantId: string | null;
    nodeId: string | null;
    name: string | null;
    items: Array<{
      categoryId: string | null;
      productId: string;
      quantity: number;
      note: string | null;
      useShortageOnly: boolean;
      excludeFromWeightShare: boolean;
      sortOrder: number;
    }>;
  };

  const devBoms: DevBomWrite[] = [];
  for (const bom of productBoms) {
    const items = bom.items
      .filter((it) => String(it.productId ?? '').trim() !== '')
      .map((it, idx) => ({
        categoryId: it.categoryId,
        productId: it.productId,
        quantity: Number(it.quantity),
        note: it.note,
        useShortageOnly: it.useShortageOnly,
        excludeFromWeightShare: it.excludeFromWeightShare,
        sortOrder: it.sortOrder ?? idx,
      }));
    if (!bom.nodeId || items.length === 0) continue;

    const mappedVariantId = bom.variantId ? pvToDv.get(bom.variantId) : undefined;
    const variantId = hasRealVariants
      ? mappedVariantId ?? null
      : `dvar-single-${style.id}`;
    if (hasRealVariants && !variantId) continue;

    const newBomId = genId('dbom');
    devBoms.push({
      id: newBomId,
      tenantId: style.tenantId,
      parentStyleId: style.id,
      variantId,
      nodeId: bom.nodeId,
      name: bom.name?.trim() ? bom.name : null,
      items,
    });

    if (hasRealVariants && variantId) {
      const row = styleVariants.find((v) => v.id === variantId);
      if (row) row.nodeBoms[bom.nodeId] = newBomId;
    }
  }

  // 其它款式不得占用同一品名（本款式与本产品除外）
  const productName = product.name.trim();
  if (productName) {
    const dupStyle = await db.devStyle.findFirst({
      where: { name: productName, id: { not: style.id } },
      select: { id: true },
    });
    if (dupStyle) {
      // 产品已落库；款式侧冲突极少见，跳过整次回写以免 500 掩盖产品保存成功
      return;
    }
  }

  await db.$transaction(async (tx) => {
    await tx.devStyle.update({
      where: { id: style.id },
      data: {
        name: product.name,
        code: product.sku?.trim() ? product.sku : null,
        imageUrl: product.imageUrl,
        imageThumb: product.imageThumb,
        categoryId: product.categoryId,
        categoryCustomData: asJsonObject(product.categoryCustomData),
        colorIds: asStringArray(product.colorIds),
        sizeIds: asStringArray(product.sizeIds),
        milestoneNodeIds: asStringArray(product.milestoneNodeIds),
        salesPrice: product.salesPrice,
        purchasePrice: product.purchasePrice,
        unitId: product.unitId,
        supplierId: product.supplierId,
      },
    });

    await tx.devStyleVariant.deleteMany({ where: { styleId: style.id } });
    if (styleVariants.length > 0) {
      await tx.devStyleVariant.createMany({
        data: styleVariants.map((v) => ({
          id: v.id,
          styleId: v.styleId,
          colorId: v.colorId,
          sizeId: v.sizeId,
          skuSuffix: v.skuSuffix,
          nodeBoms: v.nodeBoms,
        })),
      });
    }

    await tx.devBom.deleteMany({ where: { parentStyleId: style.id } });
    for (const bom of devBoms) {
      await tx.devBom.create({
        data: {
          id: bom.id,
          tenantId: bom.tenantId,
          parentStyleId: bom.parentStyleId,
          variantId: bom.variantId,
          nodeId: bom.nodeId,
          name: bom.name,
          items: {
            create: bom.items.map((it) => ({
              categoryId: it.categoryId,
              productId: it.productId,
              quantity: it.quantity,
              note: it.note,
              useShortageOnly: it.useShortageOnly,
              excludeFromWeightShare: it.excludeFromWeightShare,
              sortOrder: it.sortOrder,
            })),
          },
        },
      });
    }
  });
}
