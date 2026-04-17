import type { PrintBodyElement, PrintTemplate } from '../types';
import { PRINT_PAPER_A4_HALF_MM, newElementId } from './printTemplateDefaults';

/** 内置销售单打印模版 id（二等分纸 + 矩阵表）；与 v1 并存时优先使用本版 */
export const BUILTIN_SALES_BILL_PRINT_TEMPLATE_ID = 'builtin-sales-bill-v2';

function nowIso() {
  return new Date().toISOString();
}

/** 销售单：A4 二等分纸 + 颜色×尺码矩阵表 + 结余区 */
export function createBuiltinSalesBillPrintTemplate(): PrintTemplate {
  const t = nowIso();
  const mk = (partial: Omit<PrintBodyElement, 'id'> & { id?: string }): PrintBodyElement =>
    ({
      id: partial.id ?? newElementId(),
      ...partial,
    }) as PrintBodyElement;

  const elements: PrintBodyElement[] = [
    mk({
      id: 'sb2-title',
      type: 'text',
      x: 36,
      y: 2,
      width: 132,
      height: 8,
      zIndex: 30,
      repeatPerPage: true,
      config: {
        content: '{{销售单.title}}',
        fontSizePt: 14,
        fontWeight: 'bold',
        textAlign: 'center',
        color: '#000000',
      },
    }),
    mk({
      id: 'sb2-meta',
      type: 'text',
      x: 124,
      y: 2,
      width: 80,
      height: 18,
      zIndex: 30,
      repeatPerPage: true,
      config: {
        content:
          '{{系统.pageCurrent}}/{{系统.pageTotal}} 页\n{{销售单.createdAtDisplay}}\nNO: {{销售单.docNumber}}\n客户：{{销售单.partner}}',
        fontSizePt: 7,
        fontWeight: 'normal',
        textAlign: 'right',
        color: '#000000',
      },
    }),
    mk({
      id: 'sb2-warehouse',
      type: 'text',
      x: 3,
      y: 11,
      width: 120,
      height: 4,
      zIndex: 28,
      repeatPerPage: true,
      config: {
        content: '出库仓库：{{销售单.warehouseName}}',
        fontSizePt: 7,
        fontWeight: 'normal',
        textAlign: 'left',
        color: '#000000',
      },
    }),
    mk({
      id: 'sb2-matrix',
      type: 'salesBillMatrix',
      x: 3,
      y: 16,
      width: 200,
      height: 82,
      zIndex: 10,
      config: {
        fontSizePt: 6.5,
      },
    }),
    mk({
      id: 'sb2-sum',
      type: 'text',
      x: 3,
      y: 100,
      width: 200,
      height: 5,
      zIndex: 25,
      repeatPerPage: true,
      config: {
        content: '总数：{{销售单.docTotalQty}} 件，总金额：{{销售单.docTotalAmount}} 元',
        fontSizePt: 8,
        fontWeight: 'bold',
        textAlign: 'right',
        color: '#000000',
      },
    }),
    mk({
      id: 'sb2-bal-l',
      type: 'text',
      x: 3,
      y: 106,
      width: 62,
      height: 5,
      zIndex: 25,
      repeatPerPage: true,
      config: {
        content: '上次结余：{{销售单.previousBalance}} 元',
        fontSizePt: 6.5,
        fontWeight: 'normal',
        textAlign: 'left',
        color: '#000000',
      },
    }),
    mk({
      id: 'sb2-bal-c',
      type: 'text',
      x: 72,
      y: 106,
      width: 62,
      height: 5,
      zIndex: 25,
      repeatPerPage: true,
      config: {
        content: '本次欠款：{{销售单.currentDebt}} 元',
        fontSizePt: 6.5,
        fontWeight: 'normal',
        textAlign: 'center',
        color: '#000000',
      },
    }),
    mk({
      id: 'sb2-bal-r',
      type: 'text',
      x: 141,
      y: 106,
      width: 62,
      height: 5,
      zIndex: 25,
      repeatPerPage: true,
      config: {
        content: '累计欠款：{{销售单.accumulatedDebt}} 元',
        fontSizePt: 6.5,
        fontWeight: 'normal',
        textAlign: 'right',
        color: '#000000',
      },
    }),
  ];

  return {
    id: BUILTIN_SALES_BILL_PRINT_TEMPLATE_ID,
    name: '销售单（标准·二等分）',
    documentType: 'salesBill' as const,
    paperSize: { ...PRINT_PAPER_A4_HALF_MM },
    paperMarginsMm: { top: 2, bottom: 2, left: 2, right: 2 },
    paperBackgroundColor: '#FFFFFF',
    elements,
    createdAt: t,
    updatedAt: t,
  };
}

export function ensureBuiltinSalesBillPrintTemplate(list: PrintTemplate[]): PrintTemplate[] {
  if (list.some(t => t.id === BUILTIN_SALES_BILL_PRINT_TEMPLATE_ID)) return list;
  return [...list, createBuiltinSalesBillPrintTemplate()];
}
