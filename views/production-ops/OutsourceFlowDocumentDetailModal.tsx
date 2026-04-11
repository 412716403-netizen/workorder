import React, { useState } from 'react';
import { ScrollText, X, Check, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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
} from '../../types';
import { hasOpsPerm } from './types';
import { SearchablePartnerSelect } from '../../components/SearchablePartnerSelect';
import { useConfirm } from '../../contexts/ConfirmContext';
import { sortedVariantColorEntries } from '../../utils/sortVariantsByProduct';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import * as api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { currentOperatorDisplayName } from '../../utils/currentOperatorDisplayName';

export interface OutsourceFlowDocumentDetailModalProps {
  productionLinkMode: 'order' | 'product';
  flowDetailKey: string;
  records: ProductionOpRecord[];
  orders: ProductionOrder[];
  products: Product[];
  categories: ProductCategory[];
  dictionaries?: AppDictionaries;
  globalNodes: GlobalNodeTemplate[];
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  userPermissions?: string[];
  tenantRole?: string;
  onAddRecord: (record: ProductionOpRecord) => void;
  onAddRecordBatch?: (records: ProductionOpRecord[]) => Promise<void>;
  onUpdateRecord?: (record: ProductionOpRecord) => void;
  onDeleteRecord?: (recordId: string) => void;
  onClose: () => void;
}

