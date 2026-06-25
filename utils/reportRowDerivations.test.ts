import { describe, it, expect } from 'vitest';
import {
  computeReportRowDerivations,
  resolveOrdersForProductAtTemplate,
  productHasMilestoneTemplate,
  resolveTargetOrderForReport,
} from './reportRowDerivations';
import type { ProductionOrder } from '../types';

const tid = 'node-cut';
const order1: ProductionOrder = {
  id: 'o1',
  orderNumber: 'WO-1',
  productId: 'p1',
  productName: '产品A',
  sku: 'A',
  items: [{ variantId: 'v1', quantity: 100 }],
  milestones: [
    { id: 'm1', templateId: tid, name: '裁剪', status: '进行中', completedQuantity: 10, reportTemplate: [], reports: [] },
  ],
  customer: '',
  status: '进行中',
} as ProductionOrder;

const order2: ProductionOrder = {
  ...order1,
  id: 'o2',
  orderNumber: 'WO-2',
  productId: 'p2',
  productName: '产品B',
  milestones: [
    { id: 'm2', templateId: tid, name: '裁剪', status: '进行中', completedQuantity: 0, reportTemplate: [], reports: [] },
  ],
} as ProductionOrder;

describe('reportRowDerivations', () => {
  it('resolveOrdersForProductAtTemplate filters by product and template', () => {
    const rows = resolveOrdersForProductAtTemplate([order1, order2], 'p2', tid);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe('o2');
  });

  it('productHasMilestoneTemplate checks order milestones', () => {
    expect(productHasMilestoneTemplate('p1', tid, [order1, order2], 'order')).toBe(true);
    expect(productHasMilestoneTemplate('p9', tid, [order1, order2], 'order')).toBe(false);
  });

  it('computeReportRowDerivations returns remaining hints', () => {
    const d = computeReportRowDerivations({
      productId: 'p1',
      milestoneTemplateId: tid,
      productionLinkMode: 'order',
      processSequenceMode: 'free',
      outOfSequenceTemplateIds: new Set(),
      orders: [order1, order2],
      productMilestoneProgresses: [],
      prodRecords: [],
      getDefectiveRework: () => ({ defective: 0, rework: 0, reworkByVariant: {} }),
      reworkMergeBucketOrderId: id => id,
    });
    expect(d.ordersInModal).toHaveLength(1);
    expect(d.hintTotalQty).toBe(100);
    expect(d.effectiveRemainingForModal).toBeGreaterThan(0);
  });

  it('resolveTargetOrderForReport picks order with variant', () => {
    const hit = resolveTargetOrderForReport([order1], 'p1', tid, 'v1');
    expect(hit?.order.id).toBe('o1');
    expect(hit?.milestoneId).toBe('m1');
  });
});
