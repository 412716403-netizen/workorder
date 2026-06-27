/**
 * 为列表/扫码结果补全「批次内件号」（按 batchId + serialNo 排序，从 1 起）。
 *
 * `baseOffsetByBatch` 用于分页场景：当 items 只是某批次的一页切片时，传入该批次
 * 在本页之前已有的件数作为基数，避免每页都从 1 重新编号（否则第 2 页会与第 1 页重号）。
 */
export function attachBatchPieceNos<
  T extends { batchId: string | null; serialNo: number; batchPieceNo?: number | null },
>(items: T[], baseOffsetByBatch?: Map<string, number>): T[] {
  const byBatch = new Map<string, T[]>();
  for (const row of items) {
    if (!row.batchId) continue;
    const list = byBatch.get(row.batchId) ?? [];
    list.push(row);
    byBatch.set(row.batchId, list);
  }
  for (const [batchId, list] of byBatch.entries()) {
    const base = baseOffsetByBatch?.get(batchId) ?? 0;
    list.sort((a, b) => a.serialNo - b.serialNo);
    list.forEach((row, idx) => {
      if (row.batchPieceNo == null || row.batchPieceNo <= 0) {
        row.batchPieceNo = base + idx + 1;
      }
    });
  }
  return items;
}
