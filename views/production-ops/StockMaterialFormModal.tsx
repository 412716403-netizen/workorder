import React, { useState } from 'react';
import type { ProductionOpRecord, ProductionOrder, Product, Warehouse, ProdOpType } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { currentOperatorDisplayName } from '../../utils/currentOperatorDisplayName';

export interface StockMaterialFormModalProps {
  visible: boolean;
  onClose: () => void;
  stockModalMode: 'stock_out' | 'stock_return' | null;
  orders: ProductionOrder[];
  products: Product[];
  warehouses: Warehouse[];
  productionLinkMode: 'order' | 'product';
  onAddRecord: (record: ProductionOpRecord) => void;
  getNextStockDocNo: (type: 'STOCK_OUT' | 'STOCK_RETURN') => string;
}

const StockMaterialFormModal: React.FC<StockMaterialFormModalProps> = ({
  visible,
  onClose,
  stockModalMode,
  orders,
  products,
  warehouses,
  productionLinkMode,
  onAddRecord,
  getNextStockDocNo,
}) => {
  const { currentUser } = useAuth();
  const docOperator = currentOperatorDisplayName(currentUser);
  const [form, setForm] = useState({
    orderId: '',
    productId: '',
    quantity: 0,
    reason: '',
    partner: '',
    warehouseId: ''
  });

  if (!visible || !stockModalMode) return null;

  const handleAdd = () => {
    const isStockReturn = stockModalMode === 'stock_return';
    const recordType: ProdOpType = isStockReturn ? 'STOCK_RETURN' : 'STOCK_OUT';
    const docNo = getNextStockDocNo(recordType);
    const newRecord: ProductionOpRecord = {
      id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: recordType,
      orderId: productionLinkMode === 'product' ? undefined : (form.orderId || undefined),
      productId: form.productId,
      quantity: form.quantity,
      reason: form.reason,
      partner: form.partner,
      operator: docOperator,
      timestamp: new Date().toLocaleString(),
      status: '已完成',
      warehouseId: form.warehouseId || undefined,
      docNo
    };
    onAddRecord(newRecord);
    setForm({ orderId: '', productId: '', quantity: 0, reason: '', partner: '', warehouseId: '' });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 p-4 space-y-4">
        <h3 className="text-lg font-black text-slate-900">
          {stockModalMode === 'stock_return' ? '生产退料' : '生产领料'}
        </h3>
        {form.orderId && (
          <div className="text-sm">
            <span className="text-slate-500">工单：</span>
            <span className="font-bold text-slate-800">{orders.find(o => o.id === form.orderId)?.orderNumber ?? form.orderId}</span>
          </div>
        )}
        {warehouses.length > 0 && (
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">
              {stockModalMode === 'stock_return' ? '退回仓库' : '出库仓库'}
            </label>
            <select
              value={form.warehouseId}
              onChange={e => setForm(f => ({ ...f, warehouseId: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
            >
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">物料</label>
          <select
            value={form.productId}
            onChange={e => setForm(f => ({ ...f, productId: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="">请选择物料</option>
            {[...products].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id)).map(p => (
              <option key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">数量</label>
          <input
            type="number"
            min={0}
            step={1}
            value={form.quantity || ''}
            onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) || 0 }))}
            className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder="0"
          />
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">原因/备注</label>
          <input
            type="text"
            value={form.reason || ''}
            onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder="选填"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!form.productId || (form.quantity ?? 0) <= 0}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(StockMaterialFormModal);
