import { getTenantPrisma } from '../lib/prisma.js';
import { str, optStr } from '../utils/request.js';
import * as masterDataService from '../services/masterData.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

// ── 合作单位 ──
export const listPartners = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await masterDataService.listPartners(db, { categoryId: optStr(req.query.categoryId), search: optStr(req.query.search) }));
});
export const createPartner = asyncHandler(async (req, res) => {
  res.status(201).json(await masterDataService.createPartner(getTenantPrisma(req.tenantId!), req.body));
});
export const updatePartner = asyncHandler(async (req, res) => {
  res.json(await masterDataService.updatePartner(getTenantPrisma(req.tenantId!), str(req.params.id), req.body));
});
export const deletePartner = asyncHandler(async (req, res) => {
  res.json(await masterDataService.deletePartner(getTenantPrisma(req.tenantId!), str(req.params.id)));
});

// ── 工人 ──
export const listWorkers = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await masterDataService.listWorkers(db, { status: optStr(req.query.status), search: optStr(req.query.search) }));
});
export const createWorker = asyncHandler(async (req, res) => {
  res.status(201).json(await masterDataService.createWorker(getTenantPrisma(req.tenantId!), req.body));
});
export const updateWorker = asyncHandler(async (req, res) => {
  res.json(await masterDataService.updateWorker(getTenantPrisma(req.tenantId!), str(req.params.id), req.body));
});
export const deleteWorker = asyncHandler(async (req, res) => {
  res.json(await masterDataService.deleteWorker(getTenantPrisma(req.tenantId!), str(req.params.id)));
});

// ── 设备 ──
export const listEquipment = asyncHandler(async (req, res) => {
  res.json(await masterDataService.listEquipment(getTenantPrisma(req.tenantId!), { search: optStr(req.query.search) }));
});
export const createEquipment = asyncHandler(async (req, res) => {
  res.status(201).json(await masterDataService.createEquipment(getTenantPrisma(req.tenantId!), req.body));
});
export const updateEquipment = asyncHandler(async (req, res) => {
  res.json(await masterDataService.updateEquipment(getTenantPrisma(req.tenantId!), str(req.params.id), req.body));
});
export const deleteEquipment = asyncHandler(async (req, res) => {
  res.json(await masterDataService.deleteEquipment(getTenantPrisma(req.tenantId!), str(req.params.id)));
});

// ── 数据字典 ──
export const listDictionaries = asyncHandler(async (req, res) => {
  res.json(await masterDataService.listDictionaries(getTenantPrisma(req.tenantId!)));
});
export const createDictionaryItem = asyncHandler(async (req, res) => {
  res.status(201).json(await masterDataService.createDictionaryItem(getTenantPrisma(req.tenantId!), req.body));
});
export const updateDictionaryItem = asyncHandler(async (req, res) => {
  const result = await masterDataService.updateDictionaryItem(getTenantPrisma(req.tenantId!), str(req.params.id), req.body);
  if (!result) { res.status(404).json({ error: '记录不存在' }); return; }
  if ('_validationError' in result) { res.status(400).json({ error: result._validationError }); return; }
  res.json(result);
});
export const deleteDictionaryItem = asyncHandler(async (req, res) => {
  res.json(await masterDataService.deleteDictionaryItem(getTenantPrisma(req.tenantId!), str(req.params.id)));
});
