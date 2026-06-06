import { describe, it, expect } from 'vitest';
import type { PsiRecord } from '../../types';
import {
  buildPsiOrderBillFlowSummaryRows,
  sortPsiOrderBillFlowRows,
  sumPsiOrderBillFlowTotals,
  productLabelForLineGroup,
  filterPsiOrderBillFlowRows,
  resolvePurchaseOrderLineFlowStatus,
  resolveSalesOrderLineFlowStatus,
} from './psiOrderBillFlowHelpers';

const poLine = (overrides: Partial<PsiRecord> = {}): PsiRecord => ({
  id: overrides.id ?? 'l1',
  type: 'PURCHASE_ORDER',
  docNumber: overrides.docNumber ?? 'PO-001',
  productId: overrides.productId ?? 'p1',
  productName: overrides.productName ?? '产品A',
  quantity: overrides.quantity ?? 10,
  purchasePrice: overrides.purchasePrice ?? 5,
  partner: overrides.partner ?? '供应商甲',
  createdAt: overrides.createdAt ?? '2026-06-06',
  ...overrides,
});

describe('buildPsiOrderBillFlowSummaryRows', () => {
  it('同一单号多产品 → 多行', () => {
    const records = [
      poLine({ id: 'a', docNumber: 'PO-1', productId: 'p1', lineGroupId: 'g1', quantity: 10, purchasePrice: 2 }),
      poLine({ id: 'b', docNumber: 'PO-1', productId: 'p2', lineGroupId: 'g2', productName: '产品B', quantity: 5, purchasePrice: 2 }),
      poLine({ id: 'c', docNumber: 'PO-2', productId: 'p1', lineGroupId: 'g3', quantity: 3, purchasePrice: 10 }),
    ];
    const rows = buildPsiOrderBillFlowSummaryRows(records, 'PURCHASE_ORDER');
    expect(rows).toHaveLength(3);
    const po1Rows = rows.filter(r => r.docNumber === 'PO-1');
    expect(po1Rows).toHaveLength(2);
    expect(po1Rows[0].totalQty + po1Rows[1].totalQty).toBe(15);
  });

  it('同一产品多颜色尺码（同 lineGroupId）→ 一行合计', () => {
    const records = [
      poLine({ id: 'v1', docNumber: 'PO-1', productId: 'p1', lineGroupId: 'g1', variantId: 'var1', quantity: 5, purchasePrice: 2 }),
      poLine({ id: 'v2', docNumber: 'PO-1', productId: 'p1', lineGroupId: 'g1', variantId: 'var2', quantity: 7, purchasePrice: 2 }),
    ];
    const rows = buildPsiOrderBillFlowSummaryRows(records, 'PURCHASE_ORDER');
    expect(rows).toHaveLength(1);
    expect(rows[0].totalQty).toBe(12);
    expect(rows[0].totalAmount).toBe(24);
  });

  it('销售单负数量计入合计', () => {
    const records: PsiRecord[] = [
      {
        id: 'r1',
        type: 'SALES_BILL',
        docNumber: 'XS-1',
        productId: 'p1',
        lineGroupId: 'g1',
        quantity: 10,
        salesPrice: 8,
        partner: '客户',
        createdAt: '2026-06-06',
      },
      {
        id: 'r2',
        type: 'SALES_BILL',
        docNumber: 'XS-2',
        productId: 'p1',
        lineGroupId: 'g2',
        quantity: -3,
        salesPrice: 8,
        partner: '客户',
        createdAt: '2026-06-06',
      },
    ];
    const rows = buildPsiOrderBillFlowSummaryRows(records, 'SALES_BILL');
    const totals = sumPsiOrderBillFlowTotals(rows);
    expect(totals.totalQty).toBe(7);
    expect(totals.totalAmount).toBe(56);
  });
});

describe('productLabelForLineGroup', () => {
  it('返回单个产品名称', () => {
    const items = [poLine({ productId: 'p1', productName: '甲', productSku: 'SKU-A' })];
    expect(productLabelForLineGroup(items)).toBe('甲（SKU-A）');
  });
});

