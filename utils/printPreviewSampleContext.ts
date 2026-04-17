import type {
  MaterialFlowPrintContext,
  PrintRenderContext,
  PrintTemplate,
  PurchaseOrderPrintContext,
  SalesOrderPrintContext,
  PurchaseBillPrintContext,
  FinanceDocPrintContext,
  SalesBillMatrixGroup,
  SalesBillPrintDoc,
  VirtualBatchPrintRow,
} from '../types';
import { formatBatchSerialLabel } from './serialLabels';
import { amountToChineseRmbUppercase } from './numberToChineseRmb';

/** 与可视化编辑器一致的示例销售单表头，供含 salesBillMatrix 的模版预览 */
export const SAMPLE_SALES_BILL_PRINT_DOC: SalesBillPrintDoc = {
  title: '销售单',
  docNumber: 'XS-0001',
  partner: '示例客户',
  warehouseName: '主仓',
  createdAtDisplay: '2026年01月15日',
  note: '',
  docTotalQty: 300,
  docTotalAmount: 0,
  previousBalance: 19929,
  currentDebt: 0,
  accumulatedDebt: 19929,
  custom: { preview_demo: '示例自定义' },
};

/** 进销存四类单据：画布预览时把表单配置里的自定义字段 id 注入 sample，避免 {{…custom.xxx}} 原样泄漏 */
export type PrintPreviewPsiCustomSamples = Partial<{
  salesBill: Record<string, string>;
  purchaseBill: Record<string, string>;
  purchaseOrder: Record<string, string>;
  salesOrder: Record<string, string>;
}>;

function mergeDocCustom<T extends { custom?: Record<string, unknown> }>(doc: T, extra?: Record<string, string>): T {
  if (!extra || !Object.keys(extra).length) return doc;
  return { ...doc, custom: { ...(doc.custom ?? {}), ...extra } } as T;
}

/** 与可视化编辑器一致的示例矩阵行，供 salesBillMatrix 分页与渲染 */
/** 画布/管理端预览用：与 {{批次.xxx}} 占位符键一致，见 utils/printVirtualBatch.ts */
export function buildSampleVirtualBatchPrintRow(ctx: PrintRenderContext): VirtualBatchPrintRow {
  const planNumber = ctx.plan?.planNumber ?? 'PLN-示例';
  const productName = ctx.product?.name ?? '示例产品';
  const sku = ctx.product?.sku ?? 'SKU-001';
  const sequenceNo = 3;
  const token = 'demo-batch-scan-token';
  const origin =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://example.com';
  const base = origin.replace(/\/$/, '');
  const serialLabel = formatBatchSerialLabel(planNumber, sequenceNo);
  return {
    scanUrl: `${base}/scan/batch/${token}`,
    scanToken: token,
    sequenceNo: String(sequenceNo),
    serialLabel,
    quantity: '24',
    planNumber,
    orderNumbers: 'WO-0001、WO-0002',
    productName,
    sku,
    variantLabel: '红色 / L',
    colorName: '红色',
    sizeName: 'L',
    status: '正常',
  };
}

function previewShouldInjectSampleVirtualBatch(template: PrintTemplate | null | undefined): boolean {
  if (!template) return false;
  const dt = template.documentType ?? 'all';
  if (dt === 'plan' || dt === 'all') return true;
  try {
    return JSON.stringify(template).includes('批次.');
  } catch {
    return false;
  }
}

export const SAMPLE_SALES_BILL_MATRIX_GROUPS: SalesBillMatrixGroup[] = [
  {
    lineNo: 1,
    sku: '26003',
    productName: '26003',
    sizes: ['XL', 'xs'],
    colorRows: [
      { colorName: '大红', quantities: [50, 50] },
      { colorName: '嘿嘿嘿', quantities: [50, 50] },
    ],
    totalQty: 200,
    unitPrice: 0,
    totalAmount: 0,
    remark: '',
  },
  {
    lineNo: 2,
    sku: '2121233',
    productName: '23321223',
    sizes: ['均码'],
    colorRows: [
      { colorName: '米白色', quantities: [50] },
      { colorName: '大红', quantities: [50] },
    ],
    totalQty: 100,
    unitPrice: 0,
    totalAmount: 0,
    remark: '',
  },
];

