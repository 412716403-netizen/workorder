import React, { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Partner, PartnerCategory, ProductCategory, ProductCodeRule, ProductCodeRuleMap, ProductCodeSeparator } from '../../types';
import {
  PRODUCT_CODE_ELEMENT_MAX_COUNT,
  PRODUCT_CODE_ELEMENT_MIN_COUNT,
  PRODUCT_CODE_SEPARATORS,
  PRODUCT_CODE_SERIAL_LENGTH_MAX,
  PRODUCT_CODE_SERIAL_LENGTH_MIN,
} from '../../types';
import {
  appendProductCodeElement,
  buildProductCodePreview,
  getProductCodeRule,
  listProductCodeFormulaParts,
  normalizeProductCodeRule,
  removeProductCodeElement,
} from '../../utils/productCodeRule';
import { formStandardControlClass } from '../../styles/uiDensity';
import { ModalPortal } from '../ModalPortal';
import { useAsyncSubmitLock } from '../../hooks/useAsyncSubmitLock';
import ProductCodeElementRow, { PRODUCT_CODE_ROW_GRID_CLASS as ELEMENT_GRID_CLASS } from './ProductCodeElementRow';

const SEPARATOR_LABELS: Record<ProductCodeSeparator, string> = {
  '-': '-',
  _: '_',
  '/': '/',
  '': '无',
};

interface ProductCodeRuleModalProps {
  categories: ProductCategory[];
  /** 租户合作单位；分类开启「关联合作单位」时作为该字段的可映射选项 */
  partners: Partner[];
  /** 合作单位分类；映射弹窗内做分类 Tab 筛选 */
  partnerCategories: PartnerCategory[];
  /** 打开时默认编辑的分类（产品表单当前分类） */
  initialCategoryId?: string;
  rules: ProductCodeRuleMap;
  onSave: (map: ProductCodeRuleMap) => Promise<void>;
  onClose: () => void;
  /** 嵌套在快速新建弹窗中时需要更高的 z-index */
  overlayZClass?: string;
}

/**
 * 产品编号规则配置弹窗：按产品分类各配一套「元素一~四 + 流水号 + 分隔符」，
 * 保存写入租户配置 productCodeRules（规则语义见 utils/productCodeRule.ts）。
 */
