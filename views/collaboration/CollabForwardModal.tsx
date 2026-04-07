import React, { useState, useEffect, useRef } from 'react';
import { Forward } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../../services/api';
import type { Product, ProductionOpRecord, AppDictionaries, Warehouse } from '../../types';
import { collabVariantKey } from './collabHelpers';
import type { CollabReturnRow } from './collabHelpers';

interface CollabForwardModalProps {
  open: boolean;
  onClose: () => void;
  transfer: any;
  warehouses: Warehouse[];
  products: Product[];
  prodRecords: ProductionOpRecord[];
  dictionaries: AppDictionaries;
  onForwarded: () => Promise<void>;
}

const CollabForwardModal: React.FC<CollabForwardModalProps> = ({
  open, onClose, transfer, warehouses, products, prodRecords, dictionaries, onForwarded,
}) => {
  const [forwardRows, setForwardRows] = useState<CollabReturnRow[]>([]);
  const [forwardNote, setForwardNote] = useState('');
  const [forwardWarehouseId, setForwardWarehouseId] = useState('');
  const [forwarding, setForwarding] = useState(false);

  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setForwardNote('');
      setForwardWarehouseId(warehouses[0]?.id ?? '');
    }
    prevOpenRef.current = open;
  }, [open, warehouses]);

  useEffect(() => {
    if (!open || !transfer) return;
    const productId = transfer.receiverProductId;
    if (!productId) { setForwardRows([]); return; }

    const product = products.find(p => p.id === productId);
    const colorNameById = Object.fromEntries(dictionaries.colors.map(c => [c.id, c.name]));
    const sizeNameById = Object.fromEntries(dictionaries.sizes.map(s => [s.id, s.name]));
    const variantLabel = (vid: string) => {
      const v = product?.variants.find(x => x.id === vid);
      if (!v) return { colorName: null as string | null, sizeName: null as string | null };
      return {
        colorName: v.colorId ? (colorNameById[v.colorId] ?? null) : null,
        sizeName: v.sizeId ? (sizeNameById[v.sizeId] ?? null) : null,
      };
    };

    const stockByVariant = new Map<string, { colorName: string | null; sizeName: string | null; qty: number }>();
    let fwdNullVariantStock = 0;
    for (const r of prodRecords) {
      if (r.productId !== productId) continue;
      if (forwardWarehouseId && r.warehouseId !== forwardWarehouseId) continue;
      const vid = r.variantId || '';
      const qty = Number(r.quantity) || 0;
      const delta = (r.type === 'STOCK_IN' || r.type === 'STOCK_RETURN') ? qty
        : r.type === 'STOCK_OUT' ? -qty
        : 0;
      if (delta === 0) continue;
      if (!vid) {
        fwdNullVariantStock += delta;
      } else {
        const { colorName, sizeName } = variantLabel(vid);
        const k = collabVariantKey({ colorName, sizeName });
        const prev = stockByVariant.get(k);
        if (prev) prev.qty += delta;
        else stockByVariant.set(k, { colorName, sizeName, qty: delta });
      }
    }

    const effNullStock = Math.max(0, fwdNullVariantStock);
    if (effNullStock > 0) {
      const pvariants = product?.variants || [];
      if (pvariants.length > 0) {
        for (const v of pvariants) {
          const cn = v.colorId ? (colorNameById[v.colorId] ?? null) : null;
          const sn = v.sizeId ? (sizeNameById[v.sizeId] ?? null) : null;
          const k = collabVariantKey({ colorName: cn, sizeName: sn });
          const prev = stockByVariant.get(k);
          if (prev) prev.qty += effNullStock;
          else stockByVariant.set(k, { colorName: cn, sizeName: sn, qty: effNullStock });
        }
      } else {
        const k = collabVariantKey({ colorName: null, sizeName: null });
        const prev = stockByVariant.get(k);
        if (prev) prev.qty += effNullStock;
        else stockByVariant.set(k, { colorName: null, sizeName: null, qty: effNullStock });
      }
    }

    const rows: CollabReturnRow[] = [];
    for (const [, { colorName, sizeName, qty }] of stockByVariant) {
      const stock = Math.max(0, qty);
      if (stock <= 0) continue;
      rows.push({ colorName, sizeName, maxReturnable: stock, qty: '' });
    }
    rows.sort((a, b) => {
      const la = [a.colorName || '', a.sizeName || ''].join('\t');
      const lb = [b.colorName || '', b.sizeName || ''].join('\t');
      return la.localeCompare(lb, 'zh-CN');
    });
    setForwardRows(rows);
  }, [open, forwardWarehouseId, products, prodRecords, dictionaries, transfer]);

  if (!open || !transfer) return null;

  const route = transfer.outsourceRouteSnapshot as any[] | undefined;
  const nextStep = route?.find((s: any) => s.stepOrder === (transfer.chainStep ?? 0) + 1);

  const submitForward = async () => {
    if (warehouses.length > 0 && !forwardWarehouseId) {
      toast.warning('请选择出库仓库');
      return;
    }
    if (forwardRows.length === 0) {
      toast.warning('所有规格已全部转发完毕，无剩余可转发数量');
      return;
    }
    for (const r of forwardRows) {
      const q = Number(r.qty) || 0;
      if (q > r.maxReturnable) {
        toast.error(`「${[r.colorName, r.sizeName].filter(Boolean).join('/') || '无规格'}」超过可转发上限 ${r.maxReturnable}`);
        return;
      }
    }
    const items = forwardRows
      .map(r => ({ colorName: r.colorName, sizeName: r.sizeName, quantity: Number(r.qty) || 0 }))
      .filter(i => i.quantity > 0);
    if (items.length === 0) {
      toast.warning('请至少填写一行转发数量');
      return;
    }
    setForwarding(true);
    try {
      const res = await api.collaboration.forwardTransfer(transfer.id, { items, note: forwardNote || undefined, warehouseId: forwardWarehouseId || undefined });
      toast.success(`已转发到下一站: ${res.nextStep?.receiverTenantName ?? ''}`);
      onClose();
      await onForwarded();
    } catch (err: any) {
      toast.error(err.message || '转发失败');
    } finally {
      setForwarding(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto space-y-4 p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Forward className="w-5 h-5 text-orange-500" /> 转发到下一站</h3>
        {nextStep && (
          <p className="text-xs text-slate-500">
            下一站：<span className="font-bold text-slate-800">{nextStep.nodeName}</span> · <span className="font-bold text-orange-600">{nextStep.receiverTenantName}</span>
            ，请先选择<strong>出库仓库</strong>，可转发数量为该仓库中对应规格的库存数量。
          </p>
        )}
        {warehouses.length > 0 && (
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase block">出库仓库</label>
            <select
              value={forwardWarehouseId}
              onChange={e => setForwardWarehouseId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-orange-500 outline-none"
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
                <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase text-right">可转</th>
                <th className="px-3 py-2 text-[10px] font-black text-slate-400 uppercase w-24">本次</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {forwardRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-amber-700 bg-amber-50/50 font-medium">
                    {!forwardWarehouseId && warehouses.length > 0
                      ? '请先选择出库仓库'
                      : '该仓库中无可转发库存。'}
                  </td>
                </tr>
              ) : (
                forwardRows.map((row, idx) => (
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
                          setForwardRows(prev => prev.map((r, i) => (i === idx ? { ...r, qty: v } : r)));
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-orange-500 outline-none"
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
            value={forwardNote}
            onChange={e => setForwardNote(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-orange-500 outline-none"
            placeholder="选填"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">取消</button>
          <button
            disabled={forwarding || forwardRows.length === 0 || (warehouses.length > 0 && !forwardWarehouseId)}
            onClick={submitForward}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {forwarding ? '转发中...' : '确认转发'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(CollabForwardModal);
