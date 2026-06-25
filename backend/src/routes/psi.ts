import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/psi.controller.js';
import { validate } from '../middleware/validate.js';
import { requireSubPermission, requirePsiOrProductionRead, requirePsiRecordWrite } from '../middleware/tenant.js';

const router = Router();

const psiRecordSchema = z.object({
  type: z.string().min(1, '记录类型不能为空'),
  docNumber: z.string().optional(),
}).passthrough();

const createBatchSchema = z.object({
  records: z.array(psiRecordSchema).min(1, '至少需要一条记录'),
});

const replaceSchema = z.object({
  deleteIds: z.array(z.string()).optional(),
  newRecords: z.array(z.object({}).passthrough()).optional(),
});

const deleteBatchSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, '至少选择一条记录'),
});

/**
 * 通用 `/psi/records*` 端点的权限：
 * - 这些端点承载所有 PSI 单据（采购/销售订单、采购入库、销售单、调拨、盘点）与订单待入库的落库。
 * - 历史挂 `psi:records:*`，但权限树无 `records` 子模块，细粒度角色拿不到，导致保存/列表 403。
 * - 改为：读 → `requirePsiOrProductionRead`；写 → `requirePsiRecordWrite` 按单据 type 映射到
 *   实际子模块权限（详见 middleware/tenant.ts 说明）。
 */
router.get('/records', requirePsiOrProductionRead(), ctrl.listRecords);
router.post(
  '/records/batch',
  requirePsiRecordWrite('create'),
  validate(createBatchSchema),
  ctrl.createBatchRecords,
);
router.post(
  '/records',
  requirePsiRecordWrite('create'),
  validate(psiRecordSchema),
  ctrl.createRecord,
);
router.put(
  '/records/replace',
  requirePsiRecordWrite('edit'),
  validate(replaceSchema),
  ctrl.replaceRecords,
);
router.put('/records/:id', requirePsiRecordWrite('edit'), ctrl.updateRecord);
router.delete(
  '/records',
  requirePsiRecordWrite('delete'),
  validate(deleteBatchSchema),
  ctrl.deleteBatchRecords,
);
router.delete('/records/:id', requirePsiRecordWrite('delete'), ctrl.deleteRecord);

// 只读库存聚合：生产计划/工单/物料/进销存多处面板共用，放宽到「PSI 或 生产模块任意权限」。
// 详见 middleware/tenant.ts requirePsiOrProductionRead 说明。
router.get('/stock', requirePsiOrProductionRead(), ctrl.getStock);
router.get('/stock/batches', requirePsiOrProductionRead(), ctrl.getStockBatches);
router.get('/stock-snapshot', requirePsiOrProductionRead(), ctrl.getStockSnapshot);

/**
 * Phase 3.D follow-up：
 * - 计划详情面板"计划相关 PSI"窄查；需有计划查看权限（read 即可）。
 * - 单号生成 / 上次单价：PO/PB/SO/SB 共用的只读辅助查询；放宽到「PSI 或 生产模块任意权限」，
 *   原 `psi:purchase_order:view` 对只配销售订单等单一单据的角色过窄（会卡住保存前取号）。
 */
const lastPurchasePriceSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().min(1),
      partnerId: z.string().optional().nullable(),
      partnerName: z.string().optional().nullable(),
    }),
  ).min(0).max(500),
});

const plansPurchaseProgressSchema = z.object({
  plans: z.array(
    z.object({
      planId: z.string().min(1),
      planNumbers: z.array(z.string()).optional(),
    }),
  ).min(0).max(100),
});

router.get('/plan-related', requireSubPermission('production:plans:view'), ctrl.listPlanRelated);
router.post(
  '/plans-purchase-progress',
  requireSubPermission('production:plans:view'),
  validate(plansPurchaseProgressSchema),
  ctrl.listPlansPurchaseProgress,
);
router.get('/next-doc-number', requirePsiOrProductionRead(), ctrl.nextDocNumber);
router.post(
  '/last-purchase-prices',
  requirePsiOrProductionRead(),
  validate(lastPurchasePriceSchema),
  ctrl.batchLastPurchasePrices,
);

export default router;
