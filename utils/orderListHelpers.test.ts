import { describe, it, expect } from 'vitest';
import { getRootOrderNumber, reworkRemainingAtNode } from './orderListHelpers';
import type { ProductionOpRecord } from '../types';

const mkRework = (over: Partial<ProductionOpRecord>): ProductionOpRecord => ({
  id: 'r-1',
  type: 'REWORK',
  orderId: 'o-1',
  productId: 'p-1',
  quantity: 10,
  status: '进行中',
  reworkNodeIds: [],
  completedNodeIds: [],
  reworkCompletedQuantityByNode: {},
  ...over,
} as unknown as ProductionOpRecord);

describe('getRootOrderNumber', () => {
  it('剥离末尾 -数字 直到无可剥离', () => {
    expect(getRootOrderNumber('WO2-1-2')).toBe('WO2');
    expect(getRootOrderNumber('WO2-1')).toBe('WO2');
    expect(getRootOrderNumber('WO2')).toBe('WO2');
  });

  it('两位以上数字仍剥离 (-99 上限)', () => {
    expect(getRootOrderNumber('A-12-3')).toBe('A');
    expect(getRootOrderNumber('A-99')).toBe('A');
  });

  it('三位及以上数字不再剥离 (避免误伤日期/批号)', () => {
    expect(getRootOrderNumber('MO-2024')).toBe('MO-2024');
    expect(getRootOrderNumber('MO-2024-1')).toBe('MO-2024');
  });

  it('空字符串/undefined → 空字符串', () => {
    expect(getRootOrderNumber('')).toBe('');
    expect(getRootOrderNumber(undefined as unknown as string)).toBe('');
  });
});

describe('reworkRemainingAtNode', () => {
  it('nodeId 不在路径上 → 0', () => {
    const r = mkRework({ reworkNodeIds: ['n1', 'n2'], quantity: 5 });
    expect(reworkRemainingAtNode(r, 'n3', 'sequential')).toBe(0);
  });

  it('自由模式：剩余 = 总量 - 本节点已完成', () => {
    const r = mkRework({ reworkNodeIds: ['n1', 'n2'], quantity: 10, reworkCompletedQuantityByNode: { n2: 3 } });
    expect(reworkRemainingAtNode(r, 'n2', 'free')).toBe(7);
  });

  it('顺序模式：第一道工序剩余 = 总量 - 本道完成', () => {
    const r = mkRework({ reworkNodeIds: ['n1', 'n2'], quantity: 10, reworkCompletedQuantityByNode: { n1: 4 } });
    expect(reworkRemainingAtNode(r, 'n1', 'sequential')).toBe(6);
  });

  it('顺序模式：第二道剩余 = min(上道完成, 总量) - 本道完成', () => {
    const r = mkRework({ reworkNodeIds: ['n1', 'n2'], quantity: 10, reworkCompletedQuantityByNode: { n1: 7, n2: 2 } });
    expect(reworkRemainingAtNode(r, 'n2', 'sequential')).toBe(5);
  });

  it('completedNodeIds 列出的节点视为已全数完成', () => {
    const r = mkRework({ reworkNodeIds: ['n1'], quantity: 10, completedNodeIds: ['n1'] });
    expect(reworkRemainingAtNode(r, 'n1', 'free')).toBe(0);
  });

  it('回退到 nodeId 单节点路径', () => {
    const r = mkRework({ reworkNodeIds: undefined, nodeId: 'nx', quantity: 8 });
    expect(reworkRemainingAtNode(r, 'nx', 'free')).toBe(8);
  });
});
