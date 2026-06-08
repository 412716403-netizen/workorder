/**
 * 基础信息主视图 (主壳, Phase P8 拆分后)。
 *
 * 拆分对照:
 * - hooks/useStickyTabsBar.ts                              — sticky tabs 行为 (intersection observer + 占位)
 * - views/basic-info/tabs/PartnersTab.tsx                  — 合作单位 tab (列表+编辑)
 * - views/basic-info/tabs/EquipmentTab.tsx                 — 生产设备 tab (列表+编辑)
 * - views/basic-info/tabs/DictionariesTab.tsx              — 公共字典 tab (列表+编辑)
 *
 * 主壳只负责:
 * - 权限计算 + 顶部 tab 切换 + sticky bar 容器
 * - PRODUCTS / MEMBERS 的 Suspense lazy 装配
 * - 详情可见性桥接 (productDetailVisible) 与路由 state (editProductId)
 */
import React, { useState, useLayoutEffect, useCallback, useEffect, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Boxes, Building2, Cpu, ShieldCheck, Library } from 'lucide-react';
import { lazyWithReloadOnChunkError } from '../utils/lazyWithReloadOnChunkError';
const ProductManagementView = lazyWithReloadOnChunkError(() => import('./ProductManagementView'));
const MemberManagementView = lazyWithReloadOnChunkError(() => import('./MemberManagementView'));

const BasicInfoPanelFallback = () => (
  <div className="flex min-h-[320px] items-center justify-center text-sm font-medium text-slate-400">
    加载中…
  </div>
);

import {
  subModuleMainContentTopClass,
  subModuleTabBarBackdropClass,
  subModuleTabBarInsetClass,
  subModuleTabBarStickyPadClass,
  subModuleTabButtonClass,
  subModuleTabPillClass,
} from '../styles/uiDensity';
import { useSetMainScrollSegment } from '../contexts/MainScrollSegmentContext';
import { useEquipmentFeaturesEffective } from '../hooks/useEquipmentFeaturesEffective';
import { useStickyTabsBar } from '../hooks/useStickyTabsBar';
import { useAuth } from '../contexts/AuthContext';
import { useMasterData, useAppActions } from '../contexts/AppDataContext';
import PartnersTab from './basic-info/tabs/PartnersTab';
import EquipmentTab from './basic-info/tabs/EquipmentTab';
import DictionariesTab from './basic-info/tabs/DictionariesTab';

const TAB_PERM_MAP: Record<string, string> = {
  PRODUCTS: 'basic:products',
  PARTNERS: 'basic:partners',
  MEMBERS: 'basic:members',
  EQUIPMENT: 'basic:equipment',
  DICTIONARIES: 'basic:dictionaries',
};

type BasicTab = 'PRODUCTS' | 'PARTNERS' | 'MEMBERS' | 'EQUIPMENT' | 'DICTIONARIES';

