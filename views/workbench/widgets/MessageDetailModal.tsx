import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X, ArrowRight, CheckCircle2, Circle, Loader2 } from 'lucide-react';
import type { DashboardNotification } from '../../../services/api/dashboard';
import { formatTimestamp } from '../../../utils/formatTime';
import { useTodos } from '../../../hooks/useTodos';
import { navigateTodoHref } from '../../../utils/todoHrefNavigate';

interface MessageDetailModalProps {
  open: boolean;
  message: DashboardNotification | null;
  onClose: () => void;
}

const MessageDetailModal: React.FC<MessageDetailModalProps> = ({ open, message, onClose }) => {
  const navigate = useNavigate();
  // enabled:false 只取 mutation，不触发列表请求
  const { updateTodo, isUpdating } = useTodos({ enabled: false });
  // 复选框乐观状态：null 表示沿用通知标题里的完成标记；切换消息时重置
  const [doneOverride, setDoneOverride] = useState<boolean | null>(null);
  useEffect(() => {
    setDoneOverride(null);
  }, [message?.id]);
  if (!open || !message) return null;

  const isExpiry = message.type === 'expiry_reminder';
  const href = message.href;
  const isTodo = message.type === 'todo' && message.id.startsWith('todo-');
  const todoId = isTodo ? message.id.slice('todo-'.length) : null;
  const isDone = doneOverride ?? message.done === true;

  const handleToggleDone = async () => {
    if (!todoId || isUpdating) return;
    const next = !isDone;
    setDoneOverride(next);
    try {
      await updateTodo({ id: todoId, body: { status: next ? 'done' : 'open' } });
    } catch {
      // 失败回退复选框状态，便于重试
      setDoneOverride(!next);
    }
  };

  const handleJump = () => {
    if (!href) return;
    navigateTodoHref(navigate, href);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/45 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="message-detail-title"
        onClick={e => e.stopPropagation()}
      >
        <div
          className={`border-b border-slate-100 px-5 py-4 ${isExpiry ? 'bg-amber-50/80' : 'bg-slate-50/80'}`}
        >
          <div className="flex items-start justify-between gap-3 pr-1">
            <div className="flex min-w-0 flex-1 items-start gap-2.5">
              {isTodo && (
                <button
                  type="button"
                  onClick={handleToggleDone}
                  disabled={isUpdating}
                  aria-pressed={isDone}
                  aria-label={isDone ? '取消完成' : '标记完成'}
                  title={isDone ? '取消完成' : '标记完成'}
                  className={`mt-0.5 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    isDone ? 'text-emerald-600' : 'text-slate-300 hover:text-emerald-600'
                  }`}
                >
                  {isUpdating ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : isDone ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </button>
              )}
              <div className="min-w-0 flex-1">
                <h2
                  id="message-detail-title"
                  className={`text-base font-black leading-snug ${isExpiry ? 'text-amber-900' : 'text-slate-900'}`}
                >
                  {message.title}
                </h2>
                <p className="mt-1.5 text-[11px] text-slate-400">
                  {formatTimestamp(message.createdAt)}
                  {message.publisherName ? ` · 发布人：${message.publisherName}` : ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-600"
              aria-label="关闭"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="max-h-[min(60vh,420px)] overflow-y-auto px-5 py-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
            {message.body}
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          {isTodo && (
            <button
              type="button"
              onClick={handleToggleDone}
              disabled={isUpdating}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                isDone
                  ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              {isUpdating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {isDone ? '取消完成' : '标记完成'}
            </button>
          )}
          {href && (
            <button
              type="button"
              onClick={handleJump}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
            >
              前往单据 <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200"
          >
            关闭
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default MessageDetailModal;
