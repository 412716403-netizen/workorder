import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Boxes, ChevronDown, ChevronRight, Layers, Printer, QrCode, RefreshCw, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { normalizePlanFormSettings } from '../../contexts/formSettingsDefaults';
import { itemCodesApi, planVirtualBatchesApi } from '../../services/api';
import { formatBatchSerialLabel, formatItemCodeSerialLabel } from '../../utils/serialLabels';
import { AppDictionaries, ItemCode, PlanFormSettings, PlanOrder, PlanVirtualBatch, Product, ProductVariant } from '../../types';

const TRACE_CODE_LIST_PAGE_SIZE = 15;

type TraceGenMode = null | 'batch' | 'batchWithItems';

/** 根据已存在的单品码/批次码推断应高亮的「生成类型」（仅用于打开详情时的初始态） */
function inferTraceGenModeFromExisting(args: {
  itemCodesTotal: number;
  virtualBatchesTotal: number;
}): TraceGenMode | null {
  const { itemCodesTotal, virtualBatchesTotal } = args;
  if (itemCodesTotal <= 0 && virtualBatchesTotal <= 0) return null;
  if (virtualBatchesTotal > 0 && itemCodesTotal > 0) return 'batchWithItems';
  if (virtualBatchesTotal > 0) return 'batch';
  if (itemCodesTotal > 0) return 'batchWithItems';
  return null;
}

function collectSubtreePlanIdsForPlan(rootId: string, allPlans: PlanOrder[]): string[] {
  const childrenMap = new Map<string, PlanOrder[]>();
  for (const p of allPlans) {
    if (!p.parentPlanId) continue;
    if (!childrenMap.has(p.parentPlanId)) childrenMap.set(p.parentPlanId, []);
    childrenMap.get(p.parentPlanId)!.push(p);
  }
  const out: string[] = [];
  let frontier: string[] = [rootId];
  while (frontier.length > 0) {
    out.push(...frontier);
    const next: string[] = [];
    for (const id of frontier) {
      const ch = childrenMap.get(id);
      if (ch) next.push(...ch.map(c => c.id));
    }
    frontier = next;
  }
  return out;
}

interface PlanTraceSectionProps {
  planId: string;
  plan: PlanOrder;
  product: Product;
  plans: PlanOrder[];
  dictionaries: AppDictionaries;
  sectionRef: React.RefObject<HTMLDivElement | null>;
  onOpenItemCodePrintPicker: (plan: PlanOrder, variantFilter: string, batchFilter: string) => void;
  onOpenBatchBulkPrint: () => void;
  onOpenItemCodeSinglePrint: (plan: PlanOrder, code: ItemCode) => void;
  onOpenBatchPrint: (plan: PlanOrder, batch: PlanVirtualBatch) => void;
  onVirtualBatchesChange?: (batches: PlanVirtualBatch[]) => void;
  /** 单品码数量可能变化时通知父级（用于详情页在「表单关闭追溯区块」时仍能根据已生成码展开区块） */
  onTraceItemCodesInventoryMayHaveChanged?: () => void;
  planFormSettings: PlanFormSettings;
  onUpdatePlanFormSettings: (next: PlanFormSettings) => void | Promise<void>;
}

