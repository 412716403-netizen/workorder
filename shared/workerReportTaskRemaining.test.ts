import { describe, expect, it } from 'vitest';
import { computeWorkerReportTaskDisplayRemaining } from './workerReportTaskRemaining.js';
import type { ReportableOrder, ReportableProdRecord } from './orderReportableAggregates.js';

function makeOrder(overrides?: Partial<ReportableOrder>): ReportableOrder {
  return {
    id: 'o1',
    productId: 'p1',
    parentOrderId: null,
    items: [
      { variantId: 'v1', quantity: 100 },
      { variantId: 'v2', quantity: 100 },
      { variantId: 'v3', quantity: 100 },
    ],
    milestones: [
      {
        id: 'm-prev',
        templateId: 'tpl-prev',
        completedQuantity: 300,
        reports: [],
      },
      {
        id: 'm-cur',
        templateId: 'tpl-cur',
        completedQuantity: 71,
        reports: [],
      },
    ],
    ...overrides,
  };
}

describe('computeWorkerReportTaskDisplayRemaining', () => {
  it('subtracts outsource net from order-level remaining (229 -> 7 scenario)', () => {
    const order = makeOrder();
    const prodRecords: ReportableProdRecord[] = [
      {
        id: 'os1',
        type: 'OUTSOURCE',
        orderId: 'o1',
        nodeId: 'tpl-cur',
        quantity: 210,
        status: '加工中',
      },
    ];
    const remaining = computeWorkerReportTaskDisplayRemaining({
      order,
      milestoneTemplateId: 'tpl-cur',
      processSequenceMode: 'sequential',
      outOfSequenceTemplateIds: new Set(),
      prodRecords,
    });
    // max = 300 - 0 = 300; reported 71; outsource 210 => 19 at order level
    // but with variant breakdown, cap applies — here variants use prev completed split
    expect(remaining).toBeLessThanOrEqual(19);
    expect(remaining).toBeGreaterThan(0);
  });

  it('returns hintRemaining for single-line orders without variant breakdown', () => {
    const order = makeOrder({
      items: [{ variantId: null, quantity: 300 }],
      milestones: [
        { id: 'm-prev', templateId: 'tpl-prev', completedQuantity: 300, reports: [] },
        {
          id: 'm-cur',
          templateId: 'tpl-cur',
          completedQuantity: 71,
          reports: [{ quantity: 0, approvalStatus: 'APPROVED' }],
        },
      ],
    });
    const prodRecords: ReportableProdRecord[] = [
      {
        id: 'os1',
        type: 'OUTSOURCE',
        orderId: 'o1',
        nodeId: 'tpl-cur',
        quantity: 210,
        status: '加工中',
      },
    ];
    const remaining = computeWorkerReportTaskDisplayRemaining({
      order,
      milestoneTemplateId: 'tpl-cur',
      processSequenceMode: 'sequential',
      outOfSequenceTemplateIds: new Set(),
      prodRecords,
    });
    // 300 - 71 - 210 = 19 without defective; user case had defective reducing max to 288 => 7
    expect(remaining).toBe(19);
  });

  it('caps variant sum by hintRemaining (matrix + outsource)', () => {
    const order: ReportableOrder = {
      id: 'o1',
      productId: 'p1',
      items: [
        { variantId: 'white', quantity: 100 },
        { variantId: 'blue', quantity: 100 },
        { variantId: 'black', quantity: 100 },
      ],
      milestones: [
        {
          id: 'm-prev',
          templateId: 'tpl-prev',
          completedQuantity: 300,
          reports: [],
        },
        {
          id: 'm-cur',
          templateId: 'tpl-cur',
          completedQuantity: 71,
          reports: [{ defectiveQuantity: 12, approvalStatus: 'APPROVED' }],
        },
      ],
    };
    const prodRecords: ReportableProdRecord[] = [
      {
        id: 'os1',
        type: 'OUTSOURCE',
        orderId: 'o1',
        nodeId: 'tpl-cur',
        quantity: 210,
        status: '加工中',
      },
    ];
    const remaining = computeWorkerReportTaskDisplayRemaining({
      order,
      milestoneTemplateId: 'tpl-cur',
      processSequenceMode: 'sequential',
      outOfSequenceTemplateIds: new Set(),
      prodRecords,
    });
    expect(remaining).toBe(7);
  });
});
