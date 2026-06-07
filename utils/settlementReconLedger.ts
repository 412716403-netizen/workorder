import type {
  AppDictionaries,
  FinanceRecord,
  GlobalNodeTemplate,
  Product,
  ProductMilestoneProgress,
  ProductionOpRecord,
  ProductionOrder,
  Worker,
} from '../types';
import { toLocalDateYmd } from './localDateTime';

/** 报工结算对账：报工单明细行 */
export type SettlementWorkReportItem = {
  orderNumber: string;
  productId?: string;
  productName: string;
  milestoneName: string;
  quantity: number;
  rate: number;
  amount: number;
};

/** 报工结算对账：统一展示行（报工单、返工报工、收款单、付款单） */
export type SettlementReconRow =
  | {
      source: 'work_report';
      reportNo: string;
      timestamp: string;
      workerId: string;
      workerName: string;
      amount: number;
      items: SettlementWorkReportItem[];
    }
  | { source: 'rework_report'; rec: ProductionOpRecord }
  | { source: 'settlement_finance'; rec: FinanceRecord };

export type SettlementReconBalancedRow = {
  row: SettlementReconRow;
  receivableInc: number;
  receivableDec: number;
  balance: number;
};

export type SettlementReconSummary = {
  openingBalance: number;
  periodInc: number;
  periodDec: number;
  closingBalance: number;
};

function reportToWorkerId(r: { workerId?: string; customData?: Record<string, unknown> }): string {
  return (r.workerId ?? (r.customData?.workerId as string | undefined) ?? '') as string;
}

function variantDisplay(
  product: Product | undefined,
  variantId: string | undefined,
  dictionaries: AppDictionaries | undefined,
): string {
  if (!variantId || !product?.variants?.length) return '';
  const v = product.variants.find(x => x.id === variantId);
  if (!v) return variantId;
  const color = dictionaries?.colors?.find(c => c.id === v.colorId)?.name;
  const size = dictionaries?.sizes?.find(s => s.id === v.sizeId)?.name;
  return [color, size].filter(Boolean).join(' / ') || v.skuSuffix || variantId;
}

function inDateRange(
  dateStr: string,
  from: string,
  to: string,
  beforeExclusive?: string,
): boolean {
  if (beforeExclusive && dateStr >= beforeExclusive) return false;
  if (from && dateStr < from) return false;
  if (to && dateStr > to) return false;
  return true;
}

export type BuildSettlementReconListInput = {
  workerId: string;
  workerName: string;
  dateFrom?: string;
  dateTo?: string;
  /** 仅统计严格早于该本地日期（YYYY-MM-DD）的记录，用于上期余额 */
  dateBeforeExclusive?: string;
  orders: ProductionOrder[];
  productMilestoneProgresses: ProductMilestoneProgress[];
  productMap: Map<string, Product>;
  workerProdRecords: ProductionOpRecord[];
  workerFinanceRecords: FinanceRecord[];
  globalNodes: GlobalNodeTemplate[];
  dictionaries?: AppDictionaries;
};

/** 与财务对账列表应收增减规则一致 */
export function computeSettlementReconRowDelta(row: SettlementReconRow): { inc: number; dec: number } {
  if (row.source === 'work_report') return { inc: 0, dec: row.amount };
  if (row.source === 'rework_report') return { inc: 0, dec: Math.abs(Number(row.rec.amount) || 0) };
  if (row.source === 'settlement_finance') {
    if (row.rec.type === 'RECEIPT') return { inc: 0, dec: row.rec.amount };
    if (row.rec.type === 'PAYMENT') return { inc: row.rec.amount, dec: 0 };
  }
  return { inc: 0, dec: 0 };
}

export function buildSettlementReconBalances(
  rows: SettlementReconRow[],
  openingBalance = 0,
): SettlementReconBalancedRow[] {
  let running = openingBalance;
  return rows.map(row => {
    const { inc, dec } = computeSettlementReconRowDelta(row);
    running += inc - dec;
    return { row, receivableInc: inc, receivableDec: dec, balance: running };
  });
}

