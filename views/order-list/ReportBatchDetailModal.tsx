/**
 * 报工批次详情弹窗 (主壳, Phase P3 拆分后)。
 *
 * 拆分对照:
 * - hooks/useReportBatchDetail.ts        — editingReport state + handleSave/handleEnterEdit/handleDelete
 * - utils/buildReportBatchPrintContext.ts — 打印 ctx 构建 (纯函数)
 * - utils/reportBatchWeightHelpers.ts    — 重量分摊纯函数 (前 session 已抽)
 * - views/order-list/report-batch/ReportBatchItemsTable.tsx — 详情视图明细表 (含矩阵/单行)
 * - views/order-list/report-batch/ReportBatchEditFlow.tsx   — 编辑视图全部 JSX
 *
 * 主壳只负责:
 * - props 解构 + 派生只读数据 (productMap / categoryMap / batchDetailMatrix / 打印 ctx)
 * - DocPhaseModal 编排 + 把派生 props 切片塞给子组件
 */
import React, { useMemo, useCallback, useContext, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import {
  ProductionOrder,
  Product,
  ProductCategory,
  GlobalNodeTemplate,
  AppDictionaries,
  Worker,
  ProductMilestoneProgress,
  ProductionOpRecord,
  ProcessSequenceMode,
  OrderFormSettings,
  OutsourceFormSettings,
  Partner,
  PartnerCategory,
  PrintTemplate,
  PrintRenderContext,
  DEFAULT_OUTSOURCE_FORM_SETTINGS,
} from '../../types';
import DocPhaseModal, { DocPhaseEditToolbarPortalContext } from '../../components/DocPhaseModal';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import { buildVariantQtyMatrixLayout } from '../../utils/variantQtyMatrix';
import { weightToNumberSumPart } from '../../utils/reportBatchWeightHelpers';
import {
  isOutsourceReceiveReport,
  outsourceReceiveDocNoFromReport,
  resolveReportDisplayEconomics,
} from '../../utils/outsourceReceiveReportDisplay';
import { hasOpsPerm } from '../production-ops/types';
import OutsourceFlowDocumentDetailModal from '../production-ops/OutsourceFlowDocumentDetailModal';
import { OrderCenterDetailPrintBlock } from '../../components/order-print/OrderCenterDetailPrintBlock';
import { buildDefectiveReworkByOrderMilestone } from '../../utils/defectiveReworkByOrderMilestone';
import { buildReportBatchPrintContext } from '../../utils/buildReportBatchPrintContext';
import {
  useReportBatchDetail,
  type ReportDetailBatch,
  type OrderReportRow,
  type ProductReportRow,
} from '../../hooks/useReportBatchDetail';
import ReportBatchItemsTable, { type BatchDetailMatrix } from './report-batch/ReportBatchItemsTable';
import ReportBatchEditFlow from './report-batch/ReportBatchEditFlow';

export type { ReportDetailBatch };

function reportNodeUsesWeight(globalNodes: GlobalNodeTemplate[], templateId: string): boolean {
  return !!globalNodes.find(n => n.id === templateId)?.enableWeightOnReport;
}

function ReportBatchEditSavePortal({ active, onSave }: { active: boolean; onSave: () => void }) {
  const host = useContext(DocPhaseEditToolbarPortalContext);
  if (!active || !host) return null;
  return createPortal(
    <button
      type="button"
      onClick={onSave}
      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700"
    >
      <Check className="w-4 h-4" /> 保存
    </button>,
    host,
  );
}

type ReportUpdateParams = {
  orderId: string;
  milestoneId: string;
  reportId: string;
  quantity: number;
  defectiveQuantity?: number;
  timestamp?: string;
  operator?: string;
  newOrderId?: string;
  newMilestoneId?: string;
  customData?: Record<string, unknown>;
  weight?: number | null;
};

interface ReportBatchDetailModalProps {
  batch: ReportDetailBatch;
  onClose: () => void;
  orders: ProductionOrder[];
  products: Product[];
  categories: ProductCategory[];
  dictionaries: AppDictionaries;
  globalNodes: GlobalNodeTemplate[];
  workers: Worker[];
  prodRecords: ProductionOpRecord[];
  productMilestoneProgresses: ProductMilestoneProgress[];
  processSequenceMode: ProcessSequenceMode;
  productionLinkMode: 'order' | 'product';
  orderFormSettings?: OrderFormSettings;
  printTemplates?: PrintTemplate[];
  onOpenOrderFormPrintTab?: () => void;
  onUpdateReport?: (params: ReportUpdateParams) => void;
  onDeleteReport?: (params: { orderId: string; milestoneId: string; reportId: string }) => void;
  onUpdateReportProduct?: (params: { progressId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string; newMilestoneTemplateId?: string; customData?: Record<string, unknown>; weight?: number | null }) => void;
  onDeleteReportProduct?: (params: { progressId: string; reportId: string }) => void;
  onUpdateProduct?: (product: Product) => Promise<Product | null>;
  /** 矩阵编辑补录新规格时用,与 ReportModal 多规格报工一致 */
  onReportSubmit?: (oId: string, mId: string, qty: number, data: Record<string, unknown> | null, vId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string, weight?: number) => Promise<void>;
  onReportSubmitProduct?: (productId: string, milestoneTemplateId: string, qty: number, data: Record<string, unknown> | null, vId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string, weight?: number) => Promise<void>;
  hasOrderPerm: (permKey: string) => boolean;
  partners?: Partner[];
  partnerCategories?: PartnerCategory[];
  outsourceFormSettings?: OutsourceFormSettings;
  onAddRecord?: (record: ProductionOpRecord) => void;
  onAddRecordBatch?: (records: ProductionOpRecord[]) => Promise<void>;
  onUpdateRecord?: (record: ProductionOpRecord) => void;
  onDeleteRecord?: (recordId: string) => void;
  userPermissions?: string[];
  tenantRole?: string;
  onOpenOutsourceFormPrintTab?: () => void;
}

const ReportBatchDetailModal: React.FC<ReportBatchDetailModalProps> = ({
  batch: reportDetailBatch,
  onClose,
  orders,
  products,
  categories,
  dictionaries,
  globalNodes,
  workers,
  prodRecords,
  productionLinkMode,
  productMilestoneProgresses: _productMilestoneProgresses,
  processSequenceMode,
  orderFormSettings,
  printTemplates = [],
  onOpenOrderFormPrintTab,
  onUpdateReport,
  onDeleteReport,
  onUpdateReportProduct,
  onDeleteReportProduct,
  onUpdateProduct,
  onReportSubmit,
  onReportSubmitProduct,
  hasOrderPerm,
  partners = [],
  partnerCategories = [],
  outsourceFormSettings = DEFAULT_OUTSOURCE_FORM_SETTINGS,
  onAddRecord,
  onAddRecordBatch,
  onUpdateRecord,
  onDeleteRecord,
  userPermissions,
  tenantRole,
  onOpenOutsourceFormPrintTab,
}) => {
  const isOutsourceReceiveBatch = isOutsourceReceiveReport(reportDetailBatch.first.report);
  const outsourceDocNo = outsourceReceiveDocNoFromReport(reportDetailBatch.first.report);
  const outsourceReceiveEditEnabled = isOutsourceReceiveBatch && !!outsourceDocNo && !!onDeleteRecord;

  const [outsourcePhase, setOutsourcePhase] = useState<'detail' | 'edit'>('detail');
  useEffect(() => {
    setOutsourcePhase('detail');
  }, [reportDetailBatch.key]);

  const hasModalPerm = useCallback(
    (permKey: string) =>
      outsourceReceiveEditEnabled
        ? hasOpsPerm(tenantRole, userPermissions, permKey)
        : hasOrderPerm(permKey),
    [outsourceReceiveEditEnabled, tenantRole, userPermissions, hasOrderPerm],
  );

  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const categoryMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  /** 批次内每条记录对应唯一规格时,报工明细可用颜色×尺码矩阵展示(与报工弹窗一致) */
  const batchDetailMatrix = useMemo<BatchDetailMatrix | null>(() => {
    const b = reportDetailBatch;
    const productId = b.source === 'order' ? b.first.order.productId : b.productId;
    const p = products.find(px => px.id === productId);
    if (!p?.variants?.length) return null;
    const cat = p.categoryId ? categoryMap.get(p.categoryId) : undefined;
    if (!productHasColorSizeMatrix(p, cat)) return null;

    const variantToReportId = new Map<string, string>();
    const goodByVariant: Record<string, number> = {};
    const defectiveByVariant: Record<string, number> = {};

    if (b.source === 'order') {
      for (const { report } of b.rows as OrderReportRow[]) {
        if (!report.variantId) return null;
        if (variantToReportId.has(report.variantId)) return null;
        variantToReportId.set(report.variantId, report.id);
        goodByVariant[report.variantId] = report.quantity;
        defectiveByVariant[report.variantId] = report.defectiveQuantity ?? 0;
      }
    } else {
      for (const { progress, report } of b.rows as ProductReportRow[]) {
        if (!progress.variantId) return null;
        if (variantToReportId.has(progress.variantId)) return null;
        variantToReportId.set(progress.variantId, report.id);
        goodByVariant[progress.variantId] = report.quantity;
        defectiveByVariant[progress.variantId] = report.defectiveQuantity ?? 0;
      }
    }

    const layout = buildVariantQtyMatrixLayout(p, dictionaries);
    if (!layout) return null;
    return { product: p, layout, variantToReportId, goodByVariant, defectiveByVariant };
  }, [reportDetailBatch, products, categoryMap, dictionaries]);

  const reportDetailViewTemplateId =
    reportDetailBatch.source === 'order'
      ? reportDetailBatch.first.milestone.templateId
      : reportDetailBatch.milestoneTemplateId;
  const reportDetailViewNodeUsesWeight = useMemo(
    () => reportNodeUsesWeight(globalNodes, reportDetailViewTemplateId),
    [globalNodes, reportDetailViewTemplateId],
  );
  const reportDetailBatchTotalWeightKg = useMemo(() => {
    if (reportDetailBatch.source === 'order') {
      return (reportDetailBatch.rows as OrderReportRow[]).reduce<number>((s, { report }) => s + weightToNumberSumPart(report.weight), 0);
    }
    return (reportDetailBatch.rows as ProductReportRow[]).reduce<number>((s, { report }) => s + weightToNumberSumPart(report.weight), 0);
  }, [reportDetailBatch]);

  const { displayBatchTotalAmount, displayBatchTotalWeightKg } = useMemo(() => {
    let amount = reportDetailBatch.totalAmount;
    let weight = reportDetailBatchTotalWeightKg;
    if (!isOutsourceReceiveReport(reportDetailBatch.first.report)) {
      return { displayBatchTotalAmount: amount, displayBatchTotalWeightKg: weight };
    }
    amount = 0;
    weight = 0;
    if (reportDetailBatch.source === 'order') {
      for (const { order, milestone, report } of reportDetailBatch.rows as OrderReportRow[]) {
        const p = productMap.get(order.productId);
        const eco = resolveReportDisplayEconomics(report, prodRecords, {
          nodeId: milestone.templateId,
          productId: order.productId,
          orderId: order.id,
          fallbackRate: p?.nodeRates?.[milestone.templateId],
        });
        amount += eco.amount;
        if (eco.weight != null) weight += eco.weight;
      }
    } else {
      for (const { progress, report } of reportDetailBatch.rows as ProductReportRow[]) {
        const p = productMap.get(progress.productId);
        const eco = resolveReportDisplayEconomics(report, prodRecords, {
          nodeId: progress.milestoneTemplateId,
          productId: progress.productId,
          orderId: null,
          fallbackRate: p?.nodeRates?.[progress.milestoneTemplateId],
        });
        amount += eco.amount;
        if (eco.weight != null) weight += eco.weight;
      }
    }
    return { displayBatchTotalAmount: amount, displayBatchTotalWeightKg: weight };
  }, [reportDetailBatch, reportDetailBatchTotalWeightKg, prodRecords, productMap]);

  const defectiveAndReworkByOrderMilestone = useMemo(
    () => buildDefectiveReworkByOrderMilestone(orders, prodRecords),
    [orders, prodRecords],
  );
  const getDefectiveRework = useCallback(
    (orderId: string, templateId: string) =>
      defectiveAndReworkByOrderMilestone.get(`${orderId}|${templateId}`) ?? { defective: 0, rework: 0, reworkByVariant: {} as Record<string, number> },
    [defectiveAndReworkByOrderMilestone],
  );

  /** 列表里可能筛掉部分工单;批次行里内嵌的 order 仍应用来计算可报上限 */
  const resolveOrderById = useCallback(
    (orderId: string): ProductionOrder | undefined =>
      orders.find(o => o.id === orderId) ??
      (reportDetailBatch.source === 'order'
        ? (reportDetailBatch.rows as OrderReportRow[]).find(r => r.order.id === orderId)?.order
        : undefined),
    [orders, reportDetailBatch],
  );

  const buildPrintContextForPicker = useCallback(
    (template: PrintTemplate): PrintRenderContext =>
      buildReportBatchPrintContext(template, {
        batch: reportDetailBatch,
        productMap,
        products,
        dictionaries,
      }),
    [reportDetailBatch, productMap, products, dictionaries],
  );

  const {
    editingReport,
    setEditingReport,
    handleClose,
    handleSave,
    handleEnterEdit,
    handleDelete,
  } = useReportBatchDetail({
    reportDetailBatch,
    batchDetailMatrix,
    productMap,
    orders,
    globalNodes,
    workers,
    onClose,
    onUpdateReport,
    onDeleteReport,
    onUpdateReportProduct,
    onDeleteReportProduct,
    onUpdateProduct,
    onReportSubmit,
    onReportSubmitProduct,
  });

  const handleOutsourceDelete = useCallback(() => {
    if (!outsourceDocNo || !onDeleteRecord) return;
    prodRecords
      .filter(r => r.type === 'OUTSOURCE' && r.status === '已收回' && (r.docNo ?? '') === outsourceDocNo)
      .forEach(r => onDeleteRecord(r.id));
    onClose();
  }, [outsourceDocNo, onDeleteRecord, prodRecords, onClose]);

  const modalPhase = outsourceReceiveEditEnabled
    ? outsourcePhase
    : editingReport
      ? 'edit'
      : 'detail';

  const handleEnterEditMode = useCallback(() => {
    if (outsourceReceiveEditEnabled) {
      setOutsourcePhase('edit');
      return;
    }
    handleEnterEdit();
  }, [outsourceReceiveEditEnabled, handleEnterEdit]);

  const handleCancelEditMode = useCallback(() => {
    if (outsourceReceiveEditEnabled) {
      setOutsourcePhase('detail');
      return;
    }
    setEditingReport(null);
  }, [outsourceReceiveEditEnabled, setEditingReport]);

  const displayDocNo =
    outsourceDocNo ??
    (reportDetailBatch.source === 'order'
      ? (reportDetailBatch.first as OrderReportRow).order.orderNumber
      : reportDetailBatch.productName || '—');

  return (
    <DocPhaseModal
      zIndexClass="z-[90]"
      open
      phase={modalPhase}
      editingDocNumber={displayDocNo}
      maxWidthClass="max-w-4xl"
      detailTitle={outsourceReceiveEditEnabled ? '外协收回详情' : '报工详情'}
      editTitle={outsourceReceiveEditEnabled ? '编辑外协收回单' : '报工 · 编辑'}
      newTitle=""
      leadingDetailActions={
        <OrderCenterDetailPrintBlock
          printSlot={orderFormSettings?.orderCenterPrint?.reportBatchDetail}
          printTemplates={printTemplates}
          buildContext={buildPrintContextForPicker}
          onAddPrintTemplate={onOpenOrderFormPrintTab}
          pickerSubtitle={
            reportDetailBatch.reportNo
              ? `报工批次 ${reportDetailBatch.reportNo}`
              : reportDetailBatch.source === 'order'
                ? `工单 ${(reportDetailBatch.first as OrderReportRow).order.orderNumber}`
                : reportDetailBatch.productName
          }
        />
      }
      hasPerm={hasModalPerm}
      viewPerm={
        outsourceReceiveEditEnabled
          ? 'production:outsource_records:view'
          : 'production:orders_report_records:view'
      }
      editPerm={
        outsourceReceiveEditEnabled
          ? 'production:outsource_records:edit'
          : 'production:orders_report_records:edit'
      }
      deletePerm={
        outsourceReceiveEditEnabled
          ? onDeleteRecord
            ? 'production:outsource_records:delete'
            : undefined
          : handleDelete
            ? 'production:orders_report_records:delete'
            : undefined
      }
      deleteConfirmMessage={
        outsourceReceiveEditEnabled
          ? '确定要删除该张外协收回单的所有记录吗？此操作不可恢复。'
          : '确定要删除该次报工的所有记录吗？此操作不可恢复。'
      }
      onDelete={outsourceReceiveEditEnabled ? handleOutsourceDelete : handleDelete}
      renderDocBadge={() => (
        <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
          {outsourceReceiveEditEnabled
            ? '外协收回'
            : reportDetailBatch.source === 'order'
              ? (reportDetailBatch.first as OrderReportRow).order.orderNumber
              : '产品'}
        </span>
      )}
      onClose={handleClose}
      onEnterEdit={handleEnterEditMode}
      onCancelEdit={handleCancelEditMode}
      renderContent={() => (
        <>
          {outsourceReceiveEditEnabled && outsourcePhase === 'edit' && outsourceDocNo ? (
            <OutsourceFlowDocumentDetailModal
              layout="docPhase"
              phase="edit"
              onAfterSave={handleClose}
              productionLinkMode={productionLinkMode}
              flowDetailKey={outsourceDocNo}
              records={prodRecords}
              orders={orders}
              products={products}
              categories={categories}
              dictionaries={dictionaries}
              globalNodes={globalNodes}
              partners={partners}
              partnerCategories={partnerCategories}
              userPermissions={userPermissions}
              tenantRole={tenantRole}
              onAddRecord={onAddRecord ?? (() => {})}
              onAddRecordBatch={onAddRecordBatch}
              onUpdateRecord={onUpdateRecord}
              onDeleteRecord={onDeleteRecord}
              outsourceFormSettings={outsourceFormSettings}
              printTemplates={printTemplates}
              onOpenOutsourceFormPrintTab={onOpenOutsourceFormPrintTab}
              onClose={handleClose}
            />
          ) : (
          <>
          <ReportBatchEditSavePortal active={!!editingReport && !outsourceReceiveEditEnabled} onSave={handleSave} />
          <div className="space-y-4">
            {reportDetailBatch.source === 'order' && !outsourceReceiveEditEnabled ? (
              <div className="space-y-0.5">
                <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium">
                  工单{' '}
                  <span className="font-bold text-slate-600 tabular-nums">
                    {reportDetailBatch.first.order.orderNumber}
                  </span>
                </p>
              </div>
            ) : null}
            {editingReport && !outsourceReceiveEditEnabled ? (
              <ReportBatchEditFlow
                editingReport={editingReport}
                setEditingReport={setEditingReport}
                reportDetailBatch={reportDetailBatch}
                batchDetailMatrix={batchDetailMatrix}
                orders={orders}
                products={products}
                productMap={productMap}
                categoryMap={categoryMap}
                dictionaries={dictionaries}
                globalNodes={globalNodes}
                workers={workers}
                prodRecords={prodRecords}
                processSequenceMode={processSequenceMode}
                resolveOrderById={resolveOrderById}
                getDefectiveRework={getDefectiveRework}
              />
            ) : (
              <ReportBatchItemsTable
                batch={reportDetailBatch}
                batchDetailMatrix={batchDetailMatrix}
                products={products}
                categoryMap={categoryMap}
                dictionaries={dictionaries}
                globalNodes={globalNodes}
                prodRecords={prodRecords}
                reportDetailViewNodeUsesWeight={reportDetailViewNodeUsesWeight}
                reportDetailBatchTotalWeightKg={reportDetailBatchTotalWeightKg}
                displayBatchTotalAmount={displayBatchTotalAmount}
                displayBatchTotalWeightKg={displayBatchTotalWeightKg}
              />
            )}
          </div>
          </>
          )}
        </>
      )}
    />
  );
};

export default React.memo(ReportBatchDetailModal);
