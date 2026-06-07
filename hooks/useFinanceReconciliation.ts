import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  AppDictionaries,
  FinanceCategory,
  FinanceRecord,
  FinanceOpType,
  GlobalNodeTemplate,
  Partner,
  Product,
  ProductMilestoneProgress,
  ProductionOrder,
  ProductionOpRecord,
  PsiRecord,
  Worker,
} from '../types';
import { PSI_PURCHASE_BILL_LABEL } from '../shared/types';
import { toLocalDateYmd } from '../utils/localDateTime';
import { fetchAllPages, type PaginatedLike } from '../utils/fetchAllPages';
import {
  buildPartnerReconBalances,
  partnerReconOutsourceReceiveDocType,
  summarizePartnerReconBalances,
  type PartnerReconRow,
} from '../utils/partnerReconLedger';
import {
  buildPartnerProductLineReconList,
  filterPartnerProductReconList,
  type PartnerProductReconRow,
} from '../utils/partnerReconProductLedger';
import {
  buildSettlementReconBalances,
  buildSettlementReconList,
  computeSettlementOpeningBalance,
  filterSettlementReconListWithWorkerNames,
  summarizeSettlementReconBalances,
  type SettlementReconRow,
} from '../utils/settlementReconLedger';
import {
  buildSettlementProductLineReconList,
  filterSettlementProductReconList,
  type SettlementProductReconRow,
} from '../utils/settlementReconProductLedger';
import * as api from '../services/api';

export type { PartnerReconRow, PartnerProductReconRow, SettlementReconRow, SettlementProductReconRow };
export type PartnerReconViewMode = 'document' | 'product';
export type SettlementReconViewMode = PartnerReconViewMode;

/**
 * Phase 3.A：对账场景按 partner/worker + 日期范围窄拉后端数据，避免依赖
 * `AppDataContext` 中的全量 `psiRecords / prodRecords / financeRecords`。
 * 旧 props 保留作为兜底（短期向后兼容），后续可整体移除。
 *
 * Phase 3.E follow-up：所有对账 query 改为"客户端循环分页拉完"，
 * 避免旧版单页 500 条截断让大合作单位/工人的金额合计偏少（且 UI 无任何提示）。
 */
const RECON_STALE_MS = 30_000;
const RECON_PAGE_SIZE = 500;

function unwrapList<T>(resp: T[] | PaginatedLike<T> | null | undefined, fallback: T[]): T[] {
  if (!resp) return fallback;
  if (Array.isArray(resp)) return resp;
  if (Array.isArray(resp.data)) return resp.data;
  return fallback;
}


export interface UseFinanceReconciliationParams {
  type: FinanceOpType;
  records: FinanceRecord[];
  partners: Partner[];
  orders: ProductionOrder[];
  productMilestoneProgresses: ProductMilestoneProgress[];
  productMap: Map<string, Product>;
  workerMap: Map<string, Worker>;
  financeCatMap: Map<string, FinanceCategory>;
  globalNodes: GlobalNodeTemplate[];
  dictionaries: AppDictionaries;
  debouncedFinanceListSearch: string;
}

/**
 * Phase 3.D follow-up：删除 props 兜底分支
 *  - 不再接收 `allRecords / psiRecords / prodRecords` 三大全量数组；
 *  - 对账模式下统一以 `partnerPsiQuery / partnerProdQuery / partnerFinanceQuery / workerFinanceQuery / workerReworkProdQuery`
 *    的 react-query 结果为唯一数据源；非对账 tab（RECEIPT/PAYMENT）的列表展示与搜索由 `records` 提供。
 */
