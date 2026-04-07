import React from 'react';
import { Truck, X, Check } from 'lucide-react';
import type {
  ProductionOpRecord,
  ProductionOrder,
  Product,
  ProductCategory,
  ProductVariant,
  AppDictionaries,
  GlobalNodeTemplate,
  Partner,
  PartnerCategory,
  ProcessSequenceMode,
  ProductMilestoneProgress,
} from '../../types';
import { SearchablePartnerSelect } from '../../components/SearchablePartnerSelect';
import { sortedVariantColorEntries } from '../../utils/sortVariantsByProduct';
import { variantMaxGoodProductMode } from '../../utils/productReportAggregates';

export interface DispatchRow {
  orderId?: string;
  orderNumber?: string;
  productId: string;
  productName: string;
  nodeId: string;
  milestoneName: string;
  orderTotalQty: number;
  reportedQty: number;
  dispatchedQty: number;
  availableQty: number;
}

export interface OutsourceDispatchQuantityModalProps {
  productionLinkMode: 'order' | 'product';
  outsourceDispatchRows: DispatchRow[];
  dispatchSelectedKeys: Set<string>;
  dispatchPartnerName: string;
  setDispatchPartnerName: React.Dispatch<React.SetStateAction<string>>;
  dispatchRemark: string;
  setDispatchRemark: React.Dispatch<React.SetStateAction<string>>;
  dispatchFormQuantities: Record<string, number>;
  setDispatchFormQuantities: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  orders: ProductionOrder[];
  products: Product[];
  categories: ProductCategory[];
  dictionaries?: AppDictionaries;
  globalNodes: GlobalNodeTemplate[];
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  records: ProductionOpRecord[];
  processSequenceMode: ProcessSequenceMode;
  productMilestoneProgresses: ProductMilestoneProgress[];
  defectiveReworkByOrderForOutsource: Map<string, { defective: number; rework: number; reworkByVariant?: Record<string, number> }>;
  onSubmit: () => void;
  onClose: () => void;
}

