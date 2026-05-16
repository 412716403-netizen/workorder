import type { PartnerReconBalancedRow, PartnerReconRow, PartnerReconSummary } from './partnerReconLedger';
import type { PartnerProductReconRow } from './partnerReconProductLedger';
import { summarizePartnerProductRowsByProductAndPrice } from './partnerReconProductLedger';
import { fmtDT } from './formatTime';

export type PartnerReconciliationExportViewMode = 'document' | 'product';

export type BuildPartnerReconciliationExportSheetInput = {
  dateFrom: string;
  dateTo: string;
  partnerName: string;
  summary: PartnerReconSummary;
  viewMode: PartnerReconciliationExportViewMode;
  /** 按单据：当前搜索过滤后的行（含余额） */
  documentRows: PartnerReconBalancedRow[];
  /** 按产品：当前搜索过滤后的行 */
  productRows: PartnerProductReconRow[];
};

export type PartnerReconciliationExportCell = string | number;

function partnerReconTimestamp(row: PartnerReconRow): string {
  if (row.source === 'finance') return row.rec.timestamp;
  if (row.source === 'psi') return row.timestamp;
  return row.rec.timestamp;
}

function partnerReconDocNo(row: PartnerReconRow): string {
  if (row.source === 'finance') return row.rec.docNo || row.rec.id;
  if (row.source === 'psi') return row.docNo;
  return row.rec.docNo || row.rec.id;
}

function partnerReconDocTypeLabel(row: PartnerReconRow): string {
  if (row.source === 'finance') {
    const t = row.rec.type;
    if (t === 'RECEIPT') return '收款单';
    if (t === 'PAYMENT') return '付款单';
    return String(t);
  }
  if (row.source === 'psi') return row.docType;
  return '外协收回';
}

function partnerReconPartnerLabel(row: PartnerReconRow): string {
  if (row.source === 'finance') return row.rec.partner || '';
  if (row.source === 'psi') return row.partner || '';
  return row.rec.partner || '';
}

/**
 * 生成合作单位对账 Excel 的二维表（首列为说明或标签，金额多为数字便于求和）。
 * 汇总区与页面「整次查询」一致；明细与按产品尾表为当前搜索结果。
 */
export function buildPartnerReconciliationExportSheet(
  input: BuildPartnerReconciliationExportSheetInput,
): PartnerReconciliationExportCell[][] {
  const { dateFrom, dateTo, partnerName, summary, viewMode, documentRows, productRows } = input;
  const aoa: PartnerReconciliationExportCell[][] = [];

  const fromT = dateFrom.trim();
  const toT = dateTo.trim();
  aoa.push([`对账时间范围：${fromT || '未填'} 至 ${toT || '未填'}`]);
  aoa.push(['合作单位：', partnerName.trim() || '—']);
  aoa.push([]);
  aoa.push(['上期结余（元）', summary.openingBalance]);
  aoa.push(['本期累计增加（元）', summary.periodInc]);
  aoa.push(['本期累计减少（元）', summary.periodDec]);
  aoa.push(['本期应收余额（元）', summary.closingBalance]);
  aoa.push([]);

  if (viewMode === 'document') {
    aoa.push(['明细（按单据，当前搜索结果）']);
    aoa.push(['业务时间', '单据编号', '单据类型', '对账单位', '应收增加（元）', '应收减少（元）', '应收余额（元）']);
    if (documentRows.length === 0) {
      aoa.push(['（当前搜索无明细）', '', '', '', '', '', '']);
    } else {
      for (const { row, receivableInc, receivableDec, balance } of documentRows) {
        aoa.push([
          fmtDT(partnerReconTimestamp(row)),
          partnerReconDocNo(row),
          partnerReconDocTypeLabel(row),
          partnerReconPartnerLabel(row) || '—',
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
    const foot = summarizePartnerProductRowsByProductAndPrice(productRows);
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
