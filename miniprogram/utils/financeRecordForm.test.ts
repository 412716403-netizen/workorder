import { createRequire } from 'module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const {
  emptyFinanceForm,
  formVisibility,
  validateFinanceForm,
  buildFinanceSavePayload,
  buildAccountSelectRows,
  formatMoney,
  categoriesForType,
} = require('./financeRecordForm.js');

const PAYMENT_CATEGORY = {
  id: 'cat-pay',
  kind: 'PAYMENT',
  name: '货款',
  linkPartner: true,
  customFields: [],
};

function formWith(overrides: Record<string, unknown> = {}) {
  return { ...emptyFinanceForm(), ...overrides };
}

describe('categoriesForType', () => {
  it('按 kind 过滤', () => {
    const list = [PAYMENT_CATEGORY, { id: 'c2', kind: 'RECEIPT', name: '回款' }];
    expect(categoriesForType(list, 'PAYMENT')).toEqual([PAYMENT_CATEGORY]);
    expect(categoriesForType(list, 'RECEIPT')).toHaveLength(1);
  });
});

describe('formVisibility', () => {
  it('未选分类时合作单位必填，资金账户插件决定收支账户', () => {
    const vis = formVisibility(formWith(), [PAYMENT_CATEGORY], true, 'PAYMENT');
    expect(vis).toMatchObject({
      hasCategories: true,
      showPartner: true,
      needPartner: true,
      showWorker: false,
      showProduct: false,
      showPaymentAccount: true,
      needPaymentAccount: true,
    });
  });

  it('资金账户插件关闭时不要收支账户', () => {
    const vis = formVisibility(formWith(), [PAYMENT_CATEGORY], false, 'PAYMENT');
    expect(vis.showPaymentAccount).toBe(false);
    expect(vis.needPaymentAccount).toBe(false);
  });

  it('分类勾了关联工人/产品才显示对应字段', () => {
    const cat = { ...PAYMENT_CATEGORY, linkWorker: true, linkProduct: true };
    const vis = formVisibility(formWith({ categoryId: cat.id }), [cat], true, 'PAYMENT');
    expect(vis.showWorker).toBe(true);
    expect(vis.showProduct).toBe(true);
  });
});

describe('validateFinanceForm', () => {
  const vis = () => formVisibility(formWith(), [PAYMENT_CATEGORY], true, 'PAYMENT');

  it('金额必须大于 0', () => {
    expect(validateFinanceForm(formWith({ amount: '' }), vis(), 'PAYMENT')).toBe('请填写结算金额');
    expect(validateFinanceForm(formWith({ amount: '0' }), vis(), 'PAYMENT')).toBe('请填写结算金额');
  });

  it('有分类时必选分类', () => {
    expect(validateFinanceForm(formWith({ amount: '10' }), vis(), 'PAYMENT')).toBe('请选择单据分类');
  });

  it('付款单缺合作单位时提示收款单位/个人', () => {
    const form = formWith({ amount: '10', categoryId: PAYMENT_CATEGORY.id });
    expect(validateFinanceForm(form, vis(), 'PAYMENT')).toBe('请选择收款单位/个人');
  });

  it('缺收支账户时拦下', () => {
    const form = formWith({ amount: '10', categoryId: PAYMENT_CATEGORY.id, partner: '万新面料' });
    expect(validateFinanceForm(form, vis(), 'PAYMENT')).toBe('请选择收支账户');
  });

  it('齐全时通过', () => {
    const form = formWith({
      amount: '10',
      categoryId: PAYMENT_CATEGORY.id,
      partner: '万新面料',
      paymentAccount: '基本户',
    });
    expect(validateFinanceForm(form, vis(), 'PAYMENT')).toBe('');
  });
});

describe('buildFinanceSavePayload', () => {
  const vis = () => formVisibility(
    formWith({ categoryId: PAYMENT_CATEGORY.id }),
    [PAYMENT_CATEGORY],
    true,
    'PAYMENT',
  );

  it('PSI 快捷登记带上 sourceDocNo 与业务时间', () => {
    const form = formWith({
      amount: '1200.5',
      categoryId: PAYMENT_CATEGORY.id,
      partner: '万新面料',
      paymentAccount: '基本户',
      note: '关联采购订单 PO-1',
    });
    const body = buildFinanceSavePayload(form, vis(), '张三', null, 'PAYMENT', {
      entryDate: '2026-07-27',
      entryTime: '10:30',
      sourceDocNo: 'PO-1',
    });
    expect(body).toMatchObject({
      type: 'PAYMENT',
      amount: 1200.5,
      partner: '万新面料',
      paymentAccount: '基本户',
      note: '关联采购订单 PO-1',
      operator: '张三',
      status: 'COMPLETED',
      sourceDocNo: 'PO-1',
    });
    expect(typeof body.timestamp).toBe('string');
  });

  it('没有 sourceDocNo 时不带该字段（普通财务登记）', () => {
    const form = formWith({ amount: '10', categoryId: PAYMENT_CATEGORY.id, partner: 'A', paymentAccount: '基本户' });
    const body = buildFinanceSavePayload(form, vis(), '张三', null, 'PAYMENT', {
      entryDate: '2026-07-27',
      entryTime: '10:30',
    });
    expect('sourceDocNo' in body).toBe(false);
  });

  it('空白 sourceDocNo 视为无', () => {
    const form = formWith({ amount: '10', categoryId: PAYMENT_CATEGORY.id, partner: 'A', paymentAccount: '基本户' });
    const body = buildFinanceSavePayload(form, vis(), '张三', null, 'PAYMENT', { sourceDocNo: '   ' });
    expect('sourceDocNo' in body).toBe(false);
  });
});

describe('buildAccountSelectRows', () => {
  it('过滤停用账户、按 sortOrder 排序、附带余额文案', () => {
    const rows = buildAccountSelectRows(
      [
        { id: 'a2', name: '微信', sortOrder: 2 },
        { id: 'a1', name: '基本户', sortOrder: 1 },
        { id: 'a3', name: '旧账户', sortOrder: 3, active: false },
      ],
      { accounts: [{ accountTypeId: 'a1', balance: -50 }] },
    );
    expect(rows.map((r: { id: string }) => r.id)).toEqual(['a1', 'a2']);
    expect(rows[0]).toMatchObject({ balanceText: '¥-50.00', balanceNegative: true });
    expect(rows[1]).toMatchObject({ balanceText: '', balanceNegative: false });
  });
});

describe('formatMoney', () => {
  it('非数字退回 ¥0.00', () => {
    expect(formatMoney('abc')).toBe('¥0.00');
    expect(formatMoney(12)).toBe('¥12.00');
  });
});
