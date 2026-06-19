import { describe, expect, it } from 'vitest';
import { TENANT_DEFAULT_SETTINGS } from '../src/lib/tenantDefaultSettings.js';

describe('TENANT_DEFAULT_SETTINGS.outsourceFormSettings', () => {
  it('list display toggles default off for new tenants', () => {
    const outsource = TENANT_DEFAULT_SETTINGS.outsourceFormSettings as {
      showOutsourceDispatchDeliveryDate?: boolean;
      showPartnerFlowDetailOnList?: boolean;
      hideZeroPendingPartnerOnList?: boolean;
      onlyShowNotCompletedOrder?: boolean;
    };
    expect(outsource.showOutsourceDispatchDeliveryDate).toBe(false);
    expect(outsource.showPartnerFlowDetailOnList).toBe(false);
    expect(outsource.hideZeroPendingPartnerOnList).toBe(false);
    expect(outsource.onlyShowNotCompletedOrder).toBe(false);
  });
});
