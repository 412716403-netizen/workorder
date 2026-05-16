import type { ProductionOpRecord } from '../types';

type ReportLike = {
  id?: string;
  quantity?: number;
  operator?: string;
  reportNo?: string;
  customData?: Record<string, unknown>;
  variantId?: string | null;
  rate?: number;
  weight?: unknown;
};

export function isOutsourceReceiveReport(report: ReportLike): boolean {
  return (
    report.customData?.source === 'outsourceReceive' ||
    report.operator === '外协收回' ||
    (typeof report.reportNo === 'string' && report.reportNo.startsWith('外协收回·'))
  );
}

/** 从报工记录解析外协收回单号（与报工流水列表展示规则一致）。 */
export function outsourceReceiveDocNoFromReport(report: ReportLike): string | null {
  const rn = report.reportNo || '';
  if (rn.startsWith('外协收回·')) {
    const doc = rn.slice('外协收回·'.length).trim();
    return doc || null;
  }
  const doc = report.customData?.docNo;
  if (typeof doc === 'string' && doc.trim()) return doc.trim();
  return null;
}

function toFiniteNumber(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

export type OutsourceReceiveLineMatch = {
  docNo: string;
  nodeId: string;
  productId: string;
  orderId?: string | null;
  variantId?: string | null;
};

/** 匹配单条外协收回流水（已收回 OUTSOURCE + 同 docNo / 工序 / 维度 / 规格）。 */
export function findOutsourceReceiveOpLine(
  records: ProductionOpRecord[],
  match: OutsourceReceiveLineMatch,
): ProductionOpRecord | undefined {
  const docNo = match.docNo.trim();
  if (!docNo) return undefined;
  const vid = match.variantId ?? '';
  const orderScoped = match.orderId != null && match.orderId !== '';
  return records.find(r => {
    if (r.type !== 'OUTSOURCE' || r.status !== '已收回') return false;
    if ((r.docNo ?? '').trim() !== docNo) return false;
    if ((r.nodeId ?? '') !== match.nodeId) return false;
    if ((r.productId ?? '') !== match.productId) return false;
    if (orderScoped ? r.orderId !== match.orderId : !!r.orderId) return false;
    return (r.variantId ?? '') === vid;
  });
}

export type ReportLineEconomics = {
  rate: number;
  amount: number;
  weight: number | null;
};

/**
 * 外协收回派生的报工行：工价/金额/重量优先取外协收回单（ProductionOpRecord）。
 * 未匹配到时返回 null，由调用方回退工单工价或报工快照。
 */
export function resolveOutsourceReceiveReportEconomics(
  records: ProductionOpRecord[],
  match: OutsourceReceiveLineMatch & { quantity: number },
): ReportLineEconomics | null {
  const op = findOutsourceReceiveOpLine(records, match);
  if (!op) return null;
  const rate = toFiniteNumber(op.unitPrice);
  let amount = toFiniteNumber(op.amount);
  if (amount <= 0 && rate > 0 && match.quantity > 0) amount = rate * match.quantity;
  const w = toFiniteNumber(op.weight);
  const weight = w > 0 ? w : null;
  return { rate, amount, weight };
}

export function resolveReportDisplayEconomics(
  report: ReportLike,
  records: ProductionOpRecord[],
  ctx: {
    nodeId: string;
    productId: string;
    orderId?: string | null;
    fallbackRate?: number;
  },
): { rate: number; amount: number; weight: number | null } {
  const qty = Number(report.quantity) || 0;
  if (isOutsourceReceiveReport(report)) {
    const docNo = outsourceReceiveDocNoFromReport(report);
    if (docNo) {
      const eco = resolveOutsourceReceiveReportEconomics(records, {
        docNo,
        nodeId: ctx.nodeId,
        productId: ctx.productId,
        orderId: ctx.orderId,
        variantId: report.variantId,
        quantity: qty,
      });
      if (eco) return eco;
    }
  }
  const rate = report.rate ?? ctx.fallbackRate ?? 0;
  const amount = qty * rate;
  const w = toFiniteNumber(report.weight);
  return { rate, amount, weight: w > 0 ? w : null };
}
