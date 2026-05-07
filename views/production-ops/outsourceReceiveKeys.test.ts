import { describe, it, expect } from 'vitest';
import {
  RECEIVE_VARIANT_SEP,
  outsourceReceiveBaseKey,
  outsourceReceiveOrderAggKey,
  outsourceReceiveProductAggKey,
  resolveOutsourceReceiveEntry,
  type OutsourceReceiveRowLike,
} from './outsourceReceiveKeys';

const rowOrder = (
  orderId: string,
  nodeId: string,
  partner: string,
  productId = 'p1',
): OutsourceReceiveRowLike => ({ orderId, nodeId, partner, productId });

const rowProduct = (
  productId: string,
  nodeId: string,
  partner: string,
): OutsourceReceiveRowLike => ({ productId, nodeId, partner });

describe('outsourceReceiveBaseKey', () => {
  it('工单级 baseKey 必须包含 partner，避免多加工厂被合并', () => {
    expect(outsourceReceiveBaseKey(rowOrder('O1', 'N1', 'A'))).toBe('O1|N1|A');
    expect(outsourceReceiveBaseKey(rowOrder('O1', 'N1', 'B'))).toBe('O1|N1|B');
  });

  it('产品级 baseKey 同样包含 partner', () => {
    expect(outsourceReceiveBaseKey(rowProduct('P1', 'N1', 'A'))).toBe('P1|N1|A');
  });

  it('partner 为空时回填空串', () => {
    expect(outsourceReceiveBaseKey({ orderId: 'O1', nodeId: 'N1', partner: '', productId: 'p1' })).toBe('O1|N1|');
  });
});

describe('outsourceReceiveOrderAggKey / ProductAggKey', () => {
  it('工单 / 产品聚合 key 互不冲突', () => {
    expect(outsourceReceiveOrderAggKey('X', 'N', 'A')).toBe('O|X|N|A');
    expect(outsourceReceiveProductAggKey('X', 'N', 'A')).toBe('P|X|N|A');
  });
});

describe('resolveOutsourceReceiveEntry', () => {
  const rows: OutsourceReceiveRowLike[] = [
    rowOrder('O1', 'N1', 'A'),
    rowOrder('O1', 'N1', 'B'),
    rowProduct('P1', 'N1', 'A'),
  ];

  it('工单级 baseKey（3 段）解析到对应 partner 的行', () => {
    const r = resolveOutsourceReceiveEntry('O1|N1|A', rows);
    expect(r?.isProductScope).toBe(false);
    expect(r?.row.orderId).toBe('O1');
    expect(r?.row.partner).toBe('A');
    expect(r?.baseKey).toBe('O1|N1|A');
    expect(r?.variantId).toBeUndefined();
  });

  it('工单级变体 key（4 段）解析出 partner 与 variantId', () => {
    const r = resolveOutsourceReceiveEntry('O1|N1|B|V9', rows);
    expect(r?.isProductScope).toBe(false);
    expect(r?.row.partner).toBe('B');
    expect(r?.baseKey).toBe('O1|N1|B');
    expect(r?.variantId).toBe('V9');
  });

  it('产品级 baseKey 优先于工单级解析', () => {
    const r = resolveOutsourceReceiveEntry('P1|N1|A', rows);
    expect(r?.isProductScope).toBe(true);
    expect(r?.row.productId).toBe('P1');
  });

  it('产品级变体 key 走 RECEIVE_VARIANT_SEP 分支', () => {
    const r = resolveOutsourceReceiveEntry(`P1|N1|A${RECEIVE_VARIANT_SEP}V1`, rows);
    expect(r?.isProductScope).toBe(true);
    expect(r?.baseKey).toBe('P1|N1|A');
    expect(r?.variantId).toBe('V1');
  });

  it('找不到对应行时返回 null', () => {
    expect(resolveOutsourceReceiveEntry('O9|N9|Z', rows)).toBeNull();
    expect(resolveOutsourceReceiveEntry(`P9|N9|Z${RECEIVE_VARIANT_SEP}V`, rows)).toBeNull();
    expect(resolveOutsourceReceiveEntry('bad', rows)).toBeNull();
  });

  it('工单同工序但 partner 不同的两行不会互相串错', () => {
    const a = resolveOutsourceReceiveEntry('O1|N1|A', rows);
    const b = resolveOutsourceReceiveEntry('O1|N1|B', rows);
    expect(a?.row).not.toBe(b?.row);
    expect(a?.row.partner).toBe('A');
    expect(b?.row.partner).toBe('B');
  });
});
