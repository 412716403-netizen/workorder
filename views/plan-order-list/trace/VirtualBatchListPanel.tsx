/**
 * 计划单 - 追溯码 - 批次码一览(只读表 + 分页) (Phase P5 抽离自 PlanTraceSection)。
 */
import React from 'react';
import { Printer } from 'lucide-react';
import type { AppDictionaries, PlanOrder, PlanVirtualBatch, Product } from '../../../types';
import { formatBatchSerialLabel } from '../../../utils/serialLabels';
import { TRACE_CODE_LIST_PAGE_SIZE } from '../../../hooks/usePlanTraceState';

interface Props {
  plan: PlanOrder;
  product: Product;
  dictionaries: AppDictionaries;
  virtualBatches: PlanVirtualBatch[];
  virtualBatchesLoading: boolean;
  virtualBatchesTotal: number;
  virtualBatchesPage: number;
  setVirtualBatchesPage: React.Dispatch<React.SetStateAction<number>>;
  traceGenMode: 'batch' | 'batchWithItems' | null;
  onClickBatchItemCodes: (batch: PlanVirtualBatch) => void;
  onOpenBatchPrint: (plan: PlanOrder, batch: PlanVirtualBatch) => void;
}

const VirtualBatchListPanel: React.FC<Props> = ({
  plan,
  product,
  dictionaries,
  virtualBatches,
  virtualBatchesLoading,
  virtualBatchesTotal,
  virtualBatchesPage,
  setVirtualBatchesPage,
  traceGenMode,
  onClickBatchItemCodes,
  onOpenBatchPrint,
}) => (
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
                    <td
                      className="px-4 py-2.5 text-xs font-black text-slate-700 break-all"
                      title={b.sequenceNo != null ? String(b.sequenceNo) : undefined}
                    >
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
                            onClick={() => onClickBatchItemCodes(b)}
                          >
                            {b.itemCodeCount}
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${
                          b.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'
                        }`}
                      >
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
                          <Printer className="w-3 h-3 inline mr-0.5" />
                          打印标签
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

export default VirtualBatchListPanel;
