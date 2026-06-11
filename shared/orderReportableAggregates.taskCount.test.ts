import { describe, expect, it } from 'vitest';
import { countActiveTasksAtTemplate } from './orderReportableAggregates.js';
import type { ReportableOrder, ReportablePmp } from './orderReportableAggregates.js';

const orders: ReportableOrder[] = [
  {
    id: 'o1',
    productId: 'p1',
    items: [{ quantity: 10 }],
    milestones: [
      { id: 'm1', templateId: '横机' },
      { id: 'm2', templateId: '缝盘' },
    ],
  },
  {
    id: 'o2',
    productId: 'p1',
    items: [{ quantity: 5 }],
    milestones: [{ id: 'm3', templateId: '横机' }],
  },
  {
    id: 'o3',
    productId: 'p2',
    items: [{ quantity: 8 }],
    milestones: [{ id: 'm4', templateId: '横机' }],
  },
];

const pmp: ReportablePmp[] = [
  { productId: 'p3', milestoneTemplateId: '横机', completedQuantity: 2 },
];

describe('countActiveTasksAtTemplate', () => {
  it('工单模式：按未完工工单数计', () => {
    expect(countActiveTasksAtTemplate('横机', orders, pmp, false)).toBe(3);
    expect(countActiveTasksAtTemplate('缝盘', orders, pmp, false)).toBe(1);
  });

  it('产品模式：按产品去重计', () => {
    expect(countActiveTasksAtTemplate('横机', orders, pmp, true)).toBe(3);
    expect(countActiveTasksAtTemplate('缝盘', orders, pmp, true)).toBe(1);
  });

  it('产品模式：仅有 PMP 无工单里程碑的产品也计入', () => {
    expect(countActiveTasksAtTemplate('横机', [], pmp, true)).toBe(1);
  });
});
