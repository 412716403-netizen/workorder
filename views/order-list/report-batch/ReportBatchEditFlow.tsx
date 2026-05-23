/**
 * 报工批次详情 - 编辑视图 (Phase P3 抽离自 ReportBatchDetailModal.tsx)。
 *
 * 接收受控的 editingReport + setEditingReport,以及只读的 batch / matrix / 字典等。
 * 内部包含:
 * - 上限计算 (effectiveRemainingSaved / maxBatchGood)
 * - 报工头信息编辑 (时间 / 操作人 / 工价 / 工序切换)
 * - 填报项编辑
 * - 矩阵编辑表格 (颜色 × 尺码) 或 单行编辑表格
 *
 * 为下一轮迭代留拆分点: 报工头 / 矩阵表 / 单行表 三个子组件可继续抽离。
 */
import React from 'react';
import { UserPlus } from 'lucide-react';
import type {
  ProductionOrder,
  Product,
  ProductCategory,
  ProductVariant,
  GlobalNodeTemplate,
  AppDictionaries,
  Worker,
  ProductionOpRecord,
  ProcessSequenceMode,
} from '../../../types';
import WorkerSelector from '../../../components/WorkerSelector';
import {
  getEffectiveReportTemplate,
  mergeCustomDataForTemplate,
} from '../../../utils/effectiveReportTemplate';
import ReportCustomFieldsEditor from '../../../components/ReportCustomFieldsEditor';
import { getProductCategoryCustomFieldEntries } from '../../../utils/reportCustomDocField';
import QtyMatrixTable, { type QtyMatrixTableRow } from '../../../components/variant-matrix/QtyMatrixTable';
import {
  VARIANT_QTY_MATRIX_CONTAINER_ATTR,
  handleVariantQtyMatrixKeyDown,
} from '../../../utils/matrixKeyboardNav';
import { Package } from 'lucide-react';
import type { EditingReportState, ReportDetailBatch } from '../../../hooks/useReportBatchDetail';
import type { BatchDetailMatrix } from './ReportBatchItemsTable';
import { formStandardLabelClass } from '../../../styles/uiDensity';

function reportNodeUsesWeight(globalNodes: GlobalNodeTemplate[], templateId: string): boolean {
  return !!globalNodes.find(n => n.id === templateId)?.enableWeightOnReport;
}

function orderEffectiveRemainingAtTemplate(
  order: ProductionOrder,
  templateId: string,
  processSequenceMode: ProcessSequenceMode,
  getDefectiveRework: (orderId: string, tid: string) => { defective: number; rework: number },
  prodRecords: ProductionOpRecord[],
): number {
  const orderTotal = order.items.reduce((s, i) => s + i.quantity, 0);
  const ms = order.milestones.find(m => m.templateId === templateId);
  if (!ms) return 0;
  const totalBase =
    processSequenceMode === 'sequential'
      ? (() => {
          const idx = order.milestones.findIndex(m => m.templateId === templateId);
          if (idx <= 0) return orderTotal;
          const prev = order.milestones[idx - 1];
          return prev?.completedQuantity ?? 0;
        })()
      : orderTotal;
  const { defective: drDef, rework: drRework } = getDefectiveRework(order.id, templateId);
  const outsourcedPending = prodRecords
    .filter(r => r.type === 'OUTSOURCE' && r.status === '加工中' && r.orderId === order.id && r.nodeId === templateId)
    .reduce((s, r) => s + (r.quantity ?? 0), 0);
  return Math.max(0, totalBase - drDef + drRework - (ms.completedQuantity ?? 0) - outsourcedPending);
}

interface Props {
  editingReport: NonNullable<EditingReportState>;
  setEditingReport: React.Dispatch<React.SetStateAction<EditingReportState>>;
  reportDetailBatch: ReportDetailBatch;
  batchDetailMatrix: BatchDetailMatrix | null;
  orders: ProductionOrder[];
  products: Product[];
  productMap: Map<string, Product>;
  categoryMap: Map<string, ProductCategory>;
  dictionaries: AppDictionaries;
  globalNodes: GlobalNodeTemplate[];
  workers: Worker[];
  prodRecords: ProductionOpRecord[];
  processSequenceMode: ProcessSequenceMode;
  resolveOrderById: (orderId: string) => ProductionOrder | undefined;
  getDefectiveRework: (orderId: string, templateId: string) => { defective: number; rework: number; reworkByVariant: Record<string, number> };
}

