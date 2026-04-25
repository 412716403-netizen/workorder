import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Boxes, Layers, Printer, QrCode, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { itemCodesApi, planVirtualBatchesApi } from '../../services/api';
import { formatBatchSerialLabel, formatItemCodeSerialLabel } from '../../utils/serialLabels';
import { AppDictionaries, ItemCode, PlanOrder, PlanVirtualBatch, Product, ProductVariant } from '../../types';

const TRACE_CODE_LIST_PAGE_SIZE = 15;

type TraceGenMode = null | 'item' | 'batch' | 'batchWithItems';

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
}) => {
  const [traceGenMode, setTraceGenMode] = useState<TraceGenMode>(null);

  const [itemCodes, setItemCodes] = useState<ItemCode[]>([]);
  const [itemCodesTotal, setItemCodesTotal] = useState(0);
  const [itemCodesPage, setItemCodesPage] = useState(1);
  const [itemCodesLoading, setItemCodesLoading] = useState(false);
  const [itemCodesPaging, setItemCodesPaging] = useState(false);
  const [itemCodesGenerating, setItemCodesGenerating] = useState(false);
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
  const [vbBulkBatchSize, setVbBulkBatchSize] = useState<string>('');
  const [vbBulkSplitting, setVbBulkSplitting] = useState(false);
  const [vbVariantId, setVbVariantId] = useState<string>('');
  const [vbQuantity, setVbQuantity] = useState<string>('');

  const traceItemListRef = useRef<HTMLDivElement>(null);
  const traceBatchListRef = useRef<HTMLDivElement>(null);

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

  const handleGenerateItemCodes = useCallback(async (planOrderId: string) => {
    setItemCodesGenerating(true);
    try {
      const res = await itemCodesApi.generate(planOrderId);
      if (res.generated === 0) {
        toast.info('单品码已全部生成，无需补充');
      } else {
        const details = res.byVariant
          .filter(v => v.count > 0)
          .map(v => `${v.variantId ? v.variantId : '总量'}: ${v.count}`)
          .join(', ');
        toast.success(`已生成 ${res.generated} 个单品码${details ? `（${details}）` : ''}`);
      }
      await loadItemCodes(planOrderId, 1, itemCodesVariantFilter, itemCodesBatchFilter);
    } catch (e: any) {
      toast.error(e.message || '生成单品码失败');
    } finally {
      setItemCodesGenerating(false);
    }
  }, [loadItemCodes, itemCodesVariantFilter, itemCodesBatchFilter]);

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
      } catch (e: any) {
        toast.error(e.message || '生成失败');
      } finally {
        setVbCreating(false);
      }
    },
    [vbQuantity, vbVariantId, traceGenMode, loadVirtualBatches, loadItemCodes, itemCodesVariantFilter, itemCodesBatchFilter],
  );

  const handleBulkSplitVirtualBatches = useCallback(
    async (planOrderId: string) => {
      const bs = Math.floor(Number(vbBulkBatchSize));
      if (!Number.isFinite(bs) || bs < 1) {
        toast.error('请输入有效的每批件数（≥1）');
        return;
      }
      setVbBulkSplitting(true);
      try {
        const res = await planVirtualBatchesApi.bulkSplitAll({
          planOrderId,
          batchSize: bs,
          withItemCodes: traceGenMode === 'batchWithItems',
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
      } catch (e: any) {
        toast.error(e.message || '批量拆批失败');
      } finally {
        setVbBulkSplitting(false);
      }
    },
    [vbBulkBatchSize, traceGenMode, loadVirtualBatches, loadItemCodes, itemCodesVariantFilter, itemCodesBatchFilter],
  );

  useEffect(() => {
    if (planId) {
      setItemCodesPaging(false);
      void loadItemCodes(planId);
      void loadSubtreeAllocations(planId);
      setVirtualBatchesPage(1);
      setItemCodesVariantFilter('');
      setItemCodesBatchFilter('');
      setVbVariantId('');
      setVbQuantity('');
      setVbBulkBatchSize('');
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
    void loadVirtualBatches(planId, virtualBatchesPage);
  }, [planId, virtualBatchesPage, loadVirtualBatches]);

  useEffect(() => {
    onVirtualBatchesChange?.(virtualBatches);
  }, [virtualBatches, onVirtualBatchesChange]);

  return (
    <div ref={sectionRef} className="space-y-4 scroll-mt-4">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4 ml-2">
        <QrCode className="w-5 h-5 text-indigo-600" />
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">5. 追溯码</h3>
      </div>
      <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-8">
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">生成类型</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setTraceGenMode('item')}
              className={`rounded-2xl border-2 px-4 py-4 text-left transition-all ${traceGenMode === 'item' ? 'border-indigo-500 bg-indigo-50/80 shadow-md shadow-indigo-100' : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'}`}
            >
              <span className="text-xs font-black text-slate-800 block">单品码</span>
              <span className="text-[10px] text-slate-500 mt-1 block leading-snug">一物一码，不经过批次</span>
            </button>
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

        {(traceGenMode === 'item' || traceGenMode === 'batchWithItems') && (
          <div className="flex items-center justify-between flex-wrap gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
            <p className="text-xs text-slate-500 max-w-xl">
              {traceGenMode === 'batchWithItems' ? (
                <>
                  除批次同步生成的关联单品码外，还可在此<strong className="text-slate-700">单独补充</strong>不绑定批次的单品码；下方列表含<strong className="text-slate-700">批次码</strong>列便于对照。
                </>
              ) : (
                <>为计划内每件货物生成全局唯一单品码（不绑定批次），可用于标签打印与扫码识别。</>
              )}
            </p>
            <button
              type="button"
              disabled={itemCodesGenerating}
              onClick={() => void handleGenerateItemCodes(plan.id)}
              className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-indigo-100 shrink-0"
            >
              {itemCodesGenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5" />}
              {itemCodesGenerating ? '生成中...' : '生成单品码'}
            </button>
          </div>
        )}

        {(traceGenMode === 'batch' || traceGenMode === 'batchWithItems') && (
          <div className="space-y-6">
            <p className="text-xs text-slate-500 leading-relaxed">
              一个二维码对应<strong className="text-slate-700">固定件数</strong>。额度按<strong className="text-slate-600">本计划及子计划、同产品</strong>的计划明细汇总；有效批次占用额度，作废不占。标签请使用打印模版中的批次码占位符。
              {traceGenMode === 'batchWithItems' ? (
                <> 当前类型下，每批会<strong className="text-slate-600">同步创建 N 条可单独扫码的单品码</strong>并与批次关联；作废批次将级联作废这些单品码。</>
              ) : (
                <> 当前类型下<strong className="text-slate-600">不会</strong>随批次自动创建单品码。</>
              )}
            </p>

            <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-white p-5 space-y-4 shadow-sm shadow-indigo-500/5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
                  <Layers className="w-3.5 h-3.5" />
                </span>
                <div>
                  <p className="text-[11px] font-black text-indigo-950 uppercase tracking-wider">快速批量</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">对计划树里出现的<strong className="text-slate-600">每一种规格</strong>分别拆满剩余额度，无需先选规格。</p>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="flex w-[7.5rem] shrink-0 flex-col gap-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase">每批件数</label>
                  <input
                    type="number"
                    min={1}
                    value={vbBulkBatchSize}
                    onChange={e => setVbBulkBatchSize(e.target.value)}
                    placeholder={vbBulkAllSummary && vbBulkAllSummary.totalRemaining > 0 ? '如 50' : '—'}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800"
                  />
                </div>
                <button
                  type="button"
                  disabled={
                    vbBulkSplitting ||
                    !vbBulkAllSummary ||
                    vbBulkAllSummary.variantCount === 0 ||
                    vbBulkAllSummary.totalRemaining <= 0
                  }
                  onClick={() => void handleBulkSplitVirtualBatches(plan.id)}
                  className="shrink-0 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-200 transition-all hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {vbBulkSplitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
                  {vbBulkSplitting ? '拆批中...' : '一键拆满全部规格'}
                </button>
                {vbBulkAllSummary && vbBulkAllSummary.variantCount > 0 ? (
                  <p className="text-[10px] text-slate-500 sm:max-w-xs sm:pb-0.5">
                    {vbBulkAllSummary.totalRemaining > 0 ? (
                      <>全规格合计还可分配约 <strong className="text-slate-700">{vbBulkAllSummary.totalRemaining}</strong> 件（{vbBulkAllSummary.variantCount} 种规格有明细）。</>
                    ) : (
                      <>当前各规格剩余额度已为 0，无法继续批量拆批。</>
                    )}
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-400 sm:pb-0.5">暂无计划明细，无法拆批。</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-5 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-700 text-white">
                  <Boxes className="w-3.5 h-3.5" />
                </span>
                <div>
                  <p className="text-[11px] font-black text-slate-800 uppercase tracking-wider">单条生成</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">任选一种规格，自定义本批次件数（受该规格剩余额度限制）。</p>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                {product.variants.length > 0 ? (
                  <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-[220px]">
                    <label className="text-[10px] font-black text-slate-400 uppercase">规格</label>
                    <select
                      value={vbVariantId}
                      onChange={e => setVbVariantId(e.target.value)}
                      className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800"
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
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800"
                  />
                </div>
                <button
                  type="button"
                  disabled={vbCreating}
                  onClick={() => void handleCreateVirtualBatch(plan.id, product.variants)}
                  className="shrink-0 border-2 border-slate-300 bg-white text-slate-800 px-5 py-2.5 rounded-xl text-xs font-bold hover:border-slate-400 hover:bg-slate-50 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {vbCreating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Boxes className="w-3.5 h-3.5" />}
                  {vbCreating ? '生成中...' : '生成批次码'}
                </button>
              </div>
              {vbQuotaInfo?.kind === 'ok' && vbQuotaInfo.maxFromPlan > 0 && (
                <p className="text-[10px] text-slate-400 leading-tight">
                  当前所选规格：计划量 {vbQuotaInfo.maxFromPlan}，已用批次 {vbQuotaInfo.allocated}
                </p>
              )}
            </div>
          </div>
        )}

        {(traceGenMode === 'item' || traceGenMode === 'batchWithItems') && (
          <div ref={traceItemListRef} className="border-t border-slate-200 pt-8 space-y-4 scroll-mt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <QrCode className="w-4 h-4 text-indigo-600 shrink-0" />
                单品码一览
              </h4>
              {itemCodesTotal > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenItemCodePrintPicker(plan, itemCodesVariantFilter, itemCodesBatchFilter)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-4 py-2 text-xs font-black text-indigo-700 hover:bg-indigo-50 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  打印单品码
                </button>
              )}
            </div>

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
                暂无单品码
                {traceGenMode === 'item'
                  ? '，点击上方「生成单品码」开始'
                  : '；可点击上方「生成单品码」补充，或通过下方批次生成时自动创建关联单品码'}
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
                        <th className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase">
                          {traceGenMode === 'batchWithItems' ? '批次码' : '所属批次'}
                        </th>
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
                              className={`px-4 py-2.5 text-xs break-all ${traceGenMode === 'batchWithItems' && code.batch?.sequenceNo != null ? 'cursor-pointer text-indigo-600 hover:underline' : 'text-slate-600'}`}
                              onClick={() => {
                                if (!code.batch?.sequenceNo || traceGenMode !== 'batchWithItems') return;
                                traceBatchListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }}
                              title={traceGenMode === 'batchWithItems' && code.batch?.sequenceNo != null ? '点击查看下方批次码一览' : undefined}
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

        {(traceGenMode === 'batch' || traceGenMode === 'batchWithItems') && (
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
                                      setItemCodesBatchFilter(b.id);
                                      traceItemListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                      void loadItemCodes(plan.id, 1, itemCodesVariantFilter, b.id);
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
                      第 {virtualBatchesPage} 页 / 共{' '}
                      {Math.max(1, Math.ceil(virtualBatchesTotal / TRACE_CODE_LIST_PAGE_SIZE))} 页
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
          </div>
        )}
      </div>
    </div>
  );
};

export default PlanTraceSection;
