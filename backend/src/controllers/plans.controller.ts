import { getTenantPrisma } from '../lib/prisma.js';
import { str, optStr } from '../utils/request.js';
import * as planService from '../services/plans.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { listQueryFromRequest, warnListAllFromRequest } from '../utils/listQuery.js';

export const listPlans = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const { all, page, pageSize } = listQueryFromRequest(req);
  if (all) warnListAllFromRequest('plans.listPlans', req);
  const result = await planService.listPlans(db, {
    status: optStr(req.query.status),
    productId: optStr(req.query.productId),
    search: optStr(req.query.search),
    all,
    page,
    pageSize,
  });
  res.json(result);
});

export const getPlan = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const plan = await planService.getPlan(db, str(req.params.id));
  res.json(plan);
});

export const createPlan = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const db = getTenantPrisma(tenantId);
  const plan = await planService.createPlan(db, tenantId, req.body);
  res.status(201).json(plan);
});

export const updatePlan = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const plan = await planService.updatePlan(db, str(req.params.id), req.body);
  res.json(plan);
});

export const deletePlan = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const result = await planService.deletePlan(db, str(req.params.id));
  res.json(result);
});

export const convertToOrder = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const db = getTenantPrisma(tenantId);
  const result = await planService.convertPlanToOrders(db, tenantId, str(req.params.id));
  res.status(201).json(result);
});

export const createSubPlans = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId!;
  const db = getTenantPrisma(tenantId);
  const created = await planService.createSubPlans(db, tenantId, str(req.params.id), req.body);
  res.status(201).json(created);
});
