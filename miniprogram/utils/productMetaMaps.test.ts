import { createRequire } from 'module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const { buildProductMetaMaps, buildProductMap } = require('./productMetaMaps.js');

describe('buildProductMetaMaps', () => {
  it('装配产品 / 分类 / 合作单位三张表', () => {
    const maps = buildProductMetaMaps({
      products: [{ id: 'p1', name: 'WW-001', sku: '圆领毛衣' }],
      categories: [{ id: 'c1', linkPartner: true }],
      partners: [{ id: 's1', name: '张三加工厂' }],
    });
    expect(maps.productMap.get('p1').sku).toBe('圆领毛衣');
    expect(maps.categoryMap.get('c1').linkPartner).toBe(true);
    expect(maps.partnerNameById.get('s1')).toBe('张三加工厂');
  });

  it('接受 { data: [] } 分页响应体', () => {
    const maps = buildProductMetaMaps({
      products: { data: [{ id: 'p1', name: 'WW-001' }] },
      categories: { data: [{ id: 'c1' }] },
      partners: { data: [{ id: 's1', name: '张三加工厂' }] },
    });
    expect(maps.productMap.size).toBe(1);
    expect(maps.categoryMap.size).toBe(1);
    expect(maps.partnerNameById.size).toBe(1);
  });

  it('缺参数时返回空表而不抛错', () => {
    const maps = buildProductMetaMaps(undefined);
    expect(maps.productMap.size).toBe(0);
    expect(maps.categoryMap.size).toBe(0);
    expect(maps.partnerNameById.size).toBe(0);
  });

  it('id 统一按字符串做键', () => {
    expect(buildProductMap([{ id: 12, name: 'WW-001' }]).get('12').name).toBe('WW-001');
  });

  it('跳过没有 id 的脏数据', () => {
    expect(buildProductMap([{ name: 'WW-001' }, null, { id: 'p1' }]).size).toBe(1);
  });
});
