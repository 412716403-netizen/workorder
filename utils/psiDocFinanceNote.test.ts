import { describe, it, expect } from 'vitest';
import {
  buildPsiDocFinanceNote,
  canReadPsiDocLinkedFinance,
  psiDocLinkedFinanceAmountLabel,
  psiDocQuickFinanceButtonLabel,
  psiDocStagedFinanceShortLabel,
} from './psiDocFinanceNote';

describe('psiDocFinanceNote', () => {
  it('有单号时备注含类型与单号', () => {
    expect(buildPsiDocFinanceNote('PURCHASE_ORDER', 'PO-A-001')).toBe('关联采购订单 PO-A-001');
    expect(buildPsiDocFinanceNote('PURCHASE_BILL', 'PB-1')).toBe('关联采购入库 PB-1');
    expect(buildPsiDocFinanceNote('SALES_ORDER', 'SO-1')).toBe('关联销售订单 SO-1');
    expect(buildPsiDocFinanceNote('SALES_BILL', 'XS-1')).toBe('关联销售单 XS-1');
  });

  it('无单号时仅写关联类型', () => {
    expect(buildPsiDocFinanceNote('PURCHASE_ORDER', null)).toBe('关联采购订单');
    expect(buildPsiDocFinanceNote('SALES_BILL', '  ')).toBe('关联销售单');
  });

  it('方向相关文案', () => {
    expect(psiDocLinkedFinanceAmountLabel('PURCHASE_ORDER')).toBe('已付款金额');
    expect(psiDocLinkedFinanceAmountLabel('SALES_ORDER')).toBe('已收款金额');
    expect(psiDocQuickFinanceButtonLabel('PURCHASE_BILL')).toBe('登记付款单');
    expect(psiDocQuickFinanceButtonLabel('SALES_BILL')).toBe('登记收款单');
    expect(psiDocStagedFinanceShortLabel('PURCHASE_ORDER')).toBe('已付款');
    expect(psiDocStagedFinanceShortLabel('SALES_ORDER')).toBe('已收款');
  });
});

describe('canReadPsiDocLinkedFinance', () => {
  it('owner 恒可反查', () => {
    expect(canReadPsiDocLinkedFinance('PURCHASE_ORDER', 'owner', [])).toBe(true);
  });

  it('按方向匹配收款单 / 付款单查看权限', () => {
    expect(canReadPsiDocLinkedFinance('PURCHASE_ORDER', 'member', ['finance:payment:view'])).toBe(true);
    expect(canReadPsiDocLinkedFinance('PURCHASE_ORDER', 'member', ['finance:receipt:view'])).toBe(false);
    expect(canReadPsiDocLinkedFinance('SALES_BILL', 'member', ['finance:receipt:view'])).toBe(true);
  });

  it('view_own 同样可反查（数据由后端按制单人过滤）', () => {
    expect(canReadPsiDocLinkedFinance('SALES_ORDER', 'member', ['finance:receipt:view_own'])).toBe(true);
  });

  it('无财务权限时不发起查询', () => {
    expect(canReadPsiDocLinkedFinance('SALES_ORDER', 'member', ['psi:sales_order:view'])).toBe(false);
    expect(canReadPsiDocLinkedFinance('SALES_ORDER', 'member', undefined)).toBe(false);
  });
});