const PlanTraceSection: React.FC<PlanTraceSectionProps> = ({
  planId,
  plan,
  product,
  plans,
  dictionaries,
  sectionRef,
  onOpenItemCodePrintPicker,
  onOpenBatchBulkPrint,
  onOpenItemCodeSinglePrint,
  onOpenBatchPrint,
  onVirtualBatchesChange,
  onTraceItemCodesInventoryMayHaveChanged,
  planFormSettings,
  onUpdatePlanFormSettings,
}) => {
  const [traceGenMode, setTraceGenMode] = useState<TraceGenMode>(null);

  const [itemCodes, setItemCodes] = useState<ItemCode[]>([]);
  const [itemCodesTotal, setItemCodesTotal] = useState(0);
  const [itemCodesPage, setItemCodesPage] = useState(1);
  const [itemCodesLoading, setItemCodesLoading] = useState(false);
  const [itemCodesPaging, setItemCodesPaging] = useState(false);
  const [itemCodesVariantFilter, setItemCodesVariantFilter] = useState<string>('');
  const [itemCodesBatchFilter, setItemCodesBatchFilter] = useState<string>('');

  const [virtualBatches, setVirtualBatches] = useState<PlanVirtualBatch[]>([]);
  /** 子树内各规格 ACTIVE 批次占用件数（服务端聚合，替代拉全量子树批次列表） */
  const [subtreeAllocations, setSubtreeAllocations] = useState<Array<{ variantId: string | null; allocated: number }>>(
    [],
  );
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

  const traceItemListRef = useRef<HTMLDivElement>(null);
  const traceBatchListRef = useRef<HTMLDivElement>(null);
  /** 「单品码+批次码」下单品/批次一览合并区块，用于跨表跳转时滚入视野 */
  const traceInventoryPanelRef = useRef<HTMLDivElement>(null);
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
    for (const a of subtreeAllocations) {
      m.set(a.variantId ?? '', a.allocated);
    }
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
        if (vKey(it.variantId) === vKey(effVariant)) {
          maxFromPlan += Math.floor(Number(it.quantity));
        }
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
      for (const it of p.items || []) {
        variantKeys.add(vKey(it.variantId));
      }
    }
    if (variantKeys.size === 0) {
      return { totalRemaining: 0, variantCount: 0 };
    }
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
        const params: any = { planOrderId, page, pageSize: TRACE_CODE_LIST_PAGE_SIZE, status: 'ACTIVE' };
        if (variantFilter) params.variantId = variantFilter;
        if (batchFilter) params.batchId = batchFilter;
        const res = await itemCodesApi.list(params);
        setItemCodes(res.items);
        setItemCodesTotal(res.total);
        setItemCodesPage(res.page);
      } catch (e: any) {
        toast.error(e.message || '加载单品码失败');
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
    } catch (e: any) {
      toast.error(e.message || '加载批次额度失败');
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
    } catch (e: any) {
      toast.error(e.message || '加载批次码失败');
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
        toast.success(
          ic > 0 ? `已生成批次码，并生成 ${ic} 个单品码` : '已生成批次码',
        );
        setVbQuantity('');
        await loadVirtualBatches(planOrderId, 1);
        await loadSubtreeAllocations(planOrderId);
        await loadItemCodes(planOrderId, 1, itemCodesVariantFilter, itemCodesBatchFilter);
        if (ic > 0) onTraceItemCodesInventoryMayHaveChanged?.();
      } catch (e: any) {
        toast.error(e.message || '生成失败');
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
      } catch (e: any) {
        toast.error(e.message || '一键生成失败');
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

  /** 已有追溯码/批次时，打开详情后自动选中对应「生成类型」；异步数据到齐后再推断，避免误判 */
  useEffect(() => {
    if (!planId) return;
    if (itemCodesTotal <= 0 && virtualBatchesTotal <= 0) return;
    if (itemCodesTotal > 0 && itemCodes.length === 0) return;
    if (virtualBatchesTotal > 0 && virtualBatches.length === 0) return;

    const inferred = inferTraceGenModeFromExisting({
      itemCodesTotal,
      virtualBatchesTotal,
    });
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

  const renderVirtualBatchTableBody = () => (
    <>
      {virtualBatchesLoading ? (
        <div className="text-center py-8 text-sm text-slate-400">加载中...</div>
      ) : virtualBatches.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-400">暂无批次码</div>
      ) : (
        <>
          <div className="text-xs text-slate-500">
            共 <span className="font-black text-indigo-600">{virtualBatchesTotal}</span> 条批次码
            {virtualBatchesTotal > TRACE_CODE_LIST_PAGE_SIZE && `（第 ${virtualBatchesPage} 页）`}
          </div>
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase min-w-[7rem]">编号</th>
                  <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">规格</th>
                  <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">件数</th>
                  {traceGenMode === 'batchWithItems' && (
                    <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase w-16">单品码</th>
                  )}
                  <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">状态</th>
                  <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">创建时间</th>
                  <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase text-right">打印</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {virtualBatches.map(b => {
                  const variant = b.variantId ? product.variants.find(v => v.id === b.variantId) : null;
                  const color = variant?.colorId ? dictionaries.colors.find(c => c.id === variant.colorId) : null;
                  const size = variant?.sizeId ? dictionaries.sizes.find(s => s.id === variant.sizeId) : null;
                  const variantLabel = variant
                    ? [color?.name, size?.name].filter(Boolean).join('-') || variant.skuSuffix || '—'
                    : '默认';
                  return (
                    <tr key={b.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 text-xs font-black text-slate-700 break-all" title={b.sequenceNo != null ? String(b.sequenceNo) : undefined}>
                        {b.sequenceNo != null ? formatBatchSerialLabel(plan.planNumber, b.sequenceNo) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">{variantLabel}</td>
                      <td className="px-4 py-2.5 text-xs font-black text-indigo-600">{b.quantity}</td>
                      {traceGenMode === 'batchWithItems' && (
                        <td className="px-4 py-2.5 text-xs">
                          {(b.itemCodeCount ?? 0) > 0 ? (
                            <button
                              type="button"
                              className="font-black text-indigo-600 hover:underline"
                              onClick={() => {
                                setTraceInventoryTab('items');
                                setItemCodesBatchFilter(b.id);
                                void loadItemCodes(plan.id, 1, itemCodesVariantFilter, b.id);
                                requestAnimationFrame(() => {
                                  requestAnimationFrame(() => {
                                    traceInventoryPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                    traceItemListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                  });
                                });
                              }}
                            >
                              {b.itemCodeCount}
                            </button>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${b.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'}`}>
                          {b.status === 'ACTIVE' ? '正常' : '已作废'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[10px] text-slate-400">{new Date(b.createdAt).toLocaleString('zh-CN')}</td>
                      <td className="px-4 py-2.5 text-right">
                        {b.status === 'ACTIVE' ? (
                          <button
                            type="button"
                            onClick={() => onOpenBatchPrint(plan, b)}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
                          >
                            <Printer className="w-3 h-3 inline mr-0.5" />打印标签
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {virtualBatchesTotal > TRACE_CODE_LIST_PAGE_SIZE && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                disabled={virtualBatchesPage <= 1 || virtualBatchesLoading}
                onClick={() => setVirtualBatchesPage(p => Math.max(1, p - 1))}
                className="px-3 py-1 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50"
              >
                上一页
              </button>
              <span className="text-xs text-slate-500">
                第 {virtualBatchesPage} 页 / 共 {Math.max(1, Math.ceil(virtualBatchesTotal / TRACE_CODE_LIST_PAGE_SIZE))} 页
              </span>
              <button
                type="button"
                disabled={
                  virtualBatchesPage >= Math.ceil(virtualBatchesTotal / TRACE_CODE_LIST_PAGE_SIZE) ||
                  virtualBatchesLoading
                }
                onClick={() =>
                  setVirtualBatchesPage(p =>
                    Math.min(Math.ceil(virtualBatchesTotal / TRACE_CODE_LIST_PAGE_SIZE) || 1, p + 1),
                  )
                }
                className="px-3 py-1 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </>
  );

  return (
    <div ref={sectionRef} className="space-y-4 scroll-mt-4">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4 ml-2">
        <QrCode className="w-5 h-5 text-indigo-600" />
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">5. 追溯码</h3>
      </div>
      <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-8">
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">生成类型</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTraceGenMode('batch')}
              className={`rounded-2xl border-2 px-4 py-4 text-left transition-all ${traceGenMode === 'batch' ? 'border-indigo-500 bg-indigo-50/80 shadow-md shadow-indigo-100' : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'}`}
            >
              <span className="text-xs font-black text-slate-800 block">批次码</span>
              <span className="text-[10px] text-slate-500 mt-1 block leading-snug">按批二维码，不自动建单品码</span>
            </button>
            <button
              type="button"
              onClick={() => setTraceGenMode('batchWithItems')}
              className={`rounded-2xl border-2 px-4 py-4 text-left transition-all ${traceGenMode === 'batchWithItems' ? 'border-indigo-500 bg-indigo-50/80 shadow-md shadow-indigo-100' : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'}`}
            >
              <span className="text-xs font-black text-slate-800 block">单品码+批次码</span>
              <span className="text-[10px] text-slate-500 mt-1 block leading-snug">建批时同步生成关联单品码</span>
            </button>
          </div>
          {traceGenMode === null && (
            <p className="mt-4 text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 leading-relaxed">
              请先选择要生成的码类型，再填写参数并点击生成。
            </p>
          )}
        </div>

        {(traceGenMode === 'batch' || traceGenMode === 'batchWithItems') && (
          <div className="space-y-3">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              额度按本计划及子计划、同产品明细汇总；标签请用打印模版批次码占位符。
              {traceGenMode === 'batchWithItems'
                ? ' 当前为「单品码+批次码」：单条生成或一键生成时可按类型同步单品码。'
                : ' 当前为「仅批次码」：不自动生成单品码。'}
            </p>

            <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={
                    vbBulkSplitting ||
                    !vbBulkAllSummary ||
                    vbBulkAllSummary.variantCount === 0 ||
                    vbBulkAllSummary.totalRemaining <= 0 ||
                    bulkQuickConfiguredBatchSize == null ||
                    bulkQuickConfiguredBatchSize < 1
                  }
                  onClick={() => void handleBulkSplitVirtualBatches(plan.id)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-black text-white shadow-sm hover:bg-indigo-700 disabled:opacity-45"
                >
                  {vbBulkSplitting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
                  一键生成
                </button>
                <button
                  type="button"
                  onClick={() => setSingleBatchExpanded(v => !v)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[11px] font-black text-slate-700 hover:bg-slate-50"
                >
                  {singleBatchExpanded ? '收起单条' : '单条生成'}
                  {singleBatchExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                  )}
                </button>
                <button
                  type="button"
                  onClick={openBulkQuickSettings}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[11px] font-black text-slate-700 hover:bg-slate-50"
                  title="每批件数与一键生成是否带单品码"
                >
                  <Settings className="h-3.5 w-3.5 text-indigo-600" />
                  拆批设置
                </button>
              </div>
              <p className="text-[10px] text-slate-500 leading-snug">
                {bulkQuickConfiguredBatchSize != null && bulkQuickConfiguredBatchSize >= 1 ? (
                  <>
                    默认每批 <span className="font-black text-indigo-700">{bulkQuickConfiguredBatchSize}</span> 件
                    {traceGenMode === 'batchWithItems'
                      ? bulkQuickWithItemCodesConfigured
                        ? ' · 一键生成时带单品码'
                        : ' · 一键生成不带单品码'
                      : ' · 一键生成仅批次码'}
                    {' · '}
                  </>
                ) : (
                  <span className="font-bold text-amber-800">未配置每批件数，请先点「拆批设置」保存。 </span>
                )}
                {vbBulkAllSummary && vbBulkAllSummary.variantCount > 0 ? (
                  vbBulkAllSummary.totalRemaining > 0 ? (
                    <>
                      剩余约 <span className="font-black text-slate-800">{vbBulkAllSummary.totalRemaining}</span> 件 /{' '}
                      {vbBulkAllSummary.variantCount} 种规格
                    </>
                  ) : (
                    <span className="text-slate-400">各规格剩余额度已为 0</span>
                  )
                ) : (
                  <span className="text-slate-400">无计划明细</span>
                )}
              </p>
            </div>

            {singleBatchExpanded ? (
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  {product.variants.length > 0 ? (
                    <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-[220px]">
                      <label className="text-[10px] font-black text-slate-400 uppercase">规格</label>
                      <select
                        value={vbVariantId}
                        onChange={e => setVbVariantId(e.target.value)}
                        className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800"
                      >
                        <option value="">请选择</option>
                        {product.variants.map(v => {
                          const color = dictionaries.colors.find(c => c.id === v.colorId);
                          const size = dictionaries.sizes.find(s => s.id === v.sizeId);
                          const label = [color?.name, size?.name].filter(Boolean).join('-') || v.skuSuffix || v.id;
                          return (
                            <option key={v.id} value={v.id}>{label}</option>
                          );
                        })}
                      </select>
                    </div>
                  ) : null}
                  <div className="flex w-[7.5rem] shrink-0 flex-col gap-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase">件数</label>
                    <input
                      type="number"
                      min={1}
                      max={vbQuotaInfo?.kind === 'ok' && vbQuotaInfo.remaining > 0 ? vbQuotaInfo.remaining : undefined}
                      value={vbQuantity}
                      onChange={e => setVbQuantity(e.target.value)}
                      placeholder={
                        vbQuotaInfo?.kind === 'needVariant'
                          ? '请先选规格'
                          : vbQuotaInfo?.kind === 'ok'
                            ? vbQuotaInfo.remaining > 0
                              ? `最多 ${vbQuotaInfo.remaining}`
                              : '已满（0）'
                            : '如 100'
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={vbCreating}
                    onClick={() => void handleCreateVirtualBatch(plan.id, product.variants)}
                    className="shrink-0 rounded-lg border-2 border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {vbCreating ? <RefreshCw className="w-3.5 h-3.5 animate-spin inline" /> : null}
                    {vbCreating ? '生成中…' : '生成批次码'}
                  </button>
                </div>
                {vbQuotaInfo?.kind === 'ok' && vbQuotaInfo.maxFromPlan > 0 && (
                  <p className="text-[10px] text-slate-400 leading-tight">
                    当前规格：计划量 {vbQuotaInfo.maxFromPlan}，已用批次 {vbQuotaInfo.allocated}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}

        {traceGenMode === 'batchWithItems' && (
          <div ref={traceInventoryPanelRef} className="border-t border-slate-200 pt-8 space-y-4 scroll-mt-4">
            <div className="flex flex-wrap items-end justify-between gap-3 gap-y-2">
              <div
                className="inline-flex rounded-xl border-2 border-slate-200/90 bg-slate-50 p-0.5 shadow-sm"
                role="tablist"
                aria-label="追溯码一览切换"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={traceInventoryTab === 'items'}
                  onClick={() => setTraceInventoryTab('items')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-black uppercase tracking-wide transition-colors ${
                    traceInventoryTab === 'items'
                      ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-100'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <QrCode className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  单品码一览
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={traceInventoryTab === 'batches'}
                  onClick={() => setTraceInventoryTab('batches')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-black uppercase tracking-wide transition-colors ${
                    traceInventoryTab === 'batches'
                      ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-100'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Boxes className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  批次码一览
                </button>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                {traceInventoryTab === 'items' && itemCodesTotal > 0 && (
                  <button
                    type="button"
                    onClick={() => onOpenItemCodePrintPicker(plan, itemCodesVariantFilter, itemCodesBatchFilter)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-4 py-2 text-xs font-black text-indigo-700 hover:bg-indigo-50 transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    打印单品码
                  </button>
                )}
                {traceInventoryTab === 'batches' && virtualBatches.some(b => b.status === 'ACTIVE') && (
                  <button
                    type="button"
                    onClick={onOpenBatchBulkPrint}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[11px] font-black text-indigo-700 hover:bg-indigo-100"
                  >
                    <Printer className="h-3.5 w-3.5 shrink-0" />
                    打印批次码
                  </button>
                )}
              </div>
            </div>

            {traceInventoryTab === 'items' && (
              <div ref={traceItemListRef} className="space-y-4">
                {product.variants.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black text-slate-400 uppercase">筛选规格：</span>
                    <button
                      type="button"
                      onClick={() => {
                        setItemCodesVariantFilter('');
                        setItemCodesBatchFilter('');
                        void loadItemCodes(plan.id, 1, '', '');
                      }}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${!itemCodesVariantFilter ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >
                      全部
                    </button>
                    {product.variants.map(v => {
                      const color = dictionaries.colors.find(c => c.id === v.colorId);
                      const size = dictionaries.sizes.find(s => s.id === v.sizeId);
                      const label = [color?.name, size?.name].filter(Boolean).join('-') || v.skuSuffix || v.id;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            setItemCodesBatchFilter('');
                            setItemCodesVariantFilter(v.id);
                            void loadItemCodes(plan.id, 1, v.id, '');
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${itemCodesVariantFilter === v.id ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {itemCodesBatchFilter && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase">批次筛选</span>
                    <span className="rounded-lg bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                      仅显示所选批次的单品码
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setItemCodesBatchFilter('');
                        void loadItemCodes(plan.id, 1, itemCodesVariantFilter, '');
                      }}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                    >
                      清除批次筛选
                    </button>
                  </div>
                )}

                {itemCodesLoading && !itemCodes.length ? (
                  <div className="text-center py-8 text-sm text-slate-400">加载中...</div>
                ) : !itemCodes.length && !itemCodesLoading && !itemCodesPaging ? (
                  <div className="text-center py-8 text-sm text-slate-400">
                    暂无单品码；请选择「单品码+批次码」后通过上方一键生成或单条生成批次，将随批次自动创建关联单品码。
                  </div>
                ) : (
                  <>
                    <div className="text-xs text-slate-500">
                      共 <span className="font-black text-indigo-600">{itemCodesTotal}</span> 个单品码
                      {itemCodesTotal > TRACE_CODE_LIST_PAGE_SIZE && `（第 ${itemCodesPage} 页）`}
                    </div>
                    <div className="relative border border-slate-200 rounded-2xl overflow-hidden">
                      {(itemCodesPaging || (itemCodesLoading && itemCodes.length > 0)) && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/55 backdrop-blur-[1px]" aria-busy aria-label="加载中">
                          <RefreshCw className="h-5 w-5 animate-spin text-indigo-500" />
                        </div>
                      )}
                      <table className={`w-full text-left border-collapse ${itemCodesPaging || (itemCodesLoading && itemCodes.length > 0) ? 'opacity-70' : ''}`}>
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">编号</th>
                            <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">批次码</th>
                            <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">规格</th>
                            <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">状态</th>
                            <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">生成时间</th>
                            <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase text-right">打印</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {itemCodes.map(code => {
                            const variant = product.variants.find(v => v.id === code.variantId);
                            const color = variant?.colorId ? dictionaries.colors.find(c => c.id === variant.colorId) : null;
                            const size = variant?.sizeId ? dictionaries.sizes.find(s => s.id === variant.sizeId) : null;
                            const variantLabel = [color?.name, size?.name].filter(Boolean).join('-') || variant?.skuSuffix || '—';
                            return (
                              <tr key={code.id} className="hover:bg-slate-50/50">
                                <td className="px-4 py-2.5 text-xs font-bold text-slate-800 break-all">
                                  {formatItemCodeSerialLabel(plan.planNumber, code.serialNo)}
                                </td>
                                <td
                                  className={`px-4 py-2.5 text-xs break-all ${code.batch?.sequenceNo != null ? 'cursor-pointer text-indigo-600 hover:underline' : 'text-slate-600'}`}
                                  onClick={() => {
                                    if (!code.batch?.sequenceNo) return;
                                    setTraceInventoryTab('batches');
                                    requestAnimationFrame(() => {
                                      requestAnimationFrame(() => {
                                        traceInventoryPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                        traceBatchListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                      });
                                    });
                                  }}
                                  title={code.batch?.sequenceNo != null ? '点击切换到批次码一览' : undefined}
                                >
                                  {code.batch?.sequenceNo != null
                                    ? formatBatchSerialLabel(plan.planNumber, code.batch.sequenceNo)
                                    : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-xs text-slate-600">{variantLabel}</td>
                                <td className="px-4 py-2.5">
                                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${code.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'}`}>
                                    {code.status === 'ACTIVE' ? '正常' : '已作废'}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-[10px] text-slate-400">{new Date(code.createdAt).toLocaleDateString('zh-CN')}</td>
                                <td className="px-4 py-2.5 text-right">
                                  {code.status === 'ACTIVE' ? (
                                    <button
                                      type="button"
                                      onClick={() => onOpenItemCodeSinglePrint(plan, code)}
                                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
                                    >
                                      <Printer className="w-3 h-3 inline mr-0.5" />打印标签
                                    </button>
                                  ) : (
                                    <span className="text-[10px] text-slate-300">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {itemCodesTotal > TRACE_CODE_LIST_PAGE_SIZE && (
                      <div className="flex items-center justify-center gap-2 pt-2">
                        <button
                          type="button"
                          disabled={itemCodesPage <= 1 || itemCodesPaging || itemCodesLoading}
                          onClick={() =>
                            loadItemCodes(plan.id, itemCodesPage - 1, itemCodesVariantFilter, itemCodesBatchFilter, {
                              silent: true,
                            })
                          }
                          className="px-3 py-1 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50"
                        >
                          上一页
                        </button>
                        <span className="text-xs text-slate-500">
                          第 {itemCodesPage} 页 / 共 {Math.ceil(itemCodesTotal / TRACE_CODE_LIST_PAGE_SIZE)} 页
                        </span>
                        <button
                          type="button"
                          disabled={itemCodesPaging || itemCodesLoading || itemCodesPage >= Math.ceil(itemCodesTotal / TRACE_CODE_LIST_PAGE_SIZE)}
                          onClick={() =>
                            loadItemCodes(plan.id, itemCodesPage + 1, itemCodesVariantFilter, itemCodesBatchFilter, {
                              silent: true,
                            })
                          }
                          className="px-3 py-1 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50"
                        >
                          下一页
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {traceInventoryTab === 'batches' && (
              <div ref={traceBatchListRef} className="space-y-4">
                {renderVirtualBatchTableBody()}
              </div>
            )}
          </div>
        )}

        {traceGenMode === 'batch' && (
          <div ref={traceBatchListRef} className="border-t border-slate-200 pt-8 space-y-4 scroll-mt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <Boxes className="w-4 h-4 text-indigo-600 shrink-0" />
                批次码一览
              </h4>
              {virtualBatches.some(b => b.status === 'ACTIVE') && (
                <button
                  type="button"
                  onClick={onOpenBatchBulkPrint}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[11px] font-black text-indigo-700 hover:bg-indigo-100"
                >
                  <Printer className="h-3.5 w-3.5 shrink-0" />
                  打印批次码
                </button>
              )}
            </div>
            {renderVirtualBatchTableBody()}
          </div>
        )}
      </div>

      {bulkQuickSettingsOpen ? (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            aria-label="关闭"
            onClick={() => setBulkQuickSettingsOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-sm font-black text-slate-900">拆批设置</h3>
              <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
                保存后，「一键生成全部规格」将按此处每批件数拆批；是否在「单品码+批次码」模式下同步生成单品码由下方勾选决定。
              </p>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">每批件数（必填，1–100000）</label>
                <input
                  type="number"
                  min={1}
                  max={100_000}
                  value={bulkQuickDraftSize}
                  onChange={e => setBulkQuickDraftSize(e.target.value)}
                  placeholder="如 50"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800"
                />
              </div>
              <label className="flex cursor-pointer items-start gap-3 text-sm font-bold text-slate-800">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded text-indigo-600"
                  checked={bulkQuickDraftWithItems}
                  onChange={e => setBulkQuickDraftWithItems(e.target.checked)}
                />
                <span>
                  在「单品码+批次码」时，一键生成同步生成单品码
                  <span className="mt-1 block text-xs font-medium text-slate-500">选择「仅批次码」时不会生成单品码。</span>
                </span>
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3">
              <button
                type="button"
                onClick={() => setBulkQuickSettingsOpen(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleSaveBulkQuickSettings()}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default PlanTraceSection;
