import React, { useState, useMemo, useCallback } from 'react';
import { X, Check, Pencil, Trash2, FileText, Layers } from 'lucide-react';
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
import { groupProductionOpBatchByVariant, mapGroupedOpQuantitiesToRecordIds } from '../../utils/groupProductionOpBatchByVariant';
import { hasOpsPerm } from './types';
import { formatTimestamp, timestampFromDatetimeLocal, nowTimestamp } from '../../utils/formatTime';
import { useConfirm } from '../../contexts/ConfirmContext';
import WorkerSelector from '../../components/WorkerSelector';
import EquipmentSelector from '../../components/EquipmentSelector';
import { PlanFormCustomFieldInput, PlanFormCustomFieldReadonly } from '../../components/PlanFormCustomFieldControls';
import { OrderCenterDetailPrintBlock } from '../../components/order-print/OrderCenterDetailPrintBlock';
import { buildReworkReportFlowPrintContext } from '../../utils/buildReworkReportFlowPrintContext';
import { useEquipmentFeaturesEffective } from '../../hooks/useEquipmentFeaturesEffective';
import { readReworkReportCustomSnapshot, REWORK_REPORT_CUSTOM_DATA_KEY } from '../../utils/productionOpCollab/rework';
import VariantQtyMatrixInputs from '../../components/variant-matrix/VariantQtyMatrixInputs';
import {
  sectionTitleClass,
  psiOrderBillFormSectionStackClass,
  psiOrderBillFormDetailSplitClass,
  psiOrderBillFormGridGapClass,
  psiOrderBillFormSectionIconIndigoClass,
  psiOrderBillFormSectionIconEmeraldClass,
  psiOrderBillFormFieldControlClass,
} from '../../styles/uiDensity';

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
  onClose,
}) => {
  const equipmentFeaturesOn = useEquipmentFeaturesEffective();
  const confirm = useConfirm();
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
      operator: string;
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
  const showSpecTable =
    hasColorSize || detailBatch.length > 1 || (() => {
      const vids = new Set(detailBatch.map(x => x.variantId ?? ''));
      return vids.size > 1;
    })();
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
        workers,
        equipment,
      }),
    [productionLinkMode, detailBatch, records, orders, products, globalNodes, workers, equipment],
  );

  if (!first) return null;

  const handleSave = () => {
    if (!onUpdateRecord || !editing) return;
    const f = editing.form;
    const tsStr = f.timestamp ? timestampFromDatetimeLocal(f.timestamp) : nowTimestamp();
    const opName = (workers?.find(w => w.id === f.workerId)?.name) ?? f.operator;
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
        workerId: f.workerId || undefined,
        equipmentId: f.equipmentId || undefined,
        unitPrice: f.unitPrice > 0 ? f.unitPrice : undefined,
        amount: f.unitPrice > 0 ? newQty * f.unitPrice : undefined,
        ...(rec.type === 'REWORK_REPORT' ? { collabData: collabMerged } : {}),
      });
    });
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

  const handleDelete = () => {
    void confirm({ message: '确定要删除该返工单的所有记录吗？此操作不可恢复。', danger: true }).then((ok) => {
      if (!ok || !onDeleteRecord) return;
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
    });
  };

  /** 无颜色尺码且仅一条明细：数量区用单行四列（产品｜数量｜单价｜金额），与进销存无规格行一致 */
  const noMatrixSingleRowEdit =
    editing && !hasColorSize && editing.form.rowEdits.length === 1 ? editing.form.rowEdits[0]! : null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
            {productionLinkMode === 'product'
              ? <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{product?.name ?? '—'}</span>
              : <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{order?.orderNumber ?? '—'}</span>
            }
            {isReportDetail ? '返工报工流水详情' : '返工详情'}
          </h3>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">取消</button>
                <button type="button" onClick={handleSave} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700">
                  <Check className="w-4 h-4" /> 保存
                </button>
              </>
            ) : (
              <>
                {isReportDetail && (
                  <OrderCenterDetailPrintBlock
                    printSlot={reworkFormSettings?.reworkCenterPrint?.reworkReportFlowDetail}
                    printTemplates={printTemplates}
                    buildContext={buildPrintContext}
                    onAddPrintTemplate={onOpenReworkFormPrintTab}
                    pickerSubtitle={`返工报工流水 ${first.docNo ?? '—'}`}
                  />
                )}
                {onUpdateRecord && detailBatch.length > 0 && hasOpsPerm(tenantRole, userPermissions, 'production:rework_report_records:edit') && (
                  <button
                    type="button"
                    onClick={() => {
                      const rec = detailBatch[0];
                      let dt = new Date(rec.timestamp || undefined);
                      if (isNaN(dt.getTime())) dt = new Date();
                      const tsStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
                      const snap =
                        rec.type === 'REWORK_REPORT'
                          ? { ...readReworkReportCustomSnapshot(records, rec.docNo, rec.productId) }
                          : {};
                      setEditing({
                        firstRecord: rec,
                        form: {
                          timestamp: tsStr,
                          operator: rec.operator ?? '',
                          workerId: rec.workerId ?? '',
                          equipmentId: rec.equipmentId ?? '',
                          reason: rec.reason ?? '',
                          unitPrice: rec.unitPrice ?? 0,
                          customData: snap,
                          rowEdits: groupProductionOpBatchByVariant(detailBatch, product).map(g => ({
                            variantId: g.variantId,
                            label: g.label,
                            quantity: g.quantity,
                            recordIds: [...g.recordIds],
                          })),
                        },
                      });
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
                  >
                    <Pencil className="w-4 h-4" /> 编辑
                  </button>
                )}
                {onDeleteRecord && hasOpsPerm(tenantRole, userPermissions, 'production:rework_report_records:delete') && (
                  <button type="button" onClick={handleDelete} className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-bold">
                    <Trash2 className="w-4 h-4" /> 删除
                  </button>
                )}
              </>
            )}
            <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {hasColorSize ? <h2 className="text-xl font-bold text-slate-900">{product?.name ?? first.productId ?? '—'}</h2> : null}
          {editing ? (
            <div className={psiOrderBillFormSectionStackClass}>
              <div className="space-y-4">
                <div className="flex items-center gap-2.5 border-b border-slate-200 pb-2.5">
                  <div className={psiOrderBillFormSectionIconIndigoClass}><FileText className="w-4 h-4" /></div>
                  <h3 className={sectionTitleClass}>1. 基础信息</h3>
                </div>
                <div className={`grid grid-cols-1 md:grid-cols-2 ${psiOrderBillFormGridGapClass}`}>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">返工时间</label>
                    <input
                      type="datetime-local"
                      value={editing.form.timestamp}
                      onChange={e => setEditing(prev => prev ? { ...prev, form: { ...prev.form, timestamp: e.target.value } } : prev)}
                      className={psiOrderBillFormFieldControlClass}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">操作人</label>
                    <input
                      type="text"
                      value={editing.form.operator}
                      onChange={e => setEditing(prev => prev ? { ...prev, form: { ...prev.form, operator: e.target.value } } : prev)}
                      className={psiOrderBillFormFieldControlClass}
                      placeholder="操作人"
                    />
                  </div>
                  {workers && workers.length > 0 && (
                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">报工人员</label>
                      <WorkerSelector
                        options={workers.filter((w: Worker) => w.status === 'ACTIVE').map((w: Worker) => ({ id: w.id, name: w.name, sub: w.groupName, assignedMilestoneIds: w.assignedMilestoneIds }))}
                        processNodes={globalNodes}
                        currentNodeId={first.nodeId ?? ''}
                        value={editing.form.workerId}
                        onChange={(id) => { const w = workers.find(wx => wx.id === id); setEditing(prev => prev ? { ...prev, form: { ...prev.form, workerId: id, operator: w?.name ?? prev.form.operator } } : prev); }}
                        placeholder="选择报工人员..."
                        variant="default"
                      />
                    </div>
                  )}
                  {equipmentFeaturesOn &&
                    equipment &&
                    equipment.length > 0 &&
                    globalNodes.find(n => n.id === first.nodeId)?.enableEquipmentOnReport && (
                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">设备</label>
                      <EquipmentSelector
                        options={equipment.map((e: { id: string; name: string; code?: string; assignedMilestoneIds?: string[] }) => ({ id: e.id, name: e.name, sub: e.code, assignedMilestoneIds: e.assignedMilestoneIds }))}
                        processNodes={globalNodes}
                        currentNodeId={first.nodeId ?? ''}
                        value={editing.form.equipmentId}
                        onChange={(id) => setEditing(prev => prev ? { ...prev, form: { ...prev.form, equipmentId: id } } : prev)}
                        placeholder="选择设备..."
                        variant="default"
                      />
                    </div>
                  )}
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">原因/备注</label>
                    <input
                      type="text"
                      value={editing.form.reason}
                      onChange={e => setEditing(prev => prev ? { ...prev, form: { ...prev.form, reason: e.target.value } } : prev)}
                      className={psiOrderBillFormFieldControlClass}
                      placeholder="选填"
                    />
                  </div>
                </div>
              </div>
              {isReportDetail && reworkReportFieldsForDetail.length > 0 && (
                <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                  <div className="flex items-center gap-2.5 border-b border-slate-200 pb-2.5">
                    <div className={psiOrderBillFormSectionIconIndigoClass}><FileText className="w-4 h-4" /></div>
                    <div className="space-y-1">
                      <h3 className={sectionTitleClass}>3. 备注与扩展</h3>
                      <p className="text-[11px] font-bold text-slate-500">返工报工自定义（本批次共用）</p>
                    </div>
                  </div>
                  {reworkReportFieldsForDetail.map(cf => (
                    <div key={cf.id} className="space-y-1">
                      <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">{cf.label}</label>
                      <PlanFormCustomFieldInput
                        cf={cf}
                        value={editing.form.customData[cf.id]}
                        onChange={v =>
                          setEditing(prev =>
                            prev ? { ...prev, form: { ...prev.form, customData: { ...prev.form.customData, [cf.id]: v } } } : prev,
                          )
                        }
                        dictionaries={dictionaries}
                        controlClassName={psiOrderBillFormFieldControlClass}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className={psiOrderBillFormDetailSplitClass}>
                <div className="flex items-center gap-2.5 border-b border-slate-200 pb-2.5">
                  <div className={psiOrderBillFormSectionIconEmeraldClass}><Layers className="w-4 h-4" /></div>
                  <h3 className={sectionTitleClass}>2. 数量明细</h3>
                </div>
                <div className="mt-3 space-y-4">
                  {!noMatrixSingleRowEdit ? (
                    <div className="flex flex-wrap items-end gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">单价（元/件）</label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={editing.form.unitPrice || ''}
                          onChange={e => setEditing(prev => prev ? { ...prev, form: { ...prev.form, unitPrice: Number(e.target.value) || 0 } } : prev)}
                          placeholder="0"
                          className="h-11 w-[6.5rem] rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 text-right outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">金额（元）</label>
                        <div className="h-11 min-w-[6.5rem] rounded-xl border border-slate-100 bg-slate-50 px-3 text-sm font-bold text-slate-700 flex items-center justify-center tabular-nums">
                          {(editing.form.rowEdits.reduce((s, r) => s + r.quantity, 0) * (editing.form.unitPrice || 0)).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {hasColorSize && reworkFlowMatrixProduct && dictionaries ? (
                    <div className="space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">数量明细（有颜色尺码）</p>
                      {editing.form.rowEdits.some(r => !r.variantId) ? (
                        <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-3 space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-600">未分规格</label>
                          <div className="flex flex-wrap items-end gap-2">
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
                              className={`${psiOrderBillFormFieldControlClass} max-w-[8rem] text-indigo-600 font-bold`}
                              placeholder="0"
                            />
                            <span className="pb-2 text-[10px] font-medium text-slate-500">{unitName}</span>
                          </div>
                        </div>
                      ) : null}
                      {(() => {
                        const vars = (product?.variants ?? []).filter(v =>
                          editing.form.rowEdits.some(r => r.variantId === v.id),
                        );
                        if (vars.length === 0) return null;
                        const matrixProd = { ...product!, variants: vars, colorIds: undefined, sizeIds: undefined } as Product;
                        return (
                          <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
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
                              inputClassName="h-11 w-[3.25rem] shrink-0 rounded-xl border border-slate-200 bg-white px-2 text-left text-sm font-bold text-indigo-600 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200 tabular-nums"
                            />
                          </div>
                        );
                      })()}
                      {editing.form.unitPrice > 0 ? (
                        <div className="rounded-xl border border-slate-100 bg-slate-50/80 overflow-hidden">
                          <table className="w-full text-left text-sm">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-50">
                                <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase">规格</th>
                                <th className="px-3 py-2 text-right text-[10px] font-black text-slate-500 uppercase">金额（元）</th>
                              </tr>
                            </thead>
                            <tbody>
                              {editing.form.rowEdits.map(rowEdit => (
                                <tr key={rowEdit.variantId || '_none'} className="border-b border-slate-100">
                                  <td className="px-3 py-2 text-slate-800">{rowEdit.label}</td>
                                  <td className="px-3 py-2 text-right font-bold text-amber-600 tabular-nums">
                                    {(rowEdit.quantity * editing.form.unitPrice).toFixed(2)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                      <div className="flex justify-end rounded-xl border border-indigo-100 bg-indigo-50/80 px-3 py-2 text-sm font-bold text-indigo-700 tabular-nums">
                        合计 {editing.form.rowEdits.reduce((s, r) => s + r.quantity, 0)} {unitName}
                        {editing.form.unitPrice > 0 ? (
                          <span className="ml-3 text-amber-700">
                            · {(editing.form.rowEdits.reduce((s, r) => s + r.quantity, 0) * editing.form.unitPrice).toFixed(2)} 元
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : noMatrixSingleRowEdit ? (
                    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 shadow-sm">
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">产品</label>
                          <div
                            className="flex min-h-[2.75rem] items-center rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 truncate"
                            title={product?.name ?? first.productId ?? '—'}
                          >
                            {product?.name ?? first.productId ?? '—'}
                          </div>
                        </div>
                        <div className="w-28 shrink-0 space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">数量</label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              value={noMatrixSingleRowEdit.quantity === 0 ? '' : noMatrixSingleRowEdit.quantity}
                              onChange={e => {
                                const v = Math.max(0, Number(e.target.value) || 0);
                                setEditing(prev =>
                                  prev
                                    ? {
                                        ...prev,
                                        form: {
                                          ...prev.form,
                                          rowEdits: prev.form.rowEdits.map(r =>
                                            r.variantId === noMatrixSingleRowEdit.variantId ? { ...r, quantity: v } : r,
                                          ),
                                        },
                                      }
                                    : prev,
                                );
                              }}
                              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-sm font-bold text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums"
                              placeholder="0"
                            />
                            <span className="shrink-0 text-[10px] font-bold text-slate-400">{unitName}</span>
                          </div>
                        </div>
                        <div className="w-28 shrink-0 space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">单价（元）</label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={editing.form.unitPrice || ''}
                            onChange={e => setEditing(prev => prev ? { ...prev, form: { ...prev.form, unitPrice: Number(e.target.value) || 0 } } : prev)}
                            placeholder="0"
                            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-sm font-bold text-slate-800 text-right outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums"
                          />
                        </div>
                        <div className="w-28 shrink-0 space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">金额（元）</label>
                          <div className="rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-right text-sm font-black text-indigo-600 tabular-nums">
                            {(noMatrixSingleRowEdit.quantity * (editing.form.unitPrice || 0)).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/40 overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                            {editing.form.unitPrice > 0 && (
                              <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">金额</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {editing.form.rowEdits.map(rowEdit => (
                            <tr key={rowEdit.variantId || '_none'} className="border-b border-slate-100">
                              <td className="px-4 py-3 text-slate-800">{rowEdit.label}</td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1">
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
                                    className="h-11 w-24 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums"
                                  />
                                  <span className="text-[10px] font-bold text-slate-400">{unitName}</span>
                                </div>
                              </td>
                              {editing.form.unitPrice > 0 && (
                                <td className="px-4 py-3 font-bold text-amber-600 text-right tabular-nums">
                                  {(rowEdit.quantity * editing.form.unitPrice).toFixed(2)}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className={psiOrderBillFormSectionStackClass}>
                <div className="flex items-center gap-2.5 border-b border-slate-200 pb-2.5">
                  <div className={psiOrderBillFormSectionIconIndigoClass}><FileText className="w-4 h-4" /></div>
                  <h3 className={sectionTitleClass}>1. 基础信息</h3>
                </div>
                <div
                  className={
                    hasColorSize
                      ? 'flex flex-wrap gap-4'
                      : `grid grid-cols-2 ${psiOrderBillFormGridGapClass} rounded-xl border border-slate-200 bg-slate-50/40 px-3 py-3 sm:grid-cols-3 sm:px-4`
                  }
                >
                  {!hasColorSize && (
                    <div className={hasColorSize ? 'bg-slate-50 rounded-xl px-4 py-2' : ''}>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-0.5">产品</p>
                      <p className="text-xs sm:text-sm font-bold text-slate-900 truncate" title={product?.name ?? first.productId ?? '—'}>{product?.name ?? first.productId ?? '—'}</p>
                    </div>
                  )}
                  <div className={`min-w-0 max-w-full ${hasColorSize ? 'bg-slate-50 rounded-xl px-4 py-2' : ''}`}>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-0.5">工序</p>
                    <p className="text-xs sm:text-sm font-bold text-slate-800 break-words" title={nodeNamesLabel}>{nodeNamesLabel}</p>
                  </div>
                  <div className={hasColorSize ? 'bg-slate-50 rounded-xl px-4 py-2' : ''}>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-0.5">来源工序</p>
                    <p className="text-xs sm:text-sm font-bold text-slate-800">
                      {sourceNodeName ?? (first.sourceNodeId ? globalNodes.find(n => n.id === first.sourceNodeId)?.name : null) ?? '—'}
                    </p>
                  </div>
                  <div className={hasColorSize ? 'bg-slate-50 rounded-xl px-4 py-2' : ''}>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-0.5">返工数量</p>
                    <p className="text-xs sm:text-sm font-bold text-indigo-600 tabular-nums">{totalQty} {unitName}</p>
                  </div>
                  <div className={hasColorSize ? 'bg-slate-50 rounded-xl px-4 py-2' : ''}>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-0.5">返工时间</p>
                    <p className="text-xs sm:text-sm font-bold text-slate-800">{formatTimestamp(latestBatchTimestamp)}</p>
                  </div>
                  <div className={`min-w-0 max-w-full ${hasColorSize ? 'bg-slate-50 rounded-xl px-4 py-2' : ''}`}>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-0.5">操作人</p>
                    <p className="text-xs sm:text-sm font-bold text-slate-800 break-words" title={operatorsLabel}>{operatorsLabel}</p>
                  </div>
                  {productionLinkMode !== 'product' && order?.orderNumber && !hasColorSize ? (
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-0.5">工单号</p>
                      <p className="text-xs sm:text-sm font-bold text-slate-800 tabular-nums">{order.orderNumber}</p>
                    </div>
                  ) : null}
                  {first.reason && (
                    <div className={hasColorSize ? 'bg-slate-50 rounded-xl px-4 py-2' : 'col-span-2 sm:col-span-3'}>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-0.5">原因/备注</p>
                      <p className="text-xs sm:text-sm font-bold text-slate-800">{first.reason}</p>
                    </div>
                  )}
                  {batchTotalAmount > 0 && (
                    <>
                      <div className={hasColorSize ? 'bg-slate-50 rounded-xl px-4 py-2' : ''}>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-0.5">单价（元/件）</p>
                        <p className="text-xs sm:text-sm font-bold text-slate-800 tabular-nums">{unitPriceLabel != null ? unitPriceLabel.toFixed(2) : '—'}</p>
                      </div>
                      <div className={hasColorSize ? 'bg-amber-50 rounded-xl px-4 py-2' : 'rounded-lg border border-amber-100 bg-amber-50/90 px-3 py-2'}>
                        <p className="text-[9px] font-black text-amber-600 uppercase tracking-wide mb-0.5">金额（元）</p>
                        <p className="text-xs sm:text-sm font-bold text-amber-600 tabular-nums">{batchTotalAmount.toFixed(2)}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
              {isReportDetail && reworkReportFieldsForDetail.length > 0 && (
                <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                  <div className="flex items-center gap-2.5 border-b border-slate-200 pb-2.5">
                    <div className={psiOrderBillFormSectionIconIndigoClass}><FileText className="w-4 h-4" /></div>
                    <div className="space-y-1">
                      <h3 className={sectionTitleClass}>3. 备注与扩展</h3>
                      <p className="text-[11px] font-bold text-slate-500">返工报工自定义（本批次共用）</p>
                    </div>
                  </div>
                  {reworkReportFieldsForDetail.map(cf => (
                    <div key={cf.id} className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{cf.label}</p>
                      <PlanFormCustomFieldReadonly cf={cf} value={reworkReportCustomSnapshot[cf.id]} />
                    </div>
                  ))}
                </div>
              )}
              {showSpecTable && (
                <div className={psiOrderBillFormDetailSplitClass}>
                  <div className="flex items-center gap-2.5 border-b border-slate-200 pb-2.5">
                    <div className={psiOrderBillFormSectionIconEmeraldClass}><Layers className="w-4 h-4" /></div>
                    <h3 className={sectionTitleClass}>2. 数量明细</h3>
                  </div>
                  {hasColorSize && reworkFlowMatrixProduct && dictionaries ? (
                    <div className="mt-3 space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">数量明细（有颜色尺码）</p>
                      {undiffDisplayRow ? (
                        <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">未分规格</p>
                          <p className="text-lg font-bold text-indigo-600 tabular-nums">{undiffDisplayRow.quantity} {unitName}</p>
                        </div>
                      ) : null}
                      <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                        <VariantQtyMatrixInputs
                          readOnly
                          product={reworkFlowMatrixProduct}
                          dictionaries={dictionaries}
                          quantities={variantQtyFromDisplayRows}
                        />
                      </div>
                      {batchTotalAmount > 0 ? (
                        <div className="rounded-xl border border-slate-100 bg-slate-50/80 overflow-hidden">
                          <table className="w-full text-left text-sm">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-50">
                                <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase">规格</th>
                                <th className="px-3 py-2 text-right text-[10px] font-black text-slate-500 uppercase">金额（元）</th>
                              </tr>
                            </thead>
                            <tbody>
                              {displayVariantRows.map(vr => (
                                <tr key={vr.variantId || '_none'} className="border-b border-slate-100">
                                  <td className="px-3 py-2 text-slate-800">{vr.label}</td>
                                  <td className="px-3 py-2 text-right font-bold text-amber-600 tabular-nums">
                                    {vr.lineAmount > 0 ? vr.lineAmount.toFixed(2) : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                                <td className="px-3 py-2">合计</td>
                                <td className="px-3 py-2 text-right text-amber-700 tabular-nums">{batchTotalAmount.toFixed(2)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      ) : null}
                      <div className="flex justify-end rounded-xl border border-indigo-100 bg-indigo-50/80 px-3 py-2 text-sm font-bold text-indigo-700 tabular-nums">
                        合计 {totalQty} {unitName}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/40 overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            {hasColorSize ? (
                              <>
                                <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase">规格</th>
                                <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                              </>
                            ) : (
                              <>
                                <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase">产品</th>
                                <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                              </>
                            )}
                            {batchTotalAmount > 0 && (
                              <th className="px-3 py-2.5 sm:px-4 text-[10px] font-black text-slate-500 uppercase text-right">金额</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {displayVariantRows.map(vr => (
                            <tr key={vr.variantId || '_none'} className="border-b border-slate-100">
                              {hasColorSize ? (
                                <td className="px-3 py-2.5 sm:px-4 text-slate-800">{vr.label}</td>
                              ) : (
                                <td className="px-3 py-2.5 sm:px-4 align-middle min-w-0 max-w-[14rem]">
                                  <span className="text-sm sm:text-base font-bold text-slate-900 leading-tight block truncate" title={product?.name ?? first.productId ?? '—'}>
                                    {product?.name ?? first.productId ?? '—'}
                                  </span>
                                  {productionLinkMode !== 'product' && order?.orderNumber ? (
                                    <span className="mt-0.5 block text-[10px] sm:text-[11px] font-medium text-slate-500 truncate">
                                      工单 <span className="font-bold text-slate-600 tabular-nums">{order.orderNumber}</span>
                                    </span>
                                  ) : null}
                                </td>
                              )}
                              <td className="px-3 py-2.5 sm:px-4 font-bold text-indigo-600 text-right tabular-nums">{vr.quantity} {unitName}</td>
                              {batchTotalAmount > 0 && (
                                <td className="px-3 py-2.5 sm:px-4 font-bold text-amber-600 text-right tabular-nums">
                                  {vr.lineAmount > 0 ? vr.lineAmount.toFixed(2) : '—'}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                            <td className="px-3 py-2.5 sm:px-4">合计</td>
                            <td className="px-3 py-2.5 sm:px-4 text-indigo-600 text-right tabular-nums">{totalQty} {unitName}</td>
                            {batchTotalAmount > 0 && (
                              <td className="px-3 py-2.5 sm:px-4 text-amber-600 text-right tabular-nums">{batchTotalAmount.toFixed(2)}</td>
                            )}
                          </tr>
                        </tfoot>
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
      </div>
    </div>
  );
};

export default React.memo(ReworkReportFlowDetailModal);
