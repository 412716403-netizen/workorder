import type { PrintRenderContext, PrintTemplate, SalesBillMatrixGroup, SalesBillPrintDoc } from '../types';

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
};

/** 与可视化编辑器一致的示例矩阵行，供 salesBillMatrix 分页与渲染 */
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
export function augmentPrintPreviewContext(
  base: PrintRenderContext,
  template: PrintTemplate | null | undefined,
): PrintRenderContext {
  if (!template?.elements?.some(e => e.type === 'salesBillMatrix')) return base;
  return {
    ...base,
    salesBill: SAMPLE_SALES_BILL_PRINT_DOC,
    salesBillMatrix: SAMPLE_SALES_BILL_MATRIX_GROUPS,
  };
}
