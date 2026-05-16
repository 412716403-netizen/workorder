// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../services/api', () => ({
  finance: {
    listPage: vi.fn(),
    partnerOpeningBalance: vi.fn(),
  },
  psi: {
    list: vi.fn(),
  },
  production: {
    listPage: vi.fn(),
  },
}));

import { useFinanceReconciliation, type UseFinanceReconciliationParams } from './useFinanceReconciliation';
import type { FinanceRecord } from '../types';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return Wrapper;
}

function baseParams(over: Partial<UseFinanceReconciliationParams> = {}): UseFinanceReconciliationParams {
  return {
    type: 'RECEIPT',
    records: [],
    partners: [],
    orders: [],
    productMilestoneProgresses: [],
    productMap: new Map(),
    workerMap: new Map(),
    financeCatMap: new Map(),
    globalNodes: [],
    dictionaries: { colors: [], sizes: [], units: [] },
    debouncedFinanceListSearch: '',
    ...over,
  };
}

describe('useFinanceReconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('默认 reconciliationSubTab=partner，非对账模式 reconLoading=false', () => {
    const { result } = renderHook(() => useFinanceReconciliation(baseParams()), { wrapper: makeWrapper() });
    expect(result.current.reconciliationSubTab).toBe('partner');
    expect(result.current.reconHasFilter).toBe(false);
    expect(result.current.reconLoading).toBe(false);
  });

  it('非 RECONCILIATION：displayRecords 直接透传 records', () => {
    const records: FinanceRecord[] = [
      { id: 'f1', type: 'RECEIPT', amount: 100, timestamp: '2026-05-10T00:00:00.000Z' } as FinanceRecord,
      { id: 'f2', type: 'RECEIPT', amount: 200, timestamp: '2026-05-11T00:00:00.000Z' } as FinanceRecord,
    ];
    const { result } = renderHook(
      () => useFinanceReconciliation(baseParams({ type: 'RECEIPT', records })),
      { wrapper: makeWrapper() },
    );
    expect(result.current.displayRecords).toEqual(records);
  });

  it('非 RECONCILIATION + 搜索：tableSourceRecords 按 docNo/partner/amount 关键字过滤', () => {
    const records: FinanceRecord[] = [
      { id: 'f1', type: 'RECEIPT', amount: 100, partner: '张三', docNo: 'R-001' } as FinanceRecord,
      { id: 'f2', type: 'RECEIPT', amount: 200, partner: '李四', docNo: 'R-002' } as FinanceRecord,
    ];
    const { result } = renderHook(
      () => useFinanceReconciliation(baseParams({ type: 'RECEIPT', records, debouncedFinanceListSearch: '张三' })),
      { wrapper: makeWrapper() },
    );
    expect(result.current.tableSourceRecords).toHaveLength(1);
    expect(result.current.tableSourceRecords[0]?.id).toBe('f1');
  });

  it('状态 setter：setReconciliationSubTab 切换 partner/settlement', () => {
    const { result } = renderHook(() => useFinanceReconciliation(baseParams()), { wrapper: makeWrapper() });
    expect(result.current.reconciliationSubTab).toBe('partner');
    act(() => result.current.setReconciliationSubTab('settlement'));
    expect(result.current.reconciliationSubTab).toBe('settlement');
  });

  it('RECONCILIATION + partner 子 tab 但未选 partner：reconHasFilter=false，list 为空', () => {
    const { result } = renderHook(
      () => useFinanceReconciliation(baseParams({ type: 'RECONCILIATION' })),
      { wrapper: makeWrapper() },
    );
    expect(result.current.reconciliationSubTab).toBe('partner');
    expect(result.current.reconHasFilter).toBe(false);
    expect(result.current.partnerReconList).toEqual([]);
    expect(result.current.partnerReconWithBalance).toEqual([]);
    expect(result.current.partnerReconSummary).toBeNull();
  });

  it('RECONCILIATION 模式 displayRecords：partner/settlement 子 tab 始终返回空数组', () => {
    const records: FinanceRecord[] = [
      { id: 'f1', type: 'RECEIPT', amount: 100 } as FinanceRecord,
    ];
    const { result } = renderHook(
      () => useFinanceReconciliation(baseParams({ type: 'RECONCILIATION', records })),
      { wrapper: makeWrapper() },
    );
    // partner 子 tab → []
    expect(result.current.displayRecords).toEqual([]);
    act(() => result.current.setReconciliationSubTab('settlement'));
    // settlement 子 tab → []
    expect(result.current.displayRecords).toEqual([]);
  });

  it('inFinanceDateRangeQuery 工具：from/to 闭区间', () => {
    const { result } = renderHook(() => useFinanceReconciliation(baseParams()), { wrapper: makeWrapper() });
    const fn = result.current.inFinanceDateRangeQuery;
    expect(fn('2026-05-10T00:00:00.000Z', '2026-05-10', '2026-05-10')).toBe(true);
    expect(fn('2026-05-09T00:00:00.000Z', '2026-05-10', '2026-05-20')).toBe(false);
    expect(fn('2026-05-21T00:00:00.000Z', '2026-05-10', '2026-05-20')).toBe(false);
    expect(fn('', '2026-05-10', '2026-05-20')).toBe(false);
    expect(fn('2026-05-15T00:00:00.000Z', '', '')).toBe(true);
  });
});
