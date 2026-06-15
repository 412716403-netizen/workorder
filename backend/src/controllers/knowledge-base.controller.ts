import { getTenantPrisma } from '../lib/prisma.js';
import { str, optStr } from '../utils/request.js';
import * as svc from '../services/knowledge-base.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const getTree = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await svc.getTree(db));
});

export const listFolders = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const parentIdRaw = optStr(req.query.parentId);
  const parentId = parentIdRaw === undefined ? undefined : parentIdRaw || null;
  res.json(await svc.listFolders(db, { parentId }));
});

export const createFolder = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const db = getTenantPrisma(tenantId);
  const row = await svc.createFolder(db, tenantId, req.body);
  res.status(201).json(row);
});

export const updateFolder = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const row = await svc.updateFolder(db, str(req.params.id), req.body);
  res.json(row);
});

export const deleteFolder = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await svc.deleteFolder(db, str(req.params.id)));
});

export const listDocuments = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const folderIdRaw = optStr(req.query.folderId);
  const folderId = folderIdRaw === undefined ? undefined : folderIdRaw || null;
  res.json(await svc.listDocuments(db, {
    folderId,
    search: optStr(req.query.search),
  }));
});

export const getDocument = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await svc.getDocument(db, str(req.params.id)));
});

export const getDocumentReferences = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await svc.getDocumentReferences(db, str(req.params.id)));
});

export const createDocument = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const db = getTenantPrisma(tenantId);
  const row = await svc.createDocument(db, tenantId, req.body);
  res.status(201).json(row);
});

export const updateDocument = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const row = await svc.updateDocument(db, str(req.params.id), req.body);
  res.json(row);
});

export const deleteDocument = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await svc.deleteDocument(db, str(req.params.id)));
});

export const uploadAsset = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const db = getTenantPrisma(tenantId);
  const body = req.body as { data?: string; mimeType?: string };
  res.status(201).json(await svc.uploadAsset(db, tenantId, body));
});

export const getAsset = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const asset = await svc.getAsset(db, str(req.params.id));
  res.setHeader('Content-Type', asset.mimeType);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.send(asset.data);
});
