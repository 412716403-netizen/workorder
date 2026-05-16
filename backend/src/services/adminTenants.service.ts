import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { seedTenantIndustryPresetForKind } from '../lib/tenantIndustryPresets.js';
import { normalizeTenantIndustryKind, type TenantIndustryKind } from '../../../shared/types.js';

export type AdminTenantUpdateBody = {
  expiresAt?: string | null;
  status?: 'active' | 'rejected' | 'pending';
  equipmentModuleEnabled?: boolean;
  industryKind?: string;
};

export type AdminTenantUpdateResult = {
  id: string;
  name: string;
  status: string;
  expiresAt: string | null;
  equipmentFeaturesEnabled: boolean;
  industryKind: TenantIndustryKind;
  industryPresetAppliedAt: string | null;
  presetSkippedReason?: string;
};

export async function updatePlatformTenant(
  tenantId: string,
  body: AdminTenantUpdateBody,
): Promise<AdminTenantUpdateResult> {
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!existing) throw new AppError(404, '企业不存在');

  if (body.status !== undefined && !['active', 'rejected', 'pending'].includes(body.status)) {
    throw new AppError(400, '无效的状态值');
  }
  if (body.expiresAt !== undefined && body.expiresAt !== null && body.expiresAt !== '') {
    const d = new Date(body.expiresAt);
    if (Number.isNaN(d.getTime())) throw new AppError(400, '到期时间格式无效');
  }
  if (body.equipmentModuleEnabled !== undefined && typeof body.equipmentModuleEnabled !== 'boolean') {
    throw new AppError(400, 'equipmentModuleEnabled 须为布尔值');
  }

  let presetSkippedReason: string | undefined;

  const { tenant: t } = await prisma.$transaction(async (tx) => {
    const row = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });

    const [pc, ptc, wh, fc, gn] = await Promise.all([
      tx.productCategory.count({ where: { tenantId } }),
      tx.partnerCategory.count({ where: { tenantId } }),
      tx.warehouse.count({ where: { tenantId } }),
      tx.financeCategory.count({ where: { tenantId } }),
      tx.globalNodeTemplate.count({ where: { tenantId } }),
    ]);
    const allEmpty = pc + ptc + wh + fc + gn === 0;
    const presetNotAppliedYet = row.industryPresetAppliedAt == null;

    const nextIndustryKind =
      body.industryKind !== undefined
        ? normalizeTenantIndustryKind(body.industryKind)
        : normalizeTenantIndustryKind(row.industryKind);

    const shouldSeed =
      presetNotAppliedYet && allEmpty && nextIndustryKind === 'sweater_factory';

    if (presetNotAppliedYet && nextIndustryKind === 'sweater_factory' && !allEmpty) {
      presetSkippedReason =
        '已跳过行业预设：租户下已存在产品分类、合作单位分类、仓库、财务类型或工序节点，为避免覆盖未自动灌入。';
    }

    if (shouldSeed) {
      await seedTenantIndustryPresetForKind(tx, tenantId, 'sweater_factory');
    }

    const updateData: Prisma.TenantUpdateInput = {};
    if (body.status !== undefined) updateData.status = body.status;
    if (body.expiresAt === null || body.expiresAt === '') {
      updateData.expiresAt = null;
    } else if (typeof body.expiresAt === 'string') {
      updateData.expiresAt = new Date(body.expiresAt);
    }
    if (body.equipmentModuleEnabled !== undefined) {
      updateData.equipmentModuleEnabled = body.equipmentModuleEnabled;
    }
    if (body.industryKind !== undefined) {
      updateData.industryKind = nextIndustryKind;
    }
    if (shouldSeed) {
      updateData.industryPresetAppliedAt = new Date();
      updateData.industryKind = nextIndustryKind;
    }

    const updated = await tx.tenant.update({ where: { id: tenantId }, data: updateData });

    if (body.equipmentModuleEnabled === false) {
      await tx.globalNodeTemplate.updateMany({
        where: { tenantId },
        data: {
          enableWorkerAssignment: false,
          enableEquipmentAssignment: false,
          enableEquipmentOnReport: false,
        },
      });
    }

    return { tenant: updated };
  });

  return {
    id: t.id,
    name: t.name,
    status: t.status,
    expiresAt: t.expiresAt?.toISOString() ?? null,
    equipmentFeaturesEnabled: t.equipmentModuleEnabled !== false,
    industryKind: normalizeTenantIndustryKind(t.industryKind),
    industryPresetAppliedAt: t.industryPresetAppliedAt?.toISOString() ?? null,
    ...(presetSkippedReason ? { presetSkippedReason } : {}),
  };
}
