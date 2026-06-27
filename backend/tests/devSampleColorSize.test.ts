import { describe, expect, it } from 'vitest';
import { resolveSampleColorSize } from '../src/services/dev-styles.service.js';

const variants = [
  { colorId: 'c1', sizeId: 's1' },
  { colorId: 'c1', sizeId: 's2' },
  { colorId: 'c2', sizeId: 's1' },
];

describe('resolveSampleColorSize', () => {
  it('强制置空当款式无颜色尺码组合时', () => {
    expect(resolveSampleColorSize([], 'c1', 's1')).toEqual({ colorId: null, sizeId: null });
  });

  it('忽略传入值，款式无 variants 时不报错', () => {
    expect(resolveSampleColorSize([], undefined, undefined)).toEqual({ colorId: null, sizeId: null });
  });

  it('款式有颜色尺码时未选择则报错', () => {
    expect(() => resolveSampleColorSize(variants, '', '')).toThrowError(/请选择/);
    expect(() => resolveSampleColorSize(variants, undefined, undefined)).toThrowError(/请选择/);
  });

  it('所选组合不属于款式时报错', () => {
    expect(() => resolveSampleColorSize(variants, 'c2', 's2')).toThrowError(/不属于/);
  });

  it('命中款式组合时归一化返回', () => {
    expect(resolveSampleColorSize(variants, ' c1 ', ' s2 ')).toEqual({ colorId: 'c1', sizeId: 's2' });
  });
});
