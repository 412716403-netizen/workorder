import React from 'react';
import type { PrintBodyElement, PrintQRCodeElementConfig } from '../../types';
import type { PrintFieldOption } from './printFieldOptions';
import { FieldPicker } from './FieldPicker';

function QRCodePropertyEditorInner({
  el,
  c,
  fieldOptions,
  onUpdateElementConfig,
}: {
  el: PrintBodyElement;
  c: PrintQRCodeElementConfig;
  fieldOptions: PrintFieldOption[];
  onUpdateElementConfig: (id: string, config: PrintBodyElement['config']) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-black uppercase text-slate-400">二维码内容</p>
      <div className="flex gap-1">
        <textarea
          value={c.content}
          onChange={e => onUpdateElementConfig(el.id, { ...c, content: e.target.value })}
          rows={3}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
        />
        <FieldPicker options={fieldOptions} onPick={ph => onUpdateElementConfig(el.id, { ...c, content: c.content + ph })} />
      </div>
    </div>
  );
}

export const QRCodePropertyEditor = React.memo(QRCodePropertyEditorInner);