const OutsourceDispatchQuantityModal: React.FC<OutsourceDispatchQuantityModalProps> = ({
  productionLinkMode,
  outsourceDispatchRows,
  dispatchSelectedKeys,
  dispatchPartnerName,
  setDispatchPartnerName,
  dispatchRemark,
  setDispatchRemark,
  dispatchFormQuantities,
  setDispatchFormQuantities,
  orders,
  products,
  categories,
  dictionaries,
  globalNodes,
  partners,
  partnerCategories,
  records,
  processSequenceMode,
  productMilestoneProgresses,
  defectiveReworkByOrderForOutsource,
  onSubmit,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Truck className="w-5 h-5 text-indigo-600" /> 外协发出 · 录入数量</h3>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">单据基本信息</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">外协工厂</label>
              <SearchablePartnerSelect
                options={partners}
                categories={partnerCategories}
                value={dispatchPartnerName}
                onChange={name => setDispatchPartnerName(name)}
                placeholder="搜索并选择外协工厂..."
                triggerClassName="bg-white border border-slate-200 min-h-[52px] rounded-xl"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">备注说明</label>
              <input type="text" value={dispatchRemark} onChange={e => setDispatchRemark(e.target.value)} placeholder="选填" className="w-full h-[52px] rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-400" />
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-auto min-h-0 p-6">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">商品明细</h4>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            {productionLinkMode === 'product'
              ? '有颜色尺码的产品按规格录入委外数量。每格「最多」与工单中心 · 关联产品报工该工序一致（规格级可报良品余量，已扣本工序已报良品；再扣本规格已外协未收回）。无规格区分的单规格产品可填合计。'
              : '有颜色尺码的工单按规格录入。每格「最多」与该工序可报最多数量一致（顺序模式以前工序该规格完成量为基数），再扣已报良品及已外协未收回。'}
          </p>
          <div className="space-y-8">
          {outsourceDispatchRows.filter(row => dispatchSelectedKeys.has(row.orderId != null ? `${row.orderId}|${row.nodeId}` : `${row.productId}|${row.nodeId}`)).map(row => {
            const dispatchRowKey = row.orderId != null ? `${row.orderId}|${row.nodeId}` : `${row.productId}|${row.nodeId}`;
            const order = row.orderId != null ? orders.find(o => o.id === row.orderId) : undefined;
            const product = products.find(p => p.id === row.productId);
            const category = categories.find(c => c.id === product?.categoryId);
            const isProductBlock = productionLinkMode === 'product' && row.orderId == null;
            const blockOrders = isProductBlock ? orders.filter(o => o.productId === row.productId) : [];
            const variantIdsInBlock = new Set<string>();
            blockOrders.forEach(o => { (o.items ?? []).forEach(i => { if ((i.quantity ?? 0) > 0 && i.variantId) variantIdsInBlock.add(i.variantId); }); });
            const variantIdsInOrder = new Set((order?.items ?? []).map(i => i.variantId).filter(Boolean));
            const hasMultiVariantProduct = (product?.variants?.length ?? 0) > 1;
            const hasColorSizeOrder = productionLinkMode === 'order' && category?.hasColorSize && hasMultiVariantProduct;
            const hasColorSizeProduct = isProductBlock && category?.hasColorSize && hasMultiVariantProduct;
            const baseKey = dispatchRowKey;
            const variantsInOrder = hasColorSizeOrder && product?.variants ? (product.variants as ProductVariant[]).filter(v => variantIdsInOrder.has(v.id)) : [];
            const variantsInProductBlock = hasColorSizeProduct && product?.variants ? (product.variants as ProductVariant[]).filter(v => variantIdsInBlock.has(v.id)) : [];

            if (variantsInOrder.length > 0) {
              const ms = order?.milestones?.find(m => m.templateId === row.nodeId);
              const msIdx = order?.milestones?.findIndex(m => m.templateId === row.nodeId) ?? -1;
              const prevMs = (processSequenceMode === 'sequential' && msIdx > 0) ? order?.milestones?.[msIdx - 1] : undefined;
              const outsourceDispatchedForNode = records.filter(r => r.type === 'OUTSOURCE' && r.status === '加工中' && r.orderId === row.orderId && r.nodeId === row.nodeId);
              const drForNode = row.orderId ? (defectiveReworkByOrderForOutsource.get(`${row.orderId}|${row.nodeId}`) ?? { defective: 0, rework: 0, reworkByVariant: {} as Record<string, number> }) : { defective: 0, rework: 0, reworkByVariant: {} as Record<string, number> };
              const getAvailableForVariant = (variantId: string) => {
                const completedInMs = (ms?.reports ?? []).filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + Number(r.quantity), 0);
                const defectiveForVariant = (ms?.reports ?? []).filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + Number(r.defectiveQuantity ?? 0), 0);
                let seqRemaining: number;
                if (prevMs) {
                  const prevCompleted = (prevMs.reports ?? []).filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + Number(r.quantity), 0);
                  seqRemaining = prevCompleted - completedInMs;
                } else {
                  const orderItem = order?.items?.find(i => (i.variantId || '') === variantId);
                  seqRemaining = (orderItem?.quantity ?? 0) - completedInMs;
                }
                const base = Math.max(0, seqRemaining - defectiveForVariant);
                const reworkForVariant = drForNode.reworkByVariant?.[variantId] ?? 0;
                const dispatched = outsourceDispatchedForNode.filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + r.quantity, 0);
                return Math.max(0, base + reworkForVariant - dispatched);
              };
              const groupedByColor: Record<string, ProductVariant[]> = {};
              variantsInOrder.forEach(v => { if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = []; groupedByColor[v.colorId].push(v); });
              return (
                <div key={baseKey} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-4 space-y-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    {row.orderNumber != null && <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">{row.orderNumber}</span>}
                    <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">颜色尺码</span>
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
                              const maxVariant = getAvailableForVariant(v.id);
                              const cellQty = dispatchFormQuantities[qtyKey] ?? 0;
                              return (
                                <div key={v.id} className="flex flex-col gap-1 min-w-[64px]">
                                  <span className="text-[10px] font-bold text-slate-400">{size?.name ?? v.sizeId}</span>
                                  <input type="number" min={0} max={maxVariant} value={cellQty === 0 ? '' : cellQty} onChange={e => { const raw = Math.max(0, Math.floor(Number(e.target.value) || 0)); setDispatchFormQuantities(prev => ({ ...prev, [qtyKey]: Math.min(raw, maxVariant) })); }} placeholder={`最多${maxVariant}`} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[10px] placeholder:text-slate-400" />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }

            if (variantsInProductBlock.length > 0) {
              const getDr = (oid: string, tid: string) => defectiveReworkByOrderForOutsource.get(`${oid}|${tid}`) ?? { defective: 0, rework: 0, reworkByVariant: {} as Record<string, number> };
              const milestoneNodeIds = product?.milestoneNodeIds || [];
              const seq = (processSequenceMode ?? 'free') as ProcessSequenceMode;
              const outsourcedProductNode = records.filter(r => r.type === 'OUTSOURCE' && r.status === '加工中' && !r.orderId && r.productId === row.productId && r.nodeId === row.nodeId);
              const getAvailableForVariantProduct = (variantId: string) => {
                const maxGood = variantMaxGoodProductMode(variantId, row.nodeId, row.productId, blockOrders, productMilestoneProgresses || [], seq, milestoneNodeIds, getDr);
                const dispatched = outsourcedProductNode.filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + r.quantity, 0);
                return Math.max(0, maxGood - dispatched);
              };
              const groupedByColor: Record<string, ProductVariant[]> = {};
              variantsInProductBlock.forEach(v => { if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = []; groupedByColor[v.colorId].push(v); });
              return (
                <div key={baseKey} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-4 space-y-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">关联产品 · 颜色尺码</span>
                    <span className="text-sm font-bold text-slate-800">{row.productName}</span>
                    <span className="text-sm font-bold text-indigo-600">{row.milestoneName}</span>
                    <span className="text-xs text-slate-500">（合计可委外 {row.availableQty}，按规格之和填写）</span>
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
                              const maxVariant = getAvailableForVariantProduct(v.id);
                              const cellQty = dispatchFormQuantities[qtyKey] ?? 0;
                              return (
                                <div key={v.id} className="flex flex-col gap-1 min-w-[64px]">
                                  <span className="text-[10px] font-bold text-slate-400">{size?.name ?? v.sizeId}</span>
                                  <input type="number" min={0} max={maxVariant} value={cellQty === 0 ? '' : cellQty} onChange={e => { const raw = Math.max(0, Math.floor(Number(e.target.value) || 0)); setDispatchFormQuantities(prev => ({ ...prev, [qtyKey]: Math.min(raw, maxVariant) })); }} placeholder={`最多${maxVariant}`} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[10px] placeholder:text-slate-400" />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }

            return (
              <div key={baseKey} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-3 flex-wrap">
                  {productionLinkMode !== 'product' && row.orderNumber != null && <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">{row.orderNumber}</span>}
                  {isProductBlock && <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">单规格/无尺码矩阵</span>}
                  <span className="text-sm font-bold text-slate-800">{row.productName}</span>
                  <span className="text-sm font-bold text-indigo-600">{row.milestoneName}</span>
                </div>
                <div className="flex flex-col gap-1 flex-1 max-w-xs">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">委外数量</label>
                  <input type="number" min={0} max={row.availableQty} value={(dispatchFormQuantities[baseKey] ?? 0) === 0 ? '' : dispatchFormQuantities[baseKey]} onChange={e => { const raw = Math.max(0, Math.floor(Number(e.target.value) || 0)); setDispatchFormQuantities(prev => ({ ...prev, [baseKey]: Math.min(raw, row.availableQty) })); }} placeholder={`最多${row.availableQty}`} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[10px] placeholder:text-slate-400" />
                  <span className="text-[10px] text-slate-500">{isProductBlock ? '与报工页本工序合计上限一致' : '下单 − 已报 − 已发出'}</span>
                </div>
              </div>
            );
          })}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 shrink-0">
          <button type="button" onClick={onSubmit} className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all">
            <Check className="w-4 h-4" /> 确认发出
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(OutsourceDispatchQuantityModal);
