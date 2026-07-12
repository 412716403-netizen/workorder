import { describe, expect, it } from 'vitest';
import type { ProductionOrder } from '../types';
import { MilestoneStatus } from '../types';
import { buildOrderMilestoneStripItems } from './orderMilestoneProgressStrip';

describe('buildOrderMilestoneStripItems', () => {
  it('computes available / completed / remaining like order center cards', () => {
    const order = {
      id: 'o1',
      productId: 'p1',
      orderNumber: 'WO-001',
      items: [{ quantity: 200 }],
      milestones: [
        {
          id: 'm1',
          templateId: 'n1',
          name: '横机',
          status: MilestoneStatus.IN_PROGRESS,
          completedQuantity: 20,
          reports: [],
        },
        {
          id: 'm2',
          templateId: 'n2',
          name: '平车',
          status: MilestoneStatus.PENDING,
          completedQuantity: 0,
          reports: [],
        },
      ],
    } as ProductionOrder;

    const items = buildOrderMilestoneStripItems({
      order,
      orders: [order],
      prodRecords: [],
      productionLinkMode: 'order',
      processSequenceMode: 'flexible',
      outOfSequenceTemplateIds: new Set(),
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      name: '横机',
      completed: 20,
      availableQty: 200,
      remainingDisplay: 180,
    });
    expect(items[1]).toMatchObject({
      name: '平车',
      completed: 0,
      availableQty: 200,
      remainingDisplay: 200,
    });
  });
});
