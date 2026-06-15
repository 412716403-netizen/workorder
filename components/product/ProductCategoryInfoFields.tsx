import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  X,
  Tag,
  FileText,
  DollarSign,
  ShoppingCart,
  ImagePlus,
  Image as ImageIcon,
} from 'lucide-react';
import type {
  Product,
  ProductCategory,
  PartnerCategory,
  AppDictionaries,
  DictionaryItem,
  Partner,
  ProductVariant,
} from '../../types';
import { productColorSizeEnabled } from '../../utils/productColorSize';
import ReportCustomFieldsEditor from '../ReportCustomFieldsEditor';
import { SupplierSelect } from '../SupplierSelect';
import SpecSelectorModal from './SpecSelectorModal';
import ColorSizeSpecPickerTable from './ColorSizeSpecPickerTable';
import { useAuthOptional } from '../../contexts/AuthContext';
import { hasSubPermission } from '../../utils/hasSubPermission';
import * as api from '../../services/api';
import { toast } from 'sonner';
import {
  resolveDefaultUnitForNewProductCategory,
  writeLastUnitForCategory,
} from '../../utils/productLastUnitByCategory';
import {
  productArchiveFormCardClass,
  productArchiveFormCategoryPillClass,
  productArchiveFormControlClass,
  productArchiveFormControlIconClass,
  productArchiveFormGridGapClass,
  productArchiveFormLabelClass,
  productArchiveFormPartnerTriggerClass,
  productArchiveFormQuickAddBtnClass,
  sectionTitleClass,
} from '../../styles/uiDensity';
import { dataUrlToBlobUrl } from '../../utils/routeReportFileUrls';
import { findPartnerByName } from '../../utils/partnerNormalize';

function resolveDefaultPartnerCategoryId(categories: PartnerCategory[]): string {
  return categories.find((c) => c.name.includes('供应商'))?.id ?? categories[0]?.id ?? '';
}

function FilePreviewPortal({
  preview,
  onClose,
}: {
  preview: { src: string; kind: 'image' | 'pdf' } | null;
  onClose: () => void;
}) {
  if (!preview || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-8 bg-slate-900/80 backdrop-blur-sm"
      style={{ zIndex: 2147483000 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="附件预览"
    >
      <button type="button" onClick={onClose} className="absolute top-6 right-6 z-10 p-2 rounded-full bg-white/20 hover:bg-white/40 text-white">
        <X className="w-8 h-8" />
      </button>
      <div className="relative z-10 w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {preview.kind === 'image' ? (
          <img src={preview.src} alt="预览" className="w-full h-full max-h-[85vh] object-contain" />
        ) : (
          <iframe src={preview.src} title="PDF 预览" className="w-full h-[85vh] border-0" />
        )}
      </div>
    </div>,
    document.body,
  );
}

export interface ProductCategoryInfoFieldsProps {
  working: Product;
  setWorking: React.Dispatch<React.SetStateAction<Product>>;
  categories: ProductCategory[];
  dictionaries: AppDictionaries;
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  /** 用于新建时按分类带出默认单位 */
  products: Product[];
  readOnly?: boolean;
  /** 未持久化的新建记录（产品档案 / 开发款式创建） */
  isNewRecord?: boolean;
  onRefreshDictionaries: () => Promise<void>;
  onRefreshPartners: () => Promise<void>;
  embeddedInQuickCreateModal?: boolean;
  /** 区块标题，默认与产品档案一致 */
  sectionHeading?: string;
  /** 是否使用卡片外框（产品档案 true；开发弹窗可 false） */
  useCardShell?: boolean;
  skuPlaceholder?: string;
}

/**
 * 与「基础信息 → 产品与 BOM」中「核心业务档案」一致的分类驱动字段：
 * 业务分类、名称、编号、单位、图片、价格/供应商、分类扩展属性、颜色尺码。
 */
