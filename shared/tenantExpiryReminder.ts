/** 软件（租户）到期提醒：到期前 7 / 3 / 1 天各提醒一次 */

export const TENANT_EXPIRY_REMINDER_DAYS = [7, 3, 1] as const;

export type TenantExpiryReminderDay = (typeof TENANT_EXPIRY_REMINDER_DAYS)[number];

export const DASHBOARD_SYSTEM_PUBLISHER = '系统';

export function startOfLocalCalendarDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 按本地日历日计算距离到期还有多少天（到期日当天为 0） */
export function calendarDaysUntilExpiry(now: Date, expiresAt: Date): number {
  const diffMs = startOfLocalCalendarDay(expiresAt).getTime() - startOfLocalCalendarDay(now).getTime();
  return Math.round(diffMs / 86_400_000);
}

export function formatExpiryDateZh(expiresAt: Date): string {
  return expiresAt.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function resolveTenantExpiryReminderDay(
  now: Date,
  expiresAt: Date | null | undefined,
): TenantExpiryReminderDay | null {
  if (!expiresAt) return null;
  if (expiresAt.getTime() <= now.getTime()) return null;
  const daysLeft = calendarDaysUntilExpiry(now, expiresAt);
  if (daysLeft === 7 || daysLeft === 3 || daysLeft === 1) {
    return daysLeft;
  }
  return null;
}

export function buildTenantExpiryReminderContent(
  daysLeft: TenantExpiryReminderDay,
  expiresAt: Date,
): { title: string; body: string } {
  const dateStr = formatExpiryDateZh(expiresAt);
  return {
    title: '软件即将到期',
    body: `您的企业软件将于 ${daysLeft} 天后到期（${dateStr}），请及时联系管理员续期。`,
  };
}

export function tenantExpiryReminderId(tenantId: string, daysLeft: TenantExpiryReminderDay): string {
  return `expiry-reminder-${daysLeft}d-${tenantId}`;
}
