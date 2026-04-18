import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { useAuth } from './AuthContext';
import * as api from '../services/api';
import type {
  Product,
  ProductionOrder,
  PlanOrder,
  ProductionOpRecord,
  FinanceRecord,
  Warehouse,
  PlanFormSettings,
  OrderFormSettings,
  PlanListPrintSettings,
  PurchaseOrderFormSettings,
  SalesOrderFormSettings,
  PurchaseBillFormSettings,
  SalesBillFormSettings,
  ReceiptFormSettings,
  PaymentFormSettings,
  ProductionLinkMode,
  ProductMilestoneProgress,
  ProcessSequenceMode,
  FinanceCategory,
  FinanceAccountType,
  AppDictionaries,
  ProductCategory,
  PartnerCategory,
  GlobalNodeTemplate,
  BOM,
  PrintTemplate,
  MaterialPanelSettings,
  MaterialFormSettings,
  OutsourceFormSettings,
  ReworkFormSettings,
} from '../types';
import {
  DEFAULT_MATERIAL_PANEL_SETTINGS,
  DEFAULT_MATERIAL_FORM_SETTINGS,
  DEFAULT_OUTSOURCE_FORM_SETTINGS,
  DEFAULT_REWORK_FORM_SETTINGS,
} from '../types';
import { normalizePartnersFromApi } from '../utils/partnerNormalize';
import { currentOperatorDisplayName } from '../utils/currentOperatorDisplayName';
import { ensureBuiltinSalesBillPrintTemplate } from '../utils/salesBillPrintTemplate';
import { normalizePlanFormFieldConfigArray } from '../utils/planFormCustomField';
import { broadcastPrintTemplatesSaved, subscribePrintTemplatesChanged } from '../utils/printTemplatesCrossTab';

// ── Decimal normalizer ──

const DECIMAL_KEYS = new Set([
  'quantity', 'purchasePrice', 'salesPrice', 'amount', 'actualQuantity',
  'systemQuantity', 'diffQuantity', 'unitPrice', 'taxRate', 'taxAmount',
  'totalAmount', 'completedQuantity', 'defectiveQuantity', 'weight', 'rate',
  'allocatedQuantity', 'shippedQuantity',
]);

function normalizeDecimals<T>(arr: T[]): T[] {
  return arr.map(item => {
    const copy = { ...item } as any;
    for (const k of DECIMAL_KEYS) {
      if (k in copy && copy[k] != null && typeof copy[k] === 'string') copy[k] = Number(copy[k]) || 0;
    }
    if (Array.isArray(copy.items)) {
      copy.items = copy.items.map((sub: any) => {
        const s = { ...sub };
        for (const k of DECIMAL_KEYS) { if (k in s && s[k] != null && typeof s[k] === 'string') s[k] = Number(s[k]) || 0; }
        return s;
      });
    }
    if (Array.isArray(copy.milestones)) {
      copy.milestones = copy.milestones.map((ms: any) => {
        const m = { ...ms };
        for (const k of DECIMAL_KEYS) { if (k in m && m[k] != null && typeof m[k] === 'string') m[k] = Number(m[k]) || 0; }
        if (Array.isArray(m.reports)) {
          m.reports = m.reports.map((r: any) => {
            const rc = { ...r };
            for (const k2 of DECIMAL_KEYS) { if (k2 in rc && rc[k2] != null && typeof rc[k2] === 'string') rc[k2] = Number(rc[k2]) || 0; }
            return rc;
          });
          const reportsSum = m.reports.reduce((s: number, r: any) => s + (Number(r.quantity) || 0), 0);
          if (m.completedQuantity !== reportsSum) m.completedQuantity = reportsSum;
        }
        return m;
      });
    }
    return copy as T;
  });
}

// ── Default form settings ──

export const DEFAULT_PLAN_FORM_SETTINGS: PlanFormSettings = {
  standardFields: [
    { id: 'planNumber', label: '计划单号', showInList: true, showInCreate: false, showInDetail: true },
    { id: 'customer', label: '客户', showInList: true, showInCreate: true, showInDetail: true },
  ],
  customFields: [],
  listPrint: { showPrintButton: true },
};

/** 合并租户已存配置与默认标准字段，避免旧数据缺少某项导致表单配置与新建/详情不同步 */
function mergePlanStandardFields(
  saved: PlanFormSettings['standardFields'] | undefined,
): PlanFormSettings['standardFields'] {
  const defs = DEFAULT_PLAN_FORM_SETTINGS.standardFields;
  const arr = saved ?? [];
  const used = new Set<string>();
  const merged: PlanFormSettings['standardFields'] = defs.map(def => {
    const hit = arr.find(x => x.id === def.id);
    used.add(def.id);
    return hit ? { ...def, ...hit } : def;
  });
  for (const f of arr) {
    if (!used.has(f.id)) merged.push(f);
  }
  return merged;
}

export function normalizePlanFormSettings(raw: PlanFormSettings | null | undefined): PlanFormSettings {
  const s = raw ?? DEFAULT_PLAN_FORM_SETTINGS;
  const allowedList = s.listPrint?.allowedTemplateIds?.filter(Boolean) ?? [];
  const allowedLabel = s.labelPrint?.allowedTemplateIds?.filter(Boolean) ?? [];
  return {
    ...s,
    standardFields: mergePlanStandardFields(s.standardFields).filter(f => f.id !== 'dueDate' && f.id !== 'createdAt'),
    customFields: normalizePlanFormFieldConfigArray(s.customFields),
    listPrint: {
      showPrintButton: s.listPrint?.showPrintButton !== false,
      allowedTemplateIds: allowedList.length > 0 ? allowedList : undefined,
    },
    labelPrint: s.labelPrint
      ? {
          ...s.labelPrint,
          allowedTemplateIds: allowedLabel.length > 0 ? allowedLabel : undefined,
          showPlanDetailTraceSection: s.labelPrint.showPlanDetailTraceSection !== false,
        }
      : s.labelPrint,
  };
}

function normalizePlanListSlot(slot: PlanListPrintSettings | undefined): PlanListPrintSettings | undefined {
  if (!slot) return undefined;
  const allowed = slot.allowedTemplateIds?.filter(Boolean) ?? [];
  return {
    showPrintButton: slot.showPrintButton !== false,
    allowedTemplateIds: allowed.length > 0 ? allowed : undefined,
  };
}

export function normalizeOrderFormSettings(raw: OrderFormSettings | null | undefined): OrderFormSettings {
  const s = raw ?? DEFAULT_ORDER_FORM_SETTINGS;
  const stockInCustomFieldsRaw =
    Array.isArray(s.stockInCustomFields) && s.stockInCustomFields.length > 0
      ? s.stockInCustomFields
      : Array.isArray(s.customFields) && s.customFields.length > 0
        ? s.customFields
        : [];
  const stockInCustomFields = normalizePlanFormFieldConfigArray(stockInCustomFieldsRaw);
  const base: OrderFormSettings = {
    ...s,
    stockInCustomFields,
    /** 报工自定义在工序节点维护；入库自定义使用 stockInCustomFields */
    customFields: [],
    orderCenterPrint: s.orderCenterPrint,
  };
  const ocp = base.orderCenterPrint;
  if (!ocp) return base;
  return {
    ...base,
    orderCenterPrint: {
      orderDetail: normalizePlanListSlot(ocp.orderDetail),
      reportBatchDetail: normalizePlanListSlot(ocp.reportBatchDetail),
      stockInFlowDetail: normalizePlanListSlot(ocp.stockInFlowDetail),
    },
  };
}

export function normalizeMaterialFormSettings(raw: MaterialFormSettings | null | undefined): MaterialFormSettings {
  const s = raw ?? DEFAULT_MATERIAL_FORM_SETTINGS;
  const issue = normalizePlanFormFieldConfigArray(s.materialIssueCustomFields ?? []);
  const ret = normalizePlanFormFieldConfigArray(s.materialReturnCustomFields ?? []);
  const osIssue = normalizePlanFormFieldConfigArray(s.outsourceMaterialIssueCustomFields ?? []);
  const osRet = normalizePlanFormFieldConfigArray(s.outsourceMaterialReturnCustomFields ?? []);
  const base: MaterialFormSettings = {
    ...s,
    materialIssueCustomFields: issue,
    materialReturnCustomFields: ret,
    outsourceMaterialIssueCustomFields: osIssue,
    outsourceMaterialReturnCustomFields: osRet,
  };
  const mcp = base.materialCenterPrint;
  if (!mcp) return base;
  return {
    ...base,
    materialCenterPrint: {
      stockOutFlowDetail: normalizePlanListSlot(mcp.stockOutFlowDetail),
      stockReturnFlowDetail: normalizePlanListSlot(mcp.stockReturnFlowDetail),
      outsourceStockOutFlowDetail: normalizePlanListSlot(mcp.outsourceStockOutFlowDetail),
      outsourceStockReturnFlowDetail: normalizePlanListSlot(mcp.outsourceStockReturnFlowDetail),
    },
  };
}

export function normalizeOutsourceFormSettings(raw: OutsourceFormSettings | null | undefined): OutsourceFormSettings {
  const s = raw ?? DEFAULT_OUTSOURCE_FORM_SETTINGS;
  const dispatch = normalizePlanFormFieldConfigArray(s.outsourceDispatchCustomFields ?? []);
  const receive = normalizePlanFormFieldConfigArray(s.outsourceReceiveCustomFields ?? []);
  const base: OutsourceFormSettings = {
    ...s,
    outsourceDispatchCustomFields: dispatch,
    outsourceReceiveCustomFields: receive,
  };
  const ocp = base.outsourceCenterPrint;
  if (!ocp) return base;
  return {
    ...base,
    outsourceCenterPrint: {
      dispatchFlowDetail: normalizePlanListSlot(ocp.dispatchFlowDetail),
      receiveFlowDetail: normalizePlanListSlot(ocp.receiveFlowDetail),
    },
  };
}

