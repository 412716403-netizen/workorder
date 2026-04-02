import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Type, QrCode, Minus, Square, Image, Table2, ListOrdered, PanelTop, PanelBottom } from 'lucide-react';
import type { PrintBodyElementType } from '../../types';

export type PaletteDropType = PrintBodyElementType | 'header' | 'footer';

function DraggableChip({
  paletteType,
  label,
  description,
  icon: Icon,
  onPick,
}: {
  paletteType: PaletteDropType;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  onPick?: (t: PaletteDropType) => void;
}) {
  const id = `palette-${paletteType}`;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data: { paletteType } });
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onPick?.(paletteType)}
      title={description}
      className={`flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-bold text-slate-700 shadow-sm hover:border-indigo-200 hover:bg-indigo-50/50 active:scale-[0.99] ${isDragging ? 'opacity-60' : ''}`}
    >
      <Icon className="h-4 w-4 shrink-0 text-indigo-500" />
      <span className="min-w-0 flex-1">
        <span className="block leading-tight">{label}</span>
        {description ? <span className="mt-0.5 block text-[10px] font-semibold leading-snug text-slate-500">{description}</span> : null}
      </span>
    </button>
  );
}

export function ComponentLibrary({ onPick }: { onPick?: (t: PaletteDropType) => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col border-r border-slate-200 bg-slate-50/80">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">组件库</h2>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        <div>
          <p className="mb-2 px-1 text-[10px] font-black uppercase text-slate-400">基础组件</p>
          <div className="space-y-2">
            <DraggableChip paletteType="text" label="文本" icon={Type} onPick={onPick} />
            <DraggableChip paletteType="qrcode" label="二维码" icon={QrCode} onPick={onPick} />
            <DraggableChip paletteType="line" label="线条" icon={Minus} onPick={onPick} />
            <DraggableChip paletteType="rect" label="矩形" icon={Square} onPick={onPick} />
            <DraggableChip paletteType="image" label="图片" icon={Image} onPick={onPick} />
            <DraggableChip paletteType="dynamicTable" label="静态表格" icon={Table2} onPick={onPick} />
            <DraggableChip
              paletteType="dynamicList"
              label="动态列表"
              description="可自动分页的数据列表"
              icon={ListOrdered}
              onPick={onPick}
            />
          </div>
        </div>
        <div>
          <p className="mb-2 px-1 text-[10px] font-black uppercase text-slate-400">页面布局</p>
          <div className="space-y-2">
            <DraggableChip paletteType="header" label="页眉" icon={PanelTop} onPick={onPick} />
            <DraggableChip paletteType="footer" label="页脚" icon={PanelBottom} onPick={onPick} />
          </div>
        </div>
        <p className="px-1 text-[10px] leading-relaxed text-slate-400">点击或拖拽组件到画布上</p>
      </div>
    </div>
  );
}
