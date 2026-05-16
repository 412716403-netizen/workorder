/**
 * 计划单 - 追溯码 - 拆批快捷设置弹窗 (Phase P5 抽离自 PlanTraceSection)。
 */
import React from 'react';

interface Props {
  open: boolean;
  draftSize: string;
  setDraftSize: React.Dispatch<React.SetStateAction<string>>;
  draftWithItems: boolean;
  setDraftWithItems: React.Dispatch<React.SetStateAction<boolean>>;
  onClose: () => void;
  onSave: () => void | Promise<void>;
}

const BulkQuickSettingsModal: React.FC<Props> = ({
  open,
  draftSize,
  setDraftSize,
  draftWithItems,
  setDraftWithItems,
  onClose,
  onSave,
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" aria-label="关闭" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-black text-slate-900">拆批设置</h3>
          <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
            保存后，「一键生成全部规格」将按此处每批件数拆批；是否在「单品码+批次码」模式下同步生成单品码由下方勾选决定。
          </p>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black text-slate-400 uppercase">每批件数（必填，1–100000）</label>
            <input
              type="number"
              min={1}
              max={100_000}
              value={draftSize}
              onChange={e => setDraftSize(e.target.value)}
              placeholder="如 50"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800"
            />
          </div>
          <label className="flex cursor-pointer items-start gap-3 text-sm font-bold text-slate-800">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded text-indigo-600"
              checked={draftWithItems}
              onChange={e => setDraftWithItems(e.target.checked)}
            />
            <span>
              在「单品码+批次码」时，一键生成同步生成单品码
              <span className="mt-1 block text-xs font-medium text-slate-500">选择「仅批次码」时不会生成单品码。</span>
            </span>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void onSave()}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkQuickSettingsModal;
