import { describe, it, expect } from 'vitest';
import {
  AUTO_SKU_LETTERS,
  generateAutoProductSku,
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
  it('AUTO_SKU_LETTERS 去掉了易误读字符 I 和 O', () => {
    expect(AUTO_SKU_LETTERS).not.toContain('I');
    expect(AUTO_SKU_LETTERS).not.toContain('O');
    expect(AUTO_SKU_LETTERS.length).toBe(24);
  });

  it('generateAutoProductSku 返回 形如 [A-Z]{2}<digits>', () => {
    const s = generateAutoProductSku();
    expect(s).toMatch(/^[A-Z]{2}\d+$/);
    expect(AUTO_SKU_LETTERS.includes(s[0]!)).toBe(true);
    expect(AUTO_SKU_LETTERS.includes(s[1]!)).toBe(true);
  });

  it('resolveProductSkuForSave：用户已手填 sku 时原样返回，不会覆盖', () => {
    const p = mkProduct({ sku: 'MY-CODE-1' });
    const out = resolveProductSkuForSave(p, []);
    expect(out.sku).toBe('MY-CODE-1');
    expect(out).toBe(p);
  });

  it('resolveProductSkuForSave：sku 为空或全是空白 → 自动生成符合格式的 sku', () => {
    const out1 = resolveProductSkuForSave(mkProduct({ sku: '' }), []);
    const out2 = resolveProductSkuForSave(mkProduct({ sku: '   ' }), []);
    expect(out1.sku).toMatch(/^[A-Z]{2}\d+$/);
    expect(out2.sku).toMatch(/^[A-Z]{2}\d+$/);
  });

  it('resolveProductSkuForSave：候选与现有产品冲突时会换一个候选（catalog 含同 sku）', () => {
    // 给一个超长冲突列表，但 self-id 应忽略
    const collision = generateAutoProductSku();
    const catalog: Product[] = [
      mkProduct({ id: 'other-1', sku: collision }),
      mkProduct({ id: 'self', sku: collision }), // 同 id，不算冲突
    ];
    const out = resolveProductSkuForSave(mkProduct({ id: 'self', sku: '' }), catalog);
    // 最终 sku 不与 other-1 冲突；与 self 同 id 即使匹配也允许（实际不会，因为是新生成）
    const conflictsOther = catalog.filter(c => c.id !== 'self').some(c => c.sku === out.sku);
    expect(conflictsOther).toBe(false);
    expect(out.sku).toMatch(/^[A-Z]{2}\d+$/);
  });
});
