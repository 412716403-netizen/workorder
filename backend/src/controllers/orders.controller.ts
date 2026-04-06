import type { Request, Response, NextFunction } from 'express';
import { getTenantPrisma } from '../lib/prisma.js';
import { str, optStr } from '../utils/request.js';
import * as ordersService from '../services/orders.service.js';

export async function listOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    res.json(await ordersService.listOrders(db, {
      status: optStr(req.query.status),
      productId: optStr(req.query.productId),
      parentOrderId: optStr(req.query.parentOrderId),
    }));
  } catch (e) { next(e); }
}

export async function getOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    res.json(await ordersService.getOrder(db, str(req.params.id)));
  } catch (e) { next(e); }
}

export async function updateOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    res.json(await ordersService.updateOrder(db, str(req.params.id), req.body));
  } catch (e) { next(e); }
}

export async function deleteOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    res.json(await ordersService.deleteOrder(db, str(req.params.id)));
  } catch (e) { next(e); }
}

export async function createReport(req: Request, res: Response, next: NextFunction) {
  try {
    const report = await ordersService.createReport(req.tenantId!, str(req.params.milestoneId), req.body);
    res.status(201).json(report);
  } catch (e) { next(e); }
}

export async function updateReport(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await ordersService.updateReport(req.tenantId!, str(req.params.milestoneId), str(req.params.reportId), req.body));
  } catch (e) { next(e); }
}

export async function deleteReport(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await ordersService.deleteReport(req.tenantId!, str(req.params.milestoneId), str(req.params.reportId)));
  } catch (e) { next(e); }
}

export async function getReportable(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    res.json(await ordersService.getReportable(db, str(req.params.id)));
  } catch (e) { next(e); }
}

export async function listProductProgress(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    res.json(await ordersService.listProductProgress(db));
  } catch (e) { next(e); }
}

export async function createProductReport(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    const report = await ordersService.createProductReport(db, req.tenantId!, req.body);
    res.status(201).json(report);
  } catch (e) { next(e); }
}

export async function updateProductReport(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    res.json(await ordersService.updateProductReport(db, str(req.params.reportId), req.body));
  } catch (e) { next(e); }
}

export async function deleteProductReport(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getTenantPrisma(req.tenantId!);
    res.json(await ordersService.deleteProductReport(db, str(req.params.reportId)));
  } catch (e) { next(e); }
}