/**
 * 若模版含销售单矩阵组件，为预览注入示例 salesBill / salesBillMatrix，
 * 使管理模版弹窗等与「可视化编辑」画布一致。
 */
const SAMPLE_MATERIAL_ISSUE_PRINT: MaterialFlowPrintContext = {
  docNo: 'LL20260417-0001',
  warehouseName: '原料仓',
  operator: '示例操作员',
  timestamp: '2026-04-17 10:30',
  partner: '',
  reason: '',
  orderNumber: 'WO-1001',
  productName: '示例成品',
  totalQty: 120,
  custom: {},
};

const SAMPLE_OUTSOURCE_MATERIAL_ISSUE_PRINT: MaterialFlowPrintContext = {
  ...SAMPLE_MATERIAL_ISSUE_PRINT,
  docNo: 'LL20260417-0002',
  partner: '示例外协加工厂',
};

const SAMPLE_PURCHASE_ORDER_PRINT: PurchaseOrderPrintContext = {
  docNumber: 'CG-20260417-0001',
  partner: '示例供应商',
  operator: '示例经办',
  docTotalQty: 150,
  docTotalAmount: 12345.67,
  custom: {},
};

const SAMPLE_SALES_ORDER_PRINT: SalesOrderPrintContext = {
  docNumber: 'SO-20260417-0001',
  partner: '示例客户',
  operator: '示例经办',
  docTotalQty: 120,
  docTotalAmount: 8888.88,
  custom: {},
};

const SAMPLE_PURCHASE_BILL_PRINT: PurchaseBillPrintContext = {
  docNumber: 'RK-20260417-0001',
  partner: '示例供应商',
  operator: '示例经办',
  warehouseName: '主仓',
  docTotalQty: 80,
  docTotalAmount: 5600,
  custom: {},
};

const SAMPLE_RECEIPT_PRINT: FinanceDocPrintContext = {
  docNo: 'SKD20260417-0001',
  type: '收款单',
  amount: 12800.5,
  amountText: amountToChineseRmbUppercase(12800.5),
  partner: '示例客户',
  operator: '示例经办',
  timestamp: '2026-04-17 10:30:00',
  category: '预收款',
  paymentAccount: '对公账户',
  workerName: '',
  productName: '',
  productSku: '',
  relatedDocNo: 'WO-1001',
  note: '示例备注',
  custom: { preview_demo: '示例自定义' },
};

const SAMPLE_PAYMENT_PRINT: FinanceDocPrintContext = {
  docNo: 'FKD20260417-0001',
  type: '付款单',
  amount: 5600,
  amountText: amountToChineseRmbUppercase(5600),
  partner: '示例供应商',
  operator: '示例经办',
  timestamp: '2026-04-17 14:00:00',
  category: '材料款',
  paymentAccount: '现金',
  workerName: '',
  productName: '',
  productSku: '',
  relatedDocNo: '',
  note: '',
  custom: {},
};

const SAMPLE_OUTSOURCE_MATERIAL_RETURN_PRINT: MaterialFlowPrintContext = {
  docNo: 'TL20260417-0001',
  warehouseName: '原料仓',
  operator: '示例操作员',
  timestamp: '2026-04-17 14:00',
  partner: '示例外协加工厂',
  reason: '',
  orderNumber: 'WO-1001',
  productName: '示例成品',
  totalQty: 30,
  custom: {},
};

