import React, { useEffect, useState } from 'react';
import type {
  PrintBodyElement,
  PrintTableElementConfig,
} from '../../types';
import type { PrintFieldOption } from './printFieldOptions';
import { FieldPicker } from './FieldPicker';
import { Labeled } from './Labeled';

function StaticTablePropertyEditorInner({
  el,
  c,
  fieldOptions,
  onUpdateElementConfig,
}: {
  el: PrintBodyElement;
  c: PrintTableElementConfig;
  fieldOptions: PrintFieldOption[];
  onUpdateElementConfig: (id: string, config: PrintBodyElement['config']) => void;
}) {
  const [cellIdx, setCellIdx] = useState(0);
  const total = Math.max(0, c.rows * c.cols);
  const safeIdx = total > 0 ? Math.min(cellIdx, total - 1) : 0;
  const row = total > 0 ? Math.floor(safeIdx / c.cols) : 0;
  const col = total > 0 ? safeIdx % c.cols : 0;
  const k = `${row}-${col}`;

  useEffect(() => {
    setCellIdx(i => (total <= 0 ? 0 : Math.min(i, total - 1)));
  }, [el.id, c.rows, c.cols, total]);

  const content = c.cells[k] ?? '';
  const textAlign = c.cellTextAlign?.[k] ?? 'center';
  const color = c.cellColors?.[k] ?? '#000000';
  const fontSizePt = c.cellFontSizePt?.[k];
  const fontWeight = c.cellFontWeight?.[k];

  const patchCell = (
    patch: Partial<{
      content: string;
      textAlign: 'left' | 'center' | 'right';
      color: string;
      fontSizePt: number | null;
      fontWeight: 'normal' | 'bold' | null;
    }>,
  ) => {
    let next: PrintTableElementConfig = { ...c };
    if (patch.content !== undefined) {
      next = { ...next, cells: { ...c.cells, [k]: patch.content } };
    }
    if (patch.textAlign !== undefined) {
      next = { ...next, cellTextAlign: { ...(c.cellTextAlign ?? {}), [k]: patch.textAlign } };
    }
    if (patch.color !== undefined) {
      next = { ...next, cellColors: { ...(c.cellColors ?? {}), [k]: patch.color } };
    }
    if (patch.fontSizePt !== undefined) {
      const m = { ...(c.cellFontSizePt ?? {}) };
      if (patch.fontSizePt == null || patch.fontSizePt <= 0) delete m[k];
      else m[k] = patch.fontSizePt;
      next.cellFontSizePt = Object.keys(m).length ? m : undefined;
    }
    if (patch.fontWeight !== undefined) {
      const m = { ...(c.cellFontWeight ?? {}) };
      if (patch.fontWeight == null) delete m[k];
      else m[k] = patch.fontWeight;
      next.cellFontWeight = Object.keys(m).length ? m : undefined;
    }
    onUpdateElementConfig(el.id, next);
  };

  if (total === 0) {
    return <p className="text-xs text-slate-400">请先设置行数与列数</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-black uppercase text-slate-400">单元格</p>
      <Labeled label="当前单元格">
        <select
          value={safeIdx}
          onChange={e => setCellIdx(Number(e.target.value))}
          className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold"
        >
          {Array.from({ length: total }, (_, i) => {
            const r = Math.floor(i / c.cols);
            const cc = i % c.cols;
            return (
              <option key={`${r}-${cc}`} value={i}>
                第 {r + 1} 行 · 第 {cc + 1} 列
              </option>
            );
          })}
        </select>
      </Labeled>
      <Labeled label="内容">
        <div className="flex gap-1">
          <textarea
            value={content}
            onChange={e => patchCell({ content: e.target.value })}
            rows={3}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
          <FieldPicker options={fieldOptions} onPick={ph => patchCell({ content: content + ph })} />
        </div>
      </Labeled>
      <Labeled label="对齐方式">
        <div className="flex gap-1">
          {(['left', 'center', 'right'] as const).map(a => (
            <button
              key={a}
              type="button"
              onClick={() => patchCell({ textAlign: a })}
              className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${textAlign === a ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              {a === 'left' ? '左' : a === 'center' ? '中' : '右'}
            </button>
          ))}
        </div>
      </Labeled>
      <Labeled label="文字颜色">
        <input
          type="color"
          value={color.startsWith('#') ? color : '#000000'}
          onChange={e => patchCell({ color: e.target.value })}
          className="h-9 w-full cursor-pointer rounded-lg border border-slate-200"
        />
      </Labeled>
      <Labeled label="字号 (pt)">
        <input
          type="number"
          min={1}
          max={48}
          step={0.5}
          placeholder="默认 6"
          value={fontSizePt != null && fontSizePt > 0 ? fontSizePt : ''}
          onChange={e => {
            const raw = e.target.value;
            if (raw === '') patchCell({ fontSizePt: null });
            else {
              const n = Number(raw);
              patchCell({ fontSizePt: Number.isFinite(n) && n > 0 ? n : null });
            }
          }}
          className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold"
        />
      </Labeled>
      <Labeled label="字重">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => patchCell({ fontWeight: null })}
            className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${fontWeight !== 'bold' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            常规
          </button>
          <button
            type="button"
            onClick={() => patchCell({ fontWeight: 'bold' })}
            className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${fontWeight === 'bold' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            加粗
          </button>
        </div>
      </Labeled>
    </div>
  );
}

export const StaticTablePropertyEditor = React.memo(StaticTablePropertyEditorInner);
