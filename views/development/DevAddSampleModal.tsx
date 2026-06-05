import React, { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import type { DevSampleDto, DevStageTemplateDto } from '../../types';
import { defaultStageNamesFromTemplates, stageNamesFromFirstDevSample } from '../../utils/devStyleVariants';
import { formStandardControlClass } from '../../styles/uiDensity';

interface DevAddSampleModalProps {
  open: boolean;
  existingSamples: DevSampleDto[];
  templates: DevStageTemplateDto[];
  onClose: () => void;
  onConfirm: (data: { name: string; stageNames: string[] }) => void;
}

const DevAddSampleModal: React.FC<DevAddSampleModalProps> = ({
  open,
  existingSamples,
  templates,
  onClose,
  onConfirm,
}) => {
  const defaultStages = useMemo(() => {
    const fromFirst = stageNamesFromFirstDevSample(existingSamples);
    if (fromFirst.length > 0) return fromFirst;
    const fromTpl = defaultStageNamesFromTemplates(templates);
    if (fromTpl.length > 0) return fromTpl;
    return ['设计', '打样', '评审'];
  }, [templates, existingSamples]);

  const [name, setName] = useState(`样品 ${existingSamples.length + 1}`);
  const [stageNames, setStageNames] = useState<string[]>(defaultStages);

  React.useEffect(() => {
    if (open) {
      setName(`样品 ${existingSamples.length + 1}`);
      setStageNames(defaultStages);
    }
  }, [open, existingSamples.length, defaultStages]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[340] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} role="presentation" />
      <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-black text-slate-900">新增样品轮次</h3>
          <button type="button" onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <label className="block">
          <span className="text-xs font-bold text-slate-500">轮次名称</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={`mt-1 w-full ${formStandardControlClass}`} />
        </label>
        <div>
          <span className="text-xs font-bold text-slate-500">开发节点（{stageNames.length} 个）</span>
          <p className="text-[10px] text-slate-400 mt-1">
            {existingSamples.length > 0 ? '与头样相同：' : ''}
            {stageNames.join(' → ')}
          </p>
        </div>
        <button
          type="button"
          className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold"
          onClick={() => {
            onConfirm({ name: name.trim() || `样品 ${existingSamples.length + 1}`, stageNames });
            onClose();
          }}
        >
          确认新增
        </button>
      </div>
    </div>
  );
};

export default DevAddSampleModal;
