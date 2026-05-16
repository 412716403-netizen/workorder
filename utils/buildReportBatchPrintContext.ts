/**
 * 报工批次详情的打印上下文构建器 (Phase P3 抽离自 ReportBatchDetailModal.tsx)。
 *
 * 纯函数,不依赖 React。打印模板 picker 在 detail 视图触发时调用,
 * 把当前 batch + 关联 product/orders 转成 PrintRenderContext。
 */
import type {
  Product,
  ProductionOrder,
  AppDictionaries,
  PrintTemplate,
  PrintRenderContext,
  ProductMilestoneProgress,
} from '../types';
import { fmtDT } from './formatTime';
import { buildOneBlockMatrixPrintRows } from './variantMatrixPrintRows';

type OrderReportRow = {
  order: ProductionOrder;
  milestone: { id: string; name: string; templateId: string };
  report: {
    id: string; timestamp: string; operator: string; quantity: number;
    defectiveQuantity?: number; variantId?: string; reportBatchId?: string; reportNo?: string;
    [k: string]: unknown;
  };
};
type ProductReportRow = { progress: ProductMilestoneProgress; report: OrderReportRow['report'] };

export type ReportDetailBatchForPrint =
  | {
      source: 'order';
      key: string;
      rows: OrderReportRow[];
      first: OrderReportRow;
      totalGood: number;
      totalDefective: number;
      totalAmount: number;
      reportNo?: string;
    }
  | {
      source: 'product';
      key: string;
      progressId: string;
      productId: string;
      productName: string;
      milestoneName: string;
      milestoneTemplateId: string;
      rows: ProductReportRow[];
      first: ProductReportRow;
      totalGood: number;
      totalDefective: number;
      totalAmount: number;
      reportNo?: string;
    };

interface BuildReportBatchPrintContextArgs {
  batch: ReportDetailBatchForPrint;
  productMap: Map<string, Product>;
  products: Product[];
  dictionaries: AppDictionaries;
}

/** Picker 调用入口，签名与 OrderCenterDetailPrintBlock 期望一致 (`_template` 暂时未用) */
export function buildReportBatchPrintContext(
  _template: PrintTemplate,
  { batch, productMap, products, dictionaries }: BuildReportBatchPrintContextArgs,
): PrintRenderContext {
  const first = batch.first;
  const fr = first.report;
  let milestoneName = '';
  let productName = '';
  let orderForCtx: ProductionOrder | undefined;
  if (batch.source === 'order') {
    const fo = first as OrderReportRow;
    milestoneName = fo.milestone.name;
    productName = fo.order.productName;
    orderForCtx = fo.order;
  } else {
    milestoneName = batch.milestoneName;
    productName = batch.productName;
    orderForCtx = undefined;
  }
  const productId = batch.source === 'order' ? (first as OrderReportRow).order.productId : batch.productId;
  const productEntity = productMap.get(productId);
  const reportBatchPrint: Record<string, string | number | undefined> = {
    reportNo: (batch.reportNo ?? fr.reportNo ?? '') as string,
    sourceLabel: batch.source === 'order' ? '工单' : '产品',
    milestoneName,
    productName,
    totalGood: batch.totalGood,
    totalDefective: batch.totalDefective,
    totalAmount: batch.totalAmount,
    firstOperator: fr.operator,
    firstTimestamp: fmtDT(fr.timestamp),
  };
  const qtyRows = batch.rows.map(row =>
    batch.source === 'order'
      ? {
          variantId: (row as OrderReportRow).report.variantId,
          quantity: (row as OrderReportRow).report.quantity,
        }
      : {
          variantId: (row as ProductReportRow).report.variantId,
          quantity: (row as ProductReportRow).report.quantity,
        },
  );
  const defectiveSum = batch.rows.reduce((s, row) => {
    const dq =
      batch.source === 'order'
        ? (row as OrderReportRow).report.defectiveQuantity
        : (row as ProductReportRow).report.defectiveQuantity;
    return s + (Number(dq) || 0);
  }, 0);
  const printListRows = buildOneBlockMatrixPrintRows({
    productId,
    product: productEntity,
    products,
    dictionaries,
    rows: qtyRows,
    extra: {
      defectiveQuantity: defectiveSum,
      operator: fr.operator,
      timestamp: fmtDT(fr.timestamp),
      orderNumber: batch.source === 'order' ? (first as OrderReportRow).order.orderNumber : '—',
      milestoneName,
    },
  });
  return {
    order: orderForCtx,
    product: productEntity ?? undefined,
    milestoneName,
    completedQuantity: batch.totalGood,
    reportBatchPrint,
    printListRows,
  };
}
