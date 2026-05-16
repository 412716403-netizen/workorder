/**
 * 核心 / 延后数据加载与列表合并工具（从 AppDataContext 拆出，减轻 Provider 体积）。
 */
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { toast } from 'sonner';
import * as api from '../services/api';
import type {
  AppDictionaries,
  BOM,
  FinanceAccountType,
  FinanceCategory,
  GlobalNodeTemplate,
  MaterialFormSettings,
  MaterialPanelSettings,
  OrderFormSettings,
  OutsourceFormSettings,
  Partner,
  PartnerCategory,
  PlanFormSettings,
  PrintTemplate,
  ProcessSequenceMode,
  Product,
  ProductCategory,
  ProductionLinkMode,
  ProductionOrder,
  PlanOrder,
  ProductMilestoneProgress,
  PurchaseBillFormSettings,
  PurchaseOrderFormSettings,
  ReceiptFormSettings,
  ReworkFormSettings,
  SalesBillFormSettings,
  SalesOrderFormSettings,
  PaymentFormSettings,
  Warehouse,
  Worker,
  Equipment,
} from '../types';
import {
  DEFAULT_MATERIAL_FORM_SETTINGS,
  DEFAULT_MATERIAL_PANEL_SETTINGS,
  DEFAULT_OUTSOURCE_FORM_SETTINGS,
  DEFAULT_REWORK_FORM_SETTINGS,
} from '../types';
import { normalizePartnersFromApi } from '../utils/partnerNormalize';
import {
  normalizeFinanceCategoriesFromApi,
  normalizeGlobalNodesFromApi,
  normalizePartnerCategoriesFromApi,
  normalizeProductCategoriesFromApi,
} from '../utils/reportCustomDocField';
import {
  DEFAULT_ORDER_FORM_SETTINGS,
  DEFAULT_PAYMENT_FORM_SETTINGS,
  DEFAULT_PLAN_FORM_SETTINGS,
  DEFAULT_PURCHASE_BILL_FORM_SETTINGS,
  DEFAULT_PURCHASE_ORDER_FORM_SETTINGS,
  DEFAULT_RECEIPT_FORM_SETTINGS,
  DEFAULT_SALES_BILL_FORM_SETTINGS,
  DEFAULT_SALES_ORDER_FORM_SETTINGS,
  normalizeDecimals,
  normalizeMaterialFormSettings,
  normalizeOrderFormSettings,
  normalizeOutsourceFormSettings,
  normalizePaymentFormSettings,
  normalizePlanFormSettings,
  normalizePurchaseBillFormSettings,
  normalizePurchaseOrderFormSettings,
  normalizeReceiptFormSettings,
  normalizeReworkFormSettings,
  normalizeSalesBillFormSettings,
  normalizeSalesOrderFormSettings,
  repairPlanLabelPrintWhitelistMissingPlanLabelTemplates,
} from './formSettingsDefaults';
import { mergePrintTemplatesForTenantConfig } from '../shared/systemPrintTemplates';

export function settledVal<T>(results: PromiseSettledResult<unknown>[], i: number): T | undefined {
  return results[i]?.status === 'fulfilled' ? (results[i] as PromiseFulfilledResult<unknown>).value as T : undefined;
}

export function mergeById<T extends { id: string }>(prev: T[], incoming: T[]): T[] {
  const map = new Map(prev.map(x => [x.id, x]));
  for (const item of incoming) map.set(item.id, item);
  return Array.from(map.values());
}

export interface AppDataLoadCoreSetters {
  setDataLoading: Dispatch<SetStateAction<boolean>>;
  setProductionLinkMode: Dispatch<SetStateAction<ProductionLinkMode>>;
  setProcessSequenceMode: Dispatch<SetStateAction<ProcessSequenceMode>>;
  setAllowExceedMaxReportQty: Dispatch<SetStateAction<boolean>>;
  setPlanFormSettings: Dispatch<SetStateAction<PlanFormSettings>>;
  setOrderFormSettings: Dispatch<SetStateAction<OrderFormSettings>>;
  setPurchaseOrderFormSettings: Dispatch<SetStateAction<PurchaseOrderFormSettings>>;
  setSalesOrderFormSettings: Dispatch<SetStateAction<SalesOrderFormSettings>>;
  setPurchaseBillFormSettings: Dispatch<SetStateAction<PurchaseBillFormSettings>>;
  setSalesBillFormSettings: Dispatch<SetStateAction<SalesBillFormSettings>>;
  setReceiptFormSettings: Dispatch<SetStateAction<ReceiptFormSettings>>;
  setPaymentFormSettings: Dispatch<SetStateAction<PaymentFormSettings>>;
  setMaterialPanelSettings: Dispatch<SetStateAction<MaterialPanelSettings>>;
  setMaterialFormSettings: Dispatch<SetStateAction<MaterialFormSettings>>;
  setOutsourceFormSettings: Dispatch<SetStateAction<OutsourceFormSettings>>;
  setReworkFormSettings: Dispatch<SetStateAction<ReworkFormSettings>>;
  setPrintTemplates: Dispatch<SetStateAction<PrintTemplate[]>>;
  setCategories: Dispatch<SetStateAction<ProductCategory[]>>;
  setPartnerCategories: Dispatch<SetStateAction<PartnerCategory[]>>;
  setGlobalNodes: Dispatch<SetStateAction<GlobalNodeTemplate[]>>;
  setWarehouses: Dispatch<SetStateAction<Warehouse[]>>;
  setFinanceCategories: Dispatch<SetStateAction<FinanceCategory[]>>;
  setFinanceAccountTypes: Dispatch<SetStateAction<FinanceAccountType[]>>;
  setPartners: Dispatch<SetStateAction<Partner[]>>;
  setDictionaries: Dispatch<SetStateAction<AppDictionaries>>;
  setProducts: Dispatch<SetStateAction<Product[]>>;
  setBoms: Dispatch<SetStateAction<BOM[]>>;
  setWorkers: Dispatch<SetStateAction<Worker[]>>;
  setEquipment: Dispatch<SetStateAction<Equipment[]>>;
}

