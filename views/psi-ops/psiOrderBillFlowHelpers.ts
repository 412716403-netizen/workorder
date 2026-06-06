import type { Product, PsiRecord, PsiRecordType, Warehouse } from '../../types';
import { groupRecordsByDocNumber, formatPsiQtyDisplay } from '../../utils/psiOpsAggregators';
import {
  formatPsiDocBusinessDateListZh,
  flowRecordsEarliestMs,
  psiDocGroupListSortMs,
  psiDocNumberSeqSuffix,
} from '../../utils/flowDocSort';
import { formatPsiDocNumForList } from './psiOpsListFormatting';

/** 进销存四 Tab 工具栏「流水」按钮与弹窗标题文案 */
export const PSI_ORDER_BILL_FLOW_LABELS: Record<PsiRecordType, string> = {
  PURCHASE_ORDER: '订单流水',
  PURCHASE_BILL: '采购流水',
  SALES_ORDER: '订单流水',
  SALES_BILL: '销售流水',
};

export type PurchaseOrderLineFlowStatus = 'none' | 'partial' | 'completed' | 'over_received';
export type SalesOrderLineFlowStatus =
  | 'unallocated'
  | 'allocated'
  | 'pending_ship'
  | 'fully_shipped'
  | 'over_allocated';

export const PURCHASE_ORDER_FLOW_STATUS_FILTER_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'none', label: '未入库' },
  { value: 'partial', label: '部分入库' },
  { value: 'completed', label: '已入库' },
] as const;

export const SALES_ORDER_FLOW_STATUS_FILTER_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'unallocated', label: '未配货' },
  { value: 'allocated', label: '已配货' },
  { value: 'fully_shipped', label: '已发齐' },
] as const;

export const PURCHASE_ORDER_FLOW_STATUS_BADGE_CLASS: Record<PurchaseOrderLineFlowStatus, string> = {
  none: 'bg-slate-100 text-slate-600',
  partial: 'bg-indigo-100 text-indigo-800',
  completed: 'bg-emerald-100 text-emerald-800',
  over_received: 'bg-rose-100 text-rose-800',
};

export const SALES_ORDER_FLOW_STATUS_BADGE_CLASS: Record<SalesOrderLineFlowStatus, string> = {
  unallocated: 'bg-slate-100 text-slate-600',
  allocated: 'bg-indigo-100 text-indigo-800',
  pending_ship: 'bg-sky-100 text-sky-800',
  fully_shipped: 'bg-emerald-100 text-emerald-800',
  over_allocated: 'bg-rose-100 text-rose-800',
};

export interface PsiOrderBillFlowSummaryRow {
  /** `${docNumber}|${lineGroupId}`，表格行唯一键 */
  rowKey: string;
  docNumber: string;
  lineGroupId: string;
  docNumberDisplay: string;
  dateStr: string;
  partner: string;
  warehouseName: string;
  productSummary: string;
  productId: string;
  productSku: string;
  totalQty: number;
  totalAmount: number;
  sortKeyMs: number;
  records: PsiRecord[];
  /** 采购/销售订单流水：行组履约状态 */
  statusKey?: PurchaseOrderLineFlowStatus | SalesOrderLineFlowStatus;
  statusLabel?: string;
}

function lineQty(r: PsiRecord): number {
  return formatPsiQtyDisplay(r.quantity);
}

function lineAmount(r: PsiRecord, recordType: PsiRecordType): number {
  const qty = lineQty(r);
  if (recordType === 'SALES_ORDER' || recordType === 'SALES_BILL') {
    return qty * (Number(r.salesPrice) || 0);
  }
  return qty * (Number(r.purchasePrice) || 0);
}

function lineGroupTotalQty(items: PsiRecord[]): number {
  return items.reduce((s, i) => s + lineQty(i), 0);
}

function lineGroupTotalAmount(items: PsiRecord[], recordType: PsiRecordType): number {
  return items.reduce((s, i) => s + lineAmount(i, recordType), 0);
}

/** 单行组（同一产品，含多颜色尺码）的产品展示名 */
export function productLabelForLineGroup(
  items: PsiRecord[],
  productMap?: Map<string, Product>,
): string {
  const first = items[0];
  const pid = first?.productId;
  if (!pid) return '—';
  const p = productMap?.get(pid);
  const name = p?.name ?? first.productName ?? p?.sku ?? first.productSku ?? pid;
  const sku = p?.sku ?? first.productSku;
  if (name && sku && name !== sku) return `${name}（${sku}）`;
  return String(name || sku || pid);
}

