import React, { useState, useEffect, useRef } from 'react';
import { Truck } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../../services/api';
import type { Product, ProductionOpRecord, AppDictionaries, Warehouse } from '../../types';
import { collabVariantKey, computeCollaborationReturnableRows } from './collabHelpers';
import type { CollabReturnRow } from './collabHelpers';

interface CollabReturnModalProps {
  open: boolean;
  onClose: () => void;
  transfer: any;
  warehouses: Warehouse[];
  products: Product[];
  prodRecords: ProductionOpRecord[];
  dictionaries: AppDictionaries;
  onReturned: () => Promise<void>;
}

const CollabReturnModal: React.FC<CollabReturnModalProps> = ({
  open, onClose, transfer, warehouses, products, prodRecords, dictionaries, onReturned,
}) => {
  const [returnRows, setReturnRows] = useState<CollabReturnRow[]>([]);
  const [returnNote, setReturnNote] = useState('');
  const [returnWarehouseId, setReturnWarehouseId] = useState('');
  const [returning, setReturning] = useState(false);

  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setReturnNote('');
      setReturnWarehouseId(warehouses[0]?.id ?? '');
    }
    prevOpenRef.current = open;
  }, [open, warehouses]);

  useEffect(() => {
    if (!open || !transfer) return;
    const rows = computeCollaborationReturnableRows(
      transfer,
      returnWarehouseId || undefined,
      products,
      prodRecords,
      dictionaries,
      warehouses.length > 0,
    );
    setReturnRows(rows.map(r => ({ ...r, qty: '' })));
  }, [open, returnWarehouseId, products, prodRecords, dictionaries, warehouses.length, transfer]);

  if (!open) return null;

  const submitReturn = async () => {
    if (!transfer) return;
    if (warehouses.length > 0 && !returnWarehouseId) {
      toast.warning('请选择出库仓库');
      return;
    }
    if (returnRows.length === 0) {
      toast.warning('所有规格已全部回传完毕，无剩余可回传数量');
      return;
    }
    for (const r of returnRows) {
      const q = Number(r.qty) || 0;
      if (q > r.maxReturnable) {
        toast.error(`「${[r.colorName, r.sizeName].filter(Boolean).join('/') || '无规格'}」超过可回传上限 ${r.maxReturnable}`);
        return;
      }
    }
    const items = returnRows
      .map(r => ({
        colorName: r.colorName,
        sizeName: r.sizeName,
        quantity: Number(r.qty) || 0,
      }))
      .filter(i => i.quantity > 0);
    if (items.length === 0) {
      toast.warning('请至少填写一行回传数量');
      return;
    }
    setReturning(true);
    try {
      await api.collaboration.createReturn(transfer.id, {
        items,
        note: returnNote || undefined,
        warehouseId: returnWarehouseId || undefined,
      });
      toast.success('回传提交成功（已自动从仓库出库）');
      onClose();
      await onReturned();
    } catch (err: any) {
      toast.error(err.message || '回传失败');
    } finally {
      setReturning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 p-4 space-y-4 max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Truck className="w-5 h-5 text-emerald-600" /> 提交回传</h3>
        <p className="text-xs text-slate-500">
          请先选择<strong>出库仓库</strong>，可回传 = 甲方发出总量 − 已回传总量，按颜色/尺码汇总。
        </p>
        {warehouses.length > 0 && (
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase block">出库仓库</label>
            <select
              value={returnWarehouseId}
              onChange={e => setReturnWarehouseId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">请选择仓库</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
              ))}
            </select>
          </div>
        )}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase">颜色</th>
                <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase">尺码</th>
                <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase text-right">可回</th>
                <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase w-24">本次</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {returnRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-amber-700 bg-amber-50/50 font-medium">
                    {!returnWarehouseId && warehouses.length > 0
                      ? '请先选择出库仓库'
                      : '无可回传数量（库存不足或已全部回传）。'}
                  </td>
                </tr>
              ) : (
                returnRows.map((row, idx) => (
                  <tr key={collabVariantKey(row)}>
                    <td className="px-3 py-2 font-bold text-slate-800">{row.colorName || '—'}</td>
                    <td className="px-3 py-2 font-bold text-slate-800">{row.sizeName || '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{row.maxReturnable}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        max={row.maxReturnable}
                        value={row.qty}
                        onChange={e => {
                          const v = e.target.value;
                          setReturnRows(prev => prev.map((r, i) => (i === idx ? { ...r, qty: v } : r)));
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="0"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase block">备注（可选）</label>
          <input
            type="text"
            value={returnNote}
            onChange={e => setReturnNote(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder="选填"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">取消</button>
          <button
            disabled={returning || returnRows.length === 0 || (warehouses.length > 0 && !returnWarehouseId)}
            onClick={submitReturn}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {returning ? '提交中...' : '确认回传'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(CollabReturnModal);
