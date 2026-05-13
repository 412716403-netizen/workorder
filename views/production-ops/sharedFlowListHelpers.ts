/**
 * Phase 3.E：流水弹窗共享数据获取工具。
 *
 * 设计原则：
 * - 默认时间窗口为「当天」（本地零点 ~ 次日零点 ISO）。
 * - 服务端分页 200/页，循环直到拉完该日期窗口内全部数据；
 *   不再像 ProductionMgmtOpsView 旧版那样设 60 页 / 12000 条硬上限。
 * - 「无硬上限」的前提是调用方必须传 startDate/endDate 或业务作用域条件
 *   （orderIds / status 等）将数据收窄；helper 内部在循环 > 20 页时打 warn 提醒。
 */

import { production as productionApi, psi as psiApi } from '../../services/api';
import { normalizeDecimals } from '../../contexts/formSettingsDefaults';
import type { Partner, ProductionOpRecord, PsiRecord } from '../../types';
import { partnerListNoToSegment, nextOutsourceDocNumber, type OutsourceDocKind } from '../../utils/partnerDocNumber';
import { fetchAllPages, type PaginatedLike } from '../../utils/fetchAllPages';

const FLOW_FETCH_PAGE_SIZE = 200;
/** 单次窄拉允许的最大页数；超过即 break + warn 提醒调用方收紧 filter。 */
const FLOW_FETCH_MAX_PAGES = 60;

/** 本地零点 ~ 次日零点的 ISO 字符串区间。 */
export function getTodayRangeIso(): { from: string; to: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

/** 把 'YYYY-MM-DD' 字符串补成 ISO（startOfDay）。空字符串返回 undefined。 */
export function dateInputToIsoStart(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/** 把 'YYYY-MM-DD' 字符串补成 ISO（次日零点，作为半开区间右端）。空字符串返回 undefined。 */
export function dateInputToIsoEndExclusive(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return undefined;
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

/** 本地日期 -> 'YYYY-MM-DD'。 */
export function isoToDateInput(iso: string | undefined | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface ProductionFlowFilter {
  types?: string;
  type?: string;
  orderIds?: string;
  productIds?: string;
  /** 关联产品模式领退料：按"成品" sourceProductId 收口（逗号分隔） */
  sourceProductIds?: string;
  partner?: string;
  status?: string;
  docNo?: string;
  workerId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * 按 filter 从后端窄拉全部 production 记录。
 * 调用方需保证已传入日期窗口或业务作用域，否则可能拉回大量数据
 * （超过 FLOW_FETCH_MAX_PAGES × FLOW_FETCH_PAGE_SIZE 会 break 并 console.warn）。
 */
export async function fetchProductionByFilter(
  filter: ProductionFlowFilter,
): Promise<ProductionOpRecord[]> {
  const all = await fetchAllPages<ProductionOpRecord>(
    page => {
      const params: Record<string, string> = {
        page: String(page),
        pageSize: String(FLOW_FETCH_PAGE_SIZE),
      };
      if (filter.types) params.types = filter.types;
      else if (filter.type) params.type = filter.type;
      if (filter.orderIds) params.orderIds = filter.orderIds;
      if (filter.productIds) params.productIds = filter.productIds;
      if (filter.sourceProductIds) params.sourceProductIds = filter.sourceProductIds;
      if (filter.partner) params.partner = filter.partner;
      if (filter.status) params.status = filter.status;
      if (filter.docNo) params.docNo = filter.docNo;
      if (filter.workerId) params.workerId = filter.workerId;
      if (filter.search) params.search = filter.search;
      if (filter.startDate) params.startDate = filter.startDate;
      if (filter.endDate) params.endDate = filter.endDate;
      return productionApi.listPage(params) as Promise<
        ProductionOpRecord[] | PaginatedLike<ProductionOpRecord>
      >;
    },
    { maxPages: FLOW_FETCH_MAX_PAGES, warnTag: 'fetchProductionByFilter' },
  );
  return normalizeDecimals(all);
}

export interface PsiFlowFilter {
  type?: string;
  types?: string;
  productId?: string;
  docNumber?: string;
  partnerId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export async function fetchPsiByFilter(filter: PsiFlowFilter): Promise<PsiRecord[]> {
  const all = await fetchAllPages<PsiRecord>(
    page => {
      const params: Record<string, string> = {
        page: String(page),
        pageSize: String(FLOW_FETCH_PAGE_SIZE),
      };
      if (filter.types) params.types = filter.types;
      else if (filter.type) params.type = filter.type;
      if (filter.productId) params.productId = filter.productId;
      if (filter.docNumber) params.docNumber = filter.docNumber;
      if (filter.partnerId) params.partnerId = filter.partnerId;
      if (filter.startDate) params.startDate = filter.startDate;
      if (filter.endDate) params.endDate = filter.endDate;
      if (filter.search) params.search = filter.search;
      return psiApi.listPaginated(params) as Promise<PsiRecord[] | PaginatedLike<PsiRecord>>;
    },
    { maxPages: FLOW_FETCH_MAX_PAGES, warnTag: 'fetchPsiByFilter' },
  );
  return normalizeDecimals(all as never[]) as unknown as PsiRecord[];
}

/**
 * 外协单号取号：把「当前面板 records」与按单号前缀从后端窄拉的结果合并，
 * 避免窄查询漏掉历史 WX/WR 导致序号从 001 重来。
 */
export async function resolveOutsourceNumberingRecords(
  kind: OutsourceDocKind,
  partners: Partner[],
  partnerName: string,
  localRecords: ProductionOpRecord[],
): Promise<ProductionOpRecord[]> {
  const seg = partnerListNoToSegment(partners, '', partnerName.trim()) ?? '0000';
  const prefix = kind === 'receive' ? `WR-${seg}-` : `WX-${seg}-`;
  let remote: ProductionOpRecord[] = [];
  try {
    remote = await fetchProductionByFilter({ type: 'OUTSOURCE', search: prefix });
  } catch {
    remote = [];
  }
  if (remote.length === 0) return localRecords;
  const byId = new Map(localRecords.map(r => [r.id, r]));
  for (const r of remote) {
    if (r?.id) byId.set(r.id, r);
  }
  return Array.from(byId.values());
}

export async function nextOutsourceDocNumberResolved(
  kind: OutsourceDocKind,
  partners: Partner[],
  records: ProductionOpRecord[],
  partnerId: string,
  partnerName: string,
): Promise<string> {
  const merged = await resolveOutsourceNumberingRecords(kind, partners, partnerName, records);
  return nextOutsourceDocNumber(kind, partners, merged, partnerId, partnerName);
}
