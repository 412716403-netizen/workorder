import { describe, it, expect, vi, afterEach } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { AppError } from '../src/middleware/errorHandler.js';
import { updatePlatformTenant } from '../src/services/adminTenants.service.js';
import * as settingsService from '../src/services/settings.service.js';
import * as tenantProductionActivity from '../src/utils/tenantProductionActivity.js';
import { getProductionLinkMode } from '../src/utils/productionLinkMode.js';

const pendingTenant = {
  id: 'tenant-1',
  name: '测试企业',
  status: 'pending',
  expiresAt: null,
  equipmentModuleEnabled: true,
  industryKind: 'generic',
  industryPresetAppliedAt: null,
  productionLinkMode: 'order',
};

const activeTenant = { ...pendingTenant, status: 'active' };

function mockTenantTransaction(updated: typeof pendingTenant) {
  const tx = {
    tenant: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(pendingTenant),
      update: vi.fn().mockResolvedValue(updated),
    },
    productCategory: { count: vi.fn().mockResolvedValue(0) },
    partnerCategory: { count: vi.fn().mockResolvedValue(0) },
    warehouse: { count: vi.fn().mockResolvedValue(0) },
    financeCategory: { count: vi.fn().mockResolvedValue(0) },
    globalNodeTemplate: { count: vi.fn().mockResolvedValue(0) },
  };
  vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) =>
    fn(tx as never),
  );
  return tx;
}

describe('updatePlatformTenant · productionLinkMode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects approve without productionLinkMode (400)', async () => {
    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValue(pendingTenant as never);

    await expect(updatePlatformTenant('tenant-1', { status: 'active' })).rejects.toMatchObject({
      statusCode: 400,
      message: '审核通过时必须选择生产关联模式',
    });
  });

  it('writes Tenant + systemSetting on approve with mode', async () => {
    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValue(pendingTenant as never);
    const updated = { ...pendingTenant, status: 'active', productionLinkMode: 'product' };
    mockTenantTransaction(updated);
    vi.spyOn(tenantProductionActivity, 'tenantHasProductionActivity').mockResolvedValue(false);
    const updateConfigSpy = vi.spyOn(settingsService, 'updateConfig').mockResolvedValue({} as never);

    const result = await updatePlatformTenant('tenant-1', {
      status: 'active',
      productionLinkMode: 'product',
    });

    expect(result.productionLinkMode).toBe('product');
    expect(result.productionLinkModeLocked).toBe(false);
    expect(updateConfigSpy).toHaveBeenCalledWith('tenant-1', 'productionLinkMode', 'product');
  });

  it('rejects mode change when tenant has production activity (409)', async () => {
    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValue(activeTenant as never);
    vi.spyOn(tenantProductionActivity, 'tenantHasProductionActivity').mockResolvedValue(true);

    await expect(
      updatePlatformTenant('tenant-1', { productionLinkMode: 'product' }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: '该企业已有生产数据，生产关联模式不可变更',
    });
  });

  it('allows mode change when tenant has no production activity', async () => {
    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValue(activeTenant as never);
    const updated = { ...activeTenant, productionLinkMode: 'product' };
    mockTenantTransaction(updated);
    vi.spyOn(tenantProductionActivity, 'tenantHasProductionActivity').mockResolvedValue(false);
    vi.spyOn(settingsService, 'updateConfig').mockResolvedValue({} as never);

    const result = await updatePlatformTenant('tenant-1', { productionLinkMode: 'product' });

    expect(result.productionLinkMode).toBe('product');
    expect(result.productionLinkModeLocked).toBe(false);
  });
});

describe('assertTenantConfigKeyEditable · productionLinkMode', () => {
  it('rejects tenant-side productionLinkMode update (403)', () => {
    expect(() => settingsService.assertTenantConfigKeyEditable('productionLinkMode')).toThrow(AppError);
    try {
      settingsService.assertTenantConfigKeyEditable('productionLinkMode');
    } catch (e) {
      expect(e).toMatchObject({
        statusCode: 403,
        message: '生产关联模式由平台管理员在企业管理中配置，租户不可修改',
      });
    }
  });
});

describe('getProductionLinkMode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads Tenant.productionLinkMode when tenant exists', async () => {
    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValue({ productionLinkMode: 'product' } as never);

    await expect(getProductionLinkMode('tenant-1')).resolves.toBe('product');
  });

  it('falls back to systemSetting when tenant row missing', async () => {
    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValue(null);
    vi.spyOn(prisma.systemSetting, 'findUnique').mockResolvedValue({ value: 'product' } as never);

    await expect(getProductionLinkMode('tenant-1')).resolves.toBe('product');
  });
});
