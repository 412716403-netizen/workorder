import { describe, it, expect } from 'vitest';
import {
  resolveDocViewScope,
  canViewDocList,
  OWN_SCOPED_PSI_TYPE_PERM_BASE,
  OWN_SCOPED_FINANCE_TYPE_PERM_BASE,
} from '../src/types/index.js';
import { ownDocScopeCondition } from '../src/utils/docScope.js';

describe('resolveDocViewScope（单据查看范围）', () => {
  it('view（查看全部）优先且与现状语义一致', () => {
    expect(resolveDocViewScope(['psi:sales_order:view'], 'psi:sales_order')).toBe('all');
    // view 与 view_own 并存时按全部可见
    expect(
      resolveDocViewScope(['psi:sales_order:view', 'psi:sales_order:view_own'], 'psi:sales_order'),
    ).toBe('all');
  });

  it('裸模块键视为该模块全部子权限 → all', () => {
    expect(resolveDocViewScope(['psi'], 'psi:sales_order')).toBe('all');
    expect(resolveDocViewScope(['finance'], 'finance:receipt')).toBe('all');
  });

  it('仅 view_own → own', () => {
    expect(resolveDocViewScope(['psi:sales_order:view_own'], 'psi:sales_order')).toBe('own');
    expect(
      resolveDocViewScope(['finance:receipt:view_own', 'finance:receipt:create'], 'finance:receipt'),
    ).toBe('own');
  });

  it('两者皆无 → none（其他子权限不影响）', () => {
    expect(resolveDocViewScope([], 'psi:sales_order')).toBe('none');
    expect(resolveDocViewScope(['psi:purchase_order:view'], 'psi:sales_order')).toBe('none');
    expect(resolveDocViewScope(['finance:payment:view'], 'finance:receipt')).toBe('none');
  });

  it('canViewDocList：view 或 view_own 皆可进入口', () => {
    expect(canViewDocList(['psi:sales_bill:view'], 'psi:sales_bill')).toBe(true);
    expect(canViewDocList(['psi:sales_bill:view_own'], 'psi:sales_bill')).toBe(true);
    expect(canViewDocList(['psi:sales_bill:create'], 'psi:sales_bill')).toBe(false);
  });
});

describe('ownDocScopeCondition（仅本人可见的列表 where 条件）', () => {
  it('无范围限制时返回 null（不加过滤）', () => {
    expect(ownDocScopeCondition(null)).toBeNull();
    expect(ownDocScopeCondition({ userId: 'u1', ownTypes: [] })).toBeNull();
  });

  it('own 范围：其他 type 不受影响，own type 仅命中本人', () => {
    const cond = ownDocScopeCondition({ userId: 'u1', ownTypes: ['SALES_ORDER'] });
    expect(cond).toEqual({
      OR: [
        { type: { notIn: ['SALES_ORDER'] } },
        {
          AND: [
            { type: { in: ['SALES_ORDER'] } },
            { createdByUserId: 'u1' },
          ],
        },
      ],
    });
  });

  it('历史存量单（createdByUserId 为空）不会命中本人分支', () => {
    const cond = ownDocScopeCondition({ userId: 'u1', ownTypes: ['RECEIPT', 'PAYMENT'] })!;
    const or = cond.OR as Record<string, unknown>[];
    expect(or[1]).toEqual({
      AND: [
        { type: { in: ['RECEIPT', 'PAYMENT'] } },
        { createdByUserId: 'u1' },
      ],
    });
  });
});

describe('own-scoped type → 权限 base 映射', () => {
  it('PSI 仅销售订单/销售单参与，仓库与采购类不受影响', () => {
    expect(OWN_SCOPED_PSI_TYPE_PERM_BASE).toEqual({
      SALES_ORDER: 'psi:sales_order',
      SALES_BILL: 'psi:sales_bill',
    });
  });

  it('财务仅收/付款参与，转账与对账不受影响', () => {
    expect(OWN_SCOPED_FINANCE_TYPE_PERM_BASE).toEqual({
      RECEIPT: 'finance:receipt',
      PAYMENT: 'finance:payment',
    });
  });
});
