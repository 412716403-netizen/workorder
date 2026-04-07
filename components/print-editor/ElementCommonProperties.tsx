import React from 'react';
import { ChevronsUp, ChevronsDown } from 'lucide-react';
import type { PrintBodyElement, PrintImageElementConfig } from '../../types';
import { Labeled } from './Labeled';

function ElementCommonPropertiesInner({
  el,
  onUpdateElement,
  bringToFront,
  sendToBack,
}: {
  el: PrintBodyElement;
  onUpdateElement: (id: string, patch: Partial<PrintBodyElement>) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
}) {
  const imageLockedAspectR =
    el.type === 'image'
      ? (() => {
          const ic = el.config as PrintImageElementConfig;
          if (ic.keepAspectRatio === false) return null as number | null;
          if (ic.naturalAspectRatio != null && ic.naturalAspectRatio > 0) return ic.naturalAspectRatio;
          return el.width / Math.max(el.height, 0.01);
        })()
      : null;

  return (
    <div className="space-y-3 border-b border-slate-100 pb-4">
      <p className="text-[10px] font-black uppercase text-slate-400">通用配置</p>
      <div className="grid grid-cols-2 gap-2">
        <Labeled label={el.type === 'line' ? '线长 (mm)' : '宽 (mm)'}>
          <input
            type="number"
            step={0.1}
            value={el.width}
            onChange={e => {
              const minW = el.type === 'line' ? 2 : el.type === 'image' ? 2 : 0.5;
              const w = Math.max(minW, Number(e.target.value) || 0);
              if (el.type === 'image' && imageLockedAspectR) {
                const h = w / imageLockedAspectR;
                onUpdateElement(el.id, { width: w, height: Math.max(0.5, h) });
              } else {
                onUpdateElement(el.id, { width: w });
              }
            }}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold"
          />
        </Labeled>
        <Labeled label={el.type === 'line' ? '线粗占位 (mm)' : '高 (mm)'}>
          <input
            type="number"
            step={0.1}
            value={el.height}
            onChange={e => {
              const h = Math.max(0.5, Number(e.target.value) || 0);
              if (el.type === 'image' && imageLockedAspectR) {
                const w = h * imageLockedAspectR;
                onUpdateElement(el.id, { width: Math.max(2, w), height: h });
              } else {
                onUpdateElement(el.id, { height: h });
              }
            }}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold"
          />
        </Labeled>
        <Labeled label="X (mm)">
          <input
            type="number"
            step={0.1}
            value={el.x}
            onChange={e => onUpdateElement(el.id, { x: Number(e.target.value) || 0 })}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold"
          />
        </Labeled>
        <Labeled label="Y (mm)">
          <input
            type="number"
            step={0.1}
            value={el.y}
            onChange={e => onUpdateElement(el.id, { y: Number(e.target.value) || 0 })}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold"
          />
        </Labeled>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => bringToFront(el.id)} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 py-2 text-xs font-bold hover:bg-slate-50">
          <ChevronsUp className="h-3.5 w-3.5" /> 置顶
        </button>
        <button type="button" onClick={() => sendToBack(el.id)} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 py-2 text-xs font-bold hover:bg-slate-50">
          <ChevronsDown className="h-3.5 w-3.5" /> 置底
        </button>
      </div>
      <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
        <input type="checkbox" checked={!!el.locked} onChange={e => onUpdateElement(el.id, { locked: e.target.checked })} />
        锁定组件
      </label>
      <div>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
          <input type="checkbox" checked={!!el.repeatPerPage} onChange={e => onUpdateElement(el.id, { repeatPerPage: e.target.checked })} />
          每页重复
        </label>
        <p className="mt-1 pl-6 text-[10px] leading-relaxed text-slate-500">存在多页时生效：勾选后该组件在每一页都绘制（如页码、续页表头）。</p>
      </div>
    </div>
  );
}

export const ElementCommonProperties = React.memo(ElementCommonPropertiesInner);
