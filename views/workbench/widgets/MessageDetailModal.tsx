import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { DashboardNotification } from '../../../services/api/dashboard';
import { formatTimestamp } from '../../../utils/formatTime';

interface MessageDetailModalProps {
  open: boolean;
  message: DashboardNotification | null;
  onClose: () => void;
}

const MessageDetailModal: React.FC<MessageDetailModalProps> = ({ open, message, onClose }) => {
  if (!open || !message) return null;

  const isExpiry = message.type === 'expiry_reminder';

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

        <div className="flex justify-end border-t border-slate-100 px-5 py-3">
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
