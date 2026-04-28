import React, { useLayoutEffect, useMemo } from 'react';
import { Truck, X, Check, Package, FileText, Layers } from 'lucide-react';
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
  PlanFormFieldConfig,
} from '../../types';
import { SupplierSelect } from '../../components/SupplierSelect';
import { PlanFormCustomFieldInput } from '../../components/PlanFormCustomFieldControls';
import VariantQtyMatrixInputs from '../../components/variant-matrix/VariantQtyMatrixInputs';
import { variantMaxGoodProductMode } from '../../utils/productReportAggregates';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import { getProductCategoryCustomFieldEntries } from '../../utils/reportCustomDocField';
import {
  sectionTitleClass,
  psiOrderBillFormCardClass,
  psiOrderBillFormSectionStackClass,
  psiOrderBillFormDetailSplitClass,
  psiOrderBillFormGridGapClass,
  psiOrderBillCompactWarehouseSelectClass,
  psiOrderBillFormPartnerTriggerClassCompact,
  psiOrderBillFormSectionIconIndigoClass,
  psiOrderBillFormSectionIconEmeraldClass,
  psiOrderBillCompactLineLabelClass,
  psiOrderBillCompactLineInputClass,
  psiOrderBillCompactLineReadonlyClass,
  psiOrderBillCompactSummaryBarClass,
  psiOrderBillCompactSummaryLabelClass,
  psiOrderBillCompactSummaryValueClass,
  psiOrderBillCompactSummaryUnitClass,
} from '../../styles/uiDensity';
import { effectivePlanFormFieldType } from '../../utils/planFormCustomField';

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
  dispatchCustomFieldDefs?: PlanFormFieldConfig[];
  dispatchCustomValues?: Record<string, unknown>;
  setDispatchCustomValues?: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  /** 与表单配置「外协发出显示交货日期」联动 */
  showDispatchDeliveryDate?: boolean;
  dispatchDeliveryDate?: string;
  setDispatchDeliveryDate?: React.Dispatch<React.SetStateAction<string>>;
  onSubmit: () => void;
  onClose: () => void;
  /** 嵌入 `DocPhaseModal` 时由外层提供遮罩与标题，本组件不渲染全屏壳与顶栏 */
  embedded?: boolean;
}

