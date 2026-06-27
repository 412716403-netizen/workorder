import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Bell, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTodos } from '../hooks/useTodos';
import { TODO_NOTE_MAX_CHARS, type TodoItemDTO, type TodoSourceType } from '../types';
import {
  formStandardLabelClass,
  formStandardControlClass,
  formStandardTextareaClass,
} from '../styles/uiDensity';

export interface AddTodoSeed {
  sourceType: TodoSourceType;
  sourceId?: string | null;
  sourceDocNo?: string | null;
  sourceTitle?: string | null;
  href?: string | null;
}

interface AddTodoModalProps {
  open: boolean;
  onClose: () => void;
  /** 从详情页带入的单据上下文；不传则为独立待办 */
  seed?: AddTodoSeed;
  /** 传入则为编辑态 */
  editing?: TodoItemDTO | null;
  zIndexClass?: string;
}

/** ISO → datetime-local 输入值（本地时区，去掉秒） */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const AddTodoModal: React.FC<AddTodoModalProps> = ({
  open,
  onClose,
  seed,
  editing,
  zIndexClass = 'z-[140]',
}) => {
  const { createTodo, isCreating, updateTodo, isUpdating } = useTodos({ enabled: false });
  const isEdit = !!editing;
  const submitting = isCreating || isUpdating;

  const [note, setNote] = useState('');
  const [remindEnabled, setRemindEnabled] = useState(false);
  const [remindAt, setRemindAt] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setNote(editing.note);
      setRemindEnabled(editing.remindEnabled);
      setRemindAt(isoToLocalInput(editing.remindAt));
    } else {
      setNote('');
      setRemindEnabled(false);
      setRemindAt('');
    }
  }, [open, editing]);

  const docLabel = useMemo(() => {
    const src = editing ?? seed;
    if (!src) return '';
    const parts = [src.sourceDocNo, src.sourceTitle].filter(Boolean);
    return parts.join(' ');
  }, [editing, seed]);

  if (!open) return null;

  const handleSubmit = async () => {
    const trimmed = note.trim();
    if (!trimmed) {
      toast.error('请填写待办内容');
      return;
    }
    if (remindEnabled && !remindAt) {
      toast.error('开启提醒后请选择提醒时间');
      return;
    }
    const remindAtIso = remindEnabled && remindAt ? new Date(remindAt).toISOString() : null;

    try {
      if (isEdit && editing) {
        await updateTodo({
          id: editing.id,
          body: { note: trimmed, remindEnabled, remindAt: remindAtIso },
        });
        toast.success('待办已更新');
      } else {
        await createTodo({
          sourceType: seed?.sourceType ?? 'standalone',
          sourceId: seed?.sourceId ?? null,
          sourceDocNo: seed?.sourceDocNo ?? null,
          sourceTitle: seed?.sourceTitle ?? null,
          href: seed?.href ?? null,
          note: trimmed,
          remindEnabled,
          remindAt: remindAtIso,
        });
        toast.success('已加入待办');
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    }
  };

  return createPortal(
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-slate-900/45 p-4`}
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-black text-slate-900">{isEdit ? '编辑待办' : '新建待办'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {docLabel && (
            <div className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700">
              关联单据：{docLabel}
            </div>
          )}

          <div>
            <label className={formStandardLabelClass}>待办内容</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              maxLength={TODO_NOTE_MAX_CHARS}
              rows={3}
              placeholder="填写要跟进的事项备注…"
              className={formStandardTextareaClass}
              autoFocus
            />
          </div>

          <div>
            <button
              type="button"
              onClick={() => setRemindEnabled(v => !v)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-xs font-bold transition ${
                remindEnabled
                  ? 'border-rose-200 bg-rose-50 text-rose-600'
                  : 'border-slate-100 bg-slate-50 text-slate-500 hover:bg-slate-100'
              }`}
            >
              <span className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                定时提醒
              </span>
              <span
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
                  remindEnabled ? 'bg-rose-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    remindEnabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </span>
            </button>

            {remindEnabled && (
              <div className="mt-2">
                <label className={formStandardLabelClass}>提醒时间</label>
                <input
                  type="datetime-local"
                  value={remindAt}
                  onChange={e => setRemindAt(e.target.value)}
                  className={formStandardControlClass}
                />
                <p className="mt-1 ml-0.5 text-[10px] text-slate-400">
                  到点后将在工作台消息中心提醒
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isEdit ? '保存' : '加入待办'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default AddTodoModal;
