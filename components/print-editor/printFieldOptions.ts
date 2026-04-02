import type { PlanFormFieldConfig } from '../../types';

export interface PrintFieldOption {
  value: string;
  label: string;
  group: string;
}

/** 插入到模板中的占位片段（含花括号） */
export function wrapFieldPlaceholder(path: string, style: 'mustache' | 'dollar' = 'mustache'): string {
  const p = path.trim();
  return style === 'mustache' ? `{{${p}}}` : `\${${p}}`;
}

export function buildPrintFieldOptions(planCustomFields: PlanFormFieldConfig[]): PrintFieldOption[] {
  const system: PrintFieldOption[] = [
    { group: '系统', value: '系统.systemTime', label: '当前时间' },
    { group: '系统', value: '系统.pageCurrent', label: '当前页码' },
    { group: '系统', value: '系统.pageTotal', label: '总页数' },
  ];
  const plan: PrintFieldOption[] = [
    { group: '计划', value: '计划.planNumber', label: '计划单号' },
    { group: '计划', value: '计划.customer', label: '客户' },
    { group: '计划', value: '计划.dueDate', label: '交期' },
    { group: '计划', value: '计划.startDate', label: '开始日期' },
    { group: '计划', value: '计划.priority', label: '优先级' },
    { group: '计划', value: '计划.status', label: '计划状态' },
    { group: '计划', value: '计划.createdAt', label: '添加日期' },
  ];
  const order: PrintFieldOption[] = [
    { group: '工单', value: '工单.orderNumber', label: '工单编号' },
    { group: '工单', value: '工单.id', label: '工单ID' },
    { group: '工单', value: '工单.customer', label: '客户' },
    { group: '工单', value: '工单.dueDate', label: '交期' },
    { group: '工单', value: '工单.startDate', label: '开始日期' },
    { group: '工单', value: '工单.priority', label: '优先级' },
    { group: '工单', value: '工单.status', label: '工单状态' },
    { group: '工单', value: '工单.productName', label: '产品名称' },
    { group: '工单', value: '工单.sku', label: 'SKU' },
    { group: '工单', value: '工单.createdAt', label: '创建日期' },
  ];
  const product: PrintFieldOption[] = [
    { group: '产品', value: '产品.name', label: '产品名称' },
    { group: '产品', value: '产品.sku', label: 'SKU' },
    { group: '产品', value: '产品.imageUrl', label: '产品主图' },
    { group: '产品', value: '产品.description', label: '描述' },
  ];
  const proc: PrintFieldOption[] = [
    { group: '工序', value: '工序.name', label: '工序名称' },
    { group: '工序', value: '工序.completedQuantity', label: '完成数量' },
  ];
  const listRow: PrintFieldOption[] = [
    { group: '明细行', value: '行.index', label: '行序号（从 1）' },
    { group: '明细行', value: '行.quantity', label: '数量（工单行）' },
    { group: '明细行', value: '行.completedQuantity', label: '完成数量（工单行）' },
    { group: '明细行', value: '行.variantId', label: '规格 variantId' },
  ];
  const customPlan: PrintFieldOption[] = planCustomFields.map(f => ({
    group: '计划自定义',
    value: `计划.custom.${f.id}`,
    label: f.label,
  }));
  return [...system, ...plan, ...order, ...product, ...proc, ...listRow, ...customPlan];
}
