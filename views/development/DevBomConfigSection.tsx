import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Boxes, Factory } from 'lucide-react';
import type {
  AppDictionaries,
  BOMItem,
  DevBomDto,
  DevStyleDto,
  GlobalNodeTemplate,
  Product,
  ProductCategory,
  ProductVariant,
} from '../../types';
import { devStyleToProductForBom, devBomsToProductBoms } from '../../utils/devStyleToProduct';
import {
  buildDevSingleSkuNodeBOMs,
  devSingleSkuVariantId,
  workingBomToDevBom,
} from '../../utils/devBomHelpers';
import { bomHasConfiguredItems } from '../../utils/bomEffective';
import { isProductBlockedAsBomMaterial } from '../../utils/productBomMaterial';
import { sortVariantsByColorThenSize } from '../../utils/sortVariantsByProduct';
import BomVariantMatrix from '../../components/product/BomVariantMatrix';
import BomEditorPortal, { useBomEditorPortalState } from '../product-management/BomEditorPortal';
import DevFlowNodePicker from './DevFlowNodePicker';
import DevCreateSectionCard from './DevCreateSectionCard';
import { pageSubtitleClass, sectionTitleClass } from '../../styles/uiDensity';
import { toast } from 'sonner';
import * as api from '../../services/api';

export type DevBomPersistMode = 'persist' | 'pending';

interface DevBomConfigSectionProps {
  working: DevStyleDto;
  setWorking: React.Dispatch<React.SetStateAction<DevStyleDto>>;
  globalNodes: GlobalNodeTemplate[];
  categories: ProductCategory[];
  products: Product[];
  dictionaries: AppDictionaries;
  devBoms?: DevBomDto[];
  mode: DevBomPersistMode;
  pendingBoms?: DevBomDto[];
  onPendingBomsChange?: (boms: DevBomDto[]) => void;
  onSaveBom?: (bom: DevBomDto, exists: boolean) => Promise<DevBomDto | void>;
  readOnly?: boolean;
  /** 嵌入「创建开发款式」弹窗：分区卡片布局 */
  embeddedInCreateModal?: boolean;
}

