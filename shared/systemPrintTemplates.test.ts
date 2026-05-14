import { describe, expect, it } from 'vitest';
import {
  BUILTIN_OUTSOURCE_DISPATCH_PRINT_TEMPLATE_ID,
  BUILTIN_OUTSOURCE_RECEIVE_PRINT_TEMPLATE_ID,
  BUILTIN_PURCHASE_ORDER_PRINT_TEMPLATE_ID,
  BUILTIN_SALES_ORDER_PRINT_TEMPLATE_ID,
  BUILTIN_PURCHASE_BILL_PRINT_TEMPLATE_ID,
  BUILTIN_SALES_BILL_PRINT_TEMPLATE_ID,
  BUILTIN_MATERIAL_ISSUE_PRINT_TEMPLATE_ID,
  BUILTIN_MATERIAL_RETURN_PRINT_TEMPLATE_ID,
  BUILTIN_OUTSOURCE_MATERIAL_ISSUE_PRINT_TEMPLATE_ID,
  BUILTIN_OUTSOURCE_MATERIAL_RETURN_PRINT_TEMPLATE_ID,
  BUILTIN_REWORK_DEFECT_TREATMENT_PRINT_TEMPLATE_ID,
  BUILTIN_REWORK_REPORT_FLOW_PRINT_TEMPLATE_ID,
  BUILTIN_PLAN_LIST_PRINT_TEMPLATE_ID,
  BUILTIN_PLAN_LABEL_PRINT_TEMPLATE_ID,
  mergePrintTemplatesForTenantConfig,
  stripSystemPrintTemplatesForPersistence,
} from './systemPrintTemplates';

describe('mergePrintTemplatesForTenantConfig', () => {
  it('appends builtin outsource dispatch template', () => {
    const merged = mergePrintTemplatesForTenantConfig([
      { id: 'tenant-a', name: '租户模版', paperSize: { widthMm: 210, heightMm: 297 }, elements: [], createdAt: '', updatedAt: '' },
    ]);
    const ids = merged.map(x => (x as { id: string }).id);
    expect(ids).toContain(BUILTIN_OUTSOURCE_DISPATCH_PRINT_TEMPLATE_ID);
    expect(ids).toContain(BUILTIN_OUTSOURCE_RECEIVE_PRINT_TEMPLATE_ID);
    expect(ids).toContain(BUILTIN_PURCHASE_ORDER_PRINT_TEMPLATE_ID);
    expect(ids).toContain(BUILTIN_SALES_ORDER_PRINT_TEMPLATE_ID);
    expect(ids).toContain(BUILTIN_PURCHASE_BILL_PRINT_TEMPLATE_ID);
    expect(ids).toContain(BUILTIN_SALES_BILL_PRINT_TEMPLATE_ID);
    expect(ids).toContain(BUILTIN_MATERIAL_ISSUE_PRINT_TEMPLATE_ID);
    expect(ids).toContain(BUILTIN_MATERIAL_RETURN_PRINT_TEMPLATE_ID);
    expect(ids).toContain(BUILTIN_OUTSOURCE_MATERIAL_ISSUE_PRINT_TEMPLATE_ID);
    expect(ids).toContain(BUILTIN_OUTSOURCE_MATERIAL_RETURN_PRINT_TEMPLATE_ID);
    expect(ids).toContain(BUILTIN_REWORK_DEFECT_TREATMENT_PRINT_TEMPLATE_ID);
    expect(ids).toContain(BUILTIN_REWORK_REPORT_FLOW_PRINT_TEMPLATE_ID);
    expect(ids).toContain(BUILTIN_PLAN_LIST_PRINT_TEMPLATE_ID);
    expect(ids).toContain(BUILTIN_PLAN_LABEL_PRINT_TEMPLATE_ID);
    expect(ids).toContain('tenant-a');
  });

  it('tenant template with same id as builtin is replaced by code version', () => {
    const merged = mergePrintTemplatesForTenantConfig([
      { id: BUILTIN_OUTSOURCE_DISPATCH_PRINT_TEMPLATE_ID, name: '伪造', paperSize: { widthMm: 1, heightMm: 1 }, elements: [], createdAt: '', updatedAt: '' },
    ]);
    const builtin = merged.find(x => (x as { id: string }).id === BUILTIN_OUTSOURCE_DISPATCH_PRINT_TEMPLATE_ID) as {
      name: string;
    };
    expect(builtin.name).toBe('外协发出单（颜色尺码）');
  });

  it('strips obsolete v1 id', () => {
    const merged = mergePrintTemplatesForTenantConfig([
      { id: 'builtin-outsource-dispatch-v1', name: '旧', paperSize: { widthMm: 210, heightMm: 297 }, elements: [], createdAt: '', updatedAt: '' },
    ]);
    expect(merged.some(x => (x as { id: string }).id === 'builtin-outsource-dispatch-v1')).toBe(false);
  });

  it('tenant template with same id as builtin plan label is replaced by code version', () => {
    const merged = mergePrintTemplatesForTenantConfig([
      { id: BUILTIN_PLAN_LABEL_PRINT_TEMPLATE_ID, name: '伪造', paperSize: { widthMm: 1, heightMm: 1 }, elements: [], createdAt: '', updatedAt: '' },
    ]);
    const builtin = merged.find(x => (x as { id: string }).id === BUILTIN_PLAN_LABEL_PRINT_TEMPLATE_ID) as {
      name: string;
      paperSize: { widthMm: number };
    };
    expect(builtin.name).toBe('单品码标签');
    expect(builtin.paperSize.widthMm).toBe(30);
  });
});

