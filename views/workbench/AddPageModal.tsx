import React, { useState } from 'react';
import { X } from 'lucide-react';

interface AddPageModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (title: string) => void;
}

const AddPageModal: React.FC<AddPageModalProps> = ({ open, onClose, onConfirm }) => {
  const [title, setTitle] = useState('新页面');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-900">添加页面</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <label className="mb-4 block text-xs font-bold text-slate-500">页面名称</label>
        <input
          className="mb-6 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium outline-none focus:border-indigo-400"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { onConfirm(title); onClose(); } }}
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">
            取消
          </button>
          <button
            type="button"
            onClick={() => { onConfirm(title); onClose(); }}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddPageModal;
