import { describe, expect, it } from 'vitest';
import type { Partner, Product, ProductCategory } from '../types';
import { buildPartnerNameById, resolveProductPartnerName } from './productPartnerDisplay';

const baseCategory: ProductCategory = {
  id: 'cat1',
  name: '成品',
  color: '#000',
  hasProcess: true,
  hasSalesPrice: false,
  hasPurchasePrice: false,
  hasColorSize: false,
  customFields: [],
};

const baseProduct: Product = {
  id: 'p1',
  sku: 'SKU-1',
  name: '毛衣36',
  colorIds: [],
  sizeIds: [],
  variants: [],
  categoryId: 'cat1',
  milestoneNodeIds: [],
};

const partners: Partner[] = [
  { id: 'pt1', name: 'ggz', contact: '', categoryId: 'pc1' } as Partner,
  { id: 'pt2', name: '  ', contact: '', categoryId: 'pc1' } as Partner,
];
const nameById = buildPartnerNameById(partners);

describe('resolveProductPartnerName', () => {
  it('分类开启 linkPartner 且关联有效时返回名称', () => {
    const cat = { ...baseCategory, linkPartner: true };
    const p = { ...baseProduct, supplierId: 'pt1' };
    expect(resolveProductPartnerName(p, cat, nameById)).toBe('ggz');
  });

  it('分类未开启 linkPartner 时不展示', () => {
    const cat = { ...baseCategory, linkPartner: false };
    const p = { ...baseProduct, supplierId: 'pt1' };
    expect(resolveProductPartnerName(p, cat, nameById)).toBeNull();
  });

  it('未关联合作单位时返回 null', () => {
    const cat = { ...baseCategory, linkPartner: true };
    expect(resolveProductPartnerName({ ...baseProduct, supplierId: '' }, cat, nameById)).toBeNull();
    expect(resolveProductPartnerName(baseProduct, cat, nameById)).toBeNull();
  });

  it('合作单位已删除或名称为空时返回 null', () => {
    const cat = { ...baseCategory, linkPartner: true };
    expect(resolveProductPartnerName({ ...baseProduct, supplierId: 'gone' }, cat, nameById)).toBeNull();
    expect(resolveProductPartnerName({ ...baseProduct, supplierId: 'pt2' }, cat, nameById)).toBeNull();
  });

  it('分类缺失时不展示（无法判定开关）', () => {
    const p = { ...baseProduct, supplierId: 'pt1' };
    expect(resolveProductPartnerName(p, null, nameById)).toBeNull();
  });
});
