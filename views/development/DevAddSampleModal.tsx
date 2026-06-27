import React, { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import type { DevSampleDto, DevStageTemplateDto, DevStyleVariantDto, AppDictionaries } from '../../types';
import {
  defaultStageNamesFromTemplates,
  devStyleVariantLabel,
  stageNamesFromFirstDevSample,
} from '../../utils/devStyleVariants';
import { formStandardControlClass, formStandardLabelClass, primaryToolbarButtonClass, sectionTitleClass } from '../../styles/uiDensity';

interface DevAddSampleModalProps {
  open: boolean;
  existingSamples: DevSampleDto[];
  templates: DevStageTemplateDto[];
  /** 款式创建时配置的默认开发流程节点；新增首个样品（头样）时带出 */
  defaultStageNames?: string[];
  /** 款式已配置的颜色尺码组合；非空时样品须单选一个 */
  variants?: DevStyleVariantDto[];
  dictionaries?: AppDictionaries;
  onClose: () => void;
  onConfirm: (data: { name: string; stageNames: string[]; colorId?: string; sizeId?: string }) => void;
}

function variantKey(colorId: string, sizeId: string): string {
  return `${colorId}__${sizeId}`;
}

const DevAddSampleModal: React.FC<DevAddSampleModalProps> = ({
  open,
  existingSamples,
  templates,
  defaultStageNames = [],
  variants = [],
  dictionaries,
  onClose,
  onConfirm,
}) => {
  const isFirstSample = existingSamples.length === 0;

  const defaultStages = useMemo(() => {
    // 优先用款式当前的默认开发流程（可在「编辑款式」里重新编辑）；
    // 这样开发节点变更后，新建样品按新节点。无默认流程时回退到头样/节点库。
    if (defaultStageNames.length > 0) return defaultStageNames;
    const fromFirst = stageNamesFromFirstDevSample(existingSamples);
    if (fromFirst.length > 0) return fromFirst;
    const fromTpl = defaultStageNamesFromTemplates(templates);
    if (fromTpl.length > 0) return fromTpl;
    return ['设计', '打样', '评审'];
  }, [templates, existingSamples, defaultStageNames]);

  const hasColorSize = variants.length > 0;
  const defaultName = isFirstSample ? '头样' : `样品 ${existingSamples.length + 1}`;

  const [name, setName] = useState(defaultName);
  const [stageNames, setStageNames] = useState<string[]>(defaultStages);
  const [variantKeyValue, setVariantKeyValue] = useState('');

  React.useEffect(() => {
    if (open) {
      setName(defaultName);
      setStageNames(defaultStages);
      setVariantKeyValue('');
    }
  }, [open, defaultName, defaultStages]);

  if (!open) return null;

  const handleConfirm = () => {
    let colorId: string | undefined;
    let sizeId: string | undefined;
    if (hasColorSize) {
      if (!variantKeyValue) {
        toast.error('请选择该样品对应的颜色尺码');
        return;
      }
      const picked = variants.find((v) => variantKey(v.colorId, v.sizeId) === variantKeyValue);
      colorId = picked?.colorId || undefined;
      sizeId = picked?.sizeId || undefined;
    }
    onConfirm({
      name: name.trim() || defaultName,
      stageNames,
      colorId,
      sizeId,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[340] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} role="presentation" />
      <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-4">
        <div className="flex justify-between items-center">
          <h3 className={sectionTitleClass}>{isFirstSample ? '新增头样' : '新增样品轮次'}</h3>
          <button type="button" onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <label className="block">
          <span className={formStandardLabelClass}>轮次名称</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={`mt-1 w-full ${formStandardControlClass}`} />
        </label>
        {hasColorSize && (
          <label className="block">
            <span className={formStandardLabelClass}>
              颜色尺码 <span className="text-rose-500">*</span>
            </span>
            <select
              value={variantKeyValue}
              onChange={(e) => setVariantKeyValue(e.target.value)}
              className={`mt-1 w-full ${formStandardControlClass}`}
            >
              <option value="">请选择该样品对应的颜色尺码</option>
              {variants.map((v) => (
                <option key={variantKey(v.colorId, v.sizeId)} value={variantKey(v.colorId, v.sizeId)}>
                  {dictionaries ? devStyleVariantLabel(v, dictionaries) : (v.skuSuffix || `${v.colorId}-${v.sizeId}`)}
                </option>
              ))}
            </select>
          </label>
        )}
        <div>
          <span className={formStandardLabelClass}>开发节点（{stageNames.length} 个）</span>
          <p className="mt-1 text-xs text-slate-400">
            按款式开发流程：{stageNames.join(' → ')}
          </p>
        </div>
        <button
          type="button"
          className={`w-full justify-center bg-indigo-600 text-white hover:bg-indigo-700 ${primaryToolbarButtonClass}`}
          onClick={handleConfirm}
        >
          确认新增
        </button>
      </div>
    </div>
  );
};

export default DevAddSampleModal;
