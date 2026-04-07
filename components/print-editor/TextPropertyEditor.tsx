import React from 'react';
import type { PrintBodyElement, PrintTextElementConfig } from '../../types';
import type { PrintFieldOption } from './printFieldOptions';
import { FieldPicker } from './FieldPicker';
import { Labeled } from './Labeled';

function TextPropertyEditorInner({
  el,
  c,
  fieldOptions,
  onUpdateElementConfig,
}: {
  el: PrintBodyElement;
  c: PrintTextElementConfig;
  fieldOptions: PrintFieldOption[];
  onUpdateElementConfig: (id: string, config: PrintBodyElement['config']) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-black uppercase text-slate-400">文本</p>
      <div className="flex gap-1">
        <textarea
          value={c.content}
          onChange={e => onUpdateElementConfig(el.id, { ...c, content: e.target.value })}
          rows={3}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
        />
        <FieldPicker options={fieldOptions} onPick={ph => onUpdateElementConfig(el.id, { ...c, content: c.content + ph })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Labeled label="字号 pt">
          <input
            type="number"
            value={c.fontSizePt}
            onChange={e => onUpdateElementConfig(el.id, { ...c, fontSizePt: Number(e.target.value) || 8 })}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
        </Labeled>
        <Labeled label="字重">
          <select
            value={c.fontWeight}
            onChange={e => onUpdateElementConfig(el.id, { ...c, fontWeight: e.target.value as 'normal' | 'bold' })}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          >
            <option value="normal">常规</option>
            <option value="bold">加粗</option>
          </select>
        </Labeled>
      </div>
      <Labeled label="对齐">
        <div className="flex gap-1">
          {(['left', 'center', 'right'] as const).map(a => (
            <button
              key={a}
              type="button"
              onClick={() => onUpdateElementConfig(el.id, { ...c, textAlign: a })}
              className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${c.textAlign === a ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              {a === 'left' ? '左' : a === 'center' ? '中' : '右'}
            </button>
          ))}
        </div>
      </Labeled>
      <Labeled label="颜色">
        <input
          type="color"
          value={c.color.startsWith('#') ? c.color : '#111827'}
          onChange={e => onUpdateElementConfig(el.id, { ...c, color: e.target.value })}
          className="h-9 w-full cursor-pointer rounded-lg border border-slate-200"
        />
      </Labeled>
      <label className="flex items-center gap-2 text-xs font-bold">
        <input type="checkbox" checked={!!c.renderAsQr} onChange={e => onUpdateElementConfig(el.id, { ...c, renderAsQr: e.target.checked })} />
        显示为二维码
      </label>
    </div>
  );
}

export const TextPropertyEditor = React.memo(TextPropertyEditorInner);
