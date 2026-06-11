import { describe, expect, it } from 'vitest';
import { computeOutsourceStatsByTemplate } from './outsourceStatsAggregates.js';

const periodStart = new Date('2026-06-01T00:00:00');
const periodEnd = new Date('2026-06-11T23:59:59');

describe('computeOutsourceStatsByTemplate', () => {
  it('按工序汇总待收回与任务数', () => {
    const stats = computeOutsourceStatsByTemplate({
      templateIds: ['横机'],
      records: [
        {
          type: 'OUTSOURCE',
          orderId: 'o1',
          productId: 'p1',
          nodeId: '横机',
          partner: 'A厂',
          quantity: 10,
          status: '加工中',
          sourceReworkId: null,
          timestamp: '2026-06-10T10:00:00',
        },
        {
          type: 'OUTSOURCE',
          orderId: 'o1',
          productId: 'p1',
          nodeId: '横机',
          partner: 'A厂',
          quantity: 4,
          status: '已收回',
          sourceReworkId: null,
          timestamp: '2026-06-10T12:00:00',
        },
        {
          type: 'OUTSOURCE',
          orderId: 'o2',
          productId: 'p2',
          nodeId: '横机',
          partner: 'B厂',
          quantity: 5,
          status: '加工中',
          sourceReworkId: null,
          timestamp: '2026-06-09T10:00:00',
        },
      ],
      periodStart,
      periodEnd,
    });

    const row = stats.get('横机');
    expect(row?.taskCount).toBe(2);
    expect(row?.pendingQty).toBe(11);
    expect(row?.periodDispatchedQty).toBe(15);
    expect(row?.periodReceivedQty).toBe(4);
    expect(row?.progress).toBe(Math.round((4 / 19) * 100));
  });
});