describe('stripSystemPrintTemplatesForPersistence', () => {
  it('removes builtin ids so tenant save does not duplicate code templates', () => {
    const stripped = stripSystemPrintTemplatesForPersistence([
      { id: BUILTIN_OUTSOURCE_DISPATCH_PRINT_TEMPLATE_ID, name: '外协发出单', paperSize: { widthMm: 241, heightMm: 140 }, elements: [], createdAt: '', updatedAt: '' },
      { id: BUILTIN_OUTSOURCE_RECEIVE_PRINT_TEMPLATE_ID, name: '外协收回单', paperSize: { widthMm: 241, heightMm: 140 }, elements: [], createdAt: '', updatedAt: '' },
      { id: BUILTIN_PURCHASE_ORDER_PRINT_TEMPLATE_ID, name: '采购单', paperSize: { widthMm: 241, heightMm: 140 }, elements: [], createdAt: '', updatedAt: '' },
      { id: BUILTIN_SALES_ORDER_PRINT_TEMPLATE_ID, name: '销售单', paperSize: { widthMm: 241, heightMm: 140 }, elements: [], createdAt: '', updatedAt: '' },
      { id: BUILTIN_PURCHASE_BILL_PRINT_TEMPLATE_ID, name: '采购单', paperSize: { widthMm: 241, heightMm: 140 }, elements: [], createdAt: '', updatedAt: '' },
      { id: BUILTIN_SALES_BILL_PRINT_TEMPLATE_ID, name: '销售单', paperSize: { widthMm: 241, heightMm: 140 }, elements: [], createdAt: '', updatedAt: '' },
      { id: BUILTIN_MATERIAL_ISSUE_PRINT_TEMPLATE_ID, name: '领料', paperSize: { widthMm: 241, heightMm: 140 }, elements: [], createdAt: '', updatedAt: '' },
      { id: BUILTIN_MATERIAL_RETURN_PRINT_TEMPLATE_ID, name: '退料', paperSize: { widthMm: 241, heightMm: 140 }, elements: [], createdAt: '', updatedAt: '' },
      { id: BUILTIN_OUTSOURCE_MATERIAL_ISSUE_PRINT_TEMPLATE_ID, name: '外协领', paperSize: { widthMm: 241, heightMm: 140 }, elements: [], createdAt: '', updatedAt: '' },
      { id: BUILTIN_OUTSOURCE_MATERIAL_RETURN_PRINT_TEMPLATE_ID, name: '外协退', paperSize: { widthMm: 241, heightMm: 140 }, elements: [], createdAt: '', updatedAt: '' },
      { id: BUILTIN_REWORK_DEFECT_TREATMENT_PRINT_TEMPLATE_ID, name: '不良', paperSize: { widthMm: 241, heightMm: 140 }, elements: [], createdAt: '', updatedAt: '' },
      { id: BUILTIN_REWORK_REPORT_FLOW_PRINT_TEMPLATE_ID, name: '报工', paperSize: { widthMm: 241, heightMm: 140 }, elements: [], createdAt: '', updatedAt: '' },
      { id: BUILTIN_PLAN_LIST_PRINT_TEMPLATE_ID, name: '计划单', paperSize: { widthMm: 210, heightMm: 297 }, elements: [], createdAt: '', updatedAt: '' },
      { id: BUILTIN_PLAN_LABEL_PRINT_TEMPLATE_ID, name: '标签', paperSize: { widthMm: 30, heightMm: 50 }, elements: [], createdAt: '', updatedAt: '' },
      { id: 'x', name: 'x', paperSize: { widthMm: 210, heightMm: 297 }, elements: [], createdAt: '', updatedAt: '' },
    ]);
    expect(stripped.map(x => (x as { id: string }).id)).toEqual(['x']);
  });
});
