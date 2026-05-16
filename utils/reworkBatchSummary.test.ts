import { describe, it, expect } from 'vitest';
import {
  sumBatchTotalQty,
  sumBatchTotalAmount,
  pickUniqueUnitPrice,
  uniqOutsourcePartnersInBatch,
  uniqOperatorsInBatch,
} from './reworkBatchSummary';

describe('sumBatchTotalQty', () => {
  it('空 batch → 0', () => {
    expect(sumBatchTotalQty([])).toBe(0);
  });
  it('累加 quantity，null/undefined 视为 0', () => {
    expect(sumBatchTotalQty([{ quantity: 3 }, { quantity: 5 }, { quantity: null }, {}])).toBe(8);
  });
});

describe('sumBatchTotalAmount', () => {
  it('amount > 0 直接计', () => {
    expect(sumBatchTotalAmount([{ amount: 12 }, { amount: 3 }])).toBe(15);
  });
  it('amount 缺 / 为 0 时回退到 unitPrice * quantity', () => {
    expect(sumBatchTotalAmount([
      { amount: 0, unitPrice: 2, quantity: 5 },
      { unitPrice: 1.5, quantity: 4 },
    ])).toBe(16);
  });
  it('amount 和 unitPrice 都没有 → 该行贡献 0', () => {
    expect(sumBatchTotalAmount([{}, { quantity: 100 }])).toBe(0);
  });
});

describe('pickUniqueUnitPrice', () => {
  it('无任何正单价 → null', () => {
    expect(pickUniqueUnitPrice([])).toBeNull();
    expect(pickUniqueUnitPrice([{ unitPrice: 0 }, { unitPrice: null }])).toBeNull();
  });
  it('所有正单价相同 → 该价', () => {
    expect(pickUniqueUnitPrice([{ unitPrice: 5 }, { unitPrice: 5 }, { unitPrice: 5 }])).toBe(5);
  });
  it('多种单价混合 → null', () => {
    expect(pickUniqueUnitPrice([{ unitPrice: 5 }, { unitPrice: 6 }])).toBeNull();
  });
  it('忽略 unitPrice <= 0 的行', () => {
    expect(pickUniqueUnitPrice([{ unitPrice: 5 }, { unitPrice: 0 }, { unitPrice: 5 }])).toBe(5);
  });
});

describe('uniqOutsourcePartnersInBatch', () => {
  it('trim + 去重 + 去空', () => {
    expect(uniqOutsourcePartnersInBatch([
      { partner: '工厂A' }, { partner: ' 工厂A ' }, { partner: '工厂B' }, { partner: '' }, { partner: null },
    ])).toEqual(['工厂A', '工厂B']);
  });
});

describe('uniqOperatorsInBatch', () => {
  it('trim + 去重 + 去空', () => {
    expect(uniqOperatorsInBatch([
      { operator: '张三' }, { operator: '张三' }, { operator: '李四' }, { operator: ' ' },
    ])).toEqual(['张三', '李四']);
  });
});