export function useFinanceReconciliation(p: UseFinanceReconciliationParams) {
  const {
    type,
    records,
    partners,
    orders,
    productMilestoneProgresses,
    productMap,
    workerMap,
    financeCatMap,
    globalNodes,
    dictionaries,
    debouncedFinanceListSearch,
  } = p;

  const [reconciliationSubTab, setReconciliationSubTab] = useState<'partner' | 'settlement'>('partner');
  const [reconDateFrom, setReconDateFrom] = useState('');
  const [reconDateTo, setReconDateTo] = useState('');
  const [reconPartnerId, setReconPartnerId] = useState('');
  const [reconWorkerId, setReconWorkerId] = useState('');
  const [reconQueryDateFrom, setReconQueryDateFrom] = useState('');
  const [reconQueryDateTo, setReconQueryDateTo] = useState('');
  const [reconQueryPartnerId, setReconQueryPartnerId] = useState('');
  const [reconQueryWorkerId, setReconQueryWorkerId] = useState('');
  const [partnerReconViewMode, setPartnerReconViewMode] = useState<PartnerReconViewMode>('document');
  const [settlementReconViewMode, setSettlementReconViewMode] = useState<SettlementReconViewMode>('document');

  const reconHasFilter = type === 'RECONCILIATION' && (reconciliationSubTab === 'partner' ? !!reconQueryPartnerId : !!reconQueryWorkerId);
  const reconQueryDateFromT = reconQueryDateFrom.trim();
  const reconQueryDateToT = reconQueryDateTo.trim();

  const isReconcilePartner = type === 'RECONCILIATION' && reconciliationSubTab === 'partner' && !!reconQueryPartnerId;
  const isReconcileWorker = type === 'RECONCILIATION' && reconciliationSubTab === 'settlement' && !!reconQueryWorkerId;
  const partnerName = useMemo(
    () => partners.find(part => part.id === reconQueryPartnerId)?.name ?? '',
    [partners, reconQueryPartnerId],
  );
  const dateRangeQs = useMemo(() => {
    const out: { startDate?: string; endDate?: string } = {};
    if (reconQueryDateFromT) out.startDate = `${reconQueryDateFromT}T00:00:00.000Z`;
    if (reconQueryDateToT) out.endDate = `${reconQueryDateToT}T23:59:59.999Z`;
    return out;
  }, [reconQueryDateFromT, reconQueryDateToT]);

  /** 按合作单位拉财务流水（收/付款），只取该 partner + 日期范围。fetch-all-pages 兜底，不截断。 */
  const partnerFinanceQuery = useQuery({
    queryKey: ['recon', 'finance', 'partner', reconQueryPartnerId, dateRangeQs.startDate ?? '', dateRangeQs.endDate ?? ''],
    queryFn: () =>
      fetchAllPages<FinanceRecord>(page =>
        api.finance.listPage({
          partner: partnerName,
          ...dateRangeQs,
          page,
          pageSize: RECON_PAGE_SIZE,
        }) as unknown as Promise<PaginatedLike<FinanceRecord>>,
      ),
    enabled: isReconcilePartner,
    staleTime: RECON_STALE_MS,
  });

  /** 按合作单位拉 PSI（采购/销售单），后端目前只支持 partnerId 过滤，日期在前端筛 */
  const partnerPsiQuery = useQuery({
    queryKey: ['recon', 'psi', 'partner', reconQueryPartnerId],
    queryFn: () =>
      fetchAllPages<PsiRecord>(page =>
        api.psi.list({ partnerId: reconQueryPartnerId, page, pageSize: RECON_PAGE_SIZE }) as Promise<
          PsiRecord[] | PaginatedLike<PsiRecord>
        >,
      ),
    enabled: isReconcilePartner,
    staleTime: RECON_STALE_MS,
  });

  /** 按合作单位拉生产报工外协收回，partner 走 contains 匹配 */
  const partnerProdQuery = useQuery({
    queryKey: ['recon', 'prod', 'partner', partnerName, dateRangeQs.startDate ?? '', dateRangeQs.endDate ?? ''],
    queryFn: () =>
      fetchAllPages<ProductionOpRecord>(page =>
        api.production.listPage({
          partner: partnerName,
          type: 'OUTSOURCE',
          status: '已收回',
          ...dateRangeQs,
          page,
          pageSize: RECON_PAGE_SIZE,
        }) as unknown as Promise<PaginatedLike<ProductionOpRecord>>,
      ),
    enabled: isReconcilePartner && !!partnerName,
    staleTime: RECON_STALE_MS,
  });

  /** 按工人拉财务流水（收/付款），用于报工结算对账 */
  const workerFinanceQuery = useQuery({
    queryKey: ['recon', 'finance', 'worker', reconQueryWorkerId, dateRangeQs.startDate ?? '', dateRangeQs.endDate ?? ''],
    queryFn: () =>
      fetchAllPages<FinanceRecord>(page =>
        api.finance.listPage({
          workerId: reconQueryWorkerId,
          ...dateRangeQs,
          page,
          pageSize: RECON_PAGE_SIZE,
        }) as Promise<PaginatedLike<FinanceRecord>>,
      ),
    enabled: isReconcileWorker,
    staleTime: RECON_STALE_MS,
  });

  /** 按工人拉返工报工流水 */
  const workerReworkProdQuery = useQuery({
    queryKey: ['recon', 'prod', 'worker', reconQueryWorkerId, dateRangeQs.startDate ?? '', dateRangeQs.endDate ?? ''],
    queryFn: () =>
      fetchAllPages<ProductionOpRecord>(page =>
        api.production.listPage({
          workerId: reconQueryWorkerId,
          type: 'REWORK_REPORT',
          ...dateRangeQs,
          page,
          pageSize: RECON_PAGE_SIZE,
        }) as Promise<PaginatedLike<ProductionOpRecord>>,
      ),
    enabled: isReconcileWorker,
    staleTime: RECON_STALE_MS,
  });

  /**
   * Phase 3.D follow-up：统一以 react-query 窄拉数据为唯一来源；不再降级到 props 全量。
   * - 对账模式（isReconcile*）但查询尚未返回时取空数组——UI 会显示 reconLoading；
   * - 非对账模式（RECEIPT/PAYMENT）下不应该读取以下变量（partnerRecon/settlementRecon 已 guard 过）。
   */
  const effectivePsiRecords = useMemo<PsiRecord[]>(() => {
    if (!isReconcilePartner) return [];
    if (partnerPsiQuery.data == null) return [];
    return unwrapList<PsiRecord>(partnerPsiQuery.data, []);
  }, [isReconcilePartner, partnerPsiQuery.data]);

  const effectivePartnerProdRecords = useMemo<ProductionOpRecord[]>(() => {
    if (!isReconcilePartner) return [];
    if (partnerProdQuery.data == null) return [];
    return unwrapList<ProductionOpRecord>(partnerProdQuery.data, []);
  }, [isReconcilePartner, partnerProdQuery.data]);

  const effectivePartnerFinanceRecords = useMemo<FinanceRecord[]>(() => {
    if (!isReconcilePartner) return [];
    if (partnerFinanceQuery.data == null) return [];
    return unwrapList<FinanceRecord>(partnerFinanceQuery.data, []);
  }, [isReconcilePartner, partnerFinanceQuery.data]);

  const effectiveWorkerProdRecords = useMemo<ProductionOpRecord[]>(() => {
    if (!isReconcileWorker) return [];
    if (workerReworkProdQuery.data == null) return [];
    return unwrapList<ProductionOpRecord>(workerReworkProdQuery.data, []);
  }, [isReconcileWorker, workerReworkProdQuery.data]);

  const effectiveWorkerFinanceRecords = useMemo<FinanceRecord[]>(() => {
    if (!isReconcileWorker) return [];
    if (workerFinanceQuery.data == null) return [];
    return unwrapList<FinanceRecord>(workerFinanceQuery.data, []);
  }, [isReconcileWorker, workerFinanceQuery.data]);

  const reconLoading =
    (isReconcilePartner && (partnerFinanceQuery.isLoading || partnerPsiQuery.isLoading || partnerProdQuery.isLoading)) ||
    (isReconcileWorker && (workerFinanceQuery.isLoading || workerReworkProdQuery.isLoading));

  /** 合作单位对账：开始日期之前的应收余额（上期欠款） */
  const partnerOpeningBalanceQuery = useQuery({
    queryKey: ['recon', 'opening', reconQueryPartnerId, reconQueryDateFromT],
    queryFn: () =>
      api.finance.partnerOpeningBalance({
        partnerName,
        partnerId: reconQueryPartnerId,
        before: `${reconQueryDateFromT}T00:00:00.000Z`,
      }),
    enabled: isReconcilePartner && !!reconQueryDateFromT,
    staleTime: RECON_STALE_MS,
  });

  const partnerOpeningBalance = useMemo(() => {
    if (!reconQueryDateFromT) return 0;
    return partnerOpeningBalanceQuery.data?.previousBalance ?? 0;
  }, [reconQueryDateFromT, partnerOpeningBalanceQuery.data]);

  const partnerOpeningBalanceLoading =
    isReconcilePartner && !!reconQueryDateFromT && partnerOpeningBalanceQuery.isLoading;

  const inFinanceDateRangeQuery = useCallback((ts: string, from: string, to: string) => {
    const d = toLocalDateYmd(ts);
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }, []);

  const partnerReconList = useMemo((): PartnerReconRow[] => {
    if (type !== 'RECONCILIATION' || reconciliationSubTab !== 'partner' || !reconQueryPartnerId) return [];
    const from = reconQueryDateFromT;
    const to = reconQueryDateToT;
    const rows: PartnerReconRow[] = [];
    const psiTypes = ['PURCHASE_BILL', 'SALES_BILL'] as const;
    const psiLabel: Record<string, string> = { PURCHASE_BILL: PSI_PURCHASE_BILL_LABEL, SALES_BILL: '销售单' };
    const psiFiltered = effectivePsiRecords.filter(
      (r) => psiTypes.includes(r.type as (typeof psiTypes)[number]) && (r.partner === partnerName || r.partnerId === reconQueryPartnerId),
    );
    const psiByDoc = new Map<string, { type: string; timestamp: string; partner: string; amount: number; operator?: string; note?: string }>();
    psiFiltered.forEach((r) => {
      const dateStr = r.createdAt ? toLocalDateYmd(r.createdAt) : (r.timestamp ? toLocalDateYmd(r.timestamp) : '') || '';
      if (from && dateStr < from) return;
      if (to && dateStr > to) return;
      const docKey = `${r.type}|${r.docNumber || r.id}`;
      const cur = psiByDoc.get(docKey);
      const amt = Number(r.amount) || 0;
      if (!cur) psiByDoc.set(docKey, { type: r.type, timestamp: r.timestamp || '', partner: r.partner || '', amount: amt, operator: r.operator ?? undefined, note: r.note ?? undefined });
      else cur.amount += amt;
    });
    psiByDoc.forEach((v, docKey) => {
      const docNo = docKey.split('|')[1] || '';
      const docType = (v.type === 'SALES_BILL' && v.amount < 0) ? '销售退货'
        : (v.type === 'PURCHASE_BILL' && v.amount < 0) ? '采购退货'
        : (psiLabel[v.type] || v.type);
      rows.push({ source: 'psi', docType, docNo, timestamp: v.timestamp, partner: v.partner, amount: v.amount, operator: v.operator, note: v.note });
    });
    const prodByDoc = new Map<string, { status: string; timestamp: string; partner: string; amount: number; operator?: string; count: number; hasReworkSource: boolean }>();
    effectivePartnerProdRecords.filter(rec => rec.type === 'OUTSOURCE' && rec.status === '已收回' && rec.partner === partnerName).forEach(rec => {
      const d = rec.timestamp ? toLocalDateYmd(rec.timestamp) : '';
      if (from && d < from) return;
      if (to && d > to) return;
      const docKey = rec.docNo || rec.id;
      const cur = prodByDoc.get(docKey);
      const amt = Number(rec.amount) || 0;
      const rework = !!rec.sourceReworkId;
      if (!cur) {
        prodByDoc.set(docKey, {
          status: rec.status || '',
          timestamp: rec.timestamp || '',
          partner: rec.partner || '',
          amount: amt,
          operator: rec.operator ?? undefined,
          count: 1,
          hasReworkSource: rework,
        });
      } else {
        cur.amount += amt;
        cur.count += 1;
        if (rework) cur.hasReworkSource = true;
      }
    });
    prodByDoc.forEach((v, docNo) => {
      rows.push({
        source: 'psi',
        docType: partnerReconOutsourceReceiveDocType(v.hasReworkSource),
        docNo,
        timestamp: v.timestamp,
        partner: v.partner,
        amount: v.amount,
        operator: v.operator,
      });
    });
    const finByDoc = new Map<string, { rec: FinanceRecord; amount: number; count: number }>();
    effectivePartnerFinanceRecords.filter(rec => (rec.type === 'RECEIPT' || rec.type === 'PAYMENT') && rec.partner === partnerName && inFinanceDateRangeQuery(rec.timestamp, from, to)).forEach(rec => {
      const docKey = rec.docNo || rec.id;
      const cur = finByDoc.get(docKey);
      if (!cur) finByDoc.set(docKey, { rec: { ...rec }, amount: rec.amount, count: 1 });
      else { cur.amount += rec.amount; cur.count += 1; cur.rec = { ...cur.rec, amount: cur.amount }; }
    });
    finByDoc.forEach(v => {
      rows.push({ source: 'finance', rec: v.rec });
    });
    rows.sort((a, b) => {
      const ta = a.source === 'finance' ? a.rec.timestamp : a.source === 'psi' ? a.timestamp : a.rec.timestamp;
      const tb = b.source === 'finance' ? b.rec.timestamp : b.source === 'psi' ? b.timestamp : b.rec.timestamp;
      return new Date(ta).getTime() - new Date(tb).getTime();
    });
    return rows;
  }, [
    type, reconciliationSubTab, reconQueryPartnerId, reconQueryDateFromT, reconQueryDateToT,
    partnerName, effectivePsiRecords, effectivePartnerProdRecords, effectivePartnerFinanceRecords,
    inFinanceDateRangeQuery,
  ]);

  const settlementListInput = useMemo(() => {
    if (!reconQueryWorkerId) return null;
    return {
      workerId: reconQueryWorkerId,
      workerName: workerMap.get(reconQueryWorkerId)?.name ?? '',
      dateFrom: reconQueryDateFromT,
      dateTo: reconQueryDateToT,
      orders,
      productMilestoneProgresses,
      productMap,
      workerProdRecords: effectiveWorkerProdRecords,
      workerFinanceRecords: effectiveWorkerFinanceRecords,
      globalNodes,
      dictionaries,
    };
  }, [
    reconQueryWorkerId,
    workerMap,
    reconQueryDateFromT,
    reconQueryDateToT,
    orders,
    productMilestoneProgresses,
    productMap,
    effectiveWorkerProdRecords,
    effectiveWorkerFinanceRecords,
    globalNodes,
    dictionaries,
  ]);

  const settlementOpeningBalance = useMemo(() => {
    if (type !== 'RECONCILIATION' || reconciliationSubTab !== 'settlement' || !settlementListInput) return 0;
    return computeSettlementOpeningBalance(settlementListInput);
  }, [type, reconciliationSubTab, settlementListInput]);

  const settlementReconList = useMemo((): SettlementReconRow[] => {
    if (type !== 'RECONCILIATION' || reconciliationSubTab !== 'settlement' || !settlementListInput) return [];
    return buildSettlementReconList(settlementListInput);
  }, [type, reconciliationSubTab, settlementListInput]);

  const partnerReconListFiltered = useMemo(() => {
    const q = debouncedFinanceListSearch.trim().toLowerCase();
    if (!q) return partnerReconList;
    return partnerReconList.filter(row => {
      const parts: string[] = [];
      if (row.source === 'finance') {
        const r = row.rec;
        parts.push(r.docNo ?? '', r.id, r.partner ?? '', r.note ?? '', r.type, String(r.amount));
      } else if (row.source === 'psi') {
        parts.push(row.docNo, row.docType, row.partner ?? '', row.operator ?? '', row.note ?? '', String(row.amount));
      } else {
        const r = row.rec;
        parts.push(r.docNo ?? '', r.id, r.partner ?? '', r.note ?? '', String(r.amount));
      }
      return parts.filter(Boolean).join('\0').toLowerCase().includes(q);
    });
  }, [partnerReconList, debouncedFinanceListSearch]);

  const settlementReconListFiltered = useMemo(
    () => filterSettlementReconListWithWorkerNames(settlementReconList, debouncedFinanceListSearch, workerMap),
    [settlementReconList, debouncedFinanceListSearch, workerMap],
  );

  const displayRecords = useMemo(() => {
    if (type !== 'RECONCILIATION') return records;
    if (reconciliationSubTab === 'partner') return [];
    if (reconciliationSubTab === 'settlement') return [];
    if (!reconQueryWorkerId) return [];
    const from = reconQueryDateFromT;
    const to = reconQueryDateToT;
    return effectiveWorkerFinanceRecords.filter(rec => {
      if (!rec.workerId) return false;
      if (!inFinanceDateRangeQuery(rec.timestamp, from, to)) return false;
      if (rec.workerId !== reconQueryWorkerId) return false;
      return true;
    });
  }, [type, records, effectiveWorkerFinanceRecords, reconciliationSubTab, reconQueryDateFromT, reconQueryDateToT, reconQueryWorkerId, inFinanceDateRangeQuery]);

  const tableSourceRecords = useMemo(() => {
    if (type === 'RECONCILIATION') return displayRecords;
    const q = debouncedFinanceListSearch.trim().toLowerCase();
    if (!q) return displayRecords;
    return displayRecords.filter(rec => {
      const catName = financeCatMap.get(rec.categoryId ?? '')?.name ?? '';
      const workerName = rec.workerId ? (workerMap.get(rec.workerId)?.name ?? rec.workerId) : '';
      const parts = [rec.docNo ?? '', rec.id, rec.partner ?? '', rec.note ?? '', String(rec.amount), catName, workerName, rec.relatedId ?? ''];
      if (rec.customData && typeof rec.customData === 'object') {
        for (const v of Object.values(rec.customData)) {
          if (v != null && v !== '') parts.push(String(v));
        }
      }
      return parts.filter(Boolean).join('\0').toLowerCase().includes(q);
    });
  }, [type, displayRecords, debouncedFinanceListSearch, financeCatMap, workerMap]);

  const settlementReconAllWithBalance = useMemo(() => {
    if (type !== 'RECONCILIATION' || reconciliationSubTab !== 'settlement' || settlementReconList.length === 0) return [];
    return buildSettlementReconBalances(settlementReconList, settlementOpeningBalance);
  }, [type, reconciliationSubTab, settlementReconList, settlementOpeningBalance]);

  const settlementReconWithBalance = useMemo(() => {
    if (settlementReconAllWithBalance.length === 0) return [];
    const q = debouncedFinanceListSearch.trim();
    if (!q) return settlementReconAllWithBalance;
    const filtered = new Set(settlementReconListFiltered);
    return settlementReconAllWithBalance.filter(({ row }) => filtered.has(row));
  }, [settlementReconAllWithBalance, settlementReconListFiltered, debouncedFinanceListSearch]);

  const settlementReconSummary = useMemo(() => {
    if (type !== 'RECONCILIATION' || reconciliationSubTab !== 'settlement' || !reconHasFilter) return null;
    return summarizeSettlementReconBalances(settlementReconList, settlementOpeningBalance);
  }, [type, reconciliationSubTab, reconHasFilter, settlementReconList, settlementOpeningBalance]);

  const settlementProductReconList = useMemo((): SettlementProductReconRow[] => {
    if (type !== 'RECONCILIATION' || reconciliationSubTab !== 'settlement' || !reconQueryWorkerId) return [];
    const workerName = workerMap.get(reconQueryWorkerId)?.name ?? '';
    return buildSettlementProductLineReconList({
      documentRows: settlementReconList,
      productMap,
      workerName,
      openingBalance: settlementOpeningBalance,
    });
  }, [
    type,
    reconciliationSubTab,
    reconQueryWorkerId,
    settlementReconList,
    productMap,
    workerMap,
    settlementOpeningBalance,
  ]);

  const settlementProductReconListFiltered = useMemo(
    () => filterSettlementProductReconList(settlementProductReconList, debouncedFinanceListSearch),
    [settlementProductReconList, debouncedFinanceListSearch],
  );

  const partnerReconAllWithBalance = useMemo(() => {
    if (type !== 'RECONCILIATION' || reconciliationSubTab !== 'partner' || partnerReconList.length === 0) return [];
    return buildPartnerReconBalances(partnerReconList, partnerOpeningBalance);
  }, [type, reconciliationSubTab, partnerReconList, partnerOpeningBalance]);

  const partnerReconWithBalance = useMemo(() => {
    if (partnerReconAllWithBalance.length === 0) return [];
    const q = debouncedFinanceListSearch.trim();
    if (!q) return partnerReconAllWithBalance;
    const filtered = new Set(partnerReconListFiltered);
    return partnerReconAllWithBalance.filter(({ row }) => filtered.has(row));
  }, [partnerReconAllWithBalance, partnerReconListFiltered, debouncedFinanceListSearch]);

  const partnerReconSummary = useMemo(() => {
    if (type !== 'RECONCILIATION' || reconciliationSubTab !== 'partner' || !reconHasFilter) {
      return null;
    }
    return summarizePartnerReconBalances(partnerReconList, partnerOpeningBalance);
  }, [
    type,
    reconciliationSubTab,
    reconHasFilter,
    partnerReconList,
    partnerOpeningBalance,
  ]);

  const partnerProductReconList = useMemo((): PartnerProductReconRow[] => {
    if (type !== 'RECONCILIATION' || reconciliationSubTab !== 'partner' || !reconQueryPartnerId) return [];
    return buildPartnerProductLineReconList({
      documentRows: partnerReconList,
      psiRecords: effectivePsiRecords,
      prodRecords: effectivePartnerProdRecords,
      productMap,
      partnerName,
      partnerId: reconQueryPartnerId,
      partnerOpeningBalance,
    });
  }, [
    type,
    reconciliationSubTab,
    reconQueryPartnerId,
    partnerReconList,
    effectivePsiRecords,
    effectivePartnerProdRecords,
    productMap,
    partnerName,
    partnerOpeningBalance,
  ]);

  const partnerProductReconListFiltered = useMemo(
    () => filterPartnerProductReconList(partnerProductReconList, debouncedFinanceListSearch),
    [partnerProductReconList, debouncedFinanceListSearch],
  );

  return {
    reconciliationSubTab,
    setReconciliationSubTab,
    reconDateFrom,
    setReconDateFrom,
    reconDateTo,
    setReconDateTo,
    reconPartnerId,
    setReconPartnerId,
    reconWorkerId,
    setReconWorkerId,
    reconQueryDateFrom,
    setReconQueryDateFrom,
    reconQueryDateTo,
    setReconQueryDateTo,
    reconQueryPartnerId,
    setReconQueryPartnerId,
    reconQueryWorkerId,
    setReconQueryWorkerId,
    reconHasFilter,
    reconQueryDateFromT,
    reconQueryDateToT,
    inFinanceDateRangeQuery,
    partnerReconList,
    settlementReconList,
    partnerReconListFiltered,
    settlementReconListFiltered,
    partnerReconWithBalance,
    partnerReconSummary,
    partnerOpeningBalanceLoading,
    partnerReconViewMode,
    setPartnerReconViewMode,
    partnerProductReconList,
    partnerProductReconListFiltered,
    settlementReconWithBalance,
    settlementReconSummary,
    settlementReconViewMode,
    setSettlementReconViewMode,
    settlementProductReconList,
    settlementProductReconListFiltered,
    displayRecords,
    tableSourceRecords,
    /** Phase 3.A：对账 react-query 正在窄拉时 true，方便 UI 显示 loading 状态 */
    reconLoading,
  };
}
