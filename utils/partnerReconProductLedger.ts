import { PSI_PURCHASE_BILL_LABEL, isPurchaseBillDocType } from '../shared/types';
import type { FinanceRecord, Product, ProductionOpRecord, PsiRecord } from '../types';
import type { PartnerReconRow } from './partnerReconLedger';
import {
  computePartnerReconRowDelta,
  isPartnerReconOutsourceReceiveDocType,
  outsourceReceiveRecordMatchesReconDocType,
} from './partnerReconLedger';

const PSI_LABEL: Record<string, string> = { PURCHASE_BILL: PSI_PURCHASE_BILL_LABEL, SALES_BILL: '销售单' };
const UNKNOWN_PRODUCT_ID = '__unknown__';

/** 按产品明细行：详情仍走 FinanceDetailModal，与对账详情类型一致 */
export type PartnerProductLineDetail = PartnerReconRow | FinanceRecord;

/** 产品列展示元数据：与流水「产品」列（FlowListProductCell）口径一致：名称 + SKU + 缩略图 */
export type ReconProductCellMeta = {
  name: string;
  sku: string | null;
  imageUrl: string | null;
};

/**
 * 按产品视图的一行 = 单据顺序下的「一条产品级明细」（非按产品汇总）。
 * 外协/采购/销售按 PSI/生产行展开；收付款按单据行（与按单据视图一致，不拆行）。
 */
export type PartnerProductReconRow = {
  kind: 'line';
  timestamp: string;
  docNo: string;
  docType: string;
  partner: string;
  productName: string;
  /** 产品行（采购/销售/外协，及关联产品的收付款）有值；纯单据级回退为 null */
  product: ReconProductCellMeta | null;
  /** 采购/销售/外协行有值；收付款或整单回退为 null */
  quantity: number | null;
  unitPrice: number | null;
  receivableInc: number;
  receivableDec: number;
  balance: number;
  detailTarget: PartnerProductLineDetail;
};

function resolveProductId(productId: string | null | undefined): string {
  const id = (productId ?? '').trim();
  return id || UNKNOWN_PRODUCT_ID;
}

function resolveProductName(
  productId: string,
  productMap: Map<string, Product>,
  fallback?: string | null,
): string {
  if (productId === UNKNOWN_PRODUCT_ID) return fallback?.trim() || '—';
  return productMap.get(productId)?.name ?? fallback?.trim() ?? productId;
}

/** 解析产品行的展示元数据（名称/SKU/缩略图），口径与流水「产品」列一致 */
function resolveProductMeta(
  productId: string,
  productMap: Map<string, Product>,
  fallback?: string | null,
): ReconProductCellMeta {
  const p = productId === UNKNOWN_PRODUCT_ID ? undefined : productMap.get(productId);
  return {
    name: resolveProductName(productId, productMap, fallback),
    sku: (p?.sku ?? '').trim() || null,
    imageUrl: (p?.imageUrl ?? '').trim() || null,
  };
}

function lineAmount(r: PsiRecord): number {
  const direct = Number(r.amount);
  if (Number.isFinite(direct) && direct !== 0) return direct;
  const qty = Number(r.quantity) || 0;
  const price = Number(r.purchasePrice ?? r.salesPrice) || 0;
  return qty * price;
}

function parsePositiveQty(raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || Math.abs(n) < 1e-12) return null;
  return n;
}

/** 展示用数量与单价（与 lineAmount 口径一致：有单价字段优先，否则用金额÷数量） */
function psiLineQtyPrice(r: PsiRecord): { quantity: number | null; unitPrice: number | null } {
  const qty = parsePositiveQty(r.quantity ?? undefined);
  if (r.type === 'PURCHASE_BILL') {
    const p = r.purchasePrice;
    if (p !== null && p !== undefined && p !== '') {
      const n = Number(p);
      if (Number.isFinite(n)) return { quantity: qty, unitPrice: n };
    }
  } else if (r.type === 'SALES_BILL') {
    const s = r.salesPrice;
    if (s !== null && s !== undefined && s !== '') {
      const n = Number(s);
      if (Number.isFinite(n)) return { quantity: qty, unitPrice: n };
    }
  }
  const amt = lineAmount(r);
  if (qty !== null) return { quantity: qty, unitPrice: amt / qty };
  return { quantity: null, unitPrice: null };
}

