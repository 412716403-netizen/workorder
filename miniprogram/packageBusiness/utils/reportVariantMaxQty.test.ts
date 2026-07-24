import { describe, it, expect } from 'vitest';
// @ts-expect-error -- 小程序 CommonJS 工具，无类型声明
import { buildVariantMaxGoodMap, getSeqRemainingForVariant } from './reportVariantMaxQty.js';

/**
 * 回归：计划单只下单单一规格（如白色 11 件）时，
 * 报工详情按规格「最多可报」不得把总量回退给其它未下单的规格（黑/灰应为 0）。
 */
describe('reportVariantMaxQty · 单规格工单不回退到其它规格', () => {
  const order = {
    id: 'o1',
    items: [{ variantId: 'v-white', quantity: 11 }],
    milestones: [
      { id: 'm1', templateId: 'tpl-1', completedQuantity: 0, reports: [] },
    ],
  };
  const milestone = order.milestones[0];
  const product = {
    variants: [{ id: 'v-white' }, { id: 'v-black' }, { id: 'v-gray' }],
  };
  const opts = { processSequenceMode: 'sequential', outOfSequenceTemplateIds: new Set() };

  it('明细带规格时，其它规格可报为 0', () => {
    const map = buildVariantMaxGoodMap(order, milestone, product, opts, []);
    expect(map['v-white']).toBe(11);
    expect(map['v-black']).toBe(0);
    expect(map['v-gray']).toBe(0);
  });

  it('明细未带规格（历史工单）时，各规格仍共用总量', () => {
    const legacyOrder = {
      ...order,
      items: [{ variantId: null, quantity: 11 }],
    };
    expect(getSeqRemainingForVariant(legacyOrder, 'tpl-1', 'v-black', opts)).toBe(11);
  });
});