/** 与各输入旁「最多」一致：单格填该上限；多规格共享可委外池时按余量依次填满（与录入区校验一致） */
function buildDefaultDispatchQuantities(
  productionLinkMode: 'order' | 'product',
  outsourceDispatchRows: DispatchRow[],
  dispatchSelectedKeys: Set<string>,
  orders: ProductionOrder[],
  products: Product[],
  categories: ProductCategory[],
  records: ProductionOpRecord[],
  processSequenceMode: ProcessSequenceMode,
  productMilestoneProgresses: ProductMilestoneProgress[],
  defectiveReworkByOrderForOutsource: Map<string, { defective: number; rework: number; reworkByVariant?: Record<string, number> }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  const selectedRows = outsourceDispatchRows.filter(row =>
    dispatchSelectedKeys.has(row.orderId != null ? `${row.orderId}|${row.nodeId}` : `${row.productId}|${row.nodeId}`),
  );

  for (const row of selectedRows) {
    const baseKey = row.orderId != null ? `${row.orderId}|${row.nodeId}` : `${row.productId}|${row.nodeId}`;
    const order = row.orderId != null ? orders.find(o => o.id === row.orderId) : undefined;
    const product = products.find(p => p.id === row.productId);
    const category = categories.find(c => c.id === product?.categoryId);
    const isProductBlock = productionLinkMode === 'product' && row.orderId == null;
    const blockOrders = isProductBlock ? orders.filter(o => o.productId === row.productId) : [];
    const variantIdsInBlock = new Set<string>();
    blockOrders.forEach(o => {
      (o.items ?? []).forEach(i => {
        if ((i.quantity ?? 0) > 0 && i.variantId) variantIdsInBlock.add(i.variantId);
      });
    });
    const variantIdsInOrderItems = new Set((order?.items ?? []).map(i => i.variantId).filter(Boolean) as string[]);
    const variantIdsFromOrderMilestone = new Set<string>();
    const msRow = order?.milestones?.find(m => m.templateId === row.nodeId);
    (msRow?.reports ?? []).forEach(r => {
      if (r.variantId) variantIdsFromOrderMilestone.add(r.variantId);
    });
    const variantIdsForOrderGrid = new Set([...variantIdsInOrderItems, ...variantIdsFromOrderMilestone]);
    const orderHasSpecBreakdown = variantIdsForOrderGrid.size > 0;
    const hasColorSizeMatrix = productHasColorSizeMatrix(product, category);
    const hasColorSizeOrder = productionLinkMode === 'order' && hasColorSizeMatrix;
    const hasColorSizeProduct = isProductBlock && hasColorSizeMatrix;

    const variantsInOrder: ProductVariant[] =
      hasColorSizeOrder && product?.variants ? [...(product.variants as ProductVariant[])] : [];
    const aggregateOrderVariantDispatch = hasColorSizeOrder && variantsInOrder.length > 0 && !orderHasSpecBreakdown;

    let variantsInProductBlock: ProductVariant[] = [];
    const variantIdsFromProgress = new Set<string>();
    if (hasColorSizeProduct) {
      (productMilestoneProgresses ?? []).forEach(pmp => {
        if (pmp.productId !== row.productId || pmp.milestoneTemplateId !== row.nodeId) return;
        if (pmp.variantId) variantIdsFromProgress.add(pmp.variantId);
        (pmp.reports ?? []).forEach(r => {
          if (r.variantId) variantIdsFromProgress.add(r.variantId);
        });
      });
      blockOrders.forEach(o => {
        const ms = o.milestones?.find(m => m.templateId === row.nodeId);
        (ms?.reports ?? []).forEach(r => {
          if (r.variantId) variantIdsFromProgress.add(r.variantId);
        });
      });
    }
    const variantIdsForProductBlockSet = new Set([...variantIdsInBlock, ...variantIdsFromProgress]);
    if (hasColorSizeProduct && product?.variants) {
      variantsInProductBlock = [...(product.variants as ProductVariant[])];
    }
    const aggregateProductVariantDispatch =
      hasColorSizeProduct && variantsInProductBlock.length > 0 && variantIdsForProductBlockSet.size === 0;

    if (variantsInOrder.length > 0) {
      const ms = msRow;
      const msIdx = order?.milestones?.findIndex(m => m.templateId === row.nodeId) ?? -1;
      const prevMs = processSequenceMode === 'sequential' && msIdx > 0 ? order?.milestones?.[msIdx - 1] : undefined;
      const outsourceForNode = records.filter(
        r => r.type === 'OUTSOURCE' && r.orderId === row.orderId && r.nodeId === row.nodeId,
      );
      const drForNode = row.orderId
        ? defectiveReworkByOrderForOutsource.get(`${row.orderId}|${row.nodeId}`) ?? {
            defective: 0,
            rework: 0,
            reworkByVariant: {} as Record<string, number>,
          }
        : { defective: 0, rework: 0, reworkByVariant: {} as Record<string, number> };

      const sumOtherVariantQtyOrder = (currentId: string, qtyMap: Record<string, number>) =>
        variantsInOrder.reduce((s, v) => (v.id === currentId ? s : s + (qtyMap[`${baseKey}|${v.id}`] ?? 0)), 0);

      const netDispatchedForVariantOrder = (vid: string) => {
        const sent = outsourceForNode.filter(r => r.status === '加工中' && (r.variantId || '') === vid).reduce((s, r) => s + r.quantity, 0);
        const recv = outsourceForNode.filter(r => r.status === '已收回' && (r.variantId || '') === vid).reduce((s, r) => s + r.quantity, 0);
        return Math.max(0, sent - recv);
      };

      const getAvailableForVariant = (variantId: string, qtyMap: Record<string, number>) => {
        if (aggregateOrderVariantDispatch) {
          return Math.max(0, row.availableQty - sumOtherVariantQtyOrder(variantId, qtyMap));
        }
        const completedInMs = (ms?.reports ?? [])
          .filter(r => (r.variantId || '') === variantId)
          .reduce((s, r) => s + Number(r.quantity), 0);
        const defectiveForVariant = (ms?.reports ?? [])
          .filter(r => (r.variantId || '') === variantId)
          .reduce((s, r) => s + Number(r.defectiveQuantity ?? 0), 0);
        let seqRemaining: number;
        if (prevMs) {
          const prevCompleted = (prevMs.reports ?? [])
            .filter(r => (r.variantId || '') === variantId)
            .reduce((s, r) => s + Number(r.quantity), 0);
          seqRemaining = prevCompleted - completedInMs;
        } else {
          const orderItem = order?.items?.find(i => (i.variantId || '') === variantId);
          seqRemaining = (orderItem?.quantity ?? 0) - completedInMs;
        }
        const base = Math.max(0, seqRemaining - defectiveForVariant);
        const reworkForVariant = drForNode.reworkByVariant?.[variantId] ?? 0;
        const dispatched = netDispatchedForVariantOrder(variantId);
        return Math.max(0, base + reworkForVariant - dispatched);
      };

      if (aggregateOrderVariantDispatch) {
        const n = variantsInOrder.length;
        const total = row.availableQty;
        const base = Math.floor(total / n);
        const rem = total - base * n;
        variantsInOrder.forEach((v, i) => {
          out[`${baseKey}|${v.id}`] = base + (i < rem ? 1 : 0);
        });
      } else {
        let remaining = row.availableQty;
        for (const v of variantsInOrder) {
          const cap = getAvailableForVariant(v.id, out);
          const take = Math.min(Math.max(0, cap), remaining);
          out[`${baseKey}|${v.id}`] = take;
          remaining -= take;
        }
      }
      continue;
    }

    if (variantsInProductBlock.length > 0) {
      const getDr = (oid: string, tid: string) =>
        defectiveReworkByOrderForOutsource.get(`${oid}|${tid}`) ?? { defective: 0, rework: 0, reworkByVariant: {} as Record<string, number> };
      const milestoneNodeIds = product?.milestoneNodeIds || [];
      const seq = (processSequenceMode ?? 'free') as ProcessSequenceMode;
      const outsourceForProductNode = records.filter(
        r => r.type === 'OUTSOURCE' && !r.orderId && r.productId === row.productId && r.nodeId === row.nodeId,
      );
      const sumOtherVariantQtyProduct = (currentId: string, qtyMap: Record<string, number>) =>
        variantsInProductBlock.reduce((s, v) => (v.id === currentId ? s : s + (qtyMap[`${baseKey}|${v.id}`] ?? 0)), 0);

      const netDispatchedForVariantProduct = (vid: string) => {
        const sent = outsourceForProductNode.filter(r => r.status === '加工中' && (r.variantId || '') === vid).reduce((s, r) => s + r.quantity, 0);
        const recv = outsourceForProductNode.filter(r => r.status === '已收回' && (r.variantId || '') === vid).reduce((s, r) => s + r.quantity, 0);
        return Math.max(0, sent - recv);
      };

      const getAvailableForVariantProduct = (variantId: string, qtyMap: Record<string, number>) => {
        if (aggregateProductVariantDispatch) {
          return Math.max(0, row.availableQty - sumOtherVariantQtyProduct(variantId, qtyMap));
        }
        const maxGood = variantMaxGoodProductMode(
          variantId,
          row.nodeId,
          row.productId,
          blockOrders,
          productMilestoneProgresses || [],
          seq,
          milestoneNodeIds,
          getDr,
          orders,
        );
        const dispatched = netDispatchedForVariantProduct(variantId);
        return Math.max(0, maxGood - dispatched);
      };

      if (aggregateProductVariantDispatch) {
        const n = variantsInProductBlock.length;
        const total = row.availableQty;
        const base = Math.floor(total / n);
        const rem = total - base * n;
        variantsInProductBlock.forEach((v, i) => {
          out[`${baseKey}|${v.id}`] = base + (i < rem ? 1 : 0);
        });
      } else {
        let remaining = row.availableQty;
        for (const v of variantsInProductBlock) {
          const cap = getAvailableForVariantProduct(v.id, out);
          const take = Math.min(Math.max(0, cap), remaining);
          out[`${baseKey}|${v.id}`] = take;
          remaining -= take;
        }
      }
      continue;
    }

    out[baseKey] = row.availableQty;
  }

  return out;
}

