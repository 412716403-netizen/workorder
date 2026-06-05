import React from 'react';
import { Hash, Palette, Plus } from 'lucide-react';
import type { AppDictionaries } from '../../types';
import {
  productArchiveFormQuickAddBtnClass,
  productArchiveFormSpecPickerClass,
} from '../../styles/uiDensity';

export interface ColorSizeSpecPickerTableProps {
  colorIds: string[];
  sizeIds: string[];
  dictionaries: AppDictionaries;
  readOnly?: boolean;
  onOpenColorPicker: () => void;
  onOpenSizePicker: () => void;
  onQuickAddColor?: () => void;
  onQuickAddSize?: () => void;
}

const specPickerBtnClass = `${productArchiveFormSpecPickerClass} min-h-9 h-auto py-2`;

const ColorSizeSpecPickerTable: React.FC<ColorSizeSpecPickerTableProps> = ({
  colorIds,
  sizeIds,
  dictionaries,
  readOnly,
  onOpenColorPicker,
  onOpenSizePicker,
  onQuickAddColor,
  onQuickAddSize,
}) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
    <div className="grid grid-cols-[5.5rem_1fr] sm:grid-cols-[7rem_1fr] divide-x divide-slate-100">
      <div className="px-3 sm:px-4 py-2.5 bg-slate-50/80 text-[10px] font-semibold text-slate-500 flex items-center justify-center border-b border-slate-100">
        规格名
      </div>
      <div className="px-3 sm:px-4 py-2.5 bg-slate-50/80 text-[10px] font-semibold text-slate-500 flex items-center border-b border-slate-100">
        已选规格值
      </div>

      <div className="px-3 sm:px-4 py-3 flex items-center justify-center text-xs font-medium text-slate-700 border-b border-slate-100">
        颜色
      </div>
      <div className="px-3 sm:px-4 py-3 flex items-center gap-2 min-w-0 border-b border-slate-100">
        <button
          type="button"
          disabled={readOnly}
          onClick={onOpenColorPicker}
          className={`${specPickerBtnClass} flex-1 min-w-0`}
        >
          <Palette className="w-4 h-4 text-slate-400 shrink-0" />
          {colorIds.length === 0 ? (
            <span className="text-slate-400 font-medium text-xs">点击选择颜色…</span>
          ) : (
            colorIds.map((id) => {
              const c = dictionaries.colors.find((i) => i.id === id);
              return (
                <span
                  key={id}
                  className="px-2 py-0.5 bg-white border border-slate-100 rounded-md text-[11px] font-semibold text-slate-600 inline-flex items-center gap-1.5"
                >
                  <span
                    className="w-2 h-2 rounded-full border border-slate-200 shrink-0"
                    style={{ backgroundColor: c?.value }}
                  />
                  {c?.name ?? '（未命名）'}
                </span>
              );
            })
          )}
        </button>
        {!readOnly && onQuickAddColor && (
          <button type="button" onClick={onQuickAddColor} className={productArchiveFormQuickAddBtnClass}>
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="px-3 sm:px-4 py-3 flex items-center justify-center text-xs font-medium text-slate-700">
        尺寸
      </div>
      <div className="px-3 sm:px-4 py-3 flex items-center gap-2 min-w-0">
        <button
          type="button"
          disabled={readOnly}
          onClick={onOpenSizePicker}
          className={`${specPickerBtnClass} flex-1 min-w-0`}
        >
          <Hash className="w-4 h-4 text-slate-400 shrink-0" />
          {sizeIds.length === 0 ? (
            <span className="text-slate-400 font-medium text-xs">点击选择尺码…</span>
          ) : (
            sizeIds.map((id) => {
              const s = dictionaries.sizes.find((sz) => sz.id === id);
              return (
                <span
                  key={id}
                  className="px-2 py-0.5 bg-white border border-slate-100 rounded-md text-[11px] font-semibold text-slate-600"
                >
                  {s?.name ?? '（未命名）'}
                </span>
              );
            })
          )}
        </button>
        {!readOnly && onQuickAddSize && (
          <button type="button" onClick={onQuickAddSize} className={productArchiveFormQuickAddBtnClass}>
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  </div>
);

export default ColorSizeSpecPickerTable;
