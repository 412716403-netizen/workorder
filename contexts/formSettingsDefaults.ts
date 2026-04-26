/**
 * 表单默认配置与归一化（从 AppDataContext 拆出，避免 Context 文件过大）。
 * 业务组件可继续从 AppDataContext re-export 导入，或直接从本文件导入。
 */
import type {
  PlanFormSettings,
  OrderFormSettings,
  PlanListPrintSettings,
  PurchaseOrderFormSettings,
  SalesOrderFormSettings,
  PurchaseBillFormSettings,
  SalesBillFormSettings,
  ReceiptFormSettings,
  PaymentFormSettings,
  MaterialFormSettings,
  OutsourceFormSettings,
  ReworkFormSettings,
} from '../types';
import {
  DEFAULT_MATERIAL_FORM_SETTINGS,
  DEFAULT_OUTSOURCE_FORM_SETTINGS,
  DEFAULT_REWORK_FORM_SETTINGS,
} from '../types';
import { normalizePlanFormFieldConfigArray } from '../utils/planFormCustomField';

// ── Decimal normalizer ──

const DECIMAL_KEYS = new Set([
  'quantity', 'purchasePrice', 'salesPrice', 'amount', 'actualQuantity',
  'systemQuantity', 'diffQuantity', 'unitPrice', 'taxRate', 'taxAmount',
  'totalAmount', 'completedQuantity', 'defectiveQuantity', 'weight', 'rate',
  'allocatedQuantity', 'shippedQuantity',
]);

export function normalizeDecimals<T>(arr: T[]): T[] {
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
    { id: 'createdAt', label: '创建时间', showInList: true, showInCreate: false, showInDetail: true },
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
    standardFields: mergePlanStandardFields(s.standardFields).filter(f => f.id !== 'dueDate'),
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
    showPartnerFlowDetailOnList: s.showPartnerFlowDetailOnList === true,
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

/** 采购订单已废弃的标准字段 id（历史配置中可能仍存在，加载时剔除） */
const DEPRECATED_PURCHASE_ORDER_STANDARD_FIELD_IDS = new Set(['dueDate', 'createdAt', 'note']);

export const DEFAULT_PURCHASE_ORDER_FORM_SETTINGS: PurchaseOrderFormSettings = {
  standardFields: [
    { id: 'docNumber', label: '单据编号', showInList: true, showInCreate: false, showInDetail: true },
    { id: 'partner', label: '供应商', showInList: true, showInCreate: true, showInDetail: true },
  ],
  customFields: [],
  listPrint: { showPrintButton: true },
  relatedProductEnabled: false,
};

function mergePurchaseOrderStandardFields(
  saved: PurchaseOrderFormSettings['standardFields'] | undefined,
): PurchaseOrderFormSettings['standardFields'] {
  const defs = DEFAULT_PURCHASE_ORDER_FORM_SETTINGS.standardFields;
  const arr = (saved ?? []).filter(
    f => !DEPRECATED_PURCHASE_ORDER_STANDARD_FIELD_IDS.has(f.id) && f.id !== 'relatedProduct',
  );
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
  const listDisplay: PurchaseOrderFormSettings['listDisplay'] = s.listDisplay?.onlyShowUnsettled
    ? { onlyShowUnsettled: true }
    : undefined;

  const legacyRelated = (s.standardFields ?? []).find(f => f.id === 'relatedProduct');
  const relatedProductEnabled =
    typeof s.relatedProductEnabled === 'boolean'
      ? s.relatedProductEnabled
      : !!legacyRelated &&
        (legacyRelated.showInList || legacyRelated.showInCreate || legacyRelated.showInDetail);

  return {
    standardFields: mergePurchaseOrderStandardFields(s.standardFields),
    customFields: normalizePlanFormFieldConfigArray(s.customFields),
    listPrint,
    listDisplay,
    relatedProductEnabled,
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
  const soListDisplay: SalesOrderFormSettings['listDisplay'] = s.listDisplay?.onlyShowNotFullyShipped
    ? { onlyShowNotFullyShipped: true }
    : undefined;

  return {
    standardFields: mergeSalesOrderStandardFields(s.standardFields),
    customFields: normalizePlanFormFieldConfigArray(s.customFields),
    listPrint,
    listDisplay: soListDisplay,
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
  relatedProductEnabled: false,
};

function mergePurchaseBillStandardFields(
  saved: PurchaseBillFormSettings['standardFields'] | undefined,
): PurchaseBillFormSettings['standardFields'] {
  const defs = DEFAULT_PURCHASE_BILL_FORM_SETTINGS.standardFields;
  const arr = (saved ?? []).filter(
    f => !DEPRECATED_PURCHASE_BILL_STANDARD_FIELD_IDS.has(f.id) && f.id !== 'relatedProduct',
  );
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
  const legacyRelated = (s.standardFields ?? []).find(f => f.id === 'relatedProduct');
  const relatedProductEnabled =
    typeof s.relatedProductEnabled === 'boolean'
      ? s.relatedProductEnabled
      : !!legacyRelated &&
        (legacyRelated.showInList || legacyRelated.showInCreate || legacyRelated.showInDetail);
  return {
    standardFields: mergePurchaseBillStandardFields(s.standardFields),
    customFields: normalizePlanFormFieldConfigArray(s.customFields),
    listPrint,
    relatedProductEnabled,
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