const OutsourceDispatchQuantityModal: React.FC<OutsourceDispatchQuantityModalProps> = ({
  productionLinkMode,
  outsourceDispatchRows,
  dispatchSelectedKeys,
  dispatchPartnerName,
  setDispatchPartnerName,
  dispatchFormQuantities,
  setDispatchFormQuantities,
  orders,
  products,
  categories,
  dictionaries,
  globalNodes: _globalNodes,
  partners,
  partnerCategories,
  records,
  processSequenceMode,
  productMilestoneProgresses,
  defectiveReworkByOrderForOutsource,
  dispatchCustomFieldDefs = [],
  dispatchCustomValues = {},
  setDispatchCustomValues,
  showDispatchDeliveryDate = false,
  dispatchDeliveryDate = '',
  setDispatchDeliveryDate,
  onSubmit,
  onClose,
  embedded = false,
}) => {
  useLayoutEffect(() => {
    setDispatchFormQuantities(
      buildDefaultDispatchQuantities(
        productionLinkMode,
        outsourceDispatchRows,
        dispatchSelectedKeys,
        orders,
        products,
        categories,
        records,
        processSequenceMode,
        productMilestoneProgresses,
        defectiveReworkByOrderForOutsource,
      ),
    );
  }, [
    productionLinkMode,
    outsourceDispatchRows,
    dispatchSelectedKeys,
    orders,
    products,
    categories,
    records,
    processSequenceMode,
    productMilestoneProgresses,
    defectiveReworkByOrderForOutsource,
    setDispatchFormQuantities,
  ]);

  const visibleDispatchRows = useMemo(
    () =>
      outsourceDispatchRows.filter(row =>
        dispatchSelectedKeys.has(row.orderId != null ? `${row.orderId}|${row.nodeId}` : `${row.productId}|${row.nodeId}`),
      ),
    [outsourceDispatchRows, dispatchSelectedKeys],
  );

  const getUnitName = (productId: string | undefined) => {
    if (!productId) return 'PCS';
    const p = products.find(pr => pr.id === productId);
    const u = (dictionaries?.units ?? []).find(x => x.id === p?.unitId);
    return u?.name ?? 'PCS';
  };

  const dispatchTotalQty = useMemo(() => {
    let sum = 0;
    for (const row of visibleDispatchRows) {
      const baseKey = row.orderId != null ? `${row.orderId}|${row.nodeId}` : `${row.productId}|${row.nodeId}`;
      const keys = Object.keys(dispatchFormQuantities).filter(k => k === baseKey || k.startsWith(`${baseKey}|`));
      if (keys.length === 0) continue;
      for (const k of keys) sum += Number(dispatchFormQuantities[k]) || 0;
    }
    return sum;
  }, [visibleDispatchRows, dispatchFormQuantities]);

  const dispatchSummaryUnit = useMemo(() => {
    const labels = visibleDispatchRows.map(r => {
      const p = products.find(pr => pr.id === r.productId);
      const u = (dictionaries?.units ?? []).find(x => x.id === p?.unitId);
      return u?.name ?? 'PCS';
    });
    const uniq = [...new Set(labels)];
    return uniq.length === 1 ? uniq[0]! : 'PCS';
  }, [visibleDispatchRows, products, dictionaries]);

  const dispatchMilestoneTitle = useMemo(() => {
    const names = [...new Set(visibleDispatchRows.map(r => r.milestoneName).filter(n => n && String(n).trim()))];
    return names.length ? names.join('、') : '';
  }, [visibleDispatchRows]);

  const body = (
    <div
      className={
        embedded
          ? 'flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-white'
          : 'relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl'
      }
      onClick={e => e.stopPropagation()}
    >
        {!embedded && (
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Truck className="w-5 h-5 text-indigo-600" /> 外协发出 · 录入数量</h3>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-auto p-6">
            <div className={psiOrderBillFormCardClass}>
              <div className={psiOrderBillFormSectionStackClass}>
                <div className="flex flex-wrap items-baseline gap-2.5 border-b border-slate-200 pb-2.5">
                  <div className={`${psiOrderBillFormSectionIconIndigoClass} shrink-0 self-start`}>
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3 className={sectionTitleClass}>1. 外协发出基本信息</h3>
                    {dispatchMilestoneTitle ? (
                      <span className="text-sm font-bold normal-case tracking-normal text-slate-600">工序：{dispatchMilestoneTitle}</span>
                    ) : null}
                  </div>
                </div>
                <div className={`grid grid-cols-1 md:grid-cols-2 ${psiOrderBillFormGridGapClass}`}>
                  <div className="space-y-1.5 min-w-0 md:col-span-2">
                    <label className="mb-1.5 ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">外协工厂</label>
                    <SupplierSelect
                      options={partners}
                      categories={partnerCategories}
                      value={dispatchPartnerName}
                      onChange={name => setDispatchPartnerName(name)}
                      placeholder="搜索并选择外协工厂..."
                      triggerClassName={`${psiOrderBillFormPartnerTriggerClassCompact} rounded-lg border border-slate-200 bg-white`}
                    />
                  </div>
                  {showDispatchDeliveryDate && setDispatchDeliveryDate ? (
                    <div className="space-y-1.5 min-w-0 md:col-span-2">
                      <label className="mb-1.5 ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                        交货日期
                      </label>
                      <input
                        type="date"
                        value={dispatchDeliveryDate}
                        onChange={e => setDispatchDeliveryDate(e.target.value)}
                        className={`box-border w-full max-w-xs rounded-lg border border-slate-200 bg-white py-2 px-2.5 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200`}
                      />
                    </div>
                  ) : null}
                  {dispatchCustomFieldDefs.length > 0 && setDispatchCustomValues
                    ? dispatchCustomFieldDefs.map(cf => {
                        const eff = effectivePlanFormFieldType(cf);
                        return (
                          <div key={cf.id} className={eff === 'text' || eff === 'file' ? 'md:col-span-2 space-y-1' : 'space-y-1'}>
                            <label className="mb-1.5 ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">{cf.label}</label>
                            <PlanFormCustomFieldInput
                              cf={cf}
                              value={dispatchCustomValues[cf.id]}
                              onChange={v => setDispatchCustomValues(prev => ({ ...prev, [cf.id]: v }))}
                              controlClassName={
                                eff === 'select' ? psiOrderBillCompactWarehouseSelectClass : psiOrderBillCompactLineInputClass
                              }
                            />
                          </div>
                        );
                      })
                    : null}
                </div>
              </div>

              <div className={psiOrderBillFormDetailSplitClass}>
                <div className="flex items-center border-b border-slate-200 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className={psiOrderBillFormSectionIconEmeraldClass}>
                      <Layers className="h-4 w-4" />
                    </div>
                    <h3 className={sectionTitleClass}>2. 外协发出明细录入</h3>
                  </div>
                </div>
                <div className="space-y-3">
          {visibleDispatchRows.map(row => {
            const dispatchRowKey = row.orderId != null ? `${row.orderId}|${row.nodeId}` : `${row.productId}|${row.nodeId}`;
            const order = row.orderId != null ? orders.find(o => o.id === row.orderId) : undefined;
            const product = products.find(p => p.id === row.productId);
            const category = categories.find(c => c.id === product?.categoryId);
            const isProductBlock = productionLinkMode === 'product' && row.orderId == null;
            const blockOrders = isProductBlock ? orders.filter(o => o.productId === row.productId) : [];
            const variantIdsInBlock = new Set<string>();
            blockOrders.forEach(o => { (o.items ?? []).forEach(i => { if ((i.quantity ?? 0) > 0 && i.variantId) variantIdsInBlock.add(i.variantId); }); });
            const variantIdsInOrderItems = new Set((order?.items ?? []).map(i => i.variantId).filter(Boolean));
            const variantIdsFromOrderMilestone = new Set<string>();
            const msRow = order?.milestones?.find(m => m.templateId === row.nodeId);
            (msRow?.reports ?? []).forEach(r => { if (r.variantId) variantIdsFromOrderMilestone.add(r.variantId); });
            const variantIdsForOrderGrid = new Set([...variantIdsInOrderItems, ...variantIdsFromOrderMilestone]);
            const orderHasSpecBreakdown = variantIdsForOrderGrid.size > 0;
            const hasColorSizeMatrix = productHasColorSizeMatrix(product, category);
            const hasColorSizeOrder = productionLinkMode === 'order' && hasColorSizeMatrix;
            const hasColorSizeProduct = isProductBlock && hasColorSizeMatrix;
            const baseKey = dispatchRowKey;
            const variantsInOrder =
              hasColorSizeOrder && product?.variants ? [...(product.variants as ProductVariant[])] : [];
            const aggregateOrderVariantDispatch = hasColorSizeOrder && variantsInOrder.length > 0 && !orderHasSpecBreakdown;

            let variantsInProductBlock: ProductVariant[] = [];
            const variantIdsFromProgress = new Set<string>();
            if (hasColorSizeProduct) {
              (productMilestoneProgresses ?? []).forEach(pmp => {
                if (pmp.productId !== row.productId || pmp.milestoneTemplateId !== row.nodeId) return;
                if (pmp.variantId) variantIdsFromProgress.add(pmp.variantId);
                (pmp.reports ?? []).forEach(r => { if (r.variantId) variantIdsFromProgress.add(r.variantId); });
              });
              blockOrders.forEach(o => {
                const ms = o.milestones?.find(m => m.templateId === row.nodeId);
                (ms?.reports ?? []).forEach(r => { if (r.variantId) variantIdsFromProgress.add(r.variantId); });
              });
            }
            const variantIdsForProductBlockSet = new Set([...variantIdsInBlock, ...variantIdsFromProgress]);
            if (hasColorSizeProduct && product?.variants) {
              variantsInProductBlock = [...(product.variants as ProductVariant[])];
            }
            const aggregateProductVariantDispatch =
              hasColorSizeProduct && variantsInProductBlock.length > 0 && variantIdsForProductBlockSet.size === 0;

            if (variantsInOrder.length > 0) {
              const ms = msRow;
              const msIdx = order?.milestones?.findIndex(m => m.templateId === row.nodeId) ?? -1;
              const prevMs = (processSequenceMode === 'sequential' && msIdx > 0) ? order?.milestones?.[msIdx - 1] : undefined;
              const outsourceForNodeRender = records.filter(r => r.type === 'OUTSOURCE' && r.orderId === row.orderId && r.nodeId === row.nodeId);
              const drForNode = row.orderId ? (defectiveReworkByOrderForOutsource.get(`${row.orderId}|${row.nodeId}`) ?? { defective: 0, rework: 0, reworkByVariant: {} as Record<string, number> }) : { defective: 0, rework: 0, reworkByVariant: {} as Record<string, number> };
              const sumOtherVariantQtyOrder = (currentId: string) =>
                variantsInOrder.reduce(
                  (s, v) => (v.id === currentId ? s : s + (dispatchFormQuantities[`${baseKey}|${v.id}`] ?? 0)),
                  0,
                );
              const netDispatchedForVariantOrderRender = (vid: string) => {
                const sent = outsourceForNodeRender.filter(r => r.status === '加工中' && (r.variantId || '') === vid).reduce((s, r) => s + r.quantity, 0);
                const recv = outsourceForNodeRender.filter(r => r.status === '已收回' && (r.variantId || '') === vid).reduce((s, r) => s + r.quantity, 0);
                return Math.max(0, sent - recv);
              };
              const getAvailableForVariant = (variantId: string) => {
                if (aggregateOrderVariantDispatch) {
                  return Math.max(0, row.availableQty - sumOtherVariantQtyOrder(variantId));
                }
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
                const dispatched = netDispatchedForVariantOrderRender(variantId);
                return Math.max(0, base + reworkForVariant - dispatched);
              };
              const matrixProductOrder =
                product && dictionaries
                  ? ({ ...product, variants: variantsInOrder, colorIds: undefined, sizeIds: undefined } as Product)
                  : null;
              const unitLabelOrder = getUnitName(row.productId);
              const productCustomTagsOrder =
                product && category ? getProductCategoryCustomFieldEntries(product, category, { includeFile: false }) : [];
              const lineTotalDispatchOrder = variantsInOrder.reduce(
                (s, v) => s + (dispatchFormQuantities[`${baseKey}|${v.id}`] ?? 0),
                0,
              );
              return (
                <div
                  key={baseKey}
                  className="space-y-2.5 rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 shadow-sm transition-all hover:border-indigo-100/80"
                >
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <label className={psiOrderBillCompactLineLabelClass}>委外明细</label>
                      <div className="flex min-w-0 items-start gap-2">
                        {product?.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt=""
                            className="h-9 w-9 shrink-0 rounded-lg border border-slate-100 object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
                            <Package className="h-4 w-4" />
                          </div>
                        )}
                        <div className="min-w-0">
                          {row.orderNumber != null ? (
                            <div className="text-[10px] font-black uppercase tracking-wider text-indigo-600">{row.orderNumber}</div>
                          ) : null}
                          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                            <span className="font-bold text-slate-700">{row.productName}</span>
                            {product?.sku ? (
                              <span className="text-[9px] font-bold uppercase tracking-tight text-slate-300">{product.sku}</span>
                            ) : null}
                          </div>
                          {productCustomTagsOrder.length > 0 ? (
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              {productCustomTagsOrder.map(({ field, display }) => (
                                <span key={field.id} className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                                  {field.label}: {display}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="w-[5.5rem] shrink-0 space-y-0.5 sm:w-24">
                      <label className={psiOrderBillCompactLineLabelClass}>数量</label>
                      <div className={psiOrderBillCompactLineReadonlyClass}>
                        {lineTotalDispatchOrder.toLocaleString()} {unitLabelOrder}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3 border-t border-slate-100 pt-2">
                    <p className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">数量明细（有颜色尺码）</p>
                    {matrixProductOrder && (
                      <VariantQtyMatrixInputs
                        product={matrixProductOrder}
                        dictionaries={dictionaries}
                        quantities={Object.fromEntries(
                          variantsInOrder.map(v => [v.id, dispatchFormQuantities[`${baseKey}|${v.id}`] ?? 0]),
                        )}
                        onVariantQtyChange={(variantId, qty) => {
                          const maxVariant = getAvailableForVariant(variantId);
                          const qtyKey = `${baseKey}|${variantId}`;
                          setDispatchFormQuantities(prev => ({ ...prev, [qtyKey]: Math.min(qty, maxVariant) }));
                        }}
                        getCellExtras={v => {
                          const maxVariant = getAvailableForVariant(v.id);
                          return { max: maxVariant, hint: `最多${maxVariant}` };
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            }

            if (variantsInProductBlock.length > 0) {
              const getDr = (oid: string, tid: string) => defectiveReworkByOrderForOutsource.get(`${oid}|${tid}`) ?? { defective: 0, rework: 0, reworkByVariant: {} as Record<string, number> };
              const milestoneNodeIds = product?.milestoneNodeIds || [];
              const seq = (processSequenceMode ?? 'free') as ProcessSequenceMode;
              const outsourceForProductNodeRender = records.filter(r => r.type === 'OUTSOURCE' && !r.orderId && r.productId === row.productId && r.nodeId === row.nodeId);
              const sumOtherVariantQtyProduct = (currentId: string) =>
                variantsInProductBlock.reduce(
                  (s, v) => (v.id === currentId ? s : s + (dispatchFormQuantities[`${baseKey}|${v.id}`] ?? 0)),
                  0,
                );
              const netDispatchedForVariantProductRender = (vid: string) => {
                const sent = outsourceForProductNodeRender.filter(r => r.status === '加工中' && (r.variantId || '') === vid).reduce((s, r) => s + r.quantity, 0);
                const recv = outsourceForProductNodeRender.filter(r => r.status === '已收回' && (r.variantId || '') === vid).reduce((s, r) => s + r.quantity, 0);
                return Math.max(0, sent - recv);
              };
              const getAvailableForVariantProduct = (variantId: string) => {
                if (aggregateProductVariantDispatch) {
                  return Math.max(0, row.availableQty - sumOtherVariantQtyProduct(variantId));
                }
                const maxGood = variantMaxGoodProductMode(
                  variantId,
                  row.nodeId,
                  row.productId,
                  blockOrders,
                  productMilestoneProgresses || [],
                  seq,
                  milestoneNodeIds,
                  getDr,
                  orders,
                );
                const dispatched = netDispatchedForVariantProductRender(variantId);
                return Math.max(0, maxGood - dispatched);
              };
              const matrixProductBlock =
                product && dictionaries
                  ? ({ ...product, variants: variantsInProductBlock, colorIds: undefined, sizeIds: undefined } as Product)
                  : null;
              const unitLabelPb = getUnitName(row.productId);
              const productCustomTagsPb =
                product && category ? getProductCategoryCustomFieldEntries(product, category, { includeFile: false }) : [];
              const lineTotalDispatchPb = variantsInProductBlock.reduce(
                (s, v) => s + (dispatchFormQuantities[`${baseKey}|${v.id}`] ?? 0),
                0,
              );
              return (
                <div
                  key={baseKey}
                  className="space-y-2.5 rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 shadow-sm transition-all hover:border-indigo-100/80"
                >
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <label className={psiOrderBillCompactLineLabelClass}>委外明细</label>
                      <div className="flex min-w-0 items-start gap-2">
                        {product?.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt=""
                            className="h-9 w-9 shrink-0 rounded-lg border border-slate-100 object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
                            <Package className="h-4 w-4" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                            <span className="font-bold text-slate-700">{row.productName}</span>
                            {product?.sku ? (
                              <span className="text-[9px] font-bold uppercase tracking-tight text-slate-300">{product.sku}</span>
                            ) : null}
                          </div>
                          {productCustomTagsPb.length > 0 ? (
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              {productCustomTagsPb.map(({ field, display }) => (
                                <span key={field.id} className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                                  {field.label}: {display}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="w-[5.5rem] shrink-0 space-y-0.5 sm:w-24">
                      <label className={psiOrderBillCompactLineLabelClass}>数量</label>
                      <div className={psiOrderBillCompactLineReadonlyClass}>
                        {lineTotalDispatchPb.toLocaleString()} {unitLabelPb}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3 border-t border-slate-100 pt-2">
                    <p className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">数量明细（有颜色尺码）</p>
                    {matrixProductBlock && (
                      <VariantQtyMatrixInputs
                        product={matrixProductBlock}
                        dictionaries={dictionaries}
                        quantities={Object.fromEntries(
                          variantsInProductBlock.map(v => [v.id, dispatchFormQuantities[`${baseKey}|${v.id}`] ?? 0]),
                        )}
                        onVariantQtyChange={(variantId, qty) => {
                          const maxVariant = getAvailableForVariantProduct(variantId);
                          const qtyKey = `${baseKey}|${variantId}`;
                          setDispatchFormQuantities(prev => ({ ...prev, [qtyKey]: Math.min(qty, maxVariant) }));
                        }}
                        getCellExtras={v => {
                          const maxVariant = getAvailableForVariantProduct(v.id);
                          return { max: maxVariant, hint: `最多${maxVariant}` };
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            }

            const unitLabelSimple = getUnitName(row.productId);
            const productCustomTagsSimple =
              product && category ? getProductCategoryCustomFieldEntries(product, category, { includeFile: false }) : [];
            return (
              <div
                key={baseKey}
                className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 shadow-sm transition-all hover:border-indigo-100/80"
              >
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <label className={psiOrderBillCompactLineLabelClass}>委外明细</label>
                    <div className="flex min-w-0 items-start gap-2">
                      {product?.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt=""
                          className="h-9 w-9 shrink-0 rounded-lg border border-slate-100 object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
                          <Package className="h-4 w-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className="font-bold text-slate-700">{row.productName}</span>
                          {product?.sku ? (
                            <span className="text-[9px] font-bold uppercase tracking-tight text-slate-300">{product.sku}</span>
                          ) : null}
                        </div>
                        {productCustomTagsSimple.length > 0 ? (
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {productCustomTagsSimple.map(({ field, display }) => (
                              <span key={field.id} className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                                {field.label}: {display}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-1 text-[10px] font-medium text-slate-500">
                          {productionLinkMode !== 'product' && row.orderNumber != null ? (
                            <span>
                              工单 <span className="font-bold text-slate-600 tabular-nums">{row.orderNumber}</span>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="w-[6.5rem] shrink-0 space-y-0.5 sm:w-28">
                    <label className={psiOrderBillCompactLineLabelClass}>数量</label>
                    <div className="flex h-9 min-h-9 items-stretch gap-1">
                      <input
                        type="number"
                        min={0}
                        max={row.availableQty}
                        value={(dispatchFormQuantities[baseKey] ?? 0) === 0 ? '' : dispatchFormQuantities[baseKey]}
                        onChange={e => {
                          const raw = Math.max(0, Math.floor(Number(e.target.value) || 0));
                          setDispatchFormQuantities(prev => ({ ...prev, [baseKey]: Math.min(raw, row.availableQty) }));
                        }}
                        placeholder="0"
                        title={`最多 ${row.availableQty}`}
                        className={`${psiOrderBillCompactLineInputClass} min-w-0 flex-1`}
                      />
                      <span className="flex shrink-0 items-center text-[9px] font-bold text-slate-400">{unitLabelSimple}</span>
                    </div>
                    <span className="ml-1 text-[9px] font-bold text-slate-400">最多 {row.availableQty}</span>
                  </div>
                </div>
                <p className="ml-1 text-[9px] font-medium text-slate-500">
                  {isProductBlock ? '与报工页本工序合计上限一致' : '可委外上限：下单 − 已报 − 已发出'}
                </p>
              </div>
            );
          })}
                </div>
                <div className={psiOrderBillCompactSummaryBarClass}>
                  <div className="flex items-baseline gap-2">
                    <span className={psiOrderBillCompactSummaryLabelClass}>本次发出合计</span>
                    <span className={psiOrderBillCompactSummaryValueClass}>
                      {dispatchTotalQty.toLocaleString()}
                      <span className={psiOrderBillCompactSummaryUnitClass}>{dispatchSummaryUnit}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="shrink-0 border-t border-slate-100 bg-slate-50/30 px-6 py-4">
          <button type="button" onClick={onSubmit} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white transition-all hover:bg-indigo-700">
            <Check className="h-4 w-4" /> 确认发出
          </button>
        </div>
    </div>
  );

  if (embedded) return body;

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60" onClick={onClose} aria-hidden />
      {body}
    </div>
  );
};

export default React.memo(OutsourceDispatchQuantityModal);