describe('sortPsiOrderBillFlowRows', () => {
  it('按 sortKeyMs 倒序', () => {
    const rows = buildPsiOrderBillFlowSummaryRows(
      [
        poLine({ id: 'a', docNumber: 'PO-old', lineGroupId: 'g1', createdAt: '2026-06-01' }),
        poLine({ id: 'b', docNumber: 'PO-new', lineGroupId: 'g2', createdAt: '2026-06-06' }),
      ],
      'PURCHASE_ORDER',
    );
    const sorted = sortPsiOrderBillFlowRows(rows, 'PURCHASE_ORDER');
    expect(sorted[0].docNumber).toBe('PO-new');
  });
});

describe('filterPsiOrderBillFlowRows', () => {
  it('单号与往来单位模糊筛选', () => {
    const rows = buildPsiOrderBillFlowSummaryRows(
      [
        poLine({ id: 'a', docNumber: 'PO-AAA', lineGroupId: 'g1', partner: '甲公司' }),
        poLine({ id: 'b', docNumber: 'PO-BBB', lineGroupId: 'g2', partner: '乙公司' }),
      ],
      'PURCHASE_ORDER',
    );
    const filtered = filterPsiOrderBillFlowRows(rows, { docNo: 'aaa' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].docNumber).toBe('PO-AAA');
  });

  it('采购订单按状态筛选', () => {
    const rows = buildPsiOrderBillFlowSummaryRows(
      [
        poLine({ id: 'a', docNumber: 'PO-1', lineGroupId: 'g1', quantity: 10 }),
        poLine({ id: 'b', docNumber: 'PO-2', lineGroupId: 'g2', quantity: 5 }),
      ],
      'PURCHASE_ORDER',
      undefined,
      undefined,
      { 'PO-2::b': 5 },
    );
    const completed = filterPsiOrderBillFlowRows(rows, { status: 'completed' });
    expect(completed).toHaveLength(1);
    expect(completed[0].docNumber).toBe('PO-2');
    const none = filterPsiOrderBillFlowRows(rows, { status: 'none' });
    expect(none).toHaveLength(1);
    expect(none[0].docNumber).toBe('PO-1');
  });

  it('销售订单按状态筛选', () => {
    const rows = buildPsiOrderBillFlowSummaryRows(
      [
        {
          id: 's1',
          type: 'SALES_ORDER',
          docNumber: 'SO-1',
          lineGroupId: 'g1',
          productId: 'p1',
          quantity: 10,
          shippedQuantity: 10,
          partner: '客户',
          createdAt: '2026-06-06',
        },
        {
          id: 's2',
          type: 'SALES_ORDER',
          docNumber: 'SO-2',
          lineGroupId: 'g2',
          productId: 'p1',
          quantity: 5,
          shippedQuantity: 1,
          partner: '客户',
          createdAt: '2026-06-06',
        },
      ],
      'SALES_ORDER',
    );
    expect(filterPsiOrderBillFlowRows(rows, { status: 'fully_shipped' })).toHaveLength(1);
    expect(filterPsiOrderBillFlowRows(rows, { status: 'unallocated' })).toHaveLength(1);
  });
});

describe('resolvePurchaseOrderLineFlowStatus', () => {
  it('识别部分入库与已超收', () => {
    const items = [poLine({ id: 'line-a', quantity: 10 })];
    expect(resolvePurchaseOrderLineFlowStatus('PO-1', items, { 'PO-1::line-a': 3 }).statusKey).toBe('partial');
    expect(resolvePurchaseOrderLineFlowStatus('PO-1', items, { 'PO-1::line-a': 12 }).statusKey).toBe('over_received');
  });
});

describe('resolveSalesOrderLineFlowStatus', () => {
  it('识别有待发与已发齐', () => {
    const items: PsiRecord[] = [{
      id: 's1',
      type: 'SALES_ORDER',
      productId: 'p1',
      quantity: 10,
      allocatedQuantity: 8,
      shippedQuantity: 5,
    }];
    expect(resolveSalesOrderLineFlowStatus(items).statusKey).toBe('pending_ship');
    expect(
      resolveSalesOrderLineFlowStatus([{ ...items[0], shippedQuantity: 10 }]).statusKey,
    ).toBe('fully_shipped');
  });
});
