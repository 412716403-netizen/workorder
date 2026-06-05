import { describe, expect, it } from 'vitest';
import {
  buildBomPublishTargets,
  effectiveDevBomItems,
  type DevBomRow,
} from '../src/services/dev-publish.helpers.js';

const devBom = (
  id: string,
  opts: Partial<DevBomRow> & { productId?: string; nodeId?: string },
): DevBomRow => ({
  id,
  name: null,
  variantId: opts.variantId ?? null,
  nodeId: opts.nodeId ?? 'node-1',
  items: opts.items ?? [
    {
      categoryId: null,
      productId: opts.productId ?? 'mat-1',
      quantity: 1,
      note: null,
      useShortageOnly: false,
      excludeFromWeightShare: false,
      sortOrder: 0,
    },
  ],
});

describe('effectiveDevBomItems', () => {
  it('drops rows without productId', () => {
    expect(
      effectiveDevBomItems(
        devBom('b1', {
          items: [
            {
              categoryId: null,
              productId: '  ',
              quantity: 1,
              note: null,
              useShortageOnly: false,
              excludeFromWeightShare: false,
              sortOrder: 0,
            },
          ],
        }),
      ),
    ).toHaveLength(0);
  });
});

describe('buildBomPublishTargets', () => {
  it('clones single-sku dev BOM to every variant when style has variants', () => {
    const styleId = 'style-1';
    const variantIdMap = new Map([
      ['dv-1', 'pv-1'],
      ['dv-2', 'pv-2'],
    ]);
    const targets = buildBomPublishTargets(
      [devBom('dbom-1', { variantId: null })],
      [{ id: 'dv-1' }, { id: 'dv-2' }],
      styleId,
      true,
      variantIdMap,
      'pv-1',
    );
    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.productVariantId).sort()).toEqual(['pv-1', 'pv-2']);
    expect(new Set(targets.map((t) => t.newBomId)).size).toBe(2);
  });

  it('maps variant-specific dev BOM to one product variant', () => {
    const variantIdMap = new Map([['dv-1', 'pv-1']]);
    const targets = buildBomPublishTargets(
      [devBom('dbom-1', { variantId: 'dv-1' })],
      [{ id: 'dv-1' }],
      'style-1',
      true,
      variantIdMap,
      'pv-1',
    );
    expect(targets).toHaveLength(1);
    expect(targets[0].productVariantId).toBe('pv-1');
  });

  it('creates one target for single-sku style without variants', () => {
    const targets = buildBomPublishTargets(
      [devBom('dbom-1', { variantId: null })],
      [],
      'style-1',
      false,
      new Map(),
      'pv-default',
    );
    expect(targets).toHaveLength(1);
    expect(targets[0].productVariantId).toBe('pv-default');
  });
});
