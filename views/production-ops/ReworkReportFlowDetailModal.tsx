import React, { useState, useMemo, useCallback, useContext } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clock, User, Package, Building2 } from 'lucide-react';
import {
  ProductionOpRecord,
  ProductionOrder,
  Product,
  ProductCategory,
  GlobalNodeTemplate,
  AppDictionaries,
  Worker,
  ReworkFormSettings,
  PrintTemplate,
  PrintRenderContext,
} from '../../types';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import { buildVariantQtyMatrixLayout } from '../../utils/variantQtyMatrix';
import { groupProductionOpBatchByVariant, mapGroupedOpQuantitiesToRecordIds } from '../../utils/groupProductionOpBatchByVariant';
import { hasOpsPerm } from './types';
import { fmtDT, timestampFromDatetimeLocal, nowTimestamp } from '../../utils/formatTime';
import WorkerSelector from '../../components/WorkerSelector';
import EquipmentSelector from '../../components/EquipmentSelector';
import { OrderCenterDetailPrintBlock } from '../../components/order-print/OrderCenterDetailPrintBlock';
import { buildReworkReportFlowPrintContext } from '../../utils/buildReworkReportFlowPrintContext';
import { useEquipmentFeaturesEffective } from '../../hooks/useEquipmentFeaturesEffective';
import { readReworkReportCustomSnapshot, REWORK_REPORT_CUSTOM_DATA_KEY } from '../../utils/productionOpCollab/rework';
import VariantQtyMatrixInputs from '../../components/variant-matrix/VariantQtyMatrixInputs';
import { psiOrderBillFormFieldControlClass } from '../../styles/uiDensity';
import { psiCustomFieldHasFilledDisplayValue } from '../psi-ops/psiOpsListFormatting';
import { getProductCategoryCustomFieldEntries } from '../../utils/reportCustomDocField';
import DocPhaseModal, { DocPhaseEditToolbarPortalContext } from '../../components/DocPhaseModal';
import {
  DocCustomFieldEditGrid,
  DocCustomFieldInlineReadList,
  DocInlineMetaRow,
  DocSummaryCard,
} from '../../components/doc-modal';

const reworkReportCustomFieldEditControlClass =
  'h-9 w-full max-w-md rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500';

