import React, { useState } from 'react';
import { X, Check, Pencil, Trash2 } from 'lucide-react';
import { ProductionOpRecord, ProductionOrder, Product, GlobalNodeTemplate, AppDictionaries } from '../../types';
import { hasOpsPerm } from './types';
import { useConfirm } from '../../contexts/ConfirmContext';

export interface DefectTreatmentFlowDetailModalProps {
  productionLinkMode: 'order' | 'product';
  defectFlowDetailRecord: ProductionOpRecord;
  records: ProductionOpRecord[];
  orders: ProductionOrder[];
  products: Product[];
  globalNodes: GlobalNodeTemplate[];
  dictionaries?: AppDictionaries;
  userPermissions?: string[];
  tenantRole?: string;
  onUpdateRecord?: (record: ProductionOpRecord) => void;
  onDeleteRecord?: (recordId: string) => void;
  onClose: () => void;
}

const DefectTreatmentFlowDetailModal: React.FC<DefectTreatmentFlowDetailModalProps> = ({
  productionLinkMode,
  defectFlowDetailRecord,
  records,
  orders,
  products,
  globalNodes,
  dictionaries,
  userPermissions,
  tenantRole,
  onUpdateRecord,
  onDeleteRecord,
  onClose,
}) => {
  const confirm = useConfirm();
  const r = defectFlowDetailRecord;
  const detailBatch = r.type === 'REWORK' && r.docNo
    ? (records || []).filter((x): x is ProductionOpRecord => x.type === 'REWORK' && x.orderId === r.orderId && x.docNo === r.docNo)
    : r.type === 'SCRAP' && r.docNo
      ? (records || []).filter((x): x is ProductionOpRecord => x.type === 'SCRAP' && x.orderId === r.orderId && x.docNo === r.docNo)
      : [r];
  const first = detailBatch[0];

  const [editing, setEditing] = useState<{ form: { timestamp: string; operator: string; reason: string; rowEdits: { recordId: string; quantity: number }[] }; firstRecord: ProductionOpRecord } | null>(null);

  if (!first) return null;
  const order = orders.find(o => o.id === first.orderId);
  const product = products.find(p => p.id === first.productId);
  const unitName = (product?.unitId && dictionaries?.units?.find(u => u.id === product.unitId)?.name) || '件';
  const sourceNodeId = first.type === 'REWORK' ? (first.sourceNodeId ?? first.nodeId) : first.nodeId;
  const sourceNodeName = sourceNodeId ? globalNodes.find(n => n.id === sourceNodeId)?.name ?? sourceNodeId : '—';
  const totalQty = detailBatch.reduce((s, x) => s + (x.quantity ?? 0), 0);
  const hasColorSize = Boolean(product?.variants?.length);
  const getVariantLabel = (rec: ProductionOpRecord) => { if (!rec.variantId) return '未分规格'; const v = product?.variants?.find((x: { id: string; skuSuffix?: string }) => x.id === rec.variantId); return (v as { skuSuffix?: string })?.skuSuffix ?? rec.variantId; };
  const typeLabel = first.type === 'REWORK' ? '返工' : '报损';

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
            处理不良品详情
          </h3>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">取消</button>
                <button type="button" onClick={() => {
                  if (!onUpdateRecord || !editing) return;
                  const tsStr = editing.form.timestamp ? (() => { const d = new Date(editing.form.timestamp); return isNaN(d.getTime()) ? new Date().toLocaleString() : d.toLocaleString(); })() : new Date().toLocaleString();
                  editing.form.rowEdits.forEach(row => { const rec = detailBatch.find(x => x.id === row.recordId); if (!rec) return; onUpdateRecord({ ...rec, quantity: Math.max(0, row.quantity), timestamp: tsStr, operator: editing.form.operator, reason: editing.form.reason || undefined }); });
                  setEditing(null); onClose();
                }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700"><Check className="w-4 h-4" /> 保存</button>
              </>
            ) : (
              <>
                {onUpdateRecord && detailBatch.length > 0 && hasOpsPerm(tenantRole, userPermissions, 'production:rework_records:edit') && (
                  <button type="button" onClick={() => { const rec = detailBatch[0]; let dt = new Date(rec.timestamp || undefined); if (isNaN(dt.getTime())) dt = new Date(); const tsStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`; setEditing({ firstRecord: rec, form: { timestamp: tsStr, operator: rec.operator ?? '', reason: rec.reason ?? '', rowEdits: detailBatch.map(x => ({ recordId: x.id, quantity: x.quantity ?? 0 })) } }); }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"><Pencil className="w-4 h-4" /> 编辑</button>
                )}
                {onDeleteRecord && hasOpsPerm(tenantRole, userPermissions, 'production:rework_records:delete') && (
                  <button type="button" onClick={() => { void confirm({ message: '确定删除该记录？', danger: true }).then((ok) => { if (!ok) return; detailBatch.forEach(x => onDeleteRecord(x.id)); onClose(); }); }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-rose-600 bg-rose-50 hover:bg-rose-100"><Trash2 className="w-4 h-4" /> 删除</button>
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
                <div className="bg-slate-50 rounded-xl px-4 py-2"><p className="text-[10px] text-slate-400 font-bold uppercase mb-1">时间</p><input type="datetime-local" value={editing.form.timestamp} onChange={e => setEditing(prev => prev ? { ...prev, form: { ...prev.form, timestamp: e.target.value } } : prev)} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200" /></div>
                <div className="bg-slate-50 rounded-xl px-4 py-2"><p className="text-[10px] text-slate-400 font-bold uppercase mb-1">操作人</p><input type="text" value={editing.form.operator} onChange={e => setEditing(prev => prev ? { ...prev, form: { ...prev.form, operator: e.target.value } } : prev)} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200" placeholder="操作人" /></div>
                <div className="bg-slate-50 rounded-xl px-4 py-2 col-span-2"><p className="text-[10px] text-slate-400 font-bold uppercase mb-1">原因/备注</p><input type="text" value={editing.form.reason} onChange={e => setEditing(prev => prev ? { ...prev, form: { ...prev.form, reason: e.target.value } } : prev)} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200" placeholder="选填" /></div>
              </div>
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格</th><th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th></tr></thead>
                  <tbody>
                    {editing.form.rowEdits.map((rowEdit) => { const rec = detailBatch.find(x => x.id === rowEdit.recordId); if (!rec) return null; return (
                      <tr key={rec.id} className="border-b border-slate-100"><td className="px-4 py-3 text-slate-800">{getVariantLabel(rec)}</td><td className="px-4 py-3 text-right"><input type="number" min={0} value={rowEdit.quantity} onChange={e => { const v = Math.max(0, Number(e.target.value) || 0); setEditing(prev => prev ? { ...prev, form: { ...prev.form, rowEdits: prev.form.rowEdits.map(re => re.recordId === rec.id ? { ...re, quantity: v } : re) } } : prev); }} className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200" /><span className="text-slate-600 text-sm ml-1">{unitName}</span></td></tr>
                    ); })}
                  </tbody>
                  <tfoot><tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold"><td className="px-4 py-3">合计</td><td className="px-4 py-3 text-indigo-600 text-right">{editing.form.rowEdits.reduce((s, r) => s + r.quantity, 0)} {unitName}</td></tr></tfoot>
                </table>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-4">
                <div className="bg-slate-50 rounded-xl px-4 py-2"><p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">类型</p><p className="text-sm font-bold text-slate-800">{typeLabel}</p></div>
                <div className="bg-slate-50 rounded-xl px-4 py-2"><p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">来源工序</p><p className="text-sm font-bold text-slate-800">{sourceNodeName}</p></div>
                <div className="bg-slate-50 rounded-xl px-4 py-2"><p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">数量</p><p className="text-sm font-bold text-indigo-600">{totalQty} {unitName}</p></div>
                <div className="bg-slate-50 rounded-xl px-4 py-2"><p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">时间</p><p className="text-sm font-bold text-slate-800">{first.timestamp || '—'}</p></div>
                <div className="bg-slate-50 rounded-xl px-4 py-2"><p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">操作人</p><p className="text-sm font-bold text-slate-800">{first.operator ?? '—'}</p></div>
                {first.reason && (<div className="bg-slate-50 rounded-xl px-4 py-2"><p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">原因/备注</p><p className="text-sm font-bold text-slate-800">{first.reason}</p></div>)}
              </div>
              {(detailBatch.length > 1 || hasColorSize) && (
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格</th><th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th></tr></thead>
                    <tbody>{detailBatch.map(rec => (<tr key={rec.id} className="border-b border-slate-100"><td className="px-4 py-3 text-slate-800">{getVariantLabel(rec)}</td><td className="px-4 py-3 font-bold text-indigo-600 text-right">{rec.quantity ?? 0} {unitName}</td></tr>))}</tbody>
                    <tfoot><tr className="bg-indigo-50/80 border-t-2 border-indigo-200 font-bold"><td className="px-4 py-3">合计</td><td className="px-4 py-3 text-indigo-600 text-right">{totalQty} {unitName}</td></tr></tfoot>
                  </table>
                </div>
              )}
              {first.type === 'REWORK' && (first.reworkNodeIds?.length ?? 0) > 0 && (
                <div className="text-sm"><span className="text-slate-400 font-bold">返工目标工序</span><p className="text-slate-800 mt-1">{first.reworkNodeIds!.map(nid => globalNodes.find(n => n.id === nid)?.name ?? nid).join('、')}</p></div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(DefectTreatmentFlowDetailModal);
