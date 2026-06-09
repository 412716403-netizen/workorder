import React, { useEffect, useState } from 'react';

interface KnowledgeFolderModalProps {
  open: boolean;
  mode: 'create' | 'rename';
  initialName?: string;
  title?: string;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}

const KnowledgeFolderModal: React.FC<KnowledgeFolderModalProps> = ({
  open,
  mode,
  initialName = '',
  title,
  submitting,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  if (!open) return null;

  const heading = title ?? (mode === 'create' ? '新建文件夹' : '重命名文件夹');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl mx-4"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-slate-900 mb-4">{heading}</h3>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="文件夹名称"
          autoFocus
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          onKeyDown={e => {
            if (e.key === 'Enter' && name.trim()) onSubmit(name.trim());
          }}
        />
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!name.trim() || submitting}
            onClick={() => onSubmit(name.trim())}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? '保存中…' : '确定'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeFolderModal;
