import React, { useState, useMemo, useCallback, useContext } from 'react';
import { createPortal } from 'react-dom';
import { Check, FileText, Clock, User, Package } from 'lucide-react';
import {
  ProductionOpRecord,
  ProductionOrder,
  Product,
  ProductCategory,
  GlobalNodeTemplate,
  AppDictionaries,
  ReworkFormSettings,
  PrintTemplate,
  PrintRenderContext,
} from '../../types';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import { buildVariantQtyMatrixLayout } from '../../utils/variantQtyMatrix';
import { groupProductionOpBatchByVariant, mapGroupedOpQuantitiesToRecordIds } from '../../utils/groupProductionOpBatchByVariant';
import { hasOpsPerm } from './types';
import { fmtDT, timestampFromDatetimeLocal, nowTimestamp } from '../../utils/formatTime';
import { OrderCenterDetailPrintBlock } from '../../components/order-print/OrderCenterDetailPrintBlock';
import { buildDefectTreatmentPrintContext } from '../../utils/buildReworkDefectTreatmentPrintContext';
import { readDefectTreatmentCustomSnapshot, DEFECT_TREATMENT_CUSTOM_DATA_KEY } from '../../utils/productionOpCollab/rework';
import VariantQtyMatrixInputs from '../../components/variant-matrix/VariantQtyMatrixInputs';
import DocPhaseModal, { DocPhaseEditToolbarPortalContext } from '../../components/DocPhaseModal';
import {
  DocCustomFieldEditGrid,
  DocCustomFieldInlineReadList,
  DocInlineMetaRow,
  DocSummaryCard,
} from '../../components/doc-modal';
import {
  sectionTitleClass,
  psiOrderBillFormSectionStackClass,
  psiOrderBillFormGridGapClass,
  psiOrderBillFormSectionIconIndigoClass,
  psiOrderBillFormFieldControlClass,
} from '../../styles/uiDensity';
import { psiCustomFieldHasFilledDisplayValue } from '../psi-ops/psiOpsListFormatting';
import { getProductCategoryCustomFieldEntries } from '../../utils/reportCustomDocField';
import { useAuth } from '../../contexts/AuthContext';

const defectTreatmentCustomFieldEditControlClass =
  'h-9 w-full max-w-md rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500';

