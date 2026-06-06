import React from 'react';
import { X } from 'lucide-react';
import type { DevLogDto } from '../../types';
import { sectionTitleClass } from '../../styles/uiDensity';

interface DevStyleLogModalProps {
  open: boolean;
  sampleName: string;
  logs: DevLogDto[];
  onClose: () => void;
}

const DevStyleLogModal: React.FC<DevStyleLogModalProps> = ({ open, sampleName, logs, onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} role="presentation" />
      <div className="relative bg-white w-full max-w-lg max-h-[80vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className={sectionTitleClass}>版本日志 · {sampleName}</h3>
          <button type="button" onClick={onClose} className="p-2 text-slate-400"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-3 text-xs">
          {logs.length === 0 ? (
            <p className="text-slate-400 text-center py-8">暂无日志</p>
          ) : (
            logs.map((l) => (
              <div key={l.id} className="border-b border-slate-100 pb-3">
                <div className="flex justify-between gap-2">
                  <span className="font-semibold text-slate-800">{l.user}</span>
                  <span className="text-slate-400 shrink-0">{new Date(l.time).toLocaleString()}</span>
                </div>
                <p className="text-slate-600 mt-1">{l.action}</p>
                {l.detail && <p className="text-slate-500 mt-0.5">{l.detail}</p>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default DevStyleLogModal;
