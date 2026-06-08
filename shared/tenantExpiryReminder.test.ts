import { describe, expect, it } from 'vitest';
import {
  calendarDaysUntilExpiry,
  resolveTenantExpiryReminderDay,
  buildTenantExpiryReminderContent,
} from './tenantExpiryReminder';

describe('tenantExpiryReminder', () => {
  it('returns 7/3/1 day milestones only', () => {
    const now = new Date(2026, 5, 1, 12, 0, 0);
    expect(resolveTenantExpiryReminderDay(now, new Date(2026, 5, 8))).toBe(7);
    expect(resolveTenantExpiryReminderDay(now, new Date(2026, 5, 4))).toBe(3);
    expect(resolveTenantExpiryReminderDay(now, new Date(2026, 5, 2))).toBe(1);
    expect(resolveTenantExpiryReminderDay(now, new Date(2026, 5, 10))).toBeNull();
    expect(resolveTenantExpiryReminderDay(now, null)).toBeNull();
  });

  it('builds reminder copy', () => {
    const content = buildTenantExpiryReminderContent(3, new Date(2026, 5, 4));
    expect(content.title).toBe('软件即将到期');
    expect(content.body).toContain('3 天后到期');
  });

  it('calendarDaysUntilExpiry uses local calendar days', () => {
    const now = new Date(2026, 0, 1);
    const exp = new Date(2026, 0, 8);
    expect(calendarDaysUntilExpiry(now, exp)).toBe(7);
  });
});