const OutsourceFlowDocumentDetailModal: React.FC<OutsourceFlowDocumentDetailModalProps> = ({
  productionLinkMode,
  flowDetailKey,
  records,
  orders,
  products,
  categories,
  dictionaries,
  globalNodes,
  partners,
  partnerCategories,
  userPermissions,
  tenantRole,
  onAddRecord,
  onAddRecordBatch,
  onUpdateRecord,
  onDeleteRecord,
  onClose,
}) => {
  const { currentUser } = useAuth();
  const flowDetailOperatorFallback = currentOperatorDisplayName(currentUser);
  const confirm = useConfirm();
  const [flowDetailEditMode, setFlowDetailEditMode] = useState(false);
  const [flowDetailEditPartner, setFlowDetailEditPartner] = useState('');
  const [flowDetailEditRemark, setFlowDetailEditRemark] = useState('');
  const [flowDetailQuantities, setFlowDetailQuantities] = useState<Record<string, number>>({});
  const [flowDetailUnitPrices, setFlowDetailUnitPrices] = useState<Record<string, number>>({});

  const docRecords = records.filter(r => r.type === 'OUTSOURCE' && r.docNo === flowDetailKey);
  if (docRecords.length === 0) return null;
  const first = docRecords[0];
  const isReceiveDoc = first.status === '已收回';
  const isFromCollabReturn = docRecords.some(r => (r as any).collabData?.source === 'collaborationReturn');
  const totalAmount = isReceiveDoc ? docRecords.reduce((s, r) => s + (r.amount ?? 0), 0) : 0;
  const docDateStr = first.timestamp ? (() => { try { const d = new Date(first.timestamp); return isNaN(d.getTime()) ? first.timestamp : d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); } catch { return first.timestamp; } })() : '—';
  const docPartner = first.partner ?? '—';
  const docRemark = docRecords.map(r => r.reason).filter(Boolean)[0] ?? '—';
  const isProductModeDetail = productionLinkMode === 'product' && docRecords.some(r => !r.orderId);
  const byOrderNode = new Map<string, ProductionOpRecord[]>();
  docRecords.forEach(rec => {
    if (!rec.nodeId) return;
    const key = isProductModeDetail ? `${rec.productId}|${rec.nodeId}` : (rec.orderId ? `${rec.orderId}|${rec.nodeId}` : '');
    if (!key) return;
    if (!byOrderNode.has(key)) byOrderNode.set(key, []);
    byOrderNode.get(key)!.push(rec);
  });
  const detailLines = Array.from(byOrderNode.entries()).map(([key, recs]) => {
    const order = recs[0].orderId ? orders.find(o => o.id === recs[0].orderId) : undefined;
    const product = products.find(p => p.id === (order?.productId ?? recs[0].productId));
    const nodeName = recs[0].nodeId ? (globalNodes.find(n => n.id === recs[0].nodeId)?.name ?? recs[0].nodeId) : '—';
    const variantQty: Record<string, number> = {};
    recs.forEach(r => { const v = r.variantId || ''; if (!variantQty[v]) variantQty[v] = 0; variantQty[v] += r.quantity; });
    return { key, order, product, orderNumber: order?.orderNumber ?? (isProductModeDetail ? '' : recs[0].orderId), productName: product?.name ?? '—', nodeName, records: recs, variantQty };
  });

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60" onClick={() => { onClose(); setFlowDetailEditMode(false); }} aria-hidden />
      <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><ScrollText className="w-5 h-5 text-indigo-600" /> 单据详情 · {flowDetailKey}</h3>
          <div className="flex items-center gap-2">
            {flowDetailEditMode ? (
              <>
                <button type="button" onClick={() => { setFlowDetailEditMode(false); setFlowDetailUnitPrices({}); }} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">取消</button>
                <button type="button" onClick={async () => {
                  if (!onDeleteRecord) return;
                  const partnerName = (flowDetailEditPartner || '').trim();
                  if (!partnerName) { return; }
                  const entries = (Object.entries(flowDetailQuantities) as [string, number][]).filter(([, qty]) => qty > 0);
                  if (entries.length === 0) { return; }
                  const toDelete = isReceiveDoc ? docRecords : docRecords.filter(r => r.status !== '已收回');
                  let preservedCollabData: any;
                  for (const rec of toDelete) { const cd = (rec as any).collabData; if (cd) { preservedCollabData = cd; break; } }
                  for (const rec of toDelete) await onDeleteRecord(rec.id);
                  const timestamp = first.timestamp || new Date().toLocaleString();
                  const newStatus = isReceiveDoc ? '已收回' : '加工中';
                  const batch: ProductionOpRecord[] = [];
                  entries.forEach(([key, qty]) => {
                    const parts = key.split('|');
                    const nodeId = parts[1];
                    const variantId = parts[2];
                    if (isProductModeDetail) {
                      const productId = parts[0];
                      const bk = parts.length >= 2 ? `${productId}|${nodeId}` : key;
                      const unitPrice = isReceiveDoc ? (flowDetailUnitPrices[key] ?? flowDetailUnitPrices[bk] ?? 0) : undefined;
                      const amount = isReceiveDoc && unitPrice != null ? Number(qty) * unitPrice : undefined;
                      batch.push({ id: `wx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type: 'OUTSOURCE', productId, quantity: qty, reason: flowDetailEditRemark.trim() || undefined, operator: first.operator || flowDetailOperatorFallback, timestamp, status: newStatus, partner: partnerName, docNo: flowDetailKey, nodeId, variantId: variantId || undefined, unitPrice: unitPrice || undefined, amount: amount ?? undefined, ...(preservedCollabData ? { collabData: preservedCollabData } : {}) } as ProductionOpRecord);
                      return;
                    }
                    const orderId = parts[0];
                    const bk = parts.length >= 2 ? `${orderId}|${nodeId}` : key;
                    const order = orders.find(o => o.id === orderId);
                    if (!order) return;
                    const unitPrice = isReceiveDoc ? (flowDetailUnitPrices[key] ?? flowDetailUnitPrices[bk] ?? 0) : undefined;
                    const amount = isReceiveDoc && unitPrice != null ? Number(qty) * unitPrice : undefined;
                    batch.push({ id: `wx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type: 'OUTSOURCE', orderId, productId: order.productId, quantity: qty, reason: flowDetailEditRemark.trim() || undefined, operator: first.operator || flowDetailOperatorFallback, timestamp, status: newStatus, partner: partnerName, docNo: flowDetailKey, nodeId, variantId: variantId || undefined, unitPrice: unitPrice || undefined, amount: amount ?? undefined, ...(preservedCollabData ? { collabData: preservedCollabData } : {}) } as ProductionOpRecord);
                  });
                  if (onAddRecordBatch && batch.length > 1) { await onAddRecordBatch(batch); } else { for (const rec of batch) await onAddRecord(rec); }

                  const collabDispatchIds = new Set<string>();
                  for (const rec of toDelete) {
                    const cd = (rec as any).collabData;
                    if (cd?.dispatchId) collabDispatchIds.add(cd.dispatchId);
                  }
                  if (collabDispatchIds.size > 0) {
                    const newRecordIds = batch.map(r => r.id);
                    const doSync = await confirm({ message: '此单据关联协作发出（已同步给乙方）。是否将编辑后的数据同步给乙方？\n\n选择"确认"将推送修订给乙方确认。' });
                    if (doSync) {
                      for (const dispatchId of collabDispatchIds) {
                        try {
                          await api.collaboration.updateDispatchPayload(dispatchId, { recordIds: newRecordIds });
                          toast.success('已更新同步数据');
                        } catch (err: any) {
                          if (err.message?.includes('仅待接受')) {
                            try {
                              await api.collaboration.amendDispatch(dispatchId, { recordIds: newRecordIds });
                              toast.success('已向乙方推送修订');
                            } catch (e2: any) {
                              toast.error(`同步失败: ${e2.message || '未知错误'}`);
                            }
                          } else {
                            toast.error(`同步失败: ${err.message || '未知错误'}`);
                          }
                        }
                      }
                    }
                  }

                  setFlowDetailEditMode(false);
                  setFlowDetailUnitPrices({});
                }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700">
                  <Check className="w-4 h-4" /> 保存
                </button>
              </>
            ) : (
              <>
                {onUpdateRecord && hasOpsPerm(tenantRole, userPermissions, 'production:outsource_records:edit') && (
                  <button type="button" onClick={() => {
                    setFlowDetailEditPartner(docPartner);
                    setFlowDetailEditRemark(docRemark);
                    const initQty: Record<string, number> = {};
                    docRecords.forEach(r => { const k = isProductModeDetail ? `${r.productId}|${r.nodeId}${r.variantId ? '|' + r.variantId : ''}` : `${r.orderId}|${r.nodeId}${r.variantId ? '|' + r.variantId : ''}`; initQty[k] = (initQty[k] || 0) + r.quantity; });
                    setFlowDetailQuantities(initQty);
                    if (isReceiveDoc) {
                      const initUnitPrice: Record<string, number> = {};
                      docRecords.forEach(r => { const k = isProductModeDetail ? `${r.productId}|${r.nodeId}${r.variantId ? '|' + r.variantId : ''}` : `${r.orderId}|${r.nodeId}${r.variantId ? '|' + r.variantId : ''}`; initUnitPrice[k] = r.unitPrice ?? 0; });
                      docRecords.forEach(r => { if (r.variantId) { const base = isProductModeDetail ? `${r.productId}|${r.nodeId}` : `${r.orderId}|${r.nodeId}`; if (initUnitPrice[base] == null) initUnitPrice[base] = r.unitPrice ?? 0; } });
                      setFlowDetailUnitPrices(initUnitPrice);
                    } else { setFlowDetailUnitPrices({}); }
                    setFlowDetailEditMode(true);
                  }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">
                    <Pencil className="w-4 h-4" /> 编辑
                  </button>
                )}
                {onDeleteRecord && hasOpsPerm(tenantRole, userPermissions, 'production:outsource_records:delete') && (
                  <button type="button" onClick={() => {
                    void confirm({ message: '确定要删除该张外协单的所有记录吗？此操作不可恢复。', danger: true }).then((ok) => {
                      if (!ok) return;
                      docRecords.forEach(rec => onDeleteRecord(rec.id));
                      onClose();
                      setFlowDetailEditMode(false);
                    });
                  }} className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-bold">
                    <Trash2 className="w-4 h-4" /> 删除
                  </button>
                )}
              </>
            )}
            <button type="button" onClick={() => { onClose(); setFlowDetailEditMode(false); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
          </div>
        </div>
        {flowDetailEditMode && isFromCollabReturn && (
          <div className="px-6 py-3 border-b border-amber-200 bg-amber-50 shrink-0 flex items-start gap-2">
            <span className="text-amber-500 text-sm mt-0.5">⚠</span>
            <p className="text-xs text-amber-700 leading-relaxed">此单据来源于协作回传，本地修改<strong>不会</strong>同步到乙方。如需双方数据一致，请通知乙方在协作管理中编辑并重新同步。</p>
          </div>
        )}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">单据基本信息</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">单号</label>
              <div className="w-full h-[52px] rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold text-slate-800 bg-white flex items-center">{flowDetailKey}</div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">日期</label>
              <div className="w-full h-[52px] rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold text-slate-800 bg-white flex items-center">{docDateStr}</div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">外协工厂</label>
              {flowDetailEditMode ? (
                <SearchablePartnerSelect options={partners} categories={partnerCategories} value={flowDetailEditPartner} onChange={name => setFlowDetailEditPartner(name)} placeholder="搜索并选择外协工厂..." triggerClassName="bg-white border border-slate-200 min-h-[52px] rounded-xl" />
              ) : (
                <div className="w-full h-[52px] rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold text-slate-800 bg-white flex items-center">{docPartner}</div>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">备注说明</label>
              {flowDetailEditMode ? (
                <input type="text" value={flowDetailEditRemark} onChange={e => setFlowDetailEditRemark(e.target.value)} placeholder="选填" className="w-full h-[52px] rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-400" />
              ) : (
                <div className="w-full h-[52px] rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold text-slate-800 bg-white flex items-center truncate" title={docRemark}>{docRemark}</div>
              )}
            </div>
            {isReceiveDoc && (
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">加工费合计（元）</label>
                <div className="w-full h-[52px] rounded-xl border border-slate-200 py-3 px-4 text-sm font-bold text-slate-800 bg-emerald-50 flex items-center">{totalAmount.toFixed(2)}</div>
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-auto min-h-0 p-6">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">商品明细</h4>
          <div className="space-y-8">
            {detailLines.map(({ key, order, product, orderNumber, productName, nodeName, records: lineRecords, variantQty }) => {
              const category = categories.find(c => c.id === product?.categoryId);
              const matrixEnabled = productHasColorSizeMatrix(product, category);
              const allProductVariants = (product?.variants as ProductVariant[]) ?? [];
              const variantIdsInOrder = new Set((order?.items ?? []).map(i => i.variantId).filter(Boolean));
              const variantIdsFromRecords = new Set(Object.entries(variantQty).filter(([vid, q]) => vid !== '' && (Number(q) || 0) !== 0).map(([vid]) => vid));
              let variantsForDetail: ProductVariant[] = [];
              if (matrixEnabled && allProductVariants.length > 0) {
                if (variantIdsInOrder.size > 0) variantsForDetail = allProductVariants.filter(v => variantIdsInOrder.has(v.id));
                if (variantsForDetail.length === 0 && variantIdsFromRecords.size > 0) variantsForDetail = allProductVariants.filter(v => variantIdsFromRecords.has(v.id));
                if (variantsForDetail.length === 0) variantsForDetail = [...allProductVariants];
              }
              const showVariantQtyGrid = matrixEnabled && variantsForDetail.length > 0;
              if (showVariantQtyGrid) {
                const groupedByColor: Record<string, ProductVariant[]> = {};
                variantsForDetail.forEach(v => { if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = []; groupedByColor[v.colorId].push(v); });
                return (
                  <div key={key} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-4 space-y-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      {productionLinkMode !== 'product' && orderNumber != null && orderNumber !== '' && <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">{orderNumber}</span>}
                      <span className="text-sm font-bold text-slate-800">{productName}</span>
                      <span className="text-sm font-bold text-indigo-600">{nodeName}</span>
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
                                const qtyKey = `${key}|${v.id}`;
                                const qty = flowDetailEditMode ? (flowDetailQuantities[qtyKey] ?? variantQty[v.id] ?? 0) : (variantQty[v.id] ?? 0);
                                return (
                                  <div key={v.id} className="flex flex-col gap-1.5 w-24">
                                    <span className="text-[10px] font-black text-slate-400 text-center uppercase">{size?.name ?? v.sizeId}</span>
                                    {flowDetailEditMode ? (
                                      <input type="number" min={0} value={flowDetailQuantities[qtyKey] ?? ''} onChange={e => setFlowDetailQuantities(prev => ({ ...prev, [qtyKey]: Number(e.target.value) || 0 }))} className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-indigo-600 text-center focus:outline-none" />
                                    ) : (
                                      <div className="flex items-center justify-center bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm font-bold text-indigo-600 min-h-[40px]">{qty}</div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {isReceiveDoc && (
                      <div className="flex flex-wrap items-center gap-4 pt-4 mt-4 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">单价（元/件）</label>
                          {flowDetailEditMode ? (
                            <input type="number" min={0} step={0.01} value={flowDetailUnitPrices[key] ?? ''} onChange={e => setFlowDetailUnitPrices(prev => ({ ...prev, [key]: Number(e.target.value) || 0 }))} placeholder="0" className="w-28 rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                          ) : (
                            <div className="w-28 rounded-xl border border-slate-100 bg-slate-50 py-2 px-3 text-sm font-bold text-slate-700 text-center min-h-[40px] flex items-center justify-center">{lineRecords[0]?.unitPrice != null ? Number(lineRecords[0].unitPrice).toFixed(2) : '—'}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">本行金额（元）</label>
                          <div className="w-28 rounded-xl border border-slate-100 bg-slate-50 py-2 px-3 text-sm font-bold text-slate-700 text-center min-h-[40px] flex items-center justify-center">
                            {flowDetailEditMode
                              ? variantsForDetail.reduce((sum, v) => { const qk = `${key}|${v.id}`; const q = flowDetailQuantities[qk] ?? variantQty[v.id] ?? 0; const up = flowDetailUnitPrices[qk] ?? flowDetailUnitPrices[key] ?? lineRecords.find(r => (r.variantId || '') === v.id)?.unitPrice ?? 0; return sum + q * up; }, 0).toFixed(2)
                              : lineRecords.reduce((s, r) => s + (r.amount ?? 0), 0).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }
              const totalQty = Object.values(variantQty).reduce((s, n) => s + n, 0);
              const singleQty = flowDetailEditMode ? (flowDetailQuantities[key] ?? totalQty) : totalQty;
              const lineRec = lineRecords[0];
              const lineUnitPrice = flowDetailEditMode && isReceiveDoc ? (flowDetailUnitPrices[key] ?? lineRec?.unitPrice ?? 0) : (lineRec?.unitPrice ?? 0);
              const lineAmount = flowDetailEditMode && isReceiveDoc ? (singleQty * lineUnitPrice) : (lineRec?.amount ?? 0);
              return (
                <div key={key} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-6 flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-3 flex-wrap">
                      {productionLinkMode !== 'product' && orderNumber != null && orderNumber !== '' && <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">{orderNumber}</span>}
                      <span className="text-sm font-bold text-slate-800">{productName}</span>
                      <span className="text-sm font-bold text-indigo-600">{nodeName}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">委外数量</label>
                      {flowDetailEditMode ? (
                        <input type="number" min={0} value={flowDetailQuantities[key] ?? ''} onChange={e => setFlowDetailQuantities(prev => ({ ...prev, [key]: Number(e.target.value) || 0 }))} className="w-32 rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-indigo-600 text-center focus:outline-none" />
                      ) : (
                        <div className="flex items-center justify-center bg-slate-50 border border-slate-200 rounded-xl w-32 py-2 px-3 text-sm font-bold text-indigo-600 min-h-[40px]">{totalQty}</div>
                      )}
                    </div>
                  </div>
                  {isReceiveDoc && (
                    <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">单价（元/件）</label>
                        {flowDetailEditMode ? (
                          <input type="number" min={0} step={0.01} value={flowDetailUnitPrices[key] ?? ''} onChange={e => setFlowDetailUnitPrices(prev => ({ ...prev, [key]: Number(e.target.value) || 0 }))} className="w-28 rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-700 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        ) : (
                          <div className="w-28 rounded-xl border border-slate-100 bg-slate-50 py-2 px-3 text-sm font-bold text-slate-700 text-center min-h-[40px] flex items-center justify-center">{lineUnitPrice.toFixed(2)}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">金额（元）</label>
                        <div className="w-28 rounded-xl border border-slate-100 bg-slate-50 py-2 px-3 text-sm font-bold text-slate-700 text-center min-h-[40px] flex items-center justify-center">{lineAmount.toFixed(2)}</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(OutsourceFlowDocumentDetailModal);
