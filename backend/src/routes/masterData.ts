import { Router } from 'express';
import * as ctrl from '../controllers/masterData.controller.js';
import { requireSubPermission } from '../middleware/tenant.js';

const router = Router();

// 合作单位
router.get('/partners',        requireSubPermission('basic:partners:view'),   ctrl.listPartners);
router.post('/partners',       requireSubPermission('basic:partners:create'), ctrl.createPartner);
router.put('/partners/:id',    requireSubPermission('basic:partners:edit'),   ctrl.updatePartner);
router.delete('/partners/:id', requireSubPermission('basic:partners:delete'), ctrl.deletePartner);

// 设备
router.get('/equipment',        requireSubPermission('basic:equipment:view'),   ctrl.listEquipment);
router.post('/equipment',       requireSubPermission('basic:equipment:create'), ctrl.createEquipment);
router.put('/equipment/:id',    requireSubPermission('basic:equipment:edit'),   ctrl.updateEquipment);
router.delete('/equipment/:id', requireSubPermission('basic:equipment:delete'), ctrl.deleteEquipment);

// 字典
router.get('/dictionaries',        requireSubPermission('basic:dictionaries:view'),   ctrl.listDictionaries);
router.post('/dictionaries',       requireSubPermission('basic:dictionaries:create'), ctrl.createDictionaryItem);
router.put('/dictionaries/:id',    requireSubPermission('basic:dictionaries:edit'),   ctrl.updateDictionaryItem);
router.delete('/dictionaries/:id', requireSubPermission('basic:dictionaries:delete'), ctrl.deleteDictionaryItem);

export default router;
