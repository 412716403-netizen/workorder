import React, { useState } from 'react';
import { Sliders, X } from 'lucide-react';
import type { MaterialPanelSettings } from '../../types';

interface MaterialPanelConfigModalProps {
  onClose: () => void;
  settings: MaterialPanelSettings;
  onUpdate: (settings: MaterialPanelSettings) => void;
}

const MaterialPanelConfigModal: React.FC<MaterialPanelConfigModalProps> = ({
  onClose,
  settings,
  onUpdate,
}) => {
  const [draft, setDraft] = useState<MaterialPanelSettings>(() => ({ ...settings }));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md rounded-[32px] shadow-2xl flex flex-col overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-indigo-500" /> 生产物料配置
            </h3>
            <p className="text-xs text-slate-500 mt-1">配置生产物料面板展示方式</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-6">
          <label className="flex items-center justify-between cursor-pointer group">
            <div>
              <div className="text-sm font-bold text-slate-800 group-hover:text-indigo-600">按委外加工厂展示</div>
              <div className="text-xs text-slate-400 mt-0.5">开启后列表按 加工厂 → 产品/工单 → 物料 三层结构展示</div>
            </div>
            <div
              className={`relative w-11 h-6 rounded-full transition-colors ${draft.groupByOutsourcePartner ? 'bg-indigo-600' : 'bg-slate-200'}`}
              onClick={() => setDraft(d => ({ ...d, groupByOutsourcePartner: !d.groupByOutsourcePartner }))}
            >
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${draft.groupByOutsourcePartner ? 'translate-x-5' : ''}`} />
            </div>
          </label>
        </div>

        <div className="px-8 py-6 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800">取消</button>
          <button
            onClick={() => { onUpdate(draft); onClose(); }}
            className="px-8 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700"
          >
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(MaterialPanelConfigModal);
