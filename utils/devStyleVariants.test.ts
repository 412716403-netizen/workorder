import { describe, expect, it } from 'vitest';
import type { DevSampleDto, DictionaryItem } from '../types';
import { DevStageStatus } from '../types';
import {
  colorSizeLabel,
  devStyleVariantLabel,
  stageNamesFromDevSample,
  stageNamesFromFirstDevSample,
} from './devStyleVariants';

const mkSample = (name: string, stageNames: string[]): DevSampleDto => ({
  id: `s-${name}`,
  name,
  createdAt: '',
  stages: stageNames.map((n, order) => ({
    id: `st-${name}-${order}`,
    name: n,
    status: DevStageStatus.PENDING,
    order,
    updatedAt: '',
    fields: [],
    attachments: [],
  })),
  logs: [],
});

describe('stageNamesFromFirstDevSample', () => {
  it('uses first sample stage order, not template or last sample', () => {
    const samples = [
      mkSample('头样', ['设计', '制版', '打样']),
      mkSample('二样', ['设计', '评审']),
    ];
    expect(stageNamesFromFirstDevSample(samples)).toEqual(['设计', '制版', '打样']);
  });

  it('returns empty when no samples', () => {
    expect(stageNamesFromFirstDevSample([])).toEqual([]);
  });
});

describe('stageNamesFromDevSample', () => {
  it('sorts by order field', () => {
    const sample = mkSample('头样', ['a', 'b', 'c']);
    sample.stages[0].order = 2;
    sample.stages[1].order = 0;
    sample.stages[2].order = 1;
    expect(stageNamesFromDevSample(sample)).toEqual(['b', 'c', 'a']);
  });
});

const dict = {
  colors: [{ id: 'c1', name: '红色' }] as DictionaryItem[],
  sizes: [{ id: 's1', name: 'M' }] as DictionaryItem[],
};

describe('colorSizeLabel', () => {
  it('颜色与尺码都有时用 / 拼接名称', () => {
    expect(colorSizeLabel('c1', 's1', dict)).toBe('红色 / M');
  });

  it('仅颜色或仅尺码', () => {
    expect(colorSizeLabel('c1', '', dict)).toBe('红色');
    expect(colorSizeLabel('', 's1', dict)).toBe('M');
  });

  it('字典缺失时回退 id，全空时返回空串', () => {
    expect(colorSizeLabel('cX', 's1', dict)).toBe('cX / M');
    expect(colorSizeLabel(undefined, undefined, dict)).toBe('');
  });
});

describe('devStyleVariantLabel', () => {
  it('优先颜色尺码名', () => {
    expect(devStyleVariantLabel({ colorId: 'c1', sizeId: 's1', skuSuffix: '红-M' }, dict)).toBe('红色 / M');
  });

  it('无可解析名称时回退 skuSuffix', () => {
    expect(devStyleVariantLabel({ colorId: '', sizeId: '', skuSuffix: '默认' }, dict)).toBe('默认');
  });
});
