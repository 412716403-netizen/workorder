import { describe, expect, it } from 'vitest';
import { aggregatePartnerMaterialsByProduct } from './stockMaterialPanelHelpers';

describe('aggregatePartnerMaterialsByProduct', () => {
  it('按 productId 跨 scope 汇总领退料与报工耗材', () => {
    const rows = aggregatePartnerMaterialsByProduct([
      [
        { productId: 'm1', issue: 10, returnQty: 2, theoryCost: 3, actualCost: 1 },
        { productId: 'm2', issue: 5, returnQty: 0, theoryCost: 0, actualCost: 0 },
      ],
      [
        { productId: 'm1', issue: 4, returnQty: 1, theoryCost: 2, actualCost: 0.5 },
        { productId: 'm3', issue: 1, returnQty: 0, theoryCost: 1, actualCost: 0 },
      ],
    ]);

    const m1 = rows.find(r => r.productId === 'm1');
    expect(m1).toEqual({
      productId: 'm1',
      issue: 14,
      returnQty: 3,
      theoryCost: 5,
      actualCost: 1.5,
    });
    expect(rows).toHaveLength(3);
  });
});
