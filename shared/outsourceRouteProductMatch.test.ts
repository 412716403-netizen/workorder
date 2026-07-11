import { describe, it, expect } from 'vitest';
import {
  outsourceRouteNodeIdsInOrder,
  outsourceRouteMatchesProductMilestones,
  outsourceRouteMatchesAllProductMilestones,
} from './outsourceRouteProductMatch';

describe('outsourceRouteNodeIdsInOrder', () => {
  it('按 stepOrder 排序并提取 nodeId', () => {
    expect(
      outsourceRouteNodeIdsInOrder([
        { stepOrder: 2, nodeId: 'n2' },
        { stepOrder: 0, nodeId: 'n0' },
        { stepOrder: 1, nodeId: 'n1' },
      ]),
    ).toEqual(['n0', 'n1', 'n2']);
  });

  it('忽略无 nodeId 的步骤', () => {
    expect(
      outsourceRouteNodeIdsInOrder([
        { stepOrder: 0, nodeId: 'n1' },
        { stepOrder: 1, nodeId: '' },
        { stepOrder: 2 },
      ]),
    ).toEqual(['n1']);
  });
});

describe('outsourceRouteMatchesProductMilestones', () => {
  const product = ['横机', '缩绒', '套口'];

  it('工序与顺序完全一致时匹配', () => {
    expect(
      outsourceRouteMatchesProductMilestones(
        [
          { stepOrder: 0, nodeId: '横机' },
          { stepOrder: 1, nodeId: '缩绒' },
          { stepOrder: 2, nodeId: '套口' },
        ],
        product,
      ),
    ).toBe(true);
  });

  it('少一道工序时不匹配', () => {
    expect(
      outsourceRouteMatchesProductMilestones(
        [
          { stepOrder: 0, nodeId: '横机' },
          { stepOrder: 1, nodeId: '套口' },
        ],
        product,
      ),
    ).toBe(false);
  });

  it('多一道工序时不匹配', () => {
    expect(
      outsourceRouteMatchesProductMilestones(
        [
          { stepOrder: 0, nodeId: '横机' },
          { stepOrder: 1, nodeId: '缩绒' },
          { stepOrder: 2, nodeId: '套口' },
          { stepOrder: 3, nodeId: '整烫' },
        ],
        product,
      ),
    ).toBe(false);
  });

  it('工序相同但顺序不同时匹配', () => {
    expect(
      outsourceRouteMatchesProductMilestones(
        [
          { stepOrder: 0, nodeId: '横机' },
          { stepOrder: 1, nodeId: '套口' },
          { stepOrder: 2, nodeId: '缩绒' },
        ],
        product,
      ),
    ).toBe(false);
  });

  it('产品未配置工序时不匹配非空路线', () => {
    expect(
      outsourceRouteMatchesProductMilestones([{ stepOrder: 0, nodeId: '横机' }], []),
    ).toBe(false);
  });
});

describe('outsourceRouteMatchesAllProductMilestones', () => {
  const route = [
    { stepOrder: 0, nodeId: '横机' },
    { stepOrder: 1, nodeId: '缩绒' },
    { stepOrder: 2, nodeId: '套口' },
  ];
  const sameProduct = ['横机', '缩绒', '套口'];

  it('全部产品工序一致时匹配', () => {
    expect(
      outsourceRouteMatchesAllProductMilestones(route, [sameProduct, sameProduct]),
    ).toBe(true);
  });

  it('任一产品工序不一致时不匹配', () => {
    expect(
      outsourceRouteMatchesAllProductMilestones(route, [sameProduct, ['横机', '套口']]),
    ).toBe(false);
  });

  it('无产品时一律不匹配', () => {
    expect(outsourceRouteMatchesAllProductMilestones(route, [])).toBe(false);
  });
});
