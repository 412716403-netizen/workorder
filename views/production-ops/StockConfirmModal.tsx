import React, { useMemo } from 'react';
import { Check, Package, Undo2, X } from 'lucide-react';
import type {
  ProductionOpRecord,
  ProductionOrder,
  Product,
  ProductCategory,
  Warehouse,
  AppDictionaries,
  PlanFormFieldConfig,
  PsiRecord,
} from '../../types';
import { categoryUsesBatchManagement } from '../../types';
import { PlanFormCustomFieldInput } from '../../components/PlanFormCustomFieldControls';
import { MaterialIssueBatchSelect } from '../../components/MaterialIssueBatchSelect';
import { getProductCategoryCustomFieldEntries } from '../../utils/reportCustomDocField';
import { usePsiStockIndex } from '../../hooks/usePsiStockIndex';

export interface StockConfirmModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  stockSelectMode: 'stock_out' | 'stock_return' | null;
  stockSelectOrderId: string | null;
  stockSelectSourceProductId: string | null;
  stockSelectedIds: Set<string>;
  stockConfirmQuantities: Record<string, number>;
  onQuantityChange: (productId: string, quantity: number) => void;
  stockConfirmWarehouseId: string;
  onWarehouseChange: (warehouseId: string) => void;
  stockConfirmReason: string;
  onReasonChange: (reason: string) => void;
  /** 确认领料/退料时填写的自定义项（showInCreate） */
  materialCustomFieldDefs?: PlanFormFieldConfig[];
  materialCustomValues?: Record<string, unknown>;
  onMaterialCustomValueChange?: (fieldId: string, value: unknown) => void;
  orders: ProductionOrder[];
  products: Product[];
  warehouses: Warehouse[];
  dictionaries?: AppDictionaries;
  partnerLabel?: string;
  categories?: ProductCategory[];
  /** 按物料行的批次（领料必选下拉；退料可手输） */
  lineBatchByProduct?: Record<string, string>;
  onLineBatchChange?: (productId: string, batchNo: string) => void;
  /** 进销存记录，用于与接口批次余量合并展示 */
  psiRecords?: PsiRecord[];
  /** 生产报工/领退料记录，与 psi 一起建库存索引 */
  prodRecords?: ProductionOpRecord[];
}

