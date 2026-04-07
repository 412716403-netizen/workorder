import { getTenantPrisma } from '../lib/prisma.js';
import { str } from '../utils/request.js';
import * as settingsService from '../services/settings.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

// ── 产品分类 ──
export const listCategories = asyncHandler(async (req, res) => {
  res.json(await settingsService.listCategories(getTenantPrisma(req.tenantId!)));
});
export const createCategory = asyncHandler(async (req, res) => {
  res.status(201).json(await settingsService.createCategory(getTenantPrisma(req.tenantId!), req.body));
});
export const updateCategory = asyncHandler(async (req, res) => {
  res.json(await settingsService.updateCategory(getTenantPrisma(req.tenantId!), str(req.params.id), req.body));
});
export const deleteCategory = asyncHandler(async (req, res) => {
  res.json(await settingsService.deleteCategory(getTenantPrisma(req.tenantId!), str(req.params.id)));
});

// ── 合作单位分类 ──
export const listPartnerCategories = asyncHandler(async (req, res) => {
  res.json(await settingsService.listPartnerCategories(getTenantPrisma(req.tenantId!)));
});
export const createPartnerCategory = asyncHandler(async (req, res) => {
  res.status(201).json(await settingsService.createPartnerCategory(getTenantPrisma(req.tenantId!), req.body));
});
export const updatePartnerCategory = asyncHandler(async (req, res) => {
  res.json(await settingsService.updatePartnerCategory(getTenantPrisma(req.tenantId!), str(req.params.id), req.body));
});
export const deletePartnerCategory = asyncHandler(async (req, res) => {
  res.json(await settingsService.deletePartnerCategory(getTenantPrisma(req.tenantId!), str(req.params.id)));
});

// ── 工序节点 ──
export const listNodes = asyncHandler(async (req, res) => {
  res.json(await settingsService.listNodes(getTenantPrisma(req.tenantId!)));
});
export const createNode = asyncHandler(async (req, res) => {
  res.status(201).json(await settingsService.createNode(getTenantPrisma(req.tenantId!), req.body));
});
export const updateNode = asyncHandler(async (req, res) => {
  res.json(await settingsService.updateNode(getTenantPrisma(req.tenantId!), str(req.params.id), req.body));
});
export const deleteNode = asyncHandler(async (req, res) => {
  res.json(await settingsService.deleteNode(getTenantPrisma(req.tenantId!), str(req.params.id)));
});

// ── 仓库 ──
export const listWarehouses = asyncHandler(async (req, res) => {
  res.json(await settingsService.listWarehouses(getTenantPrisma(req.tenantId!)));
});
export const createWarehouse = asyncHandler(async (req, res) => {
  res.status(201).json(await settingsService.createWarehouse(getTenantPrisma(req.tenantId!), req.body));
});
export const updateWarehouse = asyncHandler(async (req, res) => {
  res.json(await settingsService.updateWarehouse(getTenantPrisma(req.tenantId!), str(req.params.id), req.body));
});
export const deleteWarehouse = asyncHandler(async (req, res) => {
  res.json(await settingsService.deleteWarehouse(getTenantPrisma(req.tenantId!), str(req.params.id)));
});

// ── 收付款类型 ──
export const listFinanceCategories = asyncHandler(async (req, res) => {
  res.json(await settingsService.listFinanceCategories(getTenantPrisma(req.tenantId!)));
});
export const createFinanceCategory = asyncHandler(async (req, res) => {
  res.status(201).json(await settingsService.createFinanceCategory(getTenantPrisma(req.tenantId!), req.body));
});
export const updateFinanceCategory = asyncHandler(async (req, res) => {
  res.json(await settingsService.updateFinanceCategory(getTenantPrisma(req.tenantId!), str(req.params.id), req.body));
});
export const deleteFinanceCategory = asyncHandler(async (req, res) => {
  res.json(await settingsService.deleteFinanceCategory(getTenantPrisma(req.tenantId!), str(req.params.id)));
});

// ── 收支账户类型 ──
export const listFinanceAccountTypes = asyncHandler(async (req, res) => {
  res.json(await settingsService.listFinanceAccountTypes(getTenantPrisma(req.tenantId!)));
});
export const createFinanceAccountType = asyncHandler(async (req, res) => {
  res.status(201).json(await settingsService.createFinanceAccountType(getTenantPrisma(req.tenantId!), req.body));
});
export const updateFinanceAccountType = asyncHandler(async (req, res) => {
  res.json(await settingsService.updateFinanceAccountType(getTenantPrisma(req.tenantId!), str(req.params.id), req.body));
});
export const deleteFinanceAccountType = asyncHandler(async (req, res) => {
  res.json(await settingsService.deleteFinanceAccountType(getTenantPrisma(req.tenantId!), str(req.params.id)));
});

// ── 系统配置 ──
export const getConfig = asyncHandler(async (req, res) => {
  res.json(await settingsService.getConfig(req.tenantId!));
});
export const updateConfig = asyncHandler(async (req, res) => {
  res.json(await settingsService.updateConfig(req.tenantId!, str(req.params.key), req.body.value));
});
