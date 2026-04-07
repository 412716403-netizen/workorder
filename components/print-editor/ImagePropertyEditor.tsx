import React, { useRef } from 'react';
import type { PrintBodyElement, PrintImageElementConfig } from '../../types';
import type { PrintFieldOption } from './printFieldOptions';
import { FieldPicker } from './FieldPicker';
import { Labeled } from './Labeled';

function ImagePropertyEditorInner({
  el,
  c,
  fieldOptions,
  onUpdateElement,
  onUpdateElementConfig,
}: {
  el: PrintBodyElement;
  c: PrintImageElementConfig;
  fieldOptions: PrintFieldOption[];
  onUpdateElement: (id: string, patch: Partial<PrintBodyElement>) => void;
  onUpdateElementConfig: (id: string, config: PrintBodyElement['config']) => void;
}) {
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const srcType = c.sourceType ?? 'upload';

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-black uppercase text-slate-400">图片配置</p>
      <div>
        <p className="mb-1.5 text-[10px] font-bold text-slate-500">来源类型</p>
        <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
          {(['upload', 'url', 'field'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() =>
                onUpdateElementConfig(el.id, {
                  ...c,
                  sourceType: t,
                  src: t === 'field' && !c.src ? '{{产品.imageUrl}}' : c.src,
                })
              }
              className={`flex-1 rounded-lg py-2 text-xs font-black transition-colors ${
                srcType === t ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t === 'upload' ? '上传' : t === 'url' ? '地址' : '字段'}
            </button>
          ))}
        </div>
      </div>
      {srcType === 'upload' && (
        <div>
          <p className="mb-1.5 text-[10px] font-bold text-slate-500">本地上传</p>
          <input
            ref={imageFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                const data = typeof reader.result === 'string' ? reader.result : '';
                if (!data) return;
                const img = new Image();
                img.onload = () => {
                  const naturalAspectRatio = img.naturalWidth / Math.max(img.naturalHeight, 1);
                  onUpdateElementConfig(el.id, { ...c, sourceType: 'upload', src: data, naturalAspectRatio });
                };
                img.onerror = () => onUpdateElementConfig(el.id, { ...c, sourceType: 'upload', src: data });
                img.src = data;
              };
              reader.readAsDataURL(file);
            }}
          />
          <button
            type="button"
            onClick={() => imageFileInputRef.current?.click()}
            className="w-full rounded-xl border border-indigo-200 bg-indigo-50 py-2.5 text-xs font-black text-indigo-700 hover:bg-indigo-100"
          >
            选择图片
          </button>
          {c.src?.startsWith('data:') ? (
            <p className="mt-1.5 text-[10px] text-slate-400">已选择图片（已嵌入模板）</p>
          ) : null}
        </div>
      )}
      {srcType === 'url' && (
        <Labeled label="图片地址">
          <input
            type="text"
            value={c.src}
            onChange={e => onUpdateElementConfig(el.id, { ...c, src: e.target.value })}
            onBlur={() => {
              const u = c.src.trim();
              if (!u || u.includes('{{') || u.includes('${')) return;
              if (!/^https?:\/\//i.test(u) && !u.startsWith('data:') && !u.startsWith('/')) return;
              const img = new Image();
              img.onload = () =>
                onUpdateElementConfig(el.id, {
                  ...c,
                  src: u,
                  naturalAspectRatio: img.naturalWidth / Math.max(img.naturalHeight, 1),
                });
              img.src = u;
            }}
            placeholder="https:// 或 /path"
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
        </Labeled>
      )}
      {srcType === 'field' && (
        <div className="flex gap-1">
          <textarea
            value={c.src}
            onChange={e => onUpdateElementConfig(el.id, { ...c, src: e.target.value })}
            rows={3}
            placeholder="{{产品.imageUrl}}"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
          <FieldPicker options={fieldOptions} onPick={ph => onUpdateElementConfig(el.id, { ...c, src: c.src + ph })} />
        </div>
      )}
      <Labeled label="透明度 (%)">
        <input
          type="number"
          min={0}
          max={100}
          value={c.opacityPct ?? 100}
          onChange={e => onUpdateElementConfig(el.id, { ...c, opacityPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
        />
      </Labeled>
      <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-700">
        <input
          type="checkbox"
          className="h-4 w-4 rounded text-indigo-600"
          checked={c.keepAspectRatio !== false}
          onChange={e => {
            const checked = e.target.checked;
            if (checked) {
              const r = c.naturalAspectRatio ?? el.width / Math.max(el.height, 0.01);
              onUpdateElementConfig(el.id, { ...c, keepAspectRatio: true });
              onUpdateElement(el.id, { height: Math.max(0.5, el.width / r) });
            } else {
              onUpdateElementConfig(el.id, { ...c, keepAspectRatio: false });
            }
          }}
        />
        保持比例
      </label>
    </div>
  );
}

export const ImagePropertyEditor = React.memo(ImagePropertyEditorInner);