export function summarizeSettlementReconBalances(
  rows: SettlementReconRow[],
  openingBalance = 0,
): SettlementReconSummary {
  let periodInc = 0;
  let periodDec = 0;
  for (const row of rows) {
    const { inc, dec } = computeSettlementReconRowDelta(row);
    periodInc += inc;
    periodDec += dec;
  }
  return {
    openingBalance,
    periodInc,
    periodDec,
    closingBalance: openingBalance + periodInc - periodDec,
  };
}

export function buildSettlementReconList(input: BuildSettlementReconListInput): SettlementReconRow[] {
  const {
    workerId,
    workerName,
    dateFrom = '',
    dateTo = '',
    dateBeforeExclusive,
    orders,
    productMilestoneProgresses,
    productMap,
    workerProdRecords,
    workerFinanceRecords,
    globalNodes,
    dictionaries,
  } = input;

  const rows: SettlementReconRow[] = [];
  const workReportGroups = new Map<
    string,
    {
      timestamp: string;
      workerId: string;
      workerName: string;
      amount: number;
      items: SettlementWorkReportItem[];
    }
  >();

  orders.forEach(order => {
    const nodeRates = productMap.get(order.productId)?.nodeRates;
    order.milestones?.forEach(milestone => {
      const rate = nodeRates?.[milestone.templateId] ?? 0;
      (milestone.reports || []).forEach(
        (r: {
          workerId?: string;
          customData?: Record<string, unknown>;
          timestamp?: string;
          quantity?: number;
          rate?: number;
          reportNo?: string;
          reportBatchId?: string;
          id: string;
        }) => {
          const wid = reportToWorkerId(r);
          if (wid !== workerId) return;
          const dateStr = r.timestamp ? toLocalDateYmd(r.timestamp) : '';
          if (!inDateRange(dateStr, dateFrom, dateTo, dateBeforeExclusive)) return;
          const qty = Number(r.quantity) || 0;
          const unitRate = r.rate != null ? Number(r.rate) : rate;
          const amt = qty * unitRate;
          const key = r.reportNo || r.reportBatchId || r.id;
          const existing = workReportGroups.get(key);
          const item: SettlementWorkReportItem = {
            orderNumber: order.orderNumber,
            productId: order.productId,
            productName: order.productName ?? '',
            milestoneName: milestone.name ?? '',
            quantity: qty,
            rate: unitRate,
            amount: amt,
          };
          if (!existing) {
            workReportGroups.set(key, {
              timestamp: r.timestamp || '',
              workerId: wid,
              workerName,
              amount: amt,
              items: [item],
            });
          } else {
            existing.amount += amt;
            existing.items.push(item);
          }
        },
      );
    });
  });

  productMilestoneProgresses.forEach(pmp => {
    const prod = productMap.get(pmp.productId);
    const nodeRates = prod?.nodeRates;
    const milestoneName = globalNodes.find(n => n.id === pmp.milestoneTemplateId)?.name ?? '';
    const defaultRate = nodeRates?.[pmp.milestoneTemplateId] ?? 0;
    const baseProductName = prod?.name ?? '';
    (pmp.reports || []).forEach(
      (r: {
        workerId?: string;
        customData?: Record<string, unknown>;
        timestamp?: string;
        quantity?: number;
        rate?: number;
        reportNo?: string;
        reportBatchId?: string;
        id: string;
        variantId?: string;
      }) => {
        const wid = reportToWorkerId(r);
        if (wid !== workerId) return;
        const dateStr = r.timestamp ? toLocalDateYmd(r.timestamp) : '';
        if (!inDateRange(dateStr, dateFrom, dateTo, dateBeforeExclusive)) return;
        const qty = Number(r.quantity) || 0;
        const unitRate = r.rate != null ? Number(r.rate) : defaultRate;
        const amt = qty * unitRate;
        const key = r.reportNo || r.reportBatchId || r.id;
        const existing = workReportGroups.get(key);
        const vid = (r.variantId ?? pmp.variantId) as string | undefined;
        const vLabel = variantDisplay(prod, vid, dictionaries);
        const item: SettlementWorkReportItem = {
          orderNumber: '关联产品',
          productId: pmp.productId,
          productName: vLabel ? `${baseProductName}（${vLabel}）` : baseProductName,
          milestoneName,
          quantity: qty,
          rate: unitRate,
          amount: amt,
        };
        if (!existing) {
          workReportGroups.set(key, {
            timestamp: r.timestamp || '',
            workerId: wid,
            workerName,
            amount: amt,
            items: [item],
          });
        } else {
          existing.amount += amt;
          existing.items.push(item);
        }
      },
    );
  });

  workReportGroups.forEach((v, reportNo) => {
    rows.push({
      source: 'work_report',
      reportNo: reportNo || '—',
      timestamp: v.timestamp,
      workerId: v.workerId,
      workerName: v.workerName,
      amount: v.amount,
      items: v.items,
    });
  });

  workerProdRecords
    .filter(r => r.type === 'REWORK_REPORT' && r.workerId === workerId)
    .forEach(rec => {
      const d = rec.timestamp ? toLocalDateYmd(rec.timestamp) : '';
      if (!inDateRange(d, dateFrom, dateTo, dateBeforeExclusive)) return;
      rows.push({ source: 'rework_report', rec });
    });

  workerFinanceRecords
    .filter(rec => (rec.type === 'RECEIPT' || rec.type === 'PAYMENT') && rec.workerId === workerId)
    .forEach(rec => {
      const d = toLocalDateYmd(rec.timestamp);
      if (!inDateRange(d, dateFrom, dateTo, dateBeforeExclusive)) return;
      rows.push({ source: 'settlement_finance', rec });
    });

  rows.sort((a, b) => {
    const ta =
      a.source === 'settlement_finance'
        ? a.rec.timestamp
        : a.source === 'rework_report'
          ? a.rec.timestamp
          : a.timestamp;
    const tb =
      b.source === 'settlement_finance'
        ? b.rec.timestamp
        : b.source === 'rework_report'
          ? b.rec.timestamp
          : b.timestamp;
    return new Date(ta).getTime() - new Date(tb).getTime();
  });

  return rows;
}