function outsourceLineQtyPrice(rec: ProductionOpRecord): { quantity: number | null; unitPrice: number | null } {
  const qty = parsePositiveQty(rec.quantity);
  const upRaw = rec.unitPrice;
  if (upRaw !== undefined && upRaw !== null) {
    const n = Number(upRaw);
    if (Number.isFinite(n)) return { quantity: qty, unitPrice: n };
  }
  const amt = Number(rec.amount) || 0;
  if (qty !== null && Math.abs(qty) > 1e-12) return { quantity: qty, unitPrice: amt / qty };
  return { quantity: qty, unitPrice: null };
}

/** PSI 行级应收增减（与单据口径一致） */
export function lineDeltaFromPsi(r: PsiRecord): { inc: number; dec: number } {
  const amount = lineAmount(r);
  if (r.type === 'PURCHASE_BILL') {
    if (amount >= 0) return { inc: 0, dec: Math.abs(amount) };
    return { inc: Math.abs(amount), dec: 0 };
  }
  if (r.type === 'SALES_BILL') {
    if (amount >= 0) return { inc: amount, dec: 0 };
    return { inc: 0, dec: Math.abs(amount) };
  }
  return { inc: 0, dec: 0 };
}

export function lineDeltaFromOutsource(r: ProductionOpRecord): { inc: number; dec: number } {
  return { inc: 0, dec: Math.abs(Number(r.amount) || 0) };
}

export function lineDeltaFromFinance(r: FinanceRecord): { inc: number; dec: number } {
  if (r.type === 'RECEIPT') return { inc: 0, dec: Math.abs(r.amount) };
  if (r.type === 'PAYMENT') return { inc: Math.abs(r.amount), dec: 0 };
  return { inc: 0, dec: 0 };
}

function lineDocTypeLabel(r: PsiRecord): string {
  if (r.type === 'SALES_BILL' && lineAmount(r) < 0) return '销售退货';
  return PSI_LABEL[r.type] || r.type;
}

function sortPsiLines(lines: PsiRecord[]): PsiRecord[] {
  return [...lines].sort((a, b) => {
    const ta = Date.parse(String(a.createdAt ?? a.timestamp ?? '')) || 0;
    const tb = Date.parse(String(b.createdAt ?? b.timestamp ?? '')) || 0;
    if (ta !== tb) return ta - tb;
    return (a.id || '').localeCompare(b.id || '');
  });
}

export type BuildPartnerProductLineReconInput = {
  /** 与「按单据」对账相同的行序（已排序） */
  documentRows: PartnerReconRow[];
  psiRecords: PsiRecord[];
  prodRecords: ProductionOpRecord[];
  productMap: Map<string, Product>;
  partnerName: string;
  partnerId: string;
  partnerOpeningBalance: number;
};

/**
 * 在「按单据」顺序下展开为产品级明细行（采购/销售/外协按行；收付款保持单据级一行）。
 */