function DefectEditSavePortal({ active, onSave }: { active: boolean; onSave: () => void }) {
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

export interface DefectTreatmentFlowDetailModalProps {
  productionLinkMode: 'order' | 'product';
  defectFlowDetailRecord: ProductionOpRecord;
  records: ProductionOpRecord[];
  orders: ProductionOrder[];
  products: Product[];
  categories?: ProductCategory[];
  globalNodes: GlobalNodeTemplate[];
  dictionaries?: AppDictionaries;
  userPermissions?: string[];
  tenantRole?: string;
  reworkFormSettings?: ReworkFormSettings;
  printTemplates?: PrintTemplate[];
  onOpenReworkFormPrintTab?: () => void;
  onUpdateRecord?: (record: ProductionOpRecord) => void;
  onDeleteRecord?: (recordId: string) => void;
  /** 编辑补录新规格 */
  onAddRecord?: (record: ProductionOpRecord) => void | Promise<void>;
  onClose: () => void;
}

const DefectTreatmentFlowDetailModal: React.FC<DefectTreatmentFlowDetailModalProps> = ({
  productionLinkMode,
  defectFlowDetailRecord,
  records,
  orders,
  products,
  categories = [],
  globalNodes,
  dictionaries,
  userPermissions,
  tenantRole,
  reworkFormSettings,
  printTemplates = [],
  onOpenReworkFormPrintTab,
  onUpdateRecord,
  onDeleteRecord,
  onAddRecord,
  onClose,
}) => {
  const { tenantCtx } = useAuth();
  const r = defectFlowDetailRecord;
  const matchScope = (x: ProductionOpRecord) =>
    productionLinkMode === 'product' ? x.productId === r.productId : x.orderId === r.orderId;
  const detailBatch = r.type === 'REWORK' && r.docNo
    ? (records || []).filter((x): x is ProductionOpRecord => x.type === 'REWORK' && matchScope(x) && x.docNo === r.docNo)
    : r.type === 'SCRAP' && r.docNo
      ? (records || []).filter((x): x is ProductionOpRecord => x.type === 'SCRAP' && matchScope(x) && x.docNo === r.docNo)
      : [r];
  const first = detailBatch[0];

  const [editing, setEditing] = useState<{
    form: {
      timestamp: string;
      operator: string;
      reason: string;
      customData: Record<string, unknown>;
      rowEdits: { variantId: string; label: string; quantity: number; recordIds: string[] }[];
    };
    firstRecord: ProductionOpRecord;
  } | null>(null);

  const order = first ? orders.find(o => o.id === first.orderId) : undefined;
  const product = first ? products.find(p => p.id === first.productId) : undefined;
  const productCategory = product ? categories.find(c => c.id === product.categoryId) : undefined;
  const unitName = (product?.unitId && dictionaries?.units?.find(u => u.id === product.unitId)?.name) || '件';
  const sourceNodeId = first ? (first.type === 'REWORK' ? (first.sourceNodeId ?? first.nodeId) : first.nodeId) : undefined;
  const sourceNodeName = sourceNodeId ? globalNodes.find(n => n.id === sourceNodeId)?.name ?? sourceNodeId : '—';
  const totalQty = detailBatch.reduce((s, x) => s + (x.quantity ?? 0), 0);
  const hasColorSize = productHasColorSizeMatrix(product, productCategory);
  const typeLabel = first?.type === 'REWORK' ? '返工' : '报损';

  const displayVariantRows = useMemo(
    () => (first ? groupProductionOpBatchByVariant(detailBatch, product) : []),
    [detailBatch, product, first],
  );
  /** 保留 colorIds/sizeIds，与商品资料中颜色/尺码列顺序一致（见 buildVariantQtyMatrixLayout） */
  const defectDetailMatrixProduct = useMemo(
    () => (product && product.variants?.length ? product : null),
    [product],
  );
  const variantQtyFromDisplayRows = useMemo(() => {
    const m: Record<string, number> = {};
    displayVariantRows.forEach(r => {
      if (r.variantId) m[r.variantId] = r.quantity;
    });
    return m;
  }, [displayVariantRows]);
  const undiffDisplayRow = useMemo(
    () => displayVariantRows.find(r => !r.variantId) ?? null,
    [displayVariantRows],
  );
  const latestBatchTimestamp = detailBatch.reduce(
    (best: { t: number; ts?: string }, x) => {
      const t = new Date(x.timestamp || 0).getTime();
      if (isNaN(t)) return best;
      return t >= best.t ? { t, ts: x.timestamp } : best;
    },
    { t: -1 },
  ).ts;
  const opsInBatch = [...new Set(detailBatch.map(x => (x.operator ?? '').trim()).filter(Boolean))];
  const operatorsLabel = opsInBatch.length === 0 ? '—' : opsInBatch.length === 1 ? opsInBatch[0]! : `${opsInBatch[0]} 等${opsInBatch.length}人`;

  const defectFieldsForDetail = useMemo(
    () => (reworkFormSettings?.defectTreatmentCustomFields ?? []).filter(f => f.showInDetail),
    [reworkFormSettings?.defectTreatmentCustomFields],
  );
  const defectCustomSnapshot = useMemo(
    () => readDefectTreatmentCustomSnapshot(records, first?.docNo),
    [records, first?.docNo],
  );

  const buildPrintContext = useCallback(
    (template: PrintTemplate): PrintRenderContext =>
      buildDefectTreatmentPrintContext(template, {
        productionLinkMode,
        detailBatch,
        records,
        orders,
        products,
        globalNodes,
        dictionaries,
        tenantName: tenantCtx?.tenantName,
      }),
    [productionLinkMode, detailBatch, records, orders, products, globalNodes, dictionaries, tenantCtx?.tenantName],
  );

  const categoryMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  /** 处理不良流水不按来源工序展示/录入称重（与工序报工称重解耦） */
  const detailNodeUsesWeight = false;
  const reworkTargetLabel = useMemo(() => {
    if (!first || first.type !== 'REWORK' || !(first.reworkNodeIds?.length ?? 0)) return '';
    return first.reworkNodeIds!.map(nid => globalNodes.find(n => n.id === nid)?.name ?? nid).join('、');
  }, [first, globalNodes]);
  const matrixSummaryCustomTags = useMemo(() => {
    if (!product) return [];
    const cat = product.categoryId ? categoryMap.get(product.categoryId) : undefined;
    return getProductCategoryCustomFieldEntries(product, cat ?? null, { includeFile: false, includeEmpty: false });
  }, [product, categoryMap]);

  const startEdit = () => {
    if (!onUpdateRecord || detailBatch.length === 0) return;
    const rec = detailBatch[0];
    let dt = new Date(rec.timestamp || undefined);
    if (isNaN(dt.getTime())) dt = new Date();
    const tsStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    const snap = { ...defectCustomSnapshot };
    const grouped = groupProductionOpBatchByVariant(detailBatch, product);
    let rowEdits = grouped.map(g => ({
      variantId: g.variantId,
      label: g.label,
      quantity: g.quantity,
      recordIds: [...g.recordIds],
    }));
    if (hasColorSize && product && dictionaries) {
      const layout = buildVariantQtyMatrixLayout(product, dictionaries);
      if (layout) {
        const undiff = grouped.find(g => !g.variantId);
        const byVid = new Map(grouped.filter(g => g.variantId).map(g => [g.variantId, g]));
        const next: typeof rowEdits = [];
        if (undiff) {
          next.push({
            variantId: undiff.variantId,
            label: undiff.label,
            quantity: undiff.quantity,
            recordIds: [...undiff.recordIds],
          });
        }
        for (const cr of layout.colorRows) {
          for (const v of cr.variantAtSize) {
            if (!v) continue;
            const g = byVid.get(v.id);
            const label = (v as { skuSuffix?: string }).skuSuffix ?? v.id;
            if (g) {
              next.push({
                variantId: g.variantId,
                label: g.label,
                quantity: g.quantity,
                recordIds: [...g.recordIds],
              });
            } else {
              next.push({ variantId: v.id, label, quantity: 0, recordIds: [] });
            }
          }
        }
        rowEdits = next;
      }
    }
    setEditing({
      firstRecord: rec,
      form: {
        timestamp: tsStr,
        operator: rec.operator ?? '',
        reason: rec.reason ?? '',
        customData: snap,
        rowEdits,
      },
    });
  };

  const saveEdit = () => {
    if (!onUpdateRecord || !editing) return;
    const tsStr = editing.form.timestamp ? timestampFromDatetimeLocal(editing.form.timestamp) : nowTimestamp();
    const newQtyByRecordId = mapGroupedOpQuantitiesToRecordIds(detailBatch, editing.form.rowEdits);
    const cleanCustom = Object.fromEntries(
      Object.entries(editing.form.customData).filter(([, v]) => v !== '' && v != null && v !== undefined),
    );
    detailBatch.forEach(rec => {
      const newQty = newQtyByRecordId.get(rec.id);
      if (newQty === undefined) return;
      const prevCd = (rec as ProductionOpRecord & { collabData?: Record<string, unknown> }).collabData ?? {};
      onUpdateRecord({
        ...rec,
        quantity: newQty,
        timestamp: tsStr,
        operator: editing.form.operator,
        reason: editing.form.reason || undefined,
        collabData: { ...prevCd, [DEFECT_TREATMENT_CUSTOM_DATA_KEY]: cleanCustom },
      });
    });
    if (onAddRecord && first) {
      let seq = 0;
      for (const row of editing.form.rowEdits) {
        if (row.recordIds.length > 0 || !row.variantId || row.quantity <= 0) continue;
        const base = first;
        const prevCd = (base as ProductionOpRecord & { collabData?: Record<string, unknown> }).collabData ?? {};
        const collabMerged = { ...prevCd, [DEFECT_TREATMENT_CUSTOM_DATA_KEY]: cleanCustom };
        if (base.type === 'SCRAP') {
          void onAddRecord({
            id: `rec-def-scrap-edit-${Date.now()}-${seq++}-${row.variantId.slice(-6)}`,
            type: 'SCRAP',
            orderId: base.orderId,
            productId: base.productId,
            variantId: row.variantId,
            quantity: row.quantity,
            operator: editing.form.operator,
            timestamp: tsStr,
            nodeId: base.nodeId,
            docNo: base.docNo,
            collabData: collabMerged,
          });
        } else if (base.type === 'REWORK') {
          void onAddRecord({
            id: `rec-def-rework-edit-${Date.now()}-${seq++}-${row.variantId.slice(-6)}`,
            type: 'REWORK',
            orderId: base.orderId,
            productId: base.productId,
            variantId: row.variantId,
            quantity: row.quantity,
            operator: editing.form.operator,
            timestamp: tsStr,
            status: base.status ?? '待返工',
            sourceNodeId: base.sourceNodeId ?? base.nodeId,
            nodeId: base.nodeId,
            reworkNodeIds: base.reworkNodeIds,
            docNo: base.docNo,
            collabData: collabMerged,
          });
        }
      }
    }
    setEditing(null);
    onClose();
  };

  if (!first) return null;

  return (
    <DocPhaseModal
      zIndexClass="z-[90]"
      open
      phase={editing ? 'edit' : 'detail'}
      editingDocNumber={first.docNo || '—'}
      maxWidthClass="max-w-4xl"
      detailTitle="处理不良品详情"
      editTitle="处理不良品 · 编辑"
      newTitle=""
      leadingDetailActions={
        <OrderCenterDetailPrintBlock
          printSlot={reworkFormSettings?.reworkCenterPrint?.defectTreatmentFlowDetail}
          printTemplates={printTemplates}
          buildContext={buildPrintContext}
          onAddPrintTemplate={onOpenReworkFormPrintTab}
          pickerSubtitle={`处理不良流水 ${first.docNo ?? '—'}`}
        />
      }
      hasPerm={perm => hasOpsPerm(tenantRole, userPermissions, perm)}
      viewPerm="production:rework_records:view"
      editPerm="production:rework_records:edit"
      deletePerm={onDeleteRecord ? 'production:rework_records:delete' : undefined}
      deleteConfirmMessage="确定删除该记录？"
      onDelete={onDeleteRecord ? () => { detailBatch.forEach(x => onDeleteRecord(x.id)); onClose(); } : undefined}
      renderDocBadge={() => (
        productionLinkMode === 'product'
          ? <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{product?.name ?? '—'}</span>
          : <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{order?.orderNumber ?? '—'}</span>
      )}
      onClose={onClose}
      onEnterEdit={startEdit}
      onCancelEdit={() => setEditing(null)}
      renderContent={() => (
        <>
          <DefectEditSavePortal active={!!editing} onSave={saveEdit} />
          <div className="space-y-4 min-h-0">
          {editing ? (
            <div className={psiOrderBillFormSectionStackClass}>
              <DocSummaryCard
                main={
                  <>
                    <div className="flex items-center gap-2.5 border-b border-slate-200 pb-2.5">
                      <div className={psiOrderBillFormSectionIconIndigoClass}><FileText className="w-4 h-4" /></div>
                      <h3 className={sectionTitleClass}>1. 基础信息</h3>
                    </div>
                    <div className={`grid grid-cols-1 md:grid-cols-2 ${psiOrderBillFormGridGapClass}`}>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">时间</label>
                        <input type="datetime-local" value={editing.form.timestamp} onChange={e => setEditing(prev => prev ? { ...prev, form: { ...prev.form, timestamp: e.target.value } } : prev)} className={psiOrderBillFormFieldControlClass} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">操作人</label>
                        <input type="text" value={editing.form.operator} onChange={e => setEditing(prev => prev ? { ...prev, form: { ...prev.form, operator: e.target.value } } : prev)} className={psiOrderBillFormFieldControlClass} placeholder="操作人" />
                      </div>
                      <div className="md:col-span-2 space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">原因/备注</label>
                        <input type="text" value={editing.form.reason} onChange={e => setEditing(prev => prev ? { ...prev, form: { ...prev.form, reason: e.target.value } } : prev)} className={psiOrderBillFormFieldControlClass} placeholder="选填" />
                      </div>
                    </div>
                    {defectFieldsForDetail.length > 0 ? (
                      <DocCustomFieldEditGrid
                        fields={defectFieldsForDetail}
                        values={editing.form.customData}
                        onChange={(fieldId, v) =>
                          setEditing(prev =>
                            prev ? { ...prev, form: { ...prev.form, customData: { ...prev.form.customData, [fieldId]: v } } } : prev,
                          )
                        }
                        controlClassName={defectTreatmentCustomFieldEditControlClass}
                      />
                    ) : null}
                  </>
                }
                side={
                  <>
                    <div className="min-w-[6.5rem] md:text-right">
                      <p className="text-[10px] text-slate-400 font-black uppercase mb-0.5">合计数量</p>
                      <p className="font-black tabular-nums text-slate-800">
                        {editing.form.rowEdits.reduce((s, r) => s + r.quantity, 0).toLocaleString()} {unitName}
                      </p>
                    </div>
                  </>
                }
              />
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  {hasColorSize && defectDetailMatrixProduct && dictionaries ? '产品明细（按规格）' : '产品明细'}
                </p>
                {hasColorSize && defectDetailMatrixProduct && dictionaries ? (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/80">
                          <th className="py-2.5 px-3 text-left">产品 / SKU</th>
                          <th className="py-2.5 px-3 text-right">数量</th>
                          {detailNodeUsesWeight ? (
                            <th className="py-2.5 px-3 text-right whitespace-nowrap">重量 (kg)</th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        <tr>
                          <td className="py-2.5 px-3 align-top">
                            <div className="flex min-w-0 items-start gap-2">
                              {product?.imageUrl ? (
                                <div className="flex h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-white">
                                  <img
                                    src={product.imageUrl}
                                    alt={product.name}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                    decoding="async"
                                  />
                                </div>
                              ) : (
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
                                  <Package className="h-4 w-4" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                                  <span className="font-bold text-slate-700">{product?.name ?? first.productId ?? '—'}</span>
                                  {product?.sku?.trim() ? (
                                    <span className="text-[9px] font-bold uppercase tracking-tight text-slate-300">
                                      {product.sku.trim()}
                                    </span>
                                  ) : null}
                                </div>
                                {matrixSummaryCustomTags.length > 0 ? (
                                  <div className="mt-1 flex flex-wrap items-center gap-1">
                                    {matrixSummaryCustomTags.map(({ field, display }) => (
                                      <span
                                        key={field.id}
                                        className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500"
                                      >
                                        {field.label}: {display}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right align-middle font-black text-indigo-600 tabular-nums">
                            {editing.form.rowEdits.reduce((s, r) => s + r.quantity, 0).toLocaleString()} {unitName}
                          </td>
                          {detailNodeUsesWeight ? (
                            <td className="py-2.5 px-3 text-right align-middle text-xs font-bold tabular-nums text-slate-600">
                              {formatDefectWeightKgDisplay(totalWeightKg)}
                            </td>
                          ) : null}
                        </tr>
                        <tr className="bg-slate-50/70">
                          <td
                            colSpan={2 + (detailNodeUsesWeight ? 1 : 0)}
                            className="space-y-2 border-t border-slate-100 px-3 pb-3 pt-2 align-top"
                          >
                            {editing.form.rowEdits.some(r => !r.variantId) ? (
                              <div className="rounded-lg border border-amber-100 bg-amber-50/80 px-2.5 py-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                                  未分规格
                                </label>
                                <div className="mt-1 inline-flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    min={0}
                                    value={
                                      (editing.form.rowEdits.find(r => !r.variantId)?.quantity ?? 0) === 0
                                        ? ''
                                        : editing.form.rowEdits.find(r => !r.variantId)?.quantity
                                    }
                                    onChange={e => {
                                      const v = Math.max(0, Number(e.target.value) || 0);
                                      setEditing(prev =>
                                        prev
                                          ? {
                                              ...prev,
                                              form: {
                                                ...prev.form,
                                                rowEdits: prev.form.rowEdits.map(re =>
                                                  !re.variantId ? { ...re, quantity: v } : re,
                                                ),
                                              },
                                            }
                                          : prev,
                                      );
                                    }}
                                    className="h-9 w-[6.5rem] shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-left text-sm font-bold text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-200 tabular-nums"
                                    placeholder="0"
                                  />
                                  <span className="shrink-0 text-xs font-medium text-slate-500">{unitName}</span>
                                </div>
                              </div>
                            ) : null}
                            {(() => {
                              const vars = product?.variants ?? [];
                              if (vars.length === 0) return null;
                              const matrixProd = { ...product!, variants: vars } as Product;
                              return (
                                <VariantQtyMatrixInputs
                                  product={matrixProd}
                                  dictionaries={dictionaries}
                                  quantities={Object.fromEntries(
                                    vars.map(v => {
                                      const row = editing.form.rowEdits.find(r => r.variantId === v.id);
                                      return [v.id, row?.quantity ?? 0];
                                    }),
                                  )}
                                  onVariantQtyChange={(variantId, qty) => {
                                    const next = Math.max(0, qty);
                                    setEditing(prev =>
                                      prev
                                        ? {
                                            ...prev,
                                            form: {
                                              ...prev.form,
                                              rowEdits: prev.form.rowEdits.map(re =>
                                                re.variantId === variantId ? { ...re, quantity: next } : re,
                                              ),
                                            },
                                          }
                                        : prev,
                                    );
                                  }}
                                  inputClassName="h-9 w-[3.25rem] shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-left text-sm font-bold text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-200 tabular-nums"
                                />
                              );
                            })()}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : !hasColorSize ? (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/80">
                          <th className="py-2.5 px-3 text-left">产品 / SKU</th>
                          <th className="py-2.5 px-3 text-right">数量</th>
                          {detailNodeUsesWeight ? (
                            <th className="py-2.5 px-3 text-right whitespace-nowrap">重量 (kg)</th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        <tr>
                          <td className="py-2.5 px-3 align-top">
                            <div className="flex min-w-0 items-start gap-2">
                              {product?.imageUrl ? (
                                <div className="flex h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-white">
                                  <img
                                    src={product.imageUrl}
                                    alt={product.name}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                    decoding="async"
                                  />
                                </div>
                              ) : (
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
                                  <Package className="h-4 w-4" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                                  <span className="font-bold text-slate-700">{product?.name ?? first.productId ?? '—'}</span>
                                  {product?.sku?.trim() ? (
                                    <span className="text-[9px] font-bold uppercase tracking-tight text-slate-300">
                                      {product.sku.trim()}
                                    </span>
                                  ) : null}
                                </div>
                                {matrixSummaryCustomTags.length > 0 ? (
                                  <div className="mt-1 flex flex-wrap items-center gap-1">
                                    {matrixSummaryCustomTags.map(({ field, display }) => (
                                      <span
                                        key={field.id}
                                        className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500"
                                      >
                                        {field.label}: {display}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                                {productionLinkMode !== 'product' && order?.orderNumber ? (
                                  <p className="mt-1 text-[10px] font-medium text-slate-500">
                                    工单 <span className="font-bold text-slate-600 tabular-nums">{order.orderNumber}</span>
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 align-middle">
                            <div className="flex min-w-0 items-center justify-end gap-1.5 whitespace-nowrap">
                              <input
                                type="number"
                                min={0}
                                value={
                                  editing.form.rowEdits.reduce((s, r) => s + r.quantity, 0) === 0
                                    ? ''
                                    : editing.form.rowEdits.reduce((s, r) => s + r.quantity, 0)
                                }
                                onChange={e => {
                                  const v = Math.max(0, Number(e.target.value) || 0);
                                  setEditing(prev => {
                                    if (!prev) return prev;
                                    const rows = prev.form.rowEdits;
                                    if (rows.length === 0) return prev;
                                    if (rows.length === 1) {
                                      return {
                                        ...prev,
                                        form: {
                                          ...prev.form,
                                          rowEdits: [{ ...rows[0]!, quantity: v }],
                                        },
                                      };
                                    }
                                    const total = rows.reduce((s, r) => s + r.quantity, 0);
                                    if (total <= 0) {
                                      return {
                                        ...prev,
                                        form: {
                                          ...prev.form,
                                          rowEdits: rows.map((re, i) =>
                                            i === 0 ? { ...re, quantity: v } : { ...re, quantity: 0 },
                                          ),
                                        },
                                      };
                                    }
                                    let rest = v;
                                    const next = rows.map((re, i) => {
                                      if (i === rows.length - 1) return { ...re, quantity: Math.max(0, rest) };
                                      const q = Math.floor((v * re.quantity) / total);
                                      rest -= q;
                                      return { ...re, quantity: q };
                                    });
                                    return { ...prev, form: { ...prev.form, rowEdits: next } };
                                  });
                                }}
                                className="h-9 w-[6.5rem] shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-right text-sm font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums"
                                placeholder="0"
                              />
                              <span className="shrink-0 text-xs font-bold text-slate-500">{unitName}</span>
                            </div>
                          </td>
                          {detailNodeUsesWeight ? (
                            <td className="py-2.5 px-3 text-right align-middle text-xs font-bold tabular-nums text-slate-600">
                              {formatDefectWeightKgDisplay(totalWeightKg)}
                            </td>
                          ) : null}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/80">
                          <th className="py-2.5 px-3 text-left">规格</th>
                          <th className="py-2.5 px-3 text-right">数量</th>
                          {detailNodeUsesWeight ? (
                            <th className="py-2.5 px-3 text-right whitespace-nowrap">重量 (kg)</th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {editing.form.rowEdits.map(rowEdit => (
                          <tr key={rowEdit.variantId || '_none'} className="border-b border-slate-100">
                            <td className="px-3 py-2.5 text-slate-800">{rowEdit.label}</td>
                            <td className="px-3 py-2.5 text-right align-middle">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                <input
                                  type="number"
                                  min={0}
                                  value={rowEdit.quantity === 0 ? '' : rowEdit.quantity}
                                  onChange={e => {
                                    const v = Math.max(0, Number(e.target.value) || 0);
                                    setEditing(prev =>
                                      prev
                                        ? {
                                            ...prev,
                                            form: {
                                              ...prev.form,
                                              rowEdits: prev.form.rowEdits.map(re =>
                                                re.variantId === rowEdit.variantId ? { ...re, quantity: v } : re,
                                              ),
                                            },
                                          }
                                        : prev,
                                    );
                                  }}
                                  className="h-9 w-[6.5rem] shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-left text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums"
                                  placeholder="0"
                                />
                                <span className="shrink-0 text-xs font-medium text-slate-500">{unitName}</span>
                              </div>
                            </td>
                            {detailNodeUsesWeight ? (
                              <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums text-slate-600">
                                {formatDefectWeightKgDisplay(weightSumForRecordIds(detailBatch, rowEdit.recordIds))}
                              </td>
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <DocSummaryCard
                className="mb-5"
                main={
                  <>
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 text-sm">
                      {first.docNo?.trim() ? (
                        <span className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 font-mono text-[10px] font-black uppercase tracking-widest text-indigo-600">
                          {first.docNo.trim()}
                        </span>
                      ) : null}
                      <span className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-indigo-600">
                        {typeLabel}
                      </span>
                      {productionLinkMode !== 'product' && order?.orderNumber ? (
                        <span className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-indigo-600">
                          {order.orderNumber}
                        </span>
                      ) : null}
                      <span className="text-slate-600 font-bold normal-case text-xs sm:text-sm" title="来源工序">
                        来源工序：{sourceNodeName}
                      </span>
                    </div>
                    <DocInlineMetaRow>
                      {(latestBatchTimestamp || first.timestamp) ? (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                          <span className="normal-case">时间 {fmtDT(latestBatchTimestamp ?? first.timestamp)}</span>
                        </span>
                      ) : null}
                      <span className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                        <span className="normal-case">经办: {operatorsLabel}</span>
                      </span>
                      {reworkTargetLabel ? (
                        <span className="inline-flex max-w-full min-w-0 items-baseline gap-1 normal-case">
                          <span className="shrink-0">返工目标：</span>
                          <span className="min-w-0 font-bold break-words">{reworkTargetLabel}</span>
                        </span>
                      ) : null}
                      <DocCustomFieldInlineReadList
                        fields={defectFieldsForDetail}
                        values={defectCustomSnapshot}
                        hasFilled={psiCustomFieldHasFilledDisplayValue}
                      />
                    </DocInlineMetaRow>
                    {first.reason?.trim() ? (
                      <p className="border-t border-slate-200/80 pt-2 text-xs font-bold text-slate-600 normal-case">
                        原因/备注：{first.reason.trim()}
                      </p>
                    ) : null}
                  </>
                }
                side={
                  <div className="min-w-[6.5rem] md:text-right">
                    <p className="text-[10px] text-slate-400 font-black uppercase mb-0.5">合计数量</p>
                    <p className="font-black tabular-nums text-slate-800">
                      {totalQty.toLocaleString()} {unitName}
                    </p>
                  </div>
                }
              />
              {first.productId && (
                <div className="flex-1 min-h-0 space-y-2 pb-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    {hasColorSize && defectDetailMatrixProduct && dictionaries ? '产品明细（按规格）' : '产品明细'}
                  </p>
                  {hasColorSize && defectDetailMatrixProduct && dictionaries ? (
                    <div className="overflow-x-auto rounded-2xl border border-slate-200">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/80">
                            <th className="py-2.5 px-3 text-left">产品 / SKU</th>
                            <th className="py-2.5 px-3 text-right">数量</th>
                            {detailNodeUsesWeight ? (
                              <th className="py-2.5 px-3 text-right whitespace-nowrap">重量 (kg)</th>
                            ) : null}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          <tr>
                            <td className="py-2.5 px-3 align-top">
                              <div className="flex min-w-0 items-start gap-2">
                                {product?.imageUrl ? (
                                  <div className="flex h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-white">
                                    <img
                                      src={product.imageUrl}
                                      alt={product.name}
                                      className="h-full w-full object-cover"
                                      loading="lazy"
                                      decoding="async"
                                    />
                                  </div>
                                ) : (
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
                                    <Package className="h-4 w-4" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                                    <span className="font-bold text-slate-700">{product?.name ?? first.productId ?? '—'}</span>
                                    {product?.sku?.trim() ? (
                                      <span className="text-[9px] font-bold uppercase tracking-tight text-slate-300">
                                        {product.sku.trim()}
                                      </span>
                                    ) : null}
                                  </div>
                                  {matrixSummaryCustomTags.length > 0 ? (
                                    <div className="mt-1 flex flex-wrap items-center gap-1">
                                      {matrixSummaryCustomTags.map(({ field, display }) => (
                                        <span
                                          key={field.id}
                                          className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500"
                                        >
                                          {field.label}: {display}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right align-middle font-black text-indigo-600 tabular-nums">
                              {totalQty.toLocaleString()} {unitName}
                            </td>
                            {detailNodeUsesWeight ? (
                              <td className="py-2.5 px-3 text-right align-middle text-xs font-bold tabular-nums text-slate-700">
                                {formatDefectWeightKgDisplay(totalWeightKg)}
                              </td>
                            ) : null}
                          </tr>
                          <tr className="bg-slate-50/70">
                            <td
                              colSpan={2 + (detailNodeUsesWeight ? 1 : 0)}
                              className="space-y-2 border-t border-slate-100 px-3 pb-3 pt-2 align-top"
                            >
                              {undiffDisplayRow ? (
                                <div className="rounded-lg border border-amber-100 bg-amber-50/80 px-2.5 py-2">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">未分规格</p>
                                  <p className="text-sm font-bold text-indigo-600 tabular-nums">
                                    {undiffDisplayRow.quantity} {unitName}
                                  </p>
                                </div>
                              ) : null}
                              <VariantQtyMatrixInputs
                                readOnly
                                product={defectDetailMatrixProduct}
                                dictionaries={dictionaries}
                                quantities={variantQtyFromDisplayRows}
                              />
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : !hasColorSize ? (
                    <div className="overflow-x-auto rounded-2xl border border-slate-200">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/80">
                            <th className="py-2.5 px-3 text-left">产品 / SKU</th>
                            <th className="py-2.5 px-3 text-right">数量</th>
                            {detailNodeUsesWeight ? (
                              <th className="py-2.5 px-3 text-right whitespace-nowrap">重量 (kg)</th>
                            ) : null}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          <tr>
                            <td className="py-2.5 px-3 align-top">
                              <div className="flex min-w-0 items-start gap-2">
                                {product?.imageUrl ? (
                                  <div className="flex h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-white">
                                    <img
                                      src={product.imageUrl}
                                      alt={product.name}
                                      className="h-full w-full object-cover"
                                      loading="lazy"
                                      decoding="async"
                                    />
                                  </div>
                                ) : (
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
                                    <Package className="h-4 w-4" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                                    <span className="font-bold text-slate-700">{product?.name ?? first.productId ?? '—'}</span>
                                    {product?.sku?.trim() ? (
                                      <span className="text-[9px] font-bold uppercase tracking-tight text-slate-300">
                                        {product.sku.trim()}
                                      </span>
                                    ) : null}
                                  </div>
                                  {matrixSummaryCustomTags.length > 0 ? (
                                    <div className="mt-1 flex flex-wrap items-center gap-1">
                                      {matrixSummaryCustomTags.map(({ field, display }) => (
                                        <span
                                          key={field.id}
                                          className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500"
                                        >
                                          {field.label}: {display}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right align-middle">
                              <span className="font-black tabular-nums text-indigo-600">
                                {totalQty.toLocaleString()} {unitName}
                              </span>
                            </td>
                            {detailNodeUsesWeight ? (
                              <td className="py-2.5 px-3 text-right align-middle text-xs font-bold tabular-nums text-slate-700">
                                {formatDefectWeightKgDisplay(totalWeightKg)}
                              </td>
                            ) : null}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-slate-200">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/80">
                            <th className="py-2.5 px-3 text-left">产品 / SKU</th>
                            <th className="py-2.5 px-3 text-right">数量</th>
                            {detailNodeUsesWeight ? (
                              <th className="py-2.5 px-3 text-right whitespace-nowrap">重量 (kg)</th>
                            ) : null}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          <tr>
                            <td className="py-2.5 px-3 align-top">
                              <div className="flex min-w-0 items-start gap-2">
                                {product?.imageUrl ? (
                                  <div className="flex h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-white">
                                    <img
                                      src={product.imageUrl}
                                      alt={product.name}
                                      className="h-full w-full object-cover"
                                      loading="lazy"
                                      decoding="async"
                                    />
                                  </div>
                                ) : (
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
                                    <Package className="h-4 w-4" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                                    <span className="font-bold text-slate-700">{product?.name ?? first.productId ?? '—'}</span>
                                    {product?.sku?.trim() ? (
                                      <span className="text-[9px] font-bold uppercase tracking-tight text-slate-300">
                                        {product.sku.trim()}
                                      </span>
                                    ) : null}
                                  </div>
                                  {matrixSummaryCustomTags.length > 0 ? (
                                    <div className="mt-1 flex flex-wrap items-center gap-1">
                                      {matrixSummaryCustomTags.map(({ field, display }) => (
                                        <span
                                          key={field.id}
                                          className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500"
                                        >
                                          {field.label}: {display}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right align-middle font-black text-indigo-600 tabular-nums">
                              {totalQty.toLocaleString()} {unitName}
                            </td>
                            {detailNodeUsesWeight ? (
                              <td className="py-2.5 px-3 text-right align-middle text-xs font-bold tabular-nums text-slate-700">
                                {formatDefectWeightKgDisplay(totalWeightKg)}
                              </td>
                            ) : null}
                          </tr>
                          <tr className="bg-slate-50/70">
                            <td
                              colSpan={2 + (detailNodeUsesWeight ? 1 : 0)}
                              className="border-t border-slate-100 px-3 pb-3 pt-2 align-top"
                            >
                              <div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
                                <table className="w-full text-left text-sm">
                                  <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50/90 text-[9px] font-black uppercase tracking-widest text-slate-400">
                                      <th className="py-2 px-3 text-left">规格</th>
                                      <th className="py-2 px-3 text-right">数量</th>
                                      {detailNodeUsesWeight ? (
                                        <th className="py-2 px-3 text-right whitespace-nowrap">重量 (kg)</th>
                                      ) : null}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-50">
                                    {displayVariantRows.map(vr => (
                                      <tr key={vr.variantId || '_none'}>
                                        <td className="px-3 py-2 text-slate-800">{vr.label}</td>
                                        <td className="px-3 py-2 text-right text-sm font-bold text-indigo-600 tabular-nums">
                                          {vr.quantity} {unitName}
                                        </td>
                                        {detailNodeUsesWeight ? (
                                          <td className="px-3 py-2 text-right text-xs font-bold tabular-nums text-slate-700">
                                            {formatDefectWeightKgDisplay(weightSumForRecordIds(detailBatch, vr.recordIds))}
                                          </td>
                                        ) : null}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          </div>
        </>
      )}
    />
  );
};

export default React.memo(DefectTreatmentFlowDetailModal);
