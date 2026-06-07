import type { FinanceRecord, Product, ProductionOpRecord } from '../types';
import type { ReconProductCellMeta } from './partnerReconProductLedger';
import {
  computeSettlementReconRowDelta,
  type SettlementReconRow,
  type SettlementWorkReportItem,
} from './settlementReconLedger';

export type { ReconProductCellMeta };

/** 按产品明细行：详情仍走 FinanceDetailModal */
export type SettlementProductLineDetail = SettlementReconRow | FinanceRecord;

/**
 * 按产品视图的一行 = 单据顺序下的「一条产品级明细」。
 * 报工单按 items 展开；返工/收付款保持单据级一行。
 */
export type SettlementProductReconRow = {
  kind: 'line';
  timestamp: string;
  docNo: string;
  docType: string;
  workerName: string;
  productName: string;
  product: ReconProductCellMeta | null;
  quantity: number | null;
  unitPrice: number | null;
  receivableInc: number;
  receivableDec: number;
  balance: number;
  detailTarget: SettlementProductLineDetail;
};

function resolveProductMeta(
  productId: string | undefined,
  productMap: Map<string, Product>,
  fallbackName?: string,
): ReconProductCellMeta {
  const p = productId ? productMap.get(productId) : undefined;
  return {
    name: p?.name ?? fallbackName?.trim() ?? '—',
    sku: (p?.sku ?? '').trim() || null,
    imageUrl: (p?.imageUrl ?? '').trim() || null,
  };
}

function lineDeltaFromWorkItem(item: SettlementWorkReportItem): { inc: number; dec: number } {
  return { inc: 0, dec: Math.abs(item.amount) };
}

function lineDeltaFromRework(rec: ProductionOpRecord): { inc: number; dec: number } {
  return { inc: 0, dec: Math.abs(Number(rec.amount) || 0) };
}

function lineDeltaFromFinance(rec: FinanceRecord): { inc: number; dec: number } {
  if (rec.type === 'RECEIPT') return { inc: 0, dec: Math.abs(rec.amount) };
  if (rec.type === 'PAYMENT') return { inc: Math.abs(rec.amount), dec: 0 };
  return { inc: 0, dec: 0 };
}

export type BuildSettlementProductLineReconInput = {
  documentRows: SettlementReconRow[];
  productMap: Map<string, Product>;
  workerName: string;
  openingBalance: number;
};

export function buildSettlementProductLineReconList(
  input: BuildSettlementProductLineReconInput,
): SettlementProductReconRow[] {
  const { documentRows, productMap, workerName, openingBalance } = input;
  const out: SettlementProductReconRow[] = [];
  let running = openingBalance;

  for (const docRow of documentRows) {
    if (docRow.source === 'work_report') {
      if (docRow.items.length === 0) {
        const { inc, dec } = computeSettlementReconRowDelta(docRow);
        running += inc - dec;
        out.push({
          kind: 'line',
          timestamp: docRow.timestamp,
          docNo: docRow.reportNo,
          docType: '报工单',
          workerName: docRow.workerName || workerName,
          productName: '—',
          product: null,
          quantity: null,
          unitPrice: null,
          receivableInc: inc,
          receivableDec: dec,
          balance: running,
          detailTarget: docRow,
        });
      } else {
        for (const item of docRow.items) {
          const { inc, dec } = lineDeltaFromWorkItem(item);
          running += inc - dec;
          const meta = resolveProductMeta(item.productId, productMap, item.productName);
          out.push({
            kind: 'line',
            timestamp: docRow.timestamp,
            docNo: docRow.reportNo,
            docType: item.milestoneName ? `报工单 · ${item.milestoneName}` : '报工单',
            workerName: docRow.workerName || workerName,
            productName: meta.name,
            product: meta,
            quantity: item.quantity,
            unitPrice: item.rate,
            receivableInc: inc,
            receivableDec: dec,
            balance: running,
            detailTarget: docRow,
          });
        }
      }
      continue;
    }

    if (docRow.source === 'rework_report') {
      const rec = docRow.rec;
      const { inc, dec } = lineDeltaFromRework(rec);
      running += inc - dec;
      const meta = rec.productId ? resolveProductMeta(rec.productId, productMap) : null;
      out.push({
        kind: 'line',
        timestamp: rec.timestamp,
        docNo: rec.docNo || rec.id,
        docType: '返工报工',
        workerName: workerName,
        productName: meta?.name ?? '—',
        product: meta,
        quantity: rec.quantity != null ? Number(rec.quantity) : null,
        unitPrice: rec.unitPrice != null ? Number(rec.unitPrice) : null,
        receivableInc: inc,
        receivableDec: dec,
        balance: running,
        detailTarget: docRow,
      });
      continue;
    }

    const rec = docRow.rec;
    const { inc, dec } = lineDeltaFromFinance(rec);
    running += inc - dec;
    const meta = rec.productId ? resolveProductMeta(rec.productId, productMap) : null;
    out.push({
      kind: 'line',
      timestamp: rec.timestamp,
      docNo: rec.docNo || rec.id,
      docType: rec.type === 'RECEIPT' ? '收款单' : '付款单',
      workerName: workerName,
      productName: meta?.name ?? '—',
      product: meta,
      quantity: null,
      unitPrice: null,
      receivableInc: inc,
      receivableDec: dec,
      balance: running,
      detailTarget: rec,
    });
  }

  return out;
}

