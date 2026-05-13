import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/psi.controller.js';
import { validate } from '../middleware/validate.js';
import { requireSubPermission } from '../middleware/tenant.js';

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
 * Phase 3.E follow-up：进销存路由收紧到细粒度。
 * - `/records/*`：CRUD → `psi:records:*`（持有顶级 `psi` 模块码的用户自动覆盖，全部子权限）。
 * - `/stock*`：只读库存视图 → `psi:records:view`（与列表相同口径，避免再造一个细分权限码）。
 */
router.get('/records', requireSubPermission('psi:records:view'), ctrl.listRecords);
router.post(
  '/records/batch',
  requireSubPermission('psi:records:create'),
  validate(createBatchSchema),
  ctrl.createBatchRecords,
);
router.post(
  '/records',
  requireSubPermission('psi:records:create'),
  validate(psiRecordSchema),
  ctrl.createRecord,
);
router.put(
  '/records/replace',
  requireSubPermission('psi:records:edit'),
  validate(replaceSchema),
  ctrl.replaceRecords,
);
router.put('/records/:id', requireSubPermission('psi:records:edit'), ctrl.updateRecord);
router.delete(
  '/records',
  requireSubPermission('psi:records:delete'),
  validate(deleteBatchSchema),
  ctrl.deleteBatchRecords,
);
router.delete('/records/:id', requireSubPermission('psi:records:delete'), ctrl.deleteRecord);

router.get('/stock', requireSubPermission('psi:records:view'), ctrl.getStock);
router.get('/stock/batches', requireSubPermission('psi:records:view'), ctrl.getStockBatches);
router.get('/stock-snapshot', requireSubPermission('psi:records:view'), ctrl.getStockSnapshot);

/**
 * Phase 3.D follow-up：
 * - 计划详情面板"计划相关 PSI"窄查；需有计划查看权限（read 即可）。
 * - 单号生成 / 上次单价：只需 PSI 列表可见即可（PO/PB/SO/SB 默认 view 权限）。
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

router.get('/plan-related', requireSubPermission('production:plans:view'), ctrl.listPlanRelated);
router.get('/next-doc-number', requireSubPermission('psi:purchase_order:view'), ctrl.nextDocNumber);
router.post(
  '/last-purchase-prices',
  requireSubPermission('psi:purchase_order:view'),
  validate(lastPurchasePriceSchema),
  ctrl.batchLastPurchasePrices,
);

export default router;
