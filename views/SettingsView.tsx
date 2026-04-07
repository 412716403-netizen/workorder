import React, { useState } from 'react';
import { 
  Tag, 
  Shapes,
  Database,
  Warehouse as WarehouseIcon,
  Wallet,
  Link2,
  CreditCard,
} from 'lucide-react';
import { ProductCategory, GlobalNodeTemplate, Warehouse, PartnerCategory, FinanceCategory, FinanceAccountType, ProductionLinkMode, ProcessSequenceMode } from '../types';
import {
  moduleHeaderRowClass,
  outlineToolbarButtonClass,
  pageTitleClass,
  subModuleMainContentTopClass,
  subModuleTabButtonClass,
  subModuleTabPillClass,
} from '../styles/uiDensity';
import CategoriesTab from './settings/CategoriesTab';
import PartnerCategoriesTab from './settings/PartnerCategoriesTab';
import NodesTab from './settings/NodesTab';
import WarehousesTab from './settings/WarehousesTab';
import FinanceCategoriesTab from './settings/FinanceCategoriesTab';
import ProductionConfigTab from './settings/ProductionConfigTab';
import AccountTypesModal from './settings/AccountTypesModal';

interface SettingsViewProps {
  categories: ProductCategory[];
  partnerCategories: PartnerCategory[];
  globalNodes: GlobalNodeTemplate[];
  warehouses: Warehouse[];
  productionLinkMode?: ProductionLinkMode;
  onUpdateProductionLinkMode?: (mode: ProductionLinkMode) => void;
  processSequenceMode?: ProcessSequenceMode;
  onUpdateProcessSequenceMode?: (mode: ProcessSequenceMode) => void;
  allowExceedMaxReportQty?: boolean;
  onUpdateAllowExceedMaxReportQty?: (value: boolean) => void;
  onRefreshCategories: () => Promise<void>;
  onRefreshPartnerCategories: () => Promise<void>;
  onRefreshGlobalNodes: () => Promise<void>;
  onRefreshWarehouses: () => Promise<void>;
  financeCategories: FinanceCategory[];
  onRefreshFinanceCategories: () => Promise<void>;
  financeAccountTypes: FinanceAccountType[];
  onRefreshFinanceAccountTypes: () => Promise<void>;
  userPermissions?: string[];
  tenantRole?: string;
}

type SettingsTab = 'categories' | 'partner_categories' | 'nodes' | 'warehouses' | 'finance_categories' | 'production';

const TAB_PERM_MAP: Record<string, string> = {
  categories: 'settings:categories',
  partner_categories: 'settings:partner_categories',
  nodes: 'settings:nodes',
  warehouses: 'settings:warehouses',
  finance_categories: 'settings:finance_categories',
  finance_account_types: 'settings:finance_account_types',
  production: 'settings:config',
};

