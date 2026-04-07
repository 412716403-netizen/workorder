import React, { useState } from 'react';
import { Check, X, Pencil, Trash2 } from 'lucide-react';
import type { ProductionOpRecord, ProductionOrder, Product, Warehouse, AppDictionaries } from '../../types';
import { hasOpsPerm, type StockDocDetail } from './types';
import { useConfirm } from '../../contexts/ConfirmContext';

export interface StockDocDetailModalProps {
  detail: StockDocDetail | null;
  onClose: () => void;
  onDetailChange: (detail: StockDocDetail | null) => void;
  records: ProductionOpRecord[];
  orders: ProductionOrder[];
  products: Product[];
  warehouses: Warehouse[];
  dictionaries?: AppDictionaries;
  onUpdateRecord?: (record: ProductionOpRecord) => void;
  onDeleteRecord?: (recordId: string) => void;
  userPermissions?: string[];
  tenantRole?: string;
}

const StockDocDetailModal: React.FC<StockDocDetailModalProps> = ({
  detail,
  onClose,
  onDetailChange,
  records,
  orders,
  products,
  warehouses,
  dictionaries,
  onUpdateRecord,
  onDeleteRecord,
  userPermissions,
  tenantRole,
}) => {
  const confirm = useConfirm();
  const [stockDocEditForm, setStockDocEditForm] = useState<{
    warehouseId: string;
    lines: { productId: string; quantity: number }[];
    reason: string;
  } | null>(null);

  if (!detail) return null;

  const stockDocDetail = detail;
  const order = orders.find(o => o.id === stockDocDetail.orderId);
  const sourceProd = stockDocDetail.sourceProductId
    ? products.find(p => p.id === stockDocDetail.sourceProductId)
    : null;
  const warehouse = warehouses.find(w => w.id === stockDocDetail.warehouseId);
  const getUnitName = (productId: string) => {
    const p = products.find(x => x.id === productId);
    return (p?.unitId && (dictionaries?.units ?? []).find(u => u.id === p.unitId)?.name) || '件';
  };
  const isReturn = stockDocDetail.type === 'STOCK_RETURN';
  const isEditing = stockDocEditForm !== null;
  const startEdit = () => setStockDocEditForm({
    warehouseId: stockDocDetail.warehouseId,
    lines: stockDocDetail.lines.map(l => ({ productId: l.productId, quantity: l.quantity })),
    reason: stockDocDetail.reason ?? ''
  });
  const cancelEdit = () => setStockDocEditForm(null);
  const saveEdit = () => {
    if (!stockDocEditForm || !onUpdateRecord) return;
    const docRecords = records.filter(r => r.docNo === stockDocDetail.docNo);
    docRecords.forEach(rec => {
      const line = stockDocEditForm.lines.find(l => l.productId === rec.productId);
      if (line) {
        onUpdateRecord({
          ...rec,
          quantity: line.quantity,
          warehouseId: stockDocEditForm.warehouseId || undefined,
          reason: stockDocEditForm.reason.trim() || undefined
        });
      }
    });
    onDetailChange({
      ...stockDocDetail,
      warehouseId: stockDocEditForm.warehouseId,
      lines: stockDocEditForm.lines,
      reason: stockDocEditForm.reason.trim() || undefined
    });
    setStockDocEditForm(null);
  };
  const handleClose = () => {
    setStockDocEditForm(null);
    onClose();
  };
  const editForm = stockDocEditForm;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={handleClose} aria-hidden />
      <div className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
              {order
                ? order.orderNumber
                : sourceProd?.name ??
                  (stockDocDetail.lines[0]
                    ? products.find(p => p.id === stockDocDetail.lines[0].productId)?.name ?? stockDocDetail.docNo
                    : stockDocDetail.docNo)}
            </span>
            {isReturn ? '退料单详情' : '领料单详情'}
          </h3>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button type="button" onClick={cancelEdit} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">取消</button>
                <button type="button" onClick={saveEdit} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700">
                  <Check className="w-4 h-4" /> 保存
                </button>
              </>
            ) : (
              <>
                {onUpdateRecord && hasOpsPerm(tenantRole, userPermissions, 'production:material_records:edit') && (
                  <button
                    type="button"
                    onClick={startEdit}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
                  >
                    <Pencil className="w-4 h-4" /> 编辑
                  </button>
                )}
                {onDeleteRecord && hasOpsPerm(tenantRole, userPermissions, 'production:material_records:delete') && (
                  <button
                    type="button"
                    onClick={() => {
                      void confirm({ message: `确定要删除该张${isReturn ? '退料' : '领料'}单的所有记录吗？此操作不可恢复。`, danger: true }).then((ok) => {
                        if (!ok) return;
                        const docRecords = records.filter(r => r.docNo === stockDocDetail.docNo);
                        docRecords.forEach(rec => onDeleteRecord(rec.id));
                        setStockDocEditForm(null);
                        onClose();
                      });
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-bold"
                  >
                    <Trash2 className="w-4 h-4" /> 删除
                  </button>
                )}
              </>
            )}
            <button type="button" onClick={handleClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">
            {sourceProd?.name ?? (order ? (products.find(p => p.id === order.productId)?.name ?? order.productName ?? '—') : '—')}
          </h2>
          {!isEditing ? (
            <>
              <div className="flex flex-wrap gap-4">
                <div className="bg-slate-50 rounded-xl px-4 py-2">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">单据号</p>
                  <p className="text-sm font-bold text-slate-800 font-mono">{stockDocDetail.docNo}</p>
                </div>
                <div className="bg-slate-50 rounded-xl px-4 py-2">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">类型</p>
                  <p className="text-sm font-bold text-slate-800">{isReturn ? '退料' : '领料'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl px-4 py-2">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">业务时间</p>
                  <p className="text-sm font-bold text-slate-800">{stockDocDetail.timestamp}</p>
                </div>
                {warehouse && (
                  <div className="bg-slate-50 rounded-xl px-4 py-2">
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">{isReturn ? '退回仓库' : '出库仓库'}</p>
                    <p className="text-sm font-bold text-slate-800">{warehouse.name}{warehouse.code ? ` (${warehouse.code})` : ''}</p>
                  </div>
                )}
                <div className="bg-slate-50 rounded-xl px-4 py-2">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">经办</p>
                  <p className="text-sm font-bold text-slate-800">{stockDocDetail.operator}</p>
                </div>
                {stockDocDetail.reason && (
                  <div className="bg-slate-50 rounded-xl px-4 py-2">
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">备注</p>
                    <p className="text-sm font-bold text-slate-800">{stockDocDetail.reason}</p>
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-auto -mt-2">
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">物料</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-16">单位</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockDocDetail.lines.map(({ productId, quantity }) => {
                        const prod = products.find(p => p.id === productId);
                        return (
                          <tr key={productId} className="border-b border-slate-100">
                            <td className="px-4 py-3 font-medium text-slate-800">{prod?.name ?? productId}</td>
                            <td className="px-4 py-3 font-bold text-indigo-600 text-right">{quantity}</td>
                            <td className="px-4 py-3 text-slate-500">{getUnitName(productId)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <>
              {editForm && (
                <>
                  <div className="grid grid-cols-[1fr_1.5fr] gap-3">
                    <div className="bg-slate-50 rounded-xl px-4 py-2">
                      <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">{isReturn ? '退回仓库' : '出库仓库'}</p>
                      <select
                        value={editForm.warehouseId}
                        onChange={e => setStockDocEditForm(prev => prev ? { ...prev, warehouseId: e.target.value } : null)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                      >
                        {warehouses.map(w => (
                          <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                        ))}
                      </select>
                    </div>
                    <div className="bg-slate-50 rounded-xl px-4 py-2">
                      <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">备注</p>
                      <input
                        type="text"
                        value={editForm.reason}
                        onChange={e => setStockDocEditForm(prev => prev ? { ...prev, reason: e.target.value } : null)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="选填"
                      />
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">物料</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-16">单位</th>
                        </tr>
                      </thead>
                      <tbody>
                        {editForm.lines.map(({ productId, quantity }) => {
                          const prod = products.find(p => p.id === productId);
                          return (
                            <tr key={productId} className="border-b border-slate-100">
                              <td className="px-4 py-3 font-medium text-slate-800">{prod?.name ?? productId}</td>
                              <td className="px-4 py-3 text-right">
                                <input
                                  type="number"
                                  min={0}
                                  value={quantity}
                                  onChange={e => {
                                    const v = Number(e.target.value) || 0;
                                    setStockDocEditForm(prev => prev ? {
                                      ...prev,
                                      lines: prev.lines.map(l => l.productId === productId ? { ...l, quantity: v } : l)
                                    } : null);
                                  }}
                                  className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200"
                                />
                              </td>
                              <td className="px-4 py-3 text-slate-500">{getUnitName(productId)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(StockDocDetailModal);
