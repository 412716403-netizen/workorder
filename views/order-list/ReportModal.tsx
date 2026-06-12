/**
 * 报工弹窗 (主壳, Phase P4 拆分后)。
 *
 * 拆分对照:
 * - hooks/useReportModalState.ts                  — state + handlers + 扫码 + submit (集中)
 * - views/order-list/report/ReportRouteDisplaySection.tsx — 工序展示(只读)
 * - views/order-list/report/ReportVariantMatrixInput.tsx  — 矩阵模式数量输入
 * - views/order-list/report/ReportSingleVariantInput.tsx  — 非矩阵模式数量输入
 * - views/order-list/report/ReportWeightBomSection.tsx    — 重量+BOM 预估消耗
 *
 * 主壳只保留:
 * - props 解构
 * - 派生计算 (派生 hint 数据 / outsource 聚合 / matrix 判定)
 * - 编排子组件 + 提交按钮
 */
import React, { useMemo, useCallback, useRef } from 'react';
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
  BOM,
  PlanOrder,
} from '../../types';
import WorkerSelector from '../../components/WorkerSelector';
import EquipmentSelector from '../../components/EquipmentSelector';
import {
  pmpCompletedAtTemplate,
  combinedCompletedAtTemplate,
  productGroupMaxReportableSum,
  pmpDefectiveTotalAtTemplate,
} from '../../utils/productReportAggregates';
import { buildDefectiveReworkByOrderMilestone } from '../../utils/defectiveReworkByOrderMilestone';
import { reworkMergeBucketOrderId } from '../../utils/reworkMergeBucketOrderId';
import { useEquipmentFeaturesEffective } from '../../hooks/useEquipmentFeaturesEffective';
import { useTraceabilityPlugin } from '../../hooks/useTraceabilityPlugin';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import { getEffectiveReportTemplate } from '../../utils/effectiveReportTemplate';
import ReportCustomFieldsEditor from '../../components/ReportCustomFieldsEditor';
import { useReportModalState, type ReportModalData } from '../../hooks/useReportModalState';
import ReportRouteDisplaySection from './report/ReportRouteDisplaySection';
import ReportVariantMatrixInput from './report/ReportVariantMatrixInput';
import ReportSingleVariantInput from './report/ReportSingleVariantInput';
import ReportWeightBomSection from './report/ReportWeightBomSection';
import { formStandardLabelClass } from '../../styles/uiDensity';
import { useConfigData } from '../../contexts/AppDataContext';
import { getVariantNodeUnitWeightKg } from '../../utils/variantNodeUnitWeight';

export type { ReportModalData };

