import React, { useState, useMemo, useEffect } from 'react';
import { X, Save, Shirt } from 'lucide-react';
import type {
  DevStyleDto,
  DevBomDto,
  DevStageTemplateDto,
  AppDictionaries,
  ProductCategory,
  Partner,
  PartnerCategory,
  Product,
  GlobalNodeTemplate,
} from '../../types';
import { validateProductColorSizeSelection } from '../../utils/productColorSize';
import { devStyleToProductInfo, resolveDevStyleWithPublishedProduct } from '../../utils/productInfoDevStyleBridge';
import { validateProductCatalogUnique } from '../../utils/productCatalogUnique';
import { resolveProductSkuForSave } from '../../utils/productSkuAutoGen';
import { DevStyleStatus } from '../../types';
import DevStyleProductFields from './DevStyleProductFields';
import DevBomConfigSection from './DevBomConfigSection';
import DevStageTemplateModal, { type DevTemplatePerms } from './DevStageTemplateModal';
import { toast } from 'sonner';
import {
  outlineToolbarButtonClass,
  pageSubtitleClass,
  primaryToolbarButtonClass,
  sectionTitleClass,
} from '../../styles/uiDensity';

interface DevCreateStyleModalProps {
  open: boolean;
  isEdit: boolean;
  initial: DevStyleDto;
  categories: ProductCategory[];
  globalNodes: GlobalNodeTemplate[];
  dictionaries: AppDictionaries;
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  products: Product[];
  templates: DevStageTemplateDto[];
  canManageTemplates?: boolean;
  templatePerms?: DevTemplatePerms;
  /** 编辑态：该款式已保存的 BOM，用于在编辑弹窗中加载并直接持久化 */
  devBoms?: DevBomDto[];
  /** 编辑态：即时保存单条 BOM（创建态不传，走 pendingBoms 批量保存） */
  onSaveBom?: (bom: DevBomDto, exists: boolean) => Promise<DevBomDto | void>;
  onCreateTemplate: (name: string) => Promise<void>;
  onUpdateTemplate: (id: string, data: Partial<DevStageTemplateDto>) => Promise<void>;
  onDeleteTemplate: (id: string) => Promise<void>;
  onMoveTemplate: (id: string, dir: 'up' | 'down') => Promise<void>;
  onRefreshDictionaries: () => Promise<void>;
  onRefreshPartners: () => Promise<void>;
  onClose: () => void;
  onSave: (
    style: DevStyleDto,
    opts: { templateStageNames?: string[]; isNew: boolean; pendingBoms?: DevBomDto[] },
  ) => Promise<void>;
}

