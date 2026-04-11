
import React, { useState, useMemo, useCallback } from 'react';
import { FileText, X, Check, UserPlus } from 'lucide-react';
import {
  ProductionOrder,
  Milestone,
  Product,
  GlobalNodeTemplate,
  AppDictionaries,
  ProductCategory,
  Worker,
  ProductMilestoneProgress,
  ProductionOpRecord,
  ProcessSequenceMode,
  ProductVariant,
} from '../../types';
import WorkerSelector from '../../components/WorkerSelector';
import EquipmentSelector from '../../components/EquipmentSelector';
import {
  pmpCompletedAtTemplate,
  productGroupMaxReportableSum,
  variantMaxGoodProductMode,
} from '../../utils/productReportAggregates';
import { buildDefectiveReworkByOrderMilestone } from '../../utils/defectiveReworkByOrderMilestone';
import { toast } from 'sonner';
import { toLocalCompactYmd } from '../../utils/localDateTime';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import { sortedVariantColorEntries } from '../../utils/sortVariantsByProduct';

export interface ReportModalData {
  order: ProductionOrder;
  milestone: Milestone;
  productTotalQty?: number;
  productCompletedQty?: number;
  productItems?: { variantId?: string; quantity: number; completedQuantity: number }[];
  productOrders?: ProductionOrder[];
}

interface ReportModalProps {
  reportModal: ReportModalData;
  open: boolean;
  onClose: () => void;
  onReportSubmit?: (
    orderId: string, milestoneId: string, quantity: number, customData: any,
    variantId?: string, workerId?: string, defectiveQty?: number,
    equipmentId?: string, reportBatchId?: string, reportNo?: string,
  ) => void;
  onReportSubmitProduct?: (
    productId: string, milestoneTemplateId: string, quantity: number, customData: any,
    variantId?: string, workerId?: string, defectiveQty?: number,
    equipmentId?: string, reportBatchId?: string, reportNo?: string,
  ) => void;
  products: Product[];
  categories: ProductCategory[];
  globalNodes: GlobalNodeTemplate[];
  workers: Worker[];
  equipment: { id: string; name: string; code?: string; assignedMilestoneIds?: string[] }[];
  dictionaries: AppDictionaries;
  processSequenceMode: ProcessSequenceMode;
  allowExceedMaxReportQty: boolean;
  productionLinkMode: 'order' | 'product';
  orders: ProductionOrder[];
  productMilestoneProgresses: ProductMilestoneProgress[];
  prodRecords: ProductionOpRecord[];
}