export function buildPartnerProductLineReconList(input: BuildPartnerProductLineReconInput): PartnerProductReconRow[] {
  const { documentRows, psiRecords, prodRecords, productMap, partnerName, partnerId, partnerOpeningBalance } = input;
  const out: PartnerProductReconRow[] = [];
  let running = partnerOpeningBalance;

  const psiPartner = (r: PsiRecord) => r.partner === partnerName || r.partnerId === partnerId;
  const prodPartner = (r: ProductionOpRecord) => r.partner === partnerName;

  for (const docRow of documentRows) {
    if (docRow.source === 'finance') {
      const { inc, dec } = computePartnerReconRowDelta(docRow);
      running += inc - dec;
      const rec = docRow.rec;
      const meta = rec.productId ? resolveProductMeta(rec.productId, productMap) : null;
      const pName = meta?.name ?? '—';
      out.push({
        kind: 'line',
        timestamp: rec.timestamp,
        docNo: rec.docNo || rec.id,
        docType: rec.type === 'RECEIPT' ? '收款单' : '付款单',
        partner: rec.partner || partnerName,
        productName: pName,
        product: meta,
        quantity: null,
        unitPrice: null,
        receivableInc: inc,
        receivableDec: dec,
        balance: running,
        detailTarget: rec,
      });
      continue;
    }

    if (docRow.source !== 'psi') continue;

    if (isPartnerReconOutsourceReceiveDocType(docRow.docType)) {
      const lines = prodRecords
        .filter(r => prodPartner(r) && outsourceReceiveRecordMatchesReconDocType(r, docRow.docType))
        .filter(r => (r.docNo || r.id) === docRow.docNo)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      if (lines.length === 0) {
        const { inc, dec } = computePartnerReconRowDelta(docRow);
        running += inc - dec;
        out.push({
          kind: 'line',
          timestamp: docRow.timestamp,
          docNo: docRow.docNo,
          docType: docRow.docType,
          partner: docRow.partner || partnerName,
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
        for (const rec of lines) {
          const { inc, dec } = lineDeltaFromOutsource(rec);
          running += inc - dec;
          const { quantity, unitPrice } = outsourceLineQtyPrice(rec);
          out.push({
            kind: 'line',
            timestamp: rec.timestamp,
            docNo: docRow.docNo,
            docType: docRow.docType,
            partner: docRow.partner || partnerName,
            productName: resolveProductName(rec.productId, productMap),
            product: resolveProductMeta(rec.productId, productMap),
            quantity,
            unitPrice,
            receivableInc: inc,
            receivableDec: dec,
            balance: running,
            detailTarget: { source: 'prod', rec },
          });
        }
      }
      continue;
    }

    const billType = isPurchaseBillDocType(docRow.docType) ? 'PURCHASE_BILL' : 'SALES_BILL';
    const lines = sortPsiLines(
      psiRecords.filter(
        r =>
          r.type === billType &&
          psiPartner(r) &&
          (r.docNumber || r.docNo || r.id) === docRow.docNo,
      ),
    );

    const parentPsiTarget: PartnerReconRow = docRow;

    if (lines.length === 0) {
      const { inc, dec } = computePartnerReconRowDelta(docRow);
      running += inc - dec;
      out.push({
        kind: 'line',
        timestamp: docRow.timestamp,
        docNo: docRow.docNo,
        docType: docRow.docType,
        partner: docRow.partner || partnerName,
        productName: '—',
        product: null,
        quantity: null,
        unitPrice: null,
        receivableInc: inc,
        receivableDec: dec,
        balance: running,
        detailTarget: parentPsiTarget,
      });
    } else {
      for (const r of lines) {
        const { inc, dec } = lineDeltaFromPsi(r);
        running += inc - dec;
        const ts = r.timestamp || (r.createdAt ? String(r.createdAt) : '') || docRow.timestamp;
        const { quantity, unitPrice } = psiLineQtyPrice(r);
        out.push({
          kind: 'line',
          timestamp: ts,
          docNo: docRow.docNo,
          docType: lineDocTypeLabel(r),
          partner: docRow.partner || partnerName,
          productName: resolveProductName(resolveProductId(r.productId), productMap, r.productName),
          product: resolveProductMeta(resolveProductId(r.productId), productMap, r.productName),
          quantity,
          unitPrice,
          receivableInc: inc,
          receivableDec: dec,
          balance: running,
          detailTarget: parentPsiTarget,
        });
      }
    }
  }

  return out;
}

/** Excel 按产品模式末尾：按「产品 + 单价」汇总（同产品不同单价多行） */
export type PartnerProductExportSummaryRow = {
  productName: string;
  unitPrice: number | null;
  /** 明细中均无数量时为 null */
  quantity: number | null;
  /** 各行应收增加与减少之和（单行通常仅一侧非零） */
  amount: number;
};

function unitPriceGroupKey(unitPrice: number | null): string {
  if (unitPrice == null || !Number.isFinite(unitPrice)) return '__NA__';
  return unitPrice.toFixed(6);
}

export function summarizePartnerProductRowsByProductAndPrice(
  rows: PartnerProductReconRow[],
): PartnerProductExportSummaryRow[] {
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

  const out: PartnerProductExportSummaryRow[] = [...map.values()].map(a => ({
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

export function filterPartnerProductReconList(rows: PartnerProductReconRow[], query: string): PartnerProductReconRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(row => {
    const parts = [
      row.docNo,
      row.docType,
      row.partner,
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
