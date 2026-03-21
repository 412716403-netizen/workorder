import { Router } from 'express';
import * as ctrl from '../controllers/products.controller.js';
import { requireSubPermission } from '../middleware/tenant.js';

const router = Router();

// 产品
router.get('/',    requireSubPermission('basic:products:view'),   ctrl.listProducts);
router.get('/:id', requireSubPermission('basic:products:view'),   ctrl.getProduct);
router.post('/',   requireSubPermission('basic:products:create'), ctrl.createProduct);
router.put('/:id', requireSubPermission('basic:products:edit'),   ctrl.updateProduct);
router.delete('/:id', requireSubPermission('basic:products:delete'), ctrl.deleteProduct);

// 产品变体
router.get('/:id/variants',  requireSubPermission('basic:products:view'),  ctrl.listVariants);
router.post('/:id/variants', requireSubPermission('basic:products:edit'),  ctrl.syncVariants);

// BOM
router.get('/boms/all',    requireSubPermission('basic:products:view'),   ctrl.listBoms);
router.get('/boms/:id',    requireSubPermission('basic:products:view'),   ctrl.getBom);
router.post('/boms',       requireSubPermission('basic:products:create'), ctrl.createBom);
router.put('/boms/:id',    requireSubPermission('basic:products:edit'),   ctrl.updateBom);
router.delete('/boms/:id', requireSubPermission('basic:products:delete'), ctrl.deleteBom);

export default router;
