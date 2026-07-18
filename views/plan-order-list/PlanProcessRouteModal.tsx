import React, { useEffect, useState } from 'react';
import { ModalPortal } from '../../components/ModalPortal';
import { ClipboardCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import type { GlobalNodeTemplate } from '../../types';
import PlanProcessRouteEditor from './PlanProcessRouteEditor';

export type PlanProcessRouteModalProps = {
  open: boolean;
  onClose: () => void;
  globalNodes: GlobalNodeTemplate[];
  value: string[];
  /** 确认后由调用方立即落库；可返回 Promise */
  onConfirm: (next: string[]) => void | Promise<void>;
  disabled?: boolean;
  productMilestoneNodeIds: string[];
  hasPlanOverride?: boolean;
  planNumber?: string;
  /** 产品尚无工序时：确认保存会写回产品档案 */
  writeBackToProduct?: boolean;
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
  writeBackToProduct = false,
}) => {
  const [draft, setDraft] = useState<string[]>(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(value);
      setSaving(false);
    }
  }, [open, value]);

  if (!open) return null;

  const handleConfirm = async () => {
    if (draft.length === 0) {
      toast.error('请至少选择一道工序');
      return;
    }
    setSaving(true);
    try {
      await onConfirm(draft);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '保存工序路线失败';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const title = disabled
    ? '查看工艺路线'
    : writeBackToProduct
      ? '配置工艺路线'
      : '修改工艺路线';
  const subtitle = writeBackToProduct
    ? planNumber
      ? `${planNumber} · 确认后立即保存，并写入产品档案`
      : '确认后立即保存，并写入产品档案'
    : planNumber
      ? `${planNumber} · 确认后立即保存到本计划单`
      : '确认后立即保存到本计划单';

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        aria-label="关闭"
        onClick={onClose}
        disabled={saving}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-process-route-modal-title"
        className="relative z-10 w-full max-w-3xl max-h-[min(92vh,960px)] flex flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 id="plan-process-route-modal-title" className="text-base font-black text-slate-900">
                {title}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 shrink-0 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <PlanProcessRouteEditor
            globalNodes={globalNodes}
            value={draft}
            onChange={setDraft}
            disabled={disabled || saving}
            productMilestoneNodeIds={productMilestoneNodeIds}
            hasPlanOverride={hasPlanOverride}
            embedded
          />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4 shrink-0 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            取消
          </button>
          {!disabled && (
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-60"
            >
              {saving ? '保存中…' : '确定'}
            </button>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};

export default PlanProcessRouteModal;
