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
import { toLocalDateYmd } from '../utils/localDateTime';
import { fetchAllPages, type PaginatedLike } from '../utils/fetchAllPages';
import * as api from '../services/api';

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

/** 合作单位对账：统一展示行（采购单/销售单/外协收回/收款单/付款单） */
export type PartnerReconRow =
  | { source: 'finance'; rec: FinanceRecord }
  | { source: 'psi'; docType: string; docNo: string; timestamp: string; partner: string; amount: number; operator?: string; note?: string }
  | { source: 'prod'; rec: ProductionOpRecord };

/** 报工结算对账：统一展示行（报工单、返工报工、收款单、付款单） */
export type SettlementReconRow =
  | { source: 'work_report'; reportNo: string; timestamp: string; workerId: string; workerName: string; amount: number; items: { orderNumber: string; productName: string; milestoneName: string; quantity: number; rate: number; amount: number }[] }
  | { source: 'rework_report'; rec: ProductionOpRecord }
  | { source: 'settlement_finance'; rec: FinanceRecord };

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
    const psiLabel: Record<string, string> = { PURCHASE_BILL: '采购单', SALES_BILL: '销售单' };
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
      const docType = (v.type === 'SALES_BILL' && v.amount < 0) ? '销售退货' : (psiLabel[v.type] || v.type);
      rows.push({ source: 'psi', docType, docNo, timestamp: v.timestamp, partner: v.partner, amount: v.amount, operator: v.operator, note: v.note });
    });
    const prodByDoc = new Map<string, { status: string; timestamp: string; partner: string; amount: number; operator?: string; count: number }>();
    effectivePartnerProdRecords.filter(rec => rec.type === 'OUTSOURCE' && rec.status === '已收回' && rec.partner === partnerName).forEach(rec => {
      const d = rec.timestamp ? toLocalDateYmd(rec.timestamp) : '';
      if (from && d < from) return;
      if (to && d > to) return;
      const docKey = rec.docNo || rec.id;
      const cur = prodByDoc.get(docKey);
      const amt = Number(rec.amount) || 0;
      if (!cur) prodByDoc.set(docKey, { status: rec.status || '', timestamp: rec.timestamp || '', partner: rec.partner || '', amount: amt, operator: rec.operator ?? undefined, count: 1 });
      else { cur.amount += amt; cur.count += 1; }
    });
    prodByDoc.forEach((v, docNo) => {
      rows.push({ source: 'psi', docType: '外协收回', docNo, timestamp: v.timestamp, partner: v.partner, amount: v.amount, operator: v.operator });
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

  const settlementReconList = useMemo((): SettlementReconRow[] => {
    if (type !== 'RECONCILIATION' || reconciliationSubTab !== 'settlement' || !reconQueryWorkerId) return [];
    const from = reconQueryDateFromT;
    const to = reconQueryDateToT;
    const workerName = workerMap.get(reconQueryWorkerId)?.name ?? '';
    const rows: SettlementReconRow[] = [];
    const reportToWorkerId = (r: { workerId?: string; customData?: Record<string, unknown> }) =>
      (r.workerId ?? (r.customData?.workerId as string | undefined) ?? '') as string;
    const workReportGroups = new Map<string, { timestamp: string; workerId: string; workerName: string; amount: number; items: { orderNumber: string; productName: string; milestoneName: string; quantity: number; rate: number; amount: number }[] }>();
    const variantDisplay = (product: Product | undefined, variantId?: string) => {
      if (!variantId || !product?.variants?.length) return '';
      const v = product.variants.find(x => x.id === variantId);
      if (!v) return variantId;
      const color = dictionaries?.colors?.find(c => c.id === v.colorId)?.name;
      const size = dictionaries?.sizes?.find(s => s.id === v.sizeId)?.name;
      return [color, size].filter(Boolean).join(' / ') || v.skuSuffix || variantId;
    };
    orders.forEach(order => {
      const nodeRates = productMap.get(order.productId)?.nodeRates;
      order.milestones?.forEach(milestone => {
        const rate = nodeRates?.[milestone.templateId] ?? 0;
        (milestone.reports || []).forEach((r: { workerId?: string; customData?: Record<string, unknown>; timestamp?: string; quantity?: number; rate?: number; reportNo?: string; reportBatchId?: string; id: string }) => {
          const wid = reportToWorkerId(r);
          if (wid !== reconQueryWorkerId) return;
          const dateStr = r.timestamp ? toLocalDateYmd(r.timestamp) : '';
          if (from && dateStr < from) return;
          if (to && dateStr > to) return;
          const qty = Number(r.quantity) || 0;
          const unitRate = r.rate != null ? Number(r.rate) : rate;
          const amt = qty * unitRate;
          const key = r.reportNo || r.reportBatchId || r.id;
          const existing = workReportGroups.get(key);
          const item = { orderNumber: order.orderNumber, productName: order.productName ?? '', milestoneName: milestone.name ?? '', quantity: qty, rate: unitRate, amount: amt };
          if (!existing) {
            workReportGroups.set(key, { timestamp: r.timestamp || '', workerId: wid, workerName, amount: amt, items: [item] });
          } else {
            existing.amount += amt;
            existing.items.push(item);
          }
        });
      });
    });
    productMilestoneProgresses.forEach(pmp => {
      const prod = productMap.get(pmp.productId);
      const nodeRates = prod?.nodeRates;
      const milestoneName = globalNodes.find(n => n.id === pmp.milestoneTemplateId)?.name ?? '';
      const defaultRate = nodeRates?.[pmp.milestoneTemplateId] ?? 0;
      const baseProductName = prod?.name ?? '';
      (pmp.reports || []).forEach((r: { workerId?: string; customData?: Record<string, unknown>; timestamp?: string; quantity?: number; rate?: number; reportNo?: string; reportBatchId?: string; id: string; variantId?: string }) => {
        const wid = reportToWorkerId(r);
        if (wid !== reconQueryWorkerId) return;
        const dateStr = r.timestamp ? toLocalDateYmd(r.timestamp) : '';
        if (from && dateStr < from) return;
        if (to && dateStr > to) return;
        const qty = Number(r.quantity) || 0;
        const unitRate = r.rate != null ? Number(r.rate) : defaultRate;
        const amt = qty * unitRate;
        const key = r.reportNo || r.reportBatchId || r.id;
        const existing = workReportGroups.get(key);
        const vid = (r.variantId ?? pmp.variantId) as string | undefined;
        const vLabel = variantDisplay(prod, vid);
        const item = {
          orderNumber: '关联产品',
          productName: vLabel ? `${baseProductName}（${vLabel}）` : baseProductName,
          milestoneName,
          quantity: qty,
          rate: unitRate,
          amount: amt,
        };
        if (!existing) {
          workReportGroups.set(key, { timestamp: r.timestamp || '', workerId: wid, workerName, amount: amt, items: [item] });
        } else {
          existing.amount += amt;
          existing.items.push(item);
        }
      });
    });
    workReportGroups.forEach((v, reportNo) => {
      rows.push({ source: 'work_report', reportNo: reportNo || '—', timestamp: v.timestamp, workerId: v.workerId, workerName: v.workerName, amount: v.amount, items: v.items });
    });
    effectiveWorkerProdRecords.filter(r => r.type === 'REWORK_REPORT' && r.workerId === reconQueryWorkerId).forEach(rec => {
      const d = rec.timestamp ? toLocalDateYmd(rec.timestamp) : '';
      if (from && d < from) return;
      if (to && d > to) return;
      rows.push({ source: 'rework_report', rec });
    });
    effectiveWorkerFinanceRecords.filter(rec => (rec.type === 'RECEIPT' || rec.type === 'PAYMENT') && rec.workerId === reconQueryWorkerId && inFinanceDateRangeQuery(rec.timestamp, from, to)).forEach(rec => {
      rows.push({ source: 'settlement_finance', rec });
    });
    rows.sort((a, b) => {
      const ta = a.source === 'settlement_finance' ? a.rec.timestamp : a.source === 'rework_report' ? a.rec.timestamp : a.timestamp;
      const tb = b.source === 'settlement_finance' ? b.rec.timestamp : b.source === 'rework_report' ? b.rec.timestamp : b.timestamp;
      return new Date(ta).getTime() - new Date(tb).getTime();
    });
    return rows;
  }, [
    type, reconciliationSubTab, reconQueryWorkerId, reconQueryDateFromT, reconQueryDateToT,
    orders, productMilestoneProgresses, productMap, workerMap,
    effectiveWorkerProdRecords, effectiveWorkerFinanceRecords,
    inFinanceDateRangeQuery, globalNodes, dictionaries,
  ]);

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

  const settlementReconListFiltered = useMemo(() => {
    const q = debouncedFinanceListSearch.trim().toLowerCase();
    if (!q) return settlementReconList;
    return settlementReconList.filter(row => {
      const parts: string[] = [];
      if (row.source === 'work_report') {
        parts.push(row.reportNo, row.workerName, String(row.amount));
        row.items.forEach(i => {
          parts.push(i.orderNumber, i.productName, i.milestoneName, String(i.quantity), String(i.amount));
        });
      } else if (row.source === 'rework_report') {
        const r = row.rec;
        parts.push(r.docNo ?? '', r.id, String(r.amount), r.workerId ?? '', workerMap.get(r.workerId ?? '')?.name ?? '');
      } else {
        const r = row.rec;
        parts.push(r.docNo ?? '', r.id, r.partner ?? '', r.note ?? '', r.type, String(r.amount), workerMap.get(r.workerId ?? '')?.name ?? '');
      }
      return parts.filter(Boolean).join('\0').toLowerCase().includes(q);
    });
  }, [settlementReconList, debouncedFinanceListSearch, workerMap]);

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

  const settlementReconWithBalance = useMemo(() => {
    if (type !== 'RECONCILIATION' || reconciliationSubTab !== 'settlement' || settlementReconListFiltered.length === 0) return [];
    let running = 0;
    return settlementReconListFiltered.map(row => {
      let inc = 0;
      let dec = 0;
      if (row.source === 'work_report') dec = row.amount;
      else if (row.source === 'rework_report') dec = Number(row.rec.amount) || 0;
      else if (row.source === 'settlement_finance') {
        if (row.rec.type === 'RECEIPT') dec = row.rec.amount;
        else if (row.rec.type === 'PAYMENT') inc = row.rec.amount;
      }
      running += inc - dec;
      return { row, receivableInc: inc, receivableDec: dec, balance: running };
    });
  }, [type, reconciliationSubTab, settlementReconListFiltered]);

  const partnerReconWithBalance = useMemo(() => {
    if (type !== 'RECONCILIATION' || reconciliationSubTab !== 'partner' || partnerReconListFiltered.length === 0) return [];
    let running = 0;
    return partnerReconListFiltered.map(row => {
      let inc = 0;
      let dec = 0;
      if (row.source === 'finance') {
        if (row.rec.type === 'RECEIPT') dec = row.rec.amount;
        else if (row.rec.type === 'PAYMENT') inc = row.rec.amount;
      } else if (row.source === 'psi') {
        if (row.docType === '采购单') dec = Math.abs(row.amount);
        else if (row.docType === '外协收回') dec = Math.abs(row.amount);
        else if (row.docType === '销售单') {
          if (row.amount >= 0) inc = row.amount;
          else dec = Math.abs(row.amount);
        }
      } else if (row.source === 'prod') {
        dec = Number(row.rec.amount) || 0;
      }
      running += inc - dec;
      return { row, receivableInc: inc, receivableDec: dec, balance: running };
    });
  }, [type, reconciliationSubTab, partnerReconListFiltered]);

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
    settlementReconWithBalance,
    displayRecords,
    tableSourceRecords,
    /** Phase 3.A：对账 react-query 正在窄拉时 true，方便 UI 显示 loading 状态 */
    reconLoading,
  };
}
