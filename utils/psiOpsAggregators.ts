/**
 * PSIOpsView 用到的记录聚合 / 数量格式化纯函数 (Phase 3.2 抽离)。
 *
 * - groupRecordsByDocNumber：按 type + docNumber 把流水分组（订单/单据列表展示用）
 * - sumReceivedByOrderLine：按 (sourceOrderNumber, sourceLineId) 汇总采购单已入库数量
 * - formatPsiQtyDisplay：把可能带前导零的字符串数量转成展示数字
 */

interface PsiRecordLike {
  id: string;
  type?: string;
  docNumber?: string | null;
  quantity?: number | string | null;
  sourceOrderNumber?: string | null;
  sourceLineId?: string | null;
}

/**
 * 按 type 筛选 + docNumber 分组。无 docNumber 的记录走 `UNGROUPED-<id>` 自成一组。
 */
export function groupRecordsByDocNumber<R extends PsiRecordLike>(
  records: ReadonlyArray<R>,
  type: string,
): Record<string, R[]> {
  const filtered = records.filter(r => r.type === type);
  const groups: Record<string, R[]> = {};
  filtered.forEach(r => {
    const key = r.docNumber || 'UNGROUPED-' + r.id;
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });
  return groups;
}

/**
 * 按 (sourceOrderNumber, sourceLineId) 汇总采购单 (PURCHASE_BILL) 已入库数量。
 * 缺失 sourceOrderNumber / sourceLineId 的记录会被忽略。
 * Key 形式：`${sourceOrderNumber}::${sourceLineId}`
 */
export function sumReceivedByOrderLine<R extends PsiRecordLike>(
  records: ReadonlyArray<R>,
): Record<string, number> {
  const map: Record<string, number> = {};
  records
    .filter(r => r.type === 'PURCHASE_BILL' && r.sourceOrderNumber && r.sourceLineId)
    .forEach(r => {
      const key = `${r.sourceOrderNumber}::${r.sourceLineId}`;
      map[key] = (map[key] ?? 0) + (Number(r.quantity) || 0);
    });
  return map;
}

/**
 * PSI 列表数量展示：转为数字、去掉前导零。null/空/非有限 → 0。
 * 例：'035' → 35; null → 0; 'abc' → 0
 */
export function formatPsiQtyDisplay(q: number | string | undefined | null): number {
  if (q == null || q === '') return 0;
  const n = Number(q);
  return Number.isFinite(n) ? n : 0;
}