function ReworkFlowEditSavePortal({ active, onSave }: { active: boolean; onSave: () => void }) {
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

export interface ReworkReportFlowDetailModalProps {
  productionLinkMode: 'order' | 'product';
  reworkFlowDetailRecord: ProductionOpRecord;
  records: ProductionOpRecord[];
  orders: ProductionOrder[];
  products: Product[];
  categories?: ProductCategory[];
  globalNodes: GlobalNodeTemplate[];
  dictionaries?: AppDictionaries;
  workers: Worker[];
  equipment: { id: string; name: string; code?: string; assignedMilestoneIds?: string[] }[];
  userPermissions?: string[];
  tenantRole?: string;
  reworkFormSettings?: ReworkFormSettings;
  printTemplates?: PrintTemplate[];
  onOpenReworkFormPrintTab?: () => void;
  onUpdateRecord?: (record: ProductionOpRecord) => void;
  onDeleteRecord?: (recordId: string) => void;
  /** 编辑补录新规格（返工报工流水 REWORK_REPORT） */
  onAddRecord?: (record: ProductionOpRecord) => void | Promise<void>;
  onClose: () => void;
}

const ReworkReportFlowDetailModal: React.FC<ReworkReportFlowDetailModalProps> = ({
  productionLinkMode,
  reworkFlowDetailRecord,
  records,
  orders,
  products,
  categories = [],
  globalNodes,
  dictionaries,
  workers,
  equipment,
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
  const equipmentFeaturesOn = useEquipmentFeaturesEffective();
  const r = reworkFlowDetailRecord;
  const detailBatch = r.type === 'REWORK_REPORT'
    ? (r.docNo
        ? (records || []).filter(
            (x): x is ProductionOpRecord =>
              x.type === 'REWORK_REPORT' && x.docNo === r.docNo && x.productId === r.productId
          )
        : [r])
    : (records || []).filter(
        (x): x is ProductionOpRecord => x.type === 'REWORK' && x.orderId === r.orderId && (x.sourceNodeId ?? x.nodeId) === (r.sourceNodeId ?? r.nodeId) && (r.docNo ? x.docNo === r.docNo : x.id === r.id)
      );
  const first = detailBatch[0];

  const [editing, setEditing] = useState<{
    form: {
      timestamp: string;
      workerId: string;
      equipmentId: string;
      reason: string;
      unitPrice: number;
      customData: Record<string, unknown>;
      rowEdits: { variantId: string; label: string; quantity: number; recordIds: string[] }[];
    };
    firstRecord: ProductionOpRecord;
  } | null>(null);

  const isReportDetail = first?.type === 'REWORK_REPORT';
  const outsourcePartnersInBatch = useMemo(() => {
    if (!isReportDetail) return [] as string[];
    return [...new Set(detailBatch.map(x => (x.partner ?? '').trim()).filter(Boolean))];
  }, [isReportDetail, detailBatch]);
  const isOutsourceReworkReport = isReportDetail && outsourcePartnersInBatch.length > 0;
  const outsourcePartnerDisplay =
    outsourcePartnersInBatch.length === 0
      ? ''
      : outsourcePartnersInBatch.length === 1
        ? outsourcePartnersInBatch[0]!
        : outsourcePartnersInBatch.join('、');
  const order = first ? orders.find(o => o.id === first.orderId) : undefined;
  const product = first ? products.find(p => p.id === first.productId) : undefined;
  const productCategory = product ? categories.find(c => c.id === product.categoryId) : undefined;
  const unitName = (product?.unitId && dictionaries?.units?.find(u => u.id === product.unitId)?.name) || '件';
  const reworkOrigin = first
    ? (records || []).find(x => x.type === 'REWORK' && (x.orderId === first.orderId || (orders.find(o => o.id === first.orderId)?.parentOrderId === x.orderId)) && ((x.reworkNodeIds?.length ? x.reworkNodeIds : x.nodeId ? [x.nodeId] : []).includes(first.nodeId ?? '')))
    : undefined;
  const resolvedSourceNodeId = first
    ? ((reworkOrigin?.sourceNodeId != null ? reworkOrigin.sourceNodeId : first.sourceNodeId) ?? undefined)
    : undefined;
  const sourceNodeName = resolvedSourceNodeId ? globalNodes.find(n => n.id === resolvedSourceNodeId)?.name : null;
  const totalQty = detailBatch.reduce((s, x) => s + (x.quantity ?? 0), 0);
  const hasColorSize = productHasColorSizeMatrix(product, productCategory);
  const nodeNamesInBatch = [...new Set(detailBatch.map(x => x.nodeId ? (globalNodes.find(n => n.id === x.nodeId)?.name ?? '') : '').filter(Boolean))] as string[];
  const nodeNamesLabel = nodeNamesInBatch.length === 0 ? '—' : nodeNamesInBatch.length === 1 ? nodeNamesInBatch[0]! : nodeNamesInBatch.join('、');
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
  const pricesInBatch = detailBatch.map(x => x.unitPrice).filter((p): p is number => p != null && p > 0);
  const unitPriceLabel = pricesInBatch.length === 0 ? null : pricesInBatch.every(p => p === pricesInBatch[0]) ? pricesInBatch[0]! : null;
  const batchTotalAmount = detailBatch.reduce((s, x) => {
    if (x.amount != null && x.amount > 0) return s + x.amount;
    const up = x.unitPrice ?? 0;
    const q = x.quantity ?? 0;
    return up > 0 ? s + q * up : s;
  }, 0);
  const detailHeaderUnitPriceText = useMemo(() => {
    if (unitPriceLabel != null) return unitPriceLabel.toFixed(2);
    const up = detailBatch[0]?.unitPrice;
    return up != null && Number(up) > 0 ? Number(up).toFixed(2) : '—';
  }, [unitPriceLabel, detailBatch]);
  const displayVariantRows = useMemo(() => {
    const grouped = groupProductionOpBatchByVariant(detailBatch, product);
    return grouped.map(g => {
      let lineAmount = 0;
      for (const id of g.recordIds) {
        const rec = detailBatch.find(x => x.id === id);
        if (!rec) continue;
        const q = rec.quantity ?? 0;
        lineAmount +=
          rec.amount != null && rec.amount > 0 ? rec.amount : (rec.unitPrice != null && rec.unitPrice > 0 ? q * rec.unitPrice : 0);
      }
      return { ...g, lineAmount };
    });
  }, [detailBatch, product]);

  const reworkFlowMatrixProduct = useMemo(
    () =>
      product && product.variants?.length
        ? ({ ...product, colorIds: undefined, sizeIds: undefined } as Product)
        : null,
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
  const categoryMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const matrixSummaryCustomTags = useMemo(() => {
    if (!product) return [];
    const cat = product.categoryId ? categoryMap.get(product.categoryId) : undefined;
    return getProductCategoryCustomFieldEntries(product, cat ?? null, { includeFile: false, includeEmpty: false });
  }, [product, categoryMap]);

  const reworkReportFieldsForDetail = useMemo(
    () => (reworkFormSettings?.reworkReportCustomFields ?? []).filter(f => f.showInDetail),
    [reworkFormSettings?.reworkReportCustomFields],
  );
  const reworkReportCustomSnapshot = useMemo(() => {
    if (!isReportDetail || !first) return {} as Record<string, unknown>;
    return readReworkReportCustomSnapshot(records, first.docNo, first.productId);
  }, [records, first, isReportDetail]);

  const buildPrintContext = useCallback(
    (template: PrintTemplate): PrintRenderContext =>
      buildReworkReportFlowPrintContext(template, {
        productionLinkMode,
        detailBatch,
        records,
        orders,
        products,
        globalNodes,
        dictionaries,
        workers,
        equipment,
      }),
    [productionLinkMode, detailBatch, records, orders, products, globalNodes, dictionaries, workers, equipment],
  );

  const startEdit = () => {
    if (!onUpdateRecord || detailBatch.length === 0) return;
    const rec = detailBatch[0];
    let dt = new Date(rec.timestamp || undefined);
    if (isNaN(dt.getTime())) dt = new Date();
    const tsStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    const snap =
      rec.type === 'REWORK_REPORT'
        ? { ...readReworkReportCustomSnapshot(records, rec.docNo, rec.productId) }
        : {};
    const grouped = groupProductionOpBatchByVariant(detailBatch, product);
    let rowEdits = grouped.map(g => ({
      variantId: g.variantId,
      label: g.label,
      quantity: g.quantity,
      recordIds: [...g.recordIds],
    }));
    if (isReportDetail && hasColorSize && product && dictionaries) {
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
        workerId: rec.workerId ?? '',
        equipmentId: rec.equipmentId ?? '',
        reason: rec.reason ?? '',
        unitPrice: rec.unitPrice ?? 0,
        customData: snap,
        rowEdits,
      },
    });
  };

  const saveEdit = () => {
    if (!onUpdateRecord || !editing) return;
    const f = editing.form;
    const tsStr = f.timestamp ? timestampFromDatetimeLocal(f.timestamp) : nowTimestamp();
    const isOutsourceSave = detailBatch.some(
      x => x.type === 'REWORK_REPORT' && (x.partner ?? '').trim().length > 0,
    );
    const opName = isOutsourceSave
      ? ''
      : (workers?.find(w => w.id === f.workerId)?.name) ?? editing.firstRecord.operator ?? '';
    const newQtyByRecordId = mapGroupedOpQuantitiesToRecordIds(detailBatch, f.rowEdits);
    const cleanCustom = Object.fromEntries(
      Object.entries(f.customData).filter(([, v]) => v !== '' && v != null && v !== undefined),
    );
    const reworkDeltas = new Map<string, { reworkId: string; nodeId: string; delta: number }>();
    detailBatch.forEach(rec => {
      const newQty = newQtyByRecordId.get(rec.id);
      if (newQty === undefined) return;
      const oldQty = rec.quantity ?? 0;
      const delta = newQty - oldQty;
      if (delta !== 0 && rec.sourceReworkId && rec.nodeId) {
        const key = `${rec.sourceReworkId}|${rec.nodeId}`;
        const cur = reworkDeltas.get(key) ?? { reworkId: rec.sourceReworkId, nodeId: rec.nodeId, delta: 0 };
        cur.delta += delta;
        reworkDeltas.set(key, cur);
      }
      const prevCd = (rec as ProductionOpRecord & { collabData?: Record<string, unknown> }).collabData ?? {};
      const collabMerged =
        rec.type === 'REWORK_REPORT'
          ? { ...prevCd, [REWORK_REPORT_CUSTOM_DATA_KEY]: cleanCustom }
          : prevCd;
      onUpdateRecord({
        ...rec,
        quantity: newQty,
        timestamp: tsStr,
        operator: opName,
        reason: f.reason || undefined,
        workerId: isOutsourceSave ? undefined : f.workerId || undefined,
        equipmentId: isOutsourceSave ? undefined : f.equipmentId || undefined,
        unitPrice: f.unitPrice > 0 ? f.unitPrice : undefined,
        amount: f.unitPrice > 0 ? newQty * f.unitPrice : undefined,
        ...(rec.type === 'REWORK_REPORT' ? { collabData: collabMerged } : {}),
      });
    });
    for (const row of f.rowEdits) {
      if (row.recordIds.length > 0 || !row.variantId || row.quantity <= 0) continue;
      const tmpl = first;
      if (tmpl.sourceReworkId && tmpl.nodeId) {
        const key = `${tmpl.sourceReworkId}|${tmpl.nodeId}`;
        const cur = reworkDeltas.get(key) ?? { reworkId: tmpl.sourceReworkId, nodeId: tmpl.nodeId, delta: 0 };
        cur.delta += row.quantity;
        reworkDeltas.set(key, cur);
      }
    }
    if (isReportDetail && onAddRecord) {
      let seq = 0;
      for (const row of f.rowEdits) {
        if (row.recordIds.length > 0 || !row.variantId || row.quantity <= 0) continue;
        const base = first;
        void onAddRecord({
          id: `rec-rework-report-edit-${Date.now()}-${seq++}-${row.variantId.slice(-6)}`,
          type: 'REWORK_REPORT',
          orderId: base.orderId,
          productId: base.productId,
          operator: opName,
          timestamp: tsStr,
          nodeId: base.nodeId,
          sourceNodeId: base.sourceNodeId,
          sourceReworkId: base.sourceReworkId ?? reworkOrigin?.id,
          variantId: row.variantId,
          quantity: row.quantity,
          docNo: base.docNo,
          workerId: isOutsourceSave ? undefined : f.workerId || undefined,
          equipmentId: isOutsourceSave ? undefined : f.equipmentId || undefined,
          unitPrice: f.unitPrice > 0 ? f.unitPrice : undefined,
          amount: f.unitPrice > 0 ? row.quantity * f.unitPrice : undefined,
          ...((base.partner ?? '').trim() ? { partner: base.partner } : {}),
          collabData: { [REWORK_REPORT_CUSTOM_DATA_KEY]: cleanCustom },
        });
      }
    }
    reworkDeltas.forEach(({ reworkId, nodeId, delta }) => {
      const reworkRec = records.find(r => r.id === reworkId && r.type === 'REWORK');
      if (!reworkRec) return;
      const oldDone = reworkRec.reworkCompletedQuantityByNode?.[nodeId] ?? 0;
      const newDone = Math.max(0, oldDone + delta);
      const updCompleted = { ...(reworkRec.reworkCompletedQuantityByNode ?? {}), [nodeId]: newDone };
      const nodes = (reworkRec.reworkNodeIds?.length ? reworkRec.reworkNodeIds : (reworkRec.nodeId ? [reworkRec.nodeId] : []));
      const allDone = nodes.every(n => (updCompleted[n] ?? 0) >= reworkRec.quantity);
      const wasComplete = reworkRec.status === '已完成';
      onUpdateRecord({ ...reworkRec, reworkCompletedQuantityByNode: updCompleted, status: allDone ? '已完成' : (wasComplete ? '处理中' : reworkRec.status) });
    });
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
      detailTitle={isReportDetail ? '返工报工流水详情' : '返工详情'}
      editTitle={isReportDetail ? '返工报工流水 · 编辑' : '返工 · 编辑'}
      newTitle=""
      leadingDetailActions={
        isReportDetail ? (
          <OrderCenterDetailPrintBlock
            printSlot={reworkFormSettings?.reworkCenterPrint?.reworkReportFlowDetail}
            printTemplates={printTemplates}
            buildContext={buildPrintContext}
            onAddPrintTemplate={onOpenReworkFormPrintTab}
            pickerSubtitle={`返工报工流水 ${first.docNo ?? '—'}`}
          />
        ) : null
      }
      hasPerm={perm => hasOpsPerm(tenantRole, userPermissions, perm)}
      viewPerm="production:rework_records:view"
      editPerm="production:rework_records:edit"
      deletePerm={onDeleteRecord ? 'production:rework_records:delete' : undefined}
      deleteConfirmMessage="确定要删除该返工单的所有记录吗？此操作不可恢复。"
      onDelete={onDeleteRecord ? () => {
        const reworkDeltas = new Map<string, { reworkId: string; nodeId: string; delta: number }>();
        detailBatch.forEach(rec => {
          if (rec.sourceReworkId && rec.nodeId) {
            const key = `${rec.sourceReworkId}|${rec.nodeId}`;
            const cur = reworkDeltas.get(key) ?? { reworkId: rec.sourceReworkId, nodeId: rec.nodeId, delta: 0 };
            cur.delta -= (rec.quantity ?? 0);
            reworkDeltas.set(key, cur);
          }
        });
        detailBatch.forEach(x => onDeleteRecord(x.id));
        reworkDeltas.forEach(({ reworkId, nodeId, delta }) => {
          const reworkRec = records.find(r => r.id === reworkId && r.type === 'REWORK');
          if (!reworkRec || !onUpdateRecord) return;
          const oldDone = reworkRec.reworkCompletedQuantityByNode?.[nodeId] ?? 0;
          const newDone = Math.max(0, oldDone + delta);
          const updCompleted = { ...(reworkRec.reworkCompletedQuantityByNode ?? {}), [nodeId]: newDone };
          const nodes = (reworkRec.reworkNodeIds?.length ? reworkRec.reworkNodeIds : (reworkRec.nodeId ? [reworkRec.nodeId] : []));
          const allDone = nodes.every(n => (updCompleted[n] ?? 0) >= reworkRec.quantity);
          const wasComplete = reworkRec.status === '已完成';
          onUpdateRecord({ ...reworkRec, reworkCompletedQuantityByNode: updCompleted, status: allDone ? '已完成' : (wasComplete ? '处理中' : reworkRec.status) });
        });
        onClose();
      } : undefined}
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
          <ReworkFlowEditSavePortal active={!!editing} onSave={saveEdit} />
          <div className="space-y-4 min-h-0">
          {editing ? (
            <>
              <DocSummaryCard
                main={
                  <>
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 text-sm">
                      {isReportDetail && first.docNo?.trim() ? (
                        <span className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 font-mono text-[10px] font-black uppercase tracking-widest text-indigo-600">
                          {first.docNo.trim()}
                        </span>
                      ) : null}
                      {productionLinkMode !== 'product' && order?.orderNumber ? (
                        <span className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-indigo-600">
                          {order.orderNumber}
                        </span>
                      ) : null}
                      <span className="text-slate-600 font-bold normal-case text-xs sm:text-sm">工序：{nodeNamesLabel}</span>
                      <span className="text-slate-600 font-bold normal-case text-xs sm:text-sm">
                        来源：
                        {sourceNodeName ?? (first.sourceNodeId ? globalNodes.find(n => n.id === first.sourceNodeId)?.name : null) ?? '—'}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-col gap-3 text-[10px] font-bold leading-snug text-slate-500 normal-case">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span className="inline-flex min-h-9 min-w-0 items-center gap-1.5 text-slate-400">
                          <Clock className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                          <span className="sr-only">返工时间</span>
                          <input
                            type="datetime-local"
                            value={editing.form.timestamp}
                            onChange={e =>
                              setEditing(prev =>
                                prev ? { ...prev, form: { ...prev.form, timestamp: e.target.value } } : prev,
                              )
                            }
                            className={`${psiOrderBillFormFieldControlClass} max-w-full sm:max-w-[14rem]`}
                          />
                        </span>
                      </div>
                      {isOutsourceReworkReport ? (
                        <div className="min-w-0 space-y-1.5 md:max-w-md">
                          <label className="mb-1.5 ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                            委外工厂
                          </label>
                          <div className="flex h-9 min-h-9 w-full min-w-0 items-center rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-800">
                            {outsourcePartnerDisplay || '—'}
                          </div>
                        </div>
                      ) : (
                        <>
                          {workers && workers.length > 0 ? (
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-1.5 text-slate-400">
                                <User className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                                <span className="text-[10px] font-black uppercase tracking-widest">报工人员</span>
                              </div>
                              <WorkerSelector
                                options={workers
                                  .filter((w: Worker) => w.status === 'ACTIVE')
                                  .map((w: Worker) => ({
                                    id: w.id,
                                    name: w.name,
                                    sub: w.groupName,
                                    assignedMilestoneIds: w.assignedMilestoneIds,
                                  }))}
                                processNodes={globalNodes}
                                currentNodeId={first.nodeId ?? ''}
                                value={editing.form.workerId}
                                onChange={id =>
                                  setEditing(prev => (prev ? { ...prev, form: { ...prev.form, workerId: id } } : prev))
                                }
                                placeholder="选择报工人员..."
                                variant="default"
                              />
                            </div>
                          ) : null}
                          {equipmentFeaturesOn &&
                          equipment &&
                          equipment.length > 0 &&
                          globalNodes.find(n => n.id === first.nodeId)?.enableEquipmentOnReport ? (
                            <div className="min-w-0 space-y-1">
                              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">设备</label>
                              <EquipmentSelector
                                options={equipment.map(
                                  (e: { id: string; name: string; code?: string; assignedMilestoneIds?: string[] }) => ({
                                    id: e.id,
                                    name: e.name,
                                    sub: e.code,
                                    assignedMilestoneIds: e.assignedMilestoneIds,
                                  }),
                                )}
                                processNodes={globalNodes}
                                currentNodeId={first.nodeId ?? ''}
                                value={editing.form.equipmentId}
                                onChange={id =>
                                  setEditing(prev => (prev ? { ...prev, form: { ...prev.form, equipmentId: id } } : prev))
                                }
                                placeholder="选择设备..."
                                variant="default"
                              />
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                    {isReportDetail && reworkReportFieldsForDetail.length > 0 ? (
                      <DocCustomFieldEditGrid
                        fields={reworkReportFieldsForDetail}
                        values={editing.form.customData}
                        onChange={(fieldId, v) =>
                          setEditing(prev =>
                            prev
                              ? { ...prev, form: { ...prev.form, customData: { ...prev.form.customData, [fieldId]: v } } }
                              : prev,
                          )
                        }
                        controlClassName={reworkReportCustomFieldEditControlClass}
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
                    {editing.form.rowEdits.reduce((s, r) => s + r.quantity, 0) * (editing.form.unitPrice || 0) > 0 ? (
                      <div className="min-w-[6.5rem] md:text-right">
                        <p className="text-[10px] text-slate-400 font-black uppercase mb-0.5">金额（元）</p>
                        <p className="font-black tabular-nums text-emerald-600">
                          ¥
                          {(editing.form.rowEdits.reduce((s, r) => s + r.quantity, 0) * (editing.form.unitPrice || 0)).toFixed(2)}
                        </p>
                      </div>
                    ) : null}
                  </>
                }
              />
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  {hasColorSize && reworkFlowMatrixProduct && dictionaries ? '产品明细（按规格）' : '产品明细'}
                </p>
                {hasColorSize && reworkFlowMatrixProduct && dictionaries ? (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/80">
                          <th className="py-2.5 px-3 text-left">产品 / SKU</th>
                          <th className="py-2.5 px-3 text-right">数量</th>
                          <th className="py-2.5 px-3 text-right whitespace-nowrap">单价（元）</th>
                          <th className="py-2.5 px-3 text-right whitespace-nowrap">金额（元）</th>
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
                                    alt={product?.name ?? '—'}
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
                          <td className="py-2.5 px-3 text-right align-middle">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={editing.form.unitPrice || ''}
                              onChange={e =>
                                setEditing(prev =>
                                  prev ? { ...prev, form: { ...prev.form, unitPrice: Number(e.target.value) || 0 } } : prev,
                                )
                              }
                              placeholder="0"
                              className="ml-auto block h-9 w-full max-w-[6.5rem] rounded-lg border border-slate-200 bg-white px-2 text-right text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-right align-middle text-sm font-black text-amber-600 tabular-nums">
                            ¥
                            {(editing.form.rowEdits.reduce((s, r) => s + r.quantity, 0) * (editing.form.unitPrice || 0)).toFixed(2)}
                          </td>
                        </tr>
                        <tr className="bg-slate-50/70">
                          <td
                            colSpan={4}
                            className="space-y-2 border-t border-slate-100 px-3 pb-3 pt-2 align-top"
                          >
                            {editing.form.rowEdits.some(r => !r.variantId) ? (
                              <div className="rounded-lg border border-amber-100 bg-amber-50/80 px-2.5 py-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">未分规格</label>
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
                              const matrixProd = { ...product!, variants: vars, colorIds: undefined, sizeIds: undefined } as Product;
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
                          <th className="py-2.5 px-3 text-right whitespace-nowrap">单价（元）</th>
                          <th className="py-2.5 px-3 text-right whitespace-nowrap">金额（元）</th>
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
                                    alt={product?.name ?? '—'}
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
                          <td className="py-2.5 px-3 align-middle">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={editing.form.unitPrice || ''}
                              onChange={e =>
                                setEditing(prev =>
                                  prev ? { ...prev, form: { ...prev.form, unitPrice: Number(e.target.value) || 0 } } : prev,
                                )
                              }
                              placeholder="0"
                              className="h-9 w-full min-w-[5rem] max-w-[6.5rem] rounded-lg border border-slate-200 bg-white px-2 text-right text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-right align-middle text-sm font-black text-amber-600 tabular-nums">
                            {(editing.form.rowEdits.reduce((s, r) => s + r.quantity, 0) * (editing.form.unitPrice || 0)).toFixed(2)}
                          </td>
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
                          <th className="py-2.5 px-3 text-right whitespace-nowrap">单价（元）</th>
                          <th className="py-2.5 px-3 text-right whitespace-nowrap">金额（元）</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {editing.form.rowEdits.map((rowEdit, rowIdx) => (
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
                                              rowEdits: prev.form.rowEdits.map(r =>
                                                r.variantId === rowEdit.variantId ? { ...r, quantity: v } : r,
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
                            {rowIdx === 0 ? (
                              <td
                                rowSpan={Math.max(1, editing.form.rowEdits.length)}
                                className="border-b border-slate-100 px-3 py-2.5 align-top text-right"
                              >
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={editing.form.unitPrice || ''}
                                  onChange={e =>
                                    setEditing(prev =>
                                      prev ? { ...prev, form: { ...prev.form, unitPrice: Number(e.target.value) || 0 } } : prev,
                                    )
                                  }
                                  placeholder="0"
                                  className="ml-auto block h-9 w-full max-w-[6.5rem] rounded-lg border border-slate-200 bg-white px-2 text-right text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums"
                                />
                              </td>
                            ) : null}
                            <td className="px-3 py-2.5 text-right text-xs font-bold text-amber-600 tabular-nums">
                              {(rowEdit.quantity * (editing.form.unitPrice || 0)).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <DocSummaryCard
                main={
                  <>
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 text-sm">
                      {isReportDetail && first.docNo?.trim() ? (
                        <span className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 font-mono text-[10px] font-black uppercase tracking-widest text-indigo-600">
                          {first.docNo.trim()}
                        </span>
                      ) : null}
                      {productionLinkMode !== 'product' && order?.orderNumber ? (
                        <span className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-indigo-600">
                          {order.orderNumber}
                        </span>
                      ) : null}
                      <span className="text-slate-600 font-bold normal-case text-xs sm:text-sm">工序：{nodeNamesLabel}</span>
                      <span className="text-slate-600 font-bold normal-case text-xs sm:text-sm">
                        来源：
                        {sourceNodeName ?? (first.sourceNodeId ? globalNodes.find(n => n.id === first.sourceNodeId)?.name : null) ?? '—'}
                      </span>
                    </div>
                    <DocInlineMetaRow>
                      {(latestBatchTimestamp || first.timestamp) ? (
                        <span className="inline-flex min-h-4 items-center gap-1.5 text-slate-400">
                          <Clock className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                          <span className="leading-none normal-case">时间 {fmtDT(latestBatchTimestamp ?? first.timestamp)}</span>
                        </span>
                      ) : null}
                      {isOutsourceReworkReport ? (
                        <span className="inline-flex min-h-4 items-center gap-1.5 text-slate-400">
                          <Building2 className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                          <span className="leading-none normal-case">委外工厂: {outsourcePartnerDisplay || '—'}</span>
                        </span>
                      ) : (
                        <span className="inline-flex min-h-4 items-center gap-1.5 text-slate-400">
                          <User className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                          <span className="leading-none normal-case">经办: {operatorsLabel}</span>
                        </span>
                      )}
                      {isReportDetail && (
                        <DocCustomFieldInlineReadList
                          fields={reworkReportFieldsForDetail}
                          values={reworkReportCustomSnapshot}
                          hasFilled={psiCustomFieldHasFilledDisplayValue}
                        />
                      )}
                    </DocInlineMetaRow>
                  </>
                }
                side={
                  <>
                    <div className="min-w-[6.5rem] md:text-right">
                      <p className="text-[10px] text-slate-400 font-black uppercase mb-0.5">合计数量</p>
                      <p className="font-black tabular-nums text-slate-800">
                        {totalQty.toLocaleString()} {unitName}
                      </p>
                    </div>
                    {batchTotalAmount > 0 ? (
                      <div className="min-w-[6.5rem] md:text-right">
                        <p className="text-[10px] text-slate-400 font-black uppercase mb-0.5">金额（元）</p>
                        <p className="font-black tabular-nums text-emerald-600">¥{batchTotalAmount.toFixed(2)}</p>
                      </div>
                    ) : null}
                  </>
                }
              />
              {first.productId && (
                <div className="flex-1 min-h-0 space-y-2 pb-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    {hasColorSize && reworkFlowMatrixProduct && dictionaries ? '产品明细（按规格）' : '产品明细'}
                  </p>
                  {hasColorSize && reworkFlowMatrixProduct && dictionaries ? (
                    <div className="overflow-x-auto rounded-2xl border border-slate-200">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/80">
                            <th className="py-2.5 px-3 text-left">产品 / SKU</th>
                            <th className="py-2.5 px-3 text-right">数量</th>
                            <th className="py-2.5 px-3 text-right whitespace-nowrap">单价（元）</th>
                            <th className="py-2.5 px-3 text-right whitespace-nowrap">金额（元）</th>
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
                                      alt={product?.name ?? '—'}
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
                            <td className="py-2.5 px-3 text-right align-middle text-xs font-bold tabular-nums text-slate-700">
                              {detailHeaderUnitPriceText}
                            </td>
                            <td className="py-2.5 px-3 text-right align-middle text-sm font-black text-amber-600 tabular-nums">
                              ¥{batchTotalAmount.toFixed(2)}
                            </td>
                          </tr>
                          <tr className="bg-slate-50/70">
                            <td
                              colSpan={4}
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
                                product={reworkFlowMatrixProduct}
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
                            <th className="py-2.5 px-3 text-right whitespace-nowrap">单价（元）</th>
                            <th className="py-2.5 px-3 text-right whitespace-nowrap">金额（元）</th>
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
                                      alt={product?.name ?? '—'}
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
                            <td className="py-2.5 px-3 text-right align-middle text-xs font-bold tabular-nums text-slate-700">
                              {detailHeaderUnitPriceText}
                            </td>
                            <td className="py-2.5 px-3 text-right align-middle text-sm font-black text-amber-600 tabular-nums">
                              ¥{batchTotalAmount.toFixed(2)}
                            </td>
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
                            <th className="py-2.5 px-3 text-right whitespace-nowrap">单价（元）</th>
                            <th className="py-2.5 px-3 text-right whitespace-nowrap">金额（元）</th>
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
                                      alt={product?.name ?? '—'}
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
                            <td className="py-2.5 px-3 text-right align-middle text-xs font-bold tabular-nums text-slate-700">
                              {detailHeaderUnitPriceText}
                            </td>
                            <td className="py-2.5 px-3 text-right align-middle text-sm font-black text-amber-600 tabular-nums">
                              ¥{batchTotalAmount.toFixed(2)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
              {(first.reworkNodeIds?.length ?? 0) > 0 && first.reworkNodeIds && (
                <div className="text-sm">
                  <span className="text-slate-400 font-bold">返工目标工序</span>
                  <p className="text-slate-800 mt-1">{first.reworkNodeIds.map(nid => globalNodes.find(n => n.id === nid)?.name ?? nid).join('、')}</p>
                </div>
              )}
              {(first.completedNodeIds?.length ?? 0) > 0 && (
                <div className="text-sm">
                  <span className="text-slate-400 font-bold">已完成工序</span>
                  <p className="text-slate-800 mt-1">{first.completedNodeIds.map(nid => globalNodes.find(n => n.id === nid)?.name ?? nid).join('、')}</p>
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

export default React.memo(ReworkReportFlowDetailModal);
