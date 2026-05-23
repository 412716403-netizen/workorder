import { describe, it, expect } from 'vitest';
import {
  normalizeDecimals,
  normalizePlanFormSettings,
  repairPlanLabelPrintWhitelistMissingPlanLabelTemplates,
  normalizeMaterialFormSettings,
  normalizeOutsourceFormSettings,
  normalizeReworkFormSettings,
  normalizePurchaseOrderFormSettings,
  normalizePurchaseBillFormSettings,
  normalizeSalesOrderFormSettings,
  normalizeSalesBillFormSettings,
} from './formSettingsDefaults';
import type { PrintTemplate } from '../types';
import {
  BUILTIN_MATERIAL_ISSUE_PRINT_TEMPLATE_ID,
  BUILTIN_MATERIAL_RETURN_PRINT_TEMPLATE_ID,
  BUILTIN_OUTSOURCE_MATERIAL_ISSUE_PRINT_TEMPLATE_ID,
  BUILTIN_OUTSOURCE_MATERIAL_RETURN_PRINT_TEMPLATE_ID,
  BUILTIN_REWORK_DEFECT_TREATMENT_PRINT_TEMPLATE_ID,
  BUILTIN_REWORK_REPORT_FLOW_PRINT_TEMPLATE_ID,
} from '../shared/systemPrintTemplates';

describe('normalizePlanFormSettings listDisplay', () => {
  it('defaults showDeliveryDate to false when unset', () => {
    const n = normalizePlanFormSettings({});
    expect(n.listDisplay?.showDeliveryDate).toBe(false);
  });

  it('preserves showDeliveryDate true when set', () => {
    const n = normalizePlanFormSettings({ listDisplay: { showDeliveryDate: true } });
    expect(n.listDisplay?.showDeliveryDate).toBe(true);
  });

  it('strips legacy standard field id dueDate from normalized standardFields', () => {
    const n = normalizePlanFormSettings({
      standardFields: [{ id: 'dueDate', label: '旧交期', showInList: true, showInCreate: false, showInDetail: true }],
    });
    expect(n.standardFields.some(f => f.id === 'dueDate')).toBe(false);
  });

  it('merges in totalQty standard field with list visible when saved config omits it', () => {
    const n = normalizePlanFormSettings({
      standardFields: [
        { id: 'planNumber', label: '计划单号', showInList: false, showInCreate: false, showInDetail: true },
        { id: 'product', label: '产品名称', showInList: true, showInCreate: false, showInDetail: true },
        { id: 'customer', label: '客户', showInList: false, showInCreate: false, showInDetail: false },
      ],
    });
    const totalQty = n.standardFields.find(f => f.id === 'totalQty');
    expect(totalQty).toBeDefined();
    expect(totalQty?.showInList).toBe(true);
  });

  it('merges in product standard field with list visible when saved config omits it', () => {
    const n = normalizePlanFormSettings({
      standardFields: [
        { id: 'planNumber', label: '计划单号', showInList: false, showInCreate: false, showInDetail: true },
        { id: 'customer', label: '客户', showInList: false, showInCreate: true, showInDetail: true },
        { id: 'createdAt', label: '创建时间', showInList: false, showInCreate: false, showInDetail: true },
      ],
    });
    const product = n.standardFields.find(f => f.id === 'product');
    expect(product).toBeDefined();
    expect(product?.showInList).toBe(true);
  });

  it('aligns customer visibility when not all show flags are true (matches 显示客户 toggle)', () => {
    const n = normalizePlanFormSettings({
      standardFields: [
        { id: 'customer', label: '客户', showInList: false, showInCreate: true, showInDetail: true },
      ],
    });
    const customer = n.standardFields.find(f => f.id === 'customer');
    expect(customer?.showInList).toBe(false);
    expect(customer?.showInCreate).toBe(false);
    expect(customer?.showInDetail).toBe(false);
  });

  it('keeps showPlanDetailTraceSection true when undefined (default visible)', () => {
    const n = normalizePlanFormSettings({
      labelPrint: { bulkQuickSplitBatchSize: 50 },
    });
    expect(n.labelPrint?.showPlanDetailTraceSection).toBe(true);
  });

  it('preserves showPlanDetailTraceSection false when explicitly disabled', () => {
    const n = normalizePlanFormSettings({
      labelPrint: { bulkQuickSplitBatchSize: 50, showPlanDetailTraceSection: false },
    });
    expect(n.labelPrint?.showPlanDetailTraceSection).toBe(false);
  });

  it('preserves customer visibility when all show flags are true', () => {
    const n = normalizePlanFormSettings({
      standardFields: [
        { id: 'customer', label: '客户', showInList: true, showInCreate: true, showInDetail: true },
      ],
    });
    const customer = n.standardFields.find(f => f.id === 'customer');
    expect(customer?.showInList).toBe(true);
    expect(customer?.showInCreate).toBe(true);
    expect(customer?.showInDetail).toBe(true);
  });

  it('normalizes bulkQuickSplitBatchSize to integer in range', () => {
    const n = normalizePlanFormSettings({
      labelPrint: { bulkQuickSplitBatchSize: 50.7, bulkQuickSplitWithItemCodes: true },
    });
    expect(n.labelPrint?.bulkQuickSplitBatchSize).toBe(50);
    expect(n.labelPrint?.bulkQuickSplitWithItemCodes).toBe(true);
  });

  it('drops bulkQuickSplitBatchSize when out of range or invalid', () => {
    expect(
      normalizePlanFormSettings({ labelPrint: { bulkQuickSplitBatchSize: 0 } }).labelPrint?.bulkQuickSplitBatchSize,
    ).toBeUndefined();
    expect(
      normalizePlanFormSettings({ labelPrint: { bulkQuickSplitBatchSize: 100_001 } }).labelPrint?.bulkQuickSplitBatchSize,
    ).toBeUndefined();
    expect(
      normalizePlanFormSettings({ labelPrint: { bulkQuickSplitBatchSize: Number.NaN } }).labelPrint?.bulkQuickSplitBatchSize,
    ).toBeUndefined();
  });

  it('defaults bulkQuickSplitWithItemCodes to true when unset', () => {
    const n = normalizePlanFormSettings({ labelPrint: { allowedTemplateIds: ['x'] } });
    expect(n.labelPrint?.bulkQuickSplitWithItemCodes).toBe(true);
  });

  it('preserves bulkQuickSplitWithItemCodes false when set', () => {
    const n = normalizePlanFormSettings({
      labelPrint: { bulkQuickSplitBatchSize: 10, bulkQuickSplitWithItemCodes: false },
    });
    expect(n.labelPrint?.bulkQuickSplitBatchSize).toBe(10);
    expect(n.labelPrint?.bulkQuickSplitWithItemCodes).toBe(false);
  });
});

