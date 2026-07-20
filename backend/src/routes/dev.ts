import { Router } from 'express';
import { z } from 'zod';
import * as stylesCtrl from '../controllers/dev-styles.controller.js';
import * as tplCtrl from '../controllers/dev-stage-templates.controller.js';
import * as materialCtrl from '../controllers/dev-material.controller.js';
import { requireSubPermission, requireDevMaterialRead } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const createStyleSchema = z.object({
  code: z.string().min(1, '款号不能为空'),
  name: z.string().min(1, '品名不能为空'),
}).passthrough();

const updateStyleSchema = z.object({}).passthrough();

const addSampleSchema = z.object({
  name: z.string().optional(),
  stageNames: z.array(z.string()).optional(),
  colorId: z.string().optional(),
  sizeId: z.string().optional(),
}).passthrough();

const updateStageSchema = z.object({
  status: z.string().optional(),
  fields: z.array(z.object({}).passthrough()).optional(),
  attachments: z.array(z.object({}).passthrough()).optional(),
  user: z.string().optional(),
}).passthrough();

const createBomSchema = z.object({
  parentStyleId: z.string().min(1),
}).passthrough();

const materialLineSchema = z.object({
  productId: z.string().min(1, '物料不能为空'),
  quantity: z.coerce.number().positive('数量须大于 0'),
  warehouseId: z.string().min(1, '仓库不能为空'),
  batchNo: z.string().nullable().optional(),
});

const materialBatchSchema = z.object({
  lines: z.array(materialLineSchema).min(1, '至少需要一条物料明细'),
  operator: z.string().optional(),
  timestamp: z.string().optional(),
});

const devTemplateFieldSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1, '参数标签不能为空'),
  required: z.boolean().optional(),
  order: z.number().int().optional(),
  type: z.enum(['text', 'date', 'select', 'file']).optional(),
  options: z.array(z.string()).nullable().optional(),
  dateWithTime: z.boolean().nullable().optional(),
  dateAutoFill: z.boolean().nullable().optional(),
});

const templateCreateSchema = z.object({
  name: z.string().min(1, '模板名称不能为空'),
  order: z.number().int().optional(),
  fields: z.array(devTemplateFieldSchema).optional(),
}).passthrough();

const templateUpdateSchema = z.object({
  name: z.string().min(1, '模板名称不能为空').optional(),
  order: z.number().int().optional(),
  fields: z.array(devTemplateFieldSchema).optional(),
}).passthrough();

// ── 款式 ──
router.get('/styles', requireSubPermission('development:styles:view'), stylesCtrl.listStyles);
router.get('/styles/boms/all', requireSubPermission('development:styles:view'), stylesCtrl.listBoms);
router.get('/styles/boms/:id', requireSubPermission('development:styles:view'), stylesCtrl.getBom);
router.post('/styles/boms', requireSubPermission('development:styles:create'), validate(createBomSchema), stylesCtrl.createBom);
router.put('/styles/boms/:id', requireSubPermission('development:styles:edit'), validate(createBomSchema), stylesCtrl.updateBom);
router.delete('/styles/boms/:id', requireSubPermission('development:styles:delete'), stylesCtrl.deleteBom);

router.get('/styles/:id', requireSubPermission('development:styles:view'), stylesCtrl.getStyle);
router.post('/styles', requireSubPermission('development:styles:create'), validate(createStyleSchema), stylesCtrl.createStyle);
router.put('/styles/:id', requireSubPermission('development:styles:edit'), validate(updateStyleSchema), stylesCtrl.updateStyle);
router.delete('/styles/:id', requireSubPermission('development:styles:delete'), stylesCtrl.deleteStyle);
router.post('/styles/:id/publish', requireSubPermission('development:styles:edit'), stylesCtrl.publishStyle);
router.post('/styles/:id/samples', requireSubPermission('development:styles:edit'), validate(addSampleSchema), stylesCtrl.addSample);
router.delete('/styles/samples/:sampleId', requireSubPermission('development:styles:edit'), stylesCtrl.deleteSample);
router.put('/styles/stages/:stageId', requireSubPermission('development:styles:edit'), validate(updateStageSchema), stylesCtrl.updateStage);
router.put(
  '/styles/:id/variants/:variantId/node-boms',
  requireSubPermission('development:styles:edit'),
  stylesCtrl.syncVariantNodeBoms,
);

// ── 开发物料领退（固定权限端点；type/reason/devStyleId 由服务端写入）──
router.get(
  '/styles/:styleId/material-records',
  requireDevMaterialRead(),
  materialCtrl.listMaterialRecords,
);
router.post(
  '/styles/:styleId/material-issues/batch',
  requireSubPermission('development:material_issue:create'),
  validate(materialBatchSchema),
  materialCtrl.createMaterialIssueBatch,
);
router.post(
  '/styles/:styleId/material-returns/batch',
  requireSubPermission('development:material_return:create'),
  validate(materialBatchSchema),
  materialCtrl.createMaterialReturnBatch,
);

// ── 开发流程模板 ──
router.get('/stage-templates', requireSubPermission('development:templates:view'), tplCtrl.listTemplates);
router.post('/stage-templates', requireSubPermission('development:templates:create'), validate(templateCreateSchema), tplCtrl.createTemplate);
router.put('/stage-templates/:id', requireSubPermission('development:templates:edit'), validate(templateUpdateSchema), tplCtrl.updateTemplate);
router.delete('/stage-templates/:id', requireSubPermission('development:templates:delete'), tplCtrl.deleteTemplate);

export default router;
