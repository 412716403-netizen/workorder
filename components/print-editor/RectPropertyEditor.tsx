import React from 'react';
import type { PrintBodyElement, PrintRectElementConfig } from '../../types';
import { Labeled } from './Labeled';

function RectPropertyEditorInner({
  el,
  c,
  onUpdateElementConfig,
}: {
  el: PrintBodyElement;
  c: PrintRectElementConfig;
  onUpdateElementConfig: (id: string, config: PrintBodyElement['config']) => void;
}) {
  return (
    <div className="space-y-3">
      <Labeled label="边框 (mm)">
        <input
          type="number"
          step={0.05}
          value={c.borderWidthMm}
          onChange={e => onUpdateElementConfig(el.id, { ...c, borderWidthMm: Number(e.target.value) || 0 })}
          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
        />
      </Labeled>
      <Labeled label="圆角 (mm)">
        <input
          type="number"
          step={0.1}
          value={c.cornerRadiusMm}
          onChange={e => onUpdateElementConfig(el.id, { ...c, cornerRadiusMm: Number(e.target.value) || 0 })}
          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
        />
      </Labeled>
      <Labeled label="线型">
        <select
          value={c.lineStyle}
          onChange={e => onUpdateElementConfig(el.id, { ...c, lineStyle: e.target.value as 'solid' | 'dashed' | 'dotted' })}
          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
        >
          <option value="solid">实线</option>
          <option value="dashed">虚线</option>
          <option value="dotted">点线</option>
        </select>
      </Labeled>
      <div className="grid grid-cols-2 gap-2">
        <Labeled label="边框色">
          <input
            type="color"
            value={c.borderColor.startsWith('#') ? c.borderColor : '#000'}
            onChange={e => onUpdateElementConfig(el.id, { ...c, borderColor: e.target.value })}
            className="h-9 w-full cursor-pointer rounded-lg border border-slate-200"
          />
        </Labeled>
        <Labeled label="填充色">
          <input
            type="color"
            value={c.fillColor === 'transparent' ? '#ffffff' : c.fillColor.startsWith('#') ? c.fillColor : '#ffffff'}
            onChange={e => onUpdateElementConfig(el.id, { ...c, fillColor: e.target.value })}
            className="h-9 w-full cursor-pointer rounded-lg border border-slate-200"
          />
        </Labeled>
      </div>
      <button
        type="button"
        className="text-xs font-bold text-slate-500 underline"
        onClick={() => onUpdateElementConfig(el.id, { ...c, fillColor: 'transparent' })}
      >
        填充设为透明
      </button>
    </div>
  );
}

export const RectPropertyEditor = React.memo(RectPropertyEditorInner);
