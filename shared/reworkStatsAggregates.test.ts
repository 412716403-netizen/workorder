import { describe, expect, it } from 'vitest';
import { computeReworkStatsByTemplate } from './reworkStatsAggregates.js';

const periodStart = new Date('2026-06-01T00:00:00');
const periodEnd = new Date('2026-06-11T23:59:59');

describe('computeReworkStatsByTemplate', () => {
  it('工单模式按工序汇总返工任务与周期流水', () => {
    const stats = computeReworkStatsByTemplate({
      templateIds: ['横机'],
      orders: [{ id: 'o1', productId: 'p1' }],
      processSequenceMode: 'free',
      productionLinkMode: 'order',
      periodStart,
      periodEnd,
      records: [
        {
          type: 'REWORK',
          orderId: 'o1',
          productId: 'p1',
          nodeId: '横机',
          quantity: 10,
          status: '进行中',
          reworkNodeIds: ['横机'],
          timestamp: '2026-06-10T08:00:00',
        },
        {
          type: 'REWORK_REPORT',
          orderId: 'o1',
          productId: 'p1',
          nodeId: '横机',
          quantity: 3,
          timestamp: '2026-06-10T09:00:00',
        },
      ],
    });

    const row = stats.get('横机');
    expect(row?.taskCount).toBe(1);
    expect(row?.pendingQty).toBe(10);
    expect(row?.periodCompletedQty).toBe(3);
    expect(row?.periodNewReworkQty).toBe(10);
    expect(row?.progress).toBe(0);
  });
});
