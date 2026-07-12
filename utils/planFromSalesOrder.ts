import type { PlanItem, PlanOrder, PsiRecord } from '../types';
import { PLAN_CUSTOM_DATA_SOURCE_SALES_ORDER_DOC_NUMBER, PlanStatus } from '../types';
import type { PlanFormSettings } from '../types';
import {
  buildSalesOrderLinesFromPsiRecords,
  type SalesOrderLineInput,
} from './buildSalesOrderPrintContext';
import { flowRecordsEarliestMs } from './flowDocSort';

export type PlanDraftFromSalesOrder = {
  productId: string;
  customer: string;
  variantQuantities: Record<string, number>;
  singleQuantity: number;
  items: PlanItem[];
  customData: Record<string, string>;
};

function salesOrderLineToPlanItems(line: SalesOrderLineInput): PlanItem[] {
  const vq = line.variantQuantities;
  if (vq && Object.keys(vq).length > 0) {
    return Object.entries(vq)
      .filter(([, qty]) => (Number(qty) || 0) > 0)
      .map(([variantId, quantity]) => ({ variantId, quantity: Number(quantity) || 0 }));
  }
  const qty = Number(line.quantity) || 0;
  if (qty > 0) return [{ quantity: qty }];
  return [];
}

/** 按单号聚合销售订单 PSI 行 */
export function groupSalesOrdersByDocNumber(records: PsiRecord[]): Map<string, PsiRecord[]> {
  const map = new Map<string, PsiRecord[]>();
  for (const r of records) {
    if (r.type !== 'SALES_ORDER') continue;
    const key = String(r.docNumber ?? '').trim();
    if (!key) continue;
    const arr = map.get(key) ?? [];
    arr.push(r);
    map.set(key, arr);
  }
  return map;
}

/** 与进销存销售订单列表一致：按单据生成时刻倒序，新单在前 */
function compareSalesOrderDocsByCreatedDesc(
  a: [string, PsiRecord[]],
  b: [string, PsiRecord[]],
): number {
  const ma = flowRecordsEarliestMs(a[1]);
  const mb = flowRecordsEarliestMs(b[1]);
  const ha = ma > 0;
  const hb = mb > 0;
  if (ha !== hb) return ha ? -1 : 1;
  if (ha && hb && mb !== ma) return mb - ma;
  return (b[0] || '').localeCompare(a[0] || '');
}

/** 计划单上记录的来源销售订单单号（无则空串） */
export function getPlanSourceSalesOrderDocNumber(
  plan: Pick<PlanOrder, 'customData'>,
): string {
  return String(plan.customData?.[PLAN_CUSTOM_DATA_SOURCE_SALES_ORDER_DOC_NUMBER] ?? '').trim();
}

/** 新建计划引用销售订单时是否带入客户：表单配置开启「客户」且非产品关联模式 */
export function shouldImportCustomerFromSalesOrder(
  planFormSettings: Pick<PlanFormSettings, 'standardFields'>,
  productionLinkMode: 'order' | 'product' = 'order',
): boolean {
  return (
    productionLinkMode !== 'product' &&
    planFormSettings.standardFields.find(f => f.id === 'customer')?.showInCreate === true
  );
}

/** 销售订单单号 + 产品 id，用于引用去重与反向查计划 */
export function salesOrderProductKey(docNumber: string, productId: string): string {
  return `${docNumber.trim()}|${productId.trim()}`;
}

/** 由销售订单引用生成的计划：按「单号|产品」索引（同键仅保留一条，与引用去重口径一致） */
export function buildReferencedPlanBySalesOrderProductKey(plans: PlanOrder[]): Map<string, PlanOrder> {
  const map = new Map<string, PlanOrder>();
  for (const plan of plans) {
    const docNumber = getPlanSourceSalesOrderDocNumber(plan);
    const productId = String(plan.productId ?? '').trim();
    if (!docNumber || !productId) continue;
    map.set(salesOrderProductKey(docNumber, productId), plan);
  }
  return map;
}

export function resolveReferencedPlanForSalesOrderLine(
  docNumber: string,
  productId: string,
  planByKey: Map<string, PlanOrder>,
): PlanOrder | undefined {
  const key = salesOrderProductKey(docNumber, productId);
  return planByKey.get(key);
}

