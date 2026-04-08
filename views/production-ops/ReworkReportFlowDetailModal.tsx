import React, { useState, useMemo } from 'react';
import { X, Check, Pencil, Trash2 } from 'lucide-react';
import { ProductionOpRecord, ProductionOrder, Product, GlobalNodeTemplate, AppDictionaries, Worker } from '../../types';
import { hasOpsPerm } from './types';
import { formatTimestamp, timestampFromDatetimeLocal, nowTimestamp } from '../../utils/formatTime';
import { useConfirm } from '../../contexts/ConfirmContext';
import WorkerSelector from '../../components/WorkerSelector';
import EquipmentSelector from '../../components/EquipmentSelector';

export interface ReworkReportFlowDetailModalProps {
  productionLinkMode: 'order' | 'product';
  reworkFlowDetailRecord: ProductionOpRecord;
  records: ProductionOpRecord[];
  orders: ProductionOrder[];
  products: Product[];
  globalNodes: GlobalNodeTemplate[];
  dictionaries?: AppDictionaries;
  workers: Worker[];
  equipment: { id: string; name: string; code?: string; assignedMilestoneIds?: string[] }[];
  userPermissions?: string[];
  tenantRole?: string;
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
  globalNodes,
  dictionaries,
  workers,
  equipment,
  userPermissions,
  tenantRole,
  onUpdateRecord,
  onDeleteRecord,
  onClose,
}) => {
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
    form: { timestamp: string; operator: string; workerId: string; equipmentId: string; reason: string; unitPrice: number; rowEdits: { recordId: string; quantity: number }[] };
    firstRecord: ProductionOpRecord;
  } | null>(null);

  if (!first) return null;
  const order = orders.find(o => o.id === first.orderId);
  const product = products.find(p => p.id === first.productId);
  const unitName = (product?.unitId && dictionaries?.units?.find(u => u.id === product.unitId)?.name) || '件';
  const reworkOrigin = (records || []).find(x => x.type === 'REWORK' && (x.orderId === first.orderId || (orders.find(o => o.id === first.orderId)?.parentOrderId === x.orderId)) && ((x.reworkNodeIds?.length ? x.reworkNodeIds : x.nodeId ? [x.nodeId] : []).includes(first.nodeId ?? '')));
  const resolvedSourceNodeId = (reworkOrigin?.sourceNodeId != null ? reworkOrigin.sourceNodeId : first.sourceNodeId) ?? undefined;
  const sourceNodeName = resolvedSourceNodeId ? globalNodes.find(n => n.id === resolvedSourceNodeId)?.name : null;
  const totalQty = detailBatch.reduce((s, x) => s + (x.quantity ?? 0), 0);
  const hasColorSize = Boolean(product?.variants?.length);
  const getVariantLabel = (rec: ProductionOpRecord) => {
    if (!rec.variantId) return '未分规格';
    const v = product?.variants?.find((x: { id: string; skuSuffix?: string }) => x.id === rec.variantId);
    return (v as { skuSuffix?: string })?.skuSuffix ?? rec.variantId;
  };
  const nodeNamesInBatch = [...new Set(detailBatch.map(x => x.nodeId ? (globalNodes.find(n => n.id === x.nodeId)?.name ?? '') : '').filter(Boolean))] as string[];
  const nodeNamesLabel = nodeNamesInBatch.length === 0 ? '—' : nodeNamesInBatch.length === 1 ? nodeNamesInBatch[0]! : nodeNamesInBatch.join('、');
  const latestBatchTimestamp = detailBatch.reduce<{ t: number; ts?: string }>((best, x) => {
    const t = new Date(x.timestamp || 0).getTime();
    if (isNaN(t)) return best;
    return t >= best.t ? { t, ts: x.timestamp } : best;
  }, { t: -1 }).ts;
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
    const labelFor = (rec: ProductionOpRecord) => {
      if (!rec.variantId) return '未分规格';
      const v = product?.variants?.find((x: { id: string; skuSuffix?: string }) => x.id === rec.variantId);
      return (v as { skuSuffix?: string })?.skuSuffix ?? rec.variantId;
    };
    const byVariant = new Map<string, { variantId: string; label: string; quantity: number; lineAmount: number; recordIds: string[] }>();
    for (const rec of detailBatch) {
      const vid = rec.variantId ?? '';
      const q = rec.quantity ?? 0;
      const lineAmt =
        rec.amount != null && rec.amount > 0 ? rec.amount : (rec.unitPrice != null && rec.unitPrice > 0 ? q * rec.unitPrice : 0);
      const existing = byVariant.get(vid);
      if (existing) {
        existing.quantity += q;
        existing.lineAmount += lineAmt;
        existing.recordIds.push(rec.id);
      } else {
        byVariant.set(vid, {
          variantId: vid,
          label: labelFor(rec),
          quantity: q,
          lineAmount: lineAmt,
          recordIds: [rec.id],
        });
      }
    }
    return [...byVariant.values()];
  }, [detailBatch, product?.variants]);

  const handleSave = () => {
    if (!onUpdateRecord || !editing) return;
    const f = editing.form;
    const tsStr = f.timestamp ? timestampFromDatetimeLocal(f.timestamp) : nowTimestamp();
    const opName = (workers?.find(w => w.id === f.workerId)?.name) ?? f.operator;
    const reworkDeltas = new Map<string, { reworkId: string; nodeId: string; delta: number }>();
    f.rowEdits.forEach(row => {
      const rec = detailBatch.find(x => x.id === row.recordId);
      if (!rec) return;
      const newQty = Math.max(0, row.quantity);
      const oldQty = rec.quantity ?? 0;
      const delta = newQty - oldQty;
      if (delta !== 0 && rec.sourceReworkId && rec.nodeId) {
        const key = `${rec.sourceReworkId}|${rec.nodeId}`;
        const cur = reworkDeltas.get(key) ?? { reworkId: rec.sourceReworkId, nodeId: rec.nodeId, delta: 0 };
        cur.delta += delta;
        reworkDeltas.set(key, cur);
      }
      onUpdateRecord({ ...rec, quantity: newQty, timestamp: tsStr, operator: opName, reason: f.reason || undefined, workerId: f.workerId || undefined, equipmentId: f.equipmentId || undefined, unitPrice: f.unitPrice > 0 ? f.unitPrice : undefined, amount: f.unitPrice > 0 ? newQty * f.unitPrice : undefined });
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

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
            {productionLinkMode === 'product'
              ? <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{product?.name ?? '—'}</span>
              : <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{order?.orderNumber ?? '—'}</span>
            }
            返工详情
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
                {onUpdateRecord && detailBatch.length > 0 && hasOpsPerm(tenantRole, userPermissions, 'production:rework_report_records:edit') && (
                  <button
                    type="button"
                    onClick={() => {
                      const rec = detailBatch[0];
                      let dt = new Date(rec.timestamp || undefined);
                      if (isNaN(dt.getTime())) dt = new Date();
                      const tsStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
                      setEditing({
                        firstRecord: rec,
                        form: {
                          timestamp: tsStr,
                          operator: rec.operator ?? '',
                          workerId: rec.workerId ?? '',
                          equipmentId: rec.equipmentId ?? '',
                          reason: rec.reason ?? '',
                          unitPrice: rec.unitPrice ?? 0,
                          rowEdits: detailBatch.map(x => ({ recordId: x.id, quantity: x.quantity ?? 0 }))
                        }
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
          <h2 className="text-xl font-bold text-slate-900">{product?.name ?? first.productId ?? '—'}</h2>
          {editing ? (
            <>
              <div className="grid grid-cols-[1fr_1fr] gap-3">
                <div className="bg-slate-50 rounded-xl px-4 py-2">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">返工时间</p>
                  <input
                    type="datetime-local"
                    value={editing.form.timestamp}
                    onChange={e => setEditing(prev => prev ? { ...prev, form: { ...prev.form, timestamp: e.target.value } } : prev)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div className="bg-slate-50 rounded-xl px-4 py-2">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">操作人</p>
                  <input
                    type="text"
                    value={editing.form.operator}
                    onChange={e => setEditing(prev => prev ? { ...prev, form: { ...prev.form, operator: e.target.value } } : prev)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder="操作人"
                  />
                </div>
                {workers && workers.length > 0 && (
                  <div className="bg-slate-50 rounded-xl px-4 py-2 col-span-2">
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">报工人员</p>
                    <WorkerSelector
                      options={workers.filter((w: Worker) => w.status === 'ACTIVE').map((w: Worker) => ({ id: w.id, name: w.name, sub: w.groupName, assignedMilestoneIds: w.assignedMilestoneIds }))}
                      processNodes={globalNodes}
                      currentNodeId={first.nodeId ?? ''}
                      value={editing.form.workerId}
                      onChange={(id) => { const w = workers.find(wx => wx.id === id); setEditing(prev => prev ? { ...prev, form: { ...prev.form, workerId: id, operator: w?.name ?? prev.form.operator } } : prev); }}
                      placeholder="选择报工人员..."
                      variant="compact"
                    />
                  </div>
                )}
                {equipment && equipment.length > 0 && globalNodes.find(n => n.id === first.nodeId)?.enableEquipmentOnReport && (
                  <div className="bg-slate-50 rounded-xl px-4 py-2 col-span-2">
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">设备</p>
                    <EquipmentSelector
                      options={equipment.map((e: { id: string; name: string; code?: string; assignedMilestoneIds?: string[] }) => ({ id: e.id, name: e.name, sub: e.code, assignedMilestoneIds: e.assignedMilestoneIds }))}
                      processNodes={globalNodes}
                      currentNodeId={first.nodeId ?? ''}
                      value={editing.form.equipmentId}
                      onChange={(id) => setEditing(prev => prev ? { ...prev, form: { ...prev.form, equipmentId: id } } : prev)}
                      placeholder="选择设备..."
                      variant="compact"
                    />
                  </div>
                )}
                <div className="bg-slate-50 rounded-xl px-4 py-2 col-span-2">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">原因/备注</p>
                  <input
                    type="text"
                    value={editing.form.reason}
                    onChange={e => setEditing(prev => prev ? { ...prev, form: { ...prev.form, reason: e.target.value } } : prev)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder="选填"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">单价（元/件）</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={editing.form.unitPrice || ''}
                    onChange={e => setEditing(prev => prev ? { ...prev, form: { ...prev.form, unitPrice: Number(e.target.value) || 0 } } : prev)}
                    placeholder="0"
                    className="w-28 rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-center focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">金额（元）</label>
                  <div className="w-28 rounded-xl border border-slate-100 bg-slate-50 py-2 px-3 text-sm font-bold text-slate-700 text-center min-h-[40px] flex items-center justify-center">
                    {(editing.form.rowEdits.reduce((s, r) => s + r.quantity, 0) * (editing.form.unitPrice || 0)).toFixed(2)}
                  </div>
                </div>
              </div>
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
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
                    {detailBatch.map(rec => {
                      const rowEdit = editing.form.rowEdits.find(re => re.recordId === rec.id);
                      if (!rowEdit) return null;
                      return (
                        <tr key={rec.id} className="border-b border-slate-100">
                          <td className="px-4 py-3 text-slate-800">{getVariantLabel(rec)}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                min={0}
                                value={rowEdit.quantity}
                                onChange={e => {
                                  const v = Math.max(0, Number(e.target.value) || 0);
                                  setEditing(prev => prev ? { ...prev, form: { ...prev.form, rowEdits: prev.form.rowEdits.map(r => r.recordId === rec.id ? { ...r, quantity: v } : r) } } : prev);
                                }}
                                className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200"
                              />
                              <span className="text-slate-600 text-sm">{unitName}</span>
                            </div>
                          </td>
                          {editing.form.unitPrice > 0 && (
                            <td className="px-4 py-3 font-bold text-amber-600 text-right">{(rowEdit.quantity * editing.form.unitPrice).toFixed(2)}</td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                      <td className="px-4 py-3">合计</td>
                      <td className="px-4 py-3 text-indigo-600 text-right">{editing.form.rowEdits.reduce((s, r) => s + r.quantity, 0)} {unitName}</td>
                      {editing.form.unitPrice > 0 && (
                        <td className="px-4 py-3 text-amber-600 text-right">{(editing.form.rowEdits.reduce((s, r) => s + r.quantity, 0) * editing.form.unitPrice).toFixed(2)}</td>
                      )}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-4">
                <div className="bg-slate-50 rounded-xl px-4 py-2 min-w-0 max-w-full">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">工序</p>
                  <p className="text-sm font-bold text-slate-800 break-words" title={nodeNamesLabel}>{nodeNamesLabel}</p>
                </div>
                <div className="bg-slate-50 rounded-xl px-4 py-2">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">来源工序</p>
                  <p className="text-sm font-bold text-slate-800">{sourceNodeName ?? (first.sourceNodeId ? globalNodes.find(n => n.id === first.sourceNodeId)?.name : null) ?? '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl px-4 py-2">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">返工数量</p>
                  <p className="text-sm font-bold text-indigo-600">{totalQty} {unitName}</p>
                </div>
                <div className="bg-slate-50 rounded-xl px-4 py-2">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">返工时间</p>
                  <p className="text-sm font-bold text-slate-800">{formatTimestamp(latestBatchTimestamp)}</p>
                </div>
                <div className="bg-slate-50 rounded-xl px-4 py-2 min-w-0 max-w-full">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">操作人</p>
                  <p className="text-sm font-bold text-slate-800 break-words" title={operatorsLabel}>{operatorsLabel}</p>
                </div>
                {first.reason && (
                  <div className="bg-slate-50 rounded-xl px-4 py-2">
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">原因/备注</p>
                    <p className="text-sm font-bold text-slate-800">{first.reason}</p>
                  </div>
                )}
                {batchTotalAmount > 0 && (
                  <>
                    <div className="bg-slate-50 rounded-xl px-4 py-2">
                      <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">单价（元/件）</p>
                      <p className="text-sm font-bold text-slate-800">{unitPriceLabel != null ? unitPriceLabel.toFixed(2) : '—'}</p>
                    </div>
                    <div className="bg-amber-50 rounded-xl px-4 py-2">
                      <p className="text-[10px] text-amber-500 font-bold uppercase mb-0.5">金额（元）</p>
                      <p className="text-sm font-bold text-amber-600">{batchTotalAmount.toFixed(2)}</p>
                    </div>
                  </>
                )}
              </div>
              {showSpecTable && (
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                      {batchTotalAmount > 0 && (
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">金额</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {displayVariantRows.map(vr => (
                      <tr key={vr.variantId || '_none'} className="border-b border-slate-100">
                        <td className="px-4 py-3 text-slate-800">{vr.label}</td>
                        <td className="px-4 py-3 font-bold text-indigo-600 text-right">{vr.quantity} {unitName}</td>
                        {batchTotalAmount > 0 && (
                          <td className="px-4 py-3 font-bold text-amber-600 text-right">{vr.lineAmount > 0 ? vr.lineAmount.toFixed(2) : '—'}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold">
                      <td className="px-4 py-3">合计</td>
                      <td className="px-4 py-3 text-indigo-600 text-right">{totalQty} {unitName}</td>
                      {batchTotalAmount > 0 && (
                        <td className="px-4 py-3 text-amber-600 text-right">{batchTotalAmount.toFixed(2)}</td>
                      )}
                    </tr>
                  </tfoot>
                </table>
              </div>
              )}
              {(first.reworkNodeIds?.length ?? 0) > 0 && (
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
