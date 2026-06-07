import type { SettlementReconBalancedRow, SettlementReconSummary } from './settlementReconLedger';
import type { SettlementProductReconRow } from './settlementReconProductLedger';
import { summarizeSettlementProductRowsByProductAndPrice } from './settlementReconProductLedger';
import { fmtDT } from './formatTime';
import type { SettlementReconRow } from './settlementReconLedger';

export type SettlementReconciliationExportViewMode = 'document' | 'product';

export type BuildSettlementReconciliationExportSheetInput = {
  dateFrom: string;
  dateTo: string;
  workerName: string;
  summary: SettlementReconSummary;
  viewMode: SettlementReconciliationExportViewMode;
  documentRows: SettlementReconBalancedRow[];
  productRows: SettlementProductReconRow[];
};

export type SettlementReconciliationExportCell = string | number;

function settlementReconTimestamp(row: SettlementReconRow): string {
  if (row.source === 'settlement_finance') return row.rec.timestamp;
  if (row.source === 'rework_report') return row.rec.timestamp;
  return row.timestamp;
}

function settlementReconDocNo(row: SettlementReconRow): string {
  if (row.source === 'settlement_finance') return row.rec.docNo || row.rec.id;
  if (row.source === 'rework_report') return row.rec.docNo || row.rec.id;
  return row.reportNo;
}

function settlementReconDocTypeLabel(row: SettlementReconRow): string {
  if (row.source === 'settlement_finance') {
    const t = row.rec.type;
    if (t === 'RECEIPT') return '收款单';
    if (t === 'PAYMENT') return '付款单';
    return String(t);
  }
  if (row.source === 'rework_report') return '返工报工';
  return '报工单';
}

function settlementReconWorkerLabel(row: SettlementReconRow): string {
  if (row.source === 'work_report') return row.workerName || '';
  if (row.source === 'rework_report') return row.rec.workerId || '';
  return row.rec.workerId || '';
}

export function buildSettlementReconciliationExportSheet(
  input: BuildSettlementReconciliationExportSheetInput,
): SettlementReconciliationExportCell[][] {
  const { dateFrom, dateTo, workerName, summary, viewMode, documentRows, productRows } = input;
  const aoa: SettlementReconciliationExportCell[][] = [];

  const fromT = dateFrom.trim();
  const toT = dateTo.trim();
  aoa.push([`对账时间范围：${fromT || '未填'} 至 ${toT || '未填'}`]);
  aoa.push(['工人：', workerName.trim() || '—']);
  aoa.push([]);
  aoa.push(['上期结余（元）', summary.openingBalance]);
  aoa.push(['本期累计增加（元）', summary.periodInc]);
  aoa.push(['本期累计减少（元）', summary.periodDec]);
  aoa.push(['本期应收余额（元）', summary.closingBalance]);
  aoa.push([]);

  if (viewMode === 'document') {
    aoa.push(['明细（按单据，当前搜索结果）']);
    aoa.push(['业务时间', '单据编号', '单据类型', '工人', '应收增加（元）', '应收减少（元）', '应收余额（元）']);
    if (documentRows.length === 0) {
      aoa.push(['（当前搜索无明细）', '', '', '', '', '', '']);
    } else {
      for (const { row, receivableInc, receivableDec, balance } of documentRows) {
        aoa.push([
          fmtDT(settlementReconTimestamp(row)),
          settlementReconDocNo(row),
          settlementReconDocTypeLabel(row),
          settlementReconWorkerLabel(row) || workerName || '—',
          receivableInc,
          receivableDec,
          balance,
        ]);
      }
    }
  } else {
    aoa.push(['明细（按产品，当前搜索结果）']);
    aoa.push([
      '时间',
      '单据类型',
      '单据编号',
      '产品',
      '数量',
      '单价（元）',
      '应收增加（元）',
      '应收减少（元）',
      '应收余额（元）',
    ]);
    if (productRows.length === 0) {
      aoa.push(['（当前搜索无明细）', '', '', '', '', '', '', '', '']);
    } else {
      for (const r of productRows) {
        aoa.push([
          fmtDT(r.timestamp),
          r.docType,
          r.docNo,
          r.productName,
          r.quantity != null && Number.isFinite(r.quantity) ? r.quantity : '',
          r.unitPrice != null && Number.isFinite(r.unitPrice) ? r.unitPrice : '',
          r.receivableInc,
          r.receivableDec,
          r.balance,
        ]);
      }
    }
    aoa.push([]);
    aoa.push(['产品汇总（按单价，基于上方筛选后明细）']);
    aoa.push(['产品', '数量', '单价（元）', '金额（元）']);
    const foot = summarizeSettlementProductRowsByProductAndPrice(productRows);
    for (const s of foot) {
      aoa.push([
        s.productName,
        s.quantity != null && Number.isFinite(s.quantity) ? s.quantity : '',
        s.unitPrice != null && Number.isFinite(s.unitPrice) ? s.unitPrice : '',
        s.amount,
      ]);
    }
  }

  return aoa;
}