const DevCreateStyleModal: React.FC<DevCreateStyleModalProps> = ({
  open,
  isEdit,
  initial,
  categories,
  globalNodes,
  dictionaries,
  partners,
  partnerCategories,
  products,
  templates,
  canManageTemplates,
  templatePerms,
  devBoms,
  onSaveBom,
  onCreateTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onMoveTemplate,
  onRefreshDictionaries,
  onRefreshPartners,
  onClose,
  onSave,
}) => {
  const [working, setWorking] = useState<DevStyleDto>(() => JSON.parse(JSON.stringify(initial)));
  const [stageNames, setStageNames] = useState<string[]>([]);
  const [pendingBoms, setPendingBoms] = useState<DevBomDto[]>([]);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const isNew = useMemo(() => !isEdit, [isEdit]);

  useEffect(() => {
    if (!open) return;
    const merged = resolveDevStyleWithPublishedProduct(initial, products);
    setWorking(JSON.parse(JSON.stringify(merged)));
    setStageNames([]);
    setPendingBoms([]);
    setSaving(false);
  }, [open, initial, products]);

  if (!open) return null;

  const validate = (style: DevStyleDto): boolean => {
    const p = devStyleToProductInfo(style);
    if (!p.name.trim()) {
      toast.error('请填写产品全称');
      return false;
    }
    // 产品编号留空时已在 handleSave 经 resolveProductSkuForSave 自动生成；此处仅兜底
    if (!p.sku.trim()) {
      toast.error('请填写产品编号（款号）');
      return false;
    }
    const catalogConflict = validateProductCatalogUnique(products, {
      name: p.name,
      sku: p.sku,
      excludeProductId: style.publishedProductId,
    });
    if (catalogConflict) {
      toast.error(catalogConflict);
      return false;
    }
    if (isNew && stageNames.length === 0) {
      toast.error('请至少配置一个开发流程节点');
      return false;
    }
    const cat = categories.find((c) => c.id === style.categoryId);
    const colorSizeErr = validateProductColorSizeSelection(p, cat);
    if (colorSizeErr) {
      toast.error(colorSizeErr);
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    // 产品编号(款号)留空时自动生成，与「基本信息 → 产品档案」一致
    let next = working;
    if (!(working.code ?? '').trim()) {
      const resolved = resolveProductSkuForSave(devStyleToProductInfo(working), products);
      next = { ...working, code: resolved.sku };
      setWorking(next);
    }
    if (!validate(next)) return;
    setSaving(true);
    try {
      await onSave(
        {
          ...next,
          code: next.code.trim(),
          name: next.name.trim(),
          status: isNew ? DevStyleStatus.DEVELOPING : initial.status,
        },
        { templateStageNames: isNew ? stageNames : undefined, isNew, pendingBoms },
      );
      toast.success(isNew ? '款式已创建' : '已保存');
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[350] flex items-center justify-center p-3 sm:p-4">
        <div
          className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={onClose}
          role="presentation"
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="dev-create-style-title"
          className="relative bg-white w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <form autoComplete="off" onSubmit={(e) => e.preventDefault()} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 flex items-center justify-between gap-4 px-5 sm:px-6 py-4 border-b border-slate-100 bg-white">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/20 shrink-0">
                <Shirt className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 id="dev-create-style-title" className={`truncate ${sectionTitleClass}`}>
                  {isEdit ? '编辑款式信息' : '创建开发款式'}
                </h2>
                <p className={`truncate ${pageSubtitleClass} mt-0 max-w-none`}>
                  {isNew
                    ? '填写款式档案、开发流程与生产 BOM，创建后进入样品开发'
                    : '修改款式基础信息与生产配置'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all shrink-0"
              aria-label="关闭"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-slate-50/90 px-4 sm:px-6 py-5 space-y-4">
            <DevStyleProductFields
              working={working}
              setWorking={setWorking}
              categories={categories}
              dictionaries={dictionaries}
              partners={partners}
              partnerCategories={partnerCategories}
              products={products}
              templates={templates}
              isNewRecord={isNew}
              onRefreshDictionaries={onRefreshDictionaries}
              onRefreshPartners={onRefreshPartners}
              embeddedInModal
              showStageFlow={isNew}
              stageNames={stageNames}
              setStageNames={setStageNames}
              onOpenTemplateSettings={
                isNew && canManageTemplates ? () => setTemplateModalOpen(true) : undefined
              }
            />

            <DevBomConfigSection
              working={working}
              setWorking={setWorking}
              globalNodes={globalNodes}
              categories={categories}
              products={products}
              dictionaries={dictionaries}
              mode={isNew ? 'pending' : 'persist'}
              devBoms={isNew ? undefined : devBoms}
              pendingBoms={pendingBoms}
              onPendingBomsChange={setPendingBoms}
              onSaveBom={isNew ? undefined : onSaveBom}
              readOnly={false}
              embeddedInCreateModal
            />
          </div>

          <div className="shrink-0 flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-t border-slate-100 bg-white">
            {isNew && pendingBoms.length > 0 ? (
              <p className="hidden text-xs font-medium text-amber-700 sm:block">
                已配置 {pendingBoms.filter((b) => b.items?.some((i) => i.productId)).length} 条 BOM，将与款式一并保存
              </p>
            ) : (
              <span className="hidden sm:block" />
            )}
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className={`${outlineToolbarButtonClass} disabled:opacity-50`}
              >
                取消
              </button>
              <button
                type="button"
                disabled={saving}
                className={`inline-flex items-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 ${primaryToolbarButtonClass} disabled:opacity-50`}
                onClick={() => void handleSave()}
              >
                <Save className="h-4 w-4" />
                {saving ? '保存中…' : isNew ? '创建并开始开发' : '保存'}
              </button>
            </div>
          </div>
          </form>
        </div>
      </div>

      {canManageTemplates && (
        <DevStageTemplateModal
          open={templateModalOpen}
          templates={templates}
          perms={templatePerms}
          onClose={() => setTemplateModalOpen(false)}
          onCreateTemplate={onCreateTemplate}
          onUpdateTemplate={onUpdateTemplate}
          onDeleteTemplate={onDeleteTemplate}
          onMoveTemplate={onMoveTemplate}
        />
      )}
    </>
  );
};

export default DevCreateStyleModal;