describe('repairPlanLabelPrintWhitelistMissingPlanLabelTemplates', () => {
  const baseTpl = (id: string, scope: 'planList' | 'planLabel'): PrintTemplate => ({
    id,
    name: id,
    paperSize: { widthMm: 30, heightMm: 50 },
    elements: [],
    createdAt: '',
    updatedAt: '',
    documentType: 'plan',
    printTemplateManageScope: scope,
  });

  it('merges planLabel template ids when label whitelist only has planList template', () => {
    const planForm = normalizePlanFormSettings({
      labelPrint: {
        allowedTemplateIds: ['list-only'],
        showPlanDetailTraceSection: true,
      },
    });
    const templates = [baseTpl('list-only', 'planList'), baseTpl('lbl-1', 'planLabel'), baseTpl('lbl-2', 'planLabel')];
    const r = repairPlanLabelPrintWhitelistMissingPlanLabelTemplates(planForm, templates);
    expect(r.labelPrint?.allowedTemplateIds?.sort()).toEqual(['lbl-1', 'lbl-2', 'list-only'].sort());
  });

  it('does nothing when label whitelist already includes a planLabel template', () => {
    const planForm = normalizePlanFormSettings({
      labelPrint: { allowedTemplateIds: ['list-only', 'lbl-1'], showPlanDetailTraceSection: true },
    });
    const templates = [baseTpl('list-only', 'planList'), baseTpl('lbl-1', 'planLabel')];
    const r = repairPlanLabelPrintWhitelistMissingPlanLabelTemplates(planForm, templates);
    expect(r.labelPrint?.allowedTemplateIds).toEqual(['list-only', 'lbl-1']);
  });

  it('does nothing when whitelist references unknown template id', () => {
    const planForm = normalizePlanFormSettings({
      labelPrint: { allowedTemplateIds: ['ghost'], showPlanDetailTraceSection: true },
    });
    const templates = [baseTpl('lbl-1', 'planLabel')];
    const r = repairPlanLabelPrintWhitelistMissingPlanLabelTemplates(planForm, templates);
    expect(r.labelPrint?.allowedTemplateIds).toEqual(['ghost']);
  });
});

