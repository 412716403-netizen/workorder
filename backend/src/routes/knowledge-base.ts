import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/knowledge-base.controller.js';
import { validate } from '../middleware/validate.js';
import { requireSubPermission } from '../middleware/tenant.js';

const router = Router();

const createFolderSchema = z.object({
  name: z.string().trim().min(1).max(200),
  parentId: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
}).passthrough();

const updateFolderSchema = createFolderSchema.partial();

const createDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  folderId: z.string().optional().nullable(),
  content: z.string().optional(),
  sortOrder: z.number().int().optional(),
}).passthrough();

const updateDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  folderId: z.string().optional().nullable(),
  content: z.string().optional(),
  sortOrder: z.number().int().optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
}).passthrough();

const uploadAssetSchema = z.object({
  data: z.string().min(1),
  mimeType: z.string().trim().min(1).max(100),
});

router.get('/tree', requireSubPermission('knowledge_base:folders:view'), ctrl.getTree);

router.get('/folders', requireSubPermission('knowledge_base:folders:view'), ctrl.listFolders);
router.post('/folders', requireSubPermission('knowledge_base:folders:create'), validate(createFolderSchema), ctrl.createFolder);
router.put('/folders/:id', requireSubPermission('knowledge_base:folders:edit'), validate(updateFolderSchema), ctrl.updateFolder);
router.delete('/folders/:id', requireSubPermission('knowledge_base:folders:delete'), ctrl.deleteFolder);

router.get('/documents', requireSubPermission('knowledge_base:documents:view'), ctrl.listDocuments);
router.get('/documents/:id/references', requireSubPermission('knowledge_base:documents:view'), ctrl.getDocumentReferences);
router.get('/documents/:id', requireSubPermission('knowledge_base:documents:view'), ctrl.getDocument);
router.post('/documents', requireSubPermission('knowledge_base:documents:create'), validate(createDocumentSchema), ctrl.createDocument);
router.put('/documents/:id', requireSubPermission('knowledge_base:documents:edit'), validate(updateDocumentSchema), ctrl.updateDocument);
router.delete('/documents/:id', requireSubPermission('knowledge_base:documents:delete'), ctrl.deleteDocument);

router.post('/assets', requireSubPermission('knowledge_base:documents:edit'), validate(uploadAssetSchema), ctrl.uploadAsset);
router.get('/assets/:id', requireSubPermission('knowledge_base:documents:view'), ctrl.getAsset);

export default router;
