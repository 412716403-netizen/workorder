import { describe, it, expect } from 'vitest';
import { resolvePrintPlaceholders } from './printResolve';
import type { Partner, Product, ProductCategory, PrintRenderContext } from '../types';

const product: Product = {
  id: 'prod-1',
  name: 'WL-001',
  sku: '纯棉纱线',
  categoryId: 'cat-1',
  supplierId: 'partner-1',
  colorIds: [],
  sizeIds: [],
  variants: [],
  milestoneNodeIds: [],
};

const categoryOn: ProductCategory = {
  id: 'cat-1',
  name: '原料',
  color: '',
  hasProcess: false,
  hasSalesPrice: false,
  hasPurchasePrice: false,
  hasColorSize: false,
  linkPartner: true,
  customFields: [],
};

const categoryOff: ProductCategory = { ...categoryOn, linkPartner: false };

const partners: Partner[] = [{ id: 'partner-1', name: '甲纺织', contact: '' }];

describe('resolvePrintPlaceholders 产品.partner', () => {
  it('分类开启 linkPartner 时输出合作单位名称', () => {
    const ctx: PrintRenderContext = {
      product,
      partners,
      productCategories: [categoryOn],
    };
    expect(resolvePrintPlaceholders('单位：{{产品.partner}}', ctx)).toBe('单位：甲纺织');
  });

  it('分类未开启 linkPartner 时为空', () => {
    const ctx: PrintRenderContext = {
      product,
      partners,
      productCategories: [categoryOff],
    };
    expect(resolvePrintPlaceholders('{{产品.partner}}', ctx)).toBe('');
  });

  it('未注入分类清单时仍按 supplierId 解析名称', () => {
    const ctx: PrintRenderContext = { product, partners };
    expect(resolvePrintPlaceholders('{{产品.partner}}', ctx)).toBe('甲纺织');
  });

  it('未关联合作单位时为空', () => {
    const ctx: PrintRenderContext = {
      product: { ...product, supplierId: undefined },
      partners,
      productCategories: [categoryOn],
    };
    expect(resolvePrintPlaceholders('{{产品.partner}}', ctx)).toBe('');
  });
});