const ProductCategoryInfoFields: React.FC<ProductCategoryInfoFieldsProps> = ({
  working,
  setWorking,
  categories,
  dictionaries,
  partners,
  partnerCategories,
  products,
  readOnly = false,
  isNewRecord = false,
  onRefreshDictionaries,
  onRefreshPartners,
  embeddedInQuickCreateModal = false,
  sectionHeading = '1. 核心业务档案',
  useCardShell = true,
  skuPlaceholder = '留空则保存时自动生成',
}) => {
  const auth = useAuthOptional();
  const nestedOverlayZ = embeddedInQuickCreateModal ? 'z-[11200]' : 'z-[10250]';

  const [modalType, setModalType] = useState<'color' | 'size' | null>(null);
  const [quickAddSpecOpen, setQuickAddSpecOpen] = useState<'color' | 'size' | null>(null);
  const [quickAddSpecName, setQuickAddSpecName] = useState('');
  const [quickAddSpecBusy, setQuickAddSpecBusy] = useState(false);
  const [quickAddUnitOpen, setQuickAddUnitOpen] = useState(false);
  const [quickAddUnitName, setQuickAddUnitName] = useState('');
  const [quickAddUnitBusy, setQuickAddUnitBusy] = useState(false);
  const [quickAddSupplierOpen, setQuickAddSupplierOpen] = useState(false);
  const [quickAddSupplierName, setQuickAddSupplierName] = useState('');
  const [quickAddSupplierCategoryId, setQuickAddSupplierCategoryId] = useState(() =>
    resolveDefaultPartnerCategoryId(partnerCategories),
  );
  const [quickAddSupplierBusy, setQuickAddSupplierBusy] = useState(false);
  const [productImageDragOver, setProductImageDragOver] = useState(false);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [filePreview, setFilePreview] = useState<{ src: string; kind: 'image' | 'pdf' } | null>(null);
  const filePreviewRevokeRef = useRef<(() => void) | undefined>(undefined);

  const activeCategory = categories.find((c) => c.id === working.categoryId);

  const canQuickAddSupplier = useMemo(() => {
    const tctx = auth?.tenantCtx;
    if (!tctx) return false;
    if (tctx.tenantRole === 'owner') return true;
    return (
      hasSubPermission(tctx.permissions, 'basic:partners:view') &&
      hasSubPermission(tctx.permissions, 'basic:partners:create')
    );
  }, [auth]);

  const persistLastUnitPreference = useCallback(
    (categoryId: string | undefined, unitId: string | undefined) => {
      const cid = (categoryId ?? '').trim();
      const uid = (unitId ?? '').trim();
      if (!cid || !uid) return;
      writeLastUnitForCategory(auth?.tenantCtx?.tenantId, cid, uid);
    },
    [auth?.tenantCtx?.tenantId],
  );

  const openFilePreview = useCallback((rawUrl: string, kind: 'image' | 'pdf') => {
    filePreviewRevokeRef.current?.();
    filePreviewRevokeRef.current = undefined;
    if (kind === 'pdf' && rawUrl.startsWith('data:')) {
      const conv = dataUrlToBlobUrl(rawUrl);
      if (conv) {
        filePreviewRevokeRef.current = conv.revoke;
        setFilePreview({ src: conv.url, kind: 'pdf' });
        return;
      }
    }
    setFilePreview({ src: rawUrl, kind });
  }, []);

  const closeFilePreview = useCallback(() => {
    filePreviewRevokeRef.current?.();
    filePreviewRevokeRef.current = undefined;
    setFilePreview(null);
  }, []);

  const applyProductImageFile = useCallback((file: File | null | undefined) => {
    if (!file || readOnly) return;
    if (!file.type.startsWith('image/')) {
      toast.error('请使用图片文件（JPG、PNG、GIF 等）');
      return;
    }
    const r = new FileReader();
    r.onload = () => setWorking((wp) => ({ ...wp, imageUrl: r.result as string }));
    r.readAsDataURL(file);
  }, [readOnly, setWorking]);

  useEffect(() => () => {
    filePreviewRevokeRef.current?.();
  }, []);

  useEffect(() => {
    if (!isNewRecord) return;
    const cid = (working.categoryId ?? '').trim();
    if (!cid || (working.unitId ?? '').trim()) return;
    const unitIds = new Set((dictionaries.units ?? []).map((u) => u.id));
    if (unitIds.size === 0) return;
    const preferred = resolveDefaultUnitForNewProductCategory(
      auth?.tenantCtx?.tenantId,
      cid,
      products,
      unitIds,
    );
    if (!preferred) return;
    setWorking((wp) => {
      if ((wp.categoryId ?? '').trim() !== cid || (wp.unitId ?? '').trim()) return wp;
      return { ...wp, unitId: preferred };
    });
  }, [
    isNewRecord,
    working.categoryId,
    working.unitId,
    products,
    dictionaries.units,
    auth?.tenantCtx?.tenantId,
    setWorking,
  ]);

  const generateVariants = (
    colorIds: string[],
    sizeIds: string[],
    existingVariants: ProductVariant[],
  ): ProductVariant[] => {
    if (colorIds.length === 0 && sizeIds.length === 0) return [];
    const colors = colorIds.length > 0 ? colorIds : ['none'];
    const sizes = sizeIds.length > 0 ? sizeIds : ['none'];
    const newVariants: ProductVariant[] = [];
    for (const cId of colors) {
      for (const sId of sizes) {
        const existing = existingVariants.find((v) => v.colorId === cId && v.sizeId === sId);
        if (existing) {
          newVariants.push(existing);
        } else {
          const colorName = dictionaries.colors.find((c) => c.id === cId)?.name || '';
          const sizeName = dictionaries.sizes.find((s) => s.id === sId)?.name || '';
          newVariants.push({
            id: `v-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            colorId: cId,
            sizeId: sId,
            skuSuffix: `${colorName}${colorName && sizeName ? '-' : ''}${sizeName}`,
            nodeBoms: {},
          });
        }
      }
    }
    return newVariants;
  };

  useEffect(() => {
    if (!productColorSizeEnabled(working, activeCategory)) return;
    const newVariants = generateVariants(working.colorIds, working.sizeIds, working.variants);
    const currentHash = working.variants.map((v) => `${v.colorId}-${v.sizeId}`).sort().join(',');
    const nextHash = newVariants.map((v) => `${v.colorId}-${v.sizeId}`).sort().join(',');
    if (currentHash !== nextHash) setWorking({ ...working, variants: newVariants });
  }, [working.colorIds, working.sizeIds, activeCategory?.hasColorSize, activeCategory?.id]);

  const toggleAttribute = (type: 'color' | 'size', id: string) => {
    const key = type === 'color' ? 'colorIds' : 'sizeIds';
    const current = [...working[key]];
    const index = current.indexOf(id);
    if (index > -1) current.splice(index, 1);
    else current.push(id);
    setWorking({ ...working, [key]: current });
  };

  const handleAddNewSpec = async (type: 'colors' | 'sizes', name: string): Promise<boolean> => {
    try {
      const dictType = type === 'colors' ? 'color' : 'size';
      const created = await api.dictionaries.create({
        type: dictType,
        name,
        value: type === 'colors' ? '#ccc' : name,
      }) as DictionaryItem;
      await onRefreshDictionaries();
      const key = type === 'colors' ? 'colorIds' : 'sizeIds';
      setWorking((wp) => ({ ...wp, [key]: [...wp[key], created.id] }));
      return true;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '操作失败');
      return false;
    }
  };

  const submitQuickAddSpec = async () => {
    const kind = quickAddSpecOpen;
    if (!kind) return;
    const name = quickAddSpecName.trim();
    if (!name) {
      toast.error(kind === 'color' ? '请输入颜色名称' : '请输入尺码名称');
      return;
    }
    const items = kind === 'color' ? dictionaries.colors : dictionaries.sizes;
    const existing = items.find((i) => i.name === name);
    if (existing) {
      const key = kind === 'color' ? 'colorIds' : 'sizeIds';
      if (working[key].includes(existing.id)) {
        toast.info(kind === 'color' ? '该颜色已在已选列表中' : '该尺码已在已选列表中');
      } else {
        setWorking({ ...working, [key]: [...working[key], existing.id] });
      }
      setQuickAddSpecOpen(null);
      setQuickAddSpecName('');
      return;
    }
    if (quickAddSpecBusy) return;
    setQuickAddSpecBusy(true);
    try {
      const ok = await handleAddNewSpec(kind === 'color' ? 'colors' : 'sizes', name);
      if (ok) {
        toast.success(kind === 'color' ? '已添加颜色' : '已添加尺码');
        setQuickAddSpecOpen(null);
        setQuickAddSpecName('');
      }
    } finally {
      setQuickAddSpecBusy(false);
    }
  };

  const submitQuickAddUnit = async () => {
    const name = quickAddUnitName.trim();
    if (!name) {
      toast.error('请输入单位名称');
      return;
    }
    const units = dictionaries.units ?? [];
    const existing = units.find((u) => u.name === name);
    if (existing) {
      setWorking({ ...working, unitId: existing.id });
      if (isNewRecord) persistLastUnitPreference(working.categoryId, existing.id);
      setQuickAddUnitOpen(false);
      setQuickAddUnitName('');
      return;
    }
    if (quickAddUnitBusy) return;
    setQuickAddUnitBusy(true);
    try {
      const created = await api.dictionaries.create({ type: 'unit', name, value: name }) as DictionaryItem;
      await onRefreshDictionaries();
      setWorking({ ...working, unitId: created.id });
      if (isNewRecord) persistLastUnitPreference(working.categoryId, created.id);
      toast.success('已添加产品单位');
      setQuickAddUnitOpen(false);
      setQuickAddUnitName('');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '添加失败');
    } finally {
      setQuickAddUnitBusy(false);
    }
  };

  const submitQuickAddSupplier = async () => {
    const name = quickAddSupplierName.trim();
    if (!name) {
      toast.error('请输入供应商名称');
      return;
    }
    const existing = findPartnerByName(partners, name);
    if (existing) {
      setWorking({ ...working, supplierId: existing.id });
      setQuickAddSupplierOpen(false);
      setQuickAddSupplierName('');
      return;
    }
    if (quickAddSupplierBusy) return;
    setQuickAddSupplierBusy(true);
    try {
      const created = await api.partners.create({
        name,
        categoryId: quickAddSupplierCategoryId || undefined,
        contact: '',
        customData: {},
      }) as Partner;
      await onRefreshPartners();
      setWorking({ ...working, supplierId: created.id });
      toast.success('已添加供应商');
      setQuickAddSupplierOpen(false);
      setQuickAddSupplierName('');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '添加失败');
    } finally {
      setQuickAddSupplierBusy(false);
    }
  };

  const shellClass = useCardShell ? productArchiveFormCardClass : 'space-y-4';
  // 产品新增/编辑/详情表单始终展示分类的全部扩展字段；showInForm 仅控制计划单/工单中心列表是否展示。
  const visibleCustomFields = activeCategory?.customFields ?? [];
  const showColorSizeSpecs = productColorSizeEnabled(working, activeCategory);
  const showExtendedSection = visibleCustomFields.length > 0 || showColorSizeSpecs;
  const extendedSectionTitle =
    visibleCustomFields.length > 0 && showColorSizeSpecs
      ? '扩展属性与规格'
      : visibleCustomFields.length > 0
        ? '分类专用扩展属性'
        : '颜色尺码规格';

  return (
    <>
      <FilePreviewPortal preview={filePreview} onClose={closeFilePreview} />
      {lightboxImageUrl && (
        <div
          className={`fixed inset-0 ${nestedOverlayZ} flex items-center justify-center p-8 bg-slate-900/80`}
          onClick={() => setLightboxImageUrl(null)}
          role="presentation"
        >
          <img src={lightboxImageUrl} alt="" className="max-h-[90vh] max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      <SpecSelectorModal
        isOpen={modalType === 'color'}
        onClose={() => setModalType(null)}
        title="选取款式生产颜色"
        type="color"
        items={dictionaries.colors}
        selectedIds={working.colorIds}
        onToggle={(id) => toggleAttribute('color', id)}
        onAddNew={(name) => void handleAddNewSpec('colors', name)}
        stackZClass={nestedOverlayZ}
      />
      <SpecSelectorModal
        isOpen={modalType === 'size'}
        onClose={() => setModalType(null)}
        title="选取款式生产尺码"
        type="size"
        items={dictionaries.sizes}
        selectedIds={working.sizeIds}
        onToggle={(id) => toggleAttribute('size', id)}
        onAddNew={(name) => void handleAddNewSpec('sizes', name)}
        stackZClass={nestedOverlayZ}
      />

      {quickAddUnitOpen && (
        <div className={`fixed inset-0 ${nestedOverlayZ} flex items-center justify-center p-4`}>
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => !quickAddUnitBusy && setQuickAddUnitOpen(false)} role="presentation" />
          <div className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">新增产品单位</h2>
            <input
              autoFocus
              value={quickAddUnitName}
              onChange={(e) => setQuickAddUnitName(e.target.value)}
              className={productArchiveFormControlClass}
              disabled={quickAddUnitBusy}
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setQuickAddUnitOpen(false)} className="text-xs font-bold text-slate-500">取消</button>
              <button type="button" onClick={() => void submitQuickAddUnit()} className="text-xs font-bold text-indigo-600">确定</button>
            </div>
          </div>
        </div>
      )}

      {quickAddSpecOpen && (
        <div className={`fixed inset-0 ${nestedOverlayZ} flex items-center justify-center p-4`}>
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => !quickAddSpecBusy && setQuickAddSpecOpen(null)} role="presentation" />
          <div className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">{quickAddSpecOpen === 'color' ? '新增颜色' : '新增尺码'}</h2>
            <input
              autoFocus
              value={quickAddSpecName}
              onChange={(e) => setQuickAddSpecName(e.target.value)}
              className={productArchiveFormControlClass}
              disabled={quickAddSpecBusy}
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setQuickAddSpecOpen(null)} className="text-xs font-bold text-slate-500">取消</button>
              <button type="button" onClick={() => void submitQuickAddSpec()} className="text-xs font-bold text-indigo-600">确定</button>
            </div>
          </div>
        </div>
      )}

      {quickAddSupplierOpen && (
        <div className={`fixed inset-0 ${nestedOverlayZ} flex items-center justify-center p-4`}>
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => !quickAddSupplierBusy && setQuickAddSupplierOpen(false)} role="presentation" />
          <div className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">新增供应商</h2>
            <input
              value={quickAddSupplierName}
              onChange={(e) => setQuickAddSupplierName(e.target.value)}
              className={productArchiveFormControlClass}
              disabled={quickAddSupplierBusy}
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setQuickAddSupplierOpen(false)} className="text-xs font-bold text-slate-500">取消</button>
              <button type="button" onClick={() => void submitQuickAddSupplier()} className="text-xs font-bold text-indigo-600">确定</button>
            </div>
          </div>
        </div>
      )}

      <div className={shellClass}>
        {useCardShell && (
          <div className="flex items-center gap-3 border-b border-slate-50 pb-3">
            <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
              <FileText className="w-4 h-4" />
            </div>
            <h3 className={sectionTitleClass}>{sectionHeading}</h3>
          </div>
        )}
        {!useCardShell && sectionHeading && (
          <h3 className={sectionTitleClass}>{sectionHeading}</h3>
        )}

        <div className={`grid grid-cols-1 md:grid-cols-2 ${productArchiveFormGridGapClass}`}>
          <div className="md:col-span-2 space-y-2">
            <label className={productArchiveFormLabelClass}>业务分类</label>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="选择业务分类">
              {categories.map((cat) => {
                const active = working.categoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    disabled={readOnly}
                    onClick={() => {
                      setWorking((wp) => {
                        const next: Product = { ...wp, categoryId: cat.id };
                        if (isNewRecord) {
                          const unitIds = new Set((dictionaries.units ?? []).map((u) => u.id));
                          const preferred = resolveDefaultUnitForNewProductCategory(
                            auth?.tenantCtx?.tenantId,
                            cat.id,
                            products,
                            unitIds,
                          );
                          next.unitId = preferred ?? undefined;
                        }
                        return next;
                      });
                    }}
                    className={productArchiveFormCategoryPillClass(active)}
                  >
                    {cat.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1">
            <label className={productArchiveFormLabelClass}>
              产品全称 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              disabled={readOnly}
              value={working.name}
              onChange={(e) => setWorking({ ...working, name: e.target.value })}
              className={productArchiveFormControlClass}
              autoComplete={embeddedInQuickCreateModal ? 'off' : undefined}
              name={embeddedInQuickCreateModal ? 'dev-style-product-name' : undefined}
            />
          </div>
          <div className="space-y-1">
            <label className={productArchiveFormLabelClass}>产品编号</label>
            <input
              type="text"
              disabled={readOnly}
              value={working.sku}
              onChange={(e) => setWorking({ ...working, sku: e.target.value })}
              placeholder={skuPlaceholder}
              className={productArchiveFormControlClass}
              autoComplete={embeddedInQuickCreateModal ? 'off' : undefined}
              name={embeddedInQuickCreateModal ? 'dev-style-product-code' : undefined}
              inputMode={embeddedInQuickCreateModal ? 'text' : undefined}
            />
          </div>
          <div className="space-y-1">
            <label className={productArchiveFormLabelClass}>产品单位</label>
            <div className="flex gap-2 items-stretch">
              <select
                disabled={readOnly}
                value={working.unitId ?? ''}
                onChange={(e) => {
                  const unitId = e.target.value || undefined;
                  setWorking({ ...working, unitId });
                  if (isNewRecord) persistLastUnitPreference(working.categoryId, unitId);
                }}
                className={`${productArchiveFormControlClass} flex-1 min-w-0`}
              >
                <option value="">请选择单位</option>
                {(dictionaries.units ?? []).map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              {!readOnly && (
                <button
                  type="button"
                  title="快速添加产品单位"
                  onClick={() => {
                    setQuickAddUnitName('');
                    setQuickAddUnitOpen(true);
                  }}
                  className={productArchiveFormQuickAddBtnClass}
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="md:col-span-2 space-y-1">
            <label className={productArchiveFormLabelClass}>产品图片</label>
            <div
              className={`flex items-center gap-4 rounded-2xl p-3 -m-1 transition-all ${
                productImageDragOver ? 'bg-indigo-50/90 ring-2 ring-indigo-400' : ''
              }`}
              onDragOver={(e) => {
                if (readOnly) return;
                e.preventDefault();
                setProductImageDragOver(true);
              }}
              onDragLeave={() => setProductImageDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setProductImageDragOver(false);
                applyProductImageFile(e.dataTransfer.files?.[0]);
              }}
            >
              <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center overflow-hidden border-2 border-dashed border-slate-200 shrink-0">
                {working.imageUrl ? (
                  <button type="button" onClick={() => setLightboxImageUrl(working.imageUrl ?? null)} className="w-full h-full">
                    <img src={working.imageUrl} alt="" className="w-full h-full object-cover" />
                  </button>
                ) : (
                  <ImageIcon className="w-8 h-8 text-slate-300" />
                )}
              </div>
              {!readOnly && (
                <div>
                  <input id="pci-image-upload" type="file" accept="image/*" className="hidden" onChange={(e) => {
                    applyProductImageFile(e.target.files?.[0]);
                    e.target.value = '';
                  }} />
                  <label htmlFor="pci-image-upload" className="inline-flex items-center gap-1.5 h-9 px-3 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-medium cursor-pointer">
                    <ImagePlus className="w-3.5 h-3.5" /> 上传图片
                  </label>
                </div>
              )}
            </div>
          </div>

          {(activeCategory?.hasSalesPrice || activeCategory?.hasPurchasePrice || activeCategory?.linkPartner) && (
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4 pt-3">
              {activeCategory.hasSalesPrice && (
                <div className="space-y-1">
                  <label className={productArchiveFormLabelClass}>标准销售单价 (CNY)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
                    <input
                      type="number"
                      disabled={readOnly}
                      value={working.salesPrice ?? ''}
                      onChange={(e) =>
                        setWorking({
                          ...working,
                          salesPrice: e.target.value === '' ? undefined : parseFloat(e.target.value) || 0,
                        })
                      }
                      className={productArchiveFormControlIconClass}
                    />
                  </div>
                </div>
              )}
              {activeCategory.hasPurchasePrice && (
                <div className="space-y-1">
                  <label className={productArchiveFormLabelClass}>参考采购单价 (CNY)</label>
                  <div className="relative">
                    <ShoppingCart className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
                    <input
                      type="number"
                      disabled={readOnly}
                      value={working.purchasePrice ?? ''}
                      onChange={(e) =>
                        setWorking({
                          ...working,
                          purchasePrice: e.target.value === '' ? undefined : parseFloat(e.target.value) || 0,
                        })
                      }
                      className={productArchiveFormControlIconClass}
                    />
                  </div>
                </div>
              )}
              {activeCategory.linkPartner && (
                <div className="space-y-1">
                  <label className={productArchiveFormLabelClass}>合作单位</label>
                  <div className="flex gap-2 items-stretch">
                    <div className="flex-1 min-w-0">
                      <SupplierSelect
                        options={partners}
                        categories={partnerCategories}
                        value={working.supplierId || ''}
                        onChange={(_, id) => setWorking({ ...working, supplierId: id })}
                        valueMode="id"
                        placeholder="未关联合作单位"
                        portalZIndex={embeddedInQuickCreateModal ? 10900 : undefined}
                        triggerClassName={productArchiveFormPartnerTriggerClass}
                      />
                    </div>
                    {canQuickAddSupplier && !readOnly && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuickAddSupplierName('');
                          setQuickAddSupplierCategoryId(resolveDefaultPartnerCategoryId(partnerCategories));
                          setQuickAddSupplierOpen(true);
                        }}
                        className={productArchiveFormQuickAddBtnClass}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {showExtendedSection && (
            <div className="md:col-span-2 pt-4 mt-1 border-t border-slate-100 space-y-4">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Tag className="w-3.5 h-3.5" />
                {extendedSectionTitle}
              </h4>

              {visibleCustomFields.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ReportCustomFieldsEditor
                    variant="grid"
                    fields={visibleCustomFields}
                    values={working.categoryCustomData ?? {}}
                    onChange={(fieldId, value) =>
                      setWorking({
                        ...working,
                        categoryCustomData: { ...working.categoryCustomData, [fieldId]: value },
                      })
                    }
                    inputClassName={productArchiveFormControlClass}
                    onFilePreview={openFilePreview}
                  />
                </div>
              )}

              {showColorSizeSpecs && (
                <ColorSizeSpecPickerTable
                  colorIds={working.colorIds}
                  sizeIds={working.sizeIds}
                  dictionaries={dictionaries}
                  readOnly={readOnly}
                  onOpenColorPicker={() => setModalType('color')}
                  onOpenSizePicker={() => setModalType('size')}
                  onQuickAddColor={
                    readOnly
                      ? undefined
                      : () => {
                          setQuickAddSpecName('');
                          setQuickAddSpecOpen('color');
                        }
                  }
                  onQuickAddSize={
                    readOnly
                      ? undefined
                      : () => {
                          setQuickAddSpecName('');
                          setQuickAddSpecOpen('size');
                        }
                  }
                />
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ProductCategoryInfoFields;
