import { describe, expect, it } from 'vitest';
import {
  aggregateProductOutsourcePartners,
  aggregateProductReportSummaryByNode,
  aggregateProductVariantQuantities,
  reportDateRangeFromProductOrders,
} from './productProductionDetailStats';
import type { GlobalNodeTemplate, ProductionOpRecord, ProductionOrder, ProductMilestoneProgress } from '../types';

const productId = 'p1';
const nodeId = 'n1';

const productOrders = [
  {
    id: 'o1',
    productId,
    orderNumber: 'W1',
    items: [
      { variantId: 'v1', quantity: 60 },
      { variantId: 'v2', quantity: 40 },
    ],
    milestones: [
      {
        id: 'm1',
        templateId: nodeId,
        name: '横机',
        completedQuantity: 10,
        reports: [{ id: 'r1', quantity: 10, defectiveQuantity: 2, timestamp: '2026-06-01T08:00:00Z' }],
      },
    ],
  },
] as unknown as ProductionOrder[];

const pmps = [
  {
    id: 'pmp1',
    productId,
    milestoneTemplateId: nodeId,
    completedQuantity: 20,
    reports: [{ id: 'pr1', quantity: 20, defectiveQuantity: 1, timestamp: '2026-06-02T10:00:00Z' }],
  },
] as unknown as ProductMilestoneProgress[];

const globalNodes = [{ id: nodeId, name: '横机' }] as GlobalNodeTemplate[];

describe('aggregateProductOutsourcePartners', () => {
  it('aggregates dispatched/received/pending by partner and node', () => {
    const records = [
      { type: 'OUTSOURCE', productId, partner: '厂A', nodeId, status: '加工中', quantity: 100 },
      { type: 'OUTSOURCE', productId, partner: '厂A', nodeId, status: '已收回', quantity: 100 },
    ] as ProductionOpRecord[];
    const rows = aggregateProductOutsourcePartners(productId, records, globalNodes);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ partner: '厂A', dispatched: 100, received: 100, pending: 0 });
  });
});

describe('aggregateProductReportSummaryByNode', () => {
  it('merges PMP and milestone good/defective with scrap', () => {
    const records = [
      { type: 'SCRAP', productId, nodeId, quantity: 3 },
    ] as ProductionOpRecord[];
    const rows = aggregateProductReportSummaryByNode(
      productId,
      productOrders,
      pmps,
      records,
      globalNodes,
      [nodeId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].goodQty).toBe(30);
    expect(rows[0].defQty).toBe(3);
    expect(rows[0].scrapQty).toBe(3);
  });
});

describe('aggregateProductVariantQuantities', () => {
  it('sums quantities per variant across orders', () => {
    const m = aggregateProductVariantQuantities(productOrders);
    expect(m.get('v1')).toBe(60);
    expect(m.get('v2')).toBe(40);
  });
});

describe('reportDateRangeFromProductOrders', () => {
  it('returns min/max report dates', () => {
    const range = reportDateRangeFromProductOrders(productOrders, pmps, productId);
    expect(range.dateFrom <= range.dateTo).toBe(true);
    expect(range.dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