export function normalizeReworkFormSettings(raw: ReworkFormSettings | null | undefined): ReworkFormSettings {
  const s = raw ?? DEFAULT_REWORK_FORM_SETTINGS;
  const defect = normalizePlanFormFieldConfigArray(s.defectTreatmentCustomFields ?? []);
  const report = normalizePlanFormFieldConfigArray(s.reworkReportCustomFields ?? []);
  const base: ReworkFormSettings = {
    ...s,
    defectTreatmentCustomFields: defect,
    reworkReportCustomFields: report,
  };
  const rcp = base.reworkCenterPrint;
  if (!rcp) return base;
  return {
    ...base,
    reworkCenterPrint: {
      defectTreatmentFlowDetail: normalizePlanListSlot(rcp.defectTreatmentFlowDetail),
      reworkReportFlowDetail: normalizePlanListSlot(rcp.reworkReportFlowDetail),
    },
  };
}

export const DEFAULT_ORDER_FORM_SETTINGS: OrderFormSettings = {
  standardFields: [
    { id: 'orderNumber', label: '工单号', showInList: true, showInCreate: false, showInDetail: true },
    { id: 'customer', label: '客户', showInList: false, showInCreate: true, showInDetail: true },
    { id: 'dueDate', label: '交期', showInList: false, showInCreate: true, showInDetail: true },
    { id: 'startDate', label: '开始日期', showInList: false, showInCreate: true, showInDetail: true },
  ],
  customFields: [],
  stockInCustomFields: [],
};

/** 采购订单已废弃的标准字段 id（历史配置中可能仍存在，加载时剔除） */
const DEPRECATED_PURCHASE_ORDER_STANDARD_FIELD_IDS = new Set(['dueDate', 'createdAt', 'note']);

export const DEFAULT_PURCHASE_ORDER_FORM_SETTINGS: PurchaseOrderFormSettings = {
  standardFields: [
    { id: 'docNumber', label: '单据编号', showInList: true, showInCreate: false, showInDetail: true },
    { id: 'partner', label: '供应商', showInList: true, showInCreate: true, showInDetail: true },
  ],
  customFields: [],
  listPrint: { showPrintButton: true },
};

function mergePurchaseOrderStandardFields(
  saved: PurchaseOrderFormSettings['standardFields'] | undefined,
): PurchaseOrderFormSettings['standardFields'] {
  const defs = DEFAULT_PURCHASE_ORDER_FORM_SETTINGS.standardFields;
  const arr = (saved ?? []).filter(f => !DEPRECATED_PURCHASE_ORDER_STANDARD_FIELD_IDS.has(f.id));
  const used = new Set<string>();
  const merged: PurchaseOrderFormSettings['standardFields'] = defs.map(def => {
    const hit = arr.find(x => x.id === def.id);
    used.add(def.id);
    return hit ? { ...def, ...hit } : def;
  });
  for (const f of arr) {
    if (!used.has(f.id) && !DEPRECATED_PURCHASE_ORDER_STANDARD_FIELD_IDS.has(f.id)) merged.push(f);
  }
  return merged.map(f => (f.id === 'docNumber' ? { ...f, showInCreate: false } : f));
}

export function normalizePurchaseOrderFormSettings(raw: PurchaseOrderFormSettings | null | undefined): PurchaseOrderFormSettings {
  const s = raw ?? DEFAULT_PURCHASE_ORDER_FORM_SETTINGS;
  const legacyDetail = normalizePlanListSlot(
    (s as PurchaseOrderFormSettings & { detailPrint?: PlanListPrintSettings }).detailPrint,
  );
  const listNorm = normalizePlanListSlot(s.listPrint) ?? { showPrintButton: true };
  const a = listNorm.allowedTemplateIds ?? [];
  const b = legacyDetail?.allowedTemplateIds ?? [];
  const mergedIds = a.length || b.length ? Array.from(new Set([...a, ...b])) : [];
  const listPrint: PlanListPrintSettings = {
    showPrintButton: listNorm.showPrintButton !== false,
    allowedTemplateIds: mergedIds.length > 0 ? mergedIds : undefined,
  };
  return {
    standardFields: mergePurchaseOrderStandardFields(s.standardFields),
    customFields: normalizePlanFormFieldConfigArray(s.customFields),
    listPrint,
  };
}

/** 销售订单已废弃的标准字段 id（与采购订单对齐） */
const DEPRECATED_SALES_ORDER_STANDARD_FIELD_IDS = DEPRECATED_PURCHASE_ORDER_STANDARD_FIELD_IDS;

export const DEFAULT_SALES_ORDER_FORM_SETTINGS: SalesOrderFormSettings = {
  standardFields: [
    { id: 'docNumber', label: '单据编号', showInList: true, showInCreate: false, showInDetail: true },
    { id: 'partner', label: '客户', showInList: true, showInCreate: true, showInDetail: true },
  ],
  customFields: [],
  listPrint: { showPrintButton: true },
};

function mergeSalesOrderStandardFields(
  saved: SalesOrderFormSettings['standardFields'] | undefined,
): SalesOrderFormSettings['standardFields'] {
  const defs = DEFAULT_SALES_ORDER_FORM_SETTINGS.standardFields;
  const arr = (saved ?? []).filter(f => !DEPRECATED_SALES_ORDER_STANDARD_FIELD_IDS.has(f.id));
  const used = new Set<string>();
  const merged: SalesOrderFormSettings['standardFields'] = defs.map(def => {
    const hit = arr.find(x => x.id === def.id);
    used.add(def.id);
    return hit ? { ...def, ...hit } : def;
  });
  for (const f of arr) {
    if (!used.has(f.id) && !DEPRECATED_SALES_ORDER_STANDARD_FIELD_IDS.has(f.id)) merged.push(f);
  }
  return merged.map(f => (f.id === 'docNumber' ? { ...f, showInCreate: false } : f));
}

export function normalizeSalesOrderFormSettings(raw: SalesOrderFormSettings | null | undefined): SalesOrderFormSettings {
  const s = raw ?? DEFAULT_SALES_ORDER_FORM_SETTINGS;
  const legacyDetail = normalizePlanListSlot(
    (s as SalesOrderFormSettings & { detailPrint?: PlanListPrintSettings }).detailPrint,
  );
  const listNorm = normalizePlanListSlot(s.listPrint) ?? { showPrintButton: true };
  const a = listNorm.allowedTemplateIds ?? [];
  const b = legacyDetail?.allowedTemplateIds ?? [];
  const mergedIds = a.length || b.length ? Array.from(new Set([...a, ...b])) : [];
  const listPrint: PlanListPrintSettings = {
    showPrintButton: listNorm.showPrintButton !== false,
    allowedTemplateIds: mergedIds.length > 0 ? mergedIds : undefined,
  };
  return {
    standardFields: mergeSalesOrderStandardFields(s.standardFields),
    customFields: normalizePlanFormFieldConfigArray(s.customFields),
    listPrint,
  };
}

/** 采购单（入库）已废弃的标准字段 id（历史配置加载时剔除） */
const DEPRECATED_PURCHASE_BILL_STANDARD_FIELD_IDS = new Set(['createdAt', 'note']);

export const DEFAULT_PURCHASE_BILL_FORM_SETTINGS: PurchaseBillFormSettings = {
  standardFields: [
    { id: 'docNumber', label: '单据编号', showInList: true, showInCreate: false, showInDetail: true },
    { id: 'partner', label: '供应商', showInList: true, showInCreate: true, showInDetail: true },
    { id: 'warehouse', label: '入库仓库', showInList: true, showInCreate: true, showInDetail: true },
  ],
  customFields: [],
  listPrint: { showPrintButton: true },
};

function mergePurchaseBillStandardFields(
  saved: PurchaseBillFormSettings['standardFields'] | undefined,
): PurchaseBillFormSettings['standardFields'] {
  const defs = DEFAULT_PURCHASE_BILL_FORM_SETTINGS.standardFields;
  const arr = (saved ?? []).filter(f => !DEPRECATED_PURCHASE_BILL_STANDARD_FIELD_IDS.has(f.id));
  const used = new Set<string>();
  const merged: PurchaseBillFormSettings['standardFields'] = defs.map(def => {
    const hit = arr.find(x => x.id === def.id);
    used.add(def.id);
    return hit ? { ...def, ...hit } : def;
  });
  for (const f of arr) {
    if (!used.has(f.id) && !DEPRECATED_PURCHASE_BILL_STANDARD_FIELD_IDS.has(f.id)) merged.push(f);
  }
  return merged.map(f => (f.id === 'docNumber' ? { ...f, showInCreate: false } : f));
}

export function normalizePurchaseBillFormSettings(raw: PurchaseBillFormSettings | null | undefined): PurchaseBillFormSettings {
  const s = raw ?? DEFAULT_PURCHASE_BILL_FORM_SETTINGS;
  type PbLegacy = PurchaseBillFormSettings & {
    detailPrint?: PlanListPrintSettings;
    /** 历史采购单配置曾继承计划单 `labelPrint` */
    labelPrint?: { allowedTemplateIds?: string[]; showPlanDetailTraceSection?: boolean };
  };
  const leg = s as PbLegacy;
  const legacyDetail = normalizePlanListSlot(leg.detailPrint);
  const legacyLabel = normalizePlanListSlot(
    leg.labelPrint?.allowedTemplateIds?.length
      ? { showPrintButton: true, allowedTemplateIds: leg.labelPrint.allowedTemplateIds }
      : undefined,
  );
  const listNorm = normalizePlanListSlot(s.listPrint) ?? { showPrintButton: true };
  const a = listNorm.allowedTemplateIds ?? [];
  const b = legacyDetail?.allowedTemplateIds ?? [];
  const c = legacyLabel?.allowedTemplateIds ?? [];
  const mergedIds = a.length || b.length || c.length ? Array.from(new Set([...a, ...b, ...c])) : [];
  const listPrint: PlanListPrintSettings = {
    showPrintButton: listNorm.showPrintButton !== false,
    allowedTemplateIds: mergedIds.length > 0 ? mergedIds : undefined,
  };
  return {
    standardFields: mergePurchaseBillStandardFields(s.standardFields),
    customFields: normalizePlanFormFieldConfigArray(s.customFields),
    listPrint,
  };
}

