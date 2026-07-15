import { describe, expect, it } from 'vitest';
import { computeWorkerReportTaskDisplayRemaining, computeProductModeWorkerTaskRemaining } from './workerReportTaskRemaining.js';
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

describe('computeProductModeWorkerTaskRemaining', () => {
  it('aggregates remaining across product orders with PMP completed', () => {
    const blockOrders: ReportableOrder[] = [
      {
        id: 'o1',
        productId: 'p1',
        parentOrderId: null,
        items: [{ variantId: null, quantity: 100 }],
        milestones: [
          { id: 'm1', templateId: 'tpl-a', completedQuantity: 0, reports: [] },
        ],
      },
      {
        id: 'o2',
        productId: 'p1',
        parentOrderId: null,
        items: [{ variantId: null, quantity: 50 }],
        milestones: [
          { id: 'm2', templateId: 'tpl-a', completedQuantity: 0, reports: [] },
        ],
      },
    ];
    const stats = computeProductModeWorkerTaskRemaining({
      blockOrders,
      productId: 'p1',
      milestoneTemplateId: 'tpl-a',
      pmp: [
        {
          productId: 'p1',
          milestoneTemplateId: 'tpl-a',
          completedQuantity: 40,
          reports: [{ quantity: 40, approvalStatus: 'APPROVED' }],
        },
      ],
      processSequenceMode: 'free',
      outOfSequenceTemplateIds: new Set(),
      prodRecords: [],
    });
    expect(stats.totalQty).toBe(150);
    expect(stats.reported).toBe(40);
    expect(stats.remaining).toBe(110);
  });

  it('returns 0 remaining when completed + pending covers max reportable', () => {
    const blockOrders: ReportableOrder[] = [
      {
        id: 'o1',
        productId: 'p1',
        parentOrderId: null,
        items: [{ variantId: null, quantity: 10 }],
        milestones: [
          {
            id: 'm1',
            templateId: 'tpl-a',
            completedQuantity: 5,
            reports: [
              { quantity: 5, approvalStatus: 'APPROVED' },
              { quantity: 5, approvalStatus: 'PENDING' },
            ],
          },
        ],
      },
    ];
    const stats = computeProductModeWorkerTaskRemaining({
      blockOrders,
      productId: 'p1',
      milestoneTemplateId: 'tpl-a',
      pmp: [],
      processSequenceMode: 'free',
      outOfSequenceTemplateIds: new Set(),
      prodRecords: [],
    });
    // max 10 − 已报 5 − 待审 5 = 0
    expect(stats.remaining).toBe(0);
  });

  it('subtracts pending PMP reports and product-level outsource from remaining', () => {
    const blockOrders: ReportableOrder[] = [
      {
        id: 'o1',
        productId: 'p1',
        parentOrderId: null,
        items: [{ variantId: null, quantity: 100 }],
        milestones: [
          { id: 'm1', templateId: 'tpl-a', completedQuantity: 0, reports: [] },
        ],
      },
    ];
    const prodRecords: ReportableProdRecord[] = [
      {
        id: 'os1',
        type: 'OUTSOURCE',
        orderId: null,
        productId: 'p1',
        nodeId: 'tpl-a',
        quantity: 20,
        status: '加工中',
      },
    ];
    const stats = computeProductModeWorkerTaskRemaining({
      blockOrders,
      productId: 'p1',
      milestoneTemplateId: 'tpl-a',
      pmp: [
        {
          productId: 'p1',
          milestoneTemplateId: 'tpl-a',
          completedQuantity: 30,
          reports: [
            { quantity: 30, approvalStatus: 'APPROVED' },
            { quantity: 10, approvalStatus: 'PENDING' },
          ],
        },
      ],
      processSequenceMode: 'free',
      outOfSequenceTemplateIds: new Set(),
      prodRecords,
    });
    // max 100 − 已报 30 − 待审 10 − 产品级外协 20 = 40
    expect(stats.reported).toBe(30);
    expect(stats.remaining).toBe(40);
  });
});
