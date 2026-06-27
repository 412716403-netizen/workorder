import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/dashboard.controller.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const workbenchConfigSchema = z.object({
  version: z.literal(1),
  activePageId: z.string().min(1),
  pages: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    sortOrder: z.number(),
    createdByUserId: z.string().nullable().optional(),
    layout: z.object({
      version: z.literal(1),
      items: z.array(z.object({
        i: z.string().min(1),
        widgetType: z.string().min(1),
        x: z.number(),
        y: z.number(),
        w: z.number(),
        h: z.number(),
        minW: z.number().optional(),
        minH: z.number().optional(),
      })),
    }),
  })).min(1),
});

const featurePluginsSchema = z.record(z.boolean().optional());

const shortcutIdsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(12),
});

const orderStatsNodeIdsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(12),
});

const publishMessageSchema = z.object({
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(2000),
});

/** 工作台：任意已选租户用户可访问，不做模块级 requirePermission */
router.get('/workbench', ctrl.getWorkbench);
router.put('/workbench', validate(workbenchConfigSchema), ctrl.saveUserWorkbench);
router.get('/workbench/pages', ctrl.getWorkbenchPages);
router.get('/shortcuts', ctrl.getShortcuts);
router.put('/shortcuts', validate(shortcutIdsSchema), ctrl.saveShortcuts);

router.get('/feature-plugins', ctrl.getFeaturePlugins);
router.put('/feature-plugins', validate(featurePluginsSchema), ctrl.updateFeaturePlugins);

router.get('/stats', ctrl.getStats);
router.get('/order-stats/settings', ctrl.getOrderStatsSettings);
router.put('/order-stats/settings', validate(orderStatsNodeIdsSchema), ctrl.saveOrderStatsSettings);
router.get('/order-stats', ctrl.getOrderStats);
router.get('/outsource-stats/settings', ctrl.getOutsourceStatsSettings);
router.put('/outsource-stats/settings', validate(orderStatsNodeIdsSchema), ctrl.saveOutsourceStatsSettings);
router.get('/outsource-stats', ctrl.getOutsourceStats);
router.get('/rework-stats/settings', ctrl.getReworkStatsSettings);
router.put('/rework-stats/settings', validate(orderStatsNodeIdsSchema), ctrl.saveReworkStatsSettings);
router.get('/rework-stats', ctrl.getReworkStats);
router.get('/notifications', ctrl.getNotifications);
router.get('/messages', ctrl.listPublishedMessages);
router.post('/messages', validate(publishMessageSchema), ctrl.publishMessage);
router.delete('/messages/:id', ctrl.deleteMessage);

export default router;
