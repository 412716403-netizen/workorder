import { AppError } from '../middleware/errorHandler.js';
import type { TenantPrismaClient } from '../lib/prisma.js';
import { genId } from '../utils/genId.js';
import * as productsService from './products.service.js';
import { DevStyleStatus } from '../../../shared/types.js';
import { devStyleInclude, mapDevStyleRow } from './dev-styles.mapper.js';
import {
  attachNodeBomsFromTargets,
  buildBomPublishTargets,
  effectiveDevBomItems,
  remapNodeBomsForVariant,
  type DevBomRow,
} from './dev-publish.helpers.js';

type ProductVariantDraft = {
  id: string;
  colorId: string;
  sizeId: string;
  skuSuffix: string;
  nodeBoms: Record<string, string>;
};

export async function publishDevStyleToProduct(
  db: TenantPrismaClient,
  tenantId: string,
  styleId: string,
) {
  const style = await db.devStyle.findUnique({
    where: { id: styleId },
    include: {
      ...devStyleInclude,
      boms: { include: { items: { orderBy: { sortOrder: 'asc' } } } },
    },
  });
  if (!style) throw new AppError(404, '款式不存在');
  if (style.status === DevStyleStatus.PUBLISHED && style.publishedProductId) {
    throw new AppError(409, '该款式已发布为大货产品');
  }
  if (style.status !== DevStyleStatus.ARCHIVED) {
    throw new AppError(409, '请先归档产品后再生成大货商品信息');
  }
  if (!style.categoryId) throw new AppError(400, '发布前请选择产品分类');
  if (!style.code?.trim()) throw new AppError(400, '款号不能为空');
  if (!style.name?.trim()) throw new AppError(400, '品名不能为空');

  const productId = genId('prod');
  const variantIdMap = new Map<string, string>();
  const hasRealVariants = style.variants.length > 0;

  let variants: ProductVariantDraft[];

  if (hasRealVariants) {
    variants = style.variants.map((v) => {
      const newId = genId('pv');
      variantIdMap.set(v.id, newId);
      const rawNodeBoms =
        v.nodeBoms && typeof v.nodeBoms === 'object' && !Array.isArray(v.nodeBoms)
          ? (v.nodeBoms as Record<string, string>)
          : {};
      return {
        id: newId,
        colorId: v.colorId ?? '',
        sizeId: v.sizeId ?? '',
        skuSuffix: v.skuSuffix ?? '',
        nodeBoms: rawNodeBoms,
      };
    });
  } else {
    const defaultVariantId = genId('pv');
    variantIdMap.set('__single__', defaultVariantId);
    variants = [
      {
        id: defaultVariantId,
        colorId: '',
        sizeId: '',
        skuSuffix: style.code,
        nodeBoms: {},
      },
    ];
  }

  const bomTargets = buildBomPublishTargets(
    style.boms as DevBomRow[],
    style.variants,
    styleId,
    hasRealVariants,
    variantIdMap,
    variants[0].id,
  );

  variants = variants.map((v) => {
    const remapped = hasRealVariants
      ? remapNodeBomsForVariant(v.nodeBoms, v.id, bomTargets)
      : v.nodeBoms;
    return {
      ...v,
      nodeBoms: attachNodeBomsFromTargets(remapped, v.id, bomTargets),
    };
  });

  await db.$transaction(async (tx) => {
    const txDb = tx as unknown as TenantPrismaClient;

    await productsService.createProduct(txDb, tenantId, {
      id: productId,
      tenantId,
      sku: style.code.trim(),
      name: style.name.trim(),
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
      variants,
    });

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

      await productsService.createBom(txDb, {
        id: target.newBomId,
        parentProductId: productId,
        variantId: target.productVariantId,
        nodeId: target.devBom.nodeId ?? undefined,
        name: target.devBom.name ?? undefined,
        items,
      });
    }

    await tx.devStyle.update({
      where: { id: styleId },
      data: {
        status: DevStyleStatus.PUBLISHED,
        publishedProductId: productId,
      },
    });
  });

  const updated = await db.devStyle.findUnique({
    where: { id: styleId },
    include: devStyleInclude,
  });
  return {
    style: mapDevStyleRow(updated!),
    productId,
  };
}
