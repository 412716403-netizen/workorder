import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
    boms,
    dictionaries,
    partners,
    partnerCategories,
    warehouses,
    refreshDictionaries,
    refreshPartners,
    refreshProducts,
    refreshBoms,
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
  const materialPerms = useMemo(
    () => ({
      canViewRecords: hasDevPerm('development:material_records:view'),
      canIssue: hasDevPerm('development:material_issue:create'),
      canReturn: hasDevPerm('development:material_return:create'),
      canEditRecords: hasDevPerm('development:material_records:edit'),
      canDeleteRecords: hasDevPerm('development:material_records:delete'),
    }),
    [hasDevPerm],
  );

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
    selectedDetail,
    detailLoading,
    loadStyleDetail,
  } = useDevStyles();

  const confirm = useConfirm();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DevListTab>('developing');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<DevSortMode>('time');
  const [listFilters, setListFilters] = useState<DevStyleListFilters>(DEV_STYLE_LIST_FILTERS_DEFAULT);
  const [productModal, setProductModal] = useState<{ open: boolean; style: DevStyleDto; isEdit: boolean } | null>(null);
  const [pendingDeepLink, setPendingDeepLink] = useState<{ styleId: string; stageId?: string; sampleId?: string } | null>(null);

  const location = useLocation();
  const navigate = useNavigate();
  // 待办「前往单据」深链：定位款式 → 切到对应页签并清空筛选 → 记录待打开的节点/样品弹窗
  useEffect(() => {
    const st = location.state as { styleId?: string; devStageId?: string; devSampleId?: string } | null;
    if (!st?.styleId) return;
    if (loading) return;
    const clearState = () => {
      const rest = { ...(st as Record<string, unknown>) };
      delete rest.styleId;
      delete rest.devStageId;
      delete rest.devSampleId;
      navigate(location.pathname, { replace: true, state: Object.keys(rest).length > 0 ? rest : undefined });
    };
    const target = styles.find((s) => s.id === st.styleId);
    if (!target) {
      clearState();
      return;
    }
    setActiveTab(target.status === DevStyleStatus.DEVELOPING ? 'developing' : 'archived');
    setSearchQuery('');
    setListFilters(DEV_STYLE_LIST_FILTERS_DEFAULT);
    setSelectedId(target.id);
    setPendingDeepLink({ styleId: target.id, stageId: st.devStageId, sampleId: st.devSampleId });
    clearState();
  }, [location.state, location.pathname, loading, styles, navigate]);

  const visibleStyles = useMemo(
    () => filterDevStyles(styles, { activeTab, searchQuery, filters: listFilters, partners }),
    [styles, activeTab, searchQuery, listFilters, partners],
  );

  const selectedSummary = useMemo(
    () => visibleStyles.find((s) => s.id === selectedId) ?? null,
    [visibleStyles, selectedId],
  );
  /** 主区用详情（含原图）；未加载完时回退列表摘要 */
  const selected = selectedDetail?.id === selectedId ? selectedDetail : selectedSummary;
  const readOnly = selected?.status === DevStyleStatus.PUBLISHED;

  useEffect(() => {
    void loadStyleDetail(selectedId);
  }, [selectedId, loadStyleDetail]);

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

  const refreshPublishedCatalog = useCallback(async () => {
    await Promise.all([refreshProducts(), refreshBoms()]);
  }, [refreshProducts, refreshBoms]);

  const handleSaveDevBom = useCallback(
    async (bom: Parameters<typeof saveDevBom>[0], exists: boolean) => {
      const saved = await saveDevBom(bom, exists);
      // 试制 BOM 保存后后端会回写大货 BOM；刷新产品/BOM 列表，避免产品档案页看到旧数据
      if (selected?.publishedProductId || styles.find((s) => s.id === bom.parentStyleId)?.publishedProductId) {
        await refreshPublishedCatalog();
      }
      return saved;
    },
    [saveDevBom, selected?.publishedProductId, styles, refreshPublishedCatalog],
  );

  const handlePublish = useCallback(async () => {
    if (!selected) return;
    if (selected.status !== DevStyleStatus.ARCHIVED) {
      toast.error('请先将产品归档后再生成商品');
      return;
    }
    const ok = await confirm({
      title: '生成商品',
      message: '将把已归档产品的分类、工序、变体与 BOM 写入产品档案，并标记为已发布。是否继续？',
    });
    if (!ok) return;
    try {
      await publishStyle(selected.id);
      await refreshPublishedCatalog();
      setActiveTab('archived');
      setSelectedId(selected.id);
      toast.success('已生成商品，产品档案已同步');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '发布失败');
    }
  }, [selected, confirm, publishStyle, refreshPublishedCatalog]);

  const handleToggleArchive = useCallback(async () => {
    if (!selected || !canEdit) return;
    const fromPublished = selected.status === DevStyleStatus.PUBLISHED;
    // 已生成商品：开发中点「归档」回到 published，继续显示「已发布」
    const next =
      selected.status === DevStyleStatus.DEVELOPING
        ? selected.publishedProductId
          ? DevStyleStatus.PUBLISHED
          : DevStyleStatus.ARCHIVED
        : DevStyleStatus.DEVELOPING;
    const label = next === DevStyleStatus.DEVELOPING ? '还原至开发中' : '归档';
    const ok = await confirm({
      title: label,
      message:
        next === DevStyleStatus.DEVELOPING
          ? fromPublished
            ? '将恢复为开发中，可继续编辑样品与 BOM；已生成的产品档案保留，不再重复生成商品。'
            : '将恢复为开发中状态。'
          : next === DevStyleStatus.PUBLISHED
            ? '归档后回到已发布状态，列表将继续显示「已发布」标签。'
            : '归档后可在「已归档」页签中查看。',
    });
    if (!ok) return;
    try {
      await saveStyle({ ...selected, status: next }, false);
      if (next === DevStyleStatus.DEVELOPING) {
        setActiveTab('developing');
      } else {
        setActiveTab('archived');
      }
      toast.success(next === DevStyleStatus.DEVELOPING ? '已还原' : '已归档');
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
      styles={styles}
      templates={templates}
      canManageTemplates={canManageTemplates}
      templatePerms={templatePerms}
      devBoms={devBoms}
      onSaveBom={handleSaveDevBom}
      onCreateTemplate={async (name) => {
        await createTemplate(name);
      }}
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
        // 已生成商品的款式保存后，后端会回写产品档案（色码/工序/变体/BOM）；刷新产品与 BOM 列表
        if (saved.publishedProductId) await refreshPublishedCatalog();
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
      <div className="-mx-12 -mt-4 -mb-8 flex min-h-screen h-screen overflow-hidden border-t border-slate-200 bg-white">
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
            detailLoading={Boolean(
              selectedId && (detailLoading || selectedDetail?.id !== selectedId),
            )}
            products={products}
            boms={boms}
            partners={partners}
            dictionaries={dictionaries}
            templates={templates}
            categories={categories}
            globalNodes={globalNodes}
            warehouses={warehouses}
            materialPerms={materialPerms}
            devBoms={devBoms}
            onSaveBom={handleSaveDevBom}
            readOnly={readOnly}
            canEdit={canEdit}
            canDeleteStyle={canDeleteStyle}
            canManageTemplates={canManageTemplates}
            templatePerms={templatePerms}
            onCreateTemplate={async (name) => {
              await createTemplate(name);
            }}
            onUpdateTemplate={updateTemplate}
            onDeleteTemplate={deleteTemplate}
            onMoveTemplate={moveTemplate}
            onEditProduct={() => {
              const src =
                selectedDetail?.id === selectedId
                  ? selectedDetail
                  : selected;
              setProductModal({
                open: true,
                style: JSON.parse(JSON.stringify(src)) as DevStyleDto,
                isEdit: true,
              });
            }}
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
            deepLinkStageId={pendingDeepLink?.styleId === selected.id ? pendingDeepLink?.stageId ?? null : null}
            deepLinkSampleId={pendingDeepLink?.styleId === selected.id ? pendingDeepLink?.sampleId ?? null : null}
            onConsumeDeepLink={() => setPendingDeepLink(null)}
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
