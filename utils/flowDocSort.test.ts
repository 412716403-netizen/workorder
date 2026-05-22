import { describe, expect, it } from 'vitest';
import {
  psiDocGroupListSortMs,
  psiDocNumberSeqSuffix,
} from './flowDocSort';

describe('psiDocNumberSeqSuffix', () => {
  it('解析新格式单号末尾流水', () => {
    expect(psiDocNumberSeqSuffix('XS-0001-003')).toBe(3);
    expect(psiDocNumberSeqSuffix('SB-0001-001')).toBe(1);
  });
});

describe('psiDocGroupListSortMs', () => {
  it('同日多张单：有 timestamp/_savedAtMs 时按真实生成时刻而非日历日', () => {
    const early = psiDocGroupListSortMs([
      { createdAt: '2026-05-22', timestamp: '2026/5/22 上午10:00:00', _savedAtMs: 1000 },
    ]);
    const late = psiDocGroupListSortMs([
      { createdAt: '2026-05-22', timestamp: '2026/5/22 下午3:00:00', _savedAtMs: 2000 },
    ]);
    expect(late).toBeGreaterThan(early);
  });
});
