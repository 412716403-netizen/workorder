import { getTenantPrisma } from '../lib/prisma.js';
import { str, optStr } from '../utils/request.js';
import * as ordersService from '../services/orders.service.js';
import * as workerReportService from '../services/workerReport.service.js';
import * as settingsService from '../services/settings.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { listQueryFromRequest, warnListAllFromRequest } from '../utils/listQuery.js';
import { isOrderDispatchStatus, ReportApprovalStatus } from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';

export const listOrders = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const { all, page, pageSize } = listQueryFromRequest(req);
  if (all) warnListAllFromRequest('orders.listOrders', req);
  res.json(await ordersService.listOrders(db, {
    status: optStr(req.query.status),
    productId: optStr(req.query.productId),
    parentOrderId: optStr(req.query.parentOrderId),
    search: optStr(req.query.search),
    lite: req.query.lite === 'true',
    excludeCompleted: req.query.excludeCompleted === 'true',
    all,
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

/**
 * PATCH /api/orders/:id/dispatch-status
 * 手动切换工单派发完成状态（仅工单中心徽章使用）。
 * body：`{ status: 'IN_PROGRESS' | 'COMPLETED' }`
 */
export const updateDispatchStatus = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const status = (req.body as { status?: unknown })?.status;
  if (!isOrderDispatchStatus(status)) {
    throw new AppError(400, 'status 仅允许 IN_PROGRESS 或 COMPLETED');
  }
  res.json(await ordersService.updateOrderDispatchStatus(db, str(req.params.id), status));
});

export const createReport = asyncHandler(async (req, res) => {
  const report = await ordersService.createReport(
    req.tenantId!,
    str(req.params.milestoneId),
    req.body,
    { actorUserId: req.user?.userId },
  );
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

export const listReportHistory = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const orderIdsCsv = optStr(req.query.orderIds);
  const productIdsCsv = optStr(req.query.productIds);
  const modeRaw = optStr(req.query.productionLinkMode);
  const productionLinkMode =
    modeRaw === 'product' || modeRaw === 'order' ? modeRaw : undefined;
  const workerIdRaw = optStr(req.query.workerId);
  const workerId =
    workerIdRaw === 'me' ? req.user?.userId : workerIdRaw || undefined;
  const approvalStatusRaw = optStr(req.query.approvalStatus);
  const approvalStatus =
    approvalStatusRaw === ReportApprovalStatus.PENDING ||
    approvalStatusRaw === ReportApprovalStatus.APPROVED ||
    approvalStatusRaw === ReportApprovalStatus.REJECTED
      ? approvalStatusRaw
      : undefined;
  res.json(
    await ordersService.listReportHistory(db, {
      startDate: optStr(req.query.startDate),
      endDate: optStr(req.query.endDate),
      orderIds: orderIdsCsv ? orderIdsCsv.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      productIds: productIdsCsv ? productIdsCsv.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      search: optStr(req.query.search),
      productionLinkMode,
      workerId,
      approvalStatus,
    }),
  );
});

export const listMyReportableTasks = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const modeRaw = optStr(req.query.productionLinkMode);
  const productionLinkMode =
    modeRaw === 'product' || modeRaw === 'order' ? modeRaw : undefined;
  if (!req.user?.userId) throw new AppError(401, '未登录');
  res.json(
    await workerReportService.listMyReportableTasks(db, req.tenantId!, req.user.userId, {
      productionLinkMode,
    }),
  );
});

/** 工人「我的报工」：强制 workerId=当前用户，只需 process_report / 生产只读 */
export const listMyReportHistory = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  if (!req.user?.userId) throw new AppError(401, '未登录');
  const modeRaw = optStr(req.query.productionLinkMode);
  const productionLinkMode =
    modeRaw === 'product' || modeRaw === 'order' ? modeRaw : undefined;
  const approvalStatusRaw = optStr(req.query.approvalStatus);
  const approvalStatus =
    approvalStatusRaw === ReportApprovalStatus.PENDING ||
    approvalStatusRaw === ReportApprovalStatus.APPROVED ||
    approvalStatusRaw === ReportApprovalStatus.REJECTED
      ? approvalStatusRaw
      : undefined;
  res.json(
    await ordersService.listReportHistory(db, {
      startDate: optStr(req.query.startDate),
      endDate: optStr(req.query.endDate),
      search: optStr(req.query.search),
      productionLinkMode: productionLinkMode ?? 'product',
      workerId: req.user.userId,
      approvalStatus,
    }),
  );
});

export const approveReport = asyncHandler(async (req, res) => {
  if (!req.user?.userId) throw new AppError(401, '未登录');
  res.json(
    await workerReportService.approveReport(req.tenantId!, str(req.params.reportId), req.user.userId),
  );
});

export const rejectReport = asyncHandler(async (req, res) => {
  if (!req.user?.userId) throw new AppError(401, '未登录');
  const reason =
    typeof (req.body as { reason?: unknown })?.reason === 'string'
      ? (req.body as { reason: string }).reason
      : undefined;
  res.json(
    await workerReportService.rejectReport(
      req.tenantId!,
      str(req.params.reportId),
      req.user.userId,
      reason,
    ),
  );
});

export const listProductProgress = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const { all, page, pageSize } = listQueryFromRequest(req);
  if (all) warnListAllFromRequest('orders.listProductProgress', req);
  res.json(await ordersService.listProductProgress(db, { all, page, pageSize }));
});

export const createProductReport = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const report = await ordersService.createProductReport(db, req.tenantId!, req.body, {
    actorUserId: req.user?.userId,
  });
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

/** PUT /api/orders/node-report-templates — 工单中心表单配置保存工序报工自定义字段 */
export const updateNodeReportTemplates = asyncHandler(async (req, res) => {
  const db = getTenantPrisma(req.tenantId!);
  const { updates } = req.body as { updates: Array<{ nodeId: string; reportTemplate: unknown }> };
  res.json(await settingsService.batchUpdateNodeReportTemplates(db, updates));
});
