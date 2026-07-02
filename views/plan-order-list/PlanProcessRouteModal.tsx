import React, { useEffect, useState } from 'react';
import { ClipboardCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import type { GlobalNodeTemplate } from '../../types';
import PlanProcessRouteEditor from './PlanProcessRouteEditor';

export type PlanProcessRouteModalProps = {
  open: boolean;
  onClose: () => void;
  globalNodes: GlobalNodeTemplate[];
  value: string[];
  onConfirm: (next: string[]) => void;
  disabled?: boolean;
  productMilestoneNodeIds: string[];
  hasPlanOverride?: boolean;
  planNumber?: string;
};

const PlanProcessRouteModal: React.FC<PlanProcessRouteModalProps> = ({
  open,
  onClose,
  globalNodes,
  value,
  onConfirm,
  disabled = false,
  productMilestoneNodeIds,
  hasPlanOverride = false,
  planNumber,
}) => {
  const [draft, setDraft] = useState<string[]>(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  if (!open) return null;

  const handleConfirm = () => {
    if (draft.length === 0) {
      toast.error('请至少选择一道工序');
      return;
    }
    onConfirm(draft);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" aria-label="关闭" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-process-route-modal-title"
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 id="plan-process-route-modal-title" className="text-base font-black text-slate-900">
                {disabled ? '查看工艺路线' : '修改工艺路线'}
              </h3>
              {planNumber ? (
                <p className="text-xs text-slate-500 mt-0.5 truncate">{planNumber} · 仅影响本计划单</p>
              ) : (
                <p className="text-xs text-slate-500 mt-0.5">调整本计划的生产工序，不回写产品档案</p>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <PlanProcessRouteEditor
            globalNodes={globalNodes}
            value={draft}
            onChange={setDraft}
            disabled={disabled}
            productMilestoneNodeIds={productMilestoneNodeIds}
            hasPlanOverride={hasPlanOverride}
            embedded
          />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4 shrink-0 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            取消
          </button>
          {!disabled && (
            <button
              type="button"
              onClick={handleConfirm}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm"
            >
              确定
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlanProcessRouteModal;
