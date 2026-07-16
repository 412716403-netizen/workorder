/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { getInsertPlan, measureTableGutterLayout } from './tableGutterUtils';

describe('getInsertPlan', () => {
  it('returns null for empty or out-of-range', () => {
    expect(getInsertPlan(0, 0)).toBeNull();
    expect(getInsertPlan(-1, 3)).toBeNull();
    expect(getInsertPlan(4, 3)).toBeNull();
  });

  it('inserts before target index for 0..count-1', () => {
    expect(getInsertPlan(0, 3)).toEqual({ index: 0, where: 'before' });
    expect(getInsertPlan(2, 3)).toEqual({ index: 2, where: 'before' });
  });

  it('inserts after last when index === count', () => {
    expect(getInsertPlan(3, 3)).toEqual({ index: 2, where: 'after' });
  });
});

describe('measureTableGutterLayout', () => {
  it('measures cols/rows relative to wrapper', () => {
    const wrapper = document.createElement('div');
    wrapper.getBoundingClientRect = () =>
      ({ left: 100, top: 50, width: 300, height: 200, right: 400, bottom: 250, x: 100, y: 50, toJSON: () => ({}) });

    const table = document.createElement('table');
    table.getBoundingClientRect = () =>
      ({ left: 120, top: 70, width: 200, height: 100, right: 320, bottom: 170, x: 120, y: 70, toJSON: () => ({}) });

    const row1 = document.createElement('tr');
    row1.getBoundingClientRect = () =>
      ({ left: 120, top: 70, width: 200, height: 40, right: 320, bottom: 110, x: 120, y: 70, toJSON: () => ({}) });
    const c1 = document.createElement('td');
    c1.getBoundingClientRect = () =>
      ({ left: 120, top: 70, width: 80, height: 40, right: 200, bottom: 110, x: 120, y: 70, toJSON: () => ({}) });
    const c2 = document.createElement('td');
    c2.getBoundingClientRect = () =>
      ({ left: 200, top: 70, width: 120, height: 40, right: 320, bottom: 110, x: 200, y: 70, toJSON: () => ({}) });
    row1.append(c1, c2);

    const row2 = document.createElement('tr');
    row2.getBoundingClientRect = () =>
      ({ left: 120, top: 110, width: 200, height: 60, right: 320, bottom: 170, x: 120, y: 110, toJSON: () => ({}) });
    const c3 = document.createElement('td');
    const c4 = document.createElement('td');
    row2.append(c3, c4);

    table.append(row1, row2);

    const layout = measureTableGutterLayout(table, wrapper);
    expect(layout).not.toBeNull();
    expect(layout!.cols).toEqual([
      { offset: 20, size: 80 },
      { offset: 100, size: 120 },
    ]);
    expect(layout!.rows).toEqual([
      { offset: 20, size: 40 },
      { offset: 60, size: 60 },
    ]);
    expect(layout!.tableLeft).toBe(20);
    expect(layout!.tableTop).toBe(20);
    expect(layout!.tableWidth).toBe(200);
    expect(layout!.tableHeight).toBe(100);
  });
});
