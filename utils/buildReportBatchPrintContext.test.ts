import { describe, it, expect } from 'vitest';
import { buildReportBatchPrintContext, type ReportDetailBatchForPrint } from './buildReportBatchPrintContext';
import type { Product, AppDictionaries, PrintTemplate } from '../types';

const fakeTemplate = { id: 't1' } as unknown as PrintTemplate;
const dictionaries = { colors: [], sizes: [], units: [] } as unknown as AppDictionaries;

const product: Product = {
  id: 'p1',
  name: 'Tee',
  unitId: 'u1',
} as unknown as Product;

const productMap = new Map([[product.id, product]]);

describe('buildReportBatchPrintContext', () => {
  it('order 来源: 把工单字段写入 PrintRenderContext', () => {
    const batch: ReportDetailBatchForPrint = {
      source: 'order',
      key: 'k1',
      rows: [
        {
          order: { id: 'o1', orderNumber: 'WO-001', productId: 'p1', productName: 'Tee', items: [] } as never,
          milestone: { id: 'm1', name: '裁剪', templateId: 'tpl1' },
          report: {
            id: 'r1',
            timestamp: '2026-05-15T10:00:00Z',
            operator: 'Alice',
            quantity: 100,
            defectiveQuantity: 2,
            reportNo: 'BR-1',
          },
        },
      ],
      first: undefined as never,
      totalGood: 100,
      totalDefective: 2,
      totalAmount: 200,
      reportNo: 'BR-1',
    };
    batch.first = batch.rows[0]!;

    const ctx = buildReportBatchPrintContext(fakeTemplate, {
      batch,
      productMap,
      products: [product],
      dictionaries,
    });

    expect(ctx.milestoneName).toBe('裁剪');
    expect(ctx.completedQuantity).toBe(100);
    expect(ctx.order?.orderNumber).toBe('WO-001');
    expect(ctx.product?.id).toBe('p1');
    expect(ctx.reportBatchPrint).toMatchObject({
      reportNo: 'BR-1',
      sourceLabel: '工单',
      productName: 'Tee',
      totalGood: 100,
      totalDefective: 2,
      totalAmount: 200,
      firstOperator: 'Alice',
    });
  });

  it('product 来源: order 字段为 undefined, 用 productName / milestoneName', () => {
    const batch: ReportDetailBatchForPrint = {
      source: 'product',
      key: 'k2',
      progressId: 'pp1',
      productId: 'p1',
      productName: 'Tee',
      milestoneName: '车缝',
      milestoneTemplateId: 'tpl2',
      rows: [
        {
          progress: { id: 'pp1', productId: 'p1', milestoneTemplateId: 'tpl2' } as never,
          report: { id: 'r2', timestamp: '2026-05-15T11:00:00Z', operator: 'Bob', quantity: 50 },
        },
      ],
      first: undefined as never,
      totalGood: 50,
      totalDefective: 0,
      totalAmount: 0,
    };
    batch.first = batch.rows[0]!;

    const ctx = buildReportBatchPrintContext(fakeTemplate, {
      batch,
      productMap,
      products: [product],
      dictionaries,
    });

    expect(ctx.milestoneName).toBe('车缝');
    expect(ctx.order).toBeUndefined();
    expect(ctx.reportBatchPrint?.sourceLabel).toBe('产品');
    expect(ctx.completedQuantity).toBe(50);
  });

  it('合计 defectiveSum 来自 rows.defectiveQuantity 之和', () => {
    const batch: ReportDetailBatchForPrint = {
      source: 'order',
      key: 'k3',
      rows: [
        {
          order: { id: 'o1', orderNumber: 'WO-1', productId: 'p1', productName: 'X', items: [] } as never,
          milestone: { id: 'm1', name: 'A', templateId: 'tA' },
          report: { id: 'r1', timestamp: '', operator: '', quantity: 10, defectiveQuantity: 3 },
        },
        {
          order: { id: 'o1', orderNumber: 'WO-1', productId: 'p1', productName: 'X', items: [] } as never,
          milestone: { id: 'm1', name: 'A', templateId: 'tA' },
          report: { id: 'r2', timestamp: '', operator: '', quantity: 5, defectiveQuantity: 1 },
        },
      ],
      first: undefined as never,
      totalGood: 15,
      totalDefective: 4,
      totalAmount: 0,
    };
    batch.first = batch.rows[0]!;

    const ctx = buildReportBatchPrintContext(fakeTemplate, {
      batch,
      productMap,
      products: [product],
      dictionaries,
    });
    expect(ctx.reportBatchPrint?.totalDefective).toBe(4);
  });
});
