import { describe, it, expect } from 'vitest';
import {
  getActiveOrderIdsCsv,
  getActiveSourceProductIdsCsv,
  buildNodeWeightEnabledMap,
} from './stockMaterialHelpers';

describe('getActiveOrderIdsCsv', () => {
  it('空列表 → 空字符串', () => {
    expect(getActiveOrderIdsCsv([])).toBe('');
  });
  it('多工单按入参顺序拼接', () => {
    expect(getActiveOrderIdsCsv([{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }])).toBe('o1,o2,o3');
  });
  it('过滤掉空 id', () => {
    expect(getActiveOrderIdsCsv([{ id: 'o1' }, { id: '' }, { id: 'o2' }])).toBe('o1,o2');
  });
});

describe('getActiveSourceProductIdsCsv', () => {
  it('空 / 无 productId → 空字符串', () => {
    expect(getActiveSourceProductIdsCsv([])).toBe('');
    expect(getActiveSourceProductIdsCsv([{ productId: '' as unknown as string }])).toBe('');
  });
  it('重复 productId 去重', () => {
    expect(getActiveSourceProductIdsCsv([
      { productId: 'p1' },
      { productId: 'p2' },
      { productId: 'p1' },
    ])).toBe('p1,p2');
  });
});

describe('buildNodeWeightEnabledMap', () => {
  it('空 / null 输入 → 空 Map', () => {
    expect(buildNodeWeightEnabledMap([]).size).toBe(0);
    expect(buildNodeWeightEnabledMap(null).size).toBe(0);
    expect(buildNodeWeightEnabledMap(undefined).size).toBe(0);
  });
  it('正确反映 enableWeightOnReport', () => {
    const m = buildNodeWeightEnabledMap([
      { id: 'n1', enableWeightOnReport: true },
      { id: 'n2', enableWeightOnReport: false },
      { id: 'n3' }, // 缺字段 → 视为 false
    ]);
    expect(m.get('n1')).toBe(true);
    expect(m.get('n2')).toBe(false);
    expect(m.get('n3')).toBe(false);
    expect(m.size).toBe(3);
  });
  it('忽略缺少 id 的节点', () => {
    const m = buildNodeWeightEnabledMap([
      { id: 'n1', enableWeightOnReport: true },
      { enableWeightOnReport: true },
      { id: '', enableWeightOnReport: true },
    ]);
    expect(m.size).toBe(1);
    expect(m.has('n1')).toBe(true);
  });
});
