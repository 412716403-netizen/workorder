import { describe, expect, it } from 'vitest';
import type { GlobalNodeTemplate } from '../types';
import { sortNodeIdsByGlobalOrder } from './globalNodeOrder';

const nodes: GlobalNodeTemplate[] = [
  { id: 'n1', name: '横机', reportTemplate: [], sortOrder: 0 },
  { id: 'n2', name: '套口', reportTemplate: [], sortOrder: 1 },
  { id: 'n3', name: '后道', reportTemplate: [], sortOrder: 2 },
];

describe('sortNodeIdsByGlobalOrder', () => {
  it('按工序节点库 sortOrder 排序', () => {
    expect(sortNodeIdsByGlobalOrder(['n3', 'n1', 'n2'], nodes)).toEqual(['n1', 'n2', 'n3']);
  });

  it('未知 id 排在末尾', () => {
    expect(sortNodeIdsByGlobalOrder(['missing', 'n2', 'n1'], nodes)).toEqual(['n1', 'n2', 'missing']);
  });

  it('不修改原数组', () => {
    const input = ['n3', 'n1'];
    const copy = [...input];
    sortNodeIdsByGlobalOrder(input, nodes);
    expect(input).toEqual(copy);
  });
});
