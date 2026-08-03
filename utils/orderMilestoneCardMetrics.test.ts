import { describe, expect, it } from 'vitest';
import { buildOrderMilestoneCardMetrics } from './orderMilestoneCardMetrics';
import type { Milestone } from '../types';

const ms = (id: string, templateId: string, name: string, completedQuantity: number): Milestone =>
  ({ id, templateId, name, completedQuantity, status: 'PENDING', reports: [] } as unknown as Milestone);

const noDefect = () => ({ defective: 0, rework: 0 });

describe('buildOrderMilestoneCardMetrics', () => {
  const milestones = [ms('m1', 't1', '缝制', 60), ms('m2', 't2', '整烫', 20)];

  it('自由模式下每道工序可报都是下单总量', () => {
    const out = buildOrderMilestoneCardMetrics(milestones, {
      productionLinkMode: 'order',
      processSequenceMode: 'free',
      outOfSequenceTemplateIds: new Set(),
      orderTotalQty: 100,
      productTotalAcrossOrders: 100,
      pmpCompletedAt: () => 0,
      getDefectiveRework: noDefect,
    });
    expect(out.map(x => x.availableQty)).toEqual([100, 100]);
    expect(out.map(x => x.remaining)).toEqual([40, 80]);
  });

  it('顺序模式下后道可报取上道已完成量', () => {
    const out = buildOrderMilestoneCardMetrics(milestones, {
      productionLinkMode: 'order',
      processSequenceMode: 'sequential',
      outOfSequenceTemplateIds: new Set(),
      orderTotalQty: 100,
      productTotalAcrossOrders: 100,
      pmpCompletedAt: () => 0,
      getDefectiveRework: noDefect,
    });
    expect(out[0].availableQty).toBe(100);
    expect(out[1].availableQty).toBe(60);
    expect(out[1].remaining).toBe(40);
  });

  it('脱链工序不受上道限制', () => {
    const out = buildOrderMilestoneCardMetrics(milestones, {
      productionLinkMode: 'order',
      processSequenceMode: 'sequential',
      outOfSequenceTemplateIds: new Set(['t2']),
      orderTotalQty: 100,
      productTotalAcrossOrders: 100,
      pmpCompletedAt: () => 0,
      getDefectiveRework: noDefect,
    });
    expect(out[1].availableQty).toBe(100);
  });

  it('可报扣不良、加返工完成，且不为负', () => {
    const out = buildOrderMilestoneCardMetrics([milestones[0]], {
      productionLinkMode: 'order',
      processSequenceMode: 'free',
      outOfSequenceTemplateIds: new Set(),
      orderTotalQty: 100,
      productTotalAcrossOrders: 100,
      pmpCompletedAt: () => 0,
      getDefectiveRework: () => ({ defective: 30, rework: 5 }),
    });
    expect(out[0].availableQty).toBe(75);

    const clamped = buildOrderMilestoneCardMetrics([milestones[0]], {
      productionLinkMode: 'order',
      processSequenceMode: 'free',
      outOfSequenceTemplateIds: new Set(),
      orderTotalQty: 10,
      productTotalAcrossOrders: 10,
      pmpCompletedAt: () => 0,
      getDefectiveRework: () => ({ defective: 999, rework: 0 }),
    });
    expect(clamped[0].availableQty).toBe(0);
  });

  it('关联产品模式按工单数量占比摊回产品池已报量', () => {
    const out = buildOrderMilestoneCardMetrics([ms('m1', 't1', '缝制', 0)], {
      productionLinkMode: 'product',
      processSequenceMode: 'free',
      outOfSequenceTemplateIds: new Set(),
      orderTotalQty: 25,
      productTotalAcrossOrders: 100,
      pmpCompletedAt: () => 80,
      getDefectiveRework: noDefect,
    });
    expect(out[0].pmpShare).toBe(20);
    expect(out[0].currentCompleted).toBe(20);
  });

  it('关联工单模式不摊回产品池已报量', () => {
    const out = buildOrderMilestoneCardMetrics([ms('m1', 't1', '缝制', 5)], {
      productionLinkMode: 'order',
      processSequenceMode: 'free',
      outOfSequenceTemplateIds: new Set(),
      orderTotalQty: 25,
      productTotalAcrossOrders: 100,
      pmpCompletedAt: () => 80,
      getDefectiveRework: noDefect,
    });
    expect(out[0].pmpShare).toBe(0);
    expect(out[0].currentCompleted).toBe(5);
  });
});
