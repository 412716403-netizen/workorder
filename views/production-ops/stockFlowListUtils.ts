import type { ProductionOpRecord } from '../../types';
import { isDevMaterialOpReason, isReworkMaterialOpReason } from '../../shared/types';
import { flowRecordsEarliestMs } from '../../utils/flowDocSort';
import { toLocalDateYmdFromProductionTimestamp } from '../../utils/localDateTime';
import type { StockDocDetail } from './types';

export type StockFlowBizType =
  | 'all'
  | 'ISSUE_INTERNAL'
  | 'RETURN_INTERNAL'
  | 'ISSUE_OUTSOURCE'
  | 'RETURN_OUTSOURCE'
  | 'ISSUE_REWORK'
  | 'RETURN_REWORK';

export type StockFlowInitialSeed = {
  orderKeyword?: string;
  orderIds?: string;
  productKeyword?: string;
  sourceProductId?: string;
  dateFrom?: string;
  dateTo?: string;
  /** 限定只展示这些业务类型（如返工物料入口只看返工领料/退料）；类型下拉也只保留这些选项 */
  onlyBizTypes?: Exclude<StockFlowBizType, 'all'>[];
};

export function getStockFlowBizType(r: ProductionOpRecord): Exclude<StockFlowBizType, 'all'> {
  if (isReworkMaterialOpReason(r.reason)) {
    return r.type === 'STOCK_OUT' ? 'ISSUE_REWORK' : 'RETURN_REWORK';
  }
  if (r.type === 'STOCK_OUT') return r.partner ? 'ISSUE_OUTSOURCE' : 'ISSUE_INTERNAL';
  return r.partner ? 'RETURN_OUTSOURCE' : 'RETURN_INTERNAL';
}

export const STOCK_FLOW_BIZ_TYPE_LABEL: Record<Exclude<StockFlowBizType, 'all'>, string> = {
  ISSUE_INTERNAL: '领料发出',
  RETURN_INTERNAL: '生产退料',
  ISSUE_OUTSOURCE: '外协领料发出',
  RETURN_OUTSOURCE: '外协生产退料',
  ISSUE_REWORK: '返工领料',
  RETURN_REWORK: '返工退料',
};

export function getStockFlowTypeLabel(rec: ProductionOpRecord): string {
  return STOCK_FLOW_BIZ_TYPE_LABEL[getStockFlowBizType(rec)];
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
