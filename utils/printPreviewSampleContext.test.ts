import { describe, expect, it } from 'vitest';
import { augmentPrintPreviewContext } from './printPreviewSampleContext';
import type { PrintTemplate } from '../types';

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
});
