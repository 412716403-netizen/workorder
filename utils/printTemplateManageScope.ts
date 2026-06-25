import type {
  PlanPrintTemplateManageScope,
  PrintTemplate,
  PrintTemplateDocumentType,
} from '../types';

export type { PlanPrintTemplateManageScope };

const SCOPE_DOCUMENT_TYPES: Record<PlanPrintTemplateManageScope, readonly PrintTemplateDocumentType[]> = {
  planList: ['plan'],
  planLabel: ['plan'],
  orderDetail: ['order'],
  reportBatchDetail: ['order'],
  stockInFlowDetail: ['order'],
  materialIssueFlowDetail: ['productionMaterial'],
  materialReturnFlowDetail: ['productionMaterial'],
  materialOutsourceIssueFlowDetail: ['productionMaterial'],
  materialOutsourceReturnFlowDetail: ['productionMaterial'],
  outsourceDispatchFlowDetail: ['outsource'],
  outsourceReceiveFlowDetail: ['outsource'],
  defectTreatmentFlowDetail: ['rework'],
  reworkReportFlowDetail: ['rework'],
  purchaseOrderList: ['purchaseOrder'],
  salesOrderList: ['salesOrder', 'salesOrderUnshipped'],
  purchaseBillList: ['purchaseBill'],
  salesBillList: ['salesBill'],
  receiptList: ['receipt'],
  paymentList: ['payment'],
};

/**
 * 同一 documentType 下多个「管理模版」入口：带 printTemplateManageScope 的仅出现在对应入口；
 * 未带该字段的历史模版仍可在组内各入口共用出现（可在目标入口「复制」生成带归属的副本）。
 */
const MANAGE_SCOPE_EXCLUSIVE_GROUPS: readonly (readonly PlanPrintTemplateManageScope[])[] = [
  ['planList', 'planLabel'],
  ['orderDetail', 'reportBatchDetail', 'stockInFlowDetail'],
  ['outsourceDispatchFlowDetail', 'outsourceReceiveFlowDetail'],
  ['defectTreatmentFlowDetail', 'reworkReportFlowDetail'],
  [
    'materialIssueFlowDetail',
    'materialReturnFlowDetail',
    'materialOutsourceIssueFlowDetail',
    'materialOutsourceReturnFlowDetail',
  ],
];

function exclusiveGroupForScope(scope: PlanPrintTemplateManageScope): readonly PlanPrintTemplateManageScope[] | null {
  for (const g of MANAGE_SCOPE_EXCLUSIVE_GROUPS) {
    if (g.includes(scope)) return g;
  }
  return null;
}

function passesManageScopeGate(t: PrintTemplate, scope: PlanPrintTemplateManageScope): boolean {
  const group = exclusiveGroupForScope(scope);
  if (!group) return true;
  const ms = t.printTemplateManageScope;
  if (ms == null) return true;
  return ms === scope;
}

/**
 * 新建模版时由「管理模版」入口带入：写入归属入口 + 对应数据源，便于列表过滤与字段分组。
 */
export function defaultPrintTemplateFieldsForManageScope(
  scope: PlanPrintTemplateManageScope,
): Pick<PrintTemplate, 'printTemplateManageScope' | 'documentType'> {
  const [documentType] = SCOPE_DOCUMENT_TYPES[scope];
  return { printTemplateManageScope: scope, documentType };
}

/**
 * 各业务「管理模版」弹窗左侧列表：数据源一致，且在同源多入口场景下 printTemplateManageScope 与当前入口一致（或未设置互斥字段的历史模版）。
 */
export function filterPrintTemplatesForManageScope(
  templates: PrintTemplate[],
  scope: PlanPrintTemplateManageScope,
): PrintTemplate[] {
  const allowed = SCOPE_DOCUMENT_TYPES[scope];
  return templates.filter(t => {
    if (t.documentType == null) {
      if (!passesManageScopeGate(t, scope)) return false;
      return true;
    }
    if (!allowed.includes(t.documentType)) return false;
    return passesManageScopeGate(t, scope);
  });
}

/**
 * 弹窗内仅展示过滤后的列表，但保存时必须写回「全量」列表，避免误删其他数据源模版。
 */
export function mergeScopedPrintTemplateListIntoFull(
  prevFull: PrintTemplate[],
  scopedNext: PrintTemplate[],
  scope: PlanPrintTemplateManageScope,
): PrintTemplate[] {
  const prevScoped = filterPrintTemplatesForManageScope(prevFull, scope);
  const prevScopedIds = new Set(prevScoped.map(t => t.id));
  const nextById = new Map(scopedNext.map(t => [t.id, t]));
  const nextIds = new Set(scopedNext.map(t => t.id));
  const deletedIds = new Set([...prevScopedIds].filter(id => !nextIds.has(id)));
  const merged: PrintTemplate[] = [];
  for (const t of prevFull) {
    if (deletedIds.has(t.id)) continue;
    if (nextById.has(t.id)) merged.push(nextById.get(t.id)!);
    else merged.push(t);
  }
  for (const t of scopedNext) {
    if (!prevFull.some(p => p.id === t.id)) merged.push(t);
  }
  return merged;
}