describe('normalizeDecimals', () => {
  it('converts string quantity to number', () => {
    const input = [{ quantity: '100', name: 'test' }];
    const result = normalizeDecimals(input);
    expect(result[0].quantity).toBe(100);
    expect(result[0].name).toBe('test');
  });

  it('converts string purchasePrice to number', () => {
    const input = [{ purchasePrice: '12.50' }];
    const result = normalizeDecimals(input);
    expect(result[0].purchasePrice).toBe(12.5);
  });

  it('converts non-numeric string to 0', () => {
    const input = [{ quantity: 'abc' }];
    const result = normalizeDecimals(input);
    expect(result[0].quantity).toBe(0);
  });

  it('leaves numeric values unchanged', () => {
    const input = [{ quantity: 42, salesPrice: 9.99 }];
    const result = normalizeDecimals(input);
    expect(result[0].quantity).toBe(42);
    expect(result[0].salesPrice).toBe(9.99);
  });

  it('leaves null/undefined values unchanged', () => {
    const input = [{ quantity: null, salesPrice: undefined }];
    const result = normalizeDecimals(input);
    expect(result[0].quantity).toBeNull();
    expect(result[0].salesPrice).toBeUndefined();
  });

  it('handles empty array', () => {
    expect(normalizeDecimals([])).toEqual([]);
  });

  it('normalizes nested items array', () => {
    const input = [{ items: [{ quantity: '50', unitPrice: '3.5' }] }];
    const result = normalizeDecimals(input);
    expect(result[0].items[0].quantity).toBe(50);
    expect(result[0].items[0].unitPrice).toBe(3.5);
  });

  it('does not affect non-decimal keys', () => {
    const input = [{ name: '123', productId: '456' }];
    const result = normalizeDecimals(input);
    expect(result[0].name).toBe('123');
    expect(result[0].productId).toBe('456');
  });
});

