import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/masterData.controller.js';
import { requireSubPermission, requireSubPermissionOrProductionRead, requireSubPermissionOrFinanceRead, requireTenantMemberRead } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const importPartnersSchema = z.object({
  categoryId: z.string().min(1, '分类ID不能为空'),
  partners: z.array(z.object({
    name: z.string().min(1, '单位名称不能为空'),
  }).passthrough()).min(1, '至少导入一条合作单位'),
});

// 合作单位列表：本企业任意成员可只读（选客户/供应商）；增删改仍要细粒度权限
router.get('/partners',        requireTenantMemberRead(),   ctrl.listPartners);
router.post('/partners/import', requireSubPermission('basic:partners:create'), validate(importPartnersSchema), ctrl.importPartners);
router.post('/partners',       requireSubPermission('basic:partners:create'), ctrl.createPartner);
router.put('/partners/:id',    requireSubPermission('basic:partners:edit'),   ctrl.updatePartner);
router.delete('/partners/:id', requireSubPermission('basic:partners:delete'), ctrl.deletePartner);

// 工人（列表读放宽给财务域：收付款分类开启「关联工人」时）
router.get('/workers',        requireSubPermissionOrFinanceRead('basic:members:view'),   ctrl.listWorkers);
router.post('/workers',       requireSubPermission('basic:members:create'), ctrl.createWorker);
router.put('/workers/:id',    requireSubPermission('basic:members:edit'),   ctrl.updateWorker);
router.delete('/workers/:id', requireSubPermission('basic:members:delete'), ctrl.deleteWorker);

// 设备（列表读放宽给生产域用户：工序开启「报工记录设备」时报工页需要设备列表）
router.get('/equipment',        requireSubPermissionOrProductionRead('basic:equipment:view'),   ctrl.listEquipment);
router.post('/equipment',       requireSubPermission('basic:equipment:create'), ctrl.createEquipment);
router.put('/equipment/:id',    requireSubPermission('basic:equipment:edit'),   ctrl.updateEquipment);
router.delete('/equipment/:id', requireSubPermission('basic:equipment:delete'), ctrl.deleteEquipment);

// 字典（颜色/尺码/单位：产品规格与报工矩阵依赖；本企业成员可只读）
router.get('/dictionaries',        requireTenantMemberRead(),   ctrl.listDictionaries);
router.post('/dictionaries',       requireSubPermission('basic:dictionaries:create'), ctrl.createDictionaryItem);
router.put('/dictionaries/:id',    requireSubPermission('basic:dictionaries:edit'),   ctrl.updateDictionaryItem);
router.delete('/dictionaries/:id', requireSubPermission('basic:dictionaries:delete'), ctrl.deleteDictionaryItem);

export default router;
