/**
 * 计划单详情 - 5. 追溯码主壳(Phase P5 拆分后)。
 *
 * 行/逻辑职责:
 * - state/handler 统一由 `usePlanTraceState` 提供;
 * - 生成类型选择 + 一键/单条生成 + 拆批设置入口 → `TraceGenerationControls`;
 * - 单品/批次一览(含 Tab) → `ItemCodeListPanel` / `VirtualBatchListPanel`;
 * - 拆批设置弹窗 → `BulkQuickSettingsModal`。
 *
 * 主壳本身只负责: ref 持有/滚动联动、卡片骨架、tab 切换、把数据/回调下传子组件。
 */
import React, { useCallback, useRef } from 'react';
import { Boxes, Printer, QrCode } from 'lucide-react';
import {
  AppDictionaries,
  ItemCode,
  PlanFormSettings,
  PlanOrder,
  PlanVirtualBatch,
  Product,
} from '../../types';
import { usePlanTraceState } from '../../hooks/usePlanTraceState';
import TraceGenerationControls from './trace/TraceGenerationControls';
import ItemCodeListPanel from './trace/ItemCodeListPanel';
import VirtualBatchListPanel from './trace/VirtualBatchListPanel';
import BulkQuickSettingsModal from './trace/BulkQuickSettingsModal';

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
  /** 单品码数量可能变化时通知父级(详情页据此判断是否展开追溯区块) */
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
  const traceItemListRef = useRef<HTMLDivElement>(null);
  const traceBatchListRef = useRef<HTMLDivElement>(null);
  const traceInventoryPanelRef = useRef<HTMLDivElement>(null);

  const s = usePlanTraceState({
    planId,
    plan,
    product,
    plans,
    planFormSettings,
    onUpdatePlanFormSettings,
    onVirtualBatchesChange,
    onTraceItemCodesInventoryMayHaveChanged,
  });

  /** 单品码表里点批次码 → 切到批次 tab 并滚到批次列表 */
  const handleClickBatchOfItem = useCallback(() => {
    s.setTraceInventoryTab('batches');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        traceInventoryPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        traceBatchListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }, [s]);

  /** 批次表里点单品码数量 → 切到单品 tab + 按批次筛选 + 滚到单品列表 */
  const handleClickBatchItemCodes = useCallback(
    (batch: PlanVirtualBatch) => {
      s.setTraceInventoryTab('items');
      s.setItemCodesBatchFilter(batch.id);
      void s.loadItemCodes(plan.id, 1, s.itemCodesVariantFilter, batch.id);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          traceInventoryPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          traceItemListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    },
    [plan.id, s],
  );

  const batchListPanel = (
    <VirtualBatchListPanel
      plan={plan}
      product={product}
      dictionaries={dictionaries}
      virtualBatches={s.virtualBatches}
      virtualBatchesLoading={s.virtualBatchesLoading}
      virtualBatchesTotal={s.virtualBatchesTotal}
      virtualBatchesPage={s.virtualBatchesPage}
      setVirtualBatchesPage={s.setVirtualBatchesPage}
      traceGenMode={s.traceGenMode}
      onClickBatchItemCodes={handleClickBatchItemCodes}
      onOpenBatchPrint={onOpenBatchPrint}
    />
  );

  return (
    <div ref={sectionRef} className="space-y-4 scroll-mt-4">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4 ml-2">
        <QrCode className="w-5 h-5 text-indigo-600" />
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">5. 追溯码</h3>
      </div>
      <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-8">
        <TraceGenerationControls
          plan={plan}
          product={product}
          dictionaries={dictionaries}
          traceGenMode={s.traceGenMode}
          setTraceGenMode={s.setTraceGenMode}
          vbBulkAllSummary={s.vbBulkAllSummary}
          bulkQuickConfiguredBatchSize={s.bulkQuickConfiguredBatchSize}
          bulkQuickWithItemCodesConfigured={s.bulkQuickWithItemCodesConfigured}
          vbBulkSplitting={s.vbBulkSplitting}
          handleBulkSplitVirtualBatches={s.handleBulkSplitVirtualBatches}
          singleBatchExpanded={s.singleBatchExpanded}
          setSingleBatchExpanded={s.setSingleBatchExpanded}
          openBulkQuickSettings={s.openBulkQuickSettings}
          vbVariantId={s.vbVariantId}
          setVbVariantId={s.setVbVariantId}
          vbQuantity={s.vbQuantity}
          setVbQuantity={s.setVbQuantity}
          vbQuotaInfo={s.vbQuotaInfo}
          vbCreating={s.vbCreating}
          handleCreateVirtualBatch={s.handleCreateVirtualBatch}
        />

        {s.traceGenMode === 'batchWithItems' && (
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
                  aria-selected={s.traceInventoryTab === 'items'}
                  onClick={() => s.setTraceInventoryTab('items')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-black uppercase tracking-wide transition-colors ${
                    s.traceInventoryTab === 'items'
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
                  aria-selected={s.traceInventoryTab === 'batches'}
                  onClick={() => s.setTraceInventoryTab('batches')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-black uppercase tracking-wide transition-colors ${
                    s.traceInventoryTab === 'batches'
                      ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-100'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Boxes className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  批次码一览
                </button>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                {s.traceInventoryTab === 'items' && s.itemCodesTotal > 0 && (
                  <button
                    type="button"
                    onClick={() => onOpenItemCodePrintPicker(plan, s.itemCodesVariantFilter, s.itemCodesBatchFilter)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-4 py-2 text-xs font-black text-indigo-700 hover:bg-indigo-50 transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    打印单品码
                  </button>
                )}
                {s.traceInventoryTab === 'batches' && s.virtualBatches.some(b => b.status === 'ACTIVE') && (
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

            {s.traceInventoryTab === 'items' && (
              <div ref={traceItemListRef}>
                <ItemCodeListPanel
                  plan={plan}
                  product={product}
                  dictionaries={dictionaries}
                  itemCodes={s.itemCodes}
                  itemCodesTotal={s.itemCodesTotal}
                  itemCodesPage={s.itemCodesPage}
                  itemCodesLoading={s.itemCodesLoading}
                  itemCodesPaging={s.itemCodesPaging}
                  itemCodesVariantFilter={s.itemCodesVariantFilter}
                  setItemCodesVariantFilter={s.setItemCodesVariantFilter}
                  itemCodesBatchFilter={s.itemCodesBatchFilter}
                  setItemCodesBatchFilter={s.setItemCodesBatchFilter}
                  loadItemCodes={s.loadItemCodes}
                  onClickBatchOfItem={handleClickBatchOfItem}
                  onOpenItemCodeSinglePrint={onOpenItemCodeSinglePrint}
                />
              </div>
            )}

            {s.traceInventoryTab === 'batches' && (
              <div ref={traceBatchListRef} className="space-y-4">
                {batchListPanel}
              </div>
            )}
          </div>
        )}

        {s.traceGenMode === 'batch' && (
          <div ref={traceBatchListRef} className="border-t border-slate-200 pt-8 space-y-4 scroll-mt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <Boxes className="w-4 h-4 text-indigo-600 shrink-0" />
                批次码一览
              </h4>
              {s.virtualBatches.some(b => b.status === 'ACTIVE') && (
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
            {batchListPanel}
          </div>
        )}
      </div>

      <BulkQuickSettingsModal
        open={s.bulkQuickSettingsOpen}
        draftSize={s.bulkQuickDraftSize}
        setDraftSize={s.setBulkQuickDraftSize}
        draftWithItems={s.bulkQuickDraftWithItems}
        setDraftWithItems={s.setBulkQuickDraftWithItems}
        onClose={() => s.setBulkQuickSettingsOpen(false)}
        onSave={s.handleSaveBulkQuickSettings}
      />
    </div>
  );
};

export default PlanTraceSection;
