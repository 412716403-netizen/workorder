import { describe, it, expect } from 'vitest';
import {
  resolveProductSkuForSave,
} from './productSkuAutoGen';
import type { Product } from '../types';

const mkProduct = (over: Partial<Product> = {}): Product => ({
  id: 'p-new',
  name: 'X',
  variants: [],
  ...over,
} as unknown as Product);

describe('productSkuAutoGen', () => {
  it('resolveProductSkuForSave：用户已手填 sku 时 trim 后返回', () => {
    const p = mkProduct({ sku: 'MY-CODE-1' });
    const out = resolveProductSkuForSave(p, []);
    expect(out.sku).toBe('MY-CODE-1');
    expect(out).toBe(p);
  });

  it('resolveProductSkuForSave：sku 为空或全是空白 → 保持空串，不自动生成', () => {
    const out1 = resolveProductSkuForSave(mkProduct({ sku: '' }), []);
    const out2 = resolveProductSkuForSave(mkProduct({ sku: '   ' }), []);
    expect(out1.sku).toBe('');
    expect(out2.sku).toBe('');
  });

  it('resolveProductSkuForSave：sku 为 null/undefined → 规范成空串（避免后续 .trim 抛错）', () => {
    const out1 = resolveProductSkuForSave(mkProduct({ sku: null as unknown as string }), []);
    const out2 = resolveProductSkuForSave(mkProduct({ sku: undefined }), []);
    expect(out1.sku).toBe('');
    expect(out2.sku).toBe('');
  });
});
