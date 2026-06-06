import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FlaskConical } from 'lucide-react';
import { useAppData } from '../../contexts/AppDataContext';
import { useDevStyles } from '../../hooks/useDevStyles';
import { useDevTemplates } from '../../hooks/useDevTemplates';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useAuthOptional } from '../../contexts/AuthContext';
import { hasModulePerm } from '../../utils/hasModulePerm';
import type { DevStyleDto } from '../../types';
import { DevStyleStatus } from '../../types';
import DevCreateStyleModal from './DevCreateStyleModal';
import DevStyleSidebar, { type DevListTab, type DevSortMode } from './DevStyleSidebar';
import DevStyleMainContent from './DevStyleMainContent';
import {
  DEV_STYLE_LIST_FILTERS_DEFAULT,
  filterDevStyles,
  type DevStyleListFilters,
} from '../../utils/devStyleListFilter';
import { toast } from 'sonner';
import * as api from '../../services/api';

const DevManagementView: React.FC = () => {
  const {
    categories,
    globalNodes,
    products,
    dictionaries,
    partners,
    partnerCategories,
    refreshDictionaries,
    refreshPartners,
    refreshProducts,
  } = useAppData();
  const {
    templates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    moveTemplate,
  } = useDevTemplates(true);
  const auth = useAuthOptional();
  const tenantRole = auth?.tenantCtx?.tenantRole;
  const perms = auth?.tenantCtx?.permissions;
  const hasDevPerm = useCallback(
    (perm: string) => hasModulePerm(tenantRole, perms, 'development', perm),
    [tenantRole, perms],
  );
  const canCreate = hasDevPerm('development:styles:create');
  const canEdit = hasDevPerm('development:styles:edit');
  const canDeleteStyle = hasDevPerm('development:styles:delete');
  const templatePerms = useMemo(
    () => ({
      canCreate: hasDevPerm('development:templates:create'),
      canEdit: hasDevPerm('development:templates:edit'),
      canDelete: hasDevPerm('development:templates:delete'),
    }),
    [hasDevPerm],
  );
  // 能否打开模板管理 UI：拥有任一写权限即可，进入后按 templatePerms 细分按钮
  const canManageTemplates = templatePerms.canCreate || templatePerms.canEdit || templatePerms.canDelete;

  const {
    styles,
    devBoms,
    loading,
    saveStyle,
    removeStyle,
    publishStyle,
    saveDevBom,
    updateStage,
    addSample,
    removeSample,
    refresh,
  } = useDevStyles();

  const confirm = useConfirm();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DevListTab>('developing');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<DevSortMode>('time');
  const [listFilters, setListFilters] = useState<DevStyleListFilters>(DEV_STYLE_LIST_FILTERS_DEFAULT);
  const [productModal, setProductModal] = useState<{ open: boolean; style: DevStyleDto; isEdit: boolean } | null>(null);

  const visibleStyles = useMemo(
    () => filterDevStyles(styles, { activeTab, searchQuery, filters: listFilters, partners }),
    [styles, activeTab, searchQuery, listFilters, partners],
  );

  const selected = useMemo(
    () => visibleStyles.find((s) => s.id === selectedId) ?? null,
    [visibleStyles, selectedId],
  );
  const readOnly = selected?.status === DevStyleStatus.PUBLISHED;

  const customerSortEnabled = useMemo(
    () => categories.some((c) => c.linkPartner),
    [categories],
  );

  useEffect(() => {
    if (!customerSortEnabled && sortMode === 'customer') {
      setSortMode('time');
    }
  }, [customerSortEnabled, sortMode]);

  useEffect(() => {
    if (loading) return;
    if (selectedId && !visibleStyles.some((s) => s.id === selectedId)) {
      setSelectedId(null);
      return;
    }
    if (!selectedId && visibleStyles.length > 0) {
      setSelectedId(visibleStyles[0].id);
    }
  }, [loading, selectedId, visibleStyles]);

  useEffect(() => {
    if (!selectedId || !selected) return;
    const inArchivedTab =
      selected.status === DevStyleStatus.ARCHIVED || selected.status === DevStyleStatus.PUBLISHED;
    const inDevelopingTab = selected.status === DevStyleStatus.DEVELOPING;
    if (activeTab === 'archived' && !inArchivedTab) setSelectedId(null);
    if (activeTab === 'developing' && !inDevelopingTab) setSelectedId(null);
  }, [activeTab, selectedId, selected]);

  const newStyleDraft = (): DevStyleDto => ({
    id: `dstyle-${Date.now()}`,
    code: '',
    name: '',
    categoryId: categories[0]?.id ?? '',
    colorIds: [],
    sizeIds: [],
    milestoneNodeIds: [],
    status: DevStyleStatus.DEVELOPING,
    variants: [],
    samples: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const handleCreate = () => {
    setProductModal({ open: true, style: newStyleDraft(), isEdit: false });
  };

  const handlePublish = useCallback(async () => {
    if (!selected) return;
    if (selected.status !== DevStyleStatus.ARCHIVED) {
      toast.error('请先将产品归档后再生成大货商品信息');
      return;
    }
    const ok = await confirm({
      title: '生成大货商品信息',
      message: '将把已归档产品的分类、工序、变体与 BOM 写入产品档案，并标记为已发布。是否继续？',
    });
    if (!ok) return;
    try {
      const { productId } = await publishStyle(selected.id);
      await refreshProducts();
      setActiveTab('archived');
      setSelectedId(selected.id);
      toast.success(`已生成大货商品，产品档案已同步（${productId}）`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '发布失败');
    }
  }, [selected, confirm, publishStyle, refreshProducts]);

  const handleToggleArchive = useCallback(async () => {
    if (!selected || !canEdit) return;
    const next =
      selected.status === DevStyleStatus.ARCHIVED
        ? DevStyleStatus.DEVELOPING
        : DevStyleStatus.ARCHIVED;
    const label = next === DevStyleStatus.ARCHIVED ? '归档' : '还原至开发中';
    const ok = await confirm({
      title: label,
      message: next === DevStyleStatus.ARCHIVED ? '归档后可在「已归档」页签中查看。' : '将恢复为开发中状态。',
    });
    if (!ok) return;
    try {
      await saveStyle({ ...selected, status: next }, false);
      if (next === DevStyleStatus.ARCHIVED) {
        setActiveTab('archived');
      } else {
        setActiveTab('developing');
      }
      toast.success(next === DevStyleStatus.ARCHIVED ? '已归档' : '已还原');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '操作失败');
    }
  }, [selected, canEdit, confirm, saveStyle]);

  const handleDelete = useCallback(async () => {
    if (!selected) return;
    const ok = await confirm({
      title: '删除款式',
      message: `确定删除「${selected.code}」？仅当所有节点均为待开始或首节点进行中时可删除。`,
    });
    if (!ok) return;
    try {
      await removeStyle(selected.id);
      setSelectedId(null);
      toast.success('已删除');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  }, [selected, confirm, removeStyle]);

  const productModalEl = productModal?.open ? (
    <DevCreateStyleModal
      open
      isEdit={productModal.isEdit}
      initial={productModal.style}
      categories={categories}
      globalNodes={globalNodes}
      dictionaries={dictionaries}
      partners={partners}
      partnerCategories={partnerCategories}
      products={products}
      templates={templates}
      canManageTemplates={canManageTemplates}
      templatePerms={templatePerms}
      devBoms={devBoms}
      onSaveBom={saveDevBom}
      onCreateTemplate={createTemplate}
      onUpdateTemplate={updateTemplate}
      onDeleteTemplate={deleteTemplate}
      onMoveTemplate={moveTemplate}
      onRefreshDictionaries={refreshDictionaries}
      onRefreshPartners={refreshPartners}
      onClose={() => setProductModal(null)}
      onSave={async (s, opts) => {
        const saved = await saveStyle(s, opts.isNew, { templateStageNames: opts.templateStageNames });
        const pending = opts.pendingBoms ?? [];
        for (const bom of pending) {
          if (!bom.items?.some((it) => it.productId?.trim())) continue;
          await saveDevBom({ ...bom, parentStyleId: saved.id }, false);
          if (bom.variantId && bom.nodeId) {
            const v = saved.variants.find((x) => x.id === bom.variantId);
            const nodeBoms = { ...(v?.nodeBoms ?? {}), [bom.nodeId]: bom.id };
            await api.devStyles.syncVariantNodeBoms(saved.id, bom.variantId, nodeBoms);
          }
        }
        await refresh();
        setProductModal(null);
        setSelectedId(saved.id);
        setActiveTab(
          saved.status === DevStyleStatus.ARCHIVED || saved.status === DevStyleStatus.PUBLISHED
            ? 'archived'
            : 'developing',
        );
      }}
    />
  ) : null;

  return (
    <>
      {productModalEl}
      <div className="-mx-12 -mt-4 -mb-8 flex min-h-[calc(100vh-5rem)] h-[calc(100vh-5rem)] overflow-hidden border-t border-slate-200 bg-white">
        <DevStyleSidebar
          styles={styles}
          categories={categories}
          partners={partners}
          templates={templates}
          selectedId={selectedId}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sortMode={sortMode}
          onSortModeChange={setSortMode}
          filters={listFilters}
          onFiltersChange={setListFilters}
          visibleStyles={visibleStyles}
          onSelect={setSelectedId}
          onCreate={handleCreate}
          canCreate={canCreate}
          loading={loading}
        />
        {selected ? (
          <DevStyleMainContent
            style={selected}
            products={products}
            partners={partners}
            dictionaries={dictionaries}
            templates={templates}
            readOnly={readOnly}
            canEdit={canEdit}
            canDeleteStyle={canDeleteStyle}
            canManageTemplates={canManageTemplates}
            templatePerms={templatePerms}
            onCreateTemplate={createTemplate}
            onUpdateTemplate={updateTemplate}
            onDeleteTemplate={deleteTemplate}
            onMoveTemplate={moveTemplate}
            onEditProduct={() =>
              setProductModal({ open: true, style: JSON.parse(JSON.stringify(selected)) as DevStyleDto, isEdit: true })
            }
            onPublish={() => void handlePublish()}
            onDelete={() => void handleDelete()}
            onToggleArchive={() => void handleToggleArchive()}
            onAddSample={async (data) => {
              await addSample(selected.id, data);
            }}
            onDeleteSample={async (sampleId) => {
              const ok = await confirm({ title: '删除样品轮次', message: '确定删除该样品轮次？' });
              if (!ok) return;
              try {
                await removeSample(sampleId);
                toast.success('已删除样品轮次');
              } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : '删除失败');
              }
            }}
            onUpdateStage={async (stageId, data) => {
              await updateStage(stageId, data);
            }}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-slate-50/30 text-slate-400 gap-3">
            <FlaskConical className="w-12 h-12 opacity-20" />
            <p className="text-sm font-medium">请从左侧选择产品，或录入新产品</p>
          </div>
        )}
      </div>
    </>
  );
};

export default DevManagementView;
