import React, { useMemo, useState } from 'react';
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
  OutsourceFormSettings,
  PrintRenderContext,
  PrintTemplate,
} from '../../types';
import { DEFAULT_OUTSOURCE_FORM_SETTINGS } from '../../types';
import { hasOpsPerm } from './types';
import { SearchablePartnerSelect } from '../../components/SearchablePartnerSelect';
import { useConfirm } from '../../contexts/ConfirmContext';
import VariantQtyMatrixInputs from '../../components/variant-matrix/VariantQtyMatrixInputs';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import * as api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { currentOperatorDisplayName } from '../../utils/currentOperatorDisplayName';
import { OrderCenterDetailPrintBlock } from '../../components/order-print/OrderCenterDetailPrintBlock';
import { buildOutsourceFlowPrintContext } from '../../utils/buildOutsourceFlowPrintContext';
import { OUTSOURCE_DISPATCH_CUSTOM_DATA_KEY, OUTSOURCE_RECEIVE_CUSTOM_DATA_KEY } from '../../utils/productionOpCollab/outsource';
import { PlanFormCustomFieldInput, PlanFormCustomFieldReadonly } from '../../components/PlanFormCustomFieldControls';
import {
  buildOutsourceReceiveLastPriceIndex,
  lookupOutsourceReceiveLastPrice,
} from '../../utils/outsourceReceiveLastUnitPrice';

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
  outsourceFormSettings?: OutsourceFormSettings;
  printTemplates?: PrintTemplate[];
  /** 从详情「增加打印模版」打开外协表单配置并切到打印页 */
  onOpenOutsourceFormPrintTab?: () => void;
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
  outsourceFormSettings = DEFAULT_OUTSOURCE_FORM_SETTINGS,
  printTemplates = [],
  onOpenOutsourceFormPrintTab,
}) => {
  const { currentUser } = useAuth();
  const flowDetailOperatorFallback = currentOperatorDisplayName(currentUser);
  const confirm = useConfirm();
  const [flowDetailEditMode, setFlowDetailEditMode] = useState(false);
  const [flowDetailEditPartner, setFlowDetailEditPartner] = useState('');
  const [flowDetailEditRemark, setFlowDetailEditRemark] = useState('');
  const [flowDetailQuantities, setFlowDetailQuantities] = useState<Record<string, number>>({});
  const [flowDetailUnitPrices, setFlowDetailUnitPrices] = useState<Record<string, number>>({});
  const [flowDetailEditCustom, setFlowDetailEditCustom] = useState<Record<string, unknown>>({});

  const outsourceCustomDefsDetail = useMemo(() => {
    const dr = records.filter(r => r.type === 'OUTSOURCE' && r.docNo === flowDetailKey);
    if (!dr.length) return [];
    const recv = dr[0].status === '已收回';
    const arr = recv ? outsourceFormSettings.outsourceReceiveCustomFields : outsourceFormSettings.outsourceDispatchCustomFields;
    return (arr ?? []).filter(f => f.showInDetail);
  }, [records, flowDetailKey, outsourceFormSettings]);

  const outsourceCustomSnapshot = useMemo(() => {
    const dr = records.filter(r => r.type === 'OUTSOURCE' && r.docNo === flowDetailKey);
    if (!dr.length) return {} as Record<string, unknown>;
    const recv = dr[0].status === '已收回';
    const key = recv ? OUTSOURCE_RECEIVE_CUSTOM_DATA_KEY : OUTSOURCE_DISPATCH_CUSTOM_DATA_KEY;
    const raw = dr[0].collabData?.[key];
    return typeof raw === 'object' && raw != null && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
  }, [records, flowDetailKey]);

  const docRecords = records.filter(r => r.type === 'OUTSOURCE' && r.docNo === flowDetailKey);
  if (docRecords.length === 0) return null;
  const first = docRecords[0];
  const isReceiveDoc = first.status === '已收回';
  const printSlot = isReceiveDoc
    ? outsourceFormSettings.outsourceCenterPrint?.receiveFlowDetail
    : outsourceFormSettings.outsourceCenterPrint?.dispatchFlowDetail;
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
      <div className="absolute inset-0 bg-slate-900/60" onClick={() => { onClose(); setFlowDetailEditMode(false); setFlowDetailEditCustom({}); }} aria-hidden />
      <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><ScrollText className="w-5 h-5 text-indigo-600" /> 单据详情 · {flowDetailKey}</h3>
          <div className="flex items-center gap-2">
            {flowDetailEditMode ? (
              <>
                <button type="button" onClick={() => { setFlowDetailEditMode(false); setFlowDetailUnitPrices({}); setFlowDetailEditCustom({}); }} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">取消</button>
                <button type="button" onClick={async () => {
                  if (!onDeleteRecord) return;
                  const partnerName = (flowDetailEditPartner || '').trim();
                  if (!partnerName) { return; }
                  const entries = (Object.entries(flowDetailQuantities) as [string, number][]).filter(([, qty]) => qty > 0);
                  if (entries.length === 0) { return; }
                  const toDelete = isReceiveDoc ? docRecords : docRecords.filter(r => r.status !== '已收回');
                  let preservedCollabData: Record<string, unknown> | undefined;
                  for (const rec of toDelete) {
                    const cd = rec.collabData;
                    if (cd && typeof cd === 'object') {
                      preservedCollabData = { ...(cd as Record<string, unknown>) };
                      break;
                    }
                  }
                  const customDataKey = isReceiveDoc ? OUTSOURCE_RECEIVE_CUSTOM_DATA_KEY : OUTSOURCE_DISPATCH_CUSTOM_DATA_KEY;
                  const mergeCollab = (preserved: Record<string, unknown> | undefined): { collabData?: Record<string, unknown> } => {
                    const base: Record<string, unknown> = preserved && typeof preserved === 'object' ? { ...preserved } : {};
                    const clean = Object.fromEntries(
                      Object.entries(flowDetailEditCustom).filter(([, v]) => v !== '' && v != null && v !== undefined),
                    );
                    if (Object.keys(clean).length) base[customDataKey] = clean;
                    return Object.keys(base).length ? { collabData: base } : {};
                  };
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
                      batch.push({ id: `wx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type: 'OUTSOURCE', productId, quantity: qty, reason: flowDetailEditRemark.trim() || undefined, operator: first.operator || flowDetailOperatorFallback, timestamp, status: newStatus, partner: partnerName, docNo: flowDetailKey, nodeId, variantId: variantId || undefined, unitPrice: unitPrice || undefined, amount: amount ?? undefined, ...mergeCollab(preservedCollabData) } as ProductionOpRecord);
                      return;
                    }
                    const orderId = parts[0];
                    const bk = parts.length >= 2 ? `${orderId}|${nodeId}` : key;
                    const order = orders.find(o => o.id === orderId);
                    if (!order) return;
                    const unitPrice = isReceiveDoc ? (flowDetailUnitPrices[key] ?? flowDetailUnitPrices[bk] ?? 0) : undefined;
                    const amount = isReceiveDoc && unitPrice != null ? Number(qty) * unitPrice : undefined;
                    batch.push({ id: `wx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type: 'OUTSOURCE', orderId, productId: order.productId, quantity: qty, reason: flowDetailEditRemark.trim() || undefined, operator: first.operator || flowDetailOperatorFallback, timestamp, status: newStatus, partner: partnerName, docNo: flowDetailKey, nodeId, variantId: variantId || undefined, unitPrice: unitPrice || undefined, amount: amount ?? undefined, ...mergeCollab(preservedCollabData) } as ProductionOpRecord);
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
                  setFlowDetailEditCustom({});
                }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700">
                  <Check className="w-4 h-4" /> 保存
                </button>
              </>
            ) : (
              <>
                <OrderCenterDetailPrintBlock
                  printSlot={printSlot}
                  printTemplates={printTemplates}
                  buildContext={(_template: PrintTemplate): PrintRenderContext =>
                    buildOutsourceFlowPrintContext({
                      docRecords,
                      isReceiveDoc,
                      orders,
                      products,
                      globalNodes,
                      dictionaries,
                    })
                  }
                  pickerSubtitle={`单号 ${flowDetailKey}`}
                  onAddPrintTemplate={onOpenOutsourceFormPrintTab}
                />
                {onUpdateRecord && hasOpsPerm(tenantRole, userPermissions, 'production:outsource_records:edit') && (
                  <button type="button" onClick={() => {
                    setFlowDetailEditPartner(docPartner);
                    setFlowDetailEditRemark(docRemark);
                    setFlowDetailEditCustom({ ...outsourceCustomSnapshot });
                    const initQty: Record<string, number> = {};
                    docRecords.forEach(r => { const k = isProductModeDetail ? `${r.productId}|${r.nodeId}${r.variantId ? '|' + r.variantId : ''}` : `${r.orderId}|${r.nodeId}${r.variantId ? '|' + r.variantId : ''}`; initQty[k] = (initQty[k] || 0) + r.quantity; });
                    setFlowDetailQuantities(initQty);
                    if (isReceiveDoc) {
                      const initUnitPrice: Record<string, number> = {};
                      docRecords.forEach(r => { const k = isProductModeDetail ? `${r.productId}|${r.nodeId}${r.variantId ? '|' + r.variantId : ''}` : `${r.orderId}|${r.nodeId}${r.variantId ? '|' + r.variantId : ''}`; initUnitPrice[k] = r.unitPrice ?? 0; });
                      docRecords.forEach(r => { if (r.variantId) { const base = isProductModeDetail ? `${r.productId}|${r.nodeId}` : `${r.orderId}|${r.nodeId}`; if (initUnitPrice[base] == null) initUnitPrice[base] = r.unitPrice ?? 0; } });
                      // 补录空单价：本单已有非零价不覆盖；仅对当前为 0 的键按「合作单位 + 商品 + 工序」查历史上次单价，排除本单自身。
                      const priceIdx = buildOutsourceReceiveLastPriceIndex(records, { excludeDocNo: flowDetailKey });
                      if (priceIdx.size > 0) {
                        docRecords.forEach(r => {
                          const k = isProductModeDetail ? `${r.productId}|${r.nodeId}${r.variantId ? '|' + r.variantId : ''}` : `${r.orderId}|${r.nodeId}${r.variantId ? '|' + r.variantId : ''}`;
                          const curr = initUnitPrice[k];
                          if (curr != null && curr > 0) return;
                          const last = lookupOutsourceReceiveLastPrice(priceIdx, r.partner ?? docPartner, r.productId ?? '', r.nodeId ?? '');
                          if (last != null) initUnitPrice[k] = last;
                        });
                      }
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
                      setFlowDetailEditCustom({});
                    });
                  }} className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-bold">
                    <Trash2 className="w-4 h-4" /> 删除
                  </button>
                )}
              </>
            )}
            <button type="button" onClick={() => { onClose(); setFlowDetailEditMode(false); setFlowDetailEditCustom({}); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
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
            {outsourceCustomDefsDetail.length > 0 ? (
              <div className="md:col-span-2 w-full rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">自定义内容</h4>
                {flowDetailEditMode ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {outsourceCustomDefsDetail.map(cf => (
                      <div key={cf.id} className="min-w-0 space-y-1">
                        <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">{cf.label}</label>
                        <PlanFormCustomFieldInput
                          cf={cf}
                          value={flowDetailEditCustom[cf.id]}
                          onChange={v => setFlowDetailEditCustom(prev => ({ ...prev, [cf.id]: v }))}
                          controlClassName="min-h-[48px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {outsourceCustomDefsDetail.map(cf => (
                      <div key={cf.id} className="min-w-0">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">{cf.label}</p>
                        <PlanFormCustomFieldReadonly cf={cf} value={outsourceCustomSnapshot[cf.id]} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
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
              if (showVariantQtyGrid && product && dictionaries) {
                const matrixFlowProduct = { ...product, variants: variantsForDetail, colorIds: undefined, sizeIds: undefined } as Product;
                const qtyRecord = Object.fromEntries(
                  variantsForDetail.map(v => {
                    const qtyKey = `${key}|${v.id}`;
                    const q = flowDetailEditMode
                      ? (flowDetailQuantities[qtyKey] ?? variantQty[v.id] ?? 0)
                      : (variantQty[v.id] ?? 0);
                    return [v.id, q];
                  }),
                );
                const matrixLineTotalQty = variantsForDetail.reduce(
                  (s, v) => s + (flowDetailEditMode ? (flowDetailQuantities[`${key}|${v.id}`] ?? variantQty[v.id] ?? 0) : (variantQty[v.id] ?? 0)),
                  0,
                );
                const matrixLineAmount = flowDetailEditMode
                  ? variantsForDetail.reduce((sum, v) => {
                      const qk = `${key}|${v.id}`;
                      const q = flowDetailQuantities[qk] ?? variantQty[v.id] ?? 0;
                      const up = flowDetailUnitPrices[qk] ?? flowDetailUnitPrices[key] ?? lineRecords.find(r => (r.variantId || '') === v.id)?.unitPrice ?? 0;
                      return sum + q * up;
                    }, 0)
                  : lineRecords.reduce((s, r) => s + (r.amount ?? 0), 0);
                const matrixLineUnitPriceDisplay = lineRecords[0]?.unitPrice != null ? Number(lineRecords[0].unitPrice).toFixed(2) : '—';
                return (
                  <div key={key} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                    <div className="flex min-w-0 flex-wrap items-end gap-x-3 gap-y-2">
                      <div className="min-w-0 max-w-full shrink basis-[min(100%,11rem)] sm:max-w-[min(16rem,calc(100%-12rem))] sm:basis-auto">
                        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          {productionLinkMode !== 'product' && orderNumber != null && orderNumber !== '' && (
                            <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-indigo-600">{orderNumber}</span>
                          )}
                          <span className="min-w-0 truncate text-sm font-bold text-slate-800" title={productName}>
                            {productName}
                          </span>
                          <span className="shrink-0 text-sm font-bold text-indigo-600">{nodeName}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-end gap-x-3 sm:gap-x-4">
                        <div className="flex flex-col gap-0.5">
                          <label className="whitespace-nowrap text-[9px] font-black uppercase tracking-wide text-slate-400">数量（合计）</label>
                          <div className="flex h-9 w-[7.5rem] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm font-bold text-indigo-600 tabular-nums">{matrixLineTotalQty}</div>
                        </div>
                        {isReceiveDoc ? (
                          <>
                            <div className="flex flex-col gap-0.5">
                              <label className="whitespace-nowrap text-[9px] font-black uppercase tracking-wide text-slate-400">单价（元/件）</label>
                              {flowDetailEditMode ? (
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={flowDetailUnitPrices[key] ?? ''}
                                  onChange={e => setFlowDetailUnitPrices(prev => ({ ...prev, [key]: Number(e.target.value) || 0 }))}
                                  placeholder="0"
                                  className="h-9 w-[7.5rem] rounded-lg border border-slate-200 bg-white px-2 text-center text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                              ) : (
                                <div className="flex h-9 w-[7.5rem] items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-sm font-bold text-slate-700 tabular-nums">{matrixLineUnitPriceDisplay}</div>
                              )}
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <label className="whitespace-nowrap text-[9px] font-black uppercase tracking-wide text-slate-400">金额（元）</label>
                              <div className="flex h-9 w-[7.5rem] items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-sm font-bold text-slate-700 tabular-nums">{matrixLineAmount.toFixed(2)}</div>
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="space-y-4 border-t border-slate-100 pt-3">
                      <VariantQtyMatrixInputs
                        product={matrixFlowProduct}
                        dictionaries={dictionaries}
                        quantities={qtyRecord}
                        readOnly={!flowDetailEditMode}
                        onVariantQtyChange={(variantId, qty) => {
                          const qtyKey = `${key}|${variantId}`;
                          setFlowDetailQuantities(prev => ({ ...prev, [qtyKey]: qty }));
                        }}
                      />
                    </div>
                  </div>
                );
              }
              const totalQty = Object.values(variantQty).reduce((s, n) => s + n, 0);
              const singleQty = flowDetailEditMode ? (flowDetailQuantities[key] ?? totalQty) : totalQty;
              const lineRec = lineRecords[0];
              const lineUnitPrice = flowDetailEditMode && isReceiveDoc ? (flowDetailUnitPrices[key] ?? lineRec?.unitPrice ?? 0) : (lineRec?.unitPrice ?? 0);
              const lineAmount = flowDetailEditMode && isReceiveDoc ? (singleQty * lineUnitPrice) : (lineRec?.amount ?? 0);
              return (
                <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 sm:p-6">
                  <div className="flex min-w-0 flex-wrap items-end gap-x-3 gap-y-2">
                    <div className="min-w-0 max-w-full shrink basis-[min(100%,11rem)] sm:max-w-[min(16rem,calc(100%-12rem))] sm:basis-auto">
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        {productionLinkMode !== 'product' && orderNumber != null && orderNumber !== '' && (
                          <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-indigo-600">{orderNumber}</span>
                        )}
                        <span className="min-w-0 truncate text-sm font-bold text-slate-800" title={productName}>
                          {productName}
                        </span>
                        <span className="shrink-0 text-sm font-bold text-indigo-600">{nodeName}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-end gap-x-3 sm:gap-x-4">
                      <div className="flex flex-col gap-0.5">
                        <label className="whitespace-nowrap text-[9px] font-black uppercase tracking-wide text-slate-400">委外数量</label>
                        {flowDetailEditMode ? (
                          <input type="number" min={0} value={flowDetailQuantities[key] ?? ''} onChange={e => setFlowDetailQuantities(prev => ({ ...prev, [key]: Number(e.target.value) || 0 }))} className="h-9 w-[7.5rem] rounded-lg border border-slate-200 bg-white px-2 text-center text-sm font-bold text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-200" />
                        ) : (
                          <div className="flex h-9 w-[7.5rem] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm font-bold text-indigo-600 tabular-nums">{totalQty}</div>
                        )}
                      </div>
                      {isReceiveDoc ? (
                        <>
                          <div className="flex flex-col gap-0.5">
                            <label className="whitespace-nowrap text-[9px] font-black uppercase tracking-wide text-slate-400">单价（元/件）</label>
                            {flowDetailEditMode ? (
                              <input type="number" min={0} step={0.01} value={flowDetailUnitPrices[key] ?? ''} onChange={e => setFlowDetailUnitPrices(prev => ({ ...prev, [key]: Number(e.target.value) || 0 }))} className="h-9 w-[7.5rem] rounded-lg border border-slate-200 bg-white px-2 text-center text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500" />
                            ) : (
                              <div className="flex h-9 w-[7.5rem] items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-sm font-bold text-slate-700 tabular-nums">{lineUnitPrice.toFixed(2)}</div>
                            )}
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <label className="whitespace-nowrap text-[9px] font-black uppercase tracking-wide text-slate-400">金额（元）</label>
                            <div className="flex h-9 w-[7.5rem] items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-sm font-bold text-slate-700 tabular-nums">{lineAmount.toFixed(2)}</div>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
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
