import React from 'react';
import { ArrowDownToLine, X, Check } from 'lucide-react';
import type {
  ProductionOpRecord,
  ProductionOrder,
  Product,
  ProductCategory,
  ProductVariant,
  AppDictionaries,
} from '../../types';
import { sortedVariantColorEntries } from '../../utils/sortVariantsByProduct';

export interface ReceiveRow {
  orderId?: string;
  nodeId: string;
  productId: string;
  orderNumber?: string;
  productName: string;
  milestoneName: string;
  partner: string;
  dispatched: number;
  received: number;
  pending: number;
}

const RECEIVE_VARIANT_SEP = '__v__';

export interface OutsourceReceiveQuantityModalProps {
  productionLinkMode: 'order' | 'product';
  outsourceReceiveRows: ReceiveRow[];
  receiveSelectedKeys: Set<string>;
  receiveFormQuantities: Record<string, number>;
  setReceiveFormQuantities: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  receiveFormUnitPrices: Record<string, number>;
  setReceiveFormUnitPrices: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  receiveFormRemark: string;
  setReceiveFormRemark: React.Dispatch<React.SetStateAction<string>>;
  orders: ProductionOrder[];
  products: Product[];
  categories: ProductCategory[];
  dictionaries?: AppDictionaries;
  records: ProductionOpRecord[];
  onSubmit: () => void;
  onClose: () => void;
}

