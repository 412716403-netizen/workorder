/** 为列表/扫码结果补全「批次内件号」（按 batchId + serialNo 排序，从 1 起） */
export function attachBatchPieceNos<
  T extends { batchId: string | null; serialNo: number; batchPieceNo?: number | null },
>(items: T[]): T[] {
  const byBatch = new Map<string, T[]>();
  for (const row of items) {
    if (!row.batchId) continue;
    const list = byBatch.get(row.batchId) ?? [];
    list.push(row);
    byBatch.set(row.batchId, list);
  }
  for (const list of byBatch.values()) {
    list.sort((a, b) => a.serialNo - b.serialNo);
    list.forEach((row, idx) => {
      if (row.batchPieceNo == null || row.batchPieceNo <= 0) {
        row.batchPieceNo = idx + 1;
      }
    });
  }
  return items;
}