/** 已引用计划是否已下达工单（与计划列表操作区口径一致） */
export function isReferencedPlanConvertedToOrder(plan: PlanOrder): boolean {
  return plan.status === PlanStatus.CONVERTED;
}

/** 已有计划引用过的「销售订单单号 + 产品」组合 */
export function buildUsedSalesOrderProductKeys(plans: PlanOrder[]): Set<string> {
  const used = new Set<string>();
  for (const plan of plans) {
    const docNumber = String(
      plan.customData?.[PLAN_CUSTOM_DATA_SOURCE_SALES_ORDER_DOC_NUMBER] ?? '',
    ).trim();
    const productId = String(plan.productId ?? '').trim();
    if (!docNumber || !productId) continue;
    used.add(salesOrderProductKey(docNumber, productId));
  }
  return used;
}

function lineAlreadyPlanned(
  docNumber: string,
  line: SalesOrderLineInput,
  usedKeys: Set<string>,
): boolean {
  return usedKeys.has(salesOrderProductKey(docNumber, line.productId));
}

/** 仍有未配货数量的销售订单（按单号，新单在前）；已建计划的产品行不再展示 */
export function listPendingSalesOrdersForPlan(
  records: PsiRecord[],
  plans: PlanOrder[] = [],
): Array<[string, PsiRecord[]]> {
  const usedKeys = buildUsedSalesOrderProductKeys(plans);
  const byDoc = groupSalesOrdersByDocNumber(records);
  return Array.from(byDoc.entries())
    .filter(([docNumber, items]) => {
      const lines = salesOrderLinesForPlan(items, usedKeys);
      return lines.length > 0;
    })
    .sort(compareSalesOrderDocsByCreatedDesc);
}

/** 单张销售订单下可用于建计划的明细行（未配货口径，排除已引用产品） */
export function salesOrderLinesForPlan(
  docItems: PsiRecord[],
  usedKeys: Set<string> = new Set(),
): SalesOrderLineInput[] {
  const docNumber = String(docItems[0]?.docNumber ?? '').trim();
  if (!docNumber) return [];
  return buildSalesOrderLinesFromPsiRecords(docItems, { onlyUnshipped: true }).filter(
    line => !lineAlreadyPlanned(docNumber, line, usedKeys),
  );
}

export function buildPlanDraftFromSalesOrder(params: {
  docNumber: string;
  docItems: PsiRecord[];
  lineId: string;
  /** 为 false 时不写入 customer（表单未开启客户展示时） */
  importCustomer?: boolean;
}): PlanDraftFromSalesOrder | null {
  const partner = String(params.docItems[0]?.partner ?? '').trim();
  const importCustomer = params.importCustomer !== false;
  const line = salesOrderLinesForPlan(params.docItems).find(l => l.id === params.lineId);
  if (!line) return null;
  const items = salesOrderLineToPlanItems(line);
  if (items.length === 0) return null;

  const variantQuantities: Record<string, number> = {};
  let singleQuantity = 0;
  if (line.variantQuantities && Object.keys(line.variantQuantities).length > 0) {
    for (const [vid, qty] of Object.entries(line.variantQuantities)) {
      const q = Number(qty) || 0;
      if (q > 0) variantQuantities[vid] = q;
    }
  } else {
    singleQuantity = Number(line.quantity) || 0;
  }

  return {
    productId: line.productId,
    customer: importCustomer ? partner : '',
    variantQuantities,
    singleQuantity,
    items,
    customData: {
      [PLAN_CUSTOM_DATA_SOURCE_SALES_ORDER_DOC_NUMBER]: params.docNumber,
    },
  };
}

/** 销售订单列表搜索：单号、客户、行内品名/SKU */
export function salesOrderDocMatchesPlanSearch(
  docNumber: string,
  docItems: PsiRecord[],
  keyword: string,
  productNameById: Map<string, { name?: string; sku?: string }>,
): boolean {
  const q = keyword.trim().toLowerCase();
  if (!q) return true;
  const parts: string[] = [docNumber];
  const main = docItems[0];
  if (main?.partner) parts.push(String(main.partner));
  for (const r of docItems) {
    const p = productNameById.get(r.productId);
    parts.push(p?.name ?? '', p?.sku ?? '', String(r.quantity ?? ''));
  }
  return parts.filter(Boolean).join('\0').toLowerCase().includes(q);
}
