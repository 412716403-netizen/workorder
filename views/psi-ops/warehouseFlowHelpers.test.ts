import { describe, it, expect } from 'vitest';
import { computeWarehouseFlowTotals, formatWarehouseFlowQty } from './warehouseFlowHelpers';

describe('computeWarehouseFlowTotals', () => {
  it('采购入库计入入库', () => {
    const t = computeWarehouseFlowTotals([{ type: 'PURCHASE_BILL', quantity: 100, record: {} }]);
    expect(t).toEqual({ inboundTotal: 100, outboundTotal: 0, netChange: 100 });
  });

  it('采购入库与采购退货分别计入入/出', () => {
    const t = computeWarehouseFlowTotals([
      { type: 'PURCHASE_BILL', quantity: 50, record: {} },
      { type: 'PURCHASE_BILL', quantity: -8, record: {} },
    ]);
    expect(t).toEqual({ inboundTotal: 50, outboundTotal: 8, netChange: 42 });
  });

  it('销售出库与销售退货分别计入出/入', () => {
    const t = computeWarehouseFlowTotals([
      { type: 'SALES_BILL', quantity: 30, record: {} },
      { type: 'SALES_BILL', quantity: -5, record: {} },
    ]);
    expect(t).toEqual({ inboundTotal: 5, outboundTotal: 30, netChange: -25 });
  });

  it('盘点按 diffQuantity 正负拆分', () => {
    const t = computeWarehouseFlowTotals([
      { type: 'STOCKTAKE', quantity: 98, record: { diffQuantity: 3 } },
      { type: 'STOCKTAKE', quantity: 40, record: { diffQuantity: -2 } },
    ]);
    expect(t).toEqual({ inboundTotal: 3, outboundTotal: 2, netChange: 1 });
  });

  it('生产入库/退料/领料', () => {
    const t = computeWarehouseFlowTotals([
      { type: 'STOCK_IN', quantity: 50, record: {} },
      { type: 'STOCK_RETURN', quantity: 10, record: {} },
      { type: 'STOCK_OUT', quantity: 20, record: {} },
    ]);
    expect(t).toEqual({ inboundTotal: 60, outboundTotal: 20, netChange: 40 });
  });
});

describe('formatWarehouseFlowQty', () => {
  it('整数不显示小数', () => {
    expect(formatWarehouseFlowQty(100)).toBe('100');
  });

  it('保留有效小数', () => {
    expect(formatWarehouseFlowQty(12.5)).toBe('12.5');
  });
});
