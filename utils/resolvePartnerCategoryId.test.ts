import { describe, it, expect } from 'vitest';
import type { PartnerCategory } from '../types';
import { getCustomerCategoryId, getSupplierCategoryId } from './resolvePartnerCategoryId';

const cat = (id: string, name: string): PartnerCategory => ({ id, name, customFields: [] });

describe('getSupplierCategoryId', () => {
  it('空数组返回 undefined', () => {
    expect(getSupplierCategoryId([])).toBeUndefined();
  });

  it('优先精确匹配「供应商」', () => {
    const id = getSupplierCategoryId([cat('a', '客户'), cat('b', '供应商'), cat('c', '外协供应商')]);
    expect(id).toBe('b');
  });

  it('无精确时取名称含「供应商」的第一项', () => {
    const id = getSupplierCategoryId([cat('a', '客户'), cat('b', '核心供应商(战略)')]);
    expect(id).toBe('b');
  });

  it('无匹配返回 undefined', () => {
    expect(getSupplierCategoryId([cat('a', '客户')])).toBeUndefined();
  });
});

describe('getCustomerCategoryId', () => {
  it('空数组返回 undefined', () => {
    expect(getCustomerCategoryId([])).toBeUndefined();
  });

  it('优先精确匹配「客户」', () => {
    const id = getCustomerCategoryId([cat('a', '供应商'), cat('b', '客户')]);
    expect(id).toBe('b');
  });

  it('无精确时取名称含「客户」的第一项', () => {
    const id = getCustomerCategoryId([cat('a', '供应商'), cat('b', 'VIP客户A')]);
    expect(id).toBe('b');
  });

  it('无匹配返回 undefined', () => {
    expect(getCustomerCategoryId([cat('a', '供应商')])).toBeUndefined();
  });
});
