import React, { useMemo, useCallback, useRef } from 'react';
import { ArrowDownToLine, X, Check, Scale, Package, FileText, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { ScanBatchTrigger } from '../../components/scan/ScanBatchTrigger';
import { itemCodesApi, planVirtualBatchesApi } from '../../services/api';
import { rewriteScanApiErrorForIme, type ScanPayload } from '../../utils/scanPayload';
import type { ScanBatchRowDetail } from '../../utils/scanBatchRowDetail';
import { scanItemResultToRowDetail, scanVirtualBatchResultToRowDetail } from '../../utils/scanBatchRowDetail';
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
import { RECEIVE_VARIANT_SEP, outsourceReceiveBaseKey } from './outsourceReceiveKeys';
import { calcUsageByWeight } from '../../utils/bomMaterialUsageByWeight';
import { getProductCategoryCustomFieldEntries } from '../../utils/reportCustomDocField';
import { effectivePlanFormFieldType } from '../../utils/planFormCustomField';
import {
  sectionTitleClass,
  psiOrderBillFormCardClass,
  psiOrderBillFormSectionStackClass,
  psiOrderBillFormDetailSplitClass,
  psiOrderBillFormGridGapClass,
  psiOrderBillCompactWarehouseSelectClass,
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

/** 外协收货矩阵：与明细行 `psiOrderBillCompactLineInputClass` 同高 (h-9)；「最多」在输入框右侧由 hint 展示 */
const receiveQtyMatrixInputClass =
  'h-9 min-h-9 w-[3.5rem] shrink-0 rounded-lg border border-slate-200 bg-slate-50/90 px-2 text-left text-xs font-bold tabular-nums text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200';

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
  /** 嵌入 `DocPhaseModal` 时由外层提供遮罩与标题 */
  embedded?: boolean;
}

function buildMatrixProductByVariantSubset(product: Product, variants: ProductVariant[]): Product {
  const subsetSizeIds = Array.from(new Set(variants.map(v => v.sizeId).filter((id): id is string => !!id)));
  const subsetColorIds = Array.from(new Set(variants.map(v => v.colorId).filter((id): id is string => !!id)));
  const productSizeOrder = product.sizeIds ?? [];
  const productColorOrder = product.colorIds ?? [];
  const orderedSizeIds = [
    ...productSizeOrder.filter(id => subsetSizeIds.includes(id)),
    ...subsetSizeIds.filter(id => !productSizeOrder.includes(id)),
  ];
  const orderedColorIds = [
    ...productColorOrder.filter(id => subsetColorIds.includes(id)),
    ...subsetColorIds.filter(id => !productColorOrder.includes(id)),
  ];
  return {
    ...product,
    variants,
    colorIds: orderedColorIds.length > 0 ? orderedColorIds : undefined,
    sizeIds: orderedSizeIds.length > 0 ? orderedSizeIds : undefined,
  };
}

const OutsourceReceiveQuantityModal: React.FC<OutsourceReceiveQuantityModalProps> = ({
  productionLinkMode: _productionLinkMode,
  outsourceReceiveRows,
  receiveSelectedKeys,
  receiveFormQuantities,
  setReceiveFormQuantities,
  receiveFormUnitPrices,
  setReceiveFormUnitPrices,
  receiveFormWeights,
  setReceiveFormWeights,
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
  embedded = false,
}) => {
  const productsById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);

  const scannedItemRef = useRef<Set<string>>(new Set());
  const scannedBatchRef = useRef<Set<string>>(new Set());

  const visibleRows = useMemo(
    () =>
      outsourceReceiveRows.filter((row) => receiveSelectedKeys.has(outsourceReceiveBaseKey(row))),
    [outsourceReceiveRows, receiveSelectedKeys],
  );

  const getUnitName = (productId: string | undefined) => {
    if (!productId) return 'PCS';
    const p = products.find(pr => pr.id === productId);
    const u = (dictionaries?.units ?? []).find(x => x.id === p?.unitId);
    return u?.name ?? 'PCS';
  };

  const receiveSummaryTotals = useMemo(() => {
    let totalQty = 0;
    let totalAmt = 0;
    const unitLabels: string[] = [];
    for (const row of visibleRows) {
      const baseKey = outsourceReceiveBaseKey(row);
      const pRow = products.find(pr => pr.id === row.productId);
      const uRow = (dictionaries?.units ?? []).find(x => x.id === pRow?.unitId);
      unitLabels.push(uRow?.name ?? 'PCS');
      let rowQty = 0;
      for (const [k, v] of Object.entries(receiveFormQuantities)) {
        if (
          k === baseKey ||
          k.startsWith(`${baseKey}|`) ||
          k.startsWith(`${baseKey}${RECEIVE_VARIANT_SEP}`)
        ) {
          rowQty += Number(v) || 0;
        }
      }
      totalQty += rowQty;
      totalAmt += rowQty * (receiveFormUnitPrices[baseKey] ?? 0);
    }
    const uniq = [...new Set(unitLabels)];
    return { totalQty, totalAmt, summaryUnit: uniq.length === 1 ? uniq[0]! : 'PCS' };
  }, [visibleRows, receiveFormQuantities, receiveFormUnitPrices, products, dictionaries]);

  const receiveMilestoneTitle = useMemo(() => {
    const names = [...new Set(visibleRows.map(r => r.milestoneName).filter(n => n && String(n).trim()))];
    return names.length ? names.join('、') : '';
  }, [visibleRows]);

  const applyReceiveScanPayload = useCallback(
    async (payload: ScanPayload): Promise<boolean> => {
      if (!payload.token || visibleRows.length === 0) return false;
      try {
        let productId = '';
        let variantId: string | null = null;
        let addQty = 0;
        let tip = '';
        if (payload.kind === 'ITEM') {
          if (scannedItemRef.current.has(payload.token)) {
            toast.warning('此单品码已扫描过');
            return false;
          }
          const res = await itemCodesApi.scan(payload.token);
          if (res.status !== 'ACTIVE') {
            toast.error(res.message || '单品码不可用');
            return false;
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
            return false;
          }
          const res = await planVirtualBatchesApi.scan(payload.token);
          if (res.status !== 'ACTIVE') {
            toast.error(res.message || '批次码不可用');
            return false;
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
          return false;
        }
        const row = visibleRows.find((r) => r.productId === productId);
        if (!row) {
          toast.error('此码对应产品不在本次收货列表中');
          return false;
        }
        const baseKey = outsourceReceiveBaseKey(row);
        const product = products.find((p) => p.id === row.productId);
        const category = categories.find((c) => c.id === product?.categoryId);
        const hasColorSizeMatrix = productHasColorSizeMatrix(product, category);
        /** 跨模式全收（方案 A）：以 row.orderId 决定 scope，与当前 productionLinkMode 无关 */
        const isProductBlockRecv = row.orderId == null;

        let key = baseKey;
        if (hasColorSizeMatrix && variantId) {
          key = isProductBlockRecv ? `${baseKey}${RECEIVE_VARIANT_SEP}${variantId}` : `${baseKey}|${variantId}`;
        } else if (hasColorSizeMatrix && !variantId) {
          toast.error('当前产品按规格管理，码未带规格');
          return false;
        }

        setReceiveFormQuantities((prev) => ({
          ...prev,
          [key]: (prev[key] ?? 0) + addQty,
        }));
        if (payload.kind === 'ITEM') scannedItemRef.current.add(payload.token);
        if (payload.kind === 'BATCH') scannedBatchRef.current.add(payload.token);
        toast.success(`外协收货 +${addQty}${tip ? ` ${tip}` : ''}`);
        return true;
      } catch (e) {
        toast.error(rewriteScanApiErrorForIme(payload.raw, (e as Error)?.message || '扫码查询失败'));
        return false;
      }
    },
    [visibleRows, products, categories, setReceiveFormQuantities],
  );

  const resolveReceiveScanRowPreview = useCallback(
    async (payload: ScanPayload): Promise<ScanBatchRowDetail | null> => {
      if (!payload.token || visibleRows.length === 0) return null;
      try {
        let productId = '';
        if (payload.kind === 'ITEM') {
          if (scannedItemRef.current.has(payload.token)) {
            toast.warning('此单品码已扫描过');
            return null;
          }
          const res = await itemCodesApi.scan(payload.token);
          if (res.status !== 'ACTIVE') {
            toast.error(res.message || '单品码不可用');
            return null;
          }
          productId = res.productId ?? '';
          if (!productId) {
            toast.error('扫码结果缺少产品信息');
            return null;
          }
          const row = visibleRows.find((r) => r.productId === productId);
          if (!row) {
            toast.error('此码对应产品不在本次收货列表中');
            return null;
          }
          const product = products.find((p) => p.id === row.productId);
          const category = categories.find((c) => c.id === product?.categoryId);
          const hasColorSizeMatrix = productHasColorSizeMatrix(product, category);
          const variantId = res.variantId ?? null;
          if (hasColorSizeMatrix && !variantId) {
            toast.error('当前产品按规格管理，码未带规格');
            return null;
          }
          return scanItemResultToRowDetail(res);
        }
        if (payload.kind === 'BATCH') {
          if (scannedBatchRef.current.has(payload.token)) {
            toast.warning('此批次码已扫描过');
            return null;
          }
          const res = await planVirtualBatchesApi.scan(payload.token);
          if (res.status !== 'ACTIVE') {
            toast.error(res.message || '批次码不可用');
            return null;
          }
          productId = res.productId ?? '';
          if (!productId) {
            toast.error('扫码结果缺少产品信息');
            return null;
          }
          const row = visibleRows.find((r) => r.productId === productId);
          if (!row) {
            toast.error('此码对应产品不在本次收货列表中');
            return null;
          }
          const product = products.find((p) => p.id === row.productId);
          const category = categories.find((c) => c.id === product?.categoryId);
          const hasColorSizeMatrix = productHasColorSizeMatrix(product, category);
          const variantId = res.variantId ?? null;
          if (hasColorSizeMatrix && !variantId) {
            toast.error('当前产品按规格管理，码未带规格');
            return null;
          }
          return scanVirtualBatchResultToRowDetail(res);
        }
      } catch (e) {
        toast.error(rewriteScanApiErrorForIme(payload.raw, (e as Error)?.message || '扫码查询失败'));
        return null;
      }
      return null;
    },
    [visibleRows, products, categories],
  );

  const handleReceiveScanBatchConfirm = useCallback(
    async (payloads: ScanPayload[]) => {
      for (const p of payloads) {
        if (!(await applyReceiveScanPayload(p))) return false;
      }
      return true;
    },
    [applyReceiveScanPayload],
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
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><ArrowDownToLine className="w-5 h-5 text-indigo-600" /> 外协收货 · 录入数量</h3>
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
                    <h3 className={sectionTitleClass}>1. 外协收货基本信息</h3>
                    {receiveMilestoneTitle ? (
                      <span className="text-sm font-bold normal-case tracking-normal text-slate-600">工序：{receiveMilestoneTitle}</span>
                    ) : null}
                  </div>
                </div>
                <div className={`grid grid-cols-1 md:grid-cols-2 ${psiOrderBillFormGridGapClass}`}>
                  <div className="space-y-1.5 min-w-0 md:col-span-2">
                    <label className="mb-1.5 ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">外协工厂</label>
                    <div className="flex h-9 min-h-9 w-full min-w-0 items-center rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-800">
                      {(() => {
                        const firstKey = receiveSelectedKeys.values().next().value;
                        if (!firstKey) return '—';
                        const r0 = outsourceReceiveRows.find(r => outsourceReceiveBaseKey(r) === firstKey);
                        return r0?.partner || '—';
                      })()}
                    </div>
                  </div>
                  {receiveCustomFieldDefs.length > 0 && setReceiveCustomValues
                    ? receiveCustomFieldDefs.map(cf => {
                        const eff = effectivePlanFormFieldType(cf);
                        return (
                          <div key={cf.id} className={eff === 'text' || eff === 'file' ? 'md:col-span-2 space-y-1' : 'space-y-1'}>
                            <label className="mb-1.5 ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">{cf.label}</label>
                            <PlanFormCustomFieldInput
                              cf={cf}
                              value={receiveCustomValues[cf.id]}
                              onChange={v => setReceiveCustomValues(prev => ({ ...prev, [cf.id]: v }))}
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
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className={psiOrderBillFormSectionIconEmeraldClass}>
                      <Layers className="h-4 w-4" />
                    </div>
                    <h3 className={sectionTitleClass}>2. 外协收货明细录入</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase text-slate-400">扫码录入</span>
                    <ScanBatchTrigger
                      onApply={handleReceiveScanBatchConfirm}
                      resolveRowPreview={resolveReceiveScanRowPreview}
                      hint="扫码收货"
                      modalTitle="外协收货 · 批量扫码"
                      modalHint="请使用扫码枪；请先切换到英文（半角）输入法。扫入的码显示在列表中，确认后一次性累加收货数量。"
                      showScanIntentToggle
                    />
                  </div>
                </div>
                <div className="space-y-3">
          {visibleRows.map(row => {
            const receiveRowKey = outsourceReceiveBaseKey(row);
            const order = row.orderId != null ? orders.find(o => o.id === row.orderId) : undefined;
            const product = products.find(p => p.id === row.productId);
            const category = categories.find(c => c.id === product?.categoryId);
            const hasColorSizeMatrix = productHasColorSizeMatrix(product, category);
            /** 跨模式全收：order 维度发出单的颜色尺码矩阵收回；与当前 productionLinkMode 无关 */
            const hasColorSizeOrderRecv = row.orderId != null && hasColorSizeMatrix;
            const baseKey = receiveRowKey;
            const variantIdsInOrderItems = new Set((order?.items ?? []).map(i => i.variantId).filter(Boolean));
            const variantIdsFromOrderMilestone = new Set<string>();
            const msRecv = order?.milestones?.find(m => m.templateId === row.nodeId);
            (msRecv?.reports ?? []).forEach(r => { if (r.variantId) variantIdsFromOrderMilestone.add(r.variantId); });
            const variantIdsForOrderRecv = new Set([...variantIdsInOrderItems, ...variantIdsFromOrderMilestone]);
            const orderRecvHasSpecBreakdown = variantIdsForOrderRecv.size > 0;
            const variantsInOrder =
              hasColorSizeOrderRecv && product?.variants ? [...(product.variants as ProductVariant[])] : [];
            const aggregateOrderReceive = hasColorSizeOrderRecv && variantsInOrder.length > 0 && !orderRecvHasSpecBreakdown;
            /**
             * 跨模式全收：按 row.orderId 决定取 product 维度还是 order 维度的发出/收回记录。
             * 工单级也按 partner 过滤——`outsourceReceiveRows` 已按 partner 拆分独立行，
             * 同工单同工序多加工厂时，每行的发出/收回必须各自隔离统计。
             */
            const rowPartner = row.partner ?? '';
            const dispatchRecords = row.orderId == null
              ? records.filter(r => r.type === 'OUTSOURCE' && r.status === '加工中' && !r.sourceReworkId && !r.orderId && r.productId === row.productId && r.nodeId === row.nodeId && (r.partner ?? '') === rowPartner)
              : records.filter(r => r.type === 'OUTSOURCE' && r.status === '加工中' && !r.sourceReworkId && r.orderId === row.orderId && r.nodeId === row.nodeId && (r.partner ?? '') === rowPartner);
            const receiveRecords = row.orderId == null
              ? records.filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && !r.sourceReworkId && !r.orderId && r.productId === row.productId && r.nodeId === row.nodeId && (r.partner ?? '') === rowPartner)
              : records.filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && !r.sourceReworkId && r.orderId === row.orderId && r.nodeId === row.nodeId && (r.partner ?? '') === rowPartner);
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
            /** 跨模式全收：product 维度同时按 baseKey 和 baseKey__v__variantId 切；order 维度按 baseKey 与 baseKey|variantId 切 */
            const totalQtyForWeight = row.orderId == null
              ? Object.entries(receiveFormQuantities)
                  .filter(([k]) => k === baseKey || k.startsWith(`${baseKey}${RECEIVE_VARIANT_SEP}`) || k.startsWith(`${baseKey}|`))
                  .reduce((s, [, q]) => s + (q as number), 0)
              : Object.entries(receiveFormQuantities)
                  .filter(([k]) => k === baseKey || k.startsWith(`${baseKey}|`))
                  .reduce((s, [, q]) => s + (q as number), 0);
            const weightPreviewRows = (() => {
              if (!weightReportEnabled || !(currentRowWeight > 0) || !(totalQtyForWeight > 0)) return [] as ReturnType<typeof calcUsageByWeight>;
              const bom = resolveBom(row.productId, row.nodeId);
              if (!bom) return [];
              return calcUsageByWeight(bom, totalQtyForWeight, currentRowWeight, productsById);
            })();
            const renderWeightFooter = () => {
              if (!weightReportEnabled) return null;
              return (
                <div className="mt-1.5 space-y-1 rounded-lg border border-indigo-100 bg-indigo-50/60 px-2 py-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-indigo-700">
                      <Scale className="h-3.5 w-3.5 shrink-0" /> 本次交货总重量 (kg)
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
                      className="h-9 min-h-9 w-32 box-border rounded-lg border border-indigo-200 bg-white px-2 text-right text-xs font-bold tabular-nums text-indigo-700 outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                    <span className="text-[10px] font-bold text-indigo-500">将按 BOM 占比分摊为各子物料实际消耗</span>
                  </div>
                  {weightPreviewRows.length > 0 ? (
                    <div className="overflow-hidden rounded-md border border-indigo-100 bg-white">
                      <table className="w-full text-[11px]">
                        <thead className="bg-indigo-50/70 text-[10px] font-bold uppercase tracking-widest text-indigo-500">
                          <tr>
                            <th className="px-2 py-0.5 text-left">物料</th>
                            <th className="px-2 py-0.5 text-right">占比</th>
                            <th className="px-2 py-0.5 text-right" title="BOM 单位用量 × 收货件数">
                              理论重量 (kg)
                            </th>
                            <th className="px-2 py-0.5 text-right">实际消耗 (kg)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {weightPreviewRows.map(prow => (
                            <tr key={prow.materialProductId} className="border-t border-slate-100 last:border-b-0">
                              <td className="px-2 py-0.5 font-bold text-slate-700">{prow.materialName || prow.materialProductId}</td>
                              <td className="px-2 py-0.5 text-right tabular-nums text-slate-500">{(prow.ratio * 100).toFixed(1)}%</td>
                              <td className="px-2 py-0.5 text-right tabular-nums text-slate-500">
                                {prow.theoreticalQty != null ? prow.theoreticalQty.toFixed(4) : '—'}
                              </td>
                              <td className="px-2 py-0.5 text-right font-bold tabular-nums text-indigo-600">{prow.actualWeight.toFixed(4)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    currentRowWeight > 0 && (
                      <p className="text-[10px] font-bold leading-snug text-amber-600">
                        未找到该工序下适用的 BOM 或无可分摊子项，提交后将仅保存重量。
                      </p>
                    )
                  )}
                </div>
              );
            };
            /** 跨模式全收：以 row.orderId 决定 scope */
            const isProductBlockRecv = row.orderId == null;
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
                  ? buildMatrixProductByVariantSubset(product, variantsInProductBlockRecv)
                  : null;
              const rowTotalPb = variantsInProductBlockRecv.reduce((s, v) => s + (receiveFormQuantities[`${baseKey}${RECEIVE_VARIANT_SEP}${v.id}`] ?? 0), 0) + (pendingNoVarRecv > 0 && !aggregateProductReceive ? receiveFormQuantities[baseKey] ?? 0 : 0);
              const rowUnitPb = receiveFormUnitPrices[baseKey] ?? 0;
              const rowAmountPb = rowTotalPb * rowUnitPb;
              const unitPb = getUnitName(row.productId);
              const productCustomTagsRecvPb =
                product && category ? getProductCategoryCustomFieldEntries(product, category, { includeFile: false }) : [];
              return (
                <div
                  key={baseKey}
                  className="space-y-2.5 rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 shadow-sm transition-all hover:border-indigo-100/80"
                >
                  <div className="flex flex-wrap items-start gap-2 sm:gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <label className={psiOrderBillCompactLineLabelClass}>收货明细</label>
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
                          {productCustomTagsRecvPb.length > 0 ? (
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              {productCustomTagsRecvPb.map(({ field, display }) => (
                                <span key={field.id} className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                                  {field.label}: {display}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-start gap-2 sm:gap-3">
                      <div className="w-[5.5rem] shrink-0 space-y-0.5 sm:w-24">
                        <label className={psiOrderBillCompactLineLabelClass}>数量</label>
                        <div className={psiOrderBillCompactLineReadonlyClass}>
                          {rowTotalPb.toLocaleString()} {unitPb}
                        </div>
                      </div>
                      <div className="w-[5.5rem] shrink-0 space-y-0.5 sm:w-24">
                        <label className={psiOrderBillCompactLineLabelClass}>加工单价 (元)</label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={receiveFormUnitPrices[baseKey] ?? ''}
                          onChange={e => setReceiveFormUnitPrices(prev => ({ ...prev, [baseKey]: Number(e.target.value) || 0 }))}
                          placeholder="0"
                          className={psiOrderBillCompactLineInputClass}
                        />
                      </div>
                      <div className="w-[5.5rem] shrink-0 space-y-0.5 sm:w-24">
                        <label className={psiOrderBillCompactLineLabelClass}>金额 (元)</label>
                        <div className={psiOrderBillCompactLineReadonlyClass}>{rowAmountPb.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3 border-t border-slate-100 pt-2">
                    <p className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">数量明细（有颜色尺码）</p>
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
                        inputClassName={receiveQtyMatrixInputClass}
                      />
                    )}
                  </div>
                  {pendingNoVarRecv > 0 && !aggregateProductReceive && (
                    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-dashed border-slate-200 bg-white p-3">
                      <span className="text-sm font-bold text-slate-600">未按规格发出的待收回</span>
                      <div className="space-y-0.5">
                        <span className={psiOrderBillCompactLineLabelClass}>数量</span>
                        <div className="flex min-w-0 max-w-[18rem] items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            max={pendingNoVarRecv}
                            value={(receiveFormQuantities[baseKey] ?? 0) === 0 ? '' : receiveFormQuantities[baseKey]}
                            onChange={e => {
                              const raw = Math.max(0, Math.floor(Number(e.target.value) || 0));
                              setReceiveFormQuantities(prev => ({ ...prev, [baseKey]: Math.min(raw, pendingNoVarRecv) }));
                            }}
                            placeholder="0"
                            title={`最多 ${pendingNoVarRecv}`}
                            className={`${psiOrderBillCompactLineInputClass} min-w-0 flex-1 text-indigo-600`}
                          />
                          <span className="shrink-0 text-[9px] font-bold tabular-nums text-slate-400">最多{pendingNoVarRecv}</span>
                          <span className="w-8 shrink-0 text-right text-[9px] font-bold text-slate-400">{unitPb}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {renderWeightFooter()}
                </div>
              );
            }

            if (variantsInOrder.length > 0) {
              const matrixProductRecvOrder =
                product && dictionaries
                  ? buildMatrixProductByVariantSubset(product, variantsInOrder)
                  : null;
              const rowTotalQty = variantsInOrder.reduce((s, v) => s + (receiveFormQuantities[`${baseKey}|${v.id}`] ?? 0), 0);
              const rowUnitPrice = receiveFormUnitPrices[baseKey] ?? 0;
              const rowAmount = rowTotalQty * rowUnitPrice;
              const unitOrd = getUnitName(row.productId);
              const productCustomTagsRecvOrd =
                product && category ? getProductCategoryCustomFieldEntries(product, category, { includeFile: false }) : [];
              return (
                <div
                  key={baseKey}
                  className="space-y-2.5 rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 shadow-sm transition-all hover:border-indigo-100/80"
                >
                  <div className="flex flex-wrap items-start gap-2 sm:gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <label className={psiOrderBillCompactLineLabelClass}>收货明细</label>
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
                          <div className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                            <span className="font-bold text-slate-700">{row.productName}</span>
                            {product?.sku ? (
                              <span className="text-[9px] font-bold uppercase tracking-tight text-slate-300">{product.sku}</span>
                            ) : null}
                          </div>
                          {productCustomTagsRecvOrd.length > 0 ? (
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              {productCustomTagsRecvOrd.map(({ field, display }) => (
                                <span key={field.id} className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                                  {field.label}: {display}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {row.orderNumber != null ? (
                            <div className="mt-0.5 text-[10px] font-bold tabular-nums text-slate-500">工单 {row.orderNumber}</div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-start gap-2 sm:gap-3">
                      <div className="w-[5.5rem] shrink-0 space-y-0.5 sm:w-24">
                        <label className={psiOrderBillCompactLineLabelClass}>数量</label>
                        <div className={psiOrderBillCompactLineReadonlyClass}>
                          {rowTotalQty.toLocaleString()} {unitOrd}
                        </div>
                      </div>
                      <div className="w-[5.5rem] shrink-0 space-y-0.5 sm:w-24">
                        <label className={psiOrderBillCompactLineLabelClass}>加工单价 (元)</label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={receiveFormUnitPrices[baseKey] ?? ''}
                          onChange={e => setReceiveFormUnitPrices(prev => ({ ...prev, [baseKey]: Number(e.target.value) || 0 }))}
                          placeholder="0"
                          className={psiOrderBillCompactLineInputClass}
                        />
                      </div>
                      <div className="w-[5.5rem] shrink-0 space-y-0.5 sm:w-24">
                        <label className={psiOrderBillCompactLineLabelClass}>金额 (元)</label>
                        <div className={psiOrderBillCompactLineReadonlyClass}>{rowAmount.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3 border-t border-slate-100 pt-2">
                    <p className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">数量明细（有颜色尺码）</p>
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
                        inputClassName={receiveQtyMatrixInputClass}
                      />
                    )}
                  </div>
                  {renderWeightFooter()}
                </div>
              );
            }
            const unitSimple = getUnitName(row.productId);
            const productCustomTagsRecvSimple =
              product && category ? getProductCategoryCustomFieldEntries(product, category, { includeFile: false }) : [];
            return (
              <div
                key={baseKey}
                className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 shadow-sm transition-all hover:border-indigo-100/80"
              >
                <div className="flex flex-wrap items-start gap-2 sm:gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <label className={psiOrderBillCompactLineLabelClass}>收货明细</label>
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
                        {productCustomTagsRecvSimple.length > 0 ? (
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {productCustomTagsRecvSimple.map(({ field, display }) => (
                              <span key={field.id} className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                                {field.label}: {display}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {row.orderNumber != null ? (
                          <div className="mt-0.5 text-[10px] font-bold tabular-nums text-slate-500">工单 {row.orderNumber}</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-start gap-2 sm:gap-3">
                    <div className="min-w-[10rem] max-w-[18rem] flex-1 space-y-0.5 sm:min-w-[11rem]">
                      <label className={`${psiOrderBillCompactLineLabelClass} !ml-0`}>数量</label>
                      <div className="flex min-w-0 items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={row.pending}
                          value={(receiveFormQuantities[baseKey] ?? 0) === 0 ? '' : receiveFormQuantities[baseKey]}
                          onChange={e => {
                            const raw = Number(e.target.value) || 0;
                            setReceiveFormQuantities(prev => ({
                              ...prev,
                              [baseKey]: Math.min(Math.max(0, raw), row.pending),
                            }));
                          }}
                          placeholder="0"
                          title={`最多 ${row.pending}`}
                          className={`${psiOrderBillCompactLineInputClass} min-w-0 flex-1`}
                        />
                        <span className="shrink-0 text-[9px] font-bold tabular-nums text-slate-400">最多{row.pending}</span>
                        <span className="w-8 shrink-0 text-right text-[9px] font-bold text-slate-400">{unitSimple}</span>
                      </div>
                    </div>
                    <div className="w-[5.5rem] shrink-0 space-y-0.5 sm:w-24">
                      <label className={psiOrderBillCompactLineLabelClass}>加工单价 (元)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={receiveFormUnitPrices[baseKey] ?? ''}
                        onChange={e => setReceiveFormUnitPrices(prev => ({ ...prev, [baseKey]: Number(e.target.value) || 0 }))}
                        placeholder="0"
                        className={psiOrderBillCompactLineInputClass}
                      />
                    </div>
                    <div className="w-[5.5rem] shrink-0 space-y-0.5 sm:w-24">
                      <label className={psiOrderBillCompactLineLabelClass}>金额 (元)</label>
                      <div className={psiOrderBillCompactLineReadonlyClass}>
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
                <div className={`${psiOrderBillCompactSummaryBarClass} flex-wrap justify-between gap-y-2 sm:justify-end`}>
                  <div className="flex items-baseline gap-2">
                    <span className={psiOrderBillCompactSummaryLabelClass}>本次收回合计</span>
                    <span className={psiOrderBillCompactSummaryValueClass}>
                      {receiveSummaryTotals.totalQty.toLocaleString()}
                      <span className={psiOrderBillCompactSummaryUnitClass}>{receiveSummaryTotals.summaryUnit}</span>
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 border-l border-white/25 pl-0 sm:pl-4">
                    <span className={psiOrderBillCompactSummaryLabelClass}>加工费合计</span>
                    <span className={psiOrderBillCompactSummaryValueClass}>¥{receiveSummaryTotals.totalAmt.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="shrink-0 border-t border-slate-100 bg-slate-50/30 px-6 py-4">
          <button type="button" onClick={onSubmit} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white transition-all hover:bg-indigo-700">
            <Check className="h-4 w-4" /> 确认收货
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

export default React.memo(OutsourceReceiveQuantityModal);