describe('normalizeMaterialFormSettings materialCenterPrint', () => {
  it('injects default slots without auto template whitelist', () => {
    const n = normalizeMaterialFormSettings({});
    expect(n.materialCenterPrint?.stockOutFlowDetail?.allowedTemplateIds).toBeUndefined();
    expect(n.materialCenterPrint?.stockReturnFlowDetail?.allowedTemplateIds).toBeUndefined();
    expect(n.materialCenterPrint?.outsourceStockOutFlowDetail?.allowedTemplateIds).toBeUndefined();
    expect(n.materialCenterPrint?.outsourceStockReturnFlowDetail?.allowedTemplateIds).toBeUndefined();
    expect(n.materialCenterPrint?.stockOutFlowDetail?.showPrintButton).toBe(false);
  });

  it('preserves builtin template ids when user explicitly whitelists them', () => {
    const n = normalizeMaterialFormSettings({
      materialCenterPrint: {
        stockOutFlowDetail: { allowedTemplateIds: [BUILTIN_MATERIAL_ISSUE_PRINT_TEMPLATE_ID, 'tenant-a'] },
        stockReturnFlowDetail: { allowedTemplateIds: [BUILTIN_MATERIAL_RETURN_PRINT_TEMPLATE_ID] },
        outsourceStockOutFlowDetail: {
          allowedTemplateIds: [BUILTIN_OUTSOURCE_MATERIAL_ISSUE_PRINT_TEMPLATE_ID, 'tenant-b'],
        },
        outsourceStockReturnFlowDetail: {
          allowedTemplateIds: [BUILTIN_OUTSOURCE_MATERIAL_RETURN_PRINT_TEMPLATE_ID, 'tenant-c'],
        },
      },
    });
    expect(n.materialCenterPrint?.stockOutFlowDetail?.allowedTemplateIds).toEqual([
      BUILTIN_MATERIAL_ISSUE_PRINT_TEMPLATE_ID,
      'tenant-a',
    ]);
    expect(n.materialCenterPrint?.stockReturnFlowDetail?.allowedTemplateIds).toEqual([
      BUILTIN_MATERIAL_RETURN_PRINT_TEMPLATE_ID,
    ]);
    expect(n.materialCenterPrint?.outsourceStockOutFlowDetail?.allowedTemplateIds).toEqual([
      BUILTIN_OUTSOURCE_MATERIAL_ISSUE_PRINT_TEMPLATE_ID,
      'tenant-b',
    ]);
    expect(n.materialCenterPrint?.outsourceStockReturnFlowDetail?.allowedTemplateIds).toEqual([
      BUILTIN_OUTSOURCE_MATERIAL_RETURN_PRINT_TEMPLATE_ID,
      'tenant-c',
    ]);
  });

  it('preserves tenant-only whitelist', () => {
    const n = normalizeMaterialFormSettings({
      materialCenterPrint: { stockOutFlowDetail: { allowedTemplateIds: ['my-template'] } },
    });
    expect(n.materialCenterPrint?.stockOutFlowDetail?.allowedTemplateIds).toEqual(['my-template']);
  });
});

describe('normalizeReworkFormSettings reworkCenterPrint', () => {
  it('injects default slots without auto template whitelist', () => {
    const n = normalizeReworkFormSettings({});
    expect(n.reworkCenterPrint?.defectTreatmentFlowDetail?.allowedTemplateIds).toBeUndefined();
    expect(n.reworkCenterPrint?.reworkReportFlowDetail?.allowedTemplateIds).toBeUndefined();
    expect(n.reworkCenterPrint?.defectTreatmentFlowDetail?.showPrintButton).toBe(false);
  });

  it('preserves builtin template ids when user explicitly whitelists them', () => {
    const n = normalizeReworkFormSettings({
      reworkCenterPrint: {
        defectTreatmentFlowDetail: {
          allowedTemplateIds: [BUILTIN_REWORK_DEFECT_TREATMENT_PRINT_TEMPLATE_ID, 'tenant-x'],
        },
        reworkReportFlowDetail: { allowedTemplateIds: [BUILTIN_REWORK_REPORT_FLOW_PRINT_TEMPLATE_ID] },
      },
    });
    expect(n.reworkCenterPrint?.defectTreatmentFlowDetail?.allowedTemplateIds).toEqual([
      BUILTIN_REWORK_DEFECT_TREATMENT_PRINT_TEMPLATE_ID,
      'tenant-x',
    ]);
    expect(n.reworkCenterPrint?.reworkReportFlowDetail?.allowedTemplateIds).toEqual([
      BUILTIN_REWORK_REPORT_FLOW_PRINT_TEMPLATE_ID,
    ]);
  });

  it('preserves tenant-only whitelist', () => {
    const n = normalizeReworkFormSettings({
      reworkCenterPrint: { defectTreatmentFlowDetail: { allowedTemplateIds: ['my-rework-tpl'] } },
    });
    expect(n.reworkCenterPrint?.defectTreatmentFlowDetail?.allowedTemplateIds).toEqual(['my-rework-tpl']);
  });
});

