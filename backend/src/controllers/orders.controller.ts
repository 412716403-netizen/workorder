import { getTenantPrisma } from '../lib/prisma.js';
import { str, optStr } from '../utils/request.js';
import * as ordersService from '../services/orders.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const listOrders = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const page = req.query.page ? Number(req.query.page) : undefined;
  const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined;
  res.json(await ordersService.listOrders(db, {
    status: optStr(req.query.status),
    productId: optStr(req.query.productId),
    parentOrderId: optStr(req.query.parentOrderId),
    search: optStr(req.query.search),
    lite: req.query.lite === 'true',
    page,
    pageSize,
  }));
});

export const getOrder = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await ordersService.getOrder(db, str(req.params.id)));
});

export const updateOrder = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await ordersService.updateOrder(db, str(req.params.id), req.body));
});

export const deleteOrder = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await ordersService.deleteOrder(db, str(req.params.id)));
});

export const createReport = asyncHandler(async (req, res) => {
  const report = await ordersService.createReport(req.tenantId!, str(req.params.milestoneId), req.body);
  res.status(201).json(report);
});

export const updateReport = asyncHandler(async (req, res) => {
  res.json(await ordersService.updateReport(req.tenantId!, str(req.params.milestoneId), str(req.params.reportId), req.body));
});

export const deleteReport = asyncHandler(async (req, res) => {
  res.json(await ordersService.deleteReport(req.tenantId!, str(req.params.milestoneId), str(req.params.reportId)));
});

export const getReportable = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await ordersService.getReportable(db, str(req.params.id)));
});

export const listProductProgress = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await ordersService.listProductProgress(db));
});

export const createProductReport = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const report = await ordersService.createProductReport(db, req.tenantId!, req.body);
  res.status(201).json(report);
});

export const updateProductReport = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await ordersService.updateProductReport(db, str(req.params.reportId), req.body));
});

export const deleteProductReport = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  res.json(await ordersService.deleteProductReport(db, str(req.params.reportId)));
});