function groupDocItemsByLineGroup(docItems: PsiRecord[]): Record<string, PsiRecord[]> {
  const lineGroups: Record<string, PsiRecord[]> = {};
  for (const item of docItems) {
    const lg = item.lineGroupId ?? item.id;
    if (!lineGroups[lg]) lineGroups[lg] = [];
    lineGroups[lg].push(item);
  }
  return lineGroups;
}

/** 采购订单行组入库状态（与 PSIOpsView 入库进度列口径一致） */
export function resolvePurchaseOrderLineFlowStatus(
  docNumber: string,
  items: PsiRecord[],
  receivedByOrderLine: Record<string, number>,
): { statusKey: PurchaseOrderLineFlowStatus; statusLabel: string } {
  const orderQty = lineGroupTotalQty(items);
  const received = items.reduce(
    (s, i) => s + (receivedByOrderLine[`${docNumber}::${i.id}`] ?? 0),
    0,
  );
  if (orderQty > 0 && received > orderQty) {
    return { statusKey: 'over_received', statusLabel: '已超收' };
  }
  if (orderQty > 0 && received >= orderQty) {
    return { statusKey: 'completed', statusLabel: '已入库' };
  }
  if (received > 0) {
    return { statusKey: 'partial', statusLabel: '部分入库' };
  }
  return { statusKey: 'none', statusLabel: '未入库' };
}

/** 销售订单行组配货/发货状态（与 PSIOpsView 配货进度列口径一致） */
export function resolveSalesOrderLineFlowStatus(
  items: PsiRecord[],
): { statusKey: SalesOrderLineFlowStatus; statusLabel: string } {
  const orderQty = lineGroupTotalQty(items);
  const allocatedQty = items.reduce((s, i) => s + formatPsiQtyDisplay(i.allocatedQuantity), 0);
  const shippedQty = items.reduce((s, i) => s + formatPsiQtyDisplay(i.shippedQuantity), 0);
  const allocPendingQty = Math.max(0, allocatedQty - shippedQty);

  if (orderQty > 0 && allocatedQty > orderQty) {
    return { statusKey: 'over_allocated', statusLabel: '超配' };
  }
  if (orderQty > 0 && shippedQty >= orderQty) {
    return { statusKey: 'fully_shipped', statusLabel: '已发齐' };
  }
  if (allocPendingQty > 0) {
    return { statusKey: 'pending_ship', statusLabel: '有待发' };
  }
  if (allocatedQty > 0) {
    return { statusKey: 'allocated', statusLabel: '已配货' };
  }
  return { statusKey: 'unallocated', statusLabel: '未配货' };
}

function buildRowFromLineGroup(
  docNumber: string,
  lineGroupId: string,
  items: PsiRecord[],
  recordType: PsiRecordType,
  productMap?: Map<string, Product>,
  warehouseMap?: Map<string, Warehouse>,
  receivedByOrderLine?: Record<string, number>,
): PsiOrderBillFlowSummaryRow {
  const main = items[0];
  const whId = main?.warehouseId ?? '';
  const warehouseName =
    recordType === 'PURCHASE_BILL' || recordType === 'SALES_BILL'
      ? (warehouseMap?.get(whId)?.name ?? (whId ? whId : '—'))
      : '—';
  const sortKeyMs =
    recordType === 'SALES_BILL'
      ? psiDocGroupListSortMs(items)
      : flowRecordsEarliestMs(items);

  let statusKey: PsiOrderBillFlowSummaryRow['statusKey'];
  let statusLabel: string | undefined;
  if (recordType === 'PURCHASE_ORDER') {
    const st = resolvePurchaseOrderLineFlowStatus(docNumber, items, receivedByOrderLine ?? {});
    statusKey = st.statusKey;
    statusLabel = st.statusLabel;
  } else if (recordType === 'SALES_ORDER') {
    const st = resolveSalesOrderLineFlowStatus(items);
    statusKey = st.statusKey;
    statusLabel = st.statusLabel;
  }

  return {
    rowKey: `${docNumber}|${lineGroupId}`,
    docNumber,
    lineGroupId,
    docNumberDisplay: formatPsiDocNumForList(docNumber),
    dateStr: formatPsiDocBusinessDateListZh(items),
    partner: main?.partner?.trim() || '—',
    warehouseName,
    productSummary: productLabelForLineGroup(items, productMap),
    productId: main?.productId ?? '',
    productSku: productMap?.get(main?.productId ?? '')?.sku ?? main?.productSku ?? '',
    totalQty: lineGroupTotalQty(items),
    totalAmount: lineGroupTotalAmount(items, recordType),
    sortKeyMs,
    records: items,
    statusKey,
    statusLabel,
  };
}

