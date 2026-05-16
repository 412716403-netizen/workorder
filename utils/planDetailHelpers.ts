/**
 * PlanDetailPanel 用到的纯函数工具 (Phase 3.4 抽离)。
 *
 * 这些函数原本在 PlanDetailPanel.tsx 文件顶层，无 React 依赖，
 * 抽出后可独立单测。
 */
import type { Product, Partner } from '../types';
import {
  PSI_PO_CUSTOM_DATA_SOURCE_PLAN_ID,
  PSI_PO_CUSTOM_DATA_SOURCE_PLAN_NUMBER,
} from '../types';
import { toLocalDateYmd } from './localDateTime';

/** 计划单创建日期在列表里只显示 yyyy-mm-dd，跨时区时用 toLocalDateYmd 折算后取前 10 位 */
export function formatPlanCreatedDateList(created: string | undefined | null): string {
  if (!created) return '';
  return toLocalDateYmd(created) || String(created).trim().slice(0, 10);
}

/**
 * 产品档案上的默认供应商 id 是否在合作单位列表中有效。
 * - product 无 supplierId → null
 * - supplierId 不在 partners 内 → null
 * - 命中 → 返回该 id
 */
export function effectiveSupplierIdFromProduct(
  product: Product | undefined,
  partners: ReadonlyArray<Partner>,
): string | null {
  const sid = product?.supplierId;
  if (sid == null || sid === '') return null;
  return partners.some(p => p.id === sid) ? sid : null;
}

/** 采购订单是否属于当前计划面板（含子计划视角下的祖先单号、历史 note 匹配） */
export function purchaseOrderRecordMatchesPlanPanel(
  r: {
    type?: string;
    note?: string | null;
    productId?: string;
    customData?: Record<string, unknown> | null;
  } | null | undefined,
  planNumbersForPO: ReadonlyArray<string>,
  viewPlan: { id: string; planNumber: string } | null | undefined,
): boolean {
  if (!r || r.type !== 'PURCHASE_ORDER' || !r.productId || !viewPlan) return false;
  const cd = r.customData && typeof r.customData === 'object'
    ? (r.customData as Record<string, unknown>)
    : {};
  if (String(cd[PSI_PO_CUSTOM_DATA_SOURCE_PLAN_ID] ?? '').trim() === viewPlan.id) return true;
  const sn = String(cd[PSI_PO_CUSTOM_DATA_SOURCE_PLAN_NUMBER] ?? '').trim();
  if (sn && planNumbersForPO.includes(sn)) return true;
  return planNumbersForPO.some(planNum => String(r.note || '').includes(`计划单[${planNum}]`));
}
