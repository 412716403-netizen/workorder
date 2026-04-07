import React, { useState, useMemo } from 'react';
import { X, Filter, PackageCheck, FileText, ArrowDownToLine } from 'lucide-react';
import { toast } from 'sonner';
import { Partner } from '../../types';

export interface PendingShipmentGroup {
  groupKey: string;
  docNumber: string;
  productId: string;
  productName: string;
  productSku: string;
  partner: string;
  warehouseId: string;
  warehouseName: string;
  totalQuantity: number;
  records: any[];
}

interface PendingShipmentListModalProps {
  pendingShipmentGroups: PendingShipmentGroup[];
  partners: Partner[];
  recordsList: any[];
  onClose: () => void;
  onOpenDetail: (group: PendingShipmentGroup) => void;
  onAddRecord: (record: any) => void;
  onAddRecordBatch?: (records: any[]) => Promise<void>;
  onReplaceRecords?: (type: string, docNumber: string, newRecords: any[]) => void;
  generateSBDocNumberForPartner: (partnerId: string, partnerName: string) => string;
}

const PendingShipmentListModal: React.FC<PendingShipmentListModalProps> = ({
  pendingShipmentGroups,
  partners,
  recordsList,
  onClose,
  onOpenDetail,
  onAddRecord,
  onAddRecordBatch,
  onReplaceRecords,
  generateSBDocNumberForPartner,
}) => {
  const [pendingShipSearchDoc, setPendingShipSearchDoc] = useState('');
  const [pendingShipSearchProduct, setPendingShipSearchProduct] = useState('');
  const [pendingShipSearchPartner, setPendingShipSearchPartner] = useState('');
  const [pendingShipSearchWarehouse, setPendingShipSearchWarehouse] = useState('');
  const [pendingShipSelectedIds, setPendingShipSelectedIds] = useState<Set<string>>(new Set());

  const filteredPendingShipmentGroups = useMemo(() => {
    const doc = pendingShipSearchDoc.trim().toLowerCase();
    const prod = pendingShipSearchProduct.trim().toLowerCase();
    const part = pendingShipSearchPartner.trim().toLowerCase();
    const wh = pendingShipSearchWarehouse.trim().toLowerCase();
    return pendingShipmentGroups.filter(row => {
      if (doc && !row.docNumber.toLowerCase().includes(doc)) return false;
      if (prod && !row.productName.toLowerCase().includes(prod) && !row.productSku.toLowerCase().includes(prod)) return false;
      if (part && !row.partner.toLowerCase().includes(part)) return false;
      if (wh && !row.warehouseName.toLowerCase().includes(wh)) return false;
      return true;
    });
  }, [pendingShipmentGroups, pendingShipSearchDoc, pendingShipSearchProduct, pendingShipSearchPartner, pendingShipSearchWarehouse]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><PackageCheck className="w-5 h-5 text-indigo-600" /> 待发货清单</h3>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">订单单号</label>
              <input type="text" value={pendingShipSearchDoc} onChange={e => setPendingShipSearchDoc(e.target.value)} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">商品名称</label>
              <input type="text" value={pendingShipSearchProduct} onChange={e => setPendingShipSearchProduct(e.target.value)} placeholder="产品名/SKU 模糊" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">客户</label>
              <input type="text" value={pendingShipSearchPartner} onChange={e => setPendingShipSearchPartner(e.target.value)} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">仓库</label>
              <input type="text" value={pendingShipSearchWarehouse} onChange={e => setPendingShipSearchWarehouse(e.target.value)} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-4">
            <span className="text-xs text-slate-400">已配货未出库的销售订单明细；勾选后点击「发货」生成销售单（仅可同时勾选同一客户、同一仓库的明细一起发货）。</span>
            <span className="text-xs text-slate-400">共 {filteredPendingShipmentGroups.length} 项</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {filteredPendingShipmentGroups.length === 0 ? (
            <p className="text-slate-500 text-center py-12">{pendingShipmentGroups.length === 0 ? '暂无待发货项，请先在销售订单中完成配货。' : '无匹配项，请调整搜索条件。'}</p>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="w-12 px-4 py-3" />
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">订单单号</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">商品名称</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">客户</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">仓库</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap w-24">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPendingShipmentGroups.map(group => {
                    const groupRecordIds = group.records.map((r: any) => r.id);
                    const allChecked = groupRecordIds.every(id => pendingShipSelectedIds.has(id));
                    const checked = allChecked;
                    const toggleGroupSelection = () => {
                      if (!allChecked && pendingShipSelectedIds.size > 0) {
                        const firstId = pendingShipSelectedIds.values().next().value!;
                        const firstGroup = filteredPendingShipmentGroups.find(gg => gg.records.some((r: any) => r.id === firstId));
                        if (firstGroup && (firstGroup.partner !== group.partner || firstGroup.warehouseId !== group.warehouseId)) {
                          toast.warning('只能选择同一客户、同一仓库的明细同时发货，请先取消其他勾选。');
                          return;
                        }
                      }
                      setPendingShipSelectedIds(prev => {
                        const next = new Set(prev);
                        if (allChecked) {
                          groupRecordIds.forEach(id => next.delete(id));
                          return next;
                        }
                        groupRecordIds.forEach(id => next.add(id));
                        return next;
                      });
                    };
                    return (
                      <tr
                        key={group.groupKey}
                        className="border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer"
                        onClick={toggleGroupSelection}
                      >
                        <td className="px-4 py-3 align-middle" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={toggleGroupSelection}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-3 text-[10px] font-mono font-bold text-slate-600 whitespace-nowrap">{group.docNumber}</td>
                        <td className="px-4 py-3 font-bold text-slate-800 truncate" title={group.productName}>{group.productName}</td>
                        <td className="px-4 py-3 font-bold text-slate-800 truncate" title={group.partner}>{group.partner}</td>
                        <td className="px-4 py-3 text-right font-black text-indigo-600">{group.totalQuantity.toLocaleString()}</td>
                        <td className="px-4 py-3 font-bold text-slate-700 truncate" title={group.warehouseName}>{group.warehouseName}</td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => onOpenDetail(group)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0"
                        >
                          <FileText className="w-3.5 h-3.5" /> 详情
                        </button>
                        </td>
                    </tr>
                  );
                })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {pendingShipmentGroups.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 flex flex-wrap items-center justify-between gap-4 shrink-0">
            <span className="text-sm font-bold text-slate-600">已选 {pendingShipSelectedIds.size} 项</span>
            <button
              type="button"
              disabled={pendingShipSelectedIds.size === 0}
              onClick={async () => {
                if (pendingShipSelectedIds.size === 0 || !onAddRecord) return;
                const selectedRecords = filteredPendingShipmentGroups.flatMap(g => g.records).filter((r: any) => pendingShipSelectedIds.has(r.id));
                const first = selectedRecords[0];
                const partnerName = first.partner || '';
                const partnerId = first.partnerId || partners.find(p => p.name === partnerName)?.id || '';
                const warehouseId = first.allocationWarehouseId || first.warehouseId || '';
                if (!warehouseId || !partnerName) {
                  toast.error('所选明细缺少客户或仓库信息，无法生成销售单。');
                  return;
                }
                const newDocNumber = generateSBDocNumberForPartner(partnerId, partnerName);
                const timestamp = new Date().toLocaleString();
                const createdAt = new Date().toISOString().split('T')[0];
                let recIdx = 0;
                const newBillRecords = selectedRecords.map((r: any) => {
                  const pendingQty = (r.allocatedQuantity ?? 0) - (r.shippedQuantity ?? 0);
                  const price = r.salesPrice ?? 0;
                  return {
                    id: `psi-sb-${Date.now()}-${recIdx++}`,
                    type: 'SALES_BILL',
                    docNumber: newDocNumber,
                    timestamp,
                    _savedAtMs: Date.now(),
                    partner: partnerName,
                    partnerId,
                    warehouseId,
                    productId: r.productId,
                    variantId: r.variantId,
                    quantity: pendingQty,
                    salesPrice: price,
                    amount: pendingQty * price,
                    note: '',
                    operator: '张主管',
                    lineGroupId: r.lineGroupId ?? r.id,
                    createdAt,
                  };
                });
                if (onAddRecordBatch) await onAddRecordBatch(newBillRecords);
                else { for (const r of newBillRecords) await onAddRecord(r); }
                if (onReplaceRecords) {
                  const docNumbersToUpdate = [...new Set(selectedRecords.map((r: any) => r.docNumber))];
                  docNumbersToUpdate.forEach(docNum => {
                    const docRecords = recordsList.filter((re: any) => re.type === 'SALES_ORDER' && re.docNumber === docNum);
                    const newRecords = docRecords.map((re: any) => {
                      if (!pendingShipSelectedIds.has(re.id)) return re;
                      const allocated = re.allocatedQuantity ?? 0;
                      const alreadyShipped = re.shippedQuantity ?? 0;
                      const pending = allocated - alreadyShipped;
                      return { ...re, shippedQuantity: alreadyShipped + pending };
                    });
                    onReplaceRecords('SALES_ORDER', docNum, newRecords);
                  });
                }
                setPendingShipSelectedIds(new Set());
                onClose();
              }}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowDownToLine className="w-4 h-4" /> 发货生成销售单
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(PendingShipmentListModal);