describe('normalizeOutsourceFormSettings', () => {
  it('injects default outsourceCenterPrint without auto template whitelist', () => {
    const n = normalizeOutsourceFormSettings({});
    expect(n.showOutsourceDispatchDeliveryDate).toBe(false);
    expect(n.outsourceCenterPrint?.dispatchFlowDetail?.allowedTemplateIds).toBeUndefined();
    expect(n.outsourceCenterPrint?.receiveFlowDetail?.allowedTemplateIds).toBeUndefined();
    expect(n.outsourceCenterPrint?.dispatchFlowDetail?.showPrintButton).toBe(false);
  });

  it('strips removed builtin-outsource-dispatch-v1 from dispatch whitelist', () => {
    const n = normalizeOutsourceFormSettings({
      outsourceCenterPrint: {
        dispatchFlowDetail: { allowedTemplateIds: ['builtin-outsource-dispatch-v1', 'custom-1'] },
      },
    });
    expect(n.outsourceCenterPrint?.dispatchFlowDetail?.allowedTemplateIds).toEqual(['custom-1']);
  });

  it('v1-only dispatch whitelist becomes empty', () => {
    const n = normalizeOutsourceFormSettings({
      outsourceCenterPrint: {
        dispatchFlowDetail: { allowedTemplateIds: ['builtin-outsource-dispatch-v1'] },
      },
    });
    expect(n.outsourceCenterPrint?.dispatchFlowDetail?.allowedTemplateIds).toBeUndefined();
  });

  it('empty dispatch slot has no allowed ids', () => {
    const n = normalizeOutsourceFormSettings({
      outsourceCenterPrint: { dispatchFlowDetail: {} },
    });
    expect(n.outsourceCenterPrint?.dispatchFlowDetail?.allowedTemplateIds).toBeUndefined();
  });

  it('preserves tenant whitelist without prepending builtins', () => {
    const n = normalizeOutsourceFormSettings({
      outsourceCenterPrint: { dispatchFlowDetail: { allowedTemplateIds: ['custom-1'] } },
    });
    expect(n.outsourceCenterPrint?.dispatchFlowDetail?.allowedTemplateIds).toEqual(['custom-1']);
  });

  it('preserves receive whitelist as provided', () => {
    const n = normalizeOutsourceFormSettings({
      outsourceCenterPrint: { receiveFlowDetail: { allowedTemplateIds: ['recv-custom'] } },
    });
    expect(n.outsourceCenterPrint?.receiveFlowDetail?.allowedTemplateIds).toEqual(['recv-custom']);
  });
});

describe('normalizePurchaseOrderFormSettings listPrint', () => {
  it('does not inject allowed ids when unset', () => {
    expect(normalizePurchaseOrderFormSettings({}).listPrint?.allowedTemplateIds).toBeUndefined();
  });

  it('keeps tenant whitelist', () => {
    const n = normalizePurchaseOrderFormSettings({ listPrint: { allowedTemplateIds: ['a'] } });
    expect(n.listPrint?.allowedTemplateIds).toEqual(['a']);
  });
});

describe('normalizeSalesOrderFormSettings listPrint', () => {
  it('does not inject allowed ids when unset', () => {
    expect(normalizeSalesOrderFormSettings({}).listPrint?.allowedTemplateIds).toBeUndefined();
  });

  it('keeps tenant whitelist', () => {
    const n = normalizeSalesOrderFormSettings({ listPrint: { allowedTemplateIds: ['b'] } });
    expect(n.listPrint?.allowedTemplateIds).toEqual(['b']);
  });
});

describe('normalizePurchaseBillFormSettings listPrint', () => {
  it('does not inject allowed ids when unset', () => {
    expect(normalizePurchaseBillFormSettings({}).listPrint?.allowedTemplateIds).toBeUndefined();
  });

  it('keeps tenant whitelist', () => {
    const n = normalizePurchaseBillFormSettings({ listPrint: { allowedTemplateIds: ['c'] } });
    expect(n.listPrint?.allowedTemplateIds).toEqual(['c']);
  });
});

describe('normalizeSalesBillFormSettings listPrint', () => {
  it('does not inject allowed ids when unset', () => {
    expect(normalizeSalesBillFormSettings({}).listPrint?.allowedTemplateIds).toBeUndefined();
  });

  it('keeps tenant whitelist', () => {
    const n = normalizeSalesBillFormSettings({ listPrint: { allowedTemplateIds: ['d'] } });
    expect(n.listPrint?.allowedTemplateIds).toEqual(['d']);
  });
});