export function augmentPrintPreviewContext(
  base: PrintRenderContext,
  template: PrintTemplate | null | undefined,
  psiCustomSamples?: PrintPreviewPsiCustomSamples,
): PrintRenderContext {
  let next: PrintRenderContext = base;
  const dt = template?.documentType ?? 'all';
  if (dt === 'productionMaterial') {
    if (!next.materialIssuePrint && !next.materialReturnPrint) {
      next = {
        ...next,
        materialIssuePrint: { ...SAMPLE_MATERIAL_ISSUE_PRINT },
        printListRows: [
          { index: 1, productName: '线材 A', sku: 'MAT-001', quantity: 50, unit: '米' },
          { index: 2, productName: '螺丝 B', sku: 'MAT-002', quantity: 70, unit: '件' },
        ],
      };
    }
    if (!next.outsourceMaterialIssuePrint || !next.outsourceMaterialReturnPrint) {
      next = {
        ...next,
        outsourceMaterialIssuePrint: next.outsourceMaterialIssuePrint ?? { ...SAMPLE_OUTSOURCE_MATERIAL_ISSUE_PRINT },
        outsourceMaterialReturnPrint: next.outsourceMaterialReturnPrint ?? { ...SAMPLE_OUTSOURCE_MATERIAL_RETURN_PRINT },
        printListRows: next.printListRows ?? [
          { index: 1, productName: '线材 A', sku: 'MAT-001', quantity: 50, unit: '米' },
          { index: 2, productName: '螺丝 B', sku: 'MAT-002', quantity: 70, unit: '件' },
        ],
      };
    }
  }
  if (dt === 'rework' && !next.defectTreatmentPrint && !next.reworkReportPrint) {
    next = {
      ...next,
      defectTreatmentPrint: {
        docNo: 'RW20260417-0001',
        typeLabel: '返工',
        sourceNodeName: '缝制',
        targetNodesLabel: '裁剪、缝制',
        totalQty: 12,
        timestamp: '2026-04-17 14:00',
        operators: '张三',
        reason: '疵点返修',
        orderNumber: 'WO-1001',
        productName: '示例成品',
        custom: {},
      },
      reworkReportPrint: {
        docNo: 'RB20260417-0001',
        nodeNames: '缝制',
        sourceNodeName: '裁剪',
        totalQty: 8,
        timestamp: '2026-04-17 16:00',
        operators: '李四',
        workerName: '李四',
        equipmentName: '缝纫机 01',
        unitPrice: '5',
        batchTotalAmount: '40',
        reason: '',
        orderNumber: 'WO-1001',
        productName: '示例成品',
        custom: {},
      },
      printListRows: [
        { index: 1, variantLabel: '红色 / L', quantity: 5, nodeName: '缝制' },
        { index: 2, variantLabel: '蓝色 / M', quantity: 3, nodeName: '缝制' },
      ],
    };
  }
  if (dt === 'purchaseOrder' && !next.purchaseOrderPrint) {
    next = {
      ...next,
      purchaseOrderPrint: mergeDocCustom(SAMPLE_PURCHASE_ORDER_PRINT, psiCustomSamples?.purchaseOrder),
      printListRows: [
        {
          lineNo: 1,
          sku: 'SKU-001',
          productName: '示例物料 A',
          colorName: '大红',
          sizeName: 'L',
          qty: 100,
          unitPrice: '80.00',
          amount: '8000.00',
          remark: '',
        },
        {
          lineNo: 2,
          sku: 'SKU-002',
          productName: '示例物料 B',
          colorName: '',
          sizeName: '',
          qty: 50,
          unitPrice: '86.91',
          amount: '4345.67',
          remark: '',
        },
      ],
    };
  }
  if (dt === 'salesOrder' && !next.salesOrderPrint) {
    next = {
      ...next,
      salesOrderPrint: mergeDocCustom(SAMPLE_SALES_ORDER_PRINT, psiCustomSamples?.salesOrder),
      printListRows: [
        {
          lineNo: 1,
          sku: 'SKU-SO-001',
          productName: '示例订货产品 A',
          colorName: '黑色',
          sizeName: 'M',
          qty: 60,
          unitPrice: '120.00',
          amount: '7200.00',
          remark: '',
        },
        {
          lineNo: 2,
          sku: 'SKU-SO-002',
          productName: '示例订货产品 B',
          colorName: '',
          sizeName: '',
          qty: 40,
          unitPrice: '42.22',
          amount: '1688.88',
          remark: '',
        },
      ],
    };
  }
  if (dt === 'purchaseBill' && !next.purchaseBillPrint) {
    next = {
      ...next,
      purchaseBillPrint: mergeDocCustom(SAMPLE_PURCHASE_BILL_PRINT, psiCustomSamples?.purchaseBill),
      printListRows: [
        {
          lineNo: 1,
          sku: 'SKU-101',
          productName: '示例入库品 A',
          colorName: '黑色',
          sizeName: 'M',
          qty: 30,
          unitPrice: '70.00',
          amount: '2100.00',
          remark: '',
        },
        {
          lineNo: 2,
          sku: 'SKU-102',
          productName: '示例入库品 B',
          colorName: '',
          sizeName: '',
          qty: 50,
          unitPrice: '70.00',
          amount: '3500.00',
          remark: '',
        },
      ],
    };
  }
  if (dt === 'receipt' && !next.receiptPrint) {
    next = {
      ...next,
      receiptPrint: { ...SAMPLE_RECEIPT_PRINT },
    };
  }
  if (dt === 'payment' && !next.paymentPrint) {
    next = {
      ...next,
      paymentPrint: { ...SAMPLE_PAYMENT_PRINT },
    };
  }
  if (dt === 'salesBill' && !next.salesBill) {
    next = {
      ...next,
      salesBill: mergeDocCustom(SAMPLE_SALES_BILL_PRINT_DOC, psiCustomSamples?.salesBill),
      printListRows: [
        {
          lineNo: 1,
          sku: 'SKU-SB-001',
          productName: '示例销售品 A',
          colorName: '黑色',
          sizeName: 'M',
          qty: 30,
          unitPrice: '90.00',
          amount: '2700.00',
          remark: '',
        },
        {
          lineNo: 2,
          sku: 'SKU-SB-002',
          productName: '示例销售品 B',
          colorName: '',
          sizeName: '',
          qty: 20,
          unitPrice: '50.00',
          amount: '1000.00',
          remark: '',
        },
      ],
    };
  }
  if (dt === 'outsource' && !next.outsourceDispatchPrint && !next.outsourceReceivePrint) {
    next = {
      ...next,
      outsourceDispatchPrint: {
        docNo: 'WX-0001-001',
        partner: '示例加工厂',
        operator: '示例操作员',
        timestamp: '2026-04-17 10:30',
        reason: '',
        totalQty: 100,
        custom: {},
      },
      printListRows: [
        {
          index: 1,
          orderNumber: 'WO-1001',
          productName: '示例产品',
          nodeName: '裁剪',
          variantLabel: '红色 / L',
          quantity: 50,
        },
        {
          index: 2,
          orderNumber: 'WO-1002',
          productName: '示例产品 B',
          nodeName: '缝制',
          variantLabel: '—',
          quantity: 50,
        },
      ],
    };
  }
  if (template?.elements?.some(e => e.type === 'salesBillMatrix')) {
    next = {
      ...next,
      salesBill: mergeDocCustom(SAMPLE_SALES_BILL_PRINT_DOC, psiCustomSamples?.salesBill),
      salesBillMatrix: SAMPLE_SALES_BILL_MATRIX_GROUPS,
    };
  }
  if (previewShouldInjectSampleVirtualBatch(template) && next.virtualBatch == null) {
    next = { ...next, virtualBatch: buildSampleVirtualBatchPrintRow(next) };
  }
  return next;
}