const BasicInfoView: React.FC = () => {
  const m = useMasterData();
  const a = useAppActions();
  const { tenantCtx, currentUser } = useAuth();

  const products = m.products;
  const globalNodes = m.globalNodes;
  const categories = m.categories;
  const partnerCategories = m.partnerCategories;
  const boms = m.boms;
  const equipment = m.equipment;
  const dictionaries = m.dictionaries;
  const partners = m.partners;
  const onUpdateProduct = a.onUpdateProduct;
  const onDeleteProduct = a.onDeleteProduct;
  const onUpdateBOM = a.onUpdateBOM;
  const onRefreshDictionaries = a.refreshDictionaries;
  const onRefreshWorkers = a.refreshWorkers;
  const onRefreshEquipment = a.refreshEquipment;
  const onRefreshPartners = a.refreshPartners;
  const onRefreshProducts = a.refreshProducts;
  const tenantId = tenantCtx!.tenantId;
  const tenantRole = tenantCtx!.tenantRole;
  const currentUserId = String(currentUser?.id ?? '');
  const userPermissions = tenantCtx!.permissions;
  const isOwner = tenantRole === 'owner';

  const hasPerm = useCallback(
    (perm: string): boolean => {
      if (isOwner) return true;
      if (!userPermissions) return true;
      if (userPermissions.includes(perm)) return true;
      const [module] = perm.split(':');
      if (module && userPermissions.includes(module)) return true;
      return false;
    },
    [isOwner, userPermissions],
  );
  const canView = (tabId: string) => {
    const base = TAB_PERM_MAP[tabId];
    return base ? hasPerm(`${base}:view`) : true;
  };
  const canCreate = (tabId: string) => {
    const base = TAB_PERM_MAP[tabId];
    return base ? hasPerm(`${base}:create`) : true;
  };
  const canEdit = (tabId: string) => {
    const base = TAB_PERM_MAP[tabId];
    return base ? hasPerm(`${base}:edit`) : true;
  };
  const canDelete = (tabId: string) => {
    const base = TAB_PERM_MAP[tabId];
    return base ? hasPerm(`${base}:delete`) : true;
  };

  const equipmentFeaturesOn = useEquipmentFeaturesEffective();
  const location = useLocation();
  const navigate = useNavigate();
  const locState = location.state as { editProductId?: string } | null;

  const [activeTab, setActiveTab] = useState<BasicTab>('PRODUCTS');
  const setScrollSegment = useSetMainScrollSegment();
  useLayoutEffect(() => {
    setScrollSegment?.(activeTab);
  }, [activeTab, setScrollSegment]);

  useEffect(() => {
    const tab = (location.state as { tab?: BasicTab })?.tab;
    const allowed: BasicTab[] = ['PRODUCTS', 'PARTNERS', 'MEMBERS', 'EQUIPMENT', 'DICTIONARIES'];
    if (tab && allowed.includes(tab)) setActiveTab(tab);
  }, [location.state]);

  const [initialProductId, setInitialProductId] = useState<string | null>(locState?.editProductId ?? null);
  const clearInitialProductId = useCallback(() => {
    setInitialProductId(null);
    if (locState?.editProductId) navigate(location.pathname, { replace: true, state: {} });
  }, [locState?.editProductId, navigate, location.pathname]);

  const [productDetailVisible, setProductDetailVisible] = useState(false);
  const [membersTabMounted, setMembersTabMounted] = useState(false);

  const showTabs = !productDetailVisible;
  const { sentinelRef, tabsWrapRef, isStuck, placeholderHeight, barStyle } = useStickyTabsBar({
    active: showTabs,
  });

  const allTabs = [
    { id: 'PRODUCTS', label: '产品与 BOM', icon: Boxes },
    { id: 'PARTNERS', label: '合作单位', icon: Building2 },
    { id: 'MEMBERS', label: '成员管理', icon: ShieldCheck },
    { id: 'EQUIPMENT', label: '设备管理', icon: Cpu },
    { id: 'DICTIONARIES', label: '公共数据字典', icon: Library },
  ];
  const tabs = allTabs.filter(t => canView(t.id) && (t.id !== 'EQUIPMENT' || equipmentFeaturesOn));

  useEffect(() => {
    if (!equipmentFeaturesOn && activeTab === 'EQUIPMENT') {
      setActiveTab('PRODUCTS');
    }
  }, [activeTab, equipmentFeaturesOn]);

  return (
    <div className="space-y-0">
      {showTabs && (
        <>
          <div>
            <div ref={sentinelRef} className="h-px w-full" aria-hidden="true" />
            <div
              ref={tabsWrapRef}
              className={`${subModuleTabBarBackdropClass} ${
                isStuck ? `fixed top-0 px-12 ${subModuleTabBarStickyPadClass}` : subModuleTabBarInsetClass
              }`}
              style={isStuck && barStyle ? { left: barStyle.left, width: barStyle.width } : undefined}
            >
              <div className={subModuleTabPillClass}>
                <div className="flex gap-1 min-w-max">
                  {tabs.map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        const t = tab.id as BasicTab;
                        setActiveTab(t);
                        if (t === 'MEMBERS') setMembersTabMounted(true);
                      }}
                      className={subModuleTabButtonClass(activeTab === tab.id)}
                    >
                      <tab.icon className={`w-4 h-4 shrink-0 ${activeTab === tab.id ? 'text-indigo-600' : 'text-slate-300'}`} />
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {isStuck && placeholderHeight > 0 && <div style={{ height: placeholderHeight }} aria-hidden="true" />}
        </>
      )}

      <div className={showTabs ? subModuleMainContentTopClass : undefined}>
        {activeTab === 'PRODUCTS' && (
          <Suspense fallback={<BasicInfoPanelFallback />}>
            <ProductManagementView
              products={products}
              globalNodes={globalNodes}
              categories={categories}
              boms={boms}
              dictionaries={dictionaries}
              partners={partners}
              partnerCategories={partnerCategories}
              onUpdateProduct={onUpdateProduct}
              onDeleteProduct={onDeleteProduct}
              onUpdateBOM={onUpdateBOM}
              onRefreshDictionaries={onRefreshDictionaries}
              onRefreshPartners={onRefreshPartners}
              onRefreshProducts={onRefreshProducts}
              onDetailViewChange={setProductDetailVisible}
              permCanCreate={canCreate('PRODUCTS')}
              permCanEdit={canEdit('PRODUCTS')}
              permCanDelete={canDelete('PRODUCTS')}
              initialProductId={initialProductId}
              onClearInitialProductId={clearInitialProductId}
            />
          </Suspense>
        )}

        {activeTab === 'PARTNERS' && (
          <PartnersTab
            partners={partners}
            partnerCategories={partnerCategories}
            onRefreshPartners={onRefreshPartners}
            canCreate={canCreate('PARTNERS')}
            canEdit={canEdit('PARTNERS')}
            canDelete={canDelete('PARTNERS')}
          />
        )}

        {membersTabMounted && (
          <div style={{ display: activeTab === 'MEMBERS' ? undefined : 'none' }}>
            <Suspense fallback={<BasicInfoPanelFallback />}>
              <MemberManagementView
                tenantId={tenantId}
                tenantRole={tenantRole}
                currentUserId={currentUserId}
                globalNodes={globalNodes}
                onRefreshWorkers={onRefreshWorkers}
              />
            </Suspense>
          </div>
        )}

        {activeTab === 'EQUIPMENT' && (
          <EquipmentTab
            equipment={equipment}
            globalNodes={globalNodes}
            onRefreshEquipment={onRefreshEquipment}
            canCreate={canCreate('EQUIPMENT')}
            canEdit={canEdit('EQUIPMENT')}
            canDelete={canDelete('EQUIPMENT')}
          />
        )}

        {activeTab === 'DICTIONARIES' && (
          <DictionariesTab
            dictionaries={dictionaries}
            onRefreshDictionaries={onRefreshDictionaries}
            canCreate={canCreate('DICTIONARIES')}
            canEdit={canEdit('DICTIONARIES')}
            canDelete={canDelete('DICTIONARIES')}
          />
        )}
      </div>
    </div>
  );
};

export default React.memo(BasicInfoView);
