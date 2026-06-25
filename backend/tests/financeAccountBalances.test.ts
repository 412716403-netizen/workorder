import { describe, it, expect } from 'vitest';
import { accumulateAccountBalances } from '../src/services/finance.service.js';

const accounts = [
  { id: 'cash', name: '现金', accountKind: '现金', initialBalance: 100 },
  { id: 'bank', name: '银行存款', accountKind: '银行', initialBalance: 0 },
  { id: 'wechat', name: '微信', accountKind: '在线钱包', initialBalance: 50 },
];

describe('accumulateAccountBalances', () => {
  it('balance = initial + Σ(RECEIPT) - Σ(PAYMENT) per account', () => {
    const result = accumulateAccountBalances(accounts, [
      { accountTypeId: 'cash', type: 'RECEIPT', amount: 300 },
      { accountTypeId: 'cash', type: 'PAYMENT', amount: 120 },
      { accountTypeId: 'bank', type: 'RECEIPT', amount: 1000 },
    ]);

    const cash = result.accounts.find(a => a.accountTypeId === 'cash')!;
    expect(cash.inflow).toBe(300);
    expect(cash.outflow).toBe(120);
    expect(cash.balance).toBe(100 + 300 - 120); // 280

    const bank = result.accounts.find(a => a.accountTypeId === 'bank')!;
    expect(bank.balance).toBe(1000);

    const wechat = result.accounts.find(a => a.accountTypeId === 'wechat')!;
    expect(wechat.inflow).toBe(0);
    expect(wechat.outflow).toBe(0);
    expect(wechat.balance).toBe(50); // 仅期初
  });

  it('aggregates totals across accounts', () => {
    const result = accumulateAccountBalances(accounts, [
      { accountTypeId: 'cash', type: 'RECEIPT', amount: 300 },
      { accountTypeId: 'bank', type: 'PAYMENT', amount: 200 },
    ]);
    expect(result.totals.initialBalance).toBe(150);
    expect(result.totals.inflow).toBe(300);
    expect(result.totals.outflow).toBe(200);
    expect(result.totals.balance).toBe(150 + 300 - 200); // 250
  });

  it('collects unassigned flows (accountTypeId = null) without affecting account balances', () => {
    const result = accumulateAccountBalances(accounts, [
      { accountTypeId: null, type: 'RECEIPT', amount: 80 },
      { accountTypeId: null, type: 'PAYMENT', amount: 30 },
      { accountTypeId: 'cash', type: 'RECEIPT', amount: 10 },
    ]);
    expect(result.unassigned.inflow).toBe(80);
    expect(result.unassigned.outflow).toBe(30);
    const cash = result.accounts.find(a => a.accountTypeId === 'cash')!;
    expect(cash.balance).toBe(100 + 10);
    // 未归账不计入任一账户余额合计
    expect(result.totals.inflow).toBe(10);
  });

  it('uses period grouped for inflow/outflow but all-time grouped for balance', () => {
    // 期间（今日）只有 50 流入；余额口径（全部）有 300 流入 + 120 流出。
    const period = [{ accountTypeId: 'cash', type: 'RECEIPT', amount: 50 }];
    const allTime = [
      { accountTypeId: 'cash', type: 'RECEIPT', amount: 300 },
      { accountTypeId: 'cash', type: 'PAYMENT', amount: 120 },
    ];
    const result = accumulateAccountBalances(accounts, period, allTime);
    const cash = result.accounts.find(a => a.accountTypeId === 'cash')!;
    expect(cash.inflow).toBe(50); // 期间口径
    expect(cash.outflow).toBe(0); // 期间口径
    expect(cash.balance).toBe(100 + 300 - 120); // 余额口径不受期间影响
    expect(result.totals.inflow).toBe(50);
    expect(result.totals.balance).toBe(150 + 300 - 120 + 0); // cash 280 + bank 0 + wechat 50
  });

  it('openingBalance = initial + flows before period start; defaults to initial when no opening grouped', () => {
    const period = [{ accountTypeId: 'cash', type: 'RECEIPT', amount: 50 }];
    const allTime = [
      { accountTypeId: 'cash', type: 'RECEIPT', amount: 300 },
      { accountTypeId: 'cash', type: 'PAYMENT', amount: 120 },
    ];
    // 期初前净流水：+250 -100 = +150
    const opening = [
      { accountTypeId: 'cash', type: 'RECEIPT', amount: 250 },
      { accountTypeId: 'cash', type: 'PAYMENT', amount: 100 },
    ];
    const result = accumulateAccountBalances(accounts, period, allTime, opening);
    const cash = result.accounts.find(a => a.accountTypeId === 'cash')!;
    expect(cash.openingBalance).toBe(100 + 250 - 100); // 250
    expect(cash.balance).toBe(100 + 300 - 120); // 280 不受期间影响

    // 不传 openingGrouped 时退化为 initialBalance
    const noOpening = accumulateAccountBalances(accounts, period, allTime);
    expect(noOpening.accounts.find(a => a.accountTypeId === 'cash')!.openingBalance).toBe(100);
    expect(noOpening.totals.openingBalance).toBe(150); // 100 + 0 + 50
  });

  it('handles Decimal-like initialBalance values', () => {
    const result = accumulateAccountBalances(
      [{ id: 'x', name: 'X', accountKind: null, initialBalance: '99.50' as unknown as number }],
      [{ accountTypeId: 'x', type: 'RECEIPT', amount: 0.5 }],
    );
    expect(result.accounts[0].balance).toBe(100);
  });
});
