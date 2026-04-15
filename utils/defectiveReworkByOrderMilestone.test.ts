import { describe, it, expect } from 'vitest';
import { buildDefectiveReworkByOrderMilestone } from './defectiveReworkByOrderMilestone';
import { MilestoneStatus, OrderStatus } from '../types';
import type { ProductionOrder, ProductionOpRecord } from '../types';

function makeOrder(id: string, milestones: { templateId: string; defective?: number }[]): ProductionOrder {
  return {
    id,
    orderNumber: `WO-${id}`,
    productId: 'prod-1',
    productName: 'Test',
    sku: 'SKU-1',
    items: [{ quantity: 100, completedQuantity: 0 }],
    customer: '',
    startDate: '2026-01-01',
    dueDate: '2026-02-01',
    status: OrderStatus.PRODUCING,
    milestones: milestones.map(m => ({
      id: `ms-${id}-${m.templateId}`,
      templateId: m.templateId,
      name: m.templateId,
      status: MilestoneStatus.IN_PROGRESS,
      plannedDate: '2026-01-15',
      completedQuantity: 0,
      reportDisplayTemplate: [],
      reportTemplate: [],
      reports: m.defective
        ? [{ id: 'r1', timestamp: '2026-01-10', operator: 'op', quantity: 50, defectiveQuantity: m.defective, customData: {} }]
        : [],
      weight: 1,
    })),
    priority: 'Medium',
  };
}

describe('buildDefectiveReworkByOrderMilestone', () => {
  it('calculates defective from milestone reports', () => {
    const orders = [
      makeOrder('o1', [{ templateId: 'cutting', defective: 5 }, { templateId: 'sewing' }]),
    ];
    const result = buildDefectiveReworkByOrderMilestone(orders, []);
    expect(result.get('o1|cutting')?.defective).toBe(5);
    expect(result.get('o1|sewing')?.defective).toBe(0);
  });

  it('initializes rework to 0 when no rework reports', () => {
    const orders = [makeOrder('o1', [{ templateId: 'node1', defective: 3 }])];
    const result = buildDefectiveReworkByOrderMilestone(orders, []);
    expect(result.get('o1|node1')?.rework).toBe(0);
    expect(result.get('o1|node1')?.reworkByVariant).toEqual({});
  });

  it('processes rework reports and accumulates rework quantity', () => {
    const orders = [makeOrder('o1', [{ templateId: 'node1', defective: 10 }])];
    const reworkRecord: ProductionOpRecord = {
      id: 'rw1',
      type: 'REWORK',
      orderId: 'o1',
      productId: 'prod-1',
      quantity: 10,
      operator: 'op',
      timestamp: '2026-01-11',
      sourceNodeId: 'node1',
      nodeId: 'node1',
    };
    const reworkReport: ProductionOpRecord = {
      id: 'rr1',
      type: 'REWORK_REPORT',
      orderId: 'o1',
      productId: 'prod-1',
      quantity: 8,
      operator: 'op',
      timestamp: '2026-01-12',
      nodeId: 'node1',
      sourceNodeId: 'node1',
      sourceReworkId: 'rw1',
    };
    const result = buildDefectiveReworkByOrderMilestone(orders, [reworkRecord, reworkReport]);
    const entry = result.get('o1|node1');
    expect(entry?.defective).toBe(10);
    expect(entry?.rework).toBe(8);
  });

  it('returns empty map for no orders', () => {
    const result = buildDefectiveReworkByOrderMilestone([], []);
    expect(result.size).toBe(0);
  });

  it('handles multiple orders', () => {
    const orders = [
      makeOrder('o1', [{ templateId: 'n1', defective: 3 }]),
      makeOrder('o2', [{ templateId: 'n1', defective: 7 }]),
    ];
    const result = buildDefectiveReworkByOrderMilestone(orders, []);
    expect(result.get('o1|n1')?.defective).toBe(3);
    expect(result.get('o2|n1')?.defective).toBe(7);
  });
});
