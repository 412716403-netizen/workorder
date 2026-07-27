import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/products.controller.js';
import {
  requireProductCodePrefetch,
  requireSubPermission,
  requireTenantMemberRead,
} from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const createProductSchema = z.object({
  name: z.string().min(1, '产品编号不能为空'),
  /** 产品名称：选填，不自动生成 */
  sku: z.string().optional(),
  variants: z.array(z.object({}).passthrough()).optional(),
  /** 编号规则自动取号：传前缀 + 流水号位数，后端锁内取号覆盖 name */
  codeAutoGen: z.object({
    prefix: z.string().max(180, '编号前缀过长'),
    serialLength: z.number().int().min(1).max(10),
  }).optional(),
}).passthrough();

const updateProductSchema = z.object({
  variants: z.array(z.object({}).passthrough()).optional(),
}).passthrough();

const importProductsSchema = z.object({
  categoryId: z.string().min(1, '分类ID不能为空'),
  products: z.array(z.object({
    name: z.string().min(1, '产品编号不能为空'),
    sku: z.string().optional(),
  }).passthrough()).min(1, '至少导入一条产品'),
  newDictionaryItems: z.array(z.object({
    type: z.string(),
    name: z.string(),
    value: z.string(),
  })).optional(),
});

const syncVariantsSchema = z.object({
  variants: z.array(z.object({}).passthrough()).default([]),
});

const createBomSchema = z.object({
  parentProductId: z.string().min(1, '父产品ID不能为空'),
  items: z.array(z.object({}).passthrough()).optional(),
}).passthrough();

const updateBomSchema = z.object({
  items: z.array(z.object({}).passthrough()).optional(),
}).passthrough();

// GET 读端点：本企业任意成员可只读（单据/报工选商品）；增删改仍要细粒度权限
router.get('/',    requireTenantMemberRead(),   ctrl.listProducts);
// 产品编号规则 / 预取号（必须先于 GET /:id 注册，否则被 :id 吞掉）
router.get('/code-rules', requireTenantMemberRead(), ctrl.getProductCodeRules);
router.get('/next-code', requireProductCodePrefetch(), ctrl.nextProductCode);
router.post('/import', requireSubPermission('basic:products:create'), validate(importProductsSchema), ctrl.importProducts);
router.get('/:id/receive-unit-weight-averages', requireTenantMemberRead(), ctrl.receiveUnitWeightAverages);
router.get('/:id/variant-usage', requireTenantMemberRead(), ctrl.variantUsage);
router.get('/:id', requireTenantMemberRead(),   ctrl.getProduct);
router.post('/',   requireSubPermission('basic:products:create'), validate(createProductSchema), ctrl.createProduct);
router.put('/:id', requireSubPermission('basic:products:edit'),   validate(updateProductSchema), ctrl.updateProduct);
router.delete('/:id', requireSubPermission('basic:products:delete'), ctrl.deleteProduct);

router.get('/:id/variants',  requireTenantMemberRead(),  ctrl.listVariants);
router.post('/:id/variants', requireSubPermission('basic:products:edit'),  validate(syncVariantsSchema), ctrl.syncVariants);

router.get('/boms/all',    requireTenantMemberRead(),   ctrl.listBoms);
router.get('/boms/:id',    requireTenantMemberRead(),   ctrl.getBom);
router.post('/boms',       requireSubPermission('basic:products:create'), validate(createBomSchema), ctrl.createBom);
router.put('/boms/:id',    requireSubPermission('basic:products:edit'),   validate(updateBomSchema), ctrl.updateBom);
router.delete('/boms/:id', requireSubPermission('basic:products:delete'), ctrl.deleteBom);

export default router;
