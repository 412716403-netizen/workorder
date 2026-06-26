import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  ArrowDownCircle, 
  ArrowUpCircle, 
  Scale,
  Wallet
} from 'lucide-react';
import {
  ProductionOrder,
  FinanceRecord,
  FinanceOpType,
  FinanceCategory,
  FinanceAccountType,
  Partner,
  Worker,
  Product,
  AppDictionaries,
  ProductMilestoneProgress,
  PlanOrder,
  PrintTemplate,
  ReceiptFormSettings,
  PaymentFormSettings,
} from '../types';
import { PartnerCategory, ProductCategory, GlobalNodeTemplate } from '../types';
import FinanceOpsView from './FinanceOpsView';
import AccountBalancesTab from './finance/AccountBalancesTab';
import {
  subModuleMainContentTopClass,
  subModuleTabBarBackdropClass,
  subModuleTabBarInsetClass,
  subModuleTabBarStickyPadClass,
  subModuleTabButtonClass,
  subModuleTabPillClass,
} from '../styles/uiDensity';
import { useModulePermission } from '../hooks/useModulePermission';
import { useFeaturePlugins } from '../hooks/useFeaturePlugins';
import { useSetMainScrollSegment } from '../contexts/MainScrollSegmentContext';
import { useAuth } from '../contexts/AuthContext';
import { useMasterData, useConfigData, useOrdersData, useFinanceData, useAppActions } from '../contexts/AppDataContext';

