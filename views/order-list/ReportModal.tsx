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
import { reworkMergeBucketOrderId } from '../../utils/reworkMergeBucketOrderId';
import { buildDefectiveReworkByOrderMilestone } from '../../utils/defectiveReworkByOrderMilestone';
import { buildOutOfSequenceTemplateIds } from '../../shared/processSequence';
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
import { computeReportRowDerivations } from '../../utils/reportRowDerivations';
import { ScanBatchTrigger } from '../../components/scan/ScanBatchTrigger';

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
  const outOfSequenceTemplateIds = useMemo(() => buildOutOfSequenceTemplateIds(globalNodes), [globalNodes]);

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
  const scanWeighingEnabled = useMemo(
    () => !!globalNodes.find(n => n.id === reportModal.milestone.templateId)?.enableScanWeighing,
    [globalNodes, reportModal.milestone.templateId],
  );

  const { scanEnabled, weightEnabled } = useTraceabilityPlugin();
  // 秤框/称重比对由工序「扫码称重」开关控制；「报工时记录重量」只决定是否把实测重量写入报工表单
  const scanWeightCheckEnabled = scanWeighingEnabled && weightEnabled;

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
  const scanMaxQtyRef = useRef<(productId: string, variantId: string | null) => number | null>(() => null);
  const getScanMaxQty = useCallback(
    (productId: string, variantId: string | null) => scanMaxQtyRef.current(productId, variantId),
    [],
  );

  const effectiveReportTemplate = useMemo(
    () => getEffectiveReportTemplate(reportModal.milestone, globalNodes),
    [reportModal.order.id, reportModal.milestone.id, reportModal.milestone.templateId, reportModal.milestone.reportTemplate, globalNodes],
  );

  const {
    reportForm,
    setReportForm,
    productForms,
    sessionProductIds,
    setProductForm,
    weightPreviewRows,
    getWeightPreviewRowsForProduct,
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

  const tid = reportModal.milestone.templateId;
  const anchorProductId = reportModal.order.productId;

  const productRowDerivations = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeReportRowDerivations>>();
    for (const productId of sessionProductIds) {
      const isAnchor = productId === anchorProductId;
      map.set(
        productId,
        computeReportRowDerivations({
          productId,
          milestoneTemplateId: tid,
          productionLinkMode,
          processSequenceMode,
          outOfSequenceTemplateIds,
          orders,
          productMilestoneProgresses,
          prodRecords,
          getDefectiveRework,
          reworkMergeBucketOrderId,
          productTotalQty: isAnchor ? reportModal.productTotalQty : undefined,
          productCompletedQty: isAnchor ? reportModal.productCompletedQty : undefined,
          productMaxReportableQty: isAnchor ? reportModal.productMaxReportableQty : undefined,
          scopedOrderIds: isAnchor ? orderIdsInModal : undefined,
        }),
      );
    }
    return map;
  }, [
    sessionProductIds,
    anchorProductId,
    tid,
    productionLinkMode,
    processSequenceMode,
    outOfSequenceTemplateIds,
    orders,
    productMilestoneProgresses,
    prodRecords,
    defectiveAndReworkByOrderMilestone,
    reportModal.productTotalQty,
    reportModal.productCompletedQty,
    reportModal.productMaxReportableQty,
    orderIdsInModal,
  ]);

  const canSubmitAnyProduct = sessionProductIds.some(pid => {
    const form = productForms[pid];
    if (!form) return false;
    const product = productMap.get(pid);
    const category = product?.categoryId ? categoryMap.get(product.categoryId) : undefined;
    const matrix = productHasColorSizeMatrix(product, category);
    if (matrix && form.variantQuantities) {
      const qty = Object.values(form.variantQuantities).reduce<number>((s, q) => s + (q as number), 0);
      const def = Object.values(form.variantDefectiveQuantities ?? {}).reduce<number>((s, q) => s + (q as number), 0);
      return qty + def > 0;
    }
    return form.quantity + form.defectiveQuantity > 0;
  });

  const needEquipment =
    equipmentFeaturesOn &&
    !!globalNodes.find(n => n.id === reportModal.milestone.templateId)?.enableEquipmentOnReport;

  if (!open) return null;

  const productForModal = productMap.get(anchorProductId);

  scanMaxQtyRef.current = (productId, variantId) => {
    // 开启「允许报工数量超过最大可报数量」时放开扫码上限，与手输/矩阵输入及后端
    // enforceReportQuantity（受同一 allowExceedMaxReportQty 控制）保持一致。
    if (allowExceedMaxReportQty) return null;
    const row = productRowDerivations.get(productId);
    if (!row) return null;
    const product = productMap.get(productId);
    const category = product?.categoryId ? categoryMap.get(product.categoryId) : undefined;
    const matrix = productHasColorSizeMatrix(product, category);
    const form = productForms[productId];
    if (matrix) {
      if (!variantId) return null;
      const base = getSeqRemainingForVariant(productId, variantId);
      const def = form?.variantDefectiveQuantities?.[variantId] ?? 0;
      const out = row.outsourcedByVariantId[variantId] ?? 0;
      return Math.max(0, base - def - out);
    }
    return row.effectiveRemainingForModal;
  };

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
            {sessionProductIds.length > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-2">
                <p className="text-xs font-bold text-indigo-800">同工序多产品报工 · 已纳入 {sessionProductIds.length} 款产品</p>
                {scanEnabled ? (
                  <ScanBatchTrigger
                    onApply={handleScanBatchConfirm}
                    resolveRowPreview={resolveReportScanRowPreview}
                    hint="扫码录入"
                    modalTitle="报工 · 批量扫码（多产品）"
                    modalHint="可扫入不同产品的码，系统将按产品归集；须均为当前工序。"
                    showScanIntentToggle
                    enableWeightCheck={scanWeightProps?.enableWeightCheck}
                    weightNodeId={scanWeightProps?.weightNodeId}
                    weightTolerancePercent={scanWeightProps?.weightTolerancePercent}
                    getUnitWeightKg={scanWeightProps?.getUnitWeightKg}
                  />
                ) : null}
              </div>
            ) : null}

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

            {sessionProductIds.map(productId => {
              const form = productForms[productId] ?? reportForm;
              const row = productRowDerivations.get(productId);
              if (!row) return null;
              const product = productMap.get(productId);
              const category = product?.categoryId ? categoryMap.get(product.categoryId) : undefined;
              const matrix = productHasColorSizeMatrix(product, category);
              const productOrders = row.ordersInModal;
              const displayOrder =
                productOrders[0] ??
                (productId === anchorProductId ? reportModal.order : reportModal.order);
              const matrixTotalQty = form.variantQuantities
                ? Object.values(form.variantQuantities).reduce<number>((s, q) => s + (q as number), 0)
                : 0;
              const showScanOnRow = sessionProductIds.length === 1;
              return (
                <div key={productId} className={sessionProductIds.length > 1 ? 'rounded-xl border border-slate-200 p-3 space-y-2' : ''}>
                  {sessionProductIds.length > 1 && !matrix ? (
                    <p className="text-sm font-bold text-slate-800">{product?.name ?? productId}</p>
                  ) : null}
                  {matrix ? (
                    <ReportVariantMatrixInput
                      productId={productId}
                      reportModal={reportModal}
                      reportForm={form}
                      ordersInModal={productOrders}
                      orders={orders}
                      productMap={productMap}
                      categoryMap={categoryMap}
                      productMilestoneProgresses={productMilestoneProgresses}
                      productionLinkMode={productionLinkMode}
                      processSequenceMode={processSequenceMode}
                      outOfSequenceTemplateIds={outOfSequenceTemplateIds}
                      dictionaries={dictionaries}
                      matrixTotalQty={matrixTotalQty}
                      effectiveRemainingForModal={row.effectiveRemainingForModal}
                      allowExceedMaxReportQty={allowExceedMaxReportQty}
                      hintTotalQty={row.hintTotalQty}
                      hintMaxReportable={row.hintMaxReportable}
                      hintCompletedDisplay={row.hintCompletedDisplay}
                      hintRemaining={row.hintRemaining}
                      totalOutsourcedAtNode={row.totalOutsourcedAtNode}
                      defectiveQtyForHint={row.defectiveQtyForHint}
                      totalRework={row.totalRework}
                      productOrder={displayOrder}
                      outsourcedByVariantId={row.outsourcedByVariantId}
                      getDefectiveRework={getDefectiveRework}
                      getSeqRemainingForVariant={getSeqRemainingForVariant}
                      onVariantQtyChange={handleVariantQuantityChange}
                      onVariantDefChange={handleVariantDefectiveChange}
                      onScanBatchConfirm={handleScanBatchConfirm}
                      resolveScanRowPreview={resolveReportScanRowPreview}
                      scanWeightProps={scanWeightProps}
                      scanEnabled={scanEnabled && showScanOnRow}
                    />
                  ) : (
                    <ReportSingleVariantInput
                      productId={productId}
                      productOrder={displayOrder}
                      reportModal={reportModal}
                      reportForm={form}
                      setReportForm={updater => setProductForm(productId, updater)}
                      productMap={productMap}
                      dictionaries={dictionaries}
                      productionLinkMode={productionLinkMode}
                      effectiveRemainingForModal={row.effectiveRemainingForModal}
                      allowExceedMaxReportQty={allowExceedMaxReportQty}
                      hintTotalQty={row.hintTotalQty}
                      hintMaxReportable={row.hintMaxReportable}
                      hintCompletedDisplay={row.hintCompletedDisplay}
                      hintRemaining={row.hintRemaining}
                      totalOutsourcedAtNode={row.totalOutsourcedAtNode}
                      defectiveQtyForHint={row.defectiveQtyForHint}
                      totalRework={row.totalRework}
                      onScanBatchConfirm={handleScanBatchConfirm}
                      resolveScanRowPreview={resolveReportScanRowPreview}
                      scanWeightProps={scanWeightProps}
                      scanEnabled={scanEnabled && showScanOnRow}
                    />
                  )}
                  {weightReportEnabled && sessionProductIds.length > 1 ? (
                    <ReportWeightBomSection
                      weight={form.weight}
                      onWeightChange={(n) => setProductForm(productId, prev => ({ ...prev, weight: n }))}
                      weightPreviewRows={getWeightPreviewRowsForProduct(productId, form)}
                    />
                  ) : null}
                </div>
              );
            })}

            {weightReportEnabled && sessionProductIds.length === 1 ? (
              <ReportWeightBomSection
                weight={reportForm.weight}
                onWeightChange={(n) => setReportForm(prev => ({ ...prev, weight: n }))}
                weightPreviewRows={weightPreviewRows}
              />
            ) : null}

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
              !canSubmitAnyProduct ||
              !reportForm.workerId ||
              (needEquipment && !reportForm.equipmentId)
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