export function filterSettlementProductReconList(
  rows: SettlementProductReconRow[],
  query: string,
): SettlementProductReconRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(row => {
    const parts = [
      row.docNo,
      row.docType,
      row.workerName,
      row.productName,
      row.quantity != null ? String(row.quantity) : '',
      row.unitPrice != null ? String(row.unitPrice) : '',
      String(row.receivableInc),
      String(row.receivableDec),
      String(row.balance),
    ];
    return parts.filter(Boolean).join('\0').toLowerCase().includes(q);
  });
}

/** Excel 按产品模式末尾：按「产品 + 单价」汇总 */
export type SettlementProductExportSummaryRow = {
  productName: string;
  unitPrice: number | null;
  quantity: number | null;
  amount: number;
};

function unitPriceGroupKey(unitPrice: number | null): string {
  if (unitPrice == null || !Number.isFinite(unitPrice)) return '__NA__';
  return unitPrice.toFixed(6);
}

export function summarizeSettlementProductRowsByProductAndPrice(
  rows: SettlementProductReconRow[],
): SettlementProductExportSummaryRow[] {
  type Agg = {
    productName: string;
    unitPrice: number | null;
    qtySum: number;
    qtyHasAny: boolean;
    amount: number;
  };
  const map = new Map<string, Agg>();

  for (const r of rows) {
    const key = `${r.productName}\0${unitPriceGroupKey(r.unitPrice)}`;
    let a = map.get(key);
    if (!a) {
      a = { productName: r.productName, unitPrice: r.unitPrice, qtySum: 0, qtyHasAny: false, amount: 0 };
      map.set(key, a);
    }
    a.amount += r.receivableInc + r.receivableDec;
    if (r.quantity != null && Number.isFinite(r.quantity)) {
      a.qtySum += r.quantity;
      a.qtyHasAny = true;
    }
  }

  const out: SettlementProductExportSummaryRow[] = [...map.values()].map(a => ({
    productName: a.productName,
    unitPrice: a.unitPrice,
    quantity: a.qtyHasAny ? a.qtySum : null,
    amount: a.amount,
  }));

  out.sort((x, y) => {
    const c = x.productName.localeCompare(y.productName, 'zh-CN');
    if (c !== 0) return c;
    const px = x.unitPrice ?? Number.NEGATIVE_INFINITY;
    const py = y.unitPrice ?? Number.NEGATIVE_INFINITY;
    if (!Number.isFinite(px) && !Number.isFinite(py)) return 0;
    if (!Number.isFinite(px)) return 1;
    if (!Number.isFinite(py)) return -1;
    return px - py;
  });

  return out;
}

/** 转为合作单位按产品表可复用的行（partner 字段填 workerName） */
export function toPartnerStyleProductRows(rows: SettlementProductReconRow[]) {
  return rows.map(r => ({
    kind: 'line' as const,
    timestamp: r.timestamp,
    docNo: r.docNo,
    docType: r.docType,
    partner: r.workerName,
    productName: r.productName,
    product: r.product,
    quantity: r.quantity,
    unitPrice: r.unitPrice,
    receivableInc: r.receivableInc,
    receivableDec: r.receivableDec,
    balance: r.balance,
    detailTarget: r.detailTarget,
  }));
}
