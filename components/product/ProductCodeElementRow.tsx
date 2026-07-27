import React, { useMemo, useState } from 'react';
import { Search, Trash2, X } from 'lucide-react';
import type {
  Partner,
  PartnerCategory,
  ProductCategory,
  ProductCodeDateFormat,
  ProductCodeElement,
  ProductCodeElementType,
  ProductCodeFieldDisplay,
} from '../../types';
import { PRODUCT_CODE_DATE_FORMATS, PRODUCT_CODE_FIELD_PARTNER } from '../../types';
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
  /** 租户合作单位；分类开启「关联合作单位」时作为该字段的可映射选项 */
  partners?: readonly Partner[];
  /** 合作单位分类；映射弹窗内做分类 Tab 筛选 */
  partnerCategories?: readonly PartnerCategory[];
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

/** 合作单位字段专用：按分类 Tab + 搜索浏览，映射键仍是合作单位名称 */
interface PartnerBrowseContext {
  partners: readonly Partner[];
  categories: readonly PartnerCategory[];
}

interface OptionCodesModalProps {
  fieldLabel: string;
  options: string[];
  optionCodes: Record<string, string>;
  /** 无选项时的引导文案（扩展字段指向分类库，合作单位指向合作单位管理） */
  emptyHint: string;
  /** 传入后启用合作单位分类 Tab + 常驻搜索（对齐 SearchablePartnerSelect） */
  partnerBrowse?: PartnerBrowseContext;
  onChange: (codes: Record<string, string>) => void;
  onClose: () => void;
  overlayZClass: string;
}

/** 普通扩展字段选项超过该值时显示搜索框 */
const OPTION_SEARCH_THRESHOLD = 8;

function uniquePartnerNames(list: readonly Partner[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of list) {
    const name = (p.name ?? '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/** 「选项对应编号」二级弹窗：主表单保持一行，映射细节收进弹窗 */
const OptionCodesModal: React.FC<OptionCodesModalProps> = ({
  fieldLabel,
  options,
  optionCodes,
  emptyHint,
  partnerBrowse,
  onChange,
  onClose,
  overlayZClass,
}) => {
  const [search, setSearch] = useState('');
  const [activePartnerTab, setActivePartnerTab] = useState('all');
  const q = search.trim().toLowerCase();
  const isPartnerMode = Boolean(partnerBrowse);

  const visibleOptions = useMemo(() => {
    if (partnerBrowse) {
      const filtered = partnerBrowse.partners.filter((p) => {
        const name = (p.name ?? '').trim();
        if (!name) return false;
        const matchesCategory = activePartnerTab === 'all' || p.categoryId === activePartnerTab;
        if (!matchesCategory) return false;
        if (!q) return true;
        const hay = [
          name,
          p.contact || '',
          ...Object.values(p.customData ?? {}).map((v) =>
            v == null || typeof v === 'object' ? '' : String(v),
          ),
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
      return uniquePartnerNames(filtered);
    }
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  }, [partnerBrowse, activePartnerTab, q, options]);

  const showSearch = isPartnerMode || options.length > OPTION_SEARCH_THRESHOLD;
  const totalCount = isPartnerMode ? uniquePartnerNames(partnerBrowse!.partners).length : options.length;
  const emptyFilterHint = isPartnerMode
    ? q
      ? `没有匹配「${search.trim()}」的合作单位`
      : activePartnerTab === 'all'
        ? emptyHint
        : '该分类下暂无合作单位'
    : `没有匹配「${search.trim()}」的选项`;

  const partnerTabCls = (active: boolean) =>
    `shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap ${
      active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
    }`;

  return (
    <ModalPortal>
      <div className={`fixed inset-0 ${overlayZClass} flex items-center justify-center p-4`}>
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative z-10 bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[min(80vh,560px)]">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-800 truncate">设置选项对应的编号</h3>
              <p className="text-[10px] text-slate-400 mt-0.5 truncate">字段「{fieldLabel}」</p>
            </div>
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-all shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
          {showSearch && (
            <div className="px-4 pt-3 shrink-0 space-y-2.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="search"
                  name={isPartnerMode ? 'partner-code-map-q' : 'option-code-map-q'}
                  autoComplete="off"
                  autoFocus={isPartnerMode}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={isPartnerMode ? '搜索单位名称、联系人…' : '搜索选项…'}
                  className={`${formStandardControlClass} w-full pl-8`}
                />
              </div>
              {isPartnerMode && partnerBrowse!.categories.length > 0 && (
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
                  <button
                    type="button"
                    onClick={() => setActivePartnerTab('all')}
                    className={partnerTabCls(activePartnerTab === 'all')}
                  >
                    全部
                  </button>
                  {partnerBrowse!.categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setActivePartnerTab(cat.id)}
                      className={partnerTabCls(activePartnerTab === cat.id)}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="p-4 overflow-y-auto flex-1 space-y-2">
            {totalCount === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">{emptyHint}</p>
            ) : visibleOptions.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">{emptyFilterHint}</p>
            ) : (
              visibleOptions.map((opt) => (
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
};

/**
 * 编号规则弹窗里的单个元素：强制单行
 * 元素N | 类型 | 固定文本/字段名 | 显示方式 | 位数/日期格式/映射按钮
 */
const ProductCodeElementRow: React.FC<ProductCodeElementRowProps> = ({
  index,
  element,
  category,
  partners,
  partnerCategories,
  onChange,
  onRemove,
  overlayZClass = 'z-[10300]',
}) => {
  const partnerNames = useMemo(() => uniquePartnerNames(partners ?? []), [partners]);
  const fieldCtx = useMemo(() => ({ partnerNames }), [partnerNames]);
  const fieldOptions = listProductCodeFieldOptions(category, fieldCtx);
  const activeField = resolveProductCodeFieldOption(category, element.fieldKey, fieldCtx);
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
          emptyHint={
            activeField.key === PRODUCT_CODE_FIELD_PARTNER
              ? '暂无合作单位，请先在合作单位管理中添加'
              : '该字段暂无选项，请先在产品分类库中配置选项'
          }
          partnerBrowse={
            activeField.key === PRODUCT_CODE_FIELD_PARTNER
              ? {
                  partners: partners ?? [],
                  categories: partnerCategories ?? [],
                }
              : undefined
          }
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
