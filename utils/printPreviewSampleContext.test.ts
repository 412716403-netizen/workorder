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
});
