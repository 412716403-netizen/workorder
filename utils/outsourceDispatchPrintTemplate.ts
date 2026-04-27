import type { PrintBodyElement, PrintDynamicListElementConfig, PrintTemplate } from '../types';
import { newElementId, newPrintTemplateId } from './printTemplateDefaults';

/** 针式二等分常用幅面，与纸张预设「241×140 mm（二等分）」一致 */
export const PRINT_PAPER_OUTSOURCE_DISPATCH_HALF_MM = { widthMm: 241, heightMm: 140 } as const;

function nowIso() {
  return new Date().toISOString();
}

function outsourceDispatchDynamicListConfig(): PrintDynamicListElementConfig {
  return {
    dataColumnCount: 6,
    showHeader: true,
    showSerial: true,
    serialHeaderLabel: '序号',
    borderStyle: 'solid',
    borderColor: '#000000',
    headerBackgroundColor: '#FFFFFF',
    headerFontSizePt: 6.5,
    fontSizePt: 6.5,
    columns: [
      { id: 'od-col-sku', headerLabel: '货号', contentTemplate: '{{行.sku}}', textAlign: 'center', color: '#000000' },
      { id: 'od-col-name', headerLabel: '名称', contentTemplate: '{{行.productName}}', textAlign: 'center', color: '#000000' },
      {
        id: 'od-col-matrix',
        headerLabel: '颜色',
        contentTemplate: '',
        textAlign: 'center',
        color: '#000000',
        cellKind: 'colorSizeMatrix',
        matrixColorHeader: '颜色',
        matrixSizeGroupTitle: '尺码数量',
      },
      { id: 'od-col-node', headerLabel: '工序', contentTemplate: '{{行.nodeName}}', textAlign: 'center', color: '#000000' },
      { id: 'od-col-qty', headerLabel: '数量', contentTemplate: '{{行.quantity}} 件', textAlign: 'center', color: '#000000' },
      { id: 'od-col-rmk', headerLabel: '备注', contentTemplate: '{{行.remark}}', textAlign: 'center', color: '#000000' },
    ],
  };
}

/**
 * 外协发出：241×140 二等分 + 明细动态列表（含颜色×尺码矩阵）。
 * 标题建议写 `{{租户.name}}外协发出单`（租户名由打印上下文 `tenantName` 注入）。
 */
export function createBuiltinOutsourceDispatchPrintTemplate(): PrintTemplate {
  const t = nowIso();
  const mk = (partial: Omit<PrintBodyElement, 'id'> & { id?: string }): PrintBodyElement =>
    ({
      id: partial.id ?? newElementId(),
      ...partial,
    }) as PrintBodyElement;

  const elements: PrintBodyElement[] = [
    mk({
      id: 'od-title',
      type: 'text',
      x: 12,
      y: 2.5,
      width: 217,
      height: 8,
      zIndex: 30,
      repeatPerPage: true,
      config: {
        content: '{{租户.name}}外协发出单',
        fontSizePt: 13,
        fontWeight: 'bold',
        textAlign: 'center',
        color: '#000000',
      },
    }),
    mk({
      id: 'od-meta',
      type: 'text',
      x: 168,
      y: 2,
      width: 69,
      height: 18,
      zIndex: 30,
      repeatPerPage: true,
      config: {
        content:
          '{{系统.pageCurrent}}/{{系统.pageTotal}} 页\n{{外协发出.timestamp}}\nNO: {{外协发出.docNo}}\n外协工厂：{{外协发出.partner}}',
        fontSizePt: 7,
        fontWeight: 'normal',
        textAlign: 'right',
        color: '#000000',
      },
    }),
    mk({
      id: 'od-sub',
      type: 'text',
      x: 6,
      y: 11.5,
      width: 229,
      height: 4,
      zIndex: 28,
      repeatPerPage: true,
      config: {
        content: '经办：{{外协发出.operator}}　备注：{{外协发出.reason}}',
        fontSizePt: 7,
        fontWeight: 'normal',
        textAlign: 'left',
        color: '#000000',
      },
    }),
    mk({
      id: 'od-table',
      type: 'dynamicList',
      x: 4,
      y: 17,
      width: 233,
      height: 100,
      zIndex: 10,
      config: outsourceDispatchDynamicListConfig(),
    }),
    mk({
      id: 'od-sum',
      type: 'text',
      x: 4,
      y: 119,
      width: 233,
      height: 5,
      zIndex: 25,
      repeatPerPage: true,
      config: {
        content: '合计数量：{{外协发出.totalQty}} 件',
        fontSizePt: 8,
        fontWeight: 'bold',
        textAlign: 'right',
        color: '#000000',
      },
    }),
  ];

  return {
    id: newPrintTemplateId(),
    name: '外协发出单（二等分·矩阵）',
    documentType: 'outsource',
    paperSize: { ...PRINT_PAPER_OUTSOURCE_DISPATCH_HALF_MM },
    paperMarginsMm: { top: 2, bottom: 2, left: 2, right: 2 },
    paperBackgroundColor: '#FFFFFF',
    elements,
    createdAt: t,
    updatedAt: t,
  };
}