export const DEFAULT_SALES_BILL_FORM_SETTINGS: SalesBillFormSettings = {
  standardFields: [],
  customFields: [],
  listPrint: { showPrintButton: true },
};

export function normalizeSalesBillFormSettings(raw: SalesBillFormSettings | null | undefined): SalesBillFormSettings {
  const s = raw ?? DEFAULT_SALES_BILL_FORM_SETTINGS;
  const listNorm = normalizePlanListSlot(s.listPrint) ?? { showPrintButton: true };
  const rawIds = listNorm.allowedTemplateIds?.map(x => (x != null && x !== '' ? String(x).trim() : '')).filter(Boolean) ?? [];
  const listPrint: PlanListPrintSettings = {
    showPrintButton: listNorm.showPrintButton !== false,
    allowedTemplateIds: rawIds.length > 0 ? Array.from(new Set(rawIds)) : undefined,
  };
  return {
    standardFields: [],
    customFields: normalizePlanFormFieldConfigArray(s.customFields),
    listPrint,
  };
}

export const DEFAULT_RECEIPT_FORM_SETTINGS: ReceiptFormSettings = {
  listPrint: { showPrintButton: true },
};

export function normalizeReceiptFormSettings(raw: ReceiptFormSettings | null | undefined): ReceiptFormSettings {
  const s = raw ?? DEFAULT_RECEIPT_FORM_SETTINGS;
  const listNorm = normalizePlanListSlot(s.listPrint) ?? { showPrintButton: true };
  const rawIds = listNorm.allowedTemplateIds?.map(x => (x != null && x !== '' ? String(x).trim() : '')).filter(Boolean) ?? [];
  return {
    listPrint: {
      showPrintButton: listNorm.showPrintButton !== false,
      allowedTemplateIds: rawIds.length > 0 ? Array.from(new Set(rawIds)) : undefined,
    },
  };
}

export const DEFAULT_PAYMENT_FORM_SETTINGS: PaymentFormSettings = {
  listPrint: { showPrintButton: true },
};

export function normalizePaymentFormSettings(raw: PaymentFormSettings | null | undefined): PaymentFormSettings {
  const s = raw ?? DEFAULT_PAYMENT_FORM_SETTINGS;
  const listNorm = normalizePlanListSlot(s.listPrint) ?? { showPrintButton: true };
  const rawIds = listNorm.allowedTemplateIds?.map(x => (x != null && x !== '' ? String(x).trim() : '')).filter(Boolean) ?? [];
  return {
    listPrint: {
      showPrintButton: listNorm.showPrintButton !== false,
      allowedTemplateIds: rawIds.length > 0 ? Array.from(new Set(rawIds)) : undefined,
    },
  };
}

const EMPTY_DICTIONARIES: AppDictionaries = { colors: [], sizes: [], units: [] };

// ── Context type ──

export interface AppDataContextValue {
  dataLoading: boolean;
  products: Product[];
  orders: ProductionOrder[];
  plans: PlanOrder[];
  psiRecords: any[];
  financeRecords: FinanceRecord[];
  prodRecords: ProductionOpRecord[];
  categories: ProductCategory[];
  partnerCategories: PartnerCategory[];
  dictionaries: AppDictionaries;
  globalNodes: GlobalNodeTemplate[];
  boms: BOM[];
  partners: any[];
  workers: any[];
  equipment: any[];
  warehouses: Warehouse[];
  financeCategories: FinanceCategory[];
  financeAccountTypes: FinanceAccountType[];
  planFormSettings: PlanFormSettings;
  orderFormSettings: OrderFormSettings;
  purchaseOrderFormSettings: PurchaseOrderFormSettings;
  salesOrderFormSettings: SalesOrderFormSettings;
  purchaseBillFormSettings: PurchaseBillFormSettings;
  salesBillFormSettings: SalesBillFormSettings;
  receiptFormSettings: ReceiptFormSettings;
  paymentFormSettings: PaymentFormSettings;
  /** 租户级打印模板列表 */
  printTemplates: PrintTemplate[];
  productionLinkMode: ProductionLinkMode;
  processSequenceMode: ProcessSequenceMode;
  allowExceedMaxReportQty: boolean;
  productMilestoneProgresses: ProductMilestoneProgress[];
  // Config handlers
  onUpdateProductionLinkMode: (mode: ProductionLinkMode) => Promise<void>;
  onUpdateProcessSequenceMode: (mode: ProcessSequenceMode) => Promise<void>;
  onUpdateAllowExceedMaxReportQty: (v: boolean) => Promise<void>;
  onUpdatePlanFormSettings: (v: PlanFormSettings) => Promise<void>;
  onUpdateOrderFormSettings: (v: OrderFormSettings) => Promise<void>;
  onUpdatePurchaseOrderFormSettings: (v: PurchaseOrderFormSettings) => Promise<void>;
  onUpdateSalesOrderFormSettings: (v: SalesOrderFormSettings) => Promise<void>;
  onUpdatePurchaseBillFormSettings: (v: PurchaseBillFormSettings) => Promise<void>;
  onUpdateSalesBillFormSettings: (v: SalesBillFormSettings) => Promise<void>;
  onUpdateReceiptFormSettings: (v: ReceiptFormSettings) => Promise<void>;
  onUpdatePaymentFormSettings: (v: PaymentFormSettings) => Promise<void>;
  onUpdatePrintTemplates: (v: PrintTemplate[]) => Promise<void>;
  materialPanelSettings: MaterialPanelSettings;
  materialFormSettings: MaterialFormSettings;
  outsourceFormSettings: OutsourceFormSettings;
  reworkFormSettings: ReworkFormSettings;
  onUpdateMaterialPanelSettings: (v: MaterialPanelSettings) => Promise<void>;
  onUpdateMaterialFormSettings: (v: MaterialFormSettings) => Promise<void>;
  onUpdateOutsourceFormSettings: (v: OutsourceFormSettings) => Promise<void>;
  onUpdateReworkFormSettings: (v: ReworkFormSettings) => Promise<void>;
  // Product / BOM
  /** 成功返回 true，失败已 toast 并返回 false */
  /** 成功返回归一化后的产品实体，失败返回 null（已 toast） */
  onUpdateProduct: (p: Product) => Promise<Product | null>;
  /** 成功返回 true，失败已 toast 并返回 false */
  onDeleteProduct: (id: string) => Promise<boolean>;
  /** 成功返回 true，失败已 toast 并返回 false */
  onUpdateBOM: (b: BOM) => Promise<boolean>;
  // Plans
  onCreatePlan: (p: PlanOrder) => Promise<void>;
  onUpdatePlan: (id: string, updates: Partial<PlanOrder>) => Promise<void>;
  onSplitPlan: (planId: string, newPlans: PlanOrder[]) => Promise<void>;
  onDeletePlan: (id: string) => Promise<void>;
  onConvertToOrder: (id: string) => Promise<void>;
  onCreateSubPlan: (data: { productId: string; quantity: number; planId: string; bomNodeId?: string }) => Promise<void>;
  onCreateSubPlans: (data: { planId: string; items: Array<{ productId: string; quantity: number; bomNodeId?: string; parentProductId?: string; parentNodeId?: string }> }) => Promise<void>;
  // Orders / reports
  onReportSubmit: (oId: string, mId: string, qty: number, data: Record<string, any> | null, vId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string, weight?: number) => Promise<void>;
  onReportSubmitProduct: (productId: string, milestoneTemplateId: string, qty: number, data: Record<string, any> | null, vId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string, weight?: number) => Promise<void>;
  onUpdateReport: (data: { orderId: string; milestoneId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string; newMilestoneId?: string; customData?: Record<string, unknown> }) => Promise<void>;
  onDeleteReport: (data: { orderId: string; milestoneId: string; reportId: string }) => Promise<void>;
  onUpdateReportProduct: (data: { progressId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string; newMilestoneTemplateId?: string; customData?: Record<string, unknown> }) => Promise<void>;
  onDeleteReportProduct: (data: { progressId: string; reportId: string }) => Promise<void>;
  onUpdateOrder: (orderId: string, updates: Partial<ProductionOrder>) => Promise<void>;
  onDeleteOrder: (orderId: string) => Promise<void>;
  // Production records
  onAddProdRecord: (record: ProductionOpRecord) => Promise<void>;
  onAddProdRecordBatch: (records: ProductionOpRecord[]) => Promise<void>;
  onUpdateProdRecord: (r: ProductionOpRecord) => Promise<void>;
  onDeleteProdRecord: (id: string) => Promise<void>;
  // PSI records
  onAddPSIRecord: (record: any) => Promise<void>;
  onAddPSIRecordBatch: (records: any[]) => Promise<void>;
  onReplacePSIRecords: (type: string, docNumber: string, newRecords: any[]) => Promise<void>;
  onDeletePSIRecords: (type: string, docNumber: string) => Promise<void>;
  // Finance records
  onAddFinanceRecord: (r: FinanceRecord) => Promise<void>;
  onUpdateFinanceRecord: (r: FinanceRecord) => Promise<void>;
  onDeleteFinanceRecord: (id: string) => Promise<void>;
  // Refresh helpers (for child pages that manage their own CRUD)
  refreshDictionaries: () => Promise<void>;
  refreshWorkers: () => Promise<void>;
  refreshEquipment: () => Promise<void>;
  refreshPartners: () => Promise<void>;
  refreshPartnerCategories: () => Promise<void>;
  refreshCategories: () => Promise<void>;
  refreshGlobalNodes: () => Promise<void>;
  refreshWarehouses: () => Promise<void>;
  refreshFinanceCategories: () => Promise<void>;
  refreshFinanceAccountTypes: () => Promise<void>;
  refreshProducts: () => Promise<void>;
  refreshOrders: () => Promise<void>;
  refreshProdRecords: () => Promise<void>;
  refreshPMP: () => Promise<void>;
  /** 从服务端重新拉取打印模板（多标签页保存后另一页可即时同步） */
  refreshPrintTemplates: () => Promise<void>;
  /** 按需加载重数据（orders/plans/prodRecords/psiRecords/financeRecords），首次调用触发加载，后续调用无操作 */
  ensureDeferredLoaded: () => Promise<void>;
}