export function filterSettlementReconList(rows: SettlementReconRow[], query: string): SettlementReconRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(row => {
    const parts: string[] = [];
    if (row.source === 'work_report') {
      parts.push(row.reportNo, row.workerName, String(row.amount));
      row.items.forEach(i => {
        parts.push(i.orderNumber, i.productName, i.milestoneName, String(i.quantity), String(i.amount));
      });
    } else if (row.source === 'rework_report') {
      const r = row.rec;
      parts.push(r.docNo ?? '', r.id, String(r.amount), r.workerId ?? '', r.productId ?? '');
    } else {
      const r = row.rec;
      parts.push(r.docNo ?? '', r.id, r.partner ?? '', r.note ?? '', r.type, String(r.amount));
    }
    return parts.filter(Boolean).join('\0').toLowerCase().includes(q);
  });
}

export function computeSettlementOpeningBalance(input: BuildSettlementReconListInput): number {
  if (!input.dateFrom?.trim()) return 0;
  const beforeRows = buildSettlementReconList({
    ...input,
    dateFrom: '',
    dateTo: '',
    dateBeforeExclusive: input.dateFrom.trim(),
  });
  return summarizeSettlementReconBalances(beforeRows, 0).closingBalance;
}

/** 列表过滤时保留 worker 名称参与搜索 */
export function filterSettlementReconListWithWorkerNames(
  rows: SettlementReconRow[],
  query: string,
  workerMap: Map<string, Worker>,
): SettlementReconRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(row => {
    const parts: string[] = [];
    if (row.source === 'work_report') {
      parts.push(row.reportNo, row.workerName, String(row.amount));
      row.items.forEach(i => {
        parts.push(i.orderNumber, i.productName, i.milestoneName, String(i.quantity), String(i.amount));
      });
    } else if (row.source === 'rework_report') {
      const r = row.rec;
      parts.push(r.docNo ?? '', r.id, String(r.amount), r.workerId ?? '', workerMap.get(r.workerId ?? '')?.name ?? '');
    } else {
      const r = row.rec;
      parts.push(r.docNo ?? '', r.id, r.partner ?? '', r.note ?? '', r.type, String(r.amount), workerMap.get(r.workerId ?? '')?.name ?? '');
    }
    return parts.filter(Boolean).join('\0').toLowerCase().includes(q);
  });
}