const StockConfirmModal: React.FC<StockConfirmModalProps> = ({
  visible,
  onClose,
  onSubmit,
  stockSelectMode,
  stockSelectOrderId,
  stockSelectSourceProductId,
  stockSelectedIds,
  stockConfirmQuantities,
  onQuantityChange,
  stockConfirmWarehouseId,
  onWarehouseChange,
  stockConfirmReason,
  onReasonChange,
  materialCustomFieldDefs = [],
  materialCustomValues = {},
  onMaterialCustomValueChange,
  orders,
  products,
  warehouses,
  dictionaries,
  partnerLabel,
  categories = [],
  lineBatchByProduct = {},
  onLineBatchChange,
  psiRecords = [],
  prodRecords = [],
}) => {
  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const { listAvailableBatches } = usePsiStockIndex(psiRecords, prodRecords);

  if (!visible || (!stockSelectOrderId && !stockSelectSourceProductId) || !stockSelectMode) return null;

  const order = stockSelectOrderId ? orders.find(o => o.id === stockSelectOrderId) : undefined;
  const srcProd = stockSelectSourceProductId ? products.find(p => p.id === stockSelectSourceProductId) : undefined;
  const selectedList: string[] = Array.from(stockSelectedIds);
  const hasValidQty = selectedList.some(pid => (stockConfirmQuantities[pid] ?? 0) > 0);
  const isReturn = stockSelectMode === 'stock_return';

  const getUnitName = (productId: string) => {
    const p = products.find(x => x.id === productId);
    return (p?.unitId && (dictionaries?.units ?? []).find(u => u.id === p.unitId)?.name) || '件';
  };

  /** 与工单中心物料发出一致：分类「表单中」自定义字段（不含附件） */
  const materialProductCustomTags = (productId: string) => {
    const p = productMap.get(productId);
    if (!p?.categoryId) return null;
    const entries = getProductCategoryCustomFieldEntries(p, categoryById.get(p.categoryId), { includeFile: false });
    if (entries.length === 0) return null;
    return (
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {entries.map(({ field, display }) => (
          <span key={field.id} className="text-[9px] font-bold text-slate-500 px-1.5 py-0.5 rounded bg-slate-50">
            {field.label}: {display}
          </span>
        ))}
      </div>
    );
  };

  const showBatchColumn = selectedList.some(pid => {
    const p = products.find(x => x.id === pid);
    return categoryUsesBatchManagement(categories.find(c => c.id === p?.categoryId));
  });

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div
        className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0 bg-white">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 flex-wrap">
              {isReturn ? (
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 shrink-0">
                  <Undo2 className="w-5 h-5" />
                </span>
              ) : (
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
                  <Package className="w-5 h-5" />
                </span>
              )}
              {partnerLabel && (
                <span
                  className="bg-amber-50 text-amber-800 px-3 py-1.5 rounded-lg text-sm font-black tracking-tight border border-amber-200/80 max-w-[min(100%,14rem)] truncate"
                  title={partnerLabel}
                >
                  {partnerLabel}
                </span>
              )}
              <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                {srcProd ? srcProd.name : (order?.orderNumber ?? '')}
              </span>
              {isReturn ? '确认退料' : '确认领料'}
            </h3>
            <p className="text-sm text-slate-500 mt-1 font-medium line-clamp-2">
              {srcProd?.name ?? (order ? (products.find(p => p.id === order.productId)?.name ?? order.productName ?? '—') : '—')}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">
              取消
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={!hasValidQty}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-50 ${isReturn ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
            >
              <Check className="w-4 h-4" /> {isReturn ? '确认退料' : '确认领料'}
            </button>
            <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50" aria-label="关闭">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-5 space-y-4">
          <div className={`grid gap-3 ${warehouses.length > 0 ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
            {warehouses.length > 0 && (
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                  {isReturn ? '退回仓库' : '出库仓库'}
                </label>
                <select
                  value={stockConfirmWarehouseId}
                  onChange={e => onWarehouseChange(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                      {w.code ? ` (${w.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">备注</label>
              <input
                type="text"
                value={stockConfirmReason}
                onChange={e => onReasonChange(e.target.value)}
                className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                placeholder="选填"
              />
            </div>
          </div>
          {materialCustomFieldDefs.length > 0 && onMaterialCustomValueChange ? (
            <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">
                {isReturn ? '退料自定义内容' : '领料自定义内容'}
              </h4>
              {materialCustomFieldDefs.map(cf => (
                <div key={cf.id} className="space-y-1">
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">{cf.label}</label>
                  <PlanFormCustomFieldInput
                    cf={cf}
                    value={materialCustomValues[cf.id]}
                    onChange={v => onMaterialCustomValueChange(cf.id, v)}
                    controlClassName="h-[52px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              ))}
            </div>
          ) : null}
          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full min-w-[720px] text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-100">
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 tracking-widest whitespace-nowrap">物料</th>
                  {showBatchColumn ? (
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 tracking-widest whitespace-nowrap w-52">批次</th>
                  ) : null}
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 tracking-widest text-right whitespace-nowrap w-40">数量</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-400 tracking-widest whitespace-nowrap w-20">单位</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {selectedList.map(pid => {
                  const prod = products.find(p => p.id === pid);
                  return (
                    <tr key={pid} className="hover:bg-slate-50/50">
                      <td className="px-4 py-4 align-top">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-sm font-bold text-slate-800">{prod?.name ?? pid}</span>
                          {prod?.sku ? (
                            <span className="text-xs font-bold text-slate-400 tabular-nums" title="产品编号">
                              {prod.sku}
                            </span>
                          ) : null}
                        </div>
                        {materialProductCustomTags(pid)}
                      </td>
                      {showBatchColumn ? (
                        <td className="px-4 py-4 align-middle">
                          <MaterialIssueBatchSelect
                            product={prod}
                            categories={categories}
                            warehouseId={stockConfirmWarehouseId}
                            value={lineBatchByProduct[pid] ?? ''}
                            onChange={v => onLineBatchChange?.(pid, v)}
                            mode="issue"
                            hideLabel
                            className="min-w-[170px]"
                            mergeBatches={listAvailableBatches(pid, stockConfirmWarehouseId)}
                          />
                        </td>
                      ) : null}
                      <td className="px-4 py-4 text-right">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={stockConfirmQuantities[pid] ?? ''}
                          onChange={e => onQuantityChange(pid, Number(e.target.value) || 0)}
                          className="w-full max-w-[8.5rem] ml-auto block rounded-2xl border border-slate-200 bg-white py-2.5 px-3 text-base font-black text-slate-800 text-right tabular-nums outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-4 py-4 text-slate-600 text-sm font-bold tabular-nums">{getUnitName(pid)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(StockConfirmModal);
