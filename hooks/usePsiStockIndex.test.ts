// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePsiStockIndex } from './usePsiStockIndex';

/**
 * usePsiStockIndex 是纯函数 hook（无 react-query / fetch 依赖），
 * 这里直接用 renderHook 喂数据，断言派生函数输出。
 *
 * 库存净值口径：(psiIn + transferIn + prodIn) - (psiOut + transferOut + prodOut) + stocktakeAdj
 */

describe('usePsiStockIndex', () => {
  const productA = 'p-a';
  const warehouseA = 'wh-a';
  const warehouseB = 'wh-b';
  const variantA = 'v-a';

  it('空数组返回 0 库存', () => {
    const { result } = renderHook(() => usePsiStockIndex([], []));
    expect(result.current.getStock(productA, warehouseA)).toBe(0);
    expect(result.current.getStockVariant(productA, warehouseA, variantA)).toBe(0);
    expect(result.current.listAvailableBatches(productA, warehouseA)).toEqual([]);
  });

  it('PURCHASE_BILL 入库 + SALES_BILL 出库正确算净值', () => {
    const psi = [
      { id: '1', type: 'PURCHASE_BILL', productId: productA, warehouseId: warehouseA, quantity: 100 },
      { id: '2', type: 'PURCHASE_BILL', productId: productA, warehouseId: warehouseA, quantity: 50 },
      { id: '3', type: 'SALES_BILL', productId: productA, warehouseId: warehouseA, quantity: 30 },
    ];
    const { result } = renderHook(() => usePsiStockIndex(psi, []));
    expect(result.current.getStock(productA, warehouseA)).toBe(120);
  });

  it('TRANSFER 同时增减 fromWh 与 toWh', () => {
    const psi = [
      { id: '1', type: 'PURCHASE_BILL', productId: productA, warehouseId: warehouseA, quantity: 100 },
      { id: '2', type: 'TRANSFER', productId: productA, fromWarehouseId: warehouseA, toWarehouseId: warehouseB, quantity: 40 },
    ];
    const { result } = renderHook(() => usePsiStockIndex(psi, []));
    expect(result.current.getStock(productA, warehouseA)).toBe(60);
    expect(result.current.getStock(productA, warehouseB)).toBe(40);
  });

  it('生产流水 STOCK_IN/STOCK_OUT/STOCK_RETURN 计入净值', () => {
    const prod = [
      { id: 'p1', type: 'STOCK_IN', productId: productA, warehouseId: warehouseA, quantity: 20 },
      { id: 'p2', type: 'STOCK_OUT', productId: productA, warehouseId: warehouseA, quantity: 5 },
      { id: 'p3', type: 'STOCK_RETURN', productId: productA, warehouseId: warehouseA, quantity: 3 },
    ];
    const { result } = renderHook(() => usePsiStockIndex([], prod));
    expect(result.current.getStock(productA, warehouseA)).toBe(18); // 20 - 5 + 3
  });

  it('getBatchStock 与 listAvailableBatches 按批次聚合', () => {
    const psi = [
      { id: '1', type: 'PURCHASE_BILL', productId: productA, warehouseId: warehouseA, quantity: 50, batchNo: 'B-1' },
      { id: '2', type: 'PURCHASE_BILL', productId: productA, warehouseId: warehouseA, quantity: 30, batchNo: 'B-2' },
      { id: '3', type: 'SALES_BILL', productId: productA, warehouseId: warehouseA, quantity: 10, batchNo: 'B-1' },
    ];
    const { result } = renderHook(() => usePsiStockIndex(psi, []));
    expect(result.current.getBatchStock(productA, warehouseA, 'B-1')).toBe(40);
    expect(result.current.getBatchStock(productA, warehouseA, 'B-2')).toBe(30);
    expect(result.current.getBatchStock(productA, warehouseA, 'B-missing')).toBe(0);

    const batches = result.current.listAvailableBatches(productA, warehouseA);
    expect(batches).toHaveLength(2);
    expect(batches.find(b => b.batchNo === 'B-1')?.stock).toBe(40);
    expect(batches.find(b => b.batchNo === 'B-2')?.stock).toBe(30);
  });

  it('STOCKTAKE 调整 + excludeDocNumber 排除自身', () => {
    const psi = [
      { id: '1', type: 'PURCHASE_BILL', productId: productA, warehouseId: warehouseA, quantity: 100 },
      { id: '2', type: 'STOCKTAKE', productId: productA, warehouseId: warehouseA, docNumber: 'PD-001', diffQuantity: 5 },
    ];
    const { result } = renderHook(() => usePsiStockIndex(psi, []));
    expect(result.current.getStock(productA, warehouseA)).toBe(105);
    expect(result.current.getStock(productA, warehouseA, 'PD-001')).toBe(100);
    expect(result.current.getStocktakeAdjust(productA, warehouseA)).toBe(5);
  });

  it('字段缺失时 getStock 返回 0 而不是 NaN', () => {
    const psi = [
      { id: '1', type: 'PURCHASE_BILL', productId: productA, warehouseId: warehouseA, quantity: 'invalid' },
    ];
    const { result } = renderHook(() => usePsiStockIndex(psi, []));
    expect(result.current.getStock(productA, warehouseA)).toBe(0);
    expect(result.current.getStock(productA, undefined)).toBe(0);
  });
});