export async function executeAppDataLoadCore(
  activeTenantId: string,
  cancelled: () => boolean,
  s: AppDataLoadCoreSetters,
): Promise<void> {
  const coreResults = await Promise.allSettled([
    api.settings.getConfig(),
    api.settings.categories.list(),
    api.settings.partnerCategories.list(),
    api.settings.nodes.list(),
    api.settings.warehouses.list(),
    api.settings.financeCategories.list(),
    api.settings.financeAccountTypes.list(),
    api.partners.list(),
    api.dictionaries.list(),
    api.products.list(),
    api.boms.list(),
    api.tenants.getReportableMembers(activeTenantId),
    api.equipment.list(),
  ]);
  if (cancelled()) return;

  const coreFailed = coreResults.filter(r => r.status === 'rejected');
  if (coreFailed.length) console.warn(`核心数据加载: ${coreFailed.length}/${coreResults.length} 个请求失败`, coreFailed.map(r => (r as PromiseRejectedResult).reason?.message));

  if (coreResults[9]?.status === 'rejected') {
    const msg = (coreResults[9] as PromiseRejectedResult).reason?.message || '未知错误';
    const isForbidden = /无权|403|Forbidden/i.test(msg) || msg.includes('请先选择或创建企业');
    if (isForbidden) {
      toast.error(`产品列表加载失败：${msg}。请在「成员管理」中为当前账号勾选「基础信息 → 产品档案」的查看权限（basic:products:view），或由企业管理员调整角色。`);
    } else {
      const migrateHint = /数据库|route_report|migration|P20|column|schema|Prisma/i.test(msg)
        ? ' 若为数据库升级后首次使用，请在服务器执行 prisma migrate deploy 并重启后端。' : '';
      const fetchHint =
        /Failed to fetch|NetworkError|无法连接|超时/i.test(msg) && import.meta.env.DEV
          ? ' 请确认后端已启动（backend 目录 `npm run dev`，或仓库根目录 `npm run dev:all`），且已配置数据库 `.env`。'
          : '';
      toast.error(`产品列表加载失败：${msg}。${migrateHint}${fetchHint}`.trim());
    }
  }

  const cfg = (settledVal<Record<string, unknown>>(coreResults, 0) || {}) as Record<string, unknown>;
  s.setProductionLinkMode((cfg.productionLinkMode as ProductionLinkMode) ?? 'order');
  s.setProcessSequenceMode((cfg.processSequenceMode as ProcessSequenceMode) ?? 'sequential');
  s.setAllowExceedMaxReportQty(cfg.allowExceedMaxReportQty === true);
  const printTemplatesFromCfg = Array.isArray(cfg.printTemplates) ? (cfg.printTemplates as PrintTemplate[]) : [];
  const printTemplatesMerged = mergePrintTemplatesForTenantConfig(printTemplatesFromCfg) as PrintTemplate[];
  s.setPlanFormSettings(
    repairPlanLabelPrintWhitelistMissingPlanLabelTemplates(
      normalizePlanFormSettings(cfg.planFormSettings as PlanFormSettings),
      printTemplatesMerged,
    ),
  );
  s.setOrderFormSettings(normalizeOrderFormSettings((cfg.orderFormSettings as OrderFormSettings) ?? DEFAULT_ORDER_FORM_SETTINGS));
  {
    const po = (cfg.purchaseOrderFormSettings as PurchaseOrderFormSettings) ?? DEFAULT_PURCHASE_ORDER_FORM_SETTINGS;
    s.setPurchaseOrderFormSettings(normalizePurchaseOrderFormSettings(po));
  }
  {
    const so = (cfg.salesOrderFormSettings as SalesOrderFormSettings) ?? DEFAULT_SALES_ORDER_FORM_SETTINGS;
    s.setSalesOrderFormSettings(normalizeSalesOrderFormSettings(so));
  }
  {
    const pb = (cfg.purchaseBillFormSettings as PurchaseBillFormSettings) ?? DEFAULT_PURCHASE_BILL_FORM_SETTINGS;
    s.setPurchaseBillFormSettings(normalizePurchaseBillFormSettings(pb));
  }
  {
    const sb = (cfg.salesBillFormSettings as SalesBillFormSettings) ?? DEFAULT_SALES_BILL_FORM_SETTINGS;
    s.setSalesBillFormSettings(normalizeSalesBillFormSettings(sb));
  }
  {
    const rf = (cfg.receiptFormSettings as ReceiptFormSettings) ?? DEFAULT_RECEIPT_FORM_SETTINGS;
    s.setReceiptFormSettings(normalizeReceiptFormSettings(rf));
  }
  {
    const pf = (cfg.paymentFormSettings as PaymentFormSettings) ?? DEFAULT_PAYMENT_FORM_SETTINGS;
    s.setPaymentFormSettings(normalizePaymentFormSettings(pf));
  }
  s.setMaterialPanelSettings((cfg.materialPanelSettings as MaterialPanelSettings) ?? DEFAULT_MATERIAL_PANEL_SETTINGS);
  s.setMaterialFormSettings(normalizeMaterialFormSettings((cfg.materialFormSettings as MaterialFormSettings) ?? DEFAULT_MATERIAL_FORM_SETTINGS));
  s.setOutsourceFormSettings(normalizeOutsourceFormSettings((cfg.outsourceFormSettings as OutsourceFormSettings) ?? DEFAULT_OUTSOURCE_FORM_SETTINGS));
  s.setReworkFormSettings(normalizeReworkFormSettings((cfg.reworkFormSettings as ReworkFormSettings) ?? DEFAULT_REWORK_FORM_SETTINGS));
  s.setPrintTemplates(printTemplatesMerged);
  if (settledVal(coreResults, 1)) {
    s.setCategories(normalizeProductCategoriesFromApi(settledVal<ProductCategory[]>(coreResults, 1)!));
  }
  if (settledVal(coreResults, 2)) {
    s.setPartnerCategories(normalizePartnerCategoriesFromApi(settledVal<PartnerCategory[]>(coreResults, 2)!));
  }
  if (settledVal(coreResults, 3)) {
    s.setGlobalNodes(normalizeGlobalNodesFromApi(settledVal<GlobalNodeTemplate[]>(coreResults, 3)!));
  }
  if (settledVal(coreResults, 4)) s.setWarehouses(settledVal<Warehouse[]>(coreResults, 4)!);
  if (settledVal(coreResults, 5)) {
    s.setFinanceCategories(normalizeFinanceCategoriesFromApi(settledVal<FinanceCategory[]>(coreResults, 5)!));
  }
  if (settledVal(coreResults, 6)) s.setFinanceAccountTypes(settledVal<FinanceAccountType[]>(coreResults, 6)!);
  if (settledVal(coreResults, 7)) {
    s.setPartners(normalizePartnersFromApi(settledVal<unknown[]>(coreResults, 7)!) as Partner[]);
  }
  if (settledVal(coreResults, 8)) s.setDictionaries(settledVal<AppDictionaries>(coreResults, 8)!);
  if (settledVal(coreResults, 9)) s.setProducts(normalizeDecimals(settledVal<Product[]>(coreResults, 9)!));
  if (settledVal(coreResults, 10)) s.setBoms(normalizeDecimals(settledVal<BOM[]>(coreResults, 10)!));
  if (settledVal(coreResults, 11)) s.setWorkers(settledVal<Worker[]>(coreResults, 11)!);
  if (settledVal(coreResults, 12)) s.setEquipment(settledVal<Equipment[]>(coreResults, 12)!);

  if (!cancelled()) s.setDataLoading(false);
}