export type AppDataState = Pick<AppDataContextValue,
  'dataLoading' | 'products' | 'orders' | 'plans' | 'psiRecords' | 'financeRecords' | 'prodRecords' |
  'categories' | 'partnerCategories' | 'dictionaries' | 'globalNodes' | 'boms' |
  'partners' | 'workers' | 'equipment' | 'warehouses' |
  'financeCategories' | 'financeAccountTypes' |
  'planFormSettings' | 'orderFormSettings' | 'purchaseOrderFormSettings' | 'salesOrderFormSettings' | 'purchaseBillFormSettings' | 'salesBillFormSettings' | 'receiptFormSettings' | 'paymentFormSettings' | 'materialPanelSettings' | 'materialFormSettings' | 'outsourceFormSettings' | 'reworkFormSettings' |
  'printTemplates' |
  'productionLinkMode' | 'processSequenceMode' | 'allowExceedMaxReportQty' | 'productMilestoneProgresses'
>;

export type AppDataActions = Omit<AppDataContextValue, keyof AppDataState>;

// ── Domain sub-context types ──

export interface MasterDataState {
  categories: ProductCategory[];
  partnerCategories: PartnerCategory[];
  dictionaries: AppDictionaries;
  globalNodes: GlobalNodeTemplate[];
  partners: any[];
  workers: any[];
  equipment: any[];
  warehouses: Warehouse[];
  products: Product[];
  boms: BOM[];
}

export interface ConfigState {
  productionLinkMode: ProductionLinkMode;
  processSequenceMode: ProcessSequenceMode;
  allowExceedMaxReportQty: boolean;
  planFormSettings: PlanFormSettings;
  orderFormSettings: OrderFormSettings;
  purchaseOrderFormSettings: PurchaseOrderFormSettings;
  salesOrderFormSettings: SalesOrderFormSettings;
  purchaseBillFormSettings: PurchaseBillFormSettings;
  salesBillFormSettings: SalesBillFormSettings;
  receiptFormSettings: ReceiptFormSettings;
  paymentFormSettings: PaymentFormSettings;
  materialPanelSettings: MaterialPanelSettings;
  materialFormSettings: MaterialFormSettings;
  outsourceFormSettings: OutsourceFormSettings;
  reworkFormSettings: ReworkFormSettings;
  printTemplates: PrintTemplate[];
}

export interface OrdersState {
  orders: ProductionOrder[];
  plans: PlanOrder[];
  productMilestoneProgresses: ProductMilestoneProgress[];
  prodRecords: ProductionOpRecord[];
}

export interface PsiState {
  psiRecords: any[];
}

export interface FinanceState {
  financeRecords: FinanceRecord[];
  financeCategories: FinanceCategory[];
  financeAccountTypes: FinanceAccountType[];
}

// ── Domain sub-contexts ──