interface ReportModalProps {
  reportModal: ReportModalData;
  open: boolean;
  onClose: () => void;
  onReportSubmit?: (
    orderId: string, milestoneId: string, quantity: number, customData: unknown,
    variantId?: string, workerId?: string, defectiveQty?: number,
    equipmentId?: string, reportBatchId?: string, reportNo?: string,
    weight?: number,
  ) => void;
  onReportSubmitProduct?: (
    productId: string, milestoneTemplateId: string, quantity: number, customData: unknown,
    variantId?: string, workerId?: string, defectiveQty?: number,
    equipmentId?: string, reportBatchId?: string, reportNo?: string,
    weight?: number,
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
  /** 工序开启「报工时记录重量」时,用于本工序 BOM 预览与按占比分摊预估 */
  boms?: BOM[];
  plans?: PlanOrder[];
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
  boms,
  plans = [],
}) => {
  const { weightTolerancePercent } = useConfigData();
  const equipmentFeaturesOn = useEquipmentFeaturesEffective();
  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const categoryMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  const defectiveAndReworkByOrderMilestone = useMemo(
    () => buildDefectiveReworkByOrderMilestone(orders, prodRecords),
    [orders, prodRecords],
  );

  const getDefectiveRework = (orderId: string, templateId: string) =>
    defectiveAndReworkByOrderMilestone.get(`${orderId}|${templateId}`) ??
    { defective: 0, rework: 0, reworkByVariant: {} as Record<string, number> };

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

  const weightReportEnabled = useMemo(
    () => !!globalNodes.find(n => n.id === reportModal.milestone.templateId)?.enableWeightOnReport,
    [globalNodes, reportModal.milestone.templateId],
  );

  const { scanEnabled, weightEnabled } = useTraceabilityPlugin();
  const scanWeightCheckEnabled = weightReportEnabled && weightEnabled;

  const getUnitWeightKg = useCallback(
    (productId: string, variantId: string, nodeId: string) =>
      getVariantNodeUnitWeightKg(products, productId, variantId, nodeId),
    [products],
  );

  const scanWeightProps = useMemo(
    () => ({
      enableWeightCheck: scanWeightCheckEnabled,
      weightNodeId: reportModal.milestone.templateId,
      weightTolerancePercent,
      getUnitWeightKg,
    }),
    [reportModal.milestone.templateId, weightTolerancePercent, getUnitWeightKg, scanWeightCheckEnabled],
  );

  /**
   * 扫码累加前的「最大可填」实时上限：
   * - 矩阵：该规格在本工序的可报余量（getSeqRemainingForVariant 已减去前序完成）减不良减外协；
   * - 单规格：整工单整工序的 effectiveRemainingForModal。
   * 通过 ref 在 effectiveRemainingForModal/outsourcedByVariantId 计算完成后回填，
   * 由 useReportModalState 在调 scan/validate-usage 时透传，超限 toast 拒绝。
   */
  const scanMaxQtyRef = useRef<(variantId: string | null) => number | null>(() => null);
  const getScanMaxQty = useCallback((variantId: string | null) => scanMaxQtyRef.current(variantId), []);

  const effectiveReportTemplate = useMemo(
    () => getEffectiveReportTemplate(reportModal.milestone, globalNodes),
    [reportModal.order.id, reportModal.milestone.id, reportModal.milestone.templateId, reportModal.milestone.reportTemplate, globalNodes],
  );

  const {
    reportForm,
    setReportForm,
    weightPreviewRows,
    displayImagePreview,
    closeDisplayImagePreview,
    openDisplayFilePreview,
    handleReportFieldChange,
    handleVariantQuantityChange,
    handleVariantDefectiveChange,
    resolveReportScanRowPreview,
    handleScanBatchConfirm,
    getSeqRemainingForVariant,
    submitReport,
  } = useReportModalState({
    reportModal,
    open,
    onClose,
    products,
    categories,
    globalNodes,
    dictionaries,
    productionLinkMode,
    productMilestoneProgresses,
    processSequenceMode,
    ordersInModal,
    productMap,
    categoryMap,
    weightReportEnabled,
    effectiveReportTemplate,
    boms,
    orders,
    plans,
    onReportSubmit,
    onReportSubmitProduct,
    getScanMaxQty,
  });

  const isMatrixMode = (() => {
    const product = productMap.get(reportModal.order.productId);
    const category = product?.categoryId ? categoryMap.get(product.categoryId) : undefined;
    return productHasColorSizeMatrix(product, category);
  })();

  const matrixTotalQty = reportForm.variantQuantities
    ? Object.values(reportForm.variantQuantities).reduce<number>((s, q) => s + (q as number), 0)
    : 0;
  const matrixTotalDef = reportForm.variantDefectiveQuantities
    ? Object.values(reportForm.variantDefectiveQuantities).reduce<number>((s, q) => s + (q as number), 0)
    : 0;
  const canSubmitMatrix = isMatrixMode
    ? (matrixTotalQty + matrixTotalDef) > 0
    : (reportForm.quantity + reportForm.defectiveQuantity) > 0;
  const needEquipment =
    equipmentFeaturesOn &&
    !!globalNodes.find(n => n.id === reportModal.milestone.templateId)?.enableEquipmentOnReport;

  if (!open) return null;

  const tid = reportModal.milestone.templateId;
  const pid = reportModal.order.productId;
  const useProductPmp = productionLinkMode === 'product' && productMilestoneProgresses.length > 0;
  void pmpCompletedAtTemplate;
  const totalBase = useProductPmp
    ? productGroupMaxReportableSum(ordersInModal, tid, pid, productMilestoneProgresses, processSequenceMode, (oid, t) => getDefectiveRework(oid, t), undefined, orders)
    : processSequenceMode === 'sequential'
      ? ordersInModal.reduce((s, o) => {
          const idx = o.milestones.findIndex(m => m.templateId === tid);
          if (idx <= 0) return s + o.items.reduce((a, i) => a + i.quantity, 0);
          const prev = o.milestones[idx - 1];
          return s + (prev?.completedQuantity ?? 0);
        }, 0)
      : ordersInModal.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0);
  const totalDefective = ordersInModal.reduce((s, o) => s + getDefectiveRework(o.id, tid).defective, 0);
  const pmpDefectiveAtNode = useProductPmp ? pmpDefectiveTotalAtTemplate(productMilestoneProgresses, pid, tid) : 0;
  const defectiveQtyForHint = useProductPmp ? Math.max(pmpDefectiveAtNode, totalDefective) : totalDefective;
  const totalRework = [...new Set(ordersInModal.map(o => reworkMergeBucketOrderId(o.id, orders)))].reduce<number>(
    (s, bid) => s + getDefectiveRework(bid as string, tid).rework, 0,
  );
  const totalCompleted = useProductPmp
    ? combinedCompletedAtTemplate(ordersInModal, productMilestoneProgresses, pid, tid)
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

  /**
   * 把扫码最大可填上限回填给 ref（供 useReportModalState 内部异步校验读取最新值）：
   * - 矩阵：`getSeqRemainingForVariant(vid)` 已含前序完成，再减不良 / 净外协；
   * - 单规格：直接 `effectiveRemainingForModal`。
   */
  scanMaxQtyRef.current = (variantId: string | null) => {
    if (isMatrixMode) {
      if (!variantId) return null;
      const base = getSeqRemainingForVariant(variantId);
      const def = reportForm.variantDefectiveQuantities?.[variantId] ?? 0;
      const out = outsourcedByVariantId[variantId] ?? 0;
      return Math.max(0, base - def - out);
    }
    return effectiveRemainingForModal;
  };

  const hintTotalQty =
    reportModal.productTotalQty ??
    ordersInModal.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0);
  const hintMaxReportableRaw =
    reportModal.productMaxReportableQty ??
    (useProductPmp
      ? productGroupMaxReportableSum(ordersInModal, tid, pid, productMilestoneProgresses, processSequenceMode, (oid, t) => getDefectiveRework(oid, t), undefined, orders)
      : ordersInModal.reduce((s, o) => {
          const idx = o.milestones.findIndex(m => m.templateId === tid);
          let base = o.items.reduce((a, i) => a + i.quantity, 0);
          if (processSequenceMode === 'sequential' && idx > 0) {
            base = o.milestones[idx - 1]?.completedQuantity ?? 0;
          }
          const { defective, rework } = getDefectiveRework(o.id, tid);
          return s + Math.max(0, base - defective + rework);
        }, 0));
  const hintMaxReportable = Math.max(0, Math.round(Number(hintMaxReportableRaw) || 0));
  const hintCompletedDisplay = reportModal.productCompletedQty ?? totalCompleted;
  const hintRemaining = Math.max(0, hintMaxReportable - hintCompletedDisplay - totalOutsourcedAtNode);

  const productForModal = productMap.get(pid);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-white w-full max-w-4xl min-h-0 max-h-[min(90vh,calc(100dvh-2rem))] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" /> {reportModal.milestone.name} · 报工
          </h3>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form className="flex flex-col flex-1 min-h-0" autoComplete="off" onSubmit={e => e.preventDefault()}>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 sm:py-4 space-y-3">
            {isMatrixMode && (
              <div className="text-xs text-slate-500 font-medium">
                <span className="font-bold text-slate-700">{reportModal.order.productName}</span>
                {hintTotalQty > 0 ? (
                  <>
                    <span className="mx-2">·</span>
                    <span className="ml-2">
                      {hintMaxReportable !== hintTotalQty ? (
                        <>可报 {hintMaxReportable}/{hintTotalQty} 件 · </>
                      ) : (
                        <>合计 {hintTotalQty} 件 · </>
                      )}
                      已报 {hintCompletedDisplay} · 剩 {hintRemaining} 件
                      {totalOutsourcedAtNode > 0 ? (
                        <span className="text-slate-400" title="本工序已发外协、尚未收回的在制数量（外协剩余）">
                          {' '}· 外协剩余 {totalOutsourcedAtNode} 件
                        </span>
                      ) : null}
                      {defectiveQtyForHint > 0 ? (
                        <span className="text-slate-400" title="本工序报不良等需走返工流程的件数（含关联产品报工 PMP）">
                          {' '}· 返工 {defectiveQtyForHint} 件
                        </span>
                      ) : null}
                      {totalRework > 0 ? (
                        <span className="text-slate-400" title="返工报工已回缴到本工序的完成件数">
                          {' '}·{defectiveQtyForHint > 0 ? ' 返工完成' : ' 返工'} {totalRework}
                        </span>
                      ) : null}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="mx-2">·</span>
                    <span>{reportModal.order.orderNumber}</span>
                  </>
                )}
                {(() => {
                  const rate = productForModal?.nodeRates?.[reportModal.milestone.templateId] ?? 0;
                  if (rate <= 0) return null;
                  const totalQty = reportForm.variantQuantities ? Object.values(reportForm.variantQuantities).reduce<number>((s, q) => s + (q as number), 0) : 0;
                  return (
                    <div className="mt-2 flex items-center gap-4 text-indigo-600">
                      <span className="font-bold">本工序工价：{rate.toFixed(2)} 元/件</span>
                      {totalQty > 0 && <span className="font-bold">预计金额：{(totalQty * rate).toFixed(2)} 元</span>}
                    </div>
                  );
                })()}
              </div>
            )}

            <ReportRouteDisplaySection
              milestone={reportModal.milestone}
              product={productForModal}
              globalNodes={globalNodes}
              onOpenFilePreview={openDisplayFilePreview}
            />

            <div className="space-y-1">
              <label className={formStandardLabelClass}>
                生产人员 <span className="text-rose-500">*</span>
              </label>
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

            {needEquipment && (
              <div className="space-y-1">
                <label className={formStandardLabelClass}>
                  设备 <span className="text-rose-500">*</span>
                </label>
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
              <ReportVariantMatrixInput
                reportModal={reportModal}
                reportForm={reportForm}
                ordersInModal={ordersInModal}
                orders={orders}
                productMap={productMap}
                categoryMap={categoryMap}
                productMilestoneProgresses={productMilestoneProgresses}
                productionLinkMode={productionLinkMode}
                processSequenceMode={processSequenceMode}
                dictionaries={dictionaries}
                matrixTotalQty={matrixTotalQty}
                effectiveRemainingForModal={effectiveRemainingForModal}
                allowExceedMaxReportQty={allowExceedMaxReportQty}
                outsourcedByVariantId={outsourcedByVariantId}
                getDefectiveRework={getDefectiveRework}
                getSeqRemainingForVariant={getSeqRemainingForVariant}
                onVariantQtyChange={handleVariantQuantityChange}
                onVariantDefChange={handleVariantDefectiveChange}
                onScanBatchConfirm={handleScanBatchConfirm}
                resolveScanRowPreview={resolveReportScanRowPreview}
                scanWeightProps={scanWeightProps}
                scanEnabled={scanEnabled}
              />
            ) : (
              <ReportSingleVariantInput
                reportModal={reportModal}
                reportForm={reportForm}
                setReportForm={setReportForm}
                productMap={productMap}
                dictionaries={dictionaries}
                productionLinkMode={productionLinkMode}
                effectiveRemainingForModal={effectiveRemainingForModal}
                allowExceedMaxReportQty={allowExceedMaxReportQty}
                hintTotalQty={hintTotalQty}
                hintMaxReportable={hintMaxReportable}
                hintCompletedDisplay={hintCompletedDisplay}
                hintRemaining={hintRemaining}
                totalOutsourcedAtNode={totalOutsourcedAtNode}
                defectiveQtyForHint={defectiveQtyForHint}
                totalRework={totalRework}
                onScanBatchConfirm={handleScanBatchConfirm}
                resolveScanRowPreview={resolveReportScanRowPreview}
                scanWeightProps={scanWeightProps}
                scanEnabled={scanEnabled}
              />
            )}

            {weightReportEnabled && (
              <ReportWeightBomSection
                weight={reportForm.weight}
                onWeightChange={(n) => setReportForm(prev => ({ ...prev, weight: n }))}
                weightPreviewRows={weightPreviewRows}
              />
            )}

            <ReportCustomFieldsEditor
              fields={effectiveReportTemplate}
              values={reportForm.customData}
              onChange={handleReportFieldChange}
              namePrefix="stp-report"
            />
          </div>
        </form>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0 bg-white">
          <button type="button" onClick={onClose} className="px-5 py-2 text-sm font-bold text-slate-500 hover:text-slate-800">
            取消
          </button>
          <button
            type="button"
            onClick={submitReport}
            disabled={
              !canSubmitMatrix ||
              !reportForm.workerId ||
              (needEquipment && !reportForm.equipmentId) ||
              (!isMatrixMode && ((reportModal.productItems ?? reportModal.order.items).length > 1) && !reportForm.variantId)
            }
            className="px-6 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50"
          >
            <Check className="w-4 h-4" /> 确认提交
          </button>
        </div>
      </div>
      {displayImagePreview && (
        <div
          className="absolute inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 bg-slate-900/80 backdrop-blur-sm"
          onClick={closeDisplayImagePreview}
          role="presentation"
        >
          <button
            type="button"
            onClick={closeDisplayImagePreview}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors"
            aria-label="关闭预览"
          >
            <X className="w-6 h-6" />
          </button>
          <div
            className="relative z-[1] w-full max-w-4xl max-h-[90vh] rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="图片预览"
          >
            <img src={displayImagePreview} alt="预览" className="max-h-[85vh] w-full object-contain bg-slate-900" />
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(ReportModal);
