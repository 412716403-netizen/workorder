import React, { useCallback, useMemo } from 'react';
import { Settings2, FileText, GitBranch } from 'lucide-react';
import type {
  AppDictionaries,
  DevStyleDto,
  DevStageTemplateDto,
  Partner,
  PartnerCategory,
  Product,
  ProductCategory,
} from '../../types';
import ProductCategoryInfoFields from '../../components/product/ProductCategoryInfoFields';
import { devStyleToProductInfo, patchDevStyleFromProduct, resolveDevStyleWithPublishedProduct } from '../../utils/productInfoDevStyleBridge';
import DevFlowNodePicker from './DevFlowNodePicker';
import DevCreateSectionCard from './DevCreateSectionCard';

export interface DevStyleProductFieldsProps {
  working: DevStyleDto;
  setWorking: React.Dispatch<React.SetStateAction<DevStyleDto>>;
  categories: ProductCategory[];
  dictionaries: AppDictionaries;
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  products: Product[];
  templates: DevStageTemplateDto[];
  readOnly?: boolean;
  isNewRecord?: boolean;
  onRefreshDictionaries: () => Promise<void>;
  onRefreshPartners: () => Promise<void>;
  embeddedInModal?: boolean;
  showStageFlow?: boolean;
  stageNames: string[];
  setStageNames: React.Dispatch<React.SetStateAction<string[]>>;
  onOpenTemplateSettings?: () => void;
}

/**
 * 开发款式「商品信息」：与基础信息产品档案共用 ProductCategoryInfoFields，按分类显示相同字段。
 * 客户分组/排序由「首选供应商」推导，不再单独录入客户字段。
 */
const DevStyleProductFields: React.FC<DevStyleProductFieldsProps> = ({
  working,
  setWorking,
  categories,
  dictionaries,
  partners,
  partnerCategories,
  products,
  templates,
  readOnly,
  isNewRecord,
  onRefreshDictionaries,
  onRefreshPartners,
  embeddedInModal,
  showStageFlow,
  stageNames,
  setStageNames,
  onOpenTemplateSettings,
}) => {
  const styleForProductFields = useMemo(
    () => resolveDevStyleWithPublishedProduct(working, products),
    [working, products],
  );
  const productWorking = useMemo(() => devStyleToProductInfo(styleForProductFields), [styleForProductFields]);

  const setProductWorking = useCallback(
    (updater: React.SetStateAction<Product>) => {
      setWorking((prev) => {
        const prevP = devStyleToProductInfo(prev);
        const nextP = typeof updater === 'function' ? updater(prevP) : updater;
        const patched = patchDevStyleFromProduct(prev, nextP);
        const sid = nextP.supplierId?.trim();
        const customerName = sid ? partners.find((p) => p.id === sid)?.name?.trim() : undefined;
        return { ...patched, customerName };
      });
    },
    [setWorking, partners],
  );

  const stageOptions = useMemo(
    () => templates.map((t) => ({ id: t.name, label: t.name })),
    [templates],
  );

  const templateSettingsBtn =
    onOpenTemplateSettings && !readOnly ? (
      <button
        type="button"
        onClick={onOpenTemplateSettings}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-500 hover:border-indigo-200 hover:text-indigo-600 shadow-sm transition-colors"
      >
        <Settings2 className="w-3.5 h-3.5" />
        开发节点库
      </button>
    ) : null;

  const productFields = (
    <ProductCategoryInfoFields
      working={productWorking}
      setWorking={setProductWorking}
      categories={categories}
      dictionaries={dictionaries}
      partners={partners}
      partnerCategories={partnerCategories}
      products={products}
      readOnly={readOnly}
      isNewRecord={isNewRecord}
      onRefreshDictionaries={onRefreshDictionaries}
      onRefreshPartners={onRefreshPartners}
      embeddedInQuickCreateModal={embeddedInModal}
      sectionHeading={embeddedInModal ? '' : '款式 / 商品信息'}
      useCardShell={!embeddedInModal}
      skuPlaceholder="款号（产品编号），发布大货时同步"
    />
  );

  const stageFlowPicker =
    showStageFlow && !readOnly ? (
      <DevFlowNodePicker
        title="开发流程节点配置"
        options={stageOptions}
        selectedIds={stageNames}
        onSelectedIdsChange={setStageNames}
        onOpenSettings={embeddedInModal ? undefined : onOpenTemplateSettings}
        settingsLabel="开发节点库"
        embedded={embeddedInModal}
        hideHeader={embeddedInModal}
        optionsEmptyMessage='暂无节点，请点击右上角「开发节点库」添加'
        selectedEmptyMessage="请点击上方节点选择开发流程"
      />
    ) : null;

  if (embeddedInModal) {
    return (
      <div className="space-y-4">
        <DevCreateSectionCard
          title="款式 / 商品信息"
          description="分类、款号、颜色尺码等，发布大货时同步至产品档案"
          icon={FileText}
        >
          {productFields}
        </DevCreateSectionCard>

        {stageFlowPicker ? (
          <DevCreateSectionCard
            title="开发流程节点"
            description="选择样品开发进度节点，按顺序登记各阶段"
            icon={GitBranch}
            iconTone="violet"
            headerExtra={templateSettingsBtn}
          >
            {stageFlowPicker}
          </DevCreateSectionCard>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {productFields}
      {stageFlowPicker}
    </div>
  );
};

export default DevStyleProductFields;
