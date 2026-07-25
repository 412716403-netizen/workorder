import React, { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import type {
  ProductCategory,
  ProductCodeDateFormat,
  ProductCodeElement,
  ProductCodeElementType,
  ProductCodeFieldDisplay,
} from '../../types';
import { PRODUCT_CODE_DATE_FORMATS } from '../../types';
import {
  listProductCodeFieldOptions,
  resolveProductCodeFieldOption,
  type ProductCodeFieldOption,
} from '../../utils/productCodeRule';
import { formStandardControlClass } from '../../styles/uiDensity';
import { ModalPortal } from '../ModalPortal';

const CN_NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

function slotLabel(index: number): string {
  return `元素${CN_NUMERALS[index] ?? index + 1}`;
}

/** 行内控件：填满网格单元格（列宽由父级 grid 约束，不会独占整行） */
const rowCtrlClass = formStandardControlClass;

/**
 * 元素行的 6 列网格：标签 | 类型 | 字段/固定文本 | 显示方式 | 位数/映射/日期格式 | 删除。
 * 弹窗内的流水号、分隔符行共用同一套列宽以保持对齐。
 */
export const PRODUCT_CODE_ROW_GRID_CLASS =
  'grid grid-cols-[3rem_7rem_minmax(0,1.2fr)_7.5rem_minmax(5.5rem,0.9fr)_1.5rem]';

const DATE_FORMAT_LABELS: Record<ProductCodeDateFormat, string> = {
  yyMMdd: '年月日 260710',
  yyMM: '年月 2607',
  yy: '年 26',
  yyyyMMdd: '年月日 20260710',
};

interface ProductCodeElementRowProps {
  /** 槽位序号 0-3（元素一~四） */
  index: number;
  element: ProductCodeElement;
  /** 当前配置的产品分类（决定可选字段） */
  category: ProductCategory | undefined;
  onChange: (el: ProductCodeElement) => void;
  /** 删除本元素；未传或已达数量下限时不显示删除按钮 */
  onRemove?: () => void;
  /** 嵌套弹窗 z-index，需高于编号规则主弹窗 */
  overlayZClass?: string;
}

/** 字段切换后按字段类型给出默认显示方式 */
function defaultElementForField(
  category: ProductCategory | undefined,
  fieldKey: string,
): ProductCodeElement {
  const opt = resolveProductCodeFieldOption(category, fieldKey);
  if (opt?.fieldType === 'date') {
    return { type: 'field', fieldKey, display: 'date', dateFormat: 'yyMMdd' };
  }
  return { type: 'field', fieldKey, display: 'text' };
}

function countMappedOptions(optionCodes: Record<string, string> | undefined, options: string[]): number {
  if (!optionCodes) return 0;
  return options.filter((o) => (optionCodes[o] ?? '').trim().length > 0).length;
}

interface OptionCodesModalProps {
  fieldLabel: string;
  options: string[];
  optionCodes: Record<string, string>;
  onChange: (codes: Record<string, string>) => void;
  onClose: () => void;
  overlayZClass: string;
}

/** 「选项对应编号」二级弹窗：主表单保持一行，映射细节收进弹窗 */
const OptionCodesModal: React.FC<OptionCodesModalProps> = ({
  fieldLabel,
  options,
  optionCodes,
  onChange,
  onClose,
  overlayZClass,
}) => (
  <ModalPortal>
    <div className={`fixed inset-0 ${overlayZClass} flex items-center justify-center p-4`}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[min(80vh,560px)]">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-800 truncate">设置分类对应的编号</h3>
            <p className="text-[10px] text-slate-400 mt-0.5 truncate">字段「{fieldLabel}」</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-all shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 space-y-2">
          {options.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">该字段暂无选项，请先在产品分类库中配置选项</p>
          ) : (
            options.map((opt) => (
              <div key={opt} className="grid grid-cols-[1fr_120px] items-center gap-3">
                <span className="text-xs text-slate-600 truncate" title={opt}>{opt}</span>
                <input
                  type="text"
                  value={optionCodes[opt] ?? ''}
                  onChange={(e) => onChange({ ...optionCodes, [opt]: e.target.value })}
                  placeholder="编号，如 01"
                  className={`${formStandardControlClass} w-full`}
                />
              </div>
            ))
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end bg-slate-50/50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  </ModalPortal>
);

/**
 * 编号规则弹窗里的单个元素：强制单行
 * 元素N | 类型 | 固定文本/字段名 | 显示方式 | 位数/日期格式/映射按钮
 */
const ProductCodeElementRow: React.FC<ProductCodeElementRowProps> = ({
  index,
  element,
  category,
  onChange,
  onRemove,
  overlayZClass = 'z-[10300]',
}) => {
  const fieldOptions = listProductCodeFieldOptions(category);
  const activeField = resolveProductCodeFieldOption(category, element.fieldKey);
  const [mapModalOpen, setMapModalOpen] = useState(false);

  const handleTypeChange = (type: ProductCodeElementType) => {
    if (type === 'none') onChange({ type: 'none' });
    else if (type === 'fixedText') onChange({ type: 'fixedText', fixedText: '' });
    else onChange(defaultElementForField(category, fieldOptions[0]?.key ?? ''));
  };

  const handleDisplayChange = (display: ProductCodeFieldDisplay) => {
    if (!element.fieldKey) return;
    if (display === 'mapped') {
      onChange({ type: 'field', fieldKey: element.fieldKey, display, optionCodes: element.optionCodes ?? {} });
      setMapModalOpen(true);
    } else {
      onChange({ type: 'field', fieldKey: element.fieldKey, display: 'text', length: element.length });
    }
  };

  const mappedCount =
    activeField?.fieldType === 'select' && element.display === 'mapped'
      ? countMappedOptions(element.optionCodes, activeField.options ?? [])
      : 0;
  const optionTotal = activeField?.options?.length ?? 0;

  return (
    <>
      {/*
        6 列强制同一行：标签 | 类型 | 字段/固定文本 | 显示方式 | 位数/映射/日期格式 | 删除
        空值时中间列留空占位，避免行高跳动
      */}
      <div className={`${PRODUCT_CODE_ROW_GRID_CLASS} items-center gap-2`}>
        <span className="text-xs font-bold text-slate-600 truncate">{slotLabel(index)}</span>

        <select
          value={element.type}
          onChange={(e) => handleTypeChange(e.target.value as ProductCodeElementType)}
          className={rowCtrlClass}
        >
          {/* 空值不再作为可选类型，仅为历史配置保留可见项，改选后即消失 */}
          {element.type === 'none' && <option value="none">空值</option>}
          <option value="fixedText">固定文本</option>
          <option value="field">产品字段</option>
        </select>

        {element.type === 'none' && (
          <>
            <div />
            <div />
            <div />
          </>
        )}

        {element.type === 'fixedText' && (
          <>
            <input
              type="text"
              value={element.fixedText ?? ''}
              onChange={(e) => onChange({ type: 'fixedText', fixedText: e.target.value })}
              placeholder="如 WL / 01"
              className={rowCtrlClass}
            />
            <div />
            <div />
          </>
        )}

        {element.type === 'field' && (
          <>
            <select
              value={element.fieldKey ?? ''}
              onChange={(e) => onChange(defaultElementForField(category, e.target.value))}
              className={rowCtrlClass}
            >
              {fieldOptions.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>

            {activeField ? (
              <FieldDisplayControls
                field={activeField}
                element={element}
                onChange={onChange}
                onDisplayChange={handleDisplayChange}
                mappedCount={mappedCount}
                optionTotal={optionTotal}
                onOpenMapModal={() => setMapModalOpen(true)}
              />
            ) : (
              <>
                <div />
                <div />
              </>
            )}
          </>
        )}

        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            title="删除该元素"
            className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        ) : (
          <div />
        )}
      </div>

      {mapModalOpen && activeField?.fieldType === 'select' && element.fieldKey && (
        <OptionCodesModal
          fieldLabel={activeField.label}
          options={activeField.options ?? []}
          optionCodes={element.optionCodes ?? {}}
          onChange={(codes) =>
            onChange({
              type: 'field',
              fieldKey: element.fieldKey!,
              display: 'mapped',
              optionCodes: codes,
            })
          }
          onClose={() => setMapModalOpen(false)}
          overlayZClass={overlayZClass}
        />
      )}
    </>
  );
};

interface FieldDisplayControlsProps {
  field: ProductCodeFieldOption;
  element: ProductCodeElement;
  onChange: (el: ProductCodeElement) => void;
  onDisplayChange: (display: ProductCodeFieldDisplay) => void;
  mappedCount: number;
  optionTotal: number;
  onOpenMapModal: () => void;
}

/**
 * 占满网格后两列（显示方式 + 附加）：
 * text → 文本内容 | 位数
 * select → 文本内容/选项对应编号 | 设置编号按钮
 * date → 日期 | 日期格式
 */
const FieldDisplayControls: React.FC<FieldDisplayControlsProps> = ({
  field,
  element,
  onChange,
  onDisplayChange,
  mappedCount,
  optionTotal,
  onOpenMapModal,
}) => {
  if (field.fieldType === 'text') {
    return (
      <>
        <select value="text" disabled className={rowCtrlClass}>
          <option value="text">文本内容</option>
        </select>
        <div className="relative min-w-0">
          <input
            type="number"
            min={1}
            max={50}
            value={element.length ?? ''}
            onChange={(e) => {
              const n = Number(e.target.value);
              onChange({ ...element, length: Number.isInteger(n) && n > 0 ? n : undefined });
            }}
            placeholder="全部"
            className={`${rowCtrlClass} pr-7`}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none">位</span>
        </div>
      </>
    );
  }

  if (field.fieldType === 'select') {
    return (
      <>
        <select
          value={element.display === 'mapped' ? 'mapped' : 'text'}
          onChange={(e) => onDisplayChange(e.target.value as ProductCodeFieldDisplay)}
          className={rowCtrlClass}
        >
          <option value="text">文本内容</option>
          <option value="mapped">选项对应编号</option>
        </select>
        {element.display === 'mapped' ? (
          <button
            type="button"
            onClick={onOpenMapModal}
            className="h-9 min-w-0 px-2 rounded-lg text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-all truncate"
            title="打开弹窗设置各选项对应的编号"
          >
            {optionTotal === 0 || mappedCount === 0 ? '设置编号' : `已设 ${mappedCount}/${optionTotal}`}
          </button>
        ) : (
          <div className="relative min-w-0">
            <input
              type="number"
              min={1}
              max={50}
              value={element.length ?? ''}
              onChange={(e) => {
                const n = Number(e.target.value);
                onChange({ ...element, display: 'text', length: Number.isInteger(n) && n > 0 ? n : undefined });
              }}
              placeholder="全部"
              className={`${rowCtrlClass} pr-7`}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none">位</span>
          </div>
        )}
      </>
    );
  }

  // date
  return (
    <>
      <select value="date" disabled className={rowCtrlClass}>
        <option value="date">日期</option>
      </select>
      <select
        value={element.dateFormat ?? 'yyMMdd'}
        onChange={(e) => onChange({ ...element, dateFormat: e.target.value as ProductCodeDateFormat })}
        className={rowCtrlClass}
      >
        {PRODUCT_CODE_DATE_FORMATS.map((f) => (
          <option key={f} value={f}>{DATE_FORMAT_LABELS[f]}</option>
        ))}
      </select>
    </>
  );
};

export default React.memo(ProductCodeElementRow);
