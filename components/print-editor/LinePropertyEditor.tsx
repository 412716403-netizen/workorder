import React from 'react';
import type { PrintBodyElement, PrintLineElementConfig } from '../../types';
import { Labeled } from './Labeled';

function LinePropertyEditorInner({
  el,
  c,
  onUpdateElementConfig,
}: {
  el: PrintBodyElement;
  c: PrintLineElementConfig;
  onUpdateElementConfig: (id: string, config: PrintBodyElement['config']) => void;
}) {
  return (
    <div className="space-y-3">
      <Labeled label="角度 (°)">
        <input
          type="number"
          step={1}
          value={c.angleDeg ?? 0}
          onChange={e => onUpdateElementConfig(el.id, { ...c, angleDeg: Number(e.target.value) || 0 })}
          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
        />
      </Labeled>
      <Labeled label="粗细 (mm)">
        <input
          type="number"
          step={0.05}
          value={c.thicknessMm}
          onChange={e => onUpdateElementConfig(el.id, { ...c, thicknessMm: Number(e.target.value) || 0.1 })}
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
      <Labeled label="颜色">
        <input
          type="color"
          value={c.color.startsWith('#') ? c.color : '#000000'}
          onChange={e => onUpdateElementConfig(el.id, { ...c, color: e.target.value })}
          className="h-9 w-full cursor-pointer rounded-lg border border-slate-200"
        />
      </Labeled>
    </div>
  );
}

export const LinePropertyEditor = React.memo(LinePropertyEditorInner);
