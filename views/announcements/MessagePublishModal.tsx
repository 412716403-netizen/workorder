import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';

interface MessagePublishModalProps {
  open: boolean;
  isSaving?: boolean;
  onClose: () => void;
  onPublish: (payload: { title: string; body: string }) => void;
}

const MessagePublishModal: React.FC<MessagePublishModalProps> = ({
  open,
  isSaving,
  onClose,
  onPublish,
}) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (!open) {
      setTitle('');
      setBody('');
    }
  }, [open]);

  if (!open) return null;

  const handleClose = () => {
    setTitle('');
    setBody('');
    onClose();
  };

  const handleSubmit = () => {
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) return;
    onPublish({ title: t, body: b });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 p-4"
      role="presentation"
      onClick={handleClose}
    >
      <div
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="message-publish-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 id="message-publish-title" className="text-lg font-black text-slate-900">
            发布消息
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-600">标题</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={80}
              placeholder="例如：端午节放假通知"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-indigo-100 focus:border-indigo-300 focus:ring-2"
            />
            <p className="mt-1 text-[10px] text-slate-400">{title.length}/80</p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-600">内容</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              maxLength={2000}
              rows={6}
              placeholder="请输入要通知全员的消息内容…"
              className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-indigo-100 focus:border-indigo-300 focus:ring-2"
            />
            <p className="mt-1 text-[10px] text-slate-400">{body.length}/2000</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!title.trim() || !body.trim() || isSaving}
            onClick={handleSubmit}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            发布
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default MessagePublishModal;
