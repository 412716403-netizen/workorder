/**
 * 计划单 - 追溯码 - 单品码一览(筛选 + 表 + 分页) (Phase P5 抽离自 PlanTraceSection)。
 */
import React from 'react';
import { Printer, RefreshCw } from 'lucide-react';
import type { AppDictionaries, ItemCode, PlanOrder, Product } from '../../../types';
import { formatBatchSerialLabel, formatItemCodeSerialLabelFromCode } from '../../../utils/serialLabels';
import { TRACE_CODE_LIST_PAGE_SIZE } from '../../../hooks/usePlanTraceState';

interface Props {
  plan: PlanOrder;
  product: Product;
  dictionaries: AppDictionaries;
  itemCodes: ItemCode[];
  itemCodesTotal: number;
  itemCodesPage: number;
  itemCodesLoading: boolean;
  itemCodesPaging: boolean;
  itemCodesVariantFilter: string;
  setItemCodesVariantFilter: React.Dispatch<React.SetStateAction<string>>;
  itemCodesBatchFilter: string;
  setItemCodesBatchFilter: React.Dispatch<React.SetStateAction<string>>;
  loadItemCodes: (
    planOrderId: string,
    page?: number,
    variantFilter?: string,
    batchFilter?: string,
    opts?: { silent?: boolean },
  ) => Promise<void>;
  onClickBatchOfItem: (code: ItemCode) => void;
  onOpenItemCodeSinglePrint: (plan: PlanOrder, code: ItemCode) => void;
}

const ItemCodeListPanel: React.FC<Props> = ({
  plan,
  product,
  dictionaries,
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
  onClickBatchOfItem,
  onOpenItemCodeSinglePrint,
}) => (
  <div className="space-y-4">
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
          className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
            !itemCodesVariantFilter ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
          }`}
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
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                itemCodesVariantFilter === v.id ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
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
            <div
              className="absolute inset-0 z-10 flex items-center justify-center bg-white/55 backdrop-blur-[1px]"
              aria-busy
              aria-label="加载中"
            >
              <RefreshCw className="h-5 w-5 animate-spin text-indigo-500" />
            </div>
          )}
          <table
            className={`w-full text-left border-collapse ${
              itemCodesPaging || (itemCodesLoading && itemCodes.length > 0) ? 'opacity-70' : ''
            }`}
          >
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
                const variantLabel =
                  [color?.name, size?.name].filter(Boolean).join('-') || variant?.skuSuffix || '—';
                return (
                  <tr key={code.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 text-xs font-bold text-slate-800 break-all">
                      {formatItemCodeSerialLabelFromCode(plan.planNumber, code)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-xs break-all ${
                        code.batch?.sequenceNo != null ? 'cursor-pointer text-indigo-600 hover:underline' : 'text-slate-600'
                      }`}
                      onClick={() => {
                        if (!code.batch?.sequenceNo) return;
                        onClickBatchOfItem(code);
                      }}
                      title={code.batch?.sequenceNo != null ? '点击切换到批次码一览' : undefined}
                    >
                      {code.batch?.sequenceNo != null
                        ? formatBatchSerialLabel(plan.planNumber, code.batch.sequenceNo)
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{variantLabel}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${
                          code.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'
                        }`}
                      >
                        {code.status === 'ACTIVE' ? '正常' : '已作废'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[10px] text-slate-400">
                      {new Date(code.createdAt).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {code.status === 'ACTIVE' ? (
                        <button
                          type="button"
                          onClick={() => onOpenItemCodeSinglePrint(plan, code)}
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
        {itemCodesTotal > TRACE_CODE_LIST_PAGE_SIZE && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              type="button"
              disabled={itemCodesPage <= 1 || itemCodesPaging || itemCodesLoading}
              onClick={() =>
                loadItemCodes(plan.id, itemCodesPage - 1, itemCodesVariantFilter, itemCodesBatchFilter, { silent: true })
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
              disabled={
                itemCodesPaging || itemCodesLoading || itemCodesPage >= Math.ceil(itemCodesTotal / TRACE_CODE_LIST_PAGE_SIZE)
              }
              onClick={() =>
                loadItemCodes(plan.id, itemCodesPage + 1, itemCodesVariantFilter, itemCodesBatchFilter, { silent: true })
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
);

export default ItemCodeListPanel;