const OutsourceReceiveQuantityModal: React.FC<OutsourceReceiveQuantityModalProps> = ({
  productionLinkMode,
  outsourceReceiveRows,
  receiveSelectedKeys,
  receiveFormQuantities,
  setReceiveFormQuantities,
  receiveFormUnitPrices,
  setReceiveFormUnitPrices,
  receiveFormRemark,
  setReceiveFormRemark,
  orders,
  products,
  categories,
  dictionaries,
  records,
  onSubmit,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><ArrowDownToLine className="w-5 h-5 text-indigo-600" /> 外协收货 · 录入数量</h3>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">单据基本信息</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">外协工厂</label>
              <div className="w-full h-[52px] rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold text-slate-800 bg-slate-50 flex items-center">
                {(() => { const firstKey = receiveSelectedKeys.values().next().value; if (!firstKey) return '—'; const row = outsourceReceiveRows.find(r => (r.orderId != null ? `${r.orderId}|${r.nodeId}` : `${r.productId}|${r.nodeId}|${r.partner}`) === firstKey); return row?.partner || '—'; })()}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">备注说明</label>
              <input type="text" value={receiveFormRemark} onChange={e => setReceiveFormRemark(e.target.value)} placeholder="选填" className="w-full h-[52px] rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-400" />
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-auto min-h-0 p-6">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">商品明细</h4>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            {productionLinkMode === 'product'
              ? '关联产品且发出单按颜色尺码录入时，按规格收回；每格「最多」= 该规格已发出未收回数。若有未带规格的发出的数量，在下方「未按规格」行收回。'
              : '按规格收回时每格不超过该规格待收数量。'}
          </p>
          <div className="space-y-8">
          {outsourceReceiveRows.filter(row => receiveSelectedKeys.has(row.orderId != null ? `${row.orderId}|${row.nodeId}` : `${row.productId}|${row.nodeId}|${row.partner}`)).map(row => {
            const receiveRowKey = row.orderId != null ? `${row.orderId}|${row.nodeId}` : `${row.productId}|${row.nodeId}|${row.partner}`;
            const order = row.orderId != null ? orders.find(o => o.id === row.orderId) : undefined;
            const product = products.find(p => p.id === row.productId);
            const category = categories.find(c => c.id === product?.categoryId);
            const hasColorSize = productionLinkMode === 'order' && category?.hasColorSize && (product?.variants?.length ?? 0) > 1;
            const baseKey = receiveRowKey;
            const variantIdsInOrder = new Set((order?.items ?? []).map(i => i.variantId).filter(Boolean));
            const variantsInOrder = hasColorSize && product?.variants ? (product.variants as ProductVariant[]).filter(v => variantIdsInOrder.has(v.id)) : [];
            const dispatchRecords = productionLinkMode === 'product'
              ? records.filter(r => r.type === 'OUTSOURCE' && r.status === '加工中' && !r.orderId && r.productId === row.productId && r.nodeId === row.nodeId && (r.partner ?? '') === (row.partner ?? ''))
              : records.filter(r => r.type === 'OUTSOURCE' && r.status === '加工中' && r.orderId === row.orderId && r.nodeId === row.nodeId);
            const receiveRecords = productionLinkMode === 'product'
              ? records.filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && !r.orderId && r.productId === row.productId && r.nodeId === row.nodeId && (r.partner ?? '') === (row.partner ?? ''))
              : records.filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && r.orderId === row.orderId && r.nodeId === row.nodeId);
            const getPendingForVariant = (variantId: string) => {
              const dispatched = dispatchRecords.filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + r.quantity, 0);
              const received = receiveRecords.filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + r.quantity, 0);
              return Math.max(0, dispatched - received);
            };
            const isProductBlockRecv = productionLinkMode === 'product' && row.orderId == null;
            const blockOrdersRecv = isProductBlockRecv ? orders.filter(o => o.productId === row.productId) : [];
            const variantIdsInBlockRecv = new Set<string>();
            blockOrdersRecv.forEach(o => { (o.items ?? []).forEach(i => { if ((i.quantity ?? 0) > 0 && i.variantId) variantIdsInBlockRecv.add(i.variantId); }); });
            const hasMultiVariantRecv = (product?.variants?.length ?? 0) > 1;
            const variantsInProductBlockRecv = isProductBlockRecv && category?.hasColorSize && hasMultiVariantRecv && product?.variants ? (product.variants as ProductVariant[]).filter(v => variantIdsInBlockRecv.has(v.id)) : [];
            const hasVariantProductDispatchesRecv = dispatchRecords.some(r => !!r.variantId);
            const dispNoVarRecv = dispatchRecords.filter(r => !r.variantId).reduce((s, r) => s + r.quantity, 0);
            const recNoVarRecv = receiveRecords.filter(r => !r.variantId).reduce((s, r) => s + r.quantity, 0);
            const pendingNoVarRecv = Math.max(0, dispNoVarRecv - recNoVarRecv);

            if (isProductBlockRecv && variantsInProductBlockRecv.length > 0 && hasVariantProductDispatchesRecv) {
              const groupedPb: Record<string, ProductVariant[]> = {};
              variantsInProductBlockRecv.forEach(v => { if (!groupedPb[v.colorId]) groupedPb[v.colorId] = []; groupedPb[v.colorId].push(v); });
              const rowTotalPb = variantsInProductBlockRecv.reduce((s, v) => s + (receiveFormQuantities[`${baseKey}${RECEIVE_VARIANT_SEP}${v.id}`] ?? 0), 0) + (pendingNoVarRecv > 0 ? receiveFormQuantities[baseKey] ?? 0 : 0);
              const rowUnitPb = receiveFormUnitPrices[baseKey] ?? 0;
              const rowAmountPb = rowTotalPb * rowUnitPb;
              return (
                <div key={baseKey} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-4 space-y-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">关联产品 · 颜色尺码</span>
                    <span className="text-sm font-bold text-slate-800">{row.productName}</span>
                    <span className="text-sm font-bold text-indigo-600">{row.milestoneName}</span>
                    <span className="text-xs text-slate-500">待收回合计 {row.pending} 件</span>
                  </div>
                  <div className="space-y-4">
                    {sortedVariantColorEntries(groupedPb, product?.colorIds, product?.sizeIds).map(([colorId, colorVariants]) => {
                      const color = dictionaries?.colors?.find(c => c.id === colorId);
                      return (
                        <div key={colorId} className="flex flex-col md:flex-row md:items-center gap-4 p-4 bg-white rounded-xl border border-slate-100">
                          <div className="flex items-center gap-3 w-40 shrink-0">
                            <div className="w-5 h-5 rounded-full border border-slate-200" style={{ backgroundColor: color?.value }} />
                            <span className="text-sm font-black text-slate-700">{color?.name ?? colorId}</span>
                          </div>
                          <div className="flex-1 flex flex-wrap gap-4">
                            {colorVariants.map(v => {
                              const size = dictionaries?.sizes?.find(s => s.id === v.sizeId);
                              const qtyKey = `${baseKey}${RECEIVE_VARIANT_SEP}${v.id}`;
                              const maxV = getPendingForVariant(v.id);
                              const cellQ = receiveFormQuantities[qtyKey] ?? 0;
                              return (
                                <div key={v.id} className="flex flex-col gap-1 min-w-[64px]">
                                  <span className="text-[10px] font-bold text-slate-400">{size?.name ?? v.sizeId}</span>
                                  <input type="number" min={0} max={maxV} value={cellQ === 0 ? '' : cellQ} onChange={e => { const raw = Math.max(0, Math.floor(Number(e.target.value) || 0)); setReceiveFormQuantities(prev => ({ ...prev, [qtyKey]: Math.min(raw, maxV) })); }} placeholder={`最多${maxV}`} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[10px] placeholder:text-slate-400" />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {pendingNoVarRecv > 0 && (
                    <div className="p-4 bg-white rounded-xl border border-dashed border-slate-200 flex flex-wrap items-center gap-4">
                      <span className="text-sm font-bold text-slate-600">未按规格发出的待收回</span>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-slate-400">数量</span>
                        <input type="number" min={0} max={pendingNoVarRecv} value={(receiveFormQuantities[baseKey] ?? 0) === 0 ? '' : receiveFormQuantities[baseKey]} onChange={e => { const raw = Math.max(0, Math.floor(Number(e.target.value) || 0)); setReceiveFormQuantities(prev => ({ ...prev, [baseKey]: Math.min(raw, pendingNoVarRecv) })); }} placeholder={`最多${pendingNoVarRecv}`} className="w-36 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[10px] placeholder:text-slate-400" />
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">单价（元/件）</label>
                      <input type="number" min={0} step={0.01} value={receiveFormUnitPrices[baseKey] ?? ''} onChange={e => setReceiveFormUnitPrices(prev => ({ ...prev, [baseKey]: Number(e.target.value) || 0 }))} placeholder="0" className="w-28 rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-center focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">本行金额（元）</label>
                      <div className="w-28 rounded-xl border border-slate-100 bg-slate-50 py-2 px-3 text-sm font-bold text-slate-700 text-center min-h-[40px] flex items-center justify-center">{rowAmountPb.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              );
            }

            if (variantsInOrder.length > 0) {
              const groupedByColor: Record<string, ProductVariant[]> = {};
              variantsInOrder.forEach(v => { if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = []; groupedByColor[v.colorId].push(v); });
              const rowTotalQty = variantsInOrder.reduce((s, v) => s + (receiveFormQuantities[`${baseKey}|${v.id}`] ?? 0), 0);
              const rowUnitPrice = receiveFormUnitPrices[baseKey] ?? 0;
              const rowAmount = rowTotalQty * rowUnitPrice;
              return (
                <div key={baseKey} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-4 space-y-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    {productionLinkMode !== 'product' && row.orderNumber != null && <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">{row.orderNumber}</span>}
                    <span className="text-sm font-bold text-slate-800">{row.productName}</span>
                    <span className="text-sm font-bold text-indigo-600">{row.milestoneName}</span>
                  </div>
                  <div className="space-y-4">
                    {sortedVariantColorEntries(groupedByColor, product?.colorIds, product?.sizeIds).map(([colorId, colorVariants]) => {
                      const color = dictionaries?.colors?.find(c => c.id === colorId);
                      return (
                        <div key={colorId} className="flex flex-col md:flex-row md:items-center gap-4 p-4 bg-white rounded-xl border border-slate-100">
                          <div className="flex items-center gap-3 w-40 shrink-0">
                            <div className="w-5 h-5 rounded-full border border-slate-200" style={{ backgroundColor: color?.value }} />
                            <span className="text-sm font-black text-slate-700">{color?.name ?? colorId}</span>
                          </div>
                          <div className="flex-1 flex flex-wrap gap-4">
                            {colorVariants.map(v => {
                              const size = dictionaries?.sizes?.find(s => s.id === v.sizeId);
                              const qtyKey = `${baseKey}|${v.id}`;
                              const maxVariant = getPendingForVariant(v.id);
                              return (
                                <div key={v.id} className="flex flex-col gap-1.5 w-24">
                                  <span className="text-[10px] font-black text-slate-400 text-center uppercase">{size?.name ?? v.sizeId}</span>
                                  <div className="relative flex items-center bg-white border border-slate-200 rounded-xl focus-within:ring-2 focus-within:ring-indigo-500">
                                    <input type="number" min={0} max={maxVariant} value={receiveFormQuantities[qtyKey] ?? ''} onChange={e => setReceiveFormQuantities(prev => ({ ...prev, [qtyKey]: Number(e.target.value) || 0 }))} className="w-full bg-transparent rounded-xl py-1.5 pl-2 pr-12 text-sm font-bold text-indigo-600 text-center focus:ring-0 focus:outline-none" />
                                    <span className="absolute right-2 text-[10px] text-slate-400 pointer-events-none">最多{maxVariant}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">单价（元/件）</label>
                      <input type="number" min={0} step={0.01} value={receiveFormUnitPrices[baseKey] ?? ''} onChange={e => setReceiveFormUnitPrices(prev => ({ ...prev, [baseKey]: Number(e.target.value) || 0 }))} placeholder="0" className="w-28 rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-center focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">本行金额（元）</label>
                      <div className="w-28 rounded-xl border border-slate-100 bg-slate-50 py-2 px-3 text-sm font-bold text-slate-700 text-center min-h-[40px] flex items-center justify-center">{rowAmount.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <div key={baseKey} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center gap-4 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  {productionLinkMode !== 'product' && row.orderNumber != null && <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">{row.orderNumber}</span>}
                  <span className="text-sm font-bold text-slate-800">{row.productName}</span>
                  <span className="text-sm font-bold text-indigo-600">{row.milestoneName}</span>
                </div>
                <div className="flex items-center gap-4 flex-wrap flex-1">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">本次收回数量</label>
                    <div className="relative flex items-center bg-white border border-slate-200 rounded-xl w-32 focus-within:ring-2 focus-within:ring-indigo-500">
                      <input type="number" min={0} max={row.pending} value={receiveFormQuantities[baseKey] ?? ''} onChange={e => setReceiveFormQuantities(prev => ({ ...prev, [baseKey]: Number(e.target.value) || 0 }))} className="w-full bg-transparent rounded-xl py-2 pl-3 pr-10 text-sm font-bold text-indigo-600 text-center focus:ring-0 focus:outline-none" />
                      <span className="absolute right-2 text-[10px] text-slate-400 pointer-events-none">最多{row.pending}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">单价（元/件）</label>
                    <input type="number" min={0} step={0.01} value={receiveFormUnitPrices[baseKey] ?? ''} onChange={e => setReceiveFormUnitPrices(prev => ({ ...prev, [baseKey]: Number(e.target.value) || 0 }))} placeholder="0" className="w-28 rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-center focus:ring-2 focus:ring-indigo-500 outline-none" />
                    <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">金额（元）</label>
                    <div className="w-28 rounded-xl border border-slate-100 bg-slate-50 py-2 px-3 text-sm font-bold text-slate-700 text-center min-h-[40px] flex items-center justify-center">
                      {((receiveFormQuantities[baseKey] ?? 0) * (receiveFormUnitPrices[baseKey] ?? 0)).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 shrink-0">
          <button type="button" onClick={onSubmit} className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all">
            <Check className="w-4 h-4" /> 确认收货
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(OutsourceReceiveQuantityModal);
