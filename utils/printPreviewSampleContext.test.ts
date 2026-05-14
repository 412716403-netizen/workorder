import { describe, expect, it } from 'vitest';
import { augmentPrintPreviewContext } from './printPreviewSampleContext';
import type { PrintTemplate } from '../types';
import { PlanStatus } from '../types';
import { COLOR_SIZE_MATRIX_JSON_KEY } from './colorSizeMatrixPrint';
import { COLOR_MATERIAL_MATRIX_JSON_KEY } from './colorMaterialMatrixPrint';

function stubTemplate(partial: Partial<PrintTemplate>): PrintTemplate {
  return {
    id: 'stub',
    name: 'stub',
    paperSize: { widthMm: 210, heightMm: 297 },
    elements: [],
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

describe('augmentPrintPreviewContext', () => {
  it('fills tenantName for non-outsource document types when missing', () => {
    const ctx = augmentPrintPreviewContext({}, stubTemplate({ documentType: 'purchaseOrder' }));
    expect(ctx.tenantName).toBe('示例公司名称');
    expect(ctx.purchaseOrderPrint).toBeDefined();
  });

  it('preserves non-empty tenantName from base', () => {
    const ctx = augmentPrintPreviewContext(
      { tenantName: '真实公司' },
      stubTemplate({ documentType: 'plan' }),
    );
    expect(ctx.tenantName).toBe('真实公司');
  });

  it('injects printListRows with matrix JSON for plan templates when rows missing', () => {
    const ctx = augmentPrintPreviewContext({}, stubTemplate({ documentType: 'plan' }));
    expect(ctx.printListRows?.length).toBe(1);
    const row = ctx.printListRows![0]!;
    expect(String(row[COLOR_SIZE_MATRIX_JSON_KEY] ?? '')).toContain('sizes');
    expect(String(row[COLOR_MATERIAL_MATRIX_JSON_KEY] ?? '')).toContain('nodeBlocks');
  });

  it('fills sample plan.dueDate for plan / all templates when plan exists but dueDate empty', () => {
    const ctx = augmentPrintPreviewContext(
      {
        plan: {
          id: 'p1',
          planNumber: 'PLN-1',
          items: [],
          startDate: '2026-01-01',
          status: PlanStatus.DRAFT,
          customer: '',
          priority: 'Medium',
          productId: 'pr1',
        },
      },
      stubTemplate({ documentType: 'plan' }),
    );
    expect(ctx.plan?.dueDate).toBe('2026-04-17');
  });

  it('injects listRow and merges item-code keys into printListRows when template uses 单品码行 placeholders', () => {
    const textEl = {
      id: 't1',
      type: 'text' as const,
      x: 0,
      y: 0,
      width: 50,
      height: 10,
      zIndex: 1,
      config: {
        content: '{{行.serialLabel}} {{行.scanUrl}}',
        fontSizePt: 10,
        fontWeight: 'normal' as const,
        textAlign: 'left' as const,
        color: '#000',
      },
    };
    const ctx = augmentPrintPreviewContext(
      {
        plan: {
          id: 'p1',
          planNumber: 'PLN-预览',
          items: [],
          startDate: '2026-01-01',
          status: PlanStatus.DRAFT,
          customer: '',
          priority: 'Medium',
          productId: 'pr1',
        },
      },
      stubTemplate({ documentType: 'plan', elements: [textEl] }),
    );
    expect(ctx.listRow?.serialLabel).toBeTruthy();
    expect(String(ctx.listRow?.serialLabel)).toMatch(/^PLN-预览-/);
    expect(String(ctx.listRow?.scanUrl)).toContain('/scan/demo-item-scan-token-0');
    expect(ctx.printListRows?.length).toBeGreaterThan(0);
    const r0 = ctx.printListRows![0]!;
    expect(String(r0.serialLabel)).toContain('PLN-预览-');
    expect(String(r0.scanUrl)).toContain('demo-item-scan-token-0');
  });

  it('item-code sample fields win over plan list rows so empty color/size do not blank preview', () => {
    const textEl = {
      id: 't1',
      type: 'text' as const,
      x: 0,
      y: 0,
      width: 50,
      height: 10,
      zIndex: 1,
      config: {
        content: '{{行.colorName}} {{行.sizeName}}',
        fontSizePt: 10,
        fontWeight: 'normal' as const,
        textAlign: 'left' as const,
        color: '#000',
      },
    };
    const ctx = augmentPrintPreviewContext(
      {
        plan: {
          id: 'p1',
          planNumber: 'PLN-预览',
          items: [],
          startDate: '2026-01-01',
          status: PlanStatus.DRAFT,
          customer: '',
          priority: 'Medium',
          productId: 'pr1',
        },
        printListRows: [
          {
            lineNo: 1,
            sku: 'X',
            productName: 'P',
            qty: 1,
            unitPrice: '0',
            amount: '0',
            remark: '',
            colorName: '',
            sizeName: '',
          },
        ],
      },
      stubTemplate({ documentType: 'plan', elements: [textEl] }),
    );
    expect(ctx.listRow?.colorName).toBe('红色');
    expect(ctx.listRow?.sizeName).toBe('L');
    expect(ctx.printListRows?.[0]?.colorName).toBe('红色');
    expect(ctx.printListRows?.[0]?.sizeName).toBe('L');
  });
});
