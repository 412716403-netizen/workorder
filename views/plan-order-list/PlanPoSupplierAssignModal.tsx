import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import type { Partner, PartnerCategory } from '../../types';
import { SupplierSelect } from '../../components/SupplierSelect';

export type PlanPoSupplierAssignRow = {
  materialId: string;
  materialName: string;
  materialSku: string;
  nodeName: string;
  plannedQty: number;
  shortage: number;
};

export type PlanPoSupplierOverride = { partnerId: string; partnerName: string };

export interface PlanPoSupplierAssignModalProps {
  open: boolean;
  rows: PlanPoSupplierAssignRow[];
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  onConfirm: (overrides: Record<string, PlanPoSupplierOverride>) => void;
  onCancel: () => void;
}

const PlanPoSupplierAssignModal: React.FC<PlanPoSupplierAssignModalProps> = ({
  open,
  rows,
  partners,
  partnerCategories,
  onConfirm,
  onCancel,
}) => {
  const [byMaterialId, setByMaterialId] = useState<Record<string, PlanPoSupplierOverride>>({});

  useEffect(() => {
    if (!open) return;
    const init: Record<string, PlanPoSupplierOverride> = {};
    rows.forEach(r => {
      init[r.materialId] = { partnerId: '', partnerName: '' };
    });
    setByMaterialId(init);
  }, [open, rows]);

  if (!open) return null;

  const handleConfirm = () => {
    const missing = rows.filter(r => !String(byMaterialId[r.materialId]?.partnerId ?? '').trim());
    if (missing.length > 0) {
      toast.warning('请为所有未维护供应商的物料选择供应商');
      return;
    }
    onConfirm(byMaterialId);
  };

  return (
    <div className="fixed inset-0 z-[76] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm" onClick={onCancel} aria-hidden />
      <div
        className="relative bg-white w-full max-w-3xl max-h-[90vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-base font-black text-slate-900">指定供应商</h3>
            <p className="text-xs text-slate-500 font-medium mt-1">
              以下物料未维护默认供应商（或档案中的供应商已不存在）。请为每项选择供应商；同一供应商的物料将合并为一张采购订单。保存采购订单后，将把所选供应商写入对应产品档案。
            </p>
          </div>
          <button type="button" onClick={onCancel} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 sm:p-6 min-h-0">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <th className="py-3 pr-4">物料</th>
                <th className="py-3 pr-4">工序</th>
                <th className="py-3 pr-4 text-right">计划用量</th>
                <th className="py-3 min-w-[220px]">供应商</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(row => (
                <tr key={row.materialId}>
                  <td className="py-3 pr-4 align-top">
                    <div className="font-bold text-slate-800">{row.materialName}</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">SKU {row.materialSku}</div>
                  </td>
                  <td className="py-3 pr-4 align-top text-xs font-bold text-indigo-600">{row.nodeName}</td>
                  <td className="py-3 pr-4 align-top text-right font-mono text-slate-700">{Number(row.plannedQty).toFixed(2)}</td>
                  <td className="py-3 align-top">
                    <SupplierSelect
                      options={partners}
                      categories={partnerCategories}
                      value={byMaterialId[row.materialId]?.partnerId ?? ''}
                      valueMode="id"
                      placeholder="选择供应商…"
                      portalZIndex={10070}
                      allowQuickCreate
                      onChange={(partnerName, partnerId) => {
                        setByMaterialId(prev => ({
                          ...prev,
                          [row.materialId]: { partnerId, partnerName: partnerName || '' },
                        }));
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0 bg-slate-50/50">
          <button type="button" onClick={onCancel} className="px-5 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-6 py-2.5 text-sm font-black text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-lg"
          >
            确认并生成预览
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlanPoSupplierAssignModal;
