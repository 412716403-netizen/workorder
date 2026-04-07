import React from 'react';
import {
  Plus,
  X,
  ClipboardList,
  Layers,
  Save,
  Trash2,
} from 'lucide-react';
import { SearchableProductSelect } from '../../components/SearchableProductSelect';
import { Product, Warehouse, ProductCategory, AppDictionaries, ProductVariant } from '../../types';
import { sortedVariantColorEntries } from '../../utils/sortVariantsByProduct';

interface StocktakeItem {
  id: string;
  productId: string;
  quantity?: number;
  variantQuantities?: Record<string, number>;
}

export interface StocktakeOrderModalProps {
  open: boolean;
  onClose: () => void;
  editingDocNumber: string | null;
  stocktakeForm: { warehouseId: string; stocktakeDate: string; note: string };
  setStocktakeForm: React.Dispatch<React.SetStateAction<{ warehouseId: string; stocktakeDate: string; note: string }>>;
  stocktakeItems: StocktakeItem[];
  addStocktakeItem: () => void;
  updateStocktakeItem: (id: string, updates: Partial<{ productId: string; quantity?: number; variantQuantities?: Record<string, number> }>) => void;
  updateStocktakeVariantQty: (lineId: string, variantId: string, qty: number) => void;
  removeStocktakeItem: (id: string) => void;
  handleSaveStocktake: () => void;
  warehouses: Warehouse[];
  products: Product[];
  categories: ProductCategory[];
  productMapPSI: Map<string, Product>;
  dictionaries: AppDictionaries;
  getUnitName: (productId: string) => string;
  formatQtyDisplay: (q: number | string | undefined | null) => number;
  getVariantDisplayQty: (productId: string, warehouseId: string, variantId: string) => number;
  getStock: (productId: string, warehouseId: string, excludeStocktakeDocNumber?: string) => number;
}