const LoadingCtx = createContext<boolean>(true);
const MasterDataCtx = createContext<MasterDataState | null>(null);
const ConfigCtx = createContext<ConfigState | null>(null);
const OrdersCtx = createContext<OrdersState | null>(null);
const PsiCtx = createContext<PsiState | null>(null);
const FinanceCtx = createContext<FinanceState | null>(null);
const ActionsCtx = createContext<AppDataActions | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, tenantCtx } = useAuth();

  // ── State ──
  const [dataLoading, setDataLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [plans, setPlans] = useState<PlanOrder[]>([]);
  const [psiRecords, setPsiRecords] = useState<any[]>([]);
  const [financeRecords, setFinanceRecords] = useState<FinanceRecord[]>([]);
  const [prodRecords, setProdRecords] = useState<ProductionOpRecord[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [partnerCategories, setPartnerCategories] = useState<PartnerCategory[]>([]);
  const [dictionaries, setDictionaries] = useState<AppDictionaries>(EMPTY_DICTIONARIES);
  const [globalNodes, setGlobalNodes] = useState<GlobalNodeTemplate[]>([]);
  const [boms, setBoms] = useState<BOM[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [financeCategories, setFinanceCategories] = useState<FinanceCategory[]>([]);
  const [financeAccountTypes, setFinanceAccountTypes] = useState<FinanceAccountType[]>([]);
  const [planFormSettings, setPlanFormSettings] = useState<PlanFormSettings>(DEFAULT_PLAN_FORM_SETTINGS);
  const [orderFormSettings, setOrderFormSettings] = useState<OrderFormSettings>(DEFAULT_ORDER_FORM_SETTINGS);
  const [purchaseOrderFormSettings, setPurchaseOrderFormSettings] = useState<PurchaseOrderFormSettings>(DEFAULT_PURCHASE_ORDER_FORM_SETTINGS);
  const [salesOrderFormSettings, setSalesOrderFormSettings] = useState<SalesOrderFormSettings>(DEFAULT_SALES_ORDER_FORM_SETTINGS);
  const [purchaseBillFormSettings, setPurchaseBillFormSettings] = useState<PurchaseBillFormSettings>(DEFAULT_PURCHASE_BILL_FORM_SETTINGS);
  const [salesBillFormSettings, setSalesBillFormSettings] = useState<SalesBillFormSettings>(DEFAULT_SALES_BILL_FORM_SETTINGS);
  const [receiptFormSettings, setReceiptFormSettings] = useState<ReceiptFormSettings>(DEFAULT_RECEIPT_FORM_SETTINGS);
  const [paymentFormSettings, setPaymentFormSettings] = useState<PaymentFormSettings>(DEFAULT_PAYMENT_FORM_SETTINGS);
  const [materialPanelSettings, setMaterialPanelSettings] = useState<MaterialPanelSettings>(DEFAULT_MATERIAL_PANEL_SETTINGS);
  const [materialFormSettings, setMaterialFormSettings] = useState<MaterialFormSettings>(DEFAULT_MATERIAL_FORM_SETTINGS);
  const [outsourceFormSettings, setOutsourceFormSettings] = useState<OutsourceFormSettings>(DEFAULT_OUTSOURCE_FORM_SETTINGS);
  const [reworkFormSettings, setReworkFormSettings] = useState<ReworkFormSettings>(DEFAULT_REWORK_FORM_SETTINGS);
  const [printTemplates, setPrintTemplates] = useState<PrintTemplate[]>([]);
  /** 用于跨标签广播时忽略本标签发出的消息，避免重复请求 */
  const printTemplatesCrossTabIdRef = useRef(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `pt-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
  );
  const [productionLinkMode, setProductionLinkMode] = useState<ProductionLinkMode>('order');
  const [processSequenceMode, setProcessSequenceMode] = useState<ProcessSequenceMode>('free');
  const [allowExceedMaxReportQty, setAllowExceedMaxReportQty] = useState<boolean>(true);
  const [productMilestoneProgresses, setProductMilestoneProgresses] = useState<ProductMilestoneProgress[]>([]);

  const val = (results: PromiseSettledResult<unknown>[], i: number) =>
    results[i]?.status === 'fulfilled' ? (results[i] as PromiseFulfilledResult<unknown>).value : undefined;

  const activeTenantId = tenantCtx?.tenantId;

  // ── Initial data loading (core data only — heavy data loaded on demand) ──
  // 依赖当前企业 ID：切换公司后必须清空并重新拉取，避免与进销存等数据错位（表现为「未知产品」等）
  useEffect(() => {
    if (!activeTenantId) return;
    let cancelled = false;

    setDataLoading(true);
    setProducts([]);
    setOrders([]);
    setPlans([]);
    setPsiRecords([]);
    setFinanceRecords([]);
    setProdRecords([]);
    setCategories([]);
    setPartnerCategories([]);
    setDictionaries(EMPTY_DICTIONARIES);
    setGlobalNodes([]);
    setBoms([]);
    setPartners([]);
    setWorkers([]);
    setEquipment([]);
    setWarehouses([]);
    setFinanceCategories([]);
    setFinanceAccountTypes([]);
    setPlanFormSettings(DEFAULT_PLAN_FORM_SETTINGS);
    setOrderFormSettings(DEFAULT_ORDER_FORM_SETTINGS);
    setPurchaseOrderFormSettings(DEFAULT_PURCHASE_ORDER_FORM_SETTINGS);
    setSalesOrderFormSettings(DEFAULT_SALES_ORDER_FORM_SETTINGS);
    setPurchaseBillFormSettings(DEFAULT_PURCHASE_BILL_FORM_SETTINGS);
    setSalesBillFormSettings(DEFAULT_SALES_BILL_FORM_SETTINGS);
    setReceiptFormSettings(DEFAULT_RECEIPT_FORM_SETTINGS);
    setPaymentFormSettings(DEFAULT_PAYMENT_FORM_SETTINGS);
    setMaterialPanelSettings(DEFAULT_MATERIAL_PANEL_SETTINGS);
    setMaterialFormSettings(DEFAULT_MATERIAL_FORM_SETTINGS);
    setOutsourceFormSettings(DEFAULT_OUTSOURCE_FORM_SETTINGS);
    setReworkFormSettings(DEFAULT_REWORK_FORM_SETTINGS);
    setPrintTemplates([]);
    setProductMilestoneProgresses([]);

    async function loadCore() {
      const coreResults = await Promise.allSettled([
        api.settings.getConfig(),                               // 0
        api.settings.categories.list(),                         // 1
        api.settings.partnerCategories.list(),                  // 2
        api.settings.nodes.list(),                              // 3
        api.settings.warehouses.list(),                         // 4
        api.settings.financeCategories.list(),                  // 5
        api.settings.financeAccountTypes.list(),                // 6
        api.partners.list(),                                    // 7
        api.dictionaries.list(),                                // 8
        api.products.list(),                                    // 9
        api.boms.list(),                                        // 10
        api.tenants.getReportableMembers(activeTenantId),       // 11
        api.equipment.list(),                                   // 12
      ]);
      if (cancelled) return;

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

      const cfg = (val(coreResults, 0) || {}) as Record<string, unknown>;
      setProductionLinkMode((cfg.productionLinkMode as ProductionLinkMode) ?? 'order');
      setProcessSequenceMode((cfg.processSequenceMode as ProcessSequenceMode) ?? 'free');
      setAllowExceedMaxReportQty(cfg.allowExceedMaxReportQty !== false);
      setPlanFormSettings(normalizePlanFormSettings(cfg.planFormSettings as PlanFormSettings));
      setOrderFormSettings(normalizeOrderFormSettings((cfg.orderFormSettings as OrderFormSettings) ?? DEFAULT_ORDER_FORM_SETTINGS));
      {
        const po = (cfg.purchaseOrderFormSettings as PurchaseOrderFormSettings) ?? DEFAULT_PURCHASE_ORDER_FORM_SETTINGS;
        setPurchaseOrderFormSettings(normalizePurchaseOrderFormSettings(po));
      }
      {
        const so = (cfg.salesOrderFormSettings as SalesOrderFormSettings) ?? DEFAULT_SALES_ORDER_FORM_SETTINGS;
        setSalesOrderFormSettings(normalizeSalesOrderFormSettings(so));
      }
      {
        const pb = (cfg.purchaseBillFormSettings as PurchaseBillFormSettings) ?? DEFAULT_PURCHASE_BILL_FORM_SETTINGS;
        setPurchaseBillFormSettings(normalizePurchaseBillFormSettings(pb));
      }
      {
        const sb = (cfg.salesBillFormSettings as SalesBillFormSettings) ?? DEFAULT_SALES_BILL_FORM_SETTINGS;
        setSalesBillFormSettings(normalizeSalesBillFormSettings(sb));
      }
      {
        const rf = (cfg.receiptFormSettings as ReceiptFormSettings) ?? DEFAULT_RECEIPT_FORM_SETTINGS;
        setReceiptFormSettings(normalizeReceiptFormSettings(rf));
      }
      {
        const pf = (cfg.paymentFormSettings as PaymentFormSettings) ?? DEFAULT_PAYMENT_FORM_SETTINGS;
        setPaymentFormSettings(normalizePaymentFormSettings(pf));
      }
      setMaterialPanelSettings((cfg.materialPanelSettings as MaterialPanelSettings) ?? DEFAULT_MATERIAL_PANEL_SETTINGS);
      setMaterialFormSettings(normalizeMaterialFormSettings((cfg.materialFormSettings as MaterialFormSettings) ?? DEFAULT_MATERIAL_FORM_SETTINGS));
      setOutsourceFormSettings(normalizeOutsourceFormSettings((cfg.outsourceFormSettings as OutsourceFormSettings) ?? DEFAULT_OUTSOURCE_FORM_SETTINGS));
      setReworkFormSettings(normalizeReworkFormSettings((cfg.reworkFormSettings as ReworkFormSettings) ?? DEFAULT_REWORK_FORM_SETTINGS));
      setPrintTemplates(
        ensureBuiltinSalesBillPrintTemplate(Array.isArray(cfg.printTemplates) ? (cfg.printTemplates as PrintTemplate[]) : []),
      );
      if (val(coreResults, 1))  setCategories(val(coreResults, 1) as ProductCategory[]);
      if (val(coreResults, 2))  setPartnerCategories(val(coreResults, 2) as PartnerCategory[]);
      if (val(coreResults, 3))  setGlobalNodes(val(coreResults, 3) as GlobalNodeTemplate[]);
      if (val(coreResults, 4))  setWarehouses(val(coreResults, 4) as Warehouse[]);
      if (val(coreResults, 5))  setFinanceCategories(val(coreResults, 5) as FinanceCategory[]);
      if (val(coreResults, 6))  setFinanceAccountTypes(val(coreResults, 6) as FinanceAccountType[]);
      if (val(coreResults, 7)) setPartners(normalizePartnersFromApi(val(coreResults, 7) as any[]) as any[]);
      if (val(coreResults, 8))  setDictionaries(val(coreResults, 8) as AppDictionaries);
      if (val(coreResults, 9))  setProducts(normalizeDecimals(val(coreResults, 9) as Product[]));
      if (val(coreResults, 10)) setBoms(normalizeDecimals(val(coreResults, 10) as BOM[]));
      if (val(coreResults, 11)) setWorkers(val(coreResults, 11) as any[]);
      if (val(coreResults, 12)) setEquipment(val(coreResults, 12) as any[]);

      if (!cancelled) setDataLoading(false);
    }

    (async () => {
      try {
        await loadCore();
      } catch (err) {
        console.error('数据加载失败', err);
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId]);

  // ── Incremental sync timestamps ──
  const lastFetchTs = useRef<Record<string, string>>({});
  const markFetched = (key: string) => { lastFetchTs.current[key] = new Date().toISOString(); };

  // ── Lazy load for heavy data (orders/plans/prodRecords/psiRecords/financeRecords) ──
  const deferredLoadState = useRef<'idle' | 'loading' | 'done'>('idle');

  useEffect(() => {
    deferredLoadState.current = 'idle';
    lastFetchTs.current = {};
  }, [activeTenantId]);

  const ensureDeferredLoaded = useCallback(async () => {
    if (deferredLoadState.current !== 'idle') return;
    deferredLoadState.current = 'loading';

    try {
      const metaResults = await Promise.allSettled([
        api.plans.list(),                    // 0
        api.orders.list(),                   // 1
        api.orders.listProductProgress(),    // 2
      ]);
      if (val(metaResults, 0)) setPlans(normalizeDecimals(val(metaResults, 0) as PlanOrder[]));
      if (val(metaResults, 1)) setOrders(normalizeDecimals(val(metaResults, 1) as ProductionOrder[]));
      if (val(metaResults, 2)) setProductMilestoneProgresses(normalizeDecimals(val(metaResults, 2) as ProductMilestoneProgress[]));

      const heavyResults = await Promise.allSettled([
        api.production.list(),               // 0
        api.psi.list(),                      // 1
        api.finance.list(),                  // 2
      ]);
      if (val(heavyResults, 0)) setProdRecords(normalizeDecimals(val(heavyResults, 0) as ProductionOpRecord[]));
      if (val(heavyResults, 1)) setPsiRecords(normalizeDecimals(val(heavyResults, 1) as any[]));
      if (val(heavyResults, 2)) setFinanceRecords(normalizeDecimals(val(heavyResults, 2) as FinanceRecord[]));

      const allFailed = [...metaResults, ...heavyResults].filter(r => r.status === 'rejected');
      if (allFailed.length) console.warn(`延后数据加载: ${allFailed.length} 个请求失败`, allFailed.map(r => (r as PromiseRejectedResult).reason?.message));

      const now = new Date().toISOString();
      ['orders', 'products', 'plans', 'prodRecords', 'psiRecords', 'financeRecords'].forEach(k => { lastFetchTs.current[k] = now; });
    } catch (err) {
      console.error('延后数据加载失败', err);
    } finally {
      deferredLoadState.current = 'done';
    }
  }, []);

  /**
   * Merges incremental results into the existing state.
   * If the server returns a full list (no updatedAfter support), it replaces entirely.
   * If only partial, it merges by id.
   */
  function mergeById<T extends { id: string }>(prev: T[], incoming: T[]): T[] {
    const map = new Map(prev.map(x => [x.id, x]));
    for (const item of incoming) map.set(item.id, item);
    return Array.from(map.values());
  }

  // ── Refresh helpers (with incremental sync support) ──
  const refreshPlans = useCallback(async () => { setPlans(normalizeDecimals(await api.plans.list() as PlanOrder[])); markFetched('plans'); }, []);
  const refreshOrders = useCallback(async () => {
    const ts = lastFetchTs.current['orders'];
    const data = normalizeDecimals(await api.orders.list(ts ? { updatedAfter: ts } : undefined) as ProductionOrder[]);
    setOrders(prev => ts ? mergeById(prev, data) : data);
    markFetched('orders');
  }, []);
  const refreshProducts = useCallback(async () => { setProducts(normalizeDecimals(await api.products.list() as Product[])); markFetched('products'); }, []);
  const refreshBoms = useCallback(async () => setBoms(normalizeDecimals(await api.boms.list() as BOM[])), []);
  /** 生产记录列表接口始终返回全量；mergeById 无法剔除服务端已删行，会导致编辑协作回传等删旧建新后界面仍显示旧数量 */
  const refreshProdRecords = useCallback(async () => {
    const data = normalizeDecimals(await api.production.list() as ProductionOpRecord[]);
    setProdRecords(data);
    markFetched('prodRecords');
  }, []);
  /** 进销存列表接口当前始终返回全量；mergeById 无法剔除服务端已删行，替换单据（删旧建新）后若再 merge 会残留旧行，列表合计与编辑首行数量会不一致 */
  const refreshPsiRecords = useCallback(async () => {
    const data = normalizeDecimals(await api.psi.list() as any[]);
    setPsiRecords(data);
    markFetched('psiRecords');
  }, []);
  const refreshFinanceRecords = useCallback(async () => {
    const ts = lastFetchTs.current['financeRecords'];
    const data = normalizeDecimals(await api.finance.list(ts ? { updatedAfter: ts } : undefined) as FinanceRecord[]);
    setFinanceRecords(prev => ts ? mergeById(prev, data) : data);
    markFetched('financeRecords');
  }, []);
  const refreshPMP = useCallback(async () => setProductMilestoneProgresses(normalizeDecimals(await api.orders.listProductProgress() as ProductMilestoneProgress[])), []);
  const refreshCategories = useCallback(async () => setCategories(await api.settings.categories.list() as ProductCategory[]), []);
  const refreshPartnerCategories = useCallback(async () => setPartnerCategories(await api.settings.partnerCategories.list() as PartnerCategory[]), []);
  const refreshGlobalNodes = useCallback(async () => setGlobalNodes(await api.settings.nodes.list() as GlobalNodeTemplate[]), []);
  const refreshWarehouses = useCallback(async () => setWarehouses(await api.settings.warehouses.list() as Warehouse[]), []);
  const refreshFinanceCategories = useCallback(async () => setFinanceCategories(await api.settings.financeCategories.list() as FinanceCategory[]), []);
  const refreshFinanceAccountTypes = useCallback(async () => setFinanceAccountTypes(await api.settings.financeAccountTypes.list() as FinanceAccountType[]), []);
  const refreshPartners = useCallback(async () => setPartners(normalizePartnersFromApi(await api.partners.list() as any[]) as any[]), []);
  const refreshWorkers = useCallback(async () => setWorkers(await api.tenants.getReportableMembers(tenantCtx!.tenantId) as any[]), [tenantCtx?.tenantId]);
  const refreshEquipment = useCallback(async () => setEquipment(await api.equipment.list() as any[]), []);
  const refreshDictionaries = useCallback(async () => setDictionaries(await api.dictionaries.list() as AppDictionaries), []);
  const refreshPrintTemplates = useCallback(async () => {
    try {
      const cfg = (await api.settings.getConfig()) as Record<string, unknown>;
      setPrintTemplates(
        ensureBuiltinSalesBillPrintTemplate(Array.isArray(cfg.printTemplates) ? (cfg.printTemplates as PrintTemplate[]) : []),
      );
    } catch (err: any) {
      toast.error(err?.message || '打印模版刷新失败');
    }
  }, []);

  useEffect(() => {
    return subscribePrintTemplatesChanged(fromTabId => {
      if (fromTabId === printTemplatesCrossTabIdRef.current) return;
      void refreshPrintTemplates();
    });
  }, [refreshPrintTemplates]);

  // ── Config update handlers ──
  const onUpdateProductionLinkMode = useCallback(async (mode: ProductionLinkMode) => { await api.settings.updateConfig('productionLinkMode', mode); setProductionLinkMode(mode); }, []);
  const onUpdateProcessSequenceMode = useCallback(async (mode: ProcessSequenceMode) => { await api.settings.updateConfig('processSequenceMode', mode); setProcessSequenceMode(mode); }, []);
  const onUpdateAllowExceedMaxReportQty = useCallback(async (value: boolean) => { await api.settings.updateConfig('allowExceedMaxReportQty', value); setAllowExceedMaxReportQty(value); }, []);
  /**
   * 统一的 *FormSettings 保存 handler：
   * normalize → api.settings.updateConfig(key, next) → setter(next)。
   *
   * 9 套 FormSettings 保存路径完全一致；抽 factory 避免重复。
   * 不使用 useCallback：函数每渲染生成一次是可以接受的（调用方 Modal 不做 memo 级优化），
   * 且原 useCallback 的 deps=[] 已假定 setter 与 normalize 稳定（setter 来自 useState，稳定；
   * normalize 是模块级函数，稳定）；identity 不稳定的唯一成本是 Modal 重渲染一次——相比代码重复收益更高。
   *
   * 错误处理契约：
   * - api.settings.updateConfig 失败时（services/api.ts:182-185 在非 2xx 时 throw），
   *   不调用 setter，避免前端 state 与后端不一致；错误原样向上抛给调用方
   *   （BusinessFormConfigModal.handleSave 接住后弹 toast）。
   */
  const makeFormSettingsSaver = <T,>(
    key: string,
    normalize: (v: T) => T,
    setter: React.Dispatch<React.SetStateAction<T>>,
  ) => async (v: T) => {
    const next = normalize(v);
    await api.settings.updateConfig(key, next);
    setter(next);
  };
  const onUpdatePlanFormSettings = useCallback(
    makeFormSettingsSaver('planFormSettings', normalizePlanFormSettings, setPlanFormSettings),
    [],
  );
  const onUpdateOrderFormSettings = useCallback(
    makeFormSettingsSaver('orderFormSettings', normalizeOrderFormSettings, setOrderFormSettings),
    [],
  );
  const onUpdatePurchaseOrderFormSettings = useCallback(
    makeFormSettingsSaver('purchaseOrderFormSettings', normalizePurchaseOrderFormSettings, setPurchaseOrderFormSettings),
    [],
  );
  const onUpdateSalesOrderFormSettings = useCallback(
    makeFormSettingsSaver('salesOrderFormSettings', normalizeSalesOrderFormSettings, setSalesOrderFormSettings),
    [],
  );
  const onUpdatePurchaseBillFormSettings = useCallback(
    makeFormSettingsSaver('purchaseBillFormSettings', normalizePurchaseBillFormSettings, setPurchaseBillFormSettings),
    [],
  );
  const onUpdateSalesBillFormSettings = useCallback(
    makeFormSettingsSaver('salesBillFormSettings', normalizeSalesBillFormSettings, setSalesBillFormSettings),
    [],
  );
  const onUpdateReceiptFormSettings = useCallback(
    makeFormSettingsSaver('receiptFormSettings', normalizeReceiptFormSettings, setReceiptFormSettings),
    [],
  );
  const onUpdatePaymentFormSettings = useCallback(
    makeFormSettingsSaver('paymentFormSettings', normalizePaymentFormSettings, setPaymentFormSettings),
    [],
  );
  const onUpdateMaterialFormSettings = useCallback(
    makeFormSettingsSaver('materialFormSettings', normalizeMaterialFormSettings, setMaterialFormSettings),
    [],
  );
  const onUpdateOutsourceFormSettings = useCallback(
    makeFormSettingsSaver('outsourceFormSettings', normalizeOutsourceFormSettings, setOutsourceFormSettings),
    [],
  );
  const onUpdateReworkFormSettings = useCallback(
    makeFormSettingsSaver('reworkFormSettings', normalizeReworkFormSettings, setReworkFormSettings),
    [],
  );
  // MaterialPanelSettings 无 normalize；保留 inline 形式
  const onUpdateMaterialPanelSettings = useCallback(async (v: MaterialPanelSettings) => {
    await api.settings.updateConfig('materialPanelSettings', v);
    setMaterialPanelSettings(v);
  }, []);
  const onUpdatePrintTemplates = useCallback(async (v: PrintTemplate[]) => {
    await api.settings.updateConfig('printTemplates', v);
    setPrintTemplates(v);
    broadcastPrintTemplatesSaved(printTemplatesCrossTabIdRef.current);
  }, []);

  // ── Helpers: normalize a single record ──
  const norm1 = <T,>(item: T): T => normalizeDecimals([item])[0];

  // ── Product / BOM handlers ──
  const onUpdateProduct = useCallback(async (p: Product): Promise<Product | null> => {
    try {
      const exists = products.some(px => px.id === p.id);
      const saved = (exists ? await api.products.update(p.id, p) : await api.products.create(p)) as Product;
      const normalized = norm1(saved);
      setProducts(prev => exists ? prev.map(px => px.id === p.id ? normalized : px) : [...prev, normalized]);
      // 工序变更会触发后端回填工单 milestones / 状态；后台刷新，不阻塞调用方
      void Promise.allSettled([refreshOrders(), refreshPMP()]);
      return normalized;
    } catch (err: any) {
      toast.error(err.message || '操作失败');
      return null;
    }
  }, [products, refreshOrders, refreshPMP]);

  const onDeleteProduct = useCallback(async (id: string): Promise<boolean> => {
    try {
      await api.products.delete(id);
      setProducts(prev => prev.filter(px => px.id !== id));
      void Promise.allSettled([refreshBoms(), refreshOrders(), refreshPMP()]);
      toast.success('已删除产品');
      return true;
    } catch (err: any) {
      toast.error(err.message || '删除失败');
      return false;
    }
  }, [refreshBoms, refreshOrders, refreshPMP]);

  const onUpdateBOM = useCallback(async (b: BOM): Promise<boolean> => {
    try {
      const exists = boms.some(bx => bx.id === b.id);
      const saved = (exists ? await api.boms.update(b.id, b) : await api.boms.create(b)) as BOM;
      const normalized = norm1(saved);
      setBoms(prev => exists ? prev.map(bx => bx.id === b.id ? normalized : bx) : [...prev, normalized]);
      return true;
    } catch (err: any) {
      toast.error(err.message || '操作失败');
      return false;
    }
  }, [boms]);

  // ── Plan handlers ──
  const onCreatePlan = useCallback(async (p: PlanOrder) => {
    try {
      const created = await api.plans.create(p) as PlanOrder;
      setPlans(prev => [...prev, norm1(created)]);
    } catch (err: any) { toast.error(err.message || '创建计划失败'); }
  }, []);

  const onUpdatePlan = useCallback(async (id: string, updates: Partial<PlanOrder>) => {
    try {
      const updated = await api.plans.update(id, updates) as PlanOrder;
      setPlans(prev => prev.map(p => p.id === id ? norm1(updated) : p));
    } catch (err: any) { toast.error(err.message || '更新计划失败'); }
  }, []);

  const onSplitPlan = useCallback(async (planId: string, newPlans: PlanOrder[]) => {
    try {
      await api.plans.split(planId, { newPlans: newPlans.map(p => ({ items: p.items })) });
      await refreshPlans();
    } catch (err: any) { toast.error(err.message || '拆分失败'); }
  }, [refreshPlans]);

  const onDeletePlan = useCallback(async (id: string) => {
    try { await api.plans.delete(id); setPlans(prev => prev.filter(p => p.id !== id)); }
    catch (err: any) { toast.error(err.message || '删除计划失败'); }
  }, []);

  const onConvertToOrder = useCallback(async (id: string) => {
    try { await api.plans.convert(id); await Promise.allSettled([refreshPlans(), refreshOrders()]); }
    catch (err: any) { toast.error(err.message || '下达工单失败'); }
  }, [refreshPlans, refreshOrders]);

  const onCreateSubPlan = useCallback(async ({ productId, quantity, planId, bomNodeId }: { productId: string; quantity: number; planId: string; bomNodeId?: string }) => {
    try { await api.plans.createSubPlans(planId, [{ productId, bomNodeId, items: [{ quantity }] }]); await refreshPlans(); }
    catch (err: any) { toast.error(err.message || '创建子计划失败'); }
  }, [refreshPlans]);

  const onCreateSubPlans = useCallback(async ({ planId, items }: { planId: string; items: Array<{ productId: string; quantity: number; bomNodeId?: string; parentProductId?: string; parentNodeId?: string }> }) => {
    try {
      const subPlans = items.map(i => ({ productId: i.productId, bomNodeId: i.bomNodeId, items: [{ quantity: i.quantity }] }));
      await api.plans.createSubPlans(planId, subPlans);
      await refreshPlans();
    } catch (err: any) { toast.error(err.message || '创建子计划失败'); }
  }, [refreshPlans]);

  // ── Order / report handlers ──
  const onReportSubmit = useCallback(async (oId: string, mId: string, qty: number, data: Record<string, any> | null, vId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string, weight?: number) => {
    try {
      const operatorName = workerId ? (workers.find((w: any) => w.id === workerId)?.name ?? '未知') : currentOperatorDisplayName(currentUser);
      const order = orders.find(o => o.id === oId);
      const rate = products.find(p => p.id === order?.productId)?.nodeRates?.[order?.milestones.find(m => m.id === mId)?.templateId ?? ''];
      await api.orders.createReport(oId, mId, {
        quantity: qty, operator: operatorName, defectiveQuantity: defectiveQty || 0,
        variantId: vId, workerId, equipmentId, reportBatchId, reportNo,
        customData: data ?? {}, rate: rate != null ? rate : undefined,
        weight,
      });
      const updated = await api.orders.get(oId) as ProductionOrder;
      setOrders(prev => prev.map(o => o.id === oId ? norm1(updated) : o));
      void refreshProdRecords();
    } catch (err: any) { toast.error(err.message || '报工失败'); }
  }, [workers, currentUser, orders, products, refreshProdRecords]);

  const onReportSubmitProduct = useCallback(async (productId: string, milestoneTemplateId: string, qty: number, data: Record<string, any> | null, vId?: string, workerId?: string, defectiveQty?: number, equipmentId?: string, reportBatchId?: string, reportNo?: string, weight?: number) => {
    try {
      const operatorName = workerId ? (workers.find((w: any) => w.id === workerId)?.name ?? '未知') : currentOperatorDisplayName(currentUser);
      const rate = products.find(p => p.id === productId)?.nodeRates?.[milestoneTemplateId];
      await api.orders.createProductReport({
        productId, milestoneTemplateId, quantity: qty, operator: operatorName,
        defectiveQuantity: defectiveQty || 0, variantId: vId, workerId, equipmentId,
        reportBatchId, reportNo, customData: data ?? {}, rate: rate != null ? rate : undefined,
        weight,
      });
      await refreshPMP();
      void refreshProdRecords();
    } catch (err: any) { toast.error(err.message || '报工失败'); }
  }, [workers, currentUser, products, refreshPMP, refreshProdRecords]);

  const onUpdateReport = useCallback(async ({ orderId, milestoneId, reportId, quantity, defectiveQuantity, timestamp, operator, newMilestoneId, customData }: { orderId: string; milestoneId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string; newMilestoneId?: string; customData?: Record<string, unknown> }) => {
    try {
      const targetMilestoneId = newMilestoneId || milestoneId;
      const finalCustomData = customData ?? {};
      const payload = { quantity, defectiveQuantity: defectiveQuantity || 0, timestamp, operator, customData: finalCustomData };
      if (targetMilestoneId !== milestoneId) {
        await api.orders.deleteReport(orderId, milestoneId, reportId);
        await api.orders.createReport(orderId, targetMilestoneId, payload);
      } else {
        await api.orders.updateReport(orderId, milestoneId, reportId, payload);
      }
      const updated = await api.orders.get(orderId) as ProductionOrder;
      setOrders(prev => prev.map(o => o.id === orderId ? norm1(updated) : o));
    } catch (err: any) { toast.error(err.message || '更新报工失败'); }
  }, []);

  const onDeleteReport = useCallback(async ({ orderId, milestoneId, reportId }: { orderId: string; milestoneId: string; reportId: string }) => {
    try {
      await api.orders.deleteReport(orderId, milestoneId, reportId);
      const updated = await api.orders.get(orderId) as ProductionOrder;
      setOrders(prev => prev.map(o => o.id === orderId ? norm1(updated) : o));
    } catch (err: any) { toast.error(err.message || '删除报工失败'); }
  }, []);

  const onUpdateReportProduct = useCallback(async ({ progressId, reportId, quantity, defectiveQuantity, timestamp, operator, newMilestoneTemplateId, customData }: { progressId: string; reportId: string; quantity: number; defectiveQuantity?: number; timestamp?: string; operator?: string; newMilestoneTemplateId?: string; customData?: Record<string, unknown> }) => {
    try {
      const finalCustomData = customData ?? {};
      const payload = { quantity, defectiveQuantity: defectiveQuantity || 0, timestamp, operator, customData: finalCustomData };
      if (newMilestoneTemplateId) {
        const srcProgress = productMilestoneProgresses.find(p => p.id === progressId);
        if (!srcProgress) { toast.error('找不到源进度记录'); return; }
        await api.orders.deleteProductReport(reportId);
        await api.orders.createProductReport({
          productId: srcProgress.productId, variantId: srcProgress.variantId,
          milestoneTemplateId: newMilestoneTemplateId,
          ...payload,
        });
      } else {
        await api.orders.updateProductReport(reportId, payload);
      }
      await refreshPMP();
    } catch (err: any) { toast.error(err.message || '更新报工失败'); }
  }, [productMilestoneProgresses, refreshPMP]);

  const onDeleteReportProduct = useCallback(async ({ progressId, reportId }: { progressId: string; reportId: string }) => {
    try { await api.orders.deleteProductReport(reportId); await refreshPMP(); }
    catch (err: any) { toast.error(err.message || '删除报工失败'); }
  }, [refreshPMP]);

  const onUpdateOrder = useCallback(async (orderId: string, updates: Partial<ProductionOrder>) => {
    try {
      const updated = await api.orders.update(orderId, updates) as ProductionOrder;
      setOrders(prev => prev.map(o => o.id === orderId ? norm1(updated) : o));
    } catch (err: any) { toast.error(err.message || '更新工单失败'); }
  }, []);

  const onDeleteOrder = useCallback(async (orderId: string) => {
    try { await api.orders.delete(orderId); setOrders(prev => prev.filter(o => o.id !== orderId)); }
    catch (err: any) { toast.error(err.message || '删除工单失败'); }
  }, []);

  // ── Production record handlers ──
  const onAddProdRecord = useCallback(async (record: ProductionOpRecord) => {
    try {
      const created = await api.production.create(record) as ProductionOpRecord;
      setProdRecords(prev => [...prev, norm1(created)]);
      void Promise.allSettled([refreshOrders(), refreshPMP()]);
    } catch (err: any) { toast.error(err.message || '添加记录失败'); }
  }, [refreshOrders, refreshPMP]);

  const onAddProdRecordBatch = useCallback(async (records: ProductionOpRecord[]) => {
    try {
      const created: ProductionOpRecord[] = [];
      for (const record of records) created.push(await api.production.create(record) as ProductionOpRecord);
      setProdRecords(prev => [...prev, ...normalizeDecimals(created)]);
      void Promise.allSettled([refreshOrders(), refreshPMP()]);
    } catch (err: any) { toast.error(err.message || '批量添加记录失败'); }
  }, [refreshOrders, refreshPMP]);

  const onUpdateProdRecord = useCallback(async (r: ProductionOpRecord) => {
    try {
      const updated = await api.production.update(r.id, r) as ProductionOpRecord;
      setProdRecords(prev => prev.map(x => x.id === r.id ? norm1(updated) : x));
    } catch (err: any) { toast.error(err.message || '更新记录失败'); }
  }, []);

  const onDeleteProdRecord = useCallback(async (id: string) => {
    try { await api.production.delete(id); setProdRecords(prev => prev.filter(x => x.id !== id)); }
    catch (err: any) { toast.error(err.message || '删除记录失败'); }
  }, []);

  // ── PSI record handlers ──
  const onAddPSIRecord = useCallback(async (record: any) => {
    try {
      const created = await api.psi.create(record);
      setPsiRecords(prev => [...prev, ...normalizeDecimals([created])]);
    } catch (err: any) {
      toast.error(err.message || '添加记录失败');
      throw err;
    }
  }, []);

  const onAddPSIRecordBatch = useCallback(async (records: any[]) => {
    try {
      await api.psi.createBatch(records);
      await refreshPsiRecords();
    } catch (err: any) {
      toast.error(err.message || '批量添加记录失败');
      throw err;
    }
  }, [refreshPsiRecords]);

  const onReplacePSIRecords = useCallback(async (type: string, docNumber: string, newRecords: any[]) => {
    try {
      const deleteIds = psiRecords.filter(r => r.type === type && r.docNumber === docNumber).map(r => r.id);
      await api.psi.replace(deleteIds, newRecords);
      await refreshPsiRecords();
    } catch (err: any) { toast.error(err.message || '替换记录失败'); }
  }, [psiRecords, refreshPsiRecords]);

  const onDeletePSIRecords = useCallback(async (type: string, docNumber: string) => {
    try {
      const ids = psiRecords.filter(r => r.type === type && r.docNumber === docNumber).map(r => r.id);
      if (ids.length) await api.psi.deleteBatch(ids);
      const idSet = new Set(ids);
      setPsiRecords(prev => prev.filter(r => !idSet.has(r.id)));
    } catch (err: any) { toast.error(err.message || '删除记录失败'); }
  }, [psiRecords]);

  // ── Finance record handlers ──
  const onAddFinanceRecord = useCallback(async (r: FinanceRecord) => {
    try {
      const created = await api.finance.create(r) as FinanceRecord;
      setFinanceRecords(prev => [...prev, norm1(created)]);
    } catch (err: any) { toast.error(err.message || '添加记录失败'); }
  }, []);

  const onUpdateFinanceRecord = useCallback(async (r: FinanceRecord) => {
    try {
      const updated = await api.finance.update(r.id, r) as FinanceRecord;
      setFinanceRecords(prev => prev.map(x => x.id === r.id ? norm1(updated) : x));
    } catch (err: any) { toast.error(err.message || '更新记录失败'); }
  }, []);

  const onDeleteFinanceRecord = useCallback(async (id: string) => {
    try { await api.finance.delete(id); setFinanceRecords(prev => prev.filter(x => x.id !== id)); }
    catch (err: any) { toast.error(err.message || '删除记录失败'); }
  }, []);

  // ── Domain-specific memoized values ──

  const masterDataValue: MasterDataState = useMemo(() => ({
    categories, partnerCategories, dictionaries, globalNodes,
    partners, workers, equipment, warehouses, products, boms,
  }), [categories, partnerCategories, dictionaries, globalNodes, partners, workers, equipment, warehouses, products, boms]);

  const configValue: ConfigState = useMemo(() => ({
    productionLinkMode, processSequenceMode, allowExceedMaxReportQty,
    planFormSettings, orderFormSettings, purchaseOrderFormSettings, salesOrderFormSettings, purchaseBillFormSettings, salesBillFormSettings,
    receiptFormSettings, paymentFormSettings,
    materialPanelSettings, materialFormSettings, outsourceFormSettings, reworkFormSettings, printTemplates,
  }), [productionLinkMode, processSequenceMode, allowExceedMaxReportQty, planFormSettings, orderFormSettings, purchaseOrderFormSettings, salesOrderFormSettings, purchaseBillFormSettings, salesBillFormSettings, receiptFormSettings, paymentFormSettings, materialPanelSettings, materialFormSettings, outsourceFormSettings, reworkFormSettings, printTemplates]);

  const ordersValue: OrdersState = useMemo(() => ({
    orders, plans, productMilestoneProgresses, prodRecords,
  }), [orders, plans, productMilestoneProgresses, prodRecords]);

  const psiValue: PsiState = useMemo(() => ({ psiRecords }), [psiRecords]);

  const financeValue: FinanceState = useMemo(() => ({
    financeRecords, financeCategories, financeAccountTypes,
  }), [financeRecords, financeCategories, financeAccountTypes]);

  const actionsValue: AppDataActions = useMemo(() => ({
    onUpdateProductionLinkMode, onUpdateProcessSequenceMode, onUpdateAllowExceedMaxReportQty,
    onUpdatePlanFormSettings, onUpdateOrderFormSettings,
    onUpdatePurchaseOrderFormSettings, onUpdateSalesOrderFormSettings,
    onUpdatePurchaseBillFormSettings, onUpdateSalesBillFormSettings,
    onUpdateReceiptFormSettings, onUpdatePaymentFormSettings,
    onUpdateMaterialPanelSettings, onUpdateMaterialFormSettings, onUpdateOutsourceFormSettings, onUpdateReworkFormSettings, onUpdatePrintTemplates,
    onUpdateProduct, onDeleteProduct, onUpdateBOM,
    onCreatePlan, onUpdatePlan, onSplitPlan, onDeletePlan, onConvertToOrder,
    onCreateSubPlan, onCreateSubPlans,
    onReportSubmit, onReportSubmitProduct,
    onUpdateReport, onDeleteReport, onUpdateReportProduct, onDeleteReportProduct,
    onUpdateOrder, onDeleteOrder,
    onAddProdRecord, onAddProdRecordBatch, onUpdateProdRecord, onDeleteProdRecord,
    onAddPSIRecord, onAddPSIRecordBatch, onReplacePSIRecords, onDeletePSIRecords,
    onAddFinanceRecord, onUpdateFinanceRecord, onDeleteFinanceRecord,
    refreshDictionaries, refreshWorkers, refreshEquipment, refreshPartners,
    refreshPartnerCategories, refreshCategories, refreshGlobalNodes, refreshWarehouses,
    refreshFinanceCategories, refreshFinanceAccountTypes,
    refreshProducts, refreshOrders, refreshProdRecords, refreshPMP,
    refreshPrintTemplates,
    ensureDeferredLoaded,
  }), [
    onUpdateProductionLinkMode, onUpdateProcessSequenceMode, onUpdateAllowExceedMaxReportQty,
    onUpdatePlanFormSettings, onUpdateOrderFormSettings,
    onUpdatePurchaseOrderFormSettings, onUpdateSalesOrderFormSettings,
    onUpdatePurchaseBillFormSettings, onUpdateSalesBillFormSettings,
    onUpdateReceiptFormSettings, onUpdatePaymentFormSettings,
    onUpdateMaterialPanelSettings, onUpdateMaterialFormSettings, onUpdateOutsourceFormSettings, onUpdateReworkFormSettings, onUpdatePrintTemplates,
    onUpdateProduct, onDeleteProduct, onUpdateBOM,
    onCreatePlan, onUpdatePlan, onSplitPlan, onDeletePlan, onConvertToOrder,
    onCreateSubPlan, onCreateSubPlans,
    onReportSubmit, onReportSubmitProduct,
    onUpdateReport, onDeleteReport, onUpdateReportProduct, onDeleteReportProduct,
    onUpdateOrder, onDeleteOrder,
    onAddProdRecord, onAddProdRecordBatch, onUpdateProdRecord, onDeleteProdRecord,
    onAddPSIRecord, onAddPSIRecordBatch, onReplacePSIRecords, onDeletePSIRecords,
    onAddFinanceRecord, onUpdateFinanceRecord, onDeleteFinanceRecord,
    refreshDictionaries, refreshWorkers, refreshEquipment, refreshPartners,
    refreshPartnerCategories, refreshCategories, refreshGlobalNodes, refreshWarehouses,
    refreshFinanceCategories, refreshFinanceAccountTypes,
    refreshProducts, refreshOrders, refreshProdRecords, refreshPMP,
    refreshPrintTemplates,
    ensureDeferredLoaded,
  ]);

  return (
    <LoadingCtx.Provider value={dataLoading}>
    <MasterDataCtx.Provider value={masterDataValue}>
    <ConfigCtx.Provider value={configValue}>
    <OrdersCtx.Provider value={ordersValue}>
    <PsiCtx.Provider value={psiValue}>
    <FinanceCtx.Provider value={financeValue}>
    <ActionsCtx.Provider value={actionsValue}>
      {children}
    </ActionsCtx.Provider>
    </FinanceCtx.Provider>
    </PsiCtx.Provider>
    </OrdersCtx.Provider>
    </ConfigCtx.Provider>
    </MasterDataCtx.Provider>
    </LoadingCtx.Provider>
  );
}

// ── Domain-specific hooks (fine-grained subscriptions) ──

export function useDataLoading(): boolean {
  return useContext(LoadingCtx);
}

export function useMasterData(): MasterDataState {
  const ctx = useContext(MasterDataCtx);
  if (!ctx) throw new Error('useMasterData must be used within AppDataProvider');
  return ctx;
}

export function useConfigData(): ConfigState {
  const ctx = useContext(ConfigCtx);
  if (!ctx) throw new Error('useConfigData must be used within AppDataProvider');
  return ctx;
}

export function useOrdersData(): OrdersState {
  const ctx = useContext(OrdersCtx);
  if (!ctx) throw new Error('useOrdersData must be used within AppDataProvider');
  return ctx;
}

export function usePsiData(): PsiState {
  const ctx = useContext(PsiCtx);
  if (!ctx) throw new Error('usePsiData must be used within AppDataProvider');
  return ctx;
}

export function useFinanceData(): FinanceState {
  const ctx = useContext(FinanceCtx);
  if (!ctx) throw new Error('useFinanceData must be used within AppDataProvider');
  return ctx;
}

export function useAppActions(): AppDataActions {
  const ctx = useContext(ActionsCtx);
  if (!ctx) throw new Error('useAppActions must be used within AppDataProvider');
  return ctx;
}

/** 无 Provider 时返回 null，避免在独立渲染/测试环境下崩溃。 */
export function useAppActionsOptional(): AppDataActions | null {
  return useContext(ActionsCtx);
}

// ── Backward-compatible aggregate hooks ──

export function useAppData(): AppDataContextValue {
  const loading = useDataLoading();
  const master = useMasterData();
  const config = useConfigData();
  const orders = useOrdersData();
  const psi = usePsiData();
  const finance = useFinanceData();
  const actions = useAppActions();
  return useMemo(() => ({
    dataLoading: loading,
    ...master, ...config, ...orders, ...psi, ...finance, ...actions,
  }), [loading, master, config, orders, psi, finance, actions]);
}

export function useAppDataState(): AppDataState {
  const loading = useDataLoading();
  const master = useMasterData();
  const config = useConfigData();
  const orders = useOrdersData();
  const psi = usePsiData();
  const finance = useFinanceData();
  return useMemo(() => ({
    dataLoading: loading,
    ...master, ...config, ...orders, ...psi, ...finance,
  }), [loading, master, config, orders, psi, finance]);
}