export interface AppDataDeferredLoadSetters {
  setPlans: Dispatch<SetStateAction<PlanOrder[]>>;
  setOrders: Dispatch<SetStateAction<ProductionOrder[]>>;
  setProductMilestoneProgresses: Dispatch<SetStateAction<ProductMilestoneProgress[]>>;
}

export async function executeAppDataDeferredLoad(
  lastFetchTs: MutableRefObject<Record<string, string>>,
  s: AppDataDeferredLoadSetters,
): Promise<void> {
  const metaResults = await Promise.allSettled([
    api.plans.list(),
    api.orders.list(),
    api.orders.listProductProgress(),
  ]);
  if (settledVal(metaResults, 0)) s.setPlans(normalizeDecimals(settledVal<PlanOrder[]>(metaResults, 0)!));
  if (settledVal(metaResults, 1)) s.setOrders(normalizeDecimals(settledVal<ProductionOrder[]>(metaResults, 1)!));
  if (settledVal(metaResults, 2)) s.setProductMilestoneProgresses(normalizeDecimals(settledVal<ProductMilestoneProgress[]>(metaResults, 2)!));

  const allFailed = metaResults.filter(r => r.status === 'rejected');
  if (allFailed.length) console.warn(`延后数据加载: ${allFailed.length} 个请求失败`, allFailed.map(r => (r as PromiseRejectedResult).reason?.message));

  const now = new Date().toISOString();
  ['orders', 'products', 'plans', 'productMilestoneProgresses'].forEach(k => { lastFetchTs.current[k] = now; });
}