const StocktakeOrderModal: React.FC<StocktakeOrderModalProps> = ({
  open,
  onClose,
  editingDocNumber,
  stocktakeForm,
  setStocktakeForm,
  stocktakeItems,
  addStocktakeItem,
  updateStocktakeItem,
  updateStocktakeVariantQty,
  removeStocktakeItem,
  handleSaveStocktake,
  warehouses,
  products,
  categories,
  productMapPSI,
  dictionaries,
  getUnitName,
  formatQtyDisplay,
  getVariantDisplayQty,
  getStock,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/50">
          <div>
            <h3 className="font-black text-slate-800 flex items-center gap-2 text-lg"><ClipboardList className="w-5 h-5 text-indigo-600" /> {editingDocNumber ? '编辑盘点单' : '盘点单'}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{editingDocNumber ? `单号：${editingDocNumber}` : '选择盘点仓库并录入实盘数量'}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/80 transition-colors" aria-label="关闭"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          <div className="bg-slate-50/80 rounded-2xl p-5 border border-slate-100">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">单据信息</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-1.5">盘点仓库</label>
                <select value={stocktakeForm.warehouseId} onChange={e => setStocktakeForm(f => ({ ...f, warehouseId: e.target.value }))} className="w-full text-sm py-2.5 px-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  <option value="">请选择</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-1.5">盘点日期</label>
                <input type="date" value={stocktakeForm.stocktakeDate} onChange={e => setStocktakeForm(f => ({ ...f, stocktakeDate: e.target.value }))} className="w-full text-sm py-2.5 px-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
              </div>
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="text-[10px] font-bold text-slate-500 block mb-1.5">备注</label>
                <input type="text" value={stocktakeForm.note} onChange={e => setStocktakeForm(f => ({ ...f, note: e.target.value }))} placeholder="选填" className="w-full text-sm py-2.5 px-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
              </div>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Layers className="w-4 h-4 text-indigo-500" /> 盘点明细（可多产品）</h4>
              <button type="button" onClick={addStocktakeItem} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-sm">
                <Plus className="w-4 h-4" /> 添加明细行
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-3">每行会显示当前「系统数量」供参考，录入实盘数量保存后将按差异调整库存。</p>
            <div className="space-y-3">
              {stocktakeItems.map((line) => {
                const stProd = productMapPSI.get(line.productId);
                const stHasVariants = stProd?.variants && stProd.variants.length > 0;
                const stLineQty = stHasVariants
                  ? Object.values(line.variantQuantities || {}).reduce((s, q) => s + q, 0)
                  : (line.quantity ?? 0);
                const stGroupedByColor: Record<string, ProductVariant[]> = {};
                if (stProd?.variants) {
                  stProd.variants.forEach(v => {
                    if (!stGroupedByColor[v.colorId]) stGroupedByColor[v.colorId] = [];
                    stGroupedByColor[v.colorId].push(v);
                  });
                }
                const isLineEmpty = !line.productId;
                const systemQtyForLine = line.productId && stocktakeForm.warehouseId
                  ? (stHasVariants && stProd?.variants
                      ? stProd.variants.reduce((s, v) => s + getVariantDisplayQty(line.productId!, stocktakeForm.warehouseId!, v.id), 0)
                      : getStock(line.productId, stocktakeForm.warehouseId, editingDocNumber ?? undefined))
                  : null;
                return (
                  <div key={line.id} className={`rounded-2xl border space-y-4 transition-all ${isLineEmpty ? 'bg-white border-slate-200 p-4 border-dashed' : 'bg-white border-slate-200 p-4 shadow-sm'}`}>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex-1 min-w-[200px] max-w-md space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">{isLineEmpty ? '选择产品' : '产品'}</label>
                        <SearchableProductSelect options={products} categories={categories} value={line.productId} onChange={(id) => {
                          const p = productMapPSI.get(id);
                          const hv = p?.variants && p.variants.length > 0;
                          updateStocktakeItem(line.id, { productId: id, quantity: hv ? undefined : 0, variantQuantities: hv ? {} : undefined });
                        }} />
                      </div>
                      {line.productId && stocktakeForm.warehouseId && (
                        <div className="w-28 space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 block">系统数量</label>
                          <div className="py-2.5 px-3 text-sm font-bold text-slate-600 bg-slate-50 rounded-xl border border-slate-200">
                            {systemQtyForLine != null ? systemQtyForLine : '—'} {getUnitName(line.productId)}
                          </div>
                        </div>
                      )}
                      {stHasVariants && (
                        <div className="w-24 space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 block">总数</label>
                          <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-indigo-50 rounded-xl border border-indigo-100">
                            {formatQtyDisplay(stLineQty)} {line.productId ? getUnitName(line.productId) : '—'}
                          </div>
                        </div>
                      )}
                      {!stHasVariants && (
                        <div className="w-28 space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 block">实盘数量</label>
                          <div className="flex items-center gap-1.5">
                            <input type="number" min={0} value={line.quantity ?? ''} onChange={e => updateStocktakeItem(line.id, { quantity: parseInt(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                            <span className="text-[10px] font-bold text-slate-400 shrink-0">{line.productId ? getUnitName(line.productId) : '—'}</span>
                          </div>
                        </div>
                      )}
                      <button type="button" onClick={() => removeStocktakeItem(line.id)} className="p-2.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all shrink-0" title="删除该行"><Trash2 className="w-5 h-5" /></button>
                    </div>
                    {stHasVariants && line.productId && (
                      <div className="pt-3 border-t border-slate-100 space-y-3">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">颜色尺码（{stocktakeForm.warehouseId ? '系统数量供参考，请录入实盘数量' : '请先选择盘点仓库后可显示系统数量' }）</label>
                        {sortedVariantColorEntries(stGroupedByColor, stProd?.colorIds, stProd?.sizeIds).map(([colorId, colorVariants]) => {
                          const color = dictionaries.colors.find(c => c.id === colorId);
                          return (
                            <div key={colorId} className="flex flex-wrap items-center gap-4 bg-slate-50/80 p-3 rounded-xl border border-slate-100">
                              <div className="flex items-center gap-2 w-28 shrink-0">
                                <div className="w-4 h-4 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: (color as any)?.value || '#e2e8f0' }} />
                                <span className="text-xs font-bold text-slate-700">{color?.name || '未命名'}</span>
                              </div>
                              <div className="flex flex-wrap gap-3">
                                {colorVariants.map(v => {
                                  const size = dictionaries.sizes.find(s => s.id === v.sizeId);
                                  const sysQtyV = stocktakeForm.warehouseId ? getVariantDisplayQty(line.productId, stocktakeForm.warehouseId, v.id) : null;
                                  return (
                                    <div key={v.id} className="flex flex-col gap-0.5 w-20">
                                      <span className="text-[9px] font-bold text-slate-400 uppercase">{size?.name || v.skuSuffix}</span>
                                      {sysQtyV != null && <span className="text-[9px] text-slate-500">系统 {sysQtyV}</span>}
                                      <input type="number" min={0} placeholder="0" value={line.variantQuantities?.[v.id] ?? ''} onChange={e => updateStocktakeVariantQty(line.id, v.id, parseInt(e.target.value) || 0)} className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-sm font-bold text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 text-center" />
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="ml-auto text-right shrink-0">
                                <span className="text-[9px] font-bold text-slate-400">小计</span>
                                <p className="text-sm font-black text-slate-600">{(colorVariants as ProductVariant[]).reduce((s, v) => s + (line.variantQuantities?.[v.id] || 0), 0)}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {stocktakeItems.length === 0 && (
                <div className="py-14 border-2 border-dashed border-slate-200 rounded-2xl text-center bg-slate-50/50">
                  <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm font-medium">暂无明细，点击「添加明细行」录入盘点数量</p>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleSaveStocktake}
                disabled={
                  !stocktakeForm.warehouseId ||
                  stocktakeItems.length === 0 ||
                  !stocktakeItems.some(i => {
                    if (!i.productId) return false;
                    const q = i.variantQuantities ? Object.values(i.variantQuantities).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
                    return q >= 0;
                  })
                }
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:pointer-events-none shadow-md"
              >
                <Save className="w-4 h-4" /> 保存盘点单
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(StocktakeOrderModal);
