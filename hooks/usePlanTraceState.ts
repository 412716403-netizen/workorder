/**
 * PlanTraceSection 的 state + handler 集中托管 hook (Phase P5 抽离)。
 *
 * 持有:
 * - itemCodes / virtualBatches 列表 + 分页/loading
 * - subtreeAllocations(批次额度) + 派生 allocByVariantKey / vbQuotaInfo / vbBulkAllSummary
 * - 单条/一键生成参数 + 拆批快捷设置
 * - traceGenMode / traceInventoryTab 等 UI 状态
 *
 * 暴露:
 * - 所有上述 state + setter
 * - loadItemCodes / loadVirtualBatches / loadSubtreeAllocations
 * - handleCreateVirtualBatch / handleBulkSplitVirtualBatches
 * - openBulkQuickSettings / handleSaveBulkQuickSettings
 *
 * 设计要点:
 * - 三个 ref(traceItemListRef / traceBatchListRef / traceInventoryPanelRef)由主壳持有并下传子组件,
 *   避免 hook 持有 DOM 引用造成耦合。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { normalizePlanFormSettings } from '../contexts/formSettingsDefaults';
import { itemCodesApi, planVirtualBatchesApi } from '../services/api';
import {
  inferTraceGenModeFromExisting,
  collectSubtreePlanIdsForPlan,
  type TraceGenMode as TraceGenModeBase,
} from '../utils/planTraceHelpers';
import type {
  ItemCode,
  PlanFormSettings,
  PlanOrder,
  PlanVirtualBatch,
  Product,
  ProductVariant,
} from '../types';

export type TraceGenMode = TraceGenModeBase | null;
export const TRACE_CODE_LIST_PAGE_SIZE = 15;

interface UsePlanTraceStateArgs {
  planId: string;
  plan: PlanOrder;
  product: Product;
  plans: PlanOrder[];
  planFormSettings: PlanFormSettings;
  onUpdatePlanFormSettings: (next: PlanFormSettings) => void | Promise<void>;
  onVirtualBatchesChange?: (batches: PlanVirtualBatch[]) => void;
  onTraceItemCodesInventoryMayHaveChanged?: () => void;
}

export function usePlanTraceState(args: UsePlanTraceStateArgs) {
  const {
    planId,
    plan,
    product,
    plans,
    planFormSettings,
    onUpdatePlanFormSettings,
    onVirtualBatchesChange,
    onTraceItemCodesInventoryMayHaveChanged,
  } = args;

  const [traceGenMode, setTraceGenMode] = useState<TraceGenMode>(null);

  const [itemCodes, setItemCodes] = useState<ItemCode[]>([]);
  const [itemCodesTotal, setItemCodesTotal] = useState(0);
  const [itemCodesPage, setItemCodesPage] = useState(1);
  const [itemCodesLoading, setItemCodesLoading] = useState(false);
  const [itemCodesPaging, setItemCodesPaging] = useState(false);
  const [itemCodesVariantFilter, setItemCodesVariantFilter] = useState<string>('');
  const [itemCodesBatchFilter, setItemCodesBatchFilter] = useState<string>('');

  const [virtualBatches, setVirtualBatches] = useState<PlanVirtualBatch[]>([]);
  const [subtreeAllocations, setSubtreeAllocations] = useState<Array<{ variantId: string | null; allocated: number }>>([]);
  const [virtualBatchesLoading, setVirtualBatchesLoading] = useState(false);
  const [virtualBatchesTotal, setVirtualBatchesTotal] = useState(0);
  const [virtualBatchesPage, setVirtualBatchesPage] = useState(1);

  const [vbCreating, setVbCreating] = useState(false);
  const [vbBulkSplitting, setVbBulkSplitting] = useState(false);
  const [vbVariantId, setVbVariantId] = useState<string>('');
  const [vbQuantity, setVbQuantity] = useState<string>('');
  const [singleBatchExpanded, setSingleBatchExpanded] = useState(false);

  const [bulkQuickSettingsOpen, setBulkQuickSettingsOpen] = useState(false);
  const [bulkQuickDraftSize, setBulkQuickDraftSize] = useState('');
  const [bulkQuickDraftWithItems, setBulkQuickDraftWithItems] = useState(true);

  const [traceInventoryTab, setTraceInventoryTab] = useState<'items' | 'batches'>('items');

  const bulkQuickConfiguredBatchSize = planFormSettings.labelPrint?.bulkQuickSplitBatchSize;
  const bulkQuickWithItemCodesConfigured = planFormSettings.labelPrint?.bulkQuickSplitWithItemCodes !== false;

  const openBulkQuickSettings = useCallback(() => {
    const sz = planFormSettings.labelPrint?.bulkQuickSplitBatchSize;
    setBulkQuickDraftSize(sz != null && Number.isFinite(sz) ? String(sz) : '');
    setBulkQuickDraftWithItems(planFormSettings.labelPrint?.bulkQuickSplitWithItemCodes !== false);
    setBulkQuickSettingsOpen(true);
  }, [planFormSettings.labelPrint]);

  const handleSaveBulkQuickSettings = useCallback(async () => {
    const raw = bulkQuickDraftSize.trim();
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < 1) {
      toast.error('请输入有效的每批件数（1–100000）');
      return;
    }
    if (n > 100_000) {
      toast.error('每批件数不能超过 100000');
      return;
    }
    const merged = normalizePlanFormSettings({
      ...planFormSettings,
      labelPrint: {
        ...planFormSettings.labelPrint,
        bulkQuickSplitBatchSize: n,
        bulkQuickSplitWithItemCodes: bulkQuickDraftWithItems,
      },
    });
    try {
      await Promise.resolve(onUpdatePlanFormSettings(merged));
      toast.success('已保存拆批设置');
      setBulkQuickSettingsOpen(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(
        msg && msg.length > 0
          ? msg
          : '保存失败：请确认已登录且账号具备「系统设置 → 配置」编辑权限（settings:config:edit）',
      );
    }
  }, [bulkQuickDraftSize, bulkQuickDraftWithItems, onUpdatePlanFormSettings, planFormSettings]);

  const allocByVariantKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of subtreeAllocations) m.set(a.variantId ?? '', a.allocated);
    return m;
  }, [subtreeAllocations]);

  const vbQuotaInfo = useMemo(() => {
    const vKey = (v: string | null | undefined) => v ?? '';
    if (product.variants.length > 0 && !vbVariantId) {
      return { kind: 'needVariant' as const };
    }
    const effVariant: string | null = product.variants.length > 0 ? vbVariantId : null;
    const subtree = collectSubtreePlanIdsForPlan(plan.id, plans);
    const productId = plan.productId;
    let maxFromPlan = 0;
    for (const pid of subtree) {
      const p = plans.find(pl => pl.id === pid);
      if (!p || p.productId !== productId) continue;
      for (const it of p.items || []) {
        if (vKey(it.variantId) === vKey(effVariant)) maxFromPlan += Math.floor(Number(it.quantity));
      }
    }
    const allocated = allocByVariantKey.get(vKey(effVariant)) ?? 0;
    const remaining = Math.max(0, maxFromPlan - allocated);
    return { kind: 'ok' as const, maxFromPlan, allocated, remaining };
  }, [plan, product, vbVariantId, plans, allocByVariantKey]);

  const vbBulkAllSummary = useMemo(() => {
    const vKey = (v: string | null | undefined) => v ?? '';
    const subtree = collectSubtreePlanIdsForPlan(plan.id, plans);
    const productId = plan.productId;
    const variantKeys = new Set<string>();
    for (const pid of subtree) {
      const p = plans.find(pl => pl.id === pid);
      if (!p || p.productId !== productId) continue;
      for (const it of p.items || []) variantKeys.add(vKey(it.variantId));
    }
    if (variantKeys.size === 0) return { totalRemaining: 0, variantCount: 0 };
    let totalRemaining = 0;
    for (const vk of variantKeys) {
      let maxFromPlan = 0;
      for (const pid of subtree) {
        const p = plans.find(pl => pl.id === pid);
        if (!p || p.productId !== productId) continue;
        for (const it of p.items || []) {
          if (vKey(it.variantId) === vk) maxFromPlan += Math.floor(Number(it.quantity));
        }
      }
      const alloc = allocByVariantKey.get(vk) ?? 0;
      totalRemaining += Math.max(0, maxFromPlan - alloc);
    }
    return { totalRemaining, variantCount: variantKeys.size };
  }, [plan, product, plans, allocByVariantKey]);

  const loadItemCodes = useCallback(
    async (
      planOrderId: string,
      page = 1,
      variantFilter = '',
      batchFilter = '',
      opts?: { silent?: boolean },
    ) => {
      const silent = opts?.silent === true;
      if (silent) setItemCodesPaging(true);
      else setItemCodesLoading(true);
      try {
        const params: Record<string, unknown> = {
          planOrderId,
          page,
          pageSize: TRACE_CODE_LIST_PAGE_SIZE,
          status: 'ACTIVE',
        };
        if (variantFilter) params.variantId = variantFilter;
        if (batchFilter) params.batchId = batchFilter;
        const res = await itemCodesApi.list(params);
        setItemCodes(res.items);
        setItemCodesTotal(res.total);
        setItemCodesPage(res.page);
      } catch (e) {
        toast.error((e as Error).message || '加载单品码失败');
      } finally {
        if (silent) setItemCodesPaging(false);
        else setItemCodesLoading(false);
      }
    },
    [],
  );

  const loadSubtreeAllocations = useCallback(async (rootPlanOrderId: string) => {
    try {
      const res = await planVirtualBatchesApi.subtreeAllocations({ rootPlanOrderId });
      setSubtreeAllocations(res.allocations);
    } catch (e) {
      toast.error((e as Error).message || '加载批次额度失败');
      setSubtreeAllocations([]);
    }
  }, []);

  const loadVirtualBatches = useCallback(async (planOrderId: string, page = 1) => {
    setVirtualBatchesLoading(true);
    try {
      const res = await planVirtualBatchesApi.list({
        planOrderId,
        page,
        pageSize: TRACE_CODE_LIST_PAGE_SIZE,
      });
      setVirtualBatches(res.items);
      setVirtualBatchesTotal(res.total);
      setVirtualBatchesPage(res.page);
    } catch (e) {
      toast.error((e as Error).message || '加载批次码失败');
    } finally {
      setVirtualBatchesLoading(false);
    }
  }, []);

  const handleCreateVirtualBatch = useCallback(
    async (planOrderId: string, productVariants: ProductVariant[]) => {
      const qty = Math.floor(Number(vbQuantity));
      if (!Number.isFinite(qty) || qty < 1) {
        toast.error('请输入有效的批次件数（≥1）');
        return;
      }
      let variantId: string | null = null;
      if (productVariants.length > 0) {
        if (!vbVariantId) {
          toast.error('请选择规格（颜色/尺码）');
          return;
        }
        variantId = vbVariantId;
      }
      setVbCreating(true);
      try {
        const res = await planVirtualBatchesApi.create({
          planOrderId,
          variantId,
          quantity: qty,
          withItemCodes: traceGenMode === 'batchWithItems',
        });
        const ic = res.itemCodesCreated ?? 0;
        toast.success(ic > 0 ? `已生成批次码，并生成 ${ic} 个单品码` : '已生成批次码');
        setVbQuantity('');
        await loadVirtualBatches(planOrderId, 1);
        await loadSubtreeAllocations(planOrderId);
        await loadItemCodes(planOrderId, 1, itemCodesVariantFilter, itemCodesBatchFilter);
        if (ic > 0) onTraceItemCodesInventoryMayHaveChanged?.();
      } catch (e) {
        toast.error((e as Error).message || '生成失败');
      } finally {
        setVbCreating(false);
      }
    },
    [
      vbQuantity,
      vbVariantId,
      traceGenMode,
      loadVirtualBatches,
      loadSubtreeAllocations,
      loadItemCodes,
      itemCodesVariantFilter,
      itemCodesBatchFilter,
      onTraceItemCodesInventoryMayHaveChanged,
    ],
  );

  const handleBulkSplitVirtualBatches = useCallback(
    async (planOrderId: string) => {
      const bs = bulkQuickConfiguredBatchSize;
      if (bs == null || !Number.isFinite(bs) || bs < 1) {
        toast.error('请先在设置中配置有效的每批件数（1–100000）');
        return;
      }
      const withItemCodes = traceGenMode === 'batchWithItems' && bulkQuickWithItemCodesConfigured;
      setVbBulkSplitting(true);
      try {
        const res = await planVirtualBatchesApi.bulkSplitAll({
          planOrderId,
          batchSize: bs,
          withItemCodes,
        });
        const vCount = res.byVariant.length;
        const totalQty = res.byVariant.reduce((s, x) => s + x.totalQty, 0);
        const ic = res.itemCodesCreated ?? 0;
        toast.success(
          ic > 0
            ? `已生成 ${res.totalCreated} 个批次码（${vCount} 种规格），合计 ${totalQty} 件；同时生成 ${ic} 个单品码`
            : `已生成 ${res.totalCreated} 个批次码（${vCount} 种规格），合计 ${totalQty} 件，每批最多 ${res.batchSize} 件`,
        );
        await loadVirtualBatches(planOrderId, 1);
        await loadSubtreeAllocations(planOrderId);
        await loadItemCodes(planOrderId, 1, itemCodesVariantFilter, itemCodesBatchFilter);
        if (ic > 0) onTraceItemCodesInventoryMayHaveChanged?.();
      } catch (e) {
        toast.error((e as Error).message || '一键生成失败');
      } finally {
        setVbBulkSplitting(false);
      }
    },
    [
      bulkQuickConfiguredBatchSize,
      bulkQuickWithItemCodesConfigured,
      traceGenMode,
      loadVirtualBatches,
      loadSubtreeAllocations,
      loadItemCodes,
      itemCodesVariantFilter,
      itemCodesBatchFilter,
      onTraceItemCodesInventoryMayHaveChanged,
    ],
  );

  /* ----- 副作用 ----- */
  useEffect(() => {
    if (planId) {
      setItemCodes([]);
      setItemCodesTotal(0);
      setVirtualBatches([]);
      setVirtualBatchesTotal(0);
      setItemCodesPaging(false);
      void loadItemCodes(planId);
      void loadSubtreeAllocations(planId);
      setVirtualBatchesPage(1);
      setItemCodesVariantFilter('');
      setItemCodesBatchFilter('');
      setVbVariantId('');
      setVbQuantity('');
      setSingleBatchExpanded(false);
      setTraceGenMode(null);
    } else {
      setItemCodes([]);
      setItemCodesTotal(0);
      setItemCodesPaging(false);
      setVirtualBatches([]);
      setVirtualBatchesTotal(0);
      setSubtreeAllocations([]);
      setVirtualBatchesPage(1);
    }
  }, [planId, loadItemCodes, loadSubtreeAllocations]);

  useEffect(() => {
    if (!planId) return;
    if (itemCodesTotal <= 0 && virtualBatchesTotal <= 0) return;
    if (itemCodesTotal > 0 && itemCodes.length === 0) return;
    if (virtualBatchesTotal > 0 && virtualBatches.length === 0) return;
    const inferred = inferTraceGenModeFromExisting({ itemCodesTotal, virtualBatchesTotal });
    if (inferred == null) return;
    setTraceGenMode(prev => {
      if (prev === null) return inferred;
      if (prev === 'batch' && itemCodesTotal > 0 && virtualBatchesTotal > 0) return 'batchWithItems';
      return prev;
    });
  }, [planId, itemCodesTotal, itemCodes, virtualBatchesTotal, virtualBatches]);

  useEffect(() => {
    if (traceGenMode !== 'batchWithItems') setTraceInventoryTab('items');
  }, [traceGenMode]);

  useEffect(() => {
    if (!planId) return;
    void loadVirtualBatches(planId, virtualBatchesPage);
  }, [planId, virtualBatchesPage, loadVirtualBatches]);

  useEffect(() => {
    onVirtualBatchesChange?.(virtualBatches);
  }, [virtualBatches, onVirtualBatchesChange]);

  return {
    traceGenMode,
    setTraceGenMode,

    itemCodes,
    itemCodesTotal,
    itemCodesPage,
    itemCodesLoading,
    itemCodesPaging,
    itemCodesVariantFilter,
    setItemCodesVariantFilter,
    itemCodesBatchFilter,
    setItemCodesBatchFilter,
    loadItemCodes,

    virtualBatches,
    virtualBatchesLoading,
    virtualBatchesTotal,
    virtualBatchesPage,
    setVirtualBatchesPage,
    loadVirtualBatches,

    subtreeAllocations,
    allocByVariantKey,

    vbCreating,
    vbBulkSplitting,
    vbVariantId,
    setVbVariantId,
    vbQuantity,
    setVbQuantity,
    singleBatchExpanded,
    setSingleBatchExpanded,
    vbQuotaInfo,
    vbBulkAllSummary,
    handleCreateVirtualBatch,
    handleBulkSplitVirtualBatches,

    bulkQuickSettingsOpen,
    setBulkQuickSettingsOpen,
    bulkQuickDraftSize,
    setBulkQuickDraftSize,
    bulkQuickDraftWithItems,
    setBulkQuickDraftWithItems,
    bulkQuickConfiguredBatchSize,
    bulkQuickWithItemCodesConfigured,
    openBulkQuickSettings,
    handleSaveBulkQuickSettings,

    traceInventoryTab,
    setTraceInventoryTab,
  };
}