const FinanceView: React.FC = () => {
  const m = useMasterData();
  const c = useConfigData();
  const o = useOrdersData();
  const f = useFinanceData();
  const a = useAppActions();
  const { tenantCtx } = useAuth();

  useEffect(() => { void a.ensureDeferredLoaded(); }, [a.ensureDeferredLoaded]);
  /**
   * Phase 3.A + Phase 3.D follow-up：
   * - FinanceOpsView 自己 react-query 按 page+search 窄拉、对账 hook 内部按 partner/worker 窄拉。
   * - FinanceDetailModal 改为按 docNo 按需查 psi/prod 明细（不再依赖 context 全量）。
   * 因此本视图不再触发 refreshPsiRecords / refreshProdRecords。
   */

  const orders = o.orders;
  /**
   * Phase 3.D follow-up：context 已不再维护 `financeRecords` 全量；
   * - 列表 / 单号 / 对账由 FinanceOpsView 内部 react-query 按 type/page/partner 窄拉。
   * - 这里仅给 FinanceOpsView 传空数组占位，保持 prop 签名兼容（后续可整体删 records/allRecords props）。
   */
  const records: FinanceRecord[] = [];
  const productMilestoneProgresses = o.productMilestoneProgresses;
  const onAddRecord = a.onAddFinanceRecord;
  const onUpdateRecord = a.onUpdateFinanceRecord;
  const onDeleteRecord = a.onDeleteFinanceRecord;
  const financeCategories = f.financeCategories;
  const financeAccountTypes = f.financeAccountTypes;
  const partners = m.partners;
  const workers = m.workers;
  const products = m.products;
  const partnerCategories = m.partnerCategories;
  const categories = m.categories;
  const globalNodes = m.globalNodes;
  const dictionaries = m.dictionaries;
  const userPermissions = tenantCtx?.permissions;
  const tenantRole = tenantCtx?.tenantRole;
  const plans = o.plans;
  const receiptFormSettings = c.receiptFormSettings;
  const paymentFormSettings = c.paymentFormSettings;
  const onUpdateReceiptFormSettings = a.onUpdateReceiptFormSettings;
  const onUpdatePaymentFormSettings = a.onUpdatePaymentFormSettings;
  const printTemplates = c.printTemplates;
  const onUpdatePrintTemplates = a.onUpdatePrintTemplates;
  const onRefreshPrintTemplates = a.refreshPrintTemplates;
  type FinanceTabId = FinanceOpType | 'ACCOUNT';
  const [activeTab, setActiveTab] = useState<FinanceTabId>('RECEIPT');
  const location = useLocation();
  const setScrollSegment = useSetMainScrollSegment();

  useEffect(() => {
    const tab = (location.state as { tab?: FinanceOpType })?.tab;
    const allowed: FinanceOpType[] = ['RECEIPT', 'PAYMENT', 'RECONCILIATION'];
    if (tab && allowed.includes(tab)) setActiveTab(tab);
  }, [location.state]);
  useLayoutEffect(() => {
    setScrollSegment?.(activeTab);
  }, [activeTab, setScrollSegment]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const tabsWrapRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);
  const [placeholderHeight, setPlaceholderHeight] = useState(0);
  const [barStyle, setBarStyle] = useState<{ left: number; width: number } | null>(null);

  const updateBarPosition = () => {
    const scrollParent = sentinelRef.current?.closest('[class*="overflow-auto"]');
    if (scrollParent) {
      const rect = scrollParent.getBoundingClientRect();
      setBarStyle({ left: rect.left, width: rect.width });
    }
  };

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const scrollParent = sentinel?.closest('[class*="overflow-auto"]');
    if (!sentinel || !scrollParent) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsStuck(!entry.isIntersecting),
      { root: scrollParent, rootMargin: '0px', threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (isStuck) {
      updateBarPosition();
      window.addEventListener('resize', updateBarPosition);
      return () => window.removeEventListener('resize', updateBarPosition);
    } else {
      setBarStyle(null);
    }
  }, [isStuck]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (tabsWrapRef.current) {
        setPlaceholderHeight(tabsWrapRef.current.offsetHeight);
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const { hasPerm: hasFinancePerm } = useModulePermission({ tenantRole, userPermissions, moduleName: 'finance' });
  const { isPluginEnabled } = useFeaturePlugins();
  const fundsAccountEnabled = isPluginEnabled('funds_account');
  /**
   * 资金账户为敏感子模块的可见性判定：
   * - 故意 **不走** `isTenantElevatedRole(admin)` 提权放行：当一个 admin 被分配了
   *   限制性自定义角色时，`permissions` 拿到的是该角色的细粒度权限（不含裸 `finance`），
   *   应按角色生效；只有 owner / 真·超管拿到的是模块级权限（含裸 `finance`）。
   * - 与 `hasModulePerm` 语义一致：模块级授权仅在「无任何 finance 细粒度权限」时才视为放行，
   *   一旦配置了细粒度，就必须显式勾选 `finance:account:view`。
   */
  const financePermList = userPermissions ?? [];
  const hasFinanceModuleGrant = financePermList.includes('finance');
  const hasFinanceFineGrained = financePermList.some(p => p.startsWith('finance:'));
  const canViewAccountTab =
    !userPermissions ||
    userPermissions.length === 0 ||
    financePermList.includes('finance:account:view') ||
    (hasFinanceModuleGrant && !hasFinanceFineGrained);
  const accountTabVisible = fundsAccountEnabled && canViewAccountTab;
  useEffect(() => {
    if (activeTab === 'ACCOUNT' && !accountTabVisible) setActiveTab('RECEIPT');
  }, [accountTabVisible, activeTab]);

  // 收支账户类型管理已从「系统设置」移到「资金账户」页，权限沿用 settings:finance_account_types:*
  const isOwner = tenantRole === 'owner';
  const hasSettingsPerm = (perm: string): boolean => {
    if (isOwner) return true;
    if (!userPermissions) return true;
    if (userPermissions.includes(perm)) return true;
    const [module] = perm.split(':');
    return !!module && userPermissions.includes(module);
  };
  const accountTypePermBase = 'settings:finance_account_types';
  const canViewAccountType = hasSettingsPerm(`${accountTypePermBase}:view`);
  const canCreateAccountType = hasSettingsPerm(`${accountTypePermBase}:create`);
  const canEditAccountType = hasSettingsPerm(`${accountTypePermBase}:edit`);
  const canDeleteAccountType = hasSettingsPerm(`${accountTypePermBase}:delete`);

  const allTabs = [
    { id: 'RECEIPT', label: '收款单', icon: ArrowDownCircle, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: '客户款项回收记录' },
    { id: 'PAYMENT', label: '付款单', icon: ArrowUpCircle, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: '供应商及费用支出记录' },
    { id: 'ACCOUNT', label: '资金账户', icon: Wallet, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: '账户余额、流水与转账' },
    { id: 'RECONCILIATION', label: '财务对账', icon: Scale, color: 'text-indigo-600', bg: 'bg-indigo-50', sub: '往来款项核对与差异分析' },
  ];
  const permMap: Record<string, string> = {
    RECEIPT: 'finance:receipt:view',
    PAYMENT: 'finance:payment:view',
    ACCOUNT: 'finance:account:view',
    RECONCILIATION: 'finance:reconciliation:allow',
  };
  const tabs = allTabs.filter(tab => {
    if (tab.id === 'ACCOUNT') return accountTabVisible;
    return hasFinancePerm(permMap[tab.id]);
  });

  return (
    <div className="space-y-0">
      <div>
        <div ref={sentinelRef} className="h-px w-full" aria-hidden="true" />
        <div
          ref={tabsWrapRef}
          className={`${subModuleTabBarBackdropClass} ${
            isStuck
              ? `fixed top-0 px-12 ${subModuleTabBarStickyPadClass}`
              : subModuleTabBarInsetClass
          }`}
          style={isStuck && barStyle ? { left: barStyle.left, width: barStyle.width } : undefined}
        >
          <div className={subModuleTabPillClass}>
            <div className="flex gap-1 min-w-max">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as FinanceTabId)}
                  className={subModuleTabButtonClass(activeTab === tab.id)}
                >
                  <tab.icon
                    className={`w-4 h-4 shrink-0 ${activeTab === tab.id ? 'text-indigo-600' : 'text-slate-300'}`}
                  />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      {isStuck && placeholderHeight > 0 && (
        <div style={{ height: placeholderHeight }} aria-hidden="true" />
      )}
      <div className={`min-h-[600px] ${subModuleMainContentTopClass}`}>
        {activeTab === 'ACCOUNT' ? (
        accountTabVisible ? (
        <AccountBalancesTab
          financeAccountTypes={financeAccountTypes}
          userPermissions={userPermissions}
          onRefreshFinanceAccountTypes={a.refreshFinanceAccountTypes}
          canViewAccountType={canViewAccountType}
          canCreateAccountType={canCreateAccountType}
          canEditAccountType={canEditAccountType}
          canDeleteAccountType={canDeleteAccountType}
          orders={orders}
          financeCategories={financeCategories}
          workers={workers}
          products={products}
        />
        ) : null
        ) : (
        <FinanceOpsView 
          type={activeTab}
          orders={orders}
          records={records}
          allRecords={records}
          productMilestoneProgresses={productMilestoneProgresses}
          onAddRecord={onAddRecord}
          onUpdateRecord={onUpdateRecord}
          onDeleteRecord={onDeleteRecord}
          financeCategories={financeCategories}
          financeAccountTypes={financeAccountTypes}
          partners={partners}
          workers={workers}
          products={products}
          partnerCategories={partnerCategories}
          categories={categories}
          globalNodes={globalNodes}
          dictionaries={dictionaries}
          userPermissions={userPermissions}
          tenantRole={tenantRole}
          plans={plans}
          receiptFormSettings={receiptFormSettings}
          paymentFormSettings={paymentFormSettings}
          onUpdateReceiptFormSettings={onUpdateReceiptFormSettings}
          onUpdatePaymentFormSettings={onUpdatePaymentFormSettings}
          printTemplates={printTemplates}
          onUpdatePrintTemplates={onUpdatePrintTemplates}
          onRefreshPrintTemplates={onRefreshPrintTemplates}
          fundsAccountEnabled={fundsAccountEnabled}
        />
        )}
      </div>
    </div>
  );
};

export default FinanceView;
