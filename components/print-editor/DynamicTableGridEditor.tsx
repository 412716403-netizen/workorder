import React from 'react';
import type { PrintBodyElement, PrintTableElementConfig } from '../../types';
import type { PrintFieldOption } from './printFieldOptions';
import { Labeled } from './Labeled';
import { StaticTablePropertyEditor } from './StaticTablePropertyEditor';

function DynamicTableGridEditorInner({
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
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Labeled label="行数">
          <input
            type="number"
            min={1}
            max={20}
            value={c.rows}
            onChange={e => {
              const rows = Math.min(20, Math.max(1, Number(e.target.value) || 1));
              const cells = { ...c.cells };
              for (let r = 0; r < rows; r++) {
                for (let col = 0; col < c.cols; col++) {
                  const k = `${r}-${col}`;
                  if (!(k in cells)) cells[k] = '';
                }
              }
              onUpdateElementConfig(el.id, { ...c, rows, cells });
            }}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
        </Labeled>
        <Labeled label="列数">
          <input
            type="number"
            min={1}
            max={12}
            value={c.cols}
            onChange={e => {
              const cols = Math.min(12, Math.max(1, Number(e.target.value) || 1));
              const cells = { ...c.cells };
              for (let r = 0; r < c.rows; r++) {
                for (let col = 0; col < cols; col++) {
                  const k = `${r}-${col}`;
                  if (!(k in cells)) cells[k] = '';
                }
              }
              onUpdateElementConfig(el.id, { ...c, cols, cells });
            }}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
        </Labeled>
      </div>
      <Labeled label="边框样式">
        <select
          value={c.borderStyle}
          onChange={e => onUpdateElementConfig(el.id, { ...c, borderStyle: e.target.value as 'solid' | 'dashed' | 'none' })}
          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
        >
          <option value="solid">实线</option>
          <option value="dashed">虚线</option>
          <option value="none">无</option>
        </select>
      </Labeled>
      <Labeled label="边框色">
        <input
          type="color"
          value={c.borderColor.startsWith('#') ? c.borderColor : '#333'}
          onChange={e => onUpdateElementConfig(el.id, { ...c, borderColor: e.target.value })}
          className="h-9 w-full cursor-pointer rounded-lg border border-slate-200"
        />
      </Labeled>
      <StaticTablePropertyEditor el={el} c={c} fieldOptions={fieldOptions} onUpdateElementConfig={onUpdateElementConfig} />
    </div>
  );
}

export const DynamicTableGridEditor = React.memo(DynamicTableGridEditorInner);
