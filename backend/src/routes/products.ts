import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/products.controller.js';
import { requireSubPermission } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const createProductSchema = z.object({
  name: z.string().min(1, '产品名称不能为空'),
  sku: z.string().min(1, 'SKU不能为空'),
  variants: z.array(z.object({}).passthrough()).optional(),
}).passthrough();

const updateProductSchema = z.object({
  variants: z.array(z.object({}).passthrough()).optional(),
}).passthrough();

const importProductsSchema = z.object({
  categoryId: z.string().min(1, '分类ID不能为空'),
  products: z.array(z.object({
    name: z.string().min(1, '产品名称不能为空'),
    sku: z.string().min(1, 'SKU不能为空'),
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

router.get('/',    requireSubPermission('basic:products:view'),   ctrl.listProducts);
router.post('/import', requireSubPermission('basic:products:create'), validate(importProductsSchema), ctrl.importProducts);
router.get('/:id', requireSubPermission('basic:products:view'),   ctrl.getProduct);
router.post('/',   requireSubPermission('basic:products:create'), validate(createProductSchema), ctrl.createProduct);
router.put('/:id', requireSubPermission('basic:products:edit'),   validate(updateProductSchema), ctrl.updateProduct);
router.delete('/:id', requireSubPermission('basic:products:delete'), ctrl.deleteProduct);

router.get('/:id/variants',  requireSubPermission('basic:products:view'),  ctrl.listVariants);
router.post('/:id/variants', requireSubPermission('basic:products:edit'),  validate(syncVariantsSchema), ctrl.syncVariants);

router.get('/boms/all',    requireSubPermission('basic:products:view'),   ctrl.listBoms);
router.get('/boms/:id',    requireSubPermission('basic:products:view'),   ctrl.getBom);
router.post('/boms',       requireSubPermission('basic:products:create'), validate(createBomSchema), ctrl.createBom);
router.put('/boms/:id',    requireSubPermission('basic:products:edit'),   validate(updateBomSchema), ctrl.updateBom);
router.delete('/boms/:id', requireSubPermission('basic:products:delete'), ctrl.deleteBom);

export default router;
