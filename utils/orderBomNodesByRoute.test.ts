import { describe, expect, it } from 'vitest';
import type { GlobalNodeTemplate } from '../types';
import { orderBomNodesByRoute } from './orderBomNodesByRoute';

const nodes = [
  { id: 'n1', name: '裁剪', hasBOM: true },
  { id: 'n2', name: '缝制', hasBOM: false },
  { id: 'n3', name: '包装', hasBOM: true },
] as GlobalNodeTemplate[];

describe('orderBomNodesByRoute', () => {
  it('严格按基本信息路线排序，并过滤非 BOM 与失效节点', () => {
    expect(orderBomNodesByRoute(['n3', 'missing', 'n2', 'n1'], nodes).map((n) => n.id))
      .toEqual(['n3', 'n1']);
  });

  it('基本信息移除工序后，BOM 矩阵不再返回该工序', () => {
    expect(orderBomNodesByRoute(['n1'], nodes).map((n) => n.id)).toEqual(['n1']);
  });
});