const ProductCodeRuleModal: React.FC<ProductCodeRuleModalProps> = ({
  categories,
  partners,
  partnerCategories,
  initialCategoryId,
  rules,
  onSave,
  onClose,
  overlayZClass = 'z-[10250]',
}) => {
  const [activeCategoryId, setActiveCategoryId] = useState<string>(
    initialCategoryId && categories.some((c) => c.id === initialCategoryId)
      ? initialCategoryId
      : (categories[0]?.id ?? ''),
  );
  const [draft, setDraft] = useState<ProductCodeRuleMap>(() => {
    const map: ProductCodeRuleMap = {};
    for (const [cid, rule] of Object.entries(rules)) map[cid] = normalizeProductCodeRule(rule);
    return map;
  });
  const saveLock = useAsyncSubmitLock();

  const activeCategory = categories.find((c) => c.id === activeCategoryId);
  const rule = useMemo(
    () => getProductCodeRule(draft, activeCategoryId),
    [draft, activeCategoryId],
  );

  const patchRule = (patch: Partial<ProductCodeRule>) => {
    if (!activeCategoryId) return;
    setDraft((prev) => ({ ...prev, [activeCategoryId]: { ...getProductCodeRule(prev, activeCategoryId), ...patch } }));
  };

  const formulaParts = listProductCodeFormulaParts(rule, activeCategory);
  const preview = buildProductCodePreview(rule);

  const handleSave = () =>
    saveLock.run(async () => {
      try {
        await onSave(draft);
        toast.success('编号规则已保存');
        onClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '保存失败');
      }
    });

  return (
    <ModalPortal>
      <div className={`fixed inset-0 ${overlayZClass} flex items-center justify-center p-4 sm:p-6`}>
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => !saveLock.busy && onClose()} />
        <div className="relative z-10 bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[min(92vh,960px)]">
          <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
            <h2 className="text-lg font-bold text-slate-800">配置编号规则</h2>
            <button type="button" onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-white transition-all">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto flex-1 space-y-5">
            <div className="grid grid-cols-[80px_1fr] items-center gap-3">
              <span className="text-xs font-bold text-slate-600">产品分类</span>
              <select
                value={activeCategoryId}
                onChange={(e) => setActiveCategoryId(e.target.value)}
                className={`${formStandardControlClass} w-full`}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-[80px_1fr] items-center gap-3">
              <span className="text-xs font-bold text-slate-600">生成方式</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => patchRule({ mode: 'auto' })}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${rule.mode === 'auto' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                  自动生成
                </button>
                <button
                  type="button"
                  onClick={() => patchRule({ mode: 'manual' })}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${rule.mode === 'manual' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                  手动输入
                </button>
              </div>
            </div>

            {rule.mode === 'auto' && (
            <div className="rounded-2xl bg-slate-50 p-5 space-y-4">
              {rule.elements.map((el, i) => (
                <ProductCodeElementRow
                  key={i}
                  index={i}
                  element={el}
                  category={activeCategory}
                  partners={partners}
                  partnerCategories={partnerCategories}
                  // 选项编号二级弹窗须高于本规则弹窗（含快速新建嵌套场景）
                  overlayZClass="z-[12000]"
                  onChange={(next) => {
                    const elements = rule.elements.map((cur, j) => (j === i ? next : cur));
                    patchRule({ elements });
                  }}
                  onRemove={
                    rule.elements.length > PRODUCT_CODE_ELEMENT_MIN_COUNT
                      ? () => patchRule({ elements: removeProductCodeElement(rule.elements, i) })
                      : undefined
                  }
                />
              ))}

              {rule.elements.length < PRODUCT_CODE_ELEMENT_MAX_COUNT && (
                <button
                  type="button"
                  onClick={() => patchRule({ elements: appendProductCodeElement(rule.elements) })}
                  className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold text-indigo-600 bg-white border border-dashed border-indigo-300 hover:bg-indigo-50 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  添加元素
                </button>
              )}

              <div className={`${ELEMENT_GRID_CLASS} items-center gap-2`}>
                <span className="text-xs font-bold text-slate-600">
                  <span className="text-rose-500 mr-0.5">*</span>流水号
                </span>
                <div className="relative col-span-1">
                  <input
                    type="number"
                    min={PRODUCT_CODE_SERIAL_LENGTH_MIN}
                    max={PRODUCT_CODE_SERIAL_LENGTH_MAX}
                    value={rule.serialLength}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isInteger(n)) return;
                      patchRule({ serialLength: Math.min(Math.max(n, PRODUCT_CODE_SERIAL_LENGTH_MIN), PRODUCT_CODE_SERIAL_LENGTH_MAX) });
                    }}
                    className={`${formStandardControlClass} pr-7`}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none">位</span>
                </div>
                <span className="text-xs text-slate-400 col-span-4">例：{'1'.padStart(rule.serialLength, '0')}</span>
              </div>

              <div className={`${ELEMENT_GRID_CLASS} items-center gap-2`}>
                <span className="text-xs font-bold text-slate-600">分隔符</span>
                <select
                  value={rule.separator}
                  onChange={(e) => patchRule({ separator: e.target.value as ProductCodeSeparator })}
                  className={formStandardControlClass}
                >
                  {PRODUCT_CODE_SEPARATORS.map((s) => (
                    <option key={s || 'none'} value={s}>{SEPARATOR_LABELS[s]}</option>
                  ))}
                </select>
              </div>

              <div className="border-t border-dashed border-slate-200 pt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                  <span>产品定义编号 =</span>
                  {formulaParts.map((part, i) => (
                    <React.Fragment key={`${part}-${i}`}>
                      {i > 0 && <span className="text-slate-400">+</span>}
                      <span className="px-2 py-1 rounded-lg bg-slate-200/70 font-bold">{part}</span>
                    </React.Fragment>
                  ))}
                </div>
                <div className="rounded-xl bg-white border border-slate-200 px-4 py-3 flex items-baseline gap-2">
                  <span className="text-xs text-slate-400 shrink-0">编号预览：</span>
                  <span className="text-lg font-black text-slate-800 break-all">{preview}</span>
                </div>
              </div>
            </div>
            )}
          </div>

          <div className="px-8 py-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={saveLock.busy}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-all disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saveLock.busy || categories.length === 0}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all disabled:opacity-50"
            >
              {saveLock.busy ? '保存中…' : '确定'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

export default React.memo(ProductCodeRuleModal);
