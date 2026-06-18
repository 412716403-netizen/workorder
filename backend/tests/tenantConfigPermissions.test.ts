import { describe, it, expect } from 'vitest';
import {
  canEditTenantConfigKey,
  canReadTenantConfig,
} from '../src/middleware/tenant.js';

describe('tenant config permissions', () => {
  it('canReadTenantConfig allows settings:config:view', () => {
    expect(canReadTenantConfig(['settings:config:view'])).toBe(true);
  });

  it('canReadTenantConfig allows production outsource form config without settings:config:view', () => {
    expect(canReadTenantConfig(['production:outsource_form_config:allow'])).toBe(true);
  });

  it('canReadTenantConfig denies unrelated production permissions', () => {
    expect(canReadTenantConfig(['production:outsource_list:allow'])).toBe(false);
  });

  it('canEditTenantConfigKey allows outsourceFormSettings via outsource form config', () => {
    expect(canEditTenantConfigKey(['production:outsource_form_config:allow'], 'outsourceFormSettings')).toBe(true);
  });

  it('canEditTenantConfigKey denies outsourceFormSettings without matching allow or settings edit', () => {
    expect(canEditTenantConfigKey(['production:outsource_list:allow'], 'outsourceFormSettings')).toBe(false);
  });

  it('canEditTenantConfigKey allows settings:config:edit for any key', () => {
    expect(canEditTenantConfigKey(['settings:config:edit'], 'planFormSettings')).toBe(true);
  });

  it('canEditTenantConfigKey denies unrelated keys for form-config-only users', () => {
    expect(canEditTenantConfigKey(['production:outsource_form_config:allow'], 'planFormSettings')).toBe(false);
  });
});
