import { describe, expect, it } from 'vitest';
import { classifyTenantHealth } from '../src/services/adminUsage.service.js';

describe('classifyTenantHealth', () => {
  const now = new Date('2026-07-18T12:00:00.000Z');

  it('marks active tenant past expiresAt as expired', () => {
    expect(
      classifyTenantHealth({
        expiresAt: new Date('2026-07-01T00:00:00.000Z'),
        status: 'active',
        lastActivityAt: new Date('2026-07-17T00:00:00.000Z'),
        now,
      }),
    ).toBe('expired');
  });

  it('marks activity within 7 days as active', () => {
    expect(
      classifyTenantHealth({
        expiresAt: null,
        status: 'active',
        lastActivityAt: new Date('2026-07-15T00:00:00.000Z'),
        now,
      }),
    ).toBe('active');
  });

  it('marks activity within 30 days as low', () => {
    expect(
      classifyTenantHealth({
        expiresAt: null,
        status: 'active',
        lastActivityAt: new Date('2026-07-01T00:00:00.000Z'),
        now,
      }),
    ).toBe('low');
  });

  it('marks no activity or stale as silent', () => {
    expect(
      classifyTenantHealth({
        expiresAt: null,
        status: 'active',
        lastActivityAt: null,
        now,
      }),
    ).toBe('silent');
    expect(
      classifyTenantHealth({
        expiresAt: null,
        status: 'active',
        lastActivityAt: new Date('2026-05-01T00:00:00.000Z'),
        now,
      }),
    ).toBe('silent');
  });
});
