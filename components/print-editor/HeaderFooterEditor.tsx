import React from 'react';
import { Trash2 } from 'lucide-react';
import type {
  PrintHeaderFooterConfig,
  PrintHeaderFooterItem,
} from '../../types';
import type { PrintFieldOption } from './printFieldOptions';
import { FieldPicker } from './FieldPicker';
import { Labeled } from './Labeled';

function HeaderFooterEditorInner({
  title,
  config,
  onChange,
  onDelete,
  fieldOptions,
}: {
  title: string;
  config: PrintHeaderFooterConfig;
  onChange: (c: PrintHeaderFooterConfig) => void;
  onDelete: () => void;
  fieldOptions: PrintFieldOption[];
}) {
  const patchItem = (slot: PrintHeaderFooterItem['slot'], patch: Partial<PrintHeaderFooterItem>) => {
    const items = [...config.items];
    const idx = items.findIndex(i => i.slot === slot);
    const base: PrintHeaderFooterItem = items[idx] ?? {
      slot,
      content: '',
      fontSizePt: 9,
      fontWeight: 'normal',
      textAlign: slot === 'left' ? 'left' : slot === 'right' ? 'right' : 'center',
      color: '#0f172a',
    };
    const next = { ...base, ...patch };
    if (idx >= 0) items[idx] = next;
    else items.push(next);
    onChange({ ...config, items });
  };

  const item = (slot: PrintHeaderFooterItem['slot']) =>
    config.items.find(i => i.slot === slot) ?? {
      slot,
      content: '',
      fontSizePt: 9,
      fontWeight: 'normal',
      textAlign: (slot === 'left' ? 'left' : slot === 'right' ? 'right' : 'center') as 'left' | 'center' | 'right',
      color: '#0f172a',
    };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-black text-slate-800">{title}</h3>
      <Labeled label="高度 (mm)">
        <input
          type="number"
          step={0.1}
          value={config.heightMm}
          onChange={e => onChange({ ...config, heightMm: Number(e.target.value) || 0 })}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold"
        />
      </Labeled>
      <div className="grid grid-cols-2 gap-2">
        <Labeled label="背景色">
          <input
            type="color"
            value={config.backgroundColor.startsWith('#') ? config.backgroundColor : '#f1f5f9'}
            onChange={e => onChange({ ...config, backgroundColor: e.target.value })}
            className="h-10 w-full cursor-pointer rounded-lg border border-slate-200"
          />
        </Labeled>
        <Labeled label="边框色">
          <input
            type="color"
            value={config.borderColor.startsWith('#') ? config.borderColor : '#cbd5e1'}
            onChange={e => onChange({ ...config, borderColor: e.target.value })}
            className="h-10 w-full cursor-pointer rounded-lg border border-slate-200"
          />
        </Labeled>
      </div>
      <Labeled label="边框粗细 (mm)">
        <input
          type="number"
          step={0.1}
          value={config.borderWidthMm}
          onChange={e => onChange({ ...config, borderWidthMm: Number(e.target.value) || 0 })}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold"
        />
      </Labeled>
      {(['left', 'center', 'right'] as const).map(slot => {
        const it = item(slot);
        return (
          <div key={slot} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 space-y-2">
            <span className="text-[10px] font-black uppercase text-slate-400">{slot === 'left' ? '左侧' : slot === 'center' ? '居中' : '右侧'}</span>
            <div className="flex gap-1">
              <textarea
                value={it.content}
                onChange={e => patchItem(slot, { content: e.target.value })}
                rows={2}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium"
              />
              <FieldPicker options={fieldOptions} onPick={ph => patchItem(slot, { content: it.content + ph })} />
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="number"
                title="字号 pt"
                value={it.fontSizePt}
                onChange={e => patchItem(slot, { fontSizePt: Number(e.target.value) || 8 })}
                className="w-16 rounded border border-slate-200 px-1 py-1 text-xs"
              />
              <select
                value={it.fontWeight}
                onChange={e => patchItem(slot, { fontWeight: e.target.value as 'normal' | 'bold' })}
                className="rounded border border-slate-200 px-1 py-1 text-xs"
              >
                <option value="normal">常规</option>
                <option value="bold">加粗</option>
              </select>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={onDelete}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-100"
      >
        <Trash2 className="h-4 w-4" /> 删除{title}
      </button>
    </div>
  );
}

export const HeaderFooterEditor = React.memo(HeaderFooterEditorInner);
