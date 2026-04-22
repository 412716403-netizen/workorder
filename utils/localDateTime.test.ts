import { describe, it, expect } from 'vitest';
import { formatPlanOrderCreatedAtForList } from './localDateTime';

describe('formatPlanOrderCreatedAtForList', () => {
  it('将仅日期误存成的 UTC 午夜 ISO 显示为日历日，不出现 08:00:00', () => {
    expect(formatPlanOrderCreatedAtForList('2026-04-21T00:00:00.000Z', 'plan-x')).toBe('2026-04-21');
    expect(formatPlanOrderCreatedAtForList('2026-04-21T00:00:00.000+00:00', 'plan-x')).toBe('2026-04-21');
  });

  it('真实带时刻的 ISO 仍格式化为本地日期时间串', () => {
    const out = formatPlanOrderCreatedAtForList('2026-04-21T06:30:45.000Z', 'plan-x');
    expect(out).toMatch(/^2026-04-21 /);
    expect(out).not.toBe('2026-04-21');
    expect(out).toContain(':');
  });

  it('纯 YYYY-MM-DD 原样返回', () => {
    expect(formatPlanOrderCreatedAtForList('2026-05-01', 'plan-x')).toBe('2026-05-01');
  });
});
