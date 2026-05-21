import { describe, expect, it } from 'vitest';
import { PlanDispatchStatus } from '../types';
import { parsePlanSearch } from './parsePlanSearch';

describe('parsePlanSearch', () => {
  it('空输入返回空 search、无 dispatchStatus', () => {
    expect(parsePlanSearch('')).toEqual({ search: '' });
    expect(parsePlanSearch(null)).toEqual({ search: '' });
    expect(parsePlanSearch(undefined)).toEqual({ search: '' });
    expect(parsePlanSearch('   ')).toEqual({ search: '' });
  });

  it('识别「未下单」', () => {
    expect(parsePlanSearch('未下单')).toEqual({
      search: '',
      dispatchStatus: PlanDispatchStatus.NOT_DISPATCHED,
    });
    expect(parsePlanSearch('  未下单  ')).toEqual({
      search: '',
      dispatchStatus: PlanDispatchStatus.NOT_DISPATCHED,
    });
  });

  it('识别「未完成」', () => {
    expect(parsePlanSearch('未完成')).toEqual({
      search: '',
      dispatchStatus: PlanDispatchStatus.IN_PROGRESS,
    });
  });

  it('识别「已完成」', () => {
    expect(parsePlanSearch('已完成')).toEqual({
      search: '',
      dispatchStatus: PlanDispatchStatus.COMPLETED,
    });
  });

  it('普通文本作为模糊搜索透传，不带 dispatchStatus', () => {
    expect(parsePlanSearch('PLN-001')).toEqual({ search: 'PLN-001' });
    expect(parsePlanSearch('客户A')).toEqual({ search: '客户A' });
    expect(parsePlanSearch('  PLN-001  ')).toEqual({ search: 'PLN-001' });
  });

  it('状态词与其他文本混合时按普通搜索（不组合）', () => {
    // 设计上不支持「状态 + 关键字」混搭，避免后端语义不清
    expect(parsePlanSearch('未完成 PLN-001')).toEqual({ search: '未完成 PLN-001' });
    expect(parsePlanSearch('PLN-未完成')).toEqual({ search: 'PLN-未完成' });
  });
});