const ReportModal: React.FC<ReportModalProps> = ({
  reportModal,
  open,
  onClose,
  onReportSubmit,
  onReportSubmitProduct,
  products,
  categories,
  globalNodes,
  workers,
  equipment,
  dictionaries,
  processSequenceMode,
  allowExceedMaxReportQty,
  productionLinkMode,
  orders,
  productMilestoneProgresses,
  prodRecords,
}) => {
  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const categoryMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  const defectiveAndReworkByOrderMilestone = useMemo(
    () => buildDefectiveReworkByOrderMilestone(orders, prodRecords),
    [orders, prodRecords],
  );

  const getDefectiveRework = (orderId: string, templateId: string) =>
    defectiveAndReworkByOrderMilestone.get(`${orderId}|${templateId}`) ??
    { defective: 0, rework: 0, reworkByVariant: {} as Record<string, number> };

  /** 与列表一致：优先用父级最新 orders，避免弹窗内仍用打开时的工单快照 */
  const orderIdsInModal = useMemo(
    () => (reportModal.productOrders?.length ? reportModal.productOrders.map(o => o.id) : [reportModal.order.id]),
    [reportModal.productOrders, reportModal.order.id],
  );
  const ordersInModal = useMemo(() => {
    const resolved = orderIdsInModal
      .map(id => orders.find(o => o.id === id))
      .filter((o): o is ProductionOrder => o != null);
    if (resolved.length > 0) return resolved;
    return reportModal.productOrders?.length ? reportModal.productOrders : [reportModal.order];
  }, [orderIdsInModal, orders, reportModal.productOrders, reportModal.order]);

  const [reportForm, setReportForm] = useState<{
    quantity: number;
    defectiveQuantity: number;
    variantId: string;
    workerId: string;
    equipmentId: string;
    customData: Record<string, any>;
    variantQuantities?: Record<string, number>;
    variantDefectiveQuantities?: Record<string, number>;
  }>(() => {
    const initialData: Record<string, any> = {};
    reportModal.milestone.reportTemplate.forEach(f => {
      initialData[f.id] = f.type === 'boolean' ? false : '';
    });
    const product = products.find(p => p.id === reportModal.order.productId);
    const category = categories.find(c => c.id === product?.categoryId);
    const showVariantMatrix = productHasColorSizeMatrix(product, category);
    const items = reportModal.productItems ?? reportModal.order.items;
    const singleVariant = items.length === 1 ? (items[0].variantId || '') : '';
    const variantQuantities: Record<string, number> = {};
    const variantDefective: Record<string, number> = {};
    if (showVariantMatrix && product?.variants?.length) {
      product.variants.forEach(v => {
        variantQuantities[v.id] = 0;
        variantDefective[v.id] = 0;
      });
    }
    return {
      quantity: 0,
      defectiveQuantity: 0,
      variantId: singleVariant,
      workerId: '',
      equipmentId: '',
      customData: initialData,
      variantQuantities: showVariantMatrix && product?.variants?.length ? variantQuantities : undefined,
      variantDefectiveQuantities: showVariantMatrix && product?.variants?.length ? variantDefective : undefined,
    };
  });

  const handleReportFieldChange = (fieldId: string, value: any) => {
    setReportForm(prev => ({ ...prev, customData: { ...prev.customData, [fieldId]: value } }));
  };

  const handleVariantQuantityChange = (variantId: string, qty: number) => {
    setReportForm(prev => ({
      ...prev,
      variantQuantities: { ...(prev.variantQuantities ?? {}), [variantId]: Math.max(0, qty) },
    }));
  };

  const handleVariantDefectiveChange = (variantId: string, qty: number) => {
    setReportForm(prev => ({
      ...prev,
      variantDefectiveQuantities: { ...(prev.variantDefectiveQuantities ?? {}), [variantId]: Math.max(0, qty) },
    }));
  };

  const getSeqRemainingForVariant = useCallback((variantId: string): number => {
    const productId = reportModal.order.productId;
    const milestoneTemplateId = reportModal.milestone.templateId;
    const allOrders = ordersInModal;
    const items = reportModal.productItems ?? reportModal.order.items;
    const item = items.find(i => (i.variantId || '') === variantId) ?? (items.length === 1 ? items[0] : undefined);

    let tplIndex: number;
    let prevTemplateId: string | undefined;
    if (productionLinkMode === 'product') {
      const product = productMap.get(productId);
      const nodeIds = product?.milestoneNodeIds || [];
      tplIndex = nodeIds.indexOf(milestoneTemplateId);
      if (tplIndex > 0) prevTemplateId = nodeIds[tplIndex - 1];
    } else {
      const ref = allOrders.find(o => o.milestones.some(m => m.templateId === milestoneTemplateId)) ?? reportModal.order;
      tplIndex = ref.milestones.findIndex(m => m.templateId === milestoneTemplateId);
      if (tplIndex > 0) prevTemplateId = ref.milestones[tplIndex - 1].templateId;
    }

    const freshMilestone = allOrders
      .map(o => o.milestones.find(m => m.templateId === milestoneTemplateId))
      .find(Boolean);

    if (tplIndex <= 0) {
      if (!item) return 0;
      if (reportModal.productItems) {
        return item.quantity - (item.completedQuantity ?? 0);
      }
      if (items.length === 1 && !item.variantId) {
        return item.quantity - (freshMilestone?.completedQuantity ?? reportModal.milestone.completedQuantity ?? 0);
      }
      const completedInMilestone = (freshMilestone?.reports || reportModal.milestone.reports || [])
        .filter(r => (r.variantId || '') === variantId)
        .reduce((s, r) => s + r.quantity, 0);
      return item.quantity - completedInMilestone;
    }

    if (productionLinkMode === 'product' && productMilestoneProgresses.length > 0 && prevTemplateId) {
      const curCompleted = productMilestoneProgresses
        .filter(p => p.productId === productId && p.milestoneTemplateId === milestoneTemplateId && (p.variantId ?? '') === variantId)
        .reduce((sum, p) => sum + (p.completedQuantity ?? 0), 0);
      const prevCompleted = productMilestoneProgresses
        .filter(p => p.productId === productId && p.milestoneTemplateId === prevTemplateId && (p.variantId ?? '') === variantId)
        .reduce((sum, p) => sum + (p.completedQuantity ?? 0), 0);
      return Math.max(0, prevCompleted - curCompleted);
    }

    let prevQty = 0;
    let curQty = 0;
    allOrders.forEach(o => {
      if (prevTemplateId) {
        const prevMs = o.milestones.find(m => m.templateId === prevTemplateId);
        if (prevMs) {
          (prevMs.reports || []).forEach(r => {
            if ((r.variantId || '') === variantId) prevQty += r.quantity;
          });
        }
      }
      const curMs = o.milestones.find(m => m.templateId === milestoneTemplateId);
      if (curMs) {
        (curMs.reports || []).forEach(r => {
          if ((r.variantId || '') === variantId) curQty += r.quantity;
        });
      }
    });
    return prevQty - curQty;
  }, [
    reportModal.order,
    reportModal.milestone,
    reportModal.productItems,
    ordersInModal,
    productionLinkMode,
    productMap,
    productMilestoneProgresses,
  ]);

  const getNextReportNo = () => {
    const todayStr = toLocalCompactYmd(new Date());
    const keys = new Set<string>();
    orders.forEach(o => {
      o.milestones?.forEach(m => {
        (m.reports || []).forEach(r => {
          const ds = toLocalCompactYmd(r.timestamp);
          if (!ds || ds !== todayStr) return;
          const key = r.reportBatchId || r.reportNo || r.id;
          keys.add(key);
        });
      });
    });
    productMilestoneProgresses.forEach(p => {
      (p.reports || []).forEach(r => {
        const ds = toLocalCompactYmd(r.timestamp);
        if (!ds || ds !== todayStr) return;
        const key = r.reportBatchId || r.reportNo || r.id;
        keys.add(key);
      });
    });
    const seq = keys.size + 1;
    const seqStr = String(seq).padStart(4, '0');
    return `BG${todayStr}-${seqStr}`;
  };

  const submitReport = async () => {
    const tmpl = reportModal.milestone.reportTemplate || [];
    for (const f of tmpl) {
      if (!f.required) continue;
      const v = reportForm.customData[f.id];
      if (f.type === 'boolean') continue;
      if (f.type === 'file') {
        if (v == null || (typeof v === 'string' && v.trim() === '')) {
          toast.error(`请上传或选择：${f.label}`);
          return;
        }
      } else if (v == null || (typeof v === 'string' && v.trim() === '')) {
        toast.error(`请填写：${f.label}`);
        return;
      }
    }
    const productId = reportModal.order.productId;
    const milestoneTemplateId = reportModal.milestone.templateId;
    const product = productMap.get(productId);
    const category = categoryMap.get(product?.categoryId);
    const showVariantMatrix = productHasColorSizeMatrix(product, category);

    if (productionLinkMode === 'product' && onReportSubmitProduct) {
      if (showVariantMatrix && reportForm.variantQuantities) {
        const entries = Object.entries(reportForm.variantQuantities).filter(([vId, q]) => {
          const def = reportForm.variantDefectiveQuantities?.[vId] ?? 0;
          return q > 0 || def > 0;
        });
        if (entries.length === 0) return;
        const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const reportNo = getNextReportNo();
        for (const [vId, qty] of entries) {
          const defQty = reportForm.variantDefectiveQuantities?.[vId] ?? 0;
          await onReportSubmitProduct!(
            productId, milestoneTemplateId, qty, reportForm.customData,
            vId, reportForm.workerId || undefined, defQty,
            reportForm.equipmentId || undefined, batchId, reportNo,
          );
        }
      } else {
        const reportNo = getNextReportNo();
        await onReportSubmitProduct(
          productId, milestoneTemplateId, reportForm.quantity, reportForm.customData,
          reportForm.variantId || undefined, reportForm.workerId || undefined,
          reportForm.defectiveQuantity || 0, reportForm.equipmentId || undefined,
          undefined, reportNo,
        );
      }
      onClose();
      return;
    }

    if (!onReportSubmit) return;
    if (showVariantMatrix && reportForm.variantQuantities) {
      const entries = Object.entries(reportForm.variantQuantities).filter(([vId, q]) => {
        const def = reportForm.variantDefectiveQuantities?.[vId] ?? 0;
        return q > 0 || def > 0;
      });
      if (entries.length === 0) return;
      const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const reportNo = getNextReportNo();
      for (const [vId, qty] of entries) {
        let targetOrder = reportModal.order;
        if (reportModal.productOrders?.length) {
          const withVariant = reportModal.productOrders.find(o => o.items.some(i => i.variantId === vId));
          targetOrder = withVariant ?? reportModal.productOrders[0];
        }
        const ms = targetOrder.milestones.find(m => m.templateId === reportModal.milestone.templateId) ?? reportModal.milestone;
        const defQty = reportForm.variantDefectiveQuantities?.[vId] ?? 0;
        await onReportSubmit!(
          targetOrder.id, ms.id, qty, reportForm.customData,
          vId, reportForm.workerId || undefined, defQty,
          reportForm.equipmentId || undefined, batchId, reportNo,
        );
      }
    } else {
      let targetOrder = reportModal.order;
      if (reportModal.productOrders && reportModal.productOrders.length > 0) {
        const vId = reportForm.variantId || undefined;
        const withVariant = reportModal.productOrders.find(o =>
          vId ? o.items.some(i => i.variantId === vId) : true,
        );
        targetOrder = withVariant ?? reportModal.productOrders[0];
      }
      const ms = targetOrder.milestones.find(m => m.templateId === reportModal.milestone.templateId) ?? reportModal.milestone;
      const reportNo = getNextReportNo();
      await onReportSubmit(
        targetOrder.id, ms.id, reportForm.quantity, reportForm.customData,
        reportForm.variantId || undefined, reportForm.workerId || undefined,
        reportForm.defectiveQuantity || 0, reportForm.equipmentId || undefined,
        undefined, reportNo,
      );
    }
    onClose();
  };

  const isMatrixMode = (() => {
    const product = productMap.get(reportModal.order.productId);
    const category = categoryMap.get(product?.categoryId);
    return productHasColorSizeMatrix(product, category);
  })();

  const matrixTotalQty = reportForm.variantQuantities
    ? Object.values(reportForm.variantQuantities).reduce((s, q) => s + q, 0)
    : 0;
  const matrixTotalDef = reportForm.variantDefectiveQuantities
    ? Object.values(reportForm.variantDefectiveQuantities).reduce((s, q) => s + q, 0)
    : 0;
  const canSubmitMatrix = isMatrixMode
    ? (matrixTotalQty + matrixTotalDef) > 0
    : (reportForm.quantity + reportForm.defectiveQuantity) > 0;
  const needEquipment = globalNodes.find(n => n.id === reportModal.milestone.templateId)?.enableEquipmentOnReport;

  if (!open) return null;

  const tid = reportModal.milestone.templateId;
  const pid = reportModal.order.productId;
  const useProductPmp = productionLinkMode === 'product' && productMilestoneProgresses.length > 0;
  const productForModal = productMap.get(pid);
  const modalMilestoneOrder = productForModal?.milestoneNodeIds ?? [];
  const seqIdx = modalMilestoneOrder.indexOf(tid);
  const totalBase = useProductPmp
    ? processSequenceMode === 'sequential' && seqIdx > 0
      ? Math.max(
          0,
          pmpCompletedAtTemplate(productMilestoneProgresses, pid, modalMilestoneOrder[seqIdx - 1]) -
            ordersInModal.reduce((s, o) => s + getDefectiveRework(o.id, tid).defective, 0) +
            ordersInModal.reduce((s, o) => s + getDefectiveRework(o.id, tid).rework, 0),
        )
      : productGroupMaxReportableSum(ordersInModal, tid, pid, productMilestoneProgresses, processSequenceMode, (oid, t) =>
          getDefectiveRework(oid, t),
        )
    : processSequenceMode === 'sequential'
      ? ordersInModal.reduce((s, o) => {
          const idx = o.milestones.findIndex(m => m.templateId === tid);
          if (idx <= 0) return s + o.items.reduce((a, i) => a + i.quantity, 0);
          const prev = o.milestones[idx - 1];
          return s + (prev?.completedQuantity ?? 0);
        }, 0)
      : ordersInModal.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0);
  const totalDefective = ordersInModal.reduce((s, o) => s + getDefectiveRework(o.id, tid).defective, 0);
  const totalRework = ordersInModal.reduce((s, o) => s + getDefectiveRework(o.id, tid).rework, 0);
  const totalCompleted = useProductPmp
    ? pmpCompletedAtTemplate(productMilestoneProgresses, pid, tid)
    : ordersInModal.reduce((s, o) => s + (o.milestones.find(m => m.templateId === tid)?.completedQuantity ?? 0), 0);
  const outsourceFilter = useProductPmp
    ? (r: ProductionOpRecord) => r.type === 'OUTSOURCE' && !r.sourceReworkId && !r.orderId && r.productId === pid && r.nodeId === tid
    : (r: ProductionOpRecord) => r.type === 'OUTSOURCE' && !r.sourceReworkId && r.nodeId === tid && orderIdsInModal.includes(r.orderId ?? '');
  const outsourceDispatchedByVariant: Record<string, number> = {};
  const outsourceReceivedByVariant: Record<string, number> = {};
  let totalDispatched = 0;
  let totalReceived = 0;
  prodRecords.filter(outsourceFilter).forEach(r => {
    const vid = r.variantId ?? '';
    if (r.status === '加工中') {
      totalDispatched += r.quantity ?? 0;
      outsourceDispatchedByVariant[vid] = (outsourceDispatchedByVariant[vid] ?? 0) + (r.quantity ?? 0);
    } else if (r.status === '已收回') {
      totalReceived += r.quantity ?? 0;
      outsourceReceivedByVariant[vid] = (outsourceReceivedByVariant[vid] ?? 0) + (r.quantity ?? 0);
    }
  });
  const totalOutsourcedAtNode = Math.max(0, totalDispatched - totalReceived);
  const outsourcedByVariantId: Record<string, number> = {};
  for (const vid of new Set([...Object.keys(outsourceDispatchedByVariant), ...Object.keys(outsourceReceivedByVariant)])) {
    const net = (outsourceDispatchedByVariant[vid] ?? 0) - (outsourceReceivedByVariant[vid] ?? 0);
    if (net > 0) outsourcedByVariantId[vid] = net;
  }
  const effectiveRemainingForModal = useProductPmp
    ? Math.max(0, totalBase - totalCompleted - totalOutsourcedAtNode)
    : Math.max(0, totalBase - totalDefective + totalRework - totalCompleted - totalOutsourcedAtNode);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-white w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><FileText className="w-5 h-5 text-indigo-600" /> {reportModal.milestone.name} · 报工</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div className="text-xs text-slate-500 font-medium">
            <span className="font-bold text-slate-700">{reportModal.order.productName}</span>
            {reportModal.productTotalQty != null ? (
              <>
                <span className="mx-2">·</span>
                <span>产品合计 {reportModal.productTotalQty} 件</span>
                {reportModal.productCompletedQty != null && (
                  <span className="ml-2">
                    该工序已完成 {reportModal.productCompletedQty} 件，剩余{' '}
                    {Math.max(0, (reportModal.productTotalQty ?? 0) - (reportModal.productCompletedQty ?? 0) - (useProductPmp ? totalOutsourcedAtNode : 0))}{' '}
                    件
                    {useProductPmp && totalOutsourcedAtNode > 0 && (
                      <span className="text-slate-400">（已扣外协未收回 {totalOutsourcedAtNode}）</span>
                    )}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="mx-2">·</span>
                <span>{reportModal.order.orderNumber}</span>
              </>
            )}
            {(() => {
              const p = products.find(px => px.id === reportModal.order.productId);
              const rate = p?.nodeRates?.[reportModal.milestone.templateId] ?? 0;
              if (rate <= 0) return null;
              const totalQty = isMatrixMode ? (reportForm.variantQuantities ? Object.values(reportForm.variantQuantities).reduce((s, q) => s + q, 0) : 0) : reportForm.quantity;
              const totalDef = isMatrixMode ? (reportForm.variantDefectiveQuantities ? Object.values(reportForm.variantDefectiveQuantities).reduce((s, q) => s + q, 0) : 0) : reportForm.defectiveQuantity;
              return (
                <div className="mt-2 flex items-center gap-4 text-indigo-600">
                  <span className="font-bold">本工序工价：{rate.toFixed(2)} 元/件</span>
                  {totalQty > 0 && <span className="font-bold">预计金额：{(totalQty * rate).toFixed(2)} 元</span>}
            </div>
              );
            })()}
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase">生产人员 <span className="text-rose-500">*</span></label>
            <WorkerSelector
              options={workers.filter(w => w.status === 'ACTIVE').map(w => ({ id: w.id, name: w.name, sub: w.groupName, assignedMilestoneIds: w.assignedMilestoneIds }))}
              processNodes={globalNodes}
              currentNodeId={reportModal.milestone.templateId}
              value={reportForm.workerId}
              onChange={(id) => setReportForm(prev => ({ ...prev, workerId: id }))}
              placeholder="选择报工人员..."
              variant="default"
              icon={UserPlus}
            />
          </div>
          {globalNodes.find(n => n.id === reportModal.milestone.templateId)?.enableEquipmentOnReport && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">设备 <span className="text-rose-500">*</span></label>
              <EquipmentSelector
                options={equipment.map(e => ({ id: e.id, name: e.name, sub: e.code, assignedMilestoneIds: e.assignedMilestoneIds }))}
                processNodes={globalNodes}
                currentNodeId={reportModal.milestone.templateId}
                value={reportForm.equipmentId}
                onChange={(id) => setReportForm(prev => ({ ...prev, equipmentId: id }))}
                placeholder="选择设备..."
                variant="default"
              />
            </div>
          )}
          {isMatrixMode ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-400 uppercase">本次完成数量（按规格）</label>
                <span className="text-sm font-bold text-indigo-600">合计 {matrixTotalQty} 件</span>
              </div>
              <div className="space-y-3 bg-slate-50/50 rounded-2xl p-3">
                {(() => {
                  const product = productMap.get(reportModal.order.productId);
                  const category = categoryMap.get(product?.categoryId);
                  if (!product || !productHasColorSizeMatrix(product, category) || !dictionaries) return null;
                  const currentOrder = ordersInModal[0];
                  const currentMs = currentOrder?.milestones.find(m => m.templateId === tid);
                  const { reworkByVariant } = currentOrder ? getDefectiveRework(currentOrder.id, tid) : { reworkByVariant: {} as Record<string, number> };
                  const itemsSource = currentOrder?.items ?? reportModal.productItems ?? reportModal.order.items ?? [];
                  const milestoneNodeIds = product.milestoneNodeIds || [];
                  const variantRemainingBaseMap = new Map<string, number>();
                  for (const variant of product.variants ?? []) {
                    if (productionLinkMode === 'product' && productMilestoneProgresses.length > 0) {
                      const rawMax =
                        variantMaxGoodProductMode(
                          variant.id,
                          tid,
                          reportModal.order.productId,
                          ordersInModal,
                          productMilestoneProgresses,
                          processSequenceMode,
                          milestoneNodeIds,
                          (oid, t) => getDefectiveRework(oid, t),
                        ) - (outsourcedByVariantId[variant.id] ?? 0);
                      variantRemainingBaseMap.set(variant.id, Math.max(0, rawMax));
                      continue;
                    }
                    const item = Array.isArray(itemsSource) ? itemsSource.find((i: { variantId?: string }) => (i.variantId || '') === variant.id) : undefined;
                    const completedInMilestone = (currentMs?.reports || []).filter((r: { variantId?: string }) => (r.variantId || '') === variant.id).reduce((s: number, r: { quantity?: number }) => s + (r.quantity ?? 0), 0);
                    const defectiveForThisVariant = (currentMs?.reports || []).filter((r: { variantId?: string; defectiveQuantity?: number }) => (r.variantId || '') === variant.id).reduce((s: number, r: { defectiveQuantity?: number }) => s + (r.defectiveQuantity ?? 0), 0);
                    const base = processSequenceMode === 'sequential'
                      ? Math.max(0, getSeqRemainingForVariant(variant.id) - defectiveForThisVariant)
                      : (item ? Math.max(0, (item.quantity ?? 0) - completedInMilestone - defectiveForThisVariant) : 0);
                    const reworkForVariant = reworkByVariant[variant.id] ?? 0;
                    const outsourcedForVariant = outsourcedByVariantId[variant.id] ?? 0;
                    variantRemainingBaseMap.set(variant.id, Math.max(0, base + reworkForVariant - outsourcedForVariant));
                  }
                  const renderVariantCell = (variant: ProductVariant, colLabel: string) => {
                    const qty = reportForm.variantQuantities?.[variant.id] ?? 0;
                    const remaining = Math.max(0, variantRemainingBaseMap.get(variant.id) ?? 0);
                    const currentCellQty = reportForm.variantQuantities?.[variant.id] ?? 0;
                    const otherTotal = matrixTotalQty - currentCellQty;
                    const maxAllowed = Math.max(0, allowExceedMaxReportQty ? remaining : Math.min(remaining, effectiveRemainingForModal - otherTotal));
                    return (
                      <div key={variant.id} className="flex flex-col gap-1 min-w-[64px]">
                        <span className="text-[10px] font-bold text-slate-400">{colLabel}</span>
                        <input
                          type="number"
                          min={0}
                          value={qty === 0 ? '' : qty}
                          onChange={e => {
                            const raw = parseInt(e.target.value) || 0;
                            const next = allowExceedMaxReportQty ? raw : Math.min(raw, maxAllowed);
                            handleVariantQuantityChange(variant.id, next);
                          }}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[10px] placeholder:text-slate-400"
                          placeholder={`最多${maxAllowed}`}
                        />
                        <input
                          type="number"
                          min={0}
                          tabIndex={-1}
                          value={(reportForm.variantDefectiveQuantities?.[variant.id] ?? 0) === 0 ? '' : (reportForm.variantDefectiveQuantities?.[variant.id] ?? 0)}
                          onChange={e => handleVariantDefectiveChange(variant.id, parseInt(e.target.value) || 0)}
                          className="w-full bg-amber-50/80 border border-amber-100 rounded-lg px-2 py-1 text-[10px] text-amber-800 text-right outline-none placeholder:text-amber-400"
                          placeholder="不良"
                        />
                      </div>
                    );
                  };
                  const hasFullColorSizeGrid =
                    Boolean(product.colorIds?.length && product.sizeIds?.length && dictionaries.colors?.length && dictionaries.sizes?.length);
                  if (hasFullColorSizeGrid) {
                    return product.colorIds!.map(colorId => {
                      const color = dictionaries.colors!.find((c: { id: string; name: string; value: string }) => c.id === colorId);
                      if (!color) return null;
                      return (
                        <div key={colorId} className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex items-center gap-4 flex-wrap">
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="w-4 h-4 rounded-full border border-slate-200" style={{ backgroundColor: color.value }} />
                            <span className="text-sm font-bold text-slate-800">{color.name}</span>
                          </div>
                          <div className="flex items-center gap-3 flex-1 flex-wrap">
                            {product.sizeIds!.map(sizeId => {
                              const size = dictionaries.sizes!.find((s: { id: string; name: string }) => s.id === sizeId);
                              const variant = product.variants?.find(v => v.colorId === colorId && v.sizeId === sizeId);
                              if (!size || !variant) return null;
                              return renderVariantCell(variant, size.name);
                            })}
                          </div>
                        </div>
                      );
                    });
                  }
                  const groupedByColor: Record<string, ProductVariant[]> = {};
                  for (const v of product.variants ?? []) {
                    const cid = v.colorId || '_';
                    if (!groupedByColor[cid]) groupedByColor[cid] = [];
                    groupedByColor[cid].push(v);
                  }
                  return sortedVariantColorEntries(groupedByColor, product.colorIds, product.sizeIds).map(([colorId, colorVariants]) => {
                    const color = colorId !== '_' ? dictionaries.colors?.find((c: { id: string; name: string; value: string }) => c.id === colorId) : undefined;
                    return (
                      <div key={colorId} className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2 shrink-0">
                          {color ? (
                            <>
                              <span className="w-4 h-4 rounded-full border border-slate-200" style={{ backgroundColor: color.value }} />
                              <span className="text-sm font-bold text-slate-800">{color.name}</span>
                            </>
                          ) : (
                            <span className="text-sm font-bold text-slate-800">{colorId === '_' ? '规格' : colorId}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 flex-1 flex-wrap">
                          {colorVariants.map(v => {
                            const size = dictionaries.sizes?.find((s: { id: string; name: string }) => s.id === v.sizeId);
                            return renderVariantCell(v, (size?.name ?? v.sizeId) || '—');
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          ) : (
            <>
          {((reportModal.productItems ?? reportModal.order.items).length > 1) && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">报工规格项</label>
              <select
                    tabIndex={-1}
                value={reportForm.variantId}
                onChange={(e) => setReportForm({ ...reportForm, variantId: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none"
              >
                <option value="">请选择报工规格...</option>
                {(reportModal.productItems ?? reportModal.order.items).map((item, idx) => {
                  const product = productMap.get(reportModal.order.productId);
                  const v = product?.variants?.find((x: { id: string }) => x.id === item.variantId);
                      const completedInMilestone = reportModal.productItems
                        ? (item.completedQuantity ?? 0)
                        : (reportModal.milestone.reports || []).filter(r => (r.variantId || '') === (item.variantId || '')).reduce((s, r) => s + r.quantity, 0);
                      const remaining = item.quantity - completedInMilestone;
                  return (
                    <option key={item.variantId ?? idx} value={item.variantId || ''}>
                      {(v as { skuSuffix?: string })?.skuSuffix || item.variantId || `规格${idx + 1}`} (剩余: {remaining})
                    </option>
                  );
                })}
              </select>
            </div>
          )}
          <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">本次完成数量（良品）</label>
                <input
                  type="number"
                  min={0}
                  value={reportForm.quantity === 0 ? '' : reportForm.quantity}
                  onChange={(e) => {
                    const raw = parseInt(e.target.value) || 0;
                    const next = allowExceedMaxReportQty ? raw : Math.min(raw, effectiveRemainingForModal);
                    setReportForm({ ...reportForm, quantity: next });
                  }}
                  placeholder={`最多${effectiveRemainingForModal}`}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-[10px] placeholder:text-slate-400"
                />
          </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">不良品数量</label>
                <input
                  type="number"
                  min={0}
                  tabIndex={-1}
                  value={reportForm.defectiveQuantity === 0 ? '' : reportForm.defectiveQuantity}
                  onChange={(e) => setReportForm({ ...reportForm, defectiveQuantity: parseInt(e.target.value) || 0 })}
                  className="w-full bg-amber-50/80 border border-amber-100 rounded-xl py-2.5 px-3 text-sm font-bold text-amber-800 text-right outline-none focus:ring-2 focus:ring-amber-200"
                  placeholder="0"
                />
              </div>
            </>
          )}
          {reportModal.milestone.reportTemplate.map(field => (
            <div key={field.id} className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">{field.label} {field.required && <span className="text-rose-500">*</span>}</label>
              {field.type === 'text' && <input tabIndex={-1} type="text" value={reportForm.customData[field.id] || ''} onChange={(e) => handleReportFieldChange(field.id, e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm outline-none" />}
              {field.type === 'number' && <input tabIndex={-1} type="number" value={reportForm.customData[field.id] ?? ''} onChange={(e) => handleReportFieldChange(field.id, e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm outline-none" />}
              {field.type === 'select' && (
                <select tabIndex={-1} value={reportForm.customData[field.id] || ''} onChange={(e) => handleReportFieldChange(field.id, e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm outline-none">
                  <option value="">请选择...</option>
                  {(field.options || []).map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              )}
              {field.type === 'boolean' && (
                <div className="flex items-center gap-3 py-1">
                  <button tabIndex={-1} type="button" onClick={() => handleReportFieldChange(field.id, !reportForm.customData[field.id])} className={`w-10 h-5 rounded-full relative transition-colors ${reportForm.customData[field.id] ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${reportForm.customData[field.id] ? 'left-5.5' : 'left-0.5'}`} />
                  </button>
                  <span className="text-[10px] font-bold text-slate-500">{reportForm.customData[field.id] ? '是' : '否'}</span>
                </div>
              )}
              {field.type === 'date' && (
                <input
                  tabIndex={-1}
                  type="date"
                  value={reportForm.customData[field.id] || ''}
                  onChange={(e) => handleReportFieldChange(field.id, e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm outline-none"
                />
              )}
              {field.type === 'file' && (
                <div className="space-y-2">
                  <input
                    tabIndex={-1}
                    type="file"
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) {
                        handleReportFieldChange(field.id, '');
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => handleReportFieldChange(field.id, reader.result as string);
                      reader.readAsDataURL(file);
                    }}
                    className="w-full text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-indigo-700"
                  />
                  {typeof reportForm.customData[field.id] === 'string' &&
                    String(reportForm.customData[field.id]).startsWith('data:image') && (
                      <img src={reportForm.customData[field.id]} alt="" className="max-h-28 rounded-lg border border-slate-200 object-contain" />
                    )}
                  {typeof reportForm.customData[field.id] === 'string' &&
                    String(reportForm.customData[field.id]).startsWith('data:') &&
                    !String(reportForm.customData[field.id]).startsWith('data:image') && (
                      <p className="text-[10px] text-slate-500">已选择文件，将随报工一并提交</p>
                    )}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2 text-sm font-bold text-slate-500 hover:text-slate-800">取消</button>
          <button onClick={submitReport} disabled={!canSubmitMatrix || !reportForm.workerId || (needEquipment && !reportForm.equipmentId) || (!isMatrixMode && ((reportModal.productItems ?? reportModal.order.items).length > 1) && !reportForm.variantId)} className="px-6 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50"><Check className="w-4 h-4" /> 确认提交</button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ReportModal);
