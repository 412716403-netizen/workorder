import { describe, it, expect } from 'vitest';
import {
  uniqueDevBomProductIds,
  buildIssueLines,
  buildReturnLines,
  pickVisibleQty,
  returnableRowKey,
} from '../utils/devMaterialHelpers';
import { shouldExcludeFromProductionMaterialStats, isDevMaterialOpReason } from '../utils/productionMaterialReason';
import { BATCH_NO_UNTAGGED, PROD_OP_REASON_FROM_DEV, PROD_OP_REASON_FROM_REWORK } from '../types';
import type { DevBomDto, DevMaterialReturnableRow } from '../types';

describe('devMaterialHelpers', () => {
  it('uniqueDevBomProductIds de-dupes across variants/nodes', () => {
    const boms = [
      {
        id: 'b1',
        parentStyleId: 's1',
        items: [{ productId: 'm1', quantity: 1 }, { productId: 'm2', quantity: 1 }],
      },
      {
        id: 'b2',
        parentStyleId: 's1',
        items: [{ productId: 'm1', quantity: 2 }, { productId: 'm3', quantity: 1 }],
      },
      {
        id: 'b3',
        parentStyleId: 'other',
        items: [{ productId: 'm9', quantity: 1 }],
      },
    ] as DevBomDto[];
    expect(uniqueDevBomProductIds(boms, 's1').sort()).toEqual(['m1', 'm2', 'm3']);
  });

  it('buildIssueLines skips non-positive and attaches batch when managed', () => {
    const lines = buildIssueLines(
      { m1: 2, m2: 0, m3: 1.5 },
      'wh1',
      { m1: 'B1', m3: '' },
      new Set(['m1', 'm3']),
    );
    expect(lines).toEqual([
      { productId: 'm1', quantity: 2, warehouseId: 'wh1', batchNo: 'B1' },
      { productId: 'm3', quantity: 1.5, warehouseId: 'wh1' },
    ]);
  });

  it('pickVisibleQty drops quantities of collapsed (hidden) rows', () => {
    const qty = { m1: 2, child1: 5, child2: 3 };
    const visible = new Set(['m1', 'child2']);
    expect(pickVisibleQty(qty, visible)).toEqual({ m1: 2, child2: 3 });
    expect(buildIssueLines(pickVisibleQty(qty, visible), 'wh1', {}, new Set())).toEqual([
      { productId: 'm1', quantity: 2, warehouseId: 'wh1' },
      { productId: 'child2', quantity: 3, warehouseId: 'wh1' },
    ]);
  });

  it('buildReturnLines keeps warehouse/batch from returnable rows', () => {
    const returnable: DevMaterialReturnableRow[] = [
      {
        productId: 'm1',
        productName: '面料',
        productSku: 'F1',
        warehouseId: 'wh1',
        batchNo: BATCH_NO_UNTAGGED,
        returnableQty: 5,
      },
    ];
    const key = returnableRowKey(returnable[0]);
    expect(buildReturnLines({ [key]: 3 }, returnable)).toEqual([
      { productId: 'm1', quantity: 3, warehouseId: 'wh1', batchNo: BATCH_NO_UNTAGGED },
    ]);
  });
});

describe('productionMaterialReason', () => {
  it('excludes development and rework from production material stats', () => {
    expect(isDevMaterialOpReason(PROD_OP_REASON_FROM_DEV)).toBe(true);
    expect(shouldExcludeFromProductionMaterialStats(PROD_OP_REASON_FROM_DEV)).toBe(true);
    expect(shouldExcludeFromProductionMaterialStats(PROD_OP_REASON_FROM_REWORK)).toBe(true);
    expect(shouldExcludeFromProductionMaterialStats(undefined)).toBe(false);
    expect(shouldExcludeFromProductionMaterialStats('其它')).toBe(false);
  });
});