const ReportBatchEditFlow: React.FC<Props> = ({
  editingReport,
  setEditingReport,
  reportDetailBatch,
  batchDetailMatrix,
  orders,
  products,
  productMap,
  categoryMap,
  dictionaries,
  globalNodes,
  workers,
  prodRecords,
  processSequenceMode,
  resolveOrderById,
  getDefectiveRework,
}) => {
  const order = reportDetailBatch.source === 'order' ? orders.find(o => o.id === editingReport.orderId) : null;
  const milestone = order?.milestones.find(m => m.templateId === editingReport.templateId);
  const tid = editingReport.templateId;
  const editFlatUsesWeight = reportNodeUsesWeight(globalNodes, tid);
  const effectiveRemainingSaved =
    reportDetailBatch.source === 'order'
      ? [...new Set(reportDetailBatch.rows.map(r => r.order.id))].reduce<number>((sum, oid) => {
          const o = resolveOrderById(oid);
          if (!o) return sum;
          return sum + orderEffectiveRemainingAtTemplate(o, tid, processSequenceMode, getDefectiveRework, prodRecords);
        }, 0)
      : Math.max(
          0,
          (() => {
            const orderTotal = order ? order.items.reduce((s, i) => s + i.quantity, 0) : 0;
            const totalBase =
              order && milestone && processSequenceMode === 'sequential'
                ? (() => {
                    const idx = order.milestones.findIndex(m => m.templateId === tid);
                    if (idx <= 0) return orderTotal;
                    const prev = order.milestones[idx - 1];
                    return prev?.completedQuantity ?? 0;
                  })()
                : orderTotal || 0;
            const { defective: totalDefective, rework: totalRework } = order
              ? getDefectiveRework(order.id, tid)
              : { defective: 0, rework: 0 };
            const totalCompleted = milestone?.completedQuantity ?? 0;
            const outsourcedPendingEdit = order
              ? prodRecords
                  .filter(r => r.type === 'OUTSOURCE' && r.status === '加工中' && r.orderId === order.id && r.nodeId === tid)
                  .reduce((s, r) => s + (r.quantity ?? 0), 0)
              : 0;
            return totalBase - totalDefective + totalRework - totalCompleted - outsourcedPendingEdit;
          })(),
        );
  const batchDefectiveSum = editingReport.form.rowEdits.reduce((s, r) => s + r.defectiveQuantity, 0);
  const rowGoodSum = editingReport.form.rowEdits.reduce((s, r) => s + r.quantity, 0);
  const maxBatchGoodBase =
    effectiveRemainingSaved + reportDetailBatch.totalGood + reportDetailBatch.totalDefective - batchDefectiveSum;
  const maxBatchGood =
    reportDetailBatch.source === 'order'
      ? Math.max(0, maxBatchGoodBase, reportDetailBatch.totalGood, rowGoodSum)
      : Math.max(0, maxBatchGoodBase);

  return (
    <>
      {reportDetailBatch.source === 'order' && order && (
        <div className="text-xs text-slate-500 bg-slate-50 rounded-xl px-4 py-2">
          本工序可报最多 <span className="font-bold text-indigo-600">{effectiveRemainingSaved}</span> 件（已扣不良、加返工）；当前批良品合计不超过 <span className="font-bold text-indigo-600">{Math.max(0, maxBatchGood)}</span> 件
        </div>
      )}
      <div className="space-y-2">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">报工信息</p>
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3 space-y-3">
          <div className="space-y-1">
            <label className={formStandardLabelClass}>工序</label>
            <select
              value={editingReport.templateId}
              onChange={e => {
                const newTemplateId = e.target.value;
                const product = productMap.get(editingReport.productId);
                const newRate = product?.nodeRates?.[newTemplateId] ?? 0;
                if (reportDetailBatch.source === 'order') {
                  const order = orders.find(o => o.id === editingReport.orderId);
                  const newMilestone = order?.milestones.find(m => m.templateId === newTemplateId);
                  const newCd = mergeCustomDataForTemplate(
                    editingReport.form.customData,
                    newTemplateId,
                    newMilestone?.reportTemplate,
                    product?.routeReportValues?.[newTemplateId],
                    globalNodes,
                  );
                  setEditingReport(prev => {
                    if (!prev) return prev;
                    const nextRows = prev.form.rowEdits.map(row => {
                      if (!row.orderId) return row;
                      const o = orders.find(ox => ox.id === row.orderId);
                      const nm = o?.milestones.find(m => m.templateId === newTemplateId);
                      return nm ? { ...row, milestoneId: nm.id } : row;
                    });
                    return {
                      ...prev,
                      templateId: newTemplateId,
                      milestoneId: newMilestone?.id || prev.milestoneId,
                      form: { ...prev.form, rate: newRate, customData: newCd, rowEdits: nextRows },
                    };
                  });
                } else {
                  const newCd = mergeCustomDataForTemplate(
                    editingReport.form.customData,
                    newTemplateId,
                    undefined,
                    product?.routeReportValues?.[newTemplateId],
                    globalNodes,
                  );
                  setEditingReport(prev => prev ? { ...prev, templateId: newTemplateId, form: { ...prev.form, rate: newRate, customData: newCd } } : prev);
                }
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
            >
              {globalNodes.map(n => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className={formStandardLabelClass}>报工时间</label>
            <input
              type="datetime-local"
              value={editingReport.form.timestamp}
              onChange={e => setEditingReport(prev => prev ? { ...prev, form: { ...prev.form, timestamp: e.target.value } } : prev)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div className="space-y-1">
            <label className={formStandardLabelClass}>操作人</label>
            <WorkerSelector
              options={workers.filter(w => w.status === 'ACTIVE').map(w => ({ id: w.id, name: w.name, sub: w.groupName, assignedMilestoneIds: w.assignedMilestoneIds }))}
              processNodes={globalNodes}
              currentNodeId={editingReport.templateId}
              value={editingReport.form.workerId}
              onChange={(id) => {
                const w = workers.find(wx => wx.id === id);
                setEditingReport(prev => prev ? { ...prev, form: { ...prev.form, workerId: id, operator: w?.name || prev.form.operator } } : prev);
              }}
              placeholder="选择操作人..."
              variant="form"
              icon={UserPlus}
            />
          </div>
          {!batchDetailMatrix ? (
            <div className="space-y-1">
              <label className={formStandardLabelClass}>工价</label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={editingReport.form.rate}
                  onChange={e =>
                    setEditingReport(prev =>
                      prev ? { ...prev, form: { ...prev.form, rate: parseFloat(e.target.value) || 0 } } : prev,
                    )
                  }
                  className="h-9 w-[6rem] rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold text-slate-800 text-right outline-none focus:ring-2 focus:ring-indigo-200"
                />
                <span className="text-xs text-slate-500">
                  元/{(productMap.get(editingReport.productId)?.unitId && dictionaries.units.find(u => u.id === productMap.get(editingReport.productId)?.unitId)?.name) || '件'}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {(() => {
        const editTmpl = getEffectiveReportTemplate(
          milestone ?? { templateId: editingReport.templateId, reportTemplate: [] },
          globalNodes,
        );
        if (editTmpl.length === 0) return null;
        const cd = editingReport.form.customData;
        return (
          <div className="space-y-2">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">填报项 / 备注</p>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3 space-y-3">
              <ReportCustomFieldsEditor
                fields={editTmpl}
                values={cd}
                onChange={(fieldId, value) => setEditingReport(prev => prev ? { ...prev, form: { ...prev.form, customData: { ...prev.form.customData, [fieldId]: value } } } : prev)}
                namePrefix="stp-batch-edit"
                inputClassName="h-9 w-full max-w-md rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                fileHint="已选择文件，保存后生效"
              />
            </div>
          </div>
        );
      })()}
      {batchDetailMatrix ? (
        <MatrixEditTable
          editingReport={editingReport}
          setEditingReport={setEditingReport}
          reportDetailBatch={reportDetailBatch}
          batchDetailMatrix={batchDetailMatrix}
          categoryMap={categoryMap}
          dictionaries={dictionaries}
          globalNodes={globalNodes}
          maxBatchGood={maxBatchGood}
          effectiveRemainingSaved={effectiveRemainingSaved}
        />
      ) : (
        <FlatEditTable
          editingReport={editingReport}
          setEditingReport={setEditingReport}
          reportDetailBatch={reportDetailBatch}
          products={products}
          dictionaries={dictionaries}
          editFlatUsesWeight={editFlatUsesWeight}
          maxBatchGood={maxBatchGood}
          effectiveRemainingSaved={effectiveRemainingSaved}
        />
      )}
    </>
  );
};

interface MatrixEditTableProps {
  editingReport: NonNullable<EditingReportState>;
  setEditingReport: React.Dispatch<React.SetStateAction<EditingReportState>>;
  reportDetailBatch: ReportDetailBatch;
  batchDetailMatrix: BatchDetailMatrix;
  categoryMap: Map<string, ProductCategory>;
  dictionaries: AppDictionaries;
  globalNodes: GlobalNodeTemplate[];
  maxBatchGood: number;
  effectiveRemainingSaved: number;
}

const MatrixEditTable: React.FC<MatrixEditTableProps> = ({
  editingReport,
  setEditingReport,
  reportDetailBatch,
  batchDetailMatrix,
  categoryMap,
  dictionaries,
  globalNodes,
  maxBatchGood,
  effectiveRemainingSaved,
}) => {
  const { layout, product: matrixProduct } = batchDetailMatrix;
  const editNodeUsesWeight = reportNodeUsesWeight(globalNodes, editingReport.templateId);
  const matrixUnit = (matrixProduct.unitId && dictionaries.units.find(u => u.id === matrixProduct.unitId)?.name) || '件';
  const goodTotal = editingReport.form.rowEdits.reduce((s, r) => s + r.quantity, 0);
  const amountTotal = editingReport.form.rowEdits.reduce((s, r) => s + r.quantity * editingReport.form.rate, 0);
  const categoryForMatrix = matrixProduct.categoryId ? categoryMap.get(matrixProduct.categoryId) : undefined;
  const matrixCustomTags = getProductCategoryCustomFieldEntries(matrixProduct, categoryForMatrix ?? null, { includeFile: false, includeEmpty: false });
  const matrixColSpan = 4 + (editNodeUsesWeight ? 1 : 0);
  const isOrderBatch = reportDetailBatch.source === 'order';

  const rows: QtyMatrixTableRow[] = layout.colorRows.map((row, rowIndex) => {
    let rowSum = 0;
    const cells = row.variantAtSize.map((variant: ProductVariant | null, si: number) => {
      if (!variant) return <span key={`${row.key}-e-${si}`} className="text-sm text-slate-300">—</span>;
      const rowEdit = editingReport.form.rowEdits.find(r => r.variantId === variant.id);
      if (!rowEdit) return <span key={variant.id} className="text-sm text-slate-300">—</span>;
      rowSum += rowEdit.quantity;
      const otherGoodSum = editingReport.form.rowEdits.filter(r => r.variantId !== variant.id).reduce((s, r) => s + r.quantity, 0);
      const maxThisRow = isOrderBatch ? Math.max(0, maxBatchGood - otherGoodSum) : Number.POSITIVE_INFINITY;
      return (
        <div key={variant.id} className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <input
              type="number"
              min={0}
              max={isOrderBatch && maxBatchGood >= 0 ? maxThisRow : undefined}
              title={isOrderBatch && maxBatchGood >= 0 ? `本批良品合计最多 ${maxBatchGood} 件` : undefined}
              value={rowEdit.quantity}
              data-matrix-row={rowIndex}
              data-matrix-col={si}
              onKeyDown={handleVariantQtyMatrixKeyDown}
              onChange={e => {
                const raw = parseInt(e.target.value, 10) || 0;
                const v = isOrderBatch && maxBatchGood >= 0 ? Math.min(raw, maxThisRow) : raw;
                setEditingReport(prev =>
                  prev
                    ? {
                        ...prev,
                        form: {
                          ...prev.form,
                          rowEdits: prev.form.rowEdits.map(r => r.variantId === variant.id ? { ...r, quantity: v } : r),
                        },
                      }
                    : prev,
                );
              }}
              className="h-8 w-[3rem] shrink-0 rounded-md border border-slate-200 bg-white px-1.5 text-left text-sm font-bold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200"
            />
            {isOrderBatch && maxBatchGood >= 0 ? (
              <span className="min-w-0 text-[10px] font-medium tabular-nums leading-none text-slate-400">最多 {maxThisRow}</span>
            ) : null}
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <input
              type="number"
              min={0}
              tabIndex={-1}
              value={rowEdit.defectiveQuantity}
              onChange={e => {
                const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                setEditingReport(prev => {
                  if (!prev) return prev;
                  const nextEdits = prev.form.rowEdits.map(r => r.variantId === variant.id ? { ...r, defectiveQuantity: v } : r);
                  if (!isOrderBatch) {
                    return { ...prev, form: { ...prev.form, rowEdits: nextEdits } };
                  }
                  const newDefSum = nextEdits.reduce((s, r) => s + r.defectiveQuantity, 0);
                  const newGoodSum = nextEdits.reduce((s, r) => s + r.quantity, 0);
                  const newMaxBase = effectiveRemainingSaved + reportDetailBatch.totalGood + reportDetailBatch.totalDefective - newDefSum;
                  const newMaxBatchGood = reportDetailBatch.source === 'order'
                    ? Math.max(0, newMaxBase, reportDetailBatch.totalGood, newGoodSum)
                    : Math.max(0, newMaxBase);
                  const totalQty = nextEdits.reduce((s, r) => s + r.quantity, 0);
                  if (totalQty > newMaxBatchGood && newMaxBatchGood >= 0) {
                    const scale = totalQty > 0 ? newMaxBatchGood / totalQty : 0;
                    const clamped = nextEdits.map(r => ({ ...r, quantity: Math.floor(r.quantity * scale) }));
                    const remainder = newMaxBatchGood - clamped.reduce((s, r) => s + r.quantity, 0);
                    const final = clamped.length > 0 && remainder > 0
                      ? clamped.map((r, i) => i === 0 ? { ...r, quantity: r.quantity + remainder } : r)
                      : clamped;
                    return { ...prev, form: { ...prev.form, rowEdits: final } };
                  }
                  return { ...prev, form: { ...prev.form, rowEdits: nextEdits } };
                });
              }}
              className="h-8 w-[3rem] shrink-0 rounded-md border border-amber-200/90 bg-amber-50/90 px-1.5 text-left text-sm font-bold text-amber-900 shadow-sm outline-none focus:ring-2 focus:ring-amber-200 placeholder:text-[9px] placeholder:text-amber-400/80"
              placeholder="0"
              title="不良品"
            />
            <span className="min-w-0 text-[10px] font-medium tabular-nums leading-none text-amber-800">不良品</span>
          </div>
        </div>
      );
    });
    return {
      key: row.key,
      colorCell: (
        <div className="flex items-center gap-2">
          {row.colorSwatch ? <span className="h-4 w-4 shrink-0 rounded-full border border-slate-200" style={{ backgroundColor: row.colorSwatch }} /> : null}
          <span>{row.colorLabel}</span>
        </div>
      ),
      cells,
      subtotalCell: rowSum,
    };
  });

  const productThumbEdit = matrixProduct.imageUrl ? (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-white">
      <img src={matrixProduct.imageUrl} alt={matrixProduct.name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
    </div>
  ) : (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
      <Package className="h-4 w-4" />
    </div>
  );

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">报工明细（按规格）</p>
      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/80">
              <th className="py-2.5 px-3 text-left">产品 / SKU</th>
              <th className="py-2.5 px-3 text-right">数量</th>
              <th className="py-2.5 px-3 text-right">工价</th>
              <th className="py-2.5 px-3 text-right">金额(元)</th>
              {editNodeUsesWeight ? (
                <th className="py-2.5 px-3 text-right whitespace-nowrap" title="工序开启称重时，本批报工总重量（kg），保存时按各规格良品数量比例写入各条记录">
                  重量 (kg)
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            <tr>
              <td className="py-2.5 px-3 align-top">
                <div className="flex min-w-0 items-start gap-2">
                  {productThumbEdit}
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-bold text-slate-700">{matrixProduct.name}</span>
                      {matrixProduct.sku ? (
                        <span className="text-[9px] font-bold uppercase tracking-tight text-slate-300">{matrixProduct.sku}</span>
                      ) : null}
                    </div>
                    {matrixCustomTags.length > 0 ? (
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {matrixCustomTags.map(({ field, display }) => (
                          <span key={field.id} className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                            {field.label}: {display}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </td>
              <td className="py-2.5 px-3 text-right align-middle">
                <span className="font-black text-indigo-600 tabular-nums">
                  {goodTotal.toLocaleString()} {matrixUnit}
                </span>
                {editingReport.form.rowEdits.reduce((s, r) => s + r.defectiveQuantity, 0) > 0 ? (
                  <span className="mt-0.5 block text-[10px] font-medium text-amber-700 tabular-nums">
                    不良 {editingReport.form.rowEdits.reduce((s, r) => s + r.defectiveQuantity, 0)} {matrixUnit}
                  </span>
                ) : null}
              </td>
              <td className="py-2.5 px-3 align-middle text-right">
                <div className="inline-flex items-center justify-end gap-1.5">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={editingReport.form.rate}
                    onChange={e => setEditingReport(prev => prev ? { ...prev, form: { ...prev.form, rate: parseFloat(e.target.value) || 0 } } : prev)}
                    className="h-9 w-[5.25rem] shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold text-slate-800 text-right outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                  <span className="shrink-0 text-xs font-medium whitespace-nowrap text-slate-500">元/{matrixUnit}</span>
                </div>
              </td>
              <td className="py-2.5 px-3 text-right align-middle text-sm font-black text-indigo-600 tabular-nums">
                {amountTotal > 0 ? amountTotal.toFixed(2) : '—'}
              </td>
              {editNodeUsesWeight ? (
                <td className="py-2.5 px-3 align-middle text-right">
                  <div className="inline-flex items-center justify-end">
                    <input
                      type="number"
                      min={0}
                      step={0.0001}
                      value={editingReport.form.weightKg === '' ? '' : typeof editingReport.form.weightKg === 'number' ? editingReport.form.weightKg : ''}
                      onChange={e => {
                        const raw = e.target.value.trim();
                        if (raw === '') {
                          setEditingReport(prev => prev ? { ...prev, form: { ...prev.form, weightKg: '' } } : prev);
                          return;
                        }
                        const n = parseFloat(raw);
                        if (!Number.isFinite(n) || n < 0) return;
                        setEditingReport(prev => prev ? { ...prev, form: { ...prev.form, weightKg: n } } : prev);
                      }}
                      placeholder="kg"
                      title="本批报工总重量 (kg)"
                      className="h-9 w-full max-w-[6.5rem] shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-right text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </td>
              ) : null}
            </tr>
            <tr className="bg-slate-50/70">
              <td colSpan={matrixColSpan} className="border-t border-slate-100 px-3 pb-3 pt-2 align-top" {...{ [VARIANT_QTY_MATRIX_CONTAINER_ATTR]: '' }}>
                <QtyMatrixTable sizeHeaders={layout.sizeColumns.map(c => c.header)} rows={rows} dense />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

interface FlatEditTableProps {
  editingReport: NonNullable<EditingReportState>;
  setEditingReport: React.Dispatch<React.SetStateAction<EditingReportState>>;
  reportDetailBatch: ReportDetailBatch;
  products: Product[];
  dictionaries: AppDictionaries;
  editFlatUsesWeight: boolean;
  maxBatchGood: number;
  effectiveRemainingSaved: number;
}

const FlatEditTable: React.FC<FlatEditTableProps> = ({
  editingReport,
  setEditingReport,
  reportDetailBatch,
  products,
  dictionaries,
  editFlatUsesWeight,
  maxBatchGood,
  effectiveRemainingSaved,
}) => (
  <div className="space-y-2">
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">报工明细</p>
    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-2 sm:p-3 space-y-2">
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase">产品</th>
              <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase text-left">数量</th>
              <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase text-right">工价</th>
              <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase text-right">金额(元)</th>
              {editFlatUsesWeight ? (
                <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">重量 (kg)</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {reportDetailBatch.source === 'order'
              ? reportDetailBatch.rows.map(({ order, milestone, report }) => {
                  const rowEdit = editingReport.form.rowEdits.find(r => r.reportId === report.id);
                  if (!rowEdit) return null;
                  const otherGoodSum = editingReport.form.rowEdits.filter(r => r.reportId !== report.id).reduce((s, r) => s + r.quantity, 0);
                  const maxThisRow = Math.max(0, maxBatchGood - otherGoodSum);
                  const p = products.find(px => px.id === order.productId);
                  const detailUnit = (p?.unitId && dictionaries?.units?.find(u => u.id === p.unitId)?.name) || '件';
                  const rate = editingReport.form.rate;
                  const amount = rowEdit.quantity * rate;
                  void milestone;
                  return (
                    <tr key={report.id} className="border-b border-slate-100">
                      <td className="px-3 py-2.5 sm:px-4 align-middle min-w-0 max-w-[11rem] sm:max-w-[14rem]">
                        <span className="text-sm sm:text-base font-bold text-slate-900 leading-tight block truncate" title={order.productName}>
                          {order.productName}
                        </span>
                        <span className="mt-0.5 block text-[10px] sm:text-[11px] font-medium text-slate-500 truncate" title={order.orderNumber}>
                          {order.orderNumber}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 sm:px-4 align-middle">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              max={maxThisRow || undefined}
                              title={maxBatchGood >= 0 ? `本批良品合计最多 ${maxBatchGood} 件` : ''}
                              value={rowEdit.quantity}
                              onChange={e => {
                                const raw = parseInt(e.target.value) || 0;
                                const v = maxBatchGood >= 0 ? Math.min(raw, maxThisRow) : raw;
                                setEditingReport(prev => prev ? {
                                  ...prev,
                                  form: { ...prev.form, rowEdits: prev.form.rowEdits.map(r => r.reportId === report.id ? { ...r, quantity: v } : r) }
                                } : prev);
                              }}
                              className="h-8 w-[4.75rem] shrink-0 box-border rounded-md border border-slate-200 bg-white px-2 text-left text-sm font-bold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200 tabular-nums"
                            />
                            {maxBatchGood >= 0 ? (
                              <span className="text-[10px] font-medium tabular-nums text-slate-400">最多 {maxThisRow}</span>
                            ) : null}
                          </div>
                          <div className="flex min-w-0 items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              tabIndex={-1}
                              value={rowEdit.defectiveQuantity}
                              onChange={e => {
                                const v = Math.max(0, parseInt(e.target.value) || 0);
                                setEditingReport(prev => {
                                  if (!prev) return prev;
                                  const nextEdits = prev.form.rowEdits.map(r => r.reportId === report.id ? { ...r, defectiveQuantity: v } : r);
                                  const newDefSum = nextEdits.reduce((s, r) => s + r.defectiveQuantity, 0);
                                  const newMaxBatchGood = effectiveRemainingSaved + reportDetailBatch.totalGood + reportDetailBatch.totalDefective - newDefSum;
                                  const totalQty = nextEdits.reduce((s, r) => s + r.quantity, 0);
                                  if (totalQty > newMaxBatchGood && newMaxBatchGood >= 0) {
                                    const scale = totalQty > 0 ? newMaxBatchGood / totalQty : 0;
                                    const clamped = nextEdits.map(r => ({ ...r, quantity: Math.floor(r.quantity * scale) }));
                                    const remainder = newMaxBatchGood - clamped.reduce((s, r) => s + r.quantity, 0);
                                    const final = clamped.length > 0 && remainder > 0 ? clamped.map((r, i) => i === 0 ? { ...r, quantity: r.quantity + remainder } : r) : clamped;
                                    return { ...prev, form: { ...prev.form, rowEdits: final } };
                                  }
                                  return { ...prev, form: { ...prev.form, rowEdits: nextEdits } };
                                });
                              }}
                              className="h-8 w-[4.75rem] shrink-0 box-border rounded-md border border-amber-200/90 bg-amber-50/90 px-2 text-left text-sm font-bold text-amber-900 shadow-sm outline-none focus:ring-2 focus:ring-amber-200 tabular-nums"
                              placeholder="0"
                              title="不良品"
                            />
                            <span className="text-[10px] font-medium tabular-nums text-amber-800">不良品</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 sm:px-4 align-middle text-right">
                        <span className="text-slate-600 text-xs">{editingReport.form.rate > 0 ? `${editingReport.form.rate.toFixed(2)} 元/${detailUnit}` : '—'}</span>
                      </td>
                      <td className="px-3 py-2.5 sm:px-4 align-middle text-sm font-bold text-indigo-600 text-right tabular-nums">{amount >= 0 ? amount.toFixed(2) : '—'}</td>
                      {editFlatUsesWeight ? (
                        <td className="px-3 py-2.5 sm:px-4 align-middle text-right">
                          <input
                            type="number"
                            min={0}
                            step={0.0001}
                            value={rowEdit.weightKg === '' || rowEdit.weightKg === undefined ? '' : rowEdit.weightKg}
                            onChange={e => {
                              const raw = e.target.value.trim();
                              if (raw === '') {
                                setEditingReport(prev => prev ? { ...prev, form: { ...prev.form, rowEdits: prev.form.rowEdits.map(r => r.reportId === report.id ? { ...r, weightKg: '' } : r) } } : prev);
                                return;
                              }
                              const n = parseFloat(raw);
                              if (!Number.isFinite(n) || n < 0) return;
                              setEditingReport(prev => prev ? { ...prev, form: { ...prev.form, rowEdits: prev.form.rowEdits.map(r => r.reportId === report.id ? { ...r, weightKg: n } : r) } } : prev);
                            }}
                            placeholder="kg"
                            className="ml-auto block h-8 w-full max-w-[6.5rem] rounded-lg border border-slate-200 bg-white px-2 text-right text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200 tabular-nums"
                          />
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              : reportDetailBatch.rows.map(({ progress, report }) => {
                  const rowEdit = editingReport.form.rowEdits.find(r => r.reportId === report.id);
                  if (!rowEdit) return null;
                  const p = products.find(px => px.id === progress.productId);
                  const detailUnit = (p?.unitId && dictionaries?.units?.find(u => u.id === p.unitId)?.name) || '件';
                  const rate = editingReport.form.rate;
                  const amount = rowEdit.quantity * rate;
                  return (
                    <tr key={report.id} className="border-b border-slate-100">
                      <td className="px-3 py-2.5 sm:px-4 align-middle min-w-0 max-w-[11rem] sm:max-w-[14rem]">
                        <span className="text-sm sm:text-base font-bold text-slate-900 leading-tight block truncate" title={reportDetailBatch.productName}>
                          {reportDetailBatch.productName}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 sm:px-4 align-middle">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              value={rowEdit.quantity}
                              onChange={e => {
                                const v = parseInt(e.target.value) || 0;
                                setEditingReport(prev => prev ? {
                                  ...prev,
                                  form: { ...prev.form, rowEdits: prev.form.rowEdits.map(r => r.reportId === report.id ? { ...r, quantity: v } : r) }
                                } : prev);
                              }}
                              className="h-8 w-[4.75rem] shrink-0 box-border rounded-md border border-slate-200 bg-white px-2 text-left text-sm font-bold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200 tabular-nums"
                            />
                          </div>
                          <div className="flex min-w-0 items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              tabIndex={-1}
                              value={rowEdit.defectiveQuantity}
                              onChange={e => {
                                const v = parseInt(e.target.value) || 0;
                                setEditingReport(prev => prev ? {
                                  ...prev,
                                  form: { ...prev.form, rowEdits: prev.form.rowEdits.map(r => r.reportId === report.id ? { ...r, defectiveQuantity: v } : r) }
                                } : prev);
                              }}
                              className="h-8 w-[4.75rem] shrink-0 box-border rounded-md border border-amber-200/90 bg-amber-50/90 px-2 text-left text-sm font-bold text-amber-900 shadow-sm outline-none focus:ring-2 focus:ring-amber-200 tabular-nums"
                              placeholder="0"
                              title="不良品"
                            />
                            <span className="text-[10px] font-medium tabular-nums text-amber-800">不良品</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 sm:px-4 align-middle text-right">
                        <span className="text-slate-600 text-xs">{editingReport.form.rate > 0 ? `${editingReport.form.rate.toFixed(2)} 元/${detailUnit}` : '—'}</span>
                      </td>
                      <td className="px-3 py-2.5 sm:px-4 align-middle text-sm font-bold text-indigo-600 text-right tabular-nums">{amount >= 0 ? amount.toFixed(2) : '—'}</td>
                      {editFlatUsesWeight ? (
                        <td className="px-3 py-2.5 sm:px-4 align-middle text-right">
                          <input
                            type="number"
                            min={0}
                            step={0.0001}
                            value={rowEdit.weightKg === '' || rowEdit.weightKg === undefined ? '' : rowEdit.weightKg}
                            onChange={e => {
                              const raw = e.target.value.trim();
                              if (raw === '') {
                                setEditingReport(prev => prev ? { ...prev, form: { ...prev.form, rowEdits: prev.form.rowEdits.map(r => r.reportId === report.id ? { ...r, weightKg: '' } : r) } } : prev);
                                return;
                              }
                              const n = parseFloat(raw);
                              if (!Number.isFinite(n) || n < 0) return;
                              setEditingReport(prev => prev ? { ...prev, form: { ...prev.form, rowEdits: prev.form.rowEdits.map(r => r.reportId === report.id ? { ...r, weightKg: n } : r) } } : prev);
                            }}
                            placeholder="kg"
                            className="ml-auto block h-8 w-full max-w-[6.5rem] rounded-lg border border-slate-200 bg-white px-2 text-right text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200 tabular-nums"
                          />
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

export default ReportBatchEditFlow;
