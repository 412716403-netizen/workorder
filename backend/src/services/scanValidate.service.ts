/**
 * 扫码二次校验服务：报工/入库/返工/外协等扫码入口在写入前统一调用，
 *
 * 两类校验：
 *   1) 持久化去重：根据 `purpose` 选定作用域表/键，若已存在同 itemCodeId / virtualBatchId
 *      → DUPLICATE_SAVED（同一码不可在同一工序/单据上反复扫入）。
 *   2) 单据上限：若 `currentQty + addQty > maxQty` → EXCEEDS_MAX（拒绝扫入，不静默截断）。
 *
 * 路由 `POST /item-codes/scan/validate-usage` 给前端做预校验；
 * 写入路径（createReport / createProductReport / createRecord）调用同一 `assertScanNotAlreadyUsed`
 * 兜底，避免绕过前端直接打接口造成重复写入。
 */
import { prisma as basePrisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

export type ScanValidatePurpose =
  | 'MILESTONE_REPORT'
  | 'PRODUCT_REPORT'
  | 'STOCK_IN'
  | 'REWORK_REPORT'
  | 'OUTSOURCE_RECEIVE';

export interface ScanValidateScope {
  /** MILESTONE_REPORT */
  milestoneId?: string;
  /** PRODUCT_REPORT */
  productId?: string;
  milestoneTemplateId?: string;
  variantId?: string | null;
  /** STOCK_IN */
  orderId?: string;
  orderIds?: string[];
  /** REWORK_REPORT */
  sourceReworkId?: string;
  nodeId?: string;
  /** OUTSOURCE_RECEIVE */
  partner?: string;
  docNo?: string;
  /** 通用 */
  excludeRecordId?: string;
}

export interface ScanValidateRequest {
  purpose: ScanValidatePurpose;
  scope: ScanValidateScope;
  itemCodeId?: string | null;
  virtualBatchId?: string | null;
  currentQty?: number;
  addQty?: number;
  maxQty?: number;
}

export type ScanValidateCode = 'ALLOWED' | 'DUPLICATE_SAVED' | 'EXCEEDS_MAX';

export interface ScanValidateResponse {
  code: ScanValidateCode;
  message?: string;
  /** EXCEEDS_MAX 时回写允许的剩余可填数 (maxQty - currentQty, 不会为负) */
  remaining?: number;
}

const DUPLICATE_MSG_BY_PURPOSE: Record<ScanValidatePurpose, string> = {
  MILESTONE_REPORT: '该码在本工序已报工，不可重复扫码',
  PRODUCT_REPORT: '该码在本工序已报工，不可重复扫码',
  STOCK_IN: '该码已在本单入库，不可重复扫码',
  REWORK_REPORT: '该码已在本返工流程报工，不可重复扫码',
  OUTSOURCE_RECEIVE: '该码已在本单收货，不可重复扫码',
};

function nonEmpty(s: string | null | undefined): s is string {
  return typeof s === 'string' && s.length > 0;
}

/**
 * 构造去重 OR 过滤：
 * - 命中 itemCodeId / virtualBatchId 自身；
 * - **关键增强**：当传入 virtualBatchId（批次扫码）时，把该批次包含的所有单品
 *   itemCodeId 反向 IN 进 OR — 处理历史/异常路径中"单品记录未写 virtualBatchId"
 *   导致的"扫了单品再扫整批仍允许通过"的漏洞；
 * - 同理传入 itemCodeId（单品扫码）时已通过同批次的 virtualBatchId 兜住"先扫单品、
 *   再扫整批"的情形（前端调用方会同时传父批次的 virtualBatchId）。
 *
 * `tenantId` 仅用于反查 itemCode 时限制租户，不污染外层 where 的 tenantId 条件。
 */
async function buildDupIdsFilter(
  tenantId: string,
  itemCodeId?: string | null,
  virtualBatchId?: string | null,
): Promise<Record<string, unknown> | null> {
  const or: Array<Record<string, unknown>> = [];
  if (nonEmpty(itemCodeId)) or.push({ itemCodeId });
  if (nonEmpty(virtualBatchId)) {
    or.push({ virtualBatchId });
    const itemsOfBatch = await basePrisma.itemCode.findMany({
      where: { tenantId, batchId: virtualBatchId },
      select: { id: true },
    });
    if (itemsOfBatch.length > 0) {
      or.push({ itemCodeId: { in: itemsOfBatch.map((i) => i.id) } });
    }
  }
  return or.length ? { OR: or } : null;
}

/**
 * 查持久化去重：返回首条命中的记录 id（命中即 DUPLICATE_SAVED）。
 *
 * 关键点：
 * - 用 `basePrisma`（不走 tenant 代理），但所有 where 都带 `tenantId`，保证不会跨租户命中。
 * - `excludeRecordId` 用于编辑场景（更新自身记录不算重复）。
 */
async function findDuplicate(
  tenantId: string,
  req: ScanValidateRequest,
): Promise<string | null> {
  const idsFilter = await buildDupIdsFilter(tenantId, req.itemCodeId, req.virtualBatchId);
  if (!idsFilter) return null;

  const { purpose, scope } = req;
  switch (purpose) {
    case 'MILESTONE_REPORT': {
      if (!nonEmpty(scope.milestoneId)) return null;
      const hit = await basePrisma.milestoneReport.findFirst({
        where: {
          milestoneId: scope.milestoneId,
          milestone: { productionOrder: { tenantId } },
          ...(scope.excludeRecordId ? { id: { not: scope.excludeRecordId } } : {}),
          ...idsFilter,
        },
        select: { id: true },
      });
      return hit?.id ?? null;
    }
    case 'PRODUCT_REPORT': {
      if (!nonEmpty(scope.productId) || !nonEmpty(scope.milestoneTemplateId)) return null;
      const progresses = await basePrisma.productMilestoneProgress.findMany({
        where: {
          tenantId,
          productId: scope.productId,
          milestoneTemplateId: scope.milestoneTemplateId,
          ...(scope.variantId !== undefined
            ? { variantId: scope.variantId === null ? null : scope.variantId }
            : {}),
        },
        select: { id: true },
      });
      if (progresses.length === 0) return null;
      const hit = await basePrisma.productProgressReport.findFirst({
        where: {
          progressId: { in: progresses.map((p) => p.id) },
          ...(scope.excludeRecordId ? { id: { not: scope.excludeRecordId } } : {}),
          ...idsFilter,
        },
        select: { id: true },
      });
      return hit?.id ?? null;
    }
    case 'STOCK_IN': {
      const orderIds = (scope.orderIds ?? []).filter(nonEmpty);
      if (nonEmpty(scope.orderId)) orderIds.push(scope.orderId);
      if (orderIds.length === 0) return null;
      const hit = await basePrisma.productionOpRecord.findFirst({
        where: {
          tenantId,
          type: 'STOCK_IN',
          orderId: { in: [...new Set(orderIds)] },
          ...(scope.excludeRecordId ? { id: { not: scope.excludeRecordId } } : {}),
          ...idsFilter,
        },
        select: { id: true },
      });
      return hit?.id ?? null;
    }
    case 'REWORK_REPORT': {
      const where: Record<string, unknown> = {
        tenantId,
        type: 'REWORK_REPORT',
        ...(scope.excludeRecordId ? { id: { not: scope.excludeRecordId } } : {}),
        ...idsFilter,
      };
      if (nonEmpty(scope.sourceReworkId)) where.sourceReworkId = scope.sourceReworkId;
      if (nonEmpty(scope.nodeId)) where.nodeId = scope.nodeId;
      const orderIds = (scope.orderIds ?? []).filter(nonEmpty);
      if (nonEmpty(scope.orderId)) orderIds.push(scope.orderId);
      if (orderIds.length > 0) where.orderId = { in: [...new Set(orderIds)] };
      // sourceReworkId / nodeId / orderId 三者中至少一个明确，避免误判全租户重复
      if (!where.sourceReworkId && !where.nodeId && !where.orderId) return null;
      const hit = await basePrisma.productionOpRecord.findFirst({
        where,
        select: { id: true },
      });
      return hit?.id ?? null;
    }
    case 'OUTSOURCE_RECEIVE': {
      const orderIds = (scope.orderIds ?? []).filter(nonEmpty);
      if (nonEmpty(scope.orderId)) orderIds.push(scope.orderId);
      const where: Record<string, unknown> = {
        tenantId,
        type: 'OUTSOURCE',
        status: '已收回',
        sourceReworkId: null,
        ...(scope.excludeRecordId ? { id: { not: scope.excludeRecordId } } : {}),
        ...idsFilter,
      };
      if (orderIds.length > 0) where.orderId = { in: [...new Set(orderIds)] };
      else if (nonEmpty(scope.productId)) where.productId = scope.productId;
      if (nonEmpty(scope.partner)) where.partner = scope.partner;
      if (nonEmpty(scope.docNo)) where.docNo = scope.docNo;
      const hit = await basePrisma.productionOpRecord.findFirst({
        where,
        select: { id: true },
      });
      return hit?.id ?? null;
    }
    default:
      return null;
  }
}

/**
 * 数量上限校验：仅在前端确实传了 `maxQty` 且数值有效时生效。
 * - addQty/currentQty 缺省按 0 处理；
 * - 校验式：`currentQty + addQty > maxQty` → EXCEEDS_MAX。
 */
function checkExceedsMax(req: ScanValidateRequest): ScanValidateResponse | null {
  const max = Number(req.maxQty);
  if (!Number.isFinite(max) || max < 0) return null;
  const cur = Math.max(0, Number(req.currentQty) || 0);
  const add = Math.max(0, Number(req.addQty) || 0);
  if (cur + add <= max) return null;
  const remaining = Math.max(0, max - cur);
  return {
    code: 'EXCEEDS_MAX',
    remaining,
    message: `本次扫入 ${add} 件 + 已填 ${cur} 件 已超过最大可填 ${max} 件，仅可再加 ${remaining} 件`,
  };
}

export async function validateScanUsage(
  tenantId: string,
  req: ScanValidateRequest,
): Promise<ScanValidateResponse> {
  const dupId = await findDuplicate(tenantId, req);
  if (dupId) {
    return {
      code: 'DUPLICATE_SAVED',
      message: DUPLICATE_MSG_BY_PURPOSE[req.purpose] ?? '该码已被使用，不可重复扫码',
    };
  }
  const overflow = checkExceedsMax(req);
  if (overflow) return overflow;
  return { code: 'ALLOWED' };
}

/**
 * 写入兜底（防绕过前端）：仅做去重判断；不做 max 校验（既有
 * `enforceReportQuantity` 已覆盖且受系统设置 `allowExceedMaxReportQty` 控制）。
 */
export async function assertScanNotAlreadyUsed(
  tenantId: string,
  purpose: ScanValidatePurpose,
  scope: ScanValidateScope,
  ids: { itemCodeId?: string | null; virtualBatchId?: string | null },
): Promise<void> {
  if (!nonEmpty(ids.itemCodeId) && !nonEmpty(ids.virtualBatchId)) return;
  const dup = await findDuplicate(tenantId, {
    purpose,
    scope,
    itemCodeId: ids.itemCodeId,
    virtualBatchId: ids.virtualBatchId,
  });
  if (dup) {
    throw new AppError(409, DUPLICATE_MSG_BY_PURPOSE[purpose] ?? '该码已被使用，不可重复扫码');
  }
}
