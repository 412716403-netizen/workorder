import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Boxes, Copy, ListChecks, Plus, Trash2, X } from 'lucide-react';
import { BOM, BOMItem, GlobalNodeTemplate, Product, ProductCategory, ProductVariant, AppDictionaries } from '../../types';
import { SearchableProductSelect } from '../../components/SearchableProductSelect';

/** 用量数字展示：去掉 JS 浮点尾数（如 0.32+0.1 → 0.42000000000000004） */
function formatBomQuantityDisplay(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const s = n.toFixed(6).replace(/\.?0+$/, '');
  return s === '' ? '0' : s;
}

export interface BomEditorPortalState {
  workingBOM: BOM | null;
  setWorkingBOM: React.Dispatch<React.SetStateAction<BOM | null>>;
  activeVariantIdForBOM: string | null;
  setActiveVariantIdForBOM: React.Dispatch<React.SetStateAction<string | null>>;
  activeNodeIdForBOM: string | null;
  setActiveNodeIdForBOM: React.Dispatch<React.SetStateAction<string | null>>;
  bomBatchOpen: boolean;
  setBomBatchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  copyBOMDropdownOpen: boolean;
  setCopyBOMDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  copyBOMDropdownStyle: React.CSSProperties;
  setCopyBOMDropdownStyle: React.Dispatch<React.SetStateAction<React.CSSProperties>>;
  bomSaving: boolean;
  setBomSaving: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useBomEditorPortalState(): BomEditorPortalState {
  const [activeVariantIdForBOM, setActiveVariantIdForBOM] = useState<string | null>(null);
  const [activeNodeIdForBOM, setActiveNodeIdForBOM] = useState<string | null>(null);
  const [workingBOM, setWorkingBOM] = useState<BOM | null>(null);
  const [bomBatchOpen, setBomBatchOpen] = useState(false);
  const [copyBOMDropdownOpen, setCopyBOMDropdownOpen] = useState(false);
  const [copyBOMDropdownStyle, setCopyBOMDropdownStyle] = useState<React.CSSProperties>({});
  const [bomSaving, setBomSaving] = useState(false);

  return {
    workingBOM,
    setWorkingBOM,
    activeVariantIdForBOM,
    setActiveVariantIdForBOM,
    activeNodeIdForBOM,
    setActiveNodeIdForBOM,
    bomBatchOpen,
    setBomBatchOpen,
    copyBOMDropdownOpen,
    setCopyBOMDropdownOpen,
    copyBOMDropdownStyle,
    setCopyBOMDropdownStyle,
    bomSaving,
    setBomSaving,
  };
}

interface BomEditorPortalProps {
  product: Product;
  boms: BOM[];
  globalNodes: GlobalNodeTemplate[];
  dictionaries: AppDictionaries;
  categories: ProductCategory[];
  products: Product[];
  state: BomEditorPortalState;
  enabledBOMNodes: GlobalNodeTemplate[];
  availableBOMSources: ProductVariant[];
  bomBlockedProductIds: string[];
  embeddedInQuickCreateModal: boolean;
  nestedOverlayZ: string;
  BomBatchAddPanelComponent: React.ComponentType<any>;
  copyBOMTriggerRef: React.RefObject<HTMLButtonElement | null>;
  onCopyBOMFrom: (sourceVariantId: string) => void;
  onUpdateBOMItem: (idx: number, updates: Partial<BOMItem>) => void;
  onSave: () => void;
  onClose: () => void;
}

const BomEditorPortal: React.FC<BomEditorPortalProps> = ({
  product,
  boms,
  globalNodes,
  dictionaries,
  categories,
  products,
  state,
  enabledBOMNodes,
  availableBOMSources,
  bomBlockedProductIds,
  embeddedInQuickCreateModal,
  nestedOverlayZ,
  BomBatchAddPanelComponent,
  copyBOMTriggerRef,
  onCopyBOMFrom,
  onUpdateBOMItem,
  onSave,
  onClose,
}) => {
  const {
    activeVariantIdForBOM,
    activeNodeIdForBOM,
    workingBOM,
    setWorkingBOM,
    bomBatchOpen,
    setBomBatchOpen,
    copyBOMDropdownOpen,
    setCopyBOMDropdownOpen,
    copyBOMDropdownStyle,
    bomSaving,
  } = state;

  if (
    enabledBOMNodes.length <= 0 ||
    !activeVariantIdForBOM ||
    !activeNodeIdForBOM ||
    !workingBOM ||
    typeof document === 'undefined'
  ) {
    return null;
  }

  const activeVariant = product.variants.find(v => v.id === activeVariantIdForBOM);
  const isSingleSku = !activeVariant || activeVariantIdForBOM.startsWith('single-');
  const colorName = activeVariant?.colorId ? (dictionaries.colors.find(c => c.id === activeVariant.colorId)?.name ?? '') : '';
  const sizeName = activeVariant?.sizeId ? (dictionaries.sizes.find(s => s.id === activeVariant.sizeId)?.name ?? '') : '';
  const colorSizeLabel = isSingleSku ? '单 SKU（通用）' : [colorName, sizeName].filter(Boolean).join(' / ');
  const formatVariantOptionLabel = (variant: ProductVariant): string => {
    const suffix = (variant.skuSuffix ?? '').trim();
    if (suffix) return suffix;
    const color = variant.colorId
      ? (dictionaries.colors.find(c => c.id === variant.colorId)?.name ?? variant.colorId)
      : '';
    const size = variant.sizeId
      ? (dictionaries.sizes.find(s => s.id === variant.sizeId)?.name ?? variant.sizeId)
      : '';
    const combined = [color, size].filter(Boolean).join(' / ').trim();
    if (combined) return combined;
    return variant.id;
  };
  const bomMaterialStats = workingBOM.items.reduce(
    (acc, it) => {
      if (!it.productId?.trim()) return acc;
      acc.kinds += 1;
      let q = 0;
      if (it.quantityInput !== undefined && it.quantityInput !== '') {
        const n = parseFloat(it.quantityInput);
        q = Number.isFinite(n) ? n : 0;
      } else if (typeof it.quantity === 'number' && !Number.isNaN(it.quantity)) {
        q = it.quantity;
      }
      acc.totalQty += q;
      return acc;
    },
    { kinds: 0, totalQty: 0 },
  );
  const bomNode = globalNodes.find(gn => gn.id === (workingBOM.nodeId ?? activeNodeIdForBOM ?? ''));
  const weightReportEnabledForBom = !!bomNode?.enableWeightOnReport;
  const shareBase = weightReportEnabledForBom
    ? workingBOM.items.reduce((sum, it) => {
      if (!it.productId?.trim()) return sum;
      if (it.excludeFromWeightShare) return sum;
      const raw = it.quantityInput !== undefined && it.quantityInput !== ''
        ? parseFloat(it.quantityInput)
        : (typeof it.quantity === 'number' ? it.quantity : 0);
      const n = Number.isFinite(raw) ? raw : 0;
      return sum + Math.max(0, n);
    }, 0)
    : 0;

  return createPortal(
    <div className={`fixed inset-0 ${nestedOverlayZ} flex items-center justify-center p-4`} role="dialog" aria-modal="true" aria-labelledby="bom-editor-title">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-white rounded-[32px] border-2 border-indigo-600 shadow-[0_32px_64px_-12px_rgba(79,70,229,0.25)] animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex-shrink-0 flex items-center justify-between gap-4 p-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0"><Boxes className="w-6 h-6" /></div>
            <div className="min-w-0">
              <h5 id="bom-editor-title" className="text-sm font-black text-slate-800 uppercase tracking-widest">配置物料明细</h5>
              <p className="text-[10px] text-slate-400 font-bold uppercase truncate">{workingBOM.name}</p>
              <p className="text-[10px] text-indigo-500 font-bold mt-1">
                {isSingleSku ? '适用：' : '适用颜色尺码：'}{colorSizeLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="relative">
              <button ref={copyBOMTriggerRef} type="button" onClick={() => setCopyBOMDropdownOpen(!copyBOMDropdownOpen)} className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-white transition-all shadow-sm"><Copy className="w-3.5 h-3.5 shrink-0" /> 复制现有方案</button>
              {copyBOMDropdownOpen && createPortal(
                <div data-portal-copy-bom className="bg-white rounded-2xl border border-slate-200 shadow-2xl p-2 max-h-48 overflow-y-auto custom-scrollbar" style={copyBOMDropdownStyle}>
                  {availableBOMSources.map(srcV => (
                    <button key={srcV.id} type="button" onClick={() => { onCopyBOMFrom(srcV.id); setCopyBOMDropdownOpen(false); }} className="w-full text-left px-3 py-2 hover:bg-indigo-50 rounded-lg text-xs font-bold text-slate-700">{formatVariantOptionLabel(srcV)}</button>
                  ))}
                  {availableBOMSources.length === 0 && <p className="text-[10px] text-slate-300 p-4 italic text-center">暂无可复用的配置</p>}
                </div>,
                document.body
              )}
            </div>
            <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 transition-all rounded-xl hover:bg-slate-50" aria-label="关闭"><X className="w-6 h-6" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-2 rounded-xl bg-indigo-50/80 border border-indigo-100">
            <span className="text-[11px] font-black text-indigo-800">物料汇总</span>
            <span className="text-[11px] font-bold text-indigo-600">
              已选 <span className="tabular-nums">{bomMaterialStats.kinds}</span> 种 · 用量合计{' '}
              <span className="tabular-nums">{formatBomQuantityDisplay(bomMaterialStats.totalQty)}</span>
            </span>
          </div>
          {workingBOM.items.map((item, idx) => {
            const unavailableProductIds = workingBOM.items
              .map((other, i) => (i !== idx && other.productId ? other.productId : ''))
              .filter(Boolean);
            return (
              <div key={idx} className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-3 md:gap-4 items-start relative group shadow-sm hover:bg-white hover:border-indigo-100 transition-all">
                <button type="button" onClick={() => {
                  const newItems = [...workingBOM.items];
                  newItems.splice(idx, 1);
                  setWorkingBOM({ ...workingBOM, items: newItems });
                }} className="absolute -top-2 -right-2 w-7 h-7 bg-rose-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-lg hover:bg-rose-600 z-10"><Trash2 className="w-4 h-4" /></button>
                <div className="flex shrink-0 items-start justify-center md:justify-start pt-[3px] md:pt-1">
                  <span
                    className="flex h-8 min-w-[2rem] items-center justify-center rounded-full bg-indigo-600 px-2 text-xs font-black text-white shadow-md shadow-indigo-600/25 ring-2 ring-white/30"
                    aria-label={`第 ${idx + 1} 行`}
                  >
                    {idx + 1}
                  </span>
                </div>
                <div className="space-y-2 min-w-0">
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block tracking-widest">核心物料/组件</label>
                    <SearchableProductSelect
                      compact
                      categories={categories}
                      value={item.productId}
                      unavailableProductIds={unavailableProductIds}
                      disabledProductIds={bomBlockedProductIds}
                      allowQuickCreate={!embeddedInQuickCreateModal}
                      onChange={val => {
                        const p = products.find(x => x.id === val);
                        onUpdateBOMItem(idx, { productId: val, categoryId: p?.categoryId });
                      }}
                      options={products.filter(p => p.id !== product?.id)}
                      placeholder="搜索并选择产品型号..."
                    />
                  </div>
                  {weightReportEnabledForBom && (() => {
                    const rawQty = item.quantityInput !== undefined && item.quantityInput !== ''
                      ? parseFloat(item.quantityInput)
                      : (typeof item.quantity === 'number' ? item.quantity : 0);
                    const qtySafe = Number.isFinite(rawQty) ? Math.max(0, rawQty) : 0;
                    const ratioPct = (!item.excludeFromWeightShare && shareBase > 0)
                      ? (qtySafe / shareBase) * 100
                      : null;
                    return (
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <label className="flex items-center gap-1.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={!!item.excludeFromWeightShare}
                            onChange={e => onUpdateBOMItem(idx, { excludeFromWeightShare: e.target.checked })}
                            className="w-3.5 h-3.5 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                          />
                          <span className="text-[10px] font-bold text-slate-500">不参与重量分摊</span>
                        </label>
                        <span className="text-[10px] font-bold text-slate-400">
                          按报工重量分摊占比：
                          <span className={`ml-1 tabular-nums ${ratioPct == null ? 'text-slate-300' : 'text-indigo-600'}`}>
                            {ratioPct == null ? '—' : `${ratioPct.toFixed(1)}%`}
                          </span>
                        </span>
                      </div>
                    );
                  })()}
                </div>
                <div className="w-full md:w-32">
                  <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block tracking-widest">标准单位用量</label>
                  <input
                    type="number"
                    value={item.quantityInput ?? (item.quantity != null && item.quantity !== '' && item.quantity !== 0 ? Number(item.quantity) : '')}
                    onChange={e => {
                      const raw = e.target.value;
                      const num = raw === '' ? 0 : (parseFloat(raw) || 0);
                      onUpdateBOMItem(idx, { quantityInput: raw, quantity: num });
                    }}
                    className="w-full bg-white border border-slate-100 rounded-xl p-3 text-xs font-bold outline-none text-center"
                  />
                </div>
              </div>
            );
          })}
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => setWorkingBOM({ ...workingBOM, items: [...workingBOM.items, { productId: '', quantity: 0 }] })}
              className="flex-1 py-3.5 border-2 border-dashed border-indigo-200 rounded-2xl text-indigo-500 font-bold text-xs hover:bg-white hover:border-indigo-400 transition-all flex items-center justify-center gap-2 group"
            >
              <Plus className="w-4 h-4 group-hover:scale-110 transition-transform shrink-0" /> 添加物料清单行
            </button>
            <button
              type="button"
              onClick={() => setBomBatchOpen(o => !o)}
              className={`sm:min-w-[10rem] py-3.5 border-2 rounded-2xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
                bomBatchOpen
                  ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                  : 'border-dashed border-slate-200 text-slate-600 hover:border-indigo-200 hover:bg-slate-50'
              }`}
            >
              <ListChecks className="w-4 h-4 shrink-0" />
              {bomBatchOpen ? '收起批量添加' : '批量勾选添加'}
            </button>
          </div>
          <BomBatchAddPanelComponent
            open={bomBatchOpen}
            onClose={() => setBomBatchOpen(false)}
            options={products.filter(p => p.id !== product?.id)}
            categories={categories}
            alreadyUsedProductIds={workingBOM.items.map(i => i.productId).filter(Boolean)}
            blockedProductIds={bomBlockedProductIds}
            parentProductId={product?.id ?? ''}
            allowQuickCreate={!embeddedInQuickCreateModal}
            onConfirm={rows => {
              setWorkingBOM({
                ...workingBOM,
                items: [
                  ...workingBOM.items,
                  ...rows.map(r => ({
                    productId: r.productId,
                    categoryId: r.categoryId,
                    quantity: 0,
                    quantityInput: '',
                  })),
                ],
              });
            }}
          />
        </div>

        <div className="flex-shrink-0 flex justify-end gap-3 p-6 pt-4 border-t border-slate-100 bg-white rounded-b-[28px]">
          <button type="button" onClick={onClose} disabled={bomSaving} className="px-5 py-3 rounded-2xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all disabled:opacity-50">取消</button>
          <button type="button" onClick={onSave} disabled={bomSaving} className="bg-indigo-600 text-white px-10 py-3 rounded-2xl font-black text-xs shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed">{bomSaving ? '保存中…' : '保存此节点的 BOM 方案'}</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default BomEditorPortal;
