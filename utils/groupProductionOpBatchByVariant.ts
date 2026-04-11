import type { ProductionOpRecord, Product } from '../types';

export type VariantGroupedOpRow = {
  variantId: string;
  label: string;
  quantity: number;
  recordIds: string[];
};

/** 同一单据号/批次内的生产操作记录按 variantId 合并，用于详情展示与编辑一行一规格 */
export function groupProductionOpBatchByVariant(
  batch: ProductionOpRecord[],
  product: Product | undefined,
): VariantGroupedOpRow[] {
  const labelFor = (rec: ProductionOpRecord) => {
    if (!rec.variantId) return '未分规格';
    const v = product?.variants?.find((x: { id: string; skuSuffix?: string }) => x.id === rec.variantId);
    return (v as { skuSuffix?: string })?.skuSuffix ?? rec.variantId;
  };
  const byVariant = new Map<string, VariantGroupedOpRow>();
  for (const rec of batch) {
    const vid = rec.variantId ?? '';
    const q = rec.quantity ?? 0;
    const existing = byVariant.get(vid);
    if (existing) {
      existing.quantity += q;
      existing.recordIds.push(rec.id);
    } else {
      byVariant.set(vid, { variantId: vid, label: labelFor(rec), quantity: q, recordIds: [rec.id] });
    }
  }
  return [...byVariant.values()];
}

/**
 * 编辑态按规格合并后的数量落库：按批次顺序将合计写在第一条记录上，同规格其余记录数量为 0。
 */
export function mapGroupedOpQuantitiesToRecordIds(
  batch: ProductionOpRecord[],
  rowEdits: { variantId: string; quantity: number; recordIds: string[] }[],
): Map<string, number> {
  const batchIndex = new Map(batch.map((r, i) => [r.id, i]));
  const newQtyByRecordId = new Map<string, number>();
  for (const row of rowEdits) {
    const sortedIds = [...row.recordIds].sort((a, b) => (batchIndex.get(a) ?? 0) - (batchIndex.get(b) ?? 0));
    const total = Math.max(0, row.quantity);
    sortedIds.forEach((id, idx) => {
      newQtyByRecordId.set(id, idx === 0 ? total : 0);
    });
  }
  return newQtyByRecordId;
}
