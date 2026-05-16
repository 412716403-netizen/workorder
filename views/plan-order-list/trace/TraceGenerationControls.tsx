/**
 * 计划单 - 追溯码 - 生成类型 + 单条/一键生成控件 (Phase P5 抽离自 PlanTraceSection)。
 *
 * 这里将「生成类型选择」「一键生成 / 单条生成 / 拆批设置」三块原本在主壳内紧耦合的
 * 大段 JSX 收口成一个受控组件，主壳只需要传 state、handler。
 */
import React from 'react';
import { ChevronDown, ChevronRight, Layers, RefreshCw, Settings } from 'lucide-react';
import type { AppDictionaries, PlanOrder, Product, ProductVariant } from '../../../types';

type TraceGenMode = 'batch' | 'batchWithItems' | null;

interface Props {
  plan: PlanOrder;
  product: Product;
  dictionaries: AppDictionaries;
  traceGenMode: TraceGenMode;
  setTraceGenMode: React.Dispatch<React.SetStateAction<TraceGenMode>>;

  vbBulkAllSummary: { totalRemaining: number; variantCount: number };
  bulkQuickConfiguredBatchSize: number | undefined;
  bulkQuickWithItemCodesConfigured: boolean;
  vbBulkSplitting: boolean;
  handleBulkSplitVirtualBatches: (planOrderId: string) => Promise<void>;

  singleBatchExpanded: boolean;
  setSingleBatchExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  openBulkQuickSettings: () => void;

  vbVariantId: string;
  setVbVariantId: React.Dispatch<React.SetStateAction<string>>;
  vbQuantity: string;
  setVbQuantity: React.Dispatch<React.SetStateAction<string>>;
  vbQuotaInfo:
    | { kind: 'needVariant' }
    | { kind: 'ok'; maxFromPlan: number; allocated: number; remaining: number };
  vbCreating: boolean;
  handleCreateVirtualBatch: (planOrderId: string, productVariants: ProductVariant[]) => Promise<void>;
}

const TraceGenerationControls: React.FC<Props> = ({
  plan,
  product,
  dictionaries,
  traceGenMode,
  setTraceGenMode,
  vbBulkAllSummary,
  bulkQuickConfiguredBatchSize,
  bulkQuickWithItemCodesConfigured,
  vbBulkSplitting,
  handleBulkSplitVirtualBatches,
  singleBatchExpanded,
  setSingleBatchExpanded,
  openBulkQuickSettings,
  vbVariantId,
  setVbVariantId,
  vbQuantity,
  setVbQuantity,
  vbQuotaInfo,
  vbCreating,
  handleCreateVirtualBatch,
}) => (
  <>
    <div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">生成类型</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setTraceGenMode('batch')}
          className={`rounded-2xl border-2 px-4 py-4 text-left transition-all ${
            traceGenMode === 'batch'
              ? 'border-indigo-500 bg-indigo-50/80 shadow-md shadow-indigo-100'
              : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
          }`}
        >
          <span className="text-xs font-black text-slate-800 block">批次码</span>
          <span className="text-[10px] text-slate-500 mt-1 block leading-snug">按批二维码，不自动建单品码</span>
        </button>
        <button
          type="button"
          onClick={() => setTraceGenMode('batchWithItems')}
          className={`rounded-2xl border-2 px-4 py-4 text-left transition-all ${
            traceGenMode === 'batchWithItems'
              ? 'border-indigo-500 bg-indigo-50/80 shadow-md shadow-indigo-100'
              : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
          }`}
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
                        <option key={v.id} value={v.id}>
                          {label}
                        </option>
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
  </>
);

export default TraceGenerationControls;
