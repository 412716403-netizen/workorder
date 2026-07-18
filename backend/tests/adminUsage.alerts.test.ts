import { describe, expect, it } from 'vitest';
import { buildTenantUsageAlerts, ADMIN_USAGE_ALERT_THRESHOLDS } from '../src/utils/adminUsageAlerts.js';

describe('buildTenantUsageAlerts', () => {
  it('emits alerts when thresholds exceeded', () => {
    const alerts = buildTenantUsageAlerts([
      {
        tenantId: 't1',
        name: 'A厂',
        itemCodeCount: ADMIN_USAGE_ALERT_THRESHOLDS.itemCodeTotal,
        itemCodeCountRecent: 0,
        knowledgeAssetBytes: 0,
        productImageBytes: 0,
        reportCountRecent: 0,
        storageBytesTotal: 0,
      },
    ]);
    expect(alerts.some((a) => a.kind === 'item_code_total')).toBe(true);
  });

  it('returns empty when under thresholds', () => {
    expect(
      buildTenantUsageAlerts([
        {
          tenantId: 't1',
          name: 'A厂',
          itemCodeCount: 1,
          itemCodeCountRecent: 1,
          knowledgeAssetBytes: 1,
          productImageBytes: 1,
          reportCountRecent: 1,
          storageBytesTotal: 1,
        },
      ]),
    ).toEqual([]);
  });
});
