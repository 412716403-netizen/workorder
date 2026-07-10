import type { ProductionOrder, Product, ProductMilestoneProgress } from '../types';
import type { OrderReportRow, ProductReportRow, ReportDetailBatch } from '../hooks/useReportBatchDetail';

export type PendingLineInput = {
  reportId: string;
  reportBatchId: string;
  source: 'order' | 'pmp';
  timestamp: string;
  orderNumber: string;
  orderId: string;
  milestoneId: string;
  templateId: string;
  progressId?: string;
  productId: string;
  productName: string;
  sku: string;
  milestoneName: string;
  variantId: string;
  quantity: number;
  defectiveQuantity: number;
  operator: string;
  reportNo: string;
  weight?: number | null;
  rate?: number | null;
  customData?: Record<string, unknown>;
};

function fallbackOrderFromLine(line: PendingLineInput): ProductionOrder {
  return {
    id: line.orderId,
    orderNumber: line.orderNumber,
    productId: line.productId,
    productName: line.productName,
    sku: line.sku,
    items: [],
    milestones: [
      {
        id: line.milestoneId,
        templateId: line.templateId,
        name: line.milestoneName,
        completedQuantity: 0,
        reports: [],
      },
    ],
  } as unknown as ProductionOrder;
}

function mapReportFields(item: PendingLineInput) {
  return {
    id: item.reportId,
    timestamp: item.timestamp,
    operator: item.operator,
    quantity: item.quantity,
    defectiveQuantity: item.defectiveQuantity > 0 ? item.defectiveQuantity : undefined,
    variantId: item.variantId || undefined,
    reportBatchId: item.reportBatchId,
    reportNo: item.reportNo && item.reportNo !== '—' ? item.reportNo : undefined,
    weight: item.weight ?? undefined,
    rate: item.rate != null ? Number(item.rate) : undefined,
    customData: item.customData,
  };
}

/** 待审批次 → 报工详情弹窗用的 ReportDetailBatch（只读） */
export function buildPendingApprovalDetailBatch(
  key: string,
  items: PendingLineInput[],
  orders: ProductionOrder[],
  _products: Product[],
): ReportDetailBatch | null {
  if (!items.length) return null;
  const first = items[0];
  const reportNo = items.map((i) => i.reportNo).find((n) => n && n !== '—') || first.reportNo;
  const totalGood = items.reduce((s, i) => s + i.quantity, 0);
  const totalDefective = items.reduce((s, i) => s + i.defectiveQuantity, 0);

  if (first.source === 'order') {
    const order = orders.find((o) => o.id === first.orderId) ?? fallbackOrderFromLine(first);
    const ms =
      order.milestones?.find((m) => m.id === first.milestoneId) ?? {
        id: first.milestoneId,
        templateId: first.templateId,
        name: first.milestoneName,
      };
    const rows: OrderReportRow[] = items.map((item) => ({
      order,
      milestone: {
        id: ms.id,
        name: ms.name || first.milestoneName,
        templateId: ms.templateId || first.templateId,
      },
      report: mapReportFields(item),
    }));
    const totalAmount = rows.reduce((s, { report }) => {
      const rate = Number(report.rate) || 0;
      return s + rate * report.quantity;
    }, 0);
    return {
      source: 'order',
      key,
      rows,
      first: rows[0],
      totalGood,
      totalDefective,
      totalAmount,
      reportNo: reportNo && reportNo !== '—' ? reportNo : undefined,
    };
  }

  const rows: ProductReportRow[] = items.map((item) => ({
    progress: {
      id: item.progressId || '',
      productId: item.productId,
      variantId: item.variantId || null,
      milestoneTemplateId: item.templateId,
      completedQuantity: 0,
      reports: [],
    } as unknown as ProductMilestoneProgress,
    report: mapReportFields(item),
  }));
  const totalAmount = rows.reduce((s, { report }) => {
    const rate = Number(report.rate) || 0;
    return s + rate * report.quantity;
  }, 0);
  return {
    source: 'product',
    key,
    progressId: first.progressId || '',
    productId: first.productId,
    productName: first.productName,
    milestoneName: first.milestoneName,
    milestoneTemplateId: first.templateId,
    rows,
    first: rows[0],
    totalGood,
    totalDefective,
    totalAmount,
    reportNo: reportNo && reportNo !== '—' ? reportNo : undefined,
  };
}