const SettingsView: React.FC<SettingsViewProps> = ({ 
  categories, 
  partnerCategories,
  globalNodes, 
  warehouses,
  financeCategories,
  onRefreshFinanceCategories,
  financeAccountTypes,
  onRefreshFinanceAccountTypes,
  productionLinkMode = 'order',
  onUpdateProductionLinkMode,
  processSequenceMode = 'free',
  onUpdateProcessSequenceMode,
  allowExceedMaxReportQty = true,
  onUpdateAllowExceedMaxReportQty,
  onRefreshCategories, 
  onRefreshPartnerCategories,
  onRefreshGlobalNodes,
  onRefreshWarehouses,
  userPermissions,
  tenantRole,
}) => {
  const isOwner = tenantRole === 'owner';
  const hasPerm = (perm: string): boolean => {
    if (isOwner) return true;
    if (!userPermissions) return true;
    if (userPermissions.includes(perm)) return true;
    const [module] = perm.split(':');
    if (module && userPermissions.includes(module)) return true;
    return false;
  };
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

  const [activeTab, setActiveTab] = useState<SettingsTab>('categories');
  const [showAccountTypesModal, setShowAccountTypesModal] = useState(false);

  const tabs = [
    { id: 'categories', label: '产品分类管理', icon: Tag, color: 'text-indigo-600', bg: 'bg-indigo-50', title: '产品分类管理', sub: '定义产品分类、颜色尺码及扩展属性' },
    { id: 'partner_categories', label: '合作单位分类', icon: Shapes, color: 'text-indigo-600', bg: 'bg-indigo-50', title: '合作单位分类', sub: '配置供应商、客户等单位类型的自定义字段' },
    { id: 'nodes', label: '工序节点库', icon: Database, color: 'text-indigo-600', bg: 'bg-indigo-50', title: '工序节点库', sub: '定义生产工序、报工模板及 BOM 关联' },
    { id: 'warehouses', label: '仓库分类管理', icon: WarehouseIcon, color: 'text-indigo-600', bg: 'bg-indigo-50', title: '仓库分类管理', sub: '维护实体仓库档案与分类' },
    { id: 'finance_categories', label: '收付款类型设置', icon: Wallet, color: 'text-indigo-600', bg: 'bg-indigo-50', title: '收付款类型设置', sub: '配置收款单/付款单分类及关联项、自定义内容' },
    { id: 'production', label: '生产业务配置', icon: Link2, color: 'text-indigo-600', bg: 'bg-indigo-50', title: '生产业务配置', sub: '生产关联模式、计划/工单/领料/报工等业务规则' },
  ];
  const visibleTabs = tabs.filter(t => canView(t.id));
  const activeTabMeta = visibleTabs.find(t => t.id === activeTab) || visibleTabs[0];
  const effectiveTab = activeTabMeta?.id as SettingsTab | undefined;

  return (
    <div className="space-y-0">
      <div>
        <div className={subModuleTabPillClass}>
          <div className="flex gap-1 min-w-max">
            {visibleTabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as SettingsTab)}
                className={subModuleTabButtonClass(effectiveTab === tab.id)}
              >
                <tab.icon
                  className={`w-4 h-4 shrink-0 ${effectiveTab === tab.id ? 'text-indigo-600' : 'text-slate-300'}`}
                />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTabMeta && (
        <div
          className={`mt-3 pb-6 ${subModuleMainContentTopClass} ${activeTab === 'finance_categories' ? moduleHeaderRowClass : ''}`}
        >
          <div className="space-y-2.5">
            <h1 className={pageTitleClass}>{(activeTabMeta as typeof tabs[0]).title}</h1>
            <p className="text-slate-500 text-sm leading-snug max-w-xl">
              {(activeTabMeta as typeof tabs[0]).sub}
            </p>
          </div>
          {activeTab === 'finance_categories' && canView('finance_account_types') && (
            <div className="flex items-center gap-2 shrink-0 mt-4 sm:mt-0">
            <button
              type="button"
              onClick={() => setShowAccountTypesModal(true)}
              className={outlineToolbarButtonClass}
            >
              <CreditCard className="w-4 h-4 shrink-0" /> 收支账户类型
            </button>
            </div>
          )}
        </div>
      )}

      <div className="min-h-[600px]">
        {activeTab === 'categories' && (
          <CategoriesTab
            categories={categories}
            onRefreshCategories={onRefreshCategories}
            canCreate={canCreate('categories')}
            canDelete={canDelete('categories')}
          />
        )}

        {activeTab === 'partner_categories' && (
          <PartnerCategoriesTab
            partnerCategories={partnerCategories}
            onRefreshPartnerCategories={onRefreshPartnerCategories}
            canCreate={canCreate('partner_categories')}
            canDelete={canDelete('partner_categories')}
          />
        )}

        {activeTab === 'nodes' && (
          <NodesTab
            globalNodes={globalNodes}
            onRefreshGlobalNodes={onRefreshGlobalNodes}
            canCreate={canCreate('nodes')}
            canDelete={canDelete('nodes')}
          />
        )}

        {activeTab === 'warehouses' && (
          <WarehousesTab
            warehouses={warehouses}
            onRefreshWarehouses={onRefreshWarehouses}
            canCreate={canCreate('warehouses')}
            canDelete={canDelete('warehouses')}
          />
        )}

        {activeTab === 'finance_categories' && (
          <FinanceCategoriesTab
            financeCategories={financeCategories}
            onRefreshFinanceCategories={onRefreshFinanceCategories}
            canCreate={canCreate('finance_categories')}
            canDelete={canDelete('finance_categories')}
          />
        )}

        {activeTab === 'production' && (
          <ProductionConfigTab
            productionLinkMode={productionLinkMode}
            onUpdateProductionLinkMode={onUpdateProductionLinkMode}
            processSequenceMode={processSequenceMode}
            onUpdateProcessSequenceMode={onUpdateProcessSequenceMode}
            allowExceedMaxReportQty={allowExceedMaxReportQty}
            onUpdateAllowExceedMaxReportQty={onUpdateAllowExceedMaxReportQty}
            canEdit={canEdit('production')}
          />
        )}
      </div>

      {showAccountTypesModal && (
        <AccountTypesModal
          financeAccountTypes={financeAccountTypes}
          onRefreshFinanceAccountTypes={onRefreshFinanceAccountTypes}
          onClose={() => setShowAccountTypesModal(false)}
          canCreate={canCreate('finance_account_types')}
          canEdit={canEdit('finance_account_types')}
          canDelete={canDelete('finance_account_types')}
        />
      )}
    </div>
  );
};

export default React.memo(SettingsView);