/**
 * 流水行：按单号 → 行组（lineGroupId，同色尺码合并）展开。
 * 一单多产品 → 多行；一产品多规格 → 一行。
 */
export function buildPsiOrderBillFlowSummaryRows(
  records: PsiRecord[],
  recordType: PsiRecordType,
  productMap?: Map<string, Product>,
  warehouseMap?: Map<string, Warehouse>,
  receivedByOrderLine?: Record<string, number>,
): PsiOrderBillFlowSummaryRow[] {
  const grouped = groupRecordsByDocNumber(records, recordType);
  const rows: PsiOrderBillFlowSummaryRow[] = [];
  for (const [docNumber, docItems] of Object.entries(grouped)) {
    const lineGroups = groupDocItemsByLineGroup(docItems as PsiRecord[]);
    for (const [lineGroupId, items] of Object.entries(lineGroups)) {
      rows.push(
        buildRowFromLineGroup(
          docNumber,
          lineGroupId,
          items,
          recordType,
          productMap,
          warehouseMap,
          receivedByOrderLine,
        ),
      );
    }
  }
  return rows;
}

export function sortPsiOrderBillFlowRows(
  rows: PsiOrderBillFlowSummaryRow[],
  recordType: PsiRecordType,
): PsiOrderBillFlowSummaryRow[] {
  return [...rows].sort((a, b) => {
    const ma = a.sortKeyMs;
    const mb = b.sortKeyMs;
    const ha = ma > 0;
    const hb = mb > 0;
    if (ha !== hb) return ha ? -1 : 1;
    if (ha && hb && mb !== ma) return mb - ma;
    if (recordType === 'SALES_BILL') {
      const seqDiff = psiDocNumberSeqSuffix(b.docNumber) - psiDocNumberSeqSuffix(a.docNumber);
      if (seqDiff !== 0) return seqDiff;
    }
    if (a.docNumber !== b.docNumber) {
      return (b.docNumber || '').localeCompare(a.docNumber || '');
    }
    return (a.lineGroupId || '').localeCompare(b.lineGroupId || '');
  });
}

export function filterPsiOrderBillFlowRows(
  rows: PsiOrderBillFlowSummaryRow[],
  filters: { docNo?: string; partner?: string; product?: string; status?: string },
): PsiOrderBillFlowSummaryRow[] {
  let list = rows;
  const docKw = filters.docNo?.trim().toLowerCase();
  if (docKw) {
    list = list.filter(
      row =>
        row.docNumber.toLowerCase().includes(docKw) ||
        row.docNumberDisplay.toLowerCase().includes(docKw),
    );
  }
  const partnerKw = filters.partner?.trim().toLowerCase();
  if (partnerKw) {
    list = list.filter(row => row.partner.toLowerCase().includes(partnerKw));
  }
  const productKw = filters.product?.trim().toLowerCase();
  if (productKw) {
    list = list.filter(row => {
      if (row.productSummary.toLowerCase().includes(productKw)) return true;
      return row.records.some(r => {
        const name = (r.productName ?? '').toLowerCase();
        const sku = (r.productSku ?? '').toLowerCase();
        return name.includes(productKw) || sku.includes(productKw);
      });
    });
  }
  const status = filters.status?.trim();
  if (status && status !== 'all') {
    list = list.filter(row => row.statusKey === status);
  }
  return list;
}

export interface PsiOrderBillFlowTotals {
  rowCount: number;
  totalQty: number;
  totalAmount: number;
}

export function sumPsiOrderBillFlowTotals(rows: PsiOrderBillFlowSummaryRow[]): PsiOrderBillFlowTotals {
  return {
    rowCount: rows.length,
    totalQty: rows.reduce((s, r) => s + r.totalQty, 0),
    totalAmount: rows.reduce((s, r) => s + r.totalAmount, 0),
  };
}
