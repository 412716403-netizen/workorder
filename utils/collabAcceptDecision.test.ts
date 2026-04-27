import { describe, expect, it } from 'vitest';
import type { ProductCategory } from '../types';
import { initCollabAcceptCategoryFromPayload } from './collabAcceptDecision';

describe('initCollabAcceptCategoryFromPayload', () => {
  const cats: ProductCategory[] = [
    { id: 'c1', name: '成衣', hasColorSize: true, hasBatchManagement: false } as ProductCategory,
  ];

  it('returns none when payload category empty', () => {
    expect(initCollabAcceptCategoryFromPayload('', [])).toEqual({
      categoryDecision: 'none',
      categoryId: '',
      categoryNameToCreate: '',
    });
  });

  it('matches existing by name', () => {
    expect(initCollabAcceptCategoryFromPayload('成衣', cats)).toEqual({
      categoryDecision: 'existing',
      categoryId: 'c1',
      categoryNameToCreate: '成衣',
    });
  });

  it('defaults to create when name not found', () => {
    expect(initCollabAcceptCategoryFromPayload('原料', cats)).toEqual({
      categoryDecision: 'create',
      categoryId: '',
      categoryNameToCreate: '原料',
    });
  });
});
