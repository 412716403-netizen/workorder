import React, { useCallback, useState } from 'react';
import { Sliders, X } from 'lucide-react';
import { toast } from 'sonner';
import type { MaterialPanelSettings } from '../../types';

interface MaterialPanelConfigModalProps {
  onClose: () => void;
  settings: MaterialPanelSettings;
  onUpdate: (settings: MaterialPanelSettings) => void | Promise<void>;
}

const MaterialPanelConfigModal: React.FC<MaterialPanelConfigModalProps> = ({
  onClose,
  settings,
  onUpdate,
}) => {
  const [draft, setDraft] = useState<MaterialPanelSettings>(() => ({ ...settings }));
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');

  const toggleGroupByOutsourcePartner = useCallback(async () => {
    const next = { ...draft, groupByOutsourcePartner: !draft.groupByOutsourcePartner };
    setDraft(next);
    setSaveStatus('saving');
    try {
      await onUpdate(next);
      setSaveStatus('saved');
    } catch (error) {
      setDraft(draft);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`自动保存失败：${message}`);
      setSaveStatus('error');
    }
  }, [draft, onUpdate]);

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
              onClick={() => { void toggleGroupByOutsourcePartner(); }}
            >
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${draft.groupByOutsourcePartner ? 'translate-x-5' : ''}`} />
            </div>
          </label>
        </div>

        <div className="px-8 py-5 border-t border-slate-100 flex items-center justify-between gap-3">
          <span className={`text-xs font-semibold ${saveStatus === 'error' ? 'text-rose-600' : saveStatus === 'saved' ? 'text-emerald-600' : 'text-slate-500'}`}>
            {saveStatus === 'saving' ? '正在保存…' : saveStatus === 'saved' ? '✓ 已保存' : '保存失败，请再次切换重试'}
          </span>
          <button onClick={onClose} className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800">关闭</button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(MaterialPanelConfigModal);
