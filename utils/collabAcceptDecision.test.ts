import { describe, expect, it } from 'vitest';
import type { ProductCategory } from '../types';
import {
  collabAcceptCategoryDisabledForIncomingMatrix,
  initCollabAcceptCategoryFromPayload,
} from './collabAcceptDecision';

describe('collabAcceptCategoryDisabledForIncomingMatrix', () => {
  it('does not disable when incoming has no matrix spec', () => {
    const cat = { id: 'c', name: 'X', hasColorSize: false, hasBatchManagement: false } as ProductCategory;
    expect(collabAcceptCategoryDisabledForIncomingMatrix(cat, false)).toBe(false);
  });

  it('disables when incoming has spec but category has no color/size', () => {
    const cat = { id: 'c', name: 'X', hasColorSize: false, hasBatchManagement: false } as ProductCategory;
    expect(collabAcceptCategoryDisabledForIncomingMatrix(cat, true)).toBe(true);
  });

  it('does not disable color-size category when incoming has spec', () => {
    const cat = { id: 'c', name: 'X', hasColorSize: true, hasBatchManagement: false } as ProductCategory;
    expect(collabAcceptCategoryDisabledForIncomingMatrix(cat, true)).toBe(false);
  });

  it('disables batch-only category when incoming has spec', () => {
    const cat = { id: 'c', name: 'X', hasColorSize: false, hasBatchManagement: true } as ProductCategory;
    expect(collabAcceptCategoryDisabledForIncomingMatrix(cat, true)).toBe(true);
  });
});

describe('initCollabAcceptCategoryFromPayload', () => {
  const cats: ProductCategory[] = [
    { id: 'c1', name: '成衣', hasColorSize: true, hasBatchManagement: false } as ProductCategory,
  ];

  it('defaults to existing with empty id when payload category empty', () => {
    expect(initCollabAcceptCategoryFromPayload('', [])).toEqual({
      categoryDecision: 'existing',
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

  it('uses create when name matches but category cannot hold incoming matrix spec', () => {
    const noColor = { id: 'c0', name: '无码类', hasColorSize: false, hasBatchManagement: false } as ProductCategory;
    expect(initCollabAcceptCategoryFromPayload('无码类', [noColor, ...cats], { hasIncomingMatrixSpec: true })).toEqual({
      categoryDecision: 'create',
      categoryId: '',
      categoryNameToCreate: '无码类',
    });
  });
});
