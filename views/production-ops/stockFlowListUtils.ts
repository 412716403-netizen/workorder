import type { ProductionOpRecord } from '../../types';
import { isDevMaterialOpReason } from '../../shared/types';
import { flowRecordsEarliestMs } from '../../utils/flowDocSort';
import { toLocalDateYmdFromProductionTimestamp } from '../../utils/localDateTime';
import type { StockDocDetail } from './types';

export type StockFlowBizType =
  | 'all'
  | 'ISSUE_INTERNAL'
  | 'RETURN_INTERNAL'
  | 'ISSUE_OUTSOURCE'
  | 'RETURN_OUTSOURCE';

export type StockFlowInitialSeed = {
  orderKeyword?: string;
  orderIds?: string;
  productKeyword?: string;
  sourceProductId?: string;
  dateFrom?: string;
  dateTo?: string;
};

export function getStockFlowBizType(r: ProductionOpRecord): Exclude<StockFlowBizType, 'all'> {
  if (r.type === 'STOCK_OUT') return r.partner ? 'ISSUE_OUTSOURCE' : 'ISSUE_INTERNAL';
  return r.partner ? 'RETURN_OUTSOURCE' : 'RETURN_INTERNAL';
}

export function getStockFlowTypeLabel(rec: ProductionOpRecord): string {
  const isReturn = rec.type === 'STOCK_RETURN';
  const isOutsourceDispatch = rec.type === 'STOCK_OUT' && !!rec.partner;
  const isOutsourceReturn = rec.type === 'STOCK_RETURN' && !!rec.partner;
  if (isOutsourceReturn) return '外协生产退料';
  if (isReturn) return '生产退料';
  if (isOutsourceDispatch) return '外协领料发出';
  return '领料发出';
}

/** 生产物料「领料退料流水」：排除开发领退（仍进仓库流水） */
export function isProductionMaterialFlowRecord(r: ProductionOpRecord): boolean {
  return (r.type === 'STOCK_OUT' || r.type === 'STOCK_RETURN') && !isDevMaterialOpReason(r.reason);
}

/** 按单据号聚合：整张单按组内最早时间倒序，单内明细按 id 稳定序 */
export function sortStockFlowRecordsByDoc(records: ProductionOpRecord[]): ProductionOpRecord[] {
  const list = records.filter(isProductionMaterialFlowRecord);
  const byDoc = new Map<string, ProductionOpRecord[]>();
  for (const r of list) {
    const k = r.docNo && String(r.docNo).trim() ? String(r.docNo) : r.id;
    if (!byDoc.has(k)) byDoc.set(k, []);
    byDoc.get(k)!.push(r);
  }
  const entries = [...byDoc.entries()].sort(([ka, ra], [kb, rb]) => {
    const da = flowRecordsEarliestMs(ra);
    const db = flowRecordsEarliestMs(rb);
    if (db !== da) return db - da;
    return ka.localeCompare(kb);
  });
  return entries.flatMap(([, rs]) => [...rs].sort((a, b) => (a.id || '').localeCompare(b.id || '')));
}

export function buildStockDocDetailFromRecords(
  docNo: string,
  records: ProductionOpRecord[],
): StockDocDetail | null {
  const docRecords = records.filter(r => r.docNo === docNo);
  if (docRecords.length === 0) return null;
  const first = docRecords[0];
  return {
    docNo,
    type: first.type as 'STOCK_OUT' | 'STOCK_RETURN',
    orderId: first.orderId ?? '',
    sourceProductId: first.sourceProductId,
    timestamp: first.timestamp,
    warehouseId: first.warehouseId ?? '',
    lines: docRecords.map(r => ({
      productId: r.productId,
      quantity: r.quantity,
      ...(r.batchNo ? { batchNo: r.batchNo } : {}),
    })),
    reason: first.reason,
    operator: first.operator ?? '',
    partner: first.partner,
  };
}

/** 从领退料记录推算日期筛选范围（与报工明细流水 seed 逻辑一致） */
export function stockFlowDateRangeFromRecords(
  records: ProductionOpRecord[],
  fallbackYmd: string,
): { dateFrom: string; dateTo: string } {
  const ymds = records
    .map(r => (r.timestamp ? toLocalDateYmdFromProductionTimestamp(r.timestamp) : ''))
    .filter(Boolean);
  if (ymds.length === 0) {
    return { dateFrom: fallbackYmd, dateTo: fallbackYmd };
  }
  return {
    dateFrom: ymds.reduce((a, b) => (a < b ? a : b)),
    dateTo: ymds.reduce((a, b) => (a > b ? a : b)),
  };
}
