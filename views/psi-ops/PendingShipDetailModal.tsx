import React, { useState } from 'react';
import { X, Pencil, Check, Trash2 } from 'lucide-react';
import { Product, Warehouse, AppDictionaries, ProductVariant } from '../../types';
import { useConfirm } from '../../contexts/ConfirmContext';
import type { PendingShipmentGroup } from './PendingShipmentListModal';

interface PendingShipDetailModalProps {
  group: PendingShipmentGroup;
  productMapPSI: Map<string, Product>;
  dictionaries: AppDictionaries;
  getUnitName: (productId: string) => string;
  warehouses: Warehouse[];
  onReplaceRecords?: (type: string, docNumber: string, newRecords: any[]) => void;
  recordsList: any[];
  onClose: () => void;
}

const PendingShipDetailModal: React.FC<PendingShipDetailModalProps> = ({
  group: g,
  productMapPSI,
  dictionaries,
  getUnitName,
  warehouses,
  onReplaceRecords,
  recordsList,
  onClose,
}) => {
  const confirm = useConfirm();
  const product = productMapPSI.get(g.productId);
  const hasVariants = g.records.some((r: any) => r.variantId) && (product?.variants?.length ?? 0) > 0;
  const unitName = getUnitName(g.productId);

  const [pendingShipDetailEdit, setPendingShipDetailEdit] = useState<Record<string, number> | number | null>(null);
  const [pendingShipDetailEditWarehouseId, setPendingShipDetailEditWarehouseId] = useState<string | null>(null);

  const isEditing = pendingShipDetailEdit !== null;
  const editQuantities = isEditing
    ? (hasVariants
      ? (pendingShipDetailEdit as Record<string, number>)
      : { _single: pendingShipDetailEdit as number })
    : null;
  const editWarehouseId = pendingShipDetailEditWarehouseId ?? g.warehouseId;

  const handleSaveEdit = () => {
    if (!onReplaceRecords || editQuantities == null) return;
    const docRecords = recordsList.filter((re: any) => re.type === 'SALES_ORDER' && re.docNumber === g.docNumber);
    const newRecords = docRecords.map((re: any) => {
      const inGroup = g.records.some((r: any) => r.id === re.id);
      if (!inGroup) return re;
      const base = { ...re, allocationWarehouseId: editWarehouseId || re.allocationWarehouseId };
      const shipped = Number(re.shippedQuantity) || 0;
      if (hasVariants && re.variantId != null) {
        const pendingEdit = (editQuantities as Record<string, number>)[re.variantId] ?? 0;
        return { ...base, allocatedQuantity: shipped + Math.max(0, pendingEdit) };
      }
      if (!hasVariants) {
        const pendingEdit = (editQuantities as Record<string, number>)._single ?? 0;
        return { ...base, allocatedQuantity: shipped + Math.max(0, pendingEdit) };
      }
      return base;
    });
    onReplaceRecords('SALES_ORDER', g.docNumber, newRecords);
    setPendingShipDetailEdit(null);
    setPendingShipDetailEditWarehouseId(null);
    onClose();
  };

  const handleDelete = () => {
    if (!onReplaceRecords) return;
    void confirm({ message: '确定要取消该组配货吗？已配数量将清零。', danger: true }).then((ok) => {
      if (!ok) return;
      const docRecords = recordsList.filter((re: any) => re.type === 'SALES_ORDER' && re.docNumber === g.docNumber);
      const newRecords = docRecords.map((re: any) => {
        if (!g.records.some((r: any) => r.id === re.id)) return re;
        return { ...re, allocatedQuantity: 0 };
      });
      onReplaceRecords('SALES_ORDER', g.docNumber, newRecords);
      onClose();
    });
  };

  const handleClose = () => {
    setPendingShipDetailEdit(null);
    setPendingShipDetailEditWarehouseId(null);
    onClose();
  };

  /** 与待发货清单一致：待发 = 已配 − 已发 */
  const pendingShipQty = (r: any) => Math.max(0, (Number(r.allocatedQuantity) || 0) - (Number(r.shippedQuantity) || 0));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={handleClose} aria-hidden />
      <div className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{g.docNumber}</span>
            配货详情
          </h3>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button type="button" onClick={() => { setPendingShipDetailEdit(null); setPendingShipDetailEditWarehouseId(null); }} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">取消</button>
                <button type="button" onClick={handleSaveEdit} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700">
                  <Check className="w-4 h-4" /> 保存
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setPendingShipDetailEditWarehouseId(g.warehouseId);
                    if (hasVariants) {
                      const next: Record<string, number> = {};
                      g.records.forEach((r: any) => { next[r.variantId] = pendingShipQty(r); });
                      setPendingShipDetailEdit(next);
                    } else {
                      setPendingShipDetailEdit(g.records[0] ? pendingShipQty(g.records[0]) : 0);
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
                >
                  <Pencil className="w-4 h-4" /> 编辑
                </button>
                {onReplaceRecords && (
                  <button type="button" onClick={handleDelete} className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-bold">
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
          <div>
            <h2 className="text-xl font-bold text-slate-900">{g.productName}</h2>
            <p className="text-xs text-slate-500 mt-1">客户：{g.partner}{!isEditing && ` · 仓库：${g.warehouseName}`}</p>
            {isEditing && (
              <div className="mt-3">
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">配货仓库（出库仓库）</label>
                <select
                  value={editWarehouseId}
                  onChange={e => setPendingShipDetailEditWarehouseId(e.target.value)}
                  className="w-full max-w-xs bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div>
            <h4 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-3">数量明细</h4>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格 / 颜色尺码</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">
                      待发数量
                      {!isEditing && (
                        <span className="block font-bold normal-case text-[9px] text-slate-400 tracking-normal mt-0.5">与待发货清单一致（已配−已发）</span>
                      )}
                      {isEditing && (
                        <span className="block font-bold normal-case text-[9px] text-slate-400 tracking-normal mt-0.5">保存后：已发 + 本列 = 新已配</span>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {hasVariants
                    ? g.records.map((r: any) => {
                        const v = product?.variants?.find((vv: ProductVariant) => vv.id === r.variantId);
                        const colorName = v?.colorId ? (dictionaries.colors.find(c => c.id === v.colorId)?.name ?? '') : '';
                        const sizeName = v?.sizeId ? (dictionaries.sizes.find(s => s.id === v.sizeId)?.name ?? '') : '';
                        const specLabel = [colorName, sizeName].filter(Boolean).join(' / ') || (r.variantId ?? '—');
                        const pendingEditVal = isEditing && editQuantities && typeof editQuantities === 'object' && !('_single' in editQuantities)
                          ? (editQuantities as Record<string, number>)[r.variantId] ?? pendingShipQty(r)
                          : pendingShipQty(r);
                        const pending = pendingShipQty(r);
                        return (
                          <tr key={r.id} className="border-b border-slate-100">
                            <td className="px-4 py-3 font-bold text-slate-800">{specLabel}</td>
                            <td className="px-4 py-3 text-right">
                              {isEditing ? (
                                <input
                                  type="number"
                                  min={0}
                                  value={pendingEditVal}
                                  onChange={e => setPendingShipDetailEdit((prev: Record<string, number> | number | null) => {
                                    const next = prev as Record<string, number>;
                                    return { ...next, [r.variantId]: Math.max(0, parseInt(e.target.value, 10) || 0) };
                                  })}
                                  className="w-24 text-right py-1.5 px-2 rounded-lg border border-slate-200 text-sm font-black text-indigo-600 focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                              ) : (
                                <div>
                                  <span className="font-black text-indigo-600">{pending.toLocaleString()} {unitName}</span>
                                  <span className="block text-[10px] text-slate-400 font-medium mt-0.5">
                                    已配 {(Number(r.allocatedQuantity) || 0).toLocaleString()} · 已发 {(Number(r.shippedQuantity) || 0).toLocaleString()}
                                  </span>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    : (
                      <tr className="border-b border-slate-100">
                        <td className="px-4 py-3 font-bold text-slate-800">数量</td>
                        <td className="px-4 py-3 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              min={0}
                              value={typeof pendingShipDetailEdit === 'number' ? pendingShipDetailEdit : (g.records[0] ? pendingShipQty(g.records[0]) : 0)}
                              onChange={e => setPendingShipDetailEdit(Math.max(0, parseInt(e.target.value, 10) || 0))}
                              className="w-24 text-right py-1.5 px-2 rounded-lg border border-slate-200 text-sm font-black text-indigo-600 focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                          ) : (
                            <div>
                              <span className="font-black text-indigo-600">{g.totalQuantity.toLocaleString()} {unitName}</span>
                              {g.records[0] && (
                                <span className="block text-[10px] text-slate-400 font-medium mt-0.5">
                                  已配 {(Number(g.records[0].allocatedQuantity) || 0).toLocaleString()} · 已发 {(Number(g.records[0].shippedQuantity) || 0).toLocaleString()}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  <tr className="bg-indigo-50/80 font-bold">
                    <td className="px-4 py-3 text-slate-700">合计</td>
                    <td className="px-4 py-3 text-right text-indigo-600">
                      {isEditing && hasVariants && editQuantities && typeof editQuantities === 'object' && !('_single' in editQuantities)
                        ? (
                          <>
                            <span>{(Object.values(editQuantities) as number[]).reduce((s, n) => s + (n || 0), 0).toLocaleString()} {unitName}</span>
                            <span className="block text-[10px] text-slate-500 font-bold normal-case">（待发合计）</span>
                          </>
                        )
                        : isEditing && !hasVariants && typeof pendingShipDetailEdit === 'number'
                          ? (
                            <>
                              <span>{(pendingShipDetailEdit as number).toLocaleString()} {unitName}</span>
                              <span className="block text-[10px] text-slate-500 font-bold normal-case">（待发合计）</span>
                            </>
                          )
                          : (
                            <>
                              <span>{g.totalQuantity.toLocaleString()} {unitName}</span>
                              <span className="block text-[10px] text-slate-500 font-bold normal-case">（待发合计）</span>
                            </>
                          )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(PendingShipDetailModal);
