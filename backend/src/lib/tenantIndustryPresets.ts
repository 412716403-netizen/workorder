/**
 * 租户行业预设：按平台选定的 `TenantIndustryKind` 灌入产品分类、合作单位分类、仓库、财务类型、工序节点。
 * 调用方须保证目标租户五类表均为空且 `industryPresetAppliedAt` 为空（见 adminTenants.service）。
 */
import type { Prisma } from '@prisma/client';
import type { TenantIndustryKind } from '../../../shared/types.js';
import { genId } from '../utils/genId.js';

export type IndustryPresetTx = Pick<
  Prisma.TransactionClient,
  'productCategory' | 'partnerCategory' | 'warehouse' | 'financeCategory' | 'globalNodeTemplate'
>;

/** 供单测断言毛衣工厂预设规模（2+3+2+3+4） */
export const SWEATER_FACTORY_PRESET_ROW_COUNTS = {
  productCategories: 2,
  partnerCategories: 3,
  warehouses: 2,
  financeCategories: 3,
  globalNodeTemplates: 4,
} as const;

const EMPTY_JSON: Prisma.InputJsonValue = [];

/**
 * 在事务内写入 `sweater_factory` 预设；不更新 `Tenant` 行（由调用方设置 `industryPresetAppliedAt`）。
 */
export async function seedTenantIndustryPresetForKind(
  tx: IndustryPresetTx,
  tenantId: string,
  kind: TenantIndustryKind,
): Promise<void> {
  if (kind === 'generic') return;
  if (kind !== 'sweater_factory') {
    throw new Error(`未实现的行业预设: ${kind}`);
  }

  const catRawId = genId('cat');
  const catFinishedId = genId('cat');

  await tx.productCategory.create({
    data: {
      id: catRawId,
      tenantId,
      name: '原料',
      color: 'bg-indigo-600',
      hasProcess: false,
      hasSalesPrice: false,
      hasPurchasePrice: true,
      linkPartner: true,
      hasColorSize: false,
      hasBatchManagement: true,
      customFields: EMPTY_JSON,
      sortOrder: 0,
    },
  });

  await tx.productCategory.create({
    data: {
      id: catFinishedId,
      tenantId,
      name: '成衣',
      color: 'bg-indigo-600',
      hasProcess: true,
      hasSalesPrice: true,
      hasPurchasePrice: false,
      hasColorSize: true,
      hasBatchManagement: false,
      customFields: EMPTY_JSON,
      sortOrder: 1,
    },
  });

  for (const name of ['供应商', '加工厂', '客户']) {
    await tx.partnerCategory.create({
      data: {
        id: genId('pcat'),
        tenantId,
        name,
        customFields: EMPTY_JSON,
      },
    });
  }

  for (const name of ['原料仓库', '成衣仓库']) {
    await tx.warehouse.create({
      data: {
        id: genId('wh'),
        tenantId,
        name,
      },
    });
  }

  await tx.financeCategory.create({
    data: {
      id: genId('fcat'),
      tenantId,
      kind: 'PAYMENT',
      name: '供应商付款',
      linkOrder: false,
      linkPartner: true,
      selectPaymentAccount: false,
      linkWorker: false,
      linkProduct: false,
      customFields: EMPTY_JSON,
    },
  });
  await tx.financeCategory.create({
    data: {
      id: genId('fcat'),
      tenantId,
      kind: 'PAYMENT',
      name: '加工厂付款',
      linkOrder: false,
      linkPartner: true,
      selectPaymentAccount: false,
      linkWorker: false,
      linkProduct: false,
      customFields: EMPTY_JSON,
    },
  });
  await tx.financeCategory.create({
    data: {
      id: genId('fcat'),
      tenantId,
      kind: 'RECEIPT',
      name: '客户收款',
      linkOrder: false,
      linkPartner: true,
      selectPaymentAccount: false,
      linkWorker: false,
      linkProduct: false,
      customFields: EMPTY_JSON,
    },
  });

  const nodeRows: Array<{
    name: string;
    hasBom: boolean;
    allowOutsource: boolean;
    enableWeightOnReport: boolean;
    sortOrder: number;
  }> = [
    { name: '横机', hasBom: true, allowOutsource: true, enableWeightOnReport: true, sortOrder: 0 },
    { name: '套口', hasBom: false, allowOutsource: true, enableWeightOnReport: false, sortOrder: 1 },
    { name: '洗水', hasBom: false, allowOutsource: true, enableWeightOnReport: false, sortOrder: 2 },
    { name: '后道', hasBom: false, allowOutsource: true, enableWeightOnReport: false, sortOrder: 3 },
  ];

  for (const row of nodeRows) {
    await tx.globalNodeTemplate.create({
      data: {
        id: genId('node'),
        tenantId,
        name: row.name,
        reportTemplate: EMPTY_JSON,
        reportDisplayTemplate: EMPTY_JSON,
        hasBom: row.hasBom,
        category: catFinishedId,
        enableWorkerAssignment: false,
        enableEquipmentAssignment: false,
        enableEquipmentOnReport: false,
        enablePieceRate: false,
        allowOutsource: row.allowOutsource,
        enableWeightOnReport: row.enableWeightOnReport,
        sortOrder: row.sortOrder,
      },
    });
  }
}
