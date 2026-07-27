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

  it('canReadTenantConfig allows psi / finance document roles to read form settings', () => {
    expect(canReadTenantConfig(['psi:sales_order:view_own'])).toBe(true);
    expect(canReadTenantConfig(['psi:purchase_bill:view'])).toBe(true);
    expect(canReadTenantConfig(['finance:receipt:view_own'])).toBe(true);
  });

  // 本端点整包返回租户全部配置，productCodeRules 走专用 `GET /products/code-rules`，不在此放宽
  it('canReadTenantConfig denies basic / development roles (productCodeRules 走专用端点)', () => {
    expect(canReadTenantConfig(['basic:products:view'])).toBe(false);
    expect(canReadTenantConfig(['basic:products:create'])).toBe(false);
    expect(canReadTenantConfig(['development:styles:create'])).toBe(false);
    expect(canReadTenantConfig(['development:styles:view'])).toBe(false);
  });

  it('canReadTenantConfig allows production plans roles to read planFormSettings', () => {
    expect(canReadTenantConfig(['production:plans:view'])).toBe(true);
    expect(canReadTenantConfig(['production:plans:create'])).toBe(true);
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
