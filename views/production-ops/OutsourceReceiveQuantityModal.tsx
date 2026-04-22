import React, { useMemo, useCallback, useRef } from 'react';
import { ArrowDownToLine, X, Check, Scale } from 'lucide-react';
import { toast } from 'sonner';
import { ScanInputButton } from '../../components/scan/ScanInputButton';
import { itemCodesApi, planVirtualBatchesApi } from '../../services/api';
import type { ScanPayload } from '../../utils/scanPayload';
import type {
  ProductionOpRecord,
  ProductionOrder,
  Product,
  ProductCategory,
  ProductVariant,
  ProductMilestoneProgress,
  AppDictionaries,
  PlanFormFieldConfig,
  GlobalNodeTemplate,
  BOM,
} from '../../types';
import { PlanFormCustomFieldInput } from '../../components/PlanFormCustomFieldControls';
import VariantQtyMatrixInputs from '../../components/variant-matrix/VariantQtyMatrixInputs';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import { calcUsageByWeight } from '../../utils/bomMaterialUsageByWeight';

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
  /**
   * 外协收货本次交货总重量（kg），baseKey 维度，与 receiveFormQuantities 一致。
   * 仅当对应工序开启 `enableWeightOnReport` 时在 UI 上显示并参与提交。
   */
  receiveFormWeights?: Record<string, number>;
  setReceiveFormWeights?: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  receiveFormRemark: string;
  setReceiveFormRemark: React.Dispatch<React.SetStateAction<string>>;
  orders: ProductionOrder[];
  products: Product[];
  categories: ProductCategory[];
  dictionaries?: AppDictionaries;
  records: ProductionOpRecord[];
  productMilestoneProgresses?: ProductMilestoneProgress[];
  receiveCustomFieldDefs?: PlanFormFieldConfig[];
  receiveCustomValues?: Record<string, unknown>;
  setReceiveCustomValues?: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  /** 当前租户全局工序模板，用于判断 nodeId 是否开启 `enableWeightOnReport` */
  globalNodes?: GlobalNodeTemplate[];
  /** 当前租户全部 BOM，用于根据 nodeId + productId 派生子物料占比并生成预览 */
  boms?: BOM[];
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
  receiveFormWeights,
  setReceiveFormWeights,
  receiveFormRemark,
  setReceiveFormRemark,
  orders,
  products,
  categories,
  dictionaries,
  records,
  productMilestoneProgresses = [],
  receiveCustomFieldDefs = [],
  receiveCustomValues = {},
  setReceiveCustomValues,
  globalNodes,
  boms,
  onSubmit,
  onClose,
}) => {
  const productsById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);

  const scannedItemRef = useRef<Set<string>>(new Set());
  const scannedBatchRef = useRef<Set<string>>(new Set());

  const visibleRows = useMemo(
    () =>
      outsourceReceiveRows.filter((row) =>
        receiveSelectedKeys.has(
          row.orderId != null ? `${row.orderId}|${row.nodeId}` : `${row.productId}|${row.nodeId}|${row.partner}`,
        ),
      ),
    [outsourceReceiveRows, receiveSelectedKeys],
  );

  const handleScanPayload = useCallback(
    async (payload: ScanPayload) => {
      if (!payload.token || visibleRows.length === 0) return;
      try {
        let productId = '';
        let variantId: string | null = null;
        let addQty = 0;
        let tip = '';
        if (payload.kind === 'ITEM') {
          if (scannedItemRef.current.has(payload.token)) {
            toast.warning('此单品码已扫描过');
            return;
          }
          const res = await itemCodesApi.scan(payload.token);
          if (res.kind !== 'ITEM_CODE' || res.status !== 'ACTIVE') {
            toast.error(res.message || '单品码不可用');
            return;
          }
          productId = res.productId ?? '';
          variantId = res.variantId ?? null;
          addQty = 1;
          tip = `${res.variantLabel || res.productName || ''}${
            res.ownerTenantName && res.callerContext?.relation !== 'OWNER' ? ` · 来自 ${res.ownerTenantName}` : ''
          }`;
        } else if (payload.kind === 'BATCH') {
          if (scannedBatchRef.current.has(payload.token)) {
            toast.warning('此批次码已扫描过');
            return;
          }
          const res = await planVirtualBatchesApi.scan(payload.token);
          if (res.kind !== 'VIRTUAL_BATCH' || res.status !== 'ACTIVE') {
            toast.error(res.message || '批次码不可用');
            return;
          }
          productId = res.productId ?? '';
          variantId = res.variantId ?? null;
          addQty = res.quantity ?? 0;
          tip = `${res.variantLabel || res.productName || ''}${
            res.ownerTenantName && res.callerContext?.relation !== 'OWNER' ? ` · 来自 ${res.ownerTenantName}` : ''
          }`;
        }
        if (!productId) {
          toast.error('扫码结果缺少产品信息');
          return;
        }
        const row = visibleRows.find((r) => r.productId === productId);
        if (!row) {
          toast.error('此码对应产品不在本次收货列表中');
          return;
        }
        const baseKey = row.orderId != null ? `${row.orderId}|${row.nodeId}` : `${row.productId}|${row.nodeId}|${row.partner}`;
        const product = products.find((p) => p.id === row.productId);
        const category = categories.find((c) => c.id === product?.categoryId);
        const hasColorSizeMatrix = productHasColorSizeMatrix(product, category);
        const isProductBlockRecv = productionLinkMode === 'product' && row.orderId == null;

        let key = baseKey;
        if (hasColorSizeMatrix && variantId) {
          key = isProductBlockRecv ? `${baseKey}${RECEIVE_VARIANT_SEP}${variantId}` : `${baseKey}|${variantId}`;
        } else if (hasColorSizeMatrix && !variantId) {
          toast.error('当前产品按规格管理，码未带规格');
          return;
        }

        setReceiveFormQuantities((prev) => ({
          ...prev,
          [key]: (prev[key] ?? 0) + addQty,
        }));
        if (payload.kind === 'ITEM') scannedItemRef.current.add(payload.token);
        if (payload.kind === 'BATCH') scannedBatchRef.current.add(payload.token);
        toast.success(`外协收货 +${addQty}${tip ? ` ${tip}` : ''}`);
      } catch (e) {
        toast.error((e as Error)?.message || '扫码查询失败');
      }
    },
    [visibleRows, productionLinkMode, products, categories, setReceiveFormQuantities],
  );

  const weightEnabledByNodeId = useMemo(() => {
    const m = new Map<string, boolean>();
    (globalNodes ?? []).forEach(n => m.set(n.id, !!n.enableWeightOnReport));
    return m;
  }, [globalNodes]);
  /** 根据 nodeId + productId（+variantId 可选）挑选 BOM，用于预览与后端一致的拆分口径 */
  const resolveBom = (productId: string, nodeId: string, variantId?: string): BOM | undefined => {
    if (!boms?.length) return undefined;
    const forProduct = boms.filter(b => b.parentProductId === productId && b.nodeId === nodeId);
    if (forProduct.length === 0) return undefined;
    if (variantId) {
      const exact = forProduct.find(b => b.variantId === variantId);
      if (exact) return exact;
    }
    return forProduct.find(b => !b.variantId) ?? forProduct[0];
  };
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
          {receiveCustomFieldDefs.length > 0 && setReceiveCustomValues ? (
            <div className="mt-4 space-y-3 rounded-xl border border-slate-100 bg-white/80 p-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">自定义内容</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                {receiveCustomFieldDefs.map(cf => (
                  <div key={cf.id} className="min-w-0 space-y-1">
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">{cf.label}</label>
                    <PlanFormCustomFieldInput
                      cf={cf}
                      value={receiveCustomValues[cf.id]}
                      onChange={v => setReceiveCustomValues(prev => ({ ...prev, [cf.id]: v }))}
                      controlClassName="h-[48px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex-1 overflow-auto min-h-0 p-6">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">商品明细</h4>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase">扫码录入</span>
              <ScanInputButton onScan={handleScanPayload} hint="扫码收货" />
            </div>
          </div>
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
            const hasColorSizeMatrix = productHasColorSizeMatrix(product, category);
            const hasColorSizeOrderRecv = productionLinkMode === 'order' && hasColorSizeMatrix;
            const baseKey = receiveRowKey;
            const variantIdsInOrderItems = new Set((order?.items ?? []).map(i => i.variantId).filter(Boolean));
            const variantIdsFromOrderMilestone = new Set<string>();
            const msRecv = order?.milestones?.find(m => m.templateId === row.nodeId);
            (msRecv?.reports ?? []).forEach(r => { if (r.variantId) variantIdsFromOrderMilestone.add(r.variantId); });
            const variantIdsForOrderRecv = new Set([...variantIdsInOrderItems, ...variantIdsFromOrderMilestone]);
            const orderRecvHasSpecBreakdown = variantIdsForOrderRecv.size > 0;
            let variantsInOrder =
              hasColorSizeOrderRecv && product?.variants
                ? (product.variants as ProductVariant[]).filter(v => variantIdsForOrderRecv.has(v.id))
                : [];
            if (hasColorSizeOrderRecv && product?.variants && product.variants.length > 0 && variantsInOrder.length === 0) {
              variantsInOrder = [...(product.variants as ProductVariant[])];
            }
            const aggregateOrderReceive = hasColorSizeOrderRecv && variantsInOrder.length > 0 && !orderRecvHasSpecBreakdown;
            const dispatchRecords = productionLinkMode === 'product'
              ? records.filter(r => r.type === 'OUTSOURCE' && r.status === '加工中' && !r.sourceReworkId && !r.orderId && r.productId === row.productId && r.nodeId === row.nodeId && (r.partner ?? '') === (row.partner ?? ''))
              : records.filter(r => r.type === 'OUTSOURCE' && r.status === '加工中' && !r.sourceReworkId && r.orderId === row.orderId && r.nodeId === row.nodeId);
            const receiveRecords = productionLinkMode === 'product'
              ? records.filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && !r.sourceReworkId && !r.orderId && r.productId === row.productId && r.nodeId === row.nodeId && (r.partner ?? '') === (row.partner ?? ''))
              : records.filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && !r.sourceReworkId && r.orderId === row.orderId && r.nodeId === row.nodeId);
            const sumOtherVariantQtyRecvOrder = (currentId: string) =>
              variantsInOrder.reduce(
                (s, v) => (v.id === currentId ? s : s + (receiveFormQuantities[`${baseKey}|${v.id}`] ?? 0)),
                0,
              );
            const getPendingForVariant = (variantId: string) => {
              if (aggregateOrderReceive) {
                return Math.max(0, row.pending - sumOtherVariantQtyRecvOrder(variantId));
              }
              const dispatched = dispatchRecords.filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + r.quantity, 0);
              const received = receiveRecords.filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + r.quantity, 0);
              return Math.max(0, dispatched - received);
            };
            const weightReportEnabled = !!weightEnabledByNodeId.get(row.nodeId);
            const currentRowWeight = receiveFormWeights?.[baseKey] ?? 0;
            const totalQtyForWeight = productionLinkMode === 'product'
              ? Object.entries(receiveFormQuantities)
                  .filter(([k]) => k === baseKey || k.startsWith(`${baseKey}${RECEIVE_VARIANT_SEP}`) || k.startsWith(`${baseKey}|`))
                  .reduce((s, [, q]) => s + q, 0)
              : Object.entries(receiveFormQuantities)
                  .filter(([k]) => k === baseKey || k.startsWith(`${baseKey}|`))
                  .reduce((s, [, q]) => s + q, 0);
            const weightPreviewRows = (() => {
              if (!weightReportEnabled || !(currentRowWeight > 0) || !(totalQtyForWeight > 0)) return [] as ReturnType<typeof calcUsageByWeight>;
              const bom = resolveBom(row.productId, row.nodeId);
              if (!bom) return [];
              return calcUsageByWeight(bom, totalQtyForWeight, currentRowWeight, productsById);
            })();
            const renderWeightFooter = () => {
              if (!weightReportEnabled) return null;
              return (
                <div className="mt-2 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <label className="text-[10px] font-black text-indigo-700 uppercase tracking-widest flex items-center gap-1.5">
                      <Scale className="w-3.5 h-3.5" /> 本次交货总重量 (kg)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.0001"
                      value={currentRowWeight === 0 ? '' : currentRowWeight}
                      onChange={e => {
                        if (!setReceiveFormWeights) return;
                        const n = parseFloat(e.target.value);
                        const v = Number.isFinite(n) && n > 0 ? n : 0;
                        setReceiveFormWeights(prev => ({ ...prev, [baseKey]: v }));
                      }}
                      className="w-32 rounded-xl border border-indigo-200 bg-white py-2 px-3 text-sm font-bold text-indigo-700 text-right outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                    <span className="text-[10px] text-indigo-500 font-bold">将按 BOM 占比分摊为各子物料实际消耗</span>
                  </div>
                  {weightPreviewRows.length > 0 ? (
                    <div className="overflow-hidden rounded-lg border border-indigo-100 bg-white">
                      <table className="w-full text-[11px]">
                        <thead className="bg-indigo-50/70 text-[10px] font-bold text-indigo-500 uppercase tracking-widest">
                          <tr>
                            <th className="px-2 py-1 text-left">物料</th>
                            <th className="px-2 py-1 text-right">占比</th>
                            <th className="px-2 py-1 text-right" title="BOM 单位用量 × 收货件数">理论重量 (kg)</th>
                            <th className="px-2 py-1 text-right">实际消耗 (kg)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {weightPreviewRows.map(prow => (
                            <tr key={prow.materialProductId} className="border-t border-slate-100 last:border-b-0">
                              <td className="px-2 py-1 text-slate-700 font-bold">{prow.materialName || prow.materialProductId}</td>
                              <td className="px-2 py-1 text-right text-slate-500 tabular-nums">{(prow.ratio * 100).toFixed(1)}%</td>
                              <td className="px-2 py-1 text-right text-slate-500 tabular-nums">
                                {prow.theoreticalQty != null ? prow.theoreticalQty.toFixed(4) : '—'}
                              </td>
                              <td className="px-2 py-1 text-right text-indigo-600 font-bold tabular-nums">{prow.actualWeight.toFixed(4)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    currentRowWeight > 0 && (
                      <p className="text-[10px] text-amber-600 font-bold">未找到该工序下适用的 BOM 或无可分摊子项，提交后将仅保存重量。</p>
                    )
                  )}
                </div>
              );
            };
            const isProductBlockRecv = productionLinkMode === 'product' && row.orderId == null;
            const blockOrdersRecv = isProductBlockRecv ? orders.filter(o => o.productId === row.productId) : [];
            const variantIdsInBlockRecv = new Set<string>();
            blockOrdersRecv.forEach(o => { (o.items ?? []).forEach(i => { if ((i.quantity ?? 0) > 0 && i.variantId) variantIdsInBlockRecv.add(i.variantId); }); });
            const variantIdsFromProgressRecv = new Set<string>();
            if (isProductBlockRecv && hasColorSizeMatrix) {
              productMilestoneProgresses.forEach(pmp => {
                if (pmp.productId !== row.productId || pmp.milestoneTemplateId !== row.nodeId) return;
                if (pmp.variantId) variantIdsFromProgressRecv.add(pmp.variantId);
                (pmp.reports ?? []).forEach(r => { if (r.variantId) variantIdsFromProgressRecv.add(r.variantId); });
              });
              blockOrdersRecv.forEach(o => {
                const ms = o.milestones?.find(m => m.templateId === row.nodeId);
                (ms?.reports ?? []).forEach(r => { if (r.variantId) variantIdsFromProgressRecv.add(r.variantId); });
              });
            }
            const variantIdsForProductRecvSet = new Set([...variantIdsInBlockRecv, ...variantIdsFromProgressRecv]);
            let variantsInProductBlockRecv: ProductVariant[] = [];
            if (isProductBlockRecv && hasColorSizeMatrix && product?.variants) {
              variantsInProductBlockRecv = (product.variants as ProductVariant[]).filter(v => variantIdsForProductRecvSet.has(v.id));
            }
            if (isProductBlockRecv && hasColorSizeMatrix && product?.variants && product.variants.length > 0 && variantsInProductBlockRecv.length === 0) {
              variantsInProductBlockRecv = [...(product.variants as ProductVariant[])];
            }
            const aggregateProductReceive =
              isProductBlockRecv && variantsInProductBlockRecv.length > 0 && variantIdsForProductRecvSet.size === 0;
            const hasVariantProductDispatchesRecv = dispatchRecords.some(r => !!r.variantId);
            const dispNoVarRecv = dispatchRecords.filter(r => !r.variantId).reduce((s, r) => s + r.quantity, 0);
            const recNoVarRecv = receiveRecords.filter(r => !r.variantId).reduce((s, r) => s + r.quantity, 0);
            const pendingNoVarRecv = Math.max(0, dispNoVarRecv - recNoVarRecv);

            const sumOtherVariantQtyRecvProduct = (currentId: string) =>
              variantsInProductBlockRecv.reduce(
                (s, v) => (v.id === currentId ? s : s + (receiveFormQuantities[`${baseKey}${RECEIVE_VARIANT_SEP}${v.id}`] ?? 0)),
                0,
              );
            const getPendingForVariantProduct = (variantId: string) => {
              if (aggregateProductReceive) {
                return Math.max(0, row.pending - sumOtherVariantQtyRecvProduct(variantId));
              }
              const dispatched = dispatchRecords.filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + r.quantity, 0);
              const received = receiveRecords.filter(r => (r.variantId || '') === variantId).reduce((s, r) => s + r.quantity, 0);
              return Math.max(0, dispatched - received);
            };

            if (isProductBlockRecv && variantsInProductBlockRecv.length > 0 && (hasVariantProductDispatchesRecv || aggregateProductReceive)) {
              const matrixProductRecvPb =
                product && dictionaries
                  ? ({ ...product, variants: variantsInProductBlockRecv, colorIds: undefined, sizeIds: undefined } as Product)
                  : null;
              const rowTotalPb = variantsInProductBlockRecv.reduce((s, v) => s + (receiveFormQuantities[`${baseKey}${RECEIVE_VARIANT_SEP}${v.id}`] ?? 0), 0) + (pendingNoVarRecv > 0 && !aggregateProductReceive ? receiveFormQuantities[baseKey] ?? 0 : 0);
              const rowUnitPb = receiveFormUnitPrices[baseKey] ?? 0;
              const rowAmountPb = rowTotalPb * rowUnitPb;
              return (
                <div key={baseKey} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-4 space-y-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">关联产品 · 颜色尺码</span>
                    <span className="text-sm font-bold text-slate-800">{row.productName}</span>
                    <span className="text-sm font-bold text-indigo-600">{row.milestoneName}</span>
                    <span className="text-xs text-slate-500">
                      {aggregateProductReceive
                        ? `待收回 ${row.pending} 件（发出未带规格：各格合计不超过此数）`
                        : `待收回合计 ${row.pending} 件`}
                    </span>
                  </div>
                  <div className="space-y-4">
                    {matrixProductRecvPb && dictionaries && (
                      <VariantQtyMatrixInputs
                        product={matrixProductRecvPb}
                        dictionaries={dictionaries}
                        quantities={Object.fromEntries(
                          variantsInProductBlockRecv.map(v => [
                            v.id,
                            receiveFormQuantities[`${baseKey}${RECEIVE_VARIANT_SEP}${v.id}`] ?? 0,
                          ]),
                        )}
                        onVariantQtyChange={(variantId, qty) => {
                          const maxV = getPendingForVariantProduct(variantId);
                          const qtyKey = `${baseKey}${RECEIVE_VARIANT_SEP}${variantId}`;
                          setReceiveFormQuantities(prev => ({ ...prev, [qtyKey]: Math.min(qty, maxV) }));
                        }}
                        getCellExtras={v => {
                          const maxV = getPendingForVariantProduct(v.id);
                          return { max: maxV, hint: `最多${maxV}` };
                        }}
                      />
                    )}
                  </div>
                  {pendingNoVarRecv > 0 && !aggregateProductReceive && (
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
                  {renderWeightFooter()}
                </div>
              );
            }

            if (variantsInOrder.length > 0) {
              const matrixProductRecvOrder =
                product && dictionaries
                  ? ({ ...product, variants: variantsInOrder, colorIds: undefined, sizeIds: undefined } as Product)
                  : null;
              const rowTotalQty = variantsInOrder.reduce((s, v) => s + (receiveFormQuantities[`${baseKey}|${v.id}`] ?? 0), 0);
              const rowUnitPrice = receiveFormUnitPrices[baseKey] ?? 0;
              const rowAmount = rowTotalQty * rowUnitPrice;
              return (
                <div key={baseKey} className="bg-slate-50/50 rounded-2xl border border-slate-200 p-4 space-y-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    {productionLinkMode !== 'product' && row.orderNumber != null && <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">{row.orderNumber}</span>}
                    <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">颜色尺码</span>
                    <span className="text-sm font-bold text-slate-800">{row.productName}</span>
                    <span className="text-sm font-bold text-indigo-600">{row.milestoneName}</span>
                    {aggregateOrderReceive && (
                      <span className="text-xs text-slate-500">（发出未带规格：各规格合计不超过待收回 {row.pending}）</span>
                    )}
                  </div>
                  <div className="space-y-4">
                    {matrixProductRecvOrder && (
                      <VariantQtyMatrixInputs
                        product={matrixProductRecvOrder}
                        dictionaries={dictionaries}
                        quantities={Object.fromEntries(
                          variantsInOrder.map(v => [v.id, receiveFormQuantities[`${baseKey}|${v.id}`] ?? 0]),
                        )}
                        onVariantQtyChange={(variantId, qty) => {
                          const maxVariant = getPendingForVariant(variantId);
                          const qtyKey = `${baseKey}|${variantId}`;
                          setReceiveFormQuantities(prev => ({ ...prev, [qtyKey]: Math.min(Math.max(0, qty), maxVariant) }));
                        }}
                        getCellExtras={v => {
                          const maxVariant = getPendingForVariant(v.id);
                          return { max: maxVariant, hint: `最多${maxVariant}` };
                        }}
                      />
                    )}
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
                  {renderWeightFooter()}
                </div>
              );
            }
            return (
              <div key={baseKey} className="rounded-xl border border-slate-200 bg-slate-50/40 px-4 pb-4 pt-3.5 space-y-2">
                <div className="flex min-w-0 flex-wrap items-end gap-x-3 gap-y-2.5">
                  <div className="min-w-0 max-w-[min(100%,15rem)] shrink sm:max-w-[18rem]">
                    <div className="flex min-w-0 items-baseline gap-x-2">
                      <span className="truncate text-base font-bold leading-snug text-slate-900 sm:text-lg" title={row.productName}>
                        {row.productName}
                      </span>
                      <span className="shrink-0 text-[10px] font-bold text-indigo-600 sm:text-[11px]">{row.milestoneName}</span>
                    </div>
                    {productionLinkMode !== 'product' && row.orderNumber != null ? (
                      <div className="mt-0.5 truncate text-[10px] font-medium text-slate-500 sm:text-[11px]">
                        工单 <span className="font-bold text-slate-600 tabular-nums">{row.orderNumber}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-end gap-x-2.5 gap-y-2 sm:flex-nowrap sm:gap-x-3">
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[9px] font-black uppercase tracking-wide text-slate-400 whitespace-nowrap">本次收回</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          max={row.pending}
                          value={(receiveFormQuantities[baseKey] ?? 0) === 0 ? '' : receiveFormQuantities[baseKey]}
                          onChange={e => setReceiveFormQuantities(prev => ({ ...prev, [baseKey]: Number(e.target.value) || 0 }))}
                          placeholder="0"
                          title={`最多 ${row.pending}`}
                          className="h-8 w-[4.5rem] rounded-md border border-slate-200 bg-white px-2 text-left text-sm font-bold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200 tabular-nums placeholder:text-[9px] placeholder:text-slate-400"
                        />
                        <span className="text-[10px] font-medium tabular-nums text-slate-400 whitespace-nowrap">最多 {row.pending}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[9px] font-black uppercase tracking-wide text-slate-400 whitespace-nowrap">单价（元/件）</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={receiveFormUnitPrices[baseKey] ?? ''}
                        onChange={e => setReceiveFormUnitPrices(prev => ({ ...prev, [baseKey]: Number(e.target.value) || 0 }))}
                        placeholder="0"
                        className="h-8 w-20 rounded-md border border-slate-200 bg-white px-2 text-right text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200 tabular-nums sm:w-[5.25rem]"
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[9px] font-black uppercase tracking-wide text-slate-400 whitespace-nowrap">金额（元）</label>
                      <div className="flex h-8 w-20 min-w-[4.5rem] items-center justify-center rounded-md border border-slate-100 bg-white px-1.5 text-xs font-bold text-slate-700 tabular-nums sm:w-[5.25rem]">
                        {((receiveFormQuantities[baseKey] ?? 0) * (receiveFormUnitPrices[baseKey] ?? 0)).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
                {renderWeightFooter()}
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