const DevBomConfigSection: React.FC<DevBomConfigSectionProps> = ({
  working,
  setWorking,
  globalNodes,
  categories,
  products,
  dictionaries,
  devBoms = [],
  mode,
  pendingBoms = [],
  onPendingBomsChange,
  onSaveBom,
  readOnly,
  embeddedInCreateModal,
}) => {
  const bomState = useBomEditorPortalState();
  const copyBOMTriggerRef = useRef<HTMLButtonElement>(null);
  const productShape = useMemo(() => devStyleToProductForBom(working), [working]);
  const singleSkuVariantId = devSingleSkuVariantId(working.id);

  const {
    activeVariantIdForBOM,
    activeNodeIdForBOM,
    workingBOM,
    setWorkingBOM,
    copyBOMDropdownOpen,
    setCopyBOMDropdownOpen,
    setCopyBOMDropdownStyle,
  } = bomState;

  useEffect(() => {
    if (copyBOMDropdownOpen && copyBOMTriggerRef.current) {
      const rect = copyBOMTriggerRef.current.getBoundingClientRect();
      const z = embeddedInCreateModal || mode === 'pending' ? 11400 : 10800;
      setCopyBOMDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
        width: 256,
        zIndex: z,
      });
    }
  }, [copyBOMDropdownOpen, embeddedInCreateModal, mode, setCopyBOMDropdownStyle]);

  useEffect(() => {
    if (!activeVariantIdForBOM || !activeNodeIdForBOM) setCopyBOMDropdownOpen(false);
  }, [activeVariantIdForBOM, activeNodeIdForBOM, setCopyBOMDropdownOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (copyBOMTriggerRef.current?.contains(t) || (e.target as Element)?.closest?.('[data-portal-copy-bom]')) return;
      setCopyBOMDropdownOpen(false);
    };
    if (copyBOMDropdownOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [copyBOMDropdownOpen, setCopyBOMDropdownOpen]);

  const activeBomRows = useMemo(() => {
    if (mode === 'pending') return pendingBoms;
    return devBoms.filter((b) => b.parentStyleId === working.id);
  }, [mode, pendingBoms, devBoms, working.id]);

  const bomsAsProduct = useMemo(() => devBomsToProductBoms(activeBomRows), [activeBomRows]);

  const enabledBOMNodes = useMemo(
    () => globalNodes.filter((n) => working.milestoneNodeIds.includes(n.id) && n.hasBOM),
    [globalNodes, working.milestoneNodeIds],
  );

  const singleSkuNodeBOMs = useMemo(
    () => buildDevSingleSkuNodeBOMs(bomsAsProduct, working.id),
    [bomsAsProduct, working.id],
  );

  const bomBlockedProductIds = useMemo(
    () => products.filter(isProductBlockedAsBomMaterial).map((p) => p.id),
    [products],
  );

  const activeCategory = categories.find((c) => c.id === working.categoryId);
  const showProcessBom = activeCategory?.hasProcess === true;

  const milestoneOptions = useMemo(
    () =>
      globalNodes.map((gn) => ({
        id: gn.id,
        label: gn.name,
        chipSuffix: gn.hasBOM ? '· BOM' : undefined,
      })),
    [globalNodes],
  );

  const findBomForVariant = useCallback(
    (variantId: string, nodeId: string) => {
      const isSingleSku = variantId === singleSkuVariantId;
      return bomsAsProduct.find(
        (b) =>
          b.nodeId === nodeId &&
          bomHasConfiguredItems(b) &&
          (isSingleSku ? !b.variantId || b.variantId === singleSkuVariantId : b.variantId === variantId),
      );
    },
    [bomsAsProduct, singleSkuVariantId],
  );

  const availableBOMSources = useMemo(() => {
    if (!activeVariantIdForBOM || !activeNodeIdForBOM) return [];
    const filtered = productShape.variants.filter((srcV) => {
      if (srcV.id === activeVariantIdForBOM) return false;
      return !!findBomForVariant(srcV.id, activeNodeIdForBOM);
    });
    return sortVariantsByColorThenSize(filtered, productShape.colorIds, productShape.sizeIds);
  }, [
    activeVariantIdForBOM,
    activeNodeIdForBOM,
    productShape.variants,
    productShape.colorIds,
    productShape.sizeIds,
    findBomForVariant,
  ]);

  const copyBOMFrom = useCallback(
    (sourceVariantId: string) => {
      if (!activeNodeIdForBOM || !workingBOM) return;
      const sourceBOM = findBomForVariant(sourceVariantId, activeNodeIdForBOM);
      if (!sourceBOM) return;
      const raw = JSON.parse(JSON.stringify(sourceBOM.items)) as BOMItem[];
      const merged = new Map<string, BOMItem>();
      for (const it of raw) {
        if (!it.productId?.trim()) continue;
        const srcP = products.find((x) => x.id === it.productId);
        if (srcP && isProductBlockedAsBomMaterial(srcP)) continue;
        const q = typeof it.quantity === 'number' && !Number.isNaN(it.quantity) ? it.quantity : Number(it.quantity) || 0;
        const prev = merged.get(it.productId);
        if (prev) {
          const pq = typeof prev.quantity === 'number' && !Number.isNaN(prev.quantity) ? prev.quantity : Number(prev.quantity) || 0;
          merged.set(it.productId, { ...prev, quantity: pq + q, quantityInput: undefined });
        } else {
          merged.set(it.productId, { ...it, quantity: q, quantityInput: undefined });
        }
      }
      setWorkingBOM({ ...workingBOM, items: Array.from(merged.values()) });
    },
    [activeNodeIdForBOM, workingBOM, findBomForVariant, products, setWorkingBOM],
  );

  const handleMilestoneChange = (ids: string[]) => {
    const removed = working.milestoneNodeIds.filter((id) => !ids.includes(id));
    setWorking({ ...working, milestoneNodeIds: ids });
    if (mode === 'pending' && removed.length > 0 && onPendingBomsChange) {
      onPendingBomsChange(pendingBoms.filter((b) => !removed.includes(b.nodeId ?? '')));
    }
  };

  const openBOMEditor = useCallback(
    (variant: ProductVariant, nodeId: string) => {
      bomState.setActiveVariantIdForBOM(variant.id);
      bomState.setActiveNodeIdForBOM(nodeId);
      const isSingleSkuUi = variant.id === singleSkuVariantId;
      const matchVariantId = isSingleSkuUi ? undefined : variant.id;
      const existingId =
        variant.nodeBoms?.[nodeId] ??
        bomsAsProduct.find(
          (b) =>
            (isSingleSkuUi ? !b.variantId || b.variantId === singleSkuVariantId : b.variantId === matchVariantId) &&
            b.nodeId === nodeId &&
            bomHasConfiguredItems(b),
        )?.id;
      if (existingId) {
        const bom = bomsAsProduct.find((b) => b.id === existingId);
        bomState.setWorkingBOM(bom ? JSON.parse(JSON.stringify(bom)) : null);
      } else {
        const nodeName = globalNodes.find((n) => n.id === nodeId)?.name;
        bomState.setWorkingBOM({
          id: `dbom-${Date.now()}`,
          parentProductId: working.id,
          variantId: isSingleSkuUi ? singleSkuVariantId : variant.id,
          nodeId,
          name: `${working.name || working.code} [${nodeName}]`,
          items: [],
        });
      }
    },
    [bomState, bomsAsProduct, globalNodes, singleSkuVariantId, working.code, working.id, working.name],
  );

  const patchVariantNodeBoms = (variantId: string, nodeId: string, bomId: string) => {
    if (variantId === singleSkuVariantId) return;
    setWorking((prev) => ({
      ...prev,
      variants: prev.variants.map((x) =>
        x.id === variantId ? { ...x, nodeBoms: { ...(x.nodeBoms ?? {}), [nodeId]: bomId } } : x,
      ),
    }));
  };

  const handleSaveBom = async () => {
    const wb = bomState.workingBOM;
    if (!wb || !wb.nodeId) return;
    const devBom = workingBomToDevBom(wb, working.id, singleSkuVariantId);
    const exists =
      mode === 'pending'
        ? pendingBoms.some((b) => b.id === devBom.id)
        : devBoms.some((b) => b.id === devBom.id);

    bomState.setBomSaving(true);
    try {
      if (mode === 'pending') {
        const next = exists
          ? pendingBoms.map((b) => (b.id === devBom.id ? devBom : b))
          : [...pendingBoms, devBom];
        onPendingBomsChange?.(next);
        if (devBom.variantId) {
          patchVariantNodeBoms(devBom.variantId, devBom.nodeId!, devBom.id);
        }
        bomState.setWorkingBOM(null);
        toast.success('BOM 已加入待保存列表');
        return;
      }

      if (!onSaveBom) return;
      await onSaveBom(devBom, exists);
      if (devBom.variantId && devBom.nodeId) {
        const v = working.variants.find((x) => x.id === devBom.variantId);
        const nodeBoms = { ...(v?.nodeBoms ?? {}), [devBom.nodeId]: devBom.id };
        await api.devStyles.syncVariantNodeBoms(working.id, devBom.variantId, nodeBoms);
        patchVariantNodeBoms(devBom.variantId, devBom.nodeId, devBom.id);
      }
      bomState.setWorkingBOM(null);
      toast.success('BOM 已保存');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '保存 BOM 失败');
    } finally {
      bomState.setBomSaving(false);
    }
  };

  if (!showProcessBom) return null;

  /** 嵌入「创建/编辑款式」弹窗（z-[350]）时，BOM 编辑器须叠在其上 */
  const bomNestedOverlayZ = embeddedInCreateModal || mode === 'pending' ? 'z-[400]' : 'z-[300]';

  const milestonePicker = (
    <DevFlowNodePicker
      title="大货生产工序配置"
      options={milestoneOptions}
      selectedIds={working.milestoneNodeIds}
      onSelectedIdsChange={handleMilestoneChange}
      readOnly={readOnly}
      embedded={embeddedInCreateModal}
      hideHeader={embeddedInCreateModal}
      optionsEmptyMessage='暂无工序节点，请先在「系统设置 → 工序节点库」中添加'
      selectedEmptyMessage="请点击上方节点选择大货生产工序"
    />
  );

  const bomMatrixSection = !readOnly && (
    <>
      {!embeddedInCreateModal && (
        <section className="rounded-2xl border-2 border-indigo-100 bg-indigo-50/20 p-4 space-y-3">
          <h3 className={sectionTitleClass}>生产BOM配置</h3>
          <p className={`${pageSubtitleClass} mt-0 max-w-none`}>
            开发进度节点在「样品开发」页登记；此处为发布大货后的报工工序，并用于 BOM 按工序配置。
          </p>
          {mode === 'pending' && pendingBoms.length > 0 && (
            <p className="text-xs font-medium text-amber-600">
              已配置 {pendingBoms.filter((b) => b.items?.some((i) => i.productId)).length} 条 BOM，创建款式后将一并保存
            </p>
          )}
          <BomVariantMatrix
            product={productShape}
            boms={bomsAsProduct}
            enabledBOMNodes={enabledBOMNodes}
            dictionaries={dictionaries}
            activeVariantIdForBOM={bomState.activeVariantIdForBOM}
            activeNodeIdForBOM={bomState.activeNodeIdForBOM}
            singleSkuVariantId={singleSkuVariantId}
            singleSkuNodeBOMs={singleSkuNodeBOMs}
            onOpenBOMEditor={openBOMEditor}
          />
        </section>
      )}
      {embeddedInCreateModal && (
        <DevCreateSectionCard
          title="生产BOM配置"
          description="按工序与颜色尺码配置物料，发布大货后用于报工与领料"
          icon={Boxes}
          iconTone="amber"
        >
          {mode === 'pending' && pendingBoms.length > 0 && (
            <p className="mb-4 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              已配置 {pendingBoms.filter((b) => b.items?.some((i) => i.productId)).length} 条 BOM，创建款式后将一并保存
            </p>
          )}
          <BomVariantMatrix
            product={productShape}
            boms={bomsAsProduct}
            enabledBOMNodes={enabledBOMNodes}
            dictionaries={dictionaries}
            activeVariantIdForBOM={bomState.activeVariantIdForBOM}
            activeNodeIdForBOM={bomState.activeNodeIdForBOM}
            singleSkuVariantId={singleSkuVariantId}
            singleSkuNodeBOMs={singleSkuNodeBOMs}
            onOpenBOMEditor={openBOMEditor}
          />
        </DevCreateSectionCard>
      )}
    </>
  );

  return (
    <>
      {embeddedInCreateModal ? (
        <div className="space-y-4">
          <DevCreateSectionCard
            title="大货生产工序"
            description="选择发布大货后的报工工序，带 BOM 标记的工序可配置物料"
            icon={Factory}
            iconTone="emerald"
          >
            {milestonePicker}
          </DevCreateSectionCard>
          {bomMatrixSection}
        </div>
      ) : (
        <>
          {milestonePicker}
          {bomMatrixSection}
        </>
      )}

      <BomEditorPortal
        product={productShape as Product}
        boms={bomsAsProduct}
        globalNodes={globalNodes}
        dictionaries={dictionaries}
        categories={categories}
        products={products}
        state={bomState}
        enabledBOMNodes={enabledBOMNodes}
        availableBOMSources={availableBOMSources}
        bomBlockedProductIds={bomBlockedProductIds}
        embeddedInQuickCreateModal={!!embeddedInCreateModal}
        allowQuickCreate
        nestedOverlayZ={bomNestedOverlayZ}
        BomBatchAddPanelComponent={() => null}
        copyBOMTriggerRef={copyBOMTriggerRef}
        onCopyBOMFrom={copyBOMFrom}
        onUpdateBOMItem={(idx, updates) => {
          if (!bomState.workingBOM) return;
          const items = [...bomState.workingBOM.items];
          items[idx] = { ...items[idx], ...updates };
          bomState.setWorkingBOM({ ...bomState.workingBOM, items });
        }}
        onSave={() => void handleSaveBom()}
        onClose={() => bomState.setWorkingBOM(null)}
      />
    </>
  );
};

export default DevBomConfigSection;
