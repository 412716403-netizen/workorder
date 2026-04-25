import { describe, it, expect } from 'vitest';
import { normalizeDecimals } from './formSettingsDefaults';

describe('normalizeDecimals', () => {
  it('converts string quantity to number', () => {
    const input = [{ quantity: '100', name: 'test' }];
    const result = normalizeDecimals(input);
    expect(result[0].quantity).toBe(100);
    expect(result[0].name).toBe('test');
  });

  it('converts string purchasePrice to number', () => {
    const input = [{ purchasePrice: '12.50' }];
    const result = normalizeDecimals(input);
    expect(result[0].purchasePrice).toBe(12.5);
  });

  it('converts non-numeric string to 0', () => {
    const input = [{ quantity: 'abc' }];
    const result = normalizeDecimals(input);
    expect(result[0].quantity).toBe(0);
  });

  it('leaves numeric values unchanged', () => {
    const input = [{ quantity: 42, salesPrice: 9.99 }];
    const result = normalizeDecimals(input);
    expect(result[0].quantity).toBe(42);
    expect(result[0].salesPrice).toBe(9.99);
  });

  it('leaves null/undefined values unchanged', () => {
    const input = [{ quantity: null, salesPrice: undefined }];
    const result = normalizeDecimals(input);
    expect(result[0].quantity).toBeNull();
    expect(result[0].salesPrice).toBeUndefined();
  });

  it('handles empty array', () => {
    expect(normalizeDecimals([])).toEqual([]);
  });

  it('normalizes nested items array', () => {
    const input = [{ items: [{ quantity: '50', unitPrice: '3.5' }] }];
    const result = normalizeDecimals(input);
    expect(result[0].items[0].quantity).toBe(50);
    expect(result[0].items[0].unitPrice).toBe(3.5);
  });

  it('does not affect non-decimal keys', () => {
    const input = [{ name: '123', productId: '456' }];
    const result = normalizeDecimals(input);
    expect(result[0].name).toBe('123');
    expect(result[0].productId).toBe('456');
  });
});
