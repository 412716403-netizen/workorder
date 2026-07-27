import { createRequire } from 'module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const {
  PSI_DOC_FINANCE_OP_TYPE,
  psiDocFinanceMeta,
  buildPsiDocFinanceNote,
  canCreatePsiDocFinance,
  canReadPsiDocLinkedFinance,
  sumFinanceRecordAmount,
  psiDocLinkedFinanceRows,
  retargetStagedPsiDocFinance,
} = require('./psiDocFinance.js');

describe('psiDocFinanceMeta', () => {
  it('采购侧登记付款单，销售侧登记收款单', () => {
    expect(PSI_DOC_FINANCE_OP_TYPE).toEqual({
      PURCHASE_ORDER: 'PAYMENT',
      PURCHASE_BILL: 'PAYMENT',
      SALES_ORDER: 'RECEIPT',
      SALES_BILL: 'RECEIPT',
    });
  });

  it('采购订单：付款口径 + 供应商标签', () => {
    expect(psiDocFinanceMeta('PURCHASE_ORDER')).toMatchObject({
      financeType: 'PAYMENT',
      financeDocLabel: '付款单',
      entryLabel: '登记付款单',
      shortLabel: '已付款',
      amountLabel: '已付款金额',
      partnerLabel: '供应商',
      docTypeLabel: '采购订单',
      createPermission: 'finance:payment:create',
    });
  });

  it('销售单：收款口径 + 客户标签', () => {
    expect(psiDocFinanceMeta('SALES_BILL')).toMatchObject({
      financeType: 'RECEIPT',
      entryLabel: '登记收款单',
      amountLabel: '已收款金额',
      partnerLabel: '客户',
      docTypeLabel: '销售单',
      createPermission: 'finance:receipt:create',
    });
  });

  it('未知单据类型退回收款口径，不抛错', () => {
    expect(psiDocFinanceMeta('WHATEVER')).toMatchObject({
      financeType: 'RECEIPT',
      docTypeLabel: '单据',
    });
  });
});

describe('buildPsiDocFinanceNote', () => {
  it('有单号时带上单号', () => {
    expect(buildPsiDocFinanceNote('PURCHASE_BILL', 'PB20260727001')).toBe('关联采购入库 PB20260727001');
  });

  it('无单号时只写单据类型', () => {
    expect(buildPsiDocFinanceNote('SALES_ORDER', '')).toBe('关联销售订单');
    expect(buildPsiDocFinanceNote('SALES_ORDER', null)).toBe('关联销售订单');
    expect(buildPsiDocFinanceNote('SALES_ORDER', '  ')).toBe('关联销售订单');
  });
});

describe('权限门控', () => {
  it('登记入口按 finance:<type>:create 判定', () => {
    expect(canCreatePsiDocFinance('PURCHASE_ORDER', ['finance:payment:create'])).toBe(true);
    expect(canCreatePsiDocFinance('SALES_ORDER', ['finance:receipt:create'])).toBe(true);
    expect(canCreatePsiDocFinance('SALES_ORDER', [])).toBe(false);
    expect(canCreatePsiDocFinance('SALES_ORDER', ['psi:sales_order:view'])).toBe(false);
  });

  it('反查关联收付款要求对应查看权限；owner 恒可读', () => {
    expect(canReadPsiDocLinkedFinance('PURCHASE_ORDER', 'owner', [])).toBe(true);
    expect(canReadPsiDocLinkedFinance('PURCHASE_ORDER', 'member', ['finance:payment:view'])).toBe(true);
    expect(canReadPsiDocLinkedFinance('PURCHASE_ORDER', 'member', ['finance:payment:view_own'])).toBe(true);
    expect(canReadPsiDocLinkedFinance('PURCHASE_ORDER', 'member', ['finance:receipt:view'])).toBe(false);
    expect(canReadPsiDocLinkedFinance('PURCHASE_ORDER', 'member', [])).toBe(false);
  });
});

describe('sumFinanceRecordAmount', () => {
  it('容忍字符串金额与缺字段', () => {
    expect(sumFinanceRecordAmount([{ amount: 1.5 }, { amount: '2' }, {}, null])).toBe(3.5);
  });

  it('空输入为 0', () => {
    expect(sumFinanceRecordAmount([])).toBe(0);
    expect(sumFinanceRecordAmount(undefined)).toBe(0);
  });
});

describe('psiDocLinkedFinanceRows', () => {
  it('金额大于 0 才出行', () => {
    expect(psiDocLinkedFinanceRows('PURCHASE_ORDER', 1200)).toEqual([
      { label: '已付款金额', value: '¥1200.00' },
    ]);
    expect(psiDocLinkedFinanceRows('SALES_BILL', 0)).toEqual([]);
    expect(psiDocLinkedFinanceRows('SALES_BILL', undefined)).toEqual([]);
  });
});

describe('retargetStagedPsiDocFinance', () => {
  it('落库时换成真实单号，默认备注跟着改写', () => {
    const draft = { amount: 500, sourceDocNo: 'PO-preview', note: '关联采购订单 PO-preview' };
    expect(retargetStagedPsiDocFinance(draft, 'PURCHASE_ORDER', 'PO-real')).toEqual({
      amount: 500,
      sourceDocNo: 'PO-real',
      note: '关联采购订单 PO-real',
    });
  });

  it('暂存时无单号的默认备注同样改写', () => {
    const draft = { amount: 1, sourceDocNo: '', note: '关联销售订单' };
    expect(retargetStagedPsiDocFinance(draft, 'SALES_ORDER', 'SO-1').note).toBe('关联销售订单 SO-1');
  });

  it('备注为空时补默认文案', () => {
    expect(retargetStagedPsiDocFinance({ amount: 1 }, 'SALES_BILL', 'SB-1').note).toBe('关联销售单 SB-1');
  });

  it('用户改过的备注不被覆盖', () => {
    const draft = { amount: 1, sourceDocNo: 'PO-preview', note: '首付定金 30%' };
    expect(retargetStagedPsiDocFinance(draft, 'PURCHASE_ORDER', 'PO-real').note).toBe('首付定金 30%');
  });
});
