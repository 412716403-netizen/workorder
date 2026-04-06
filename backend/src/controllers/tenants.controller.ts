import type { Request, Response, NextFunction } from 'express';
import { str } from '../utils/request.js';
import * as authService from '../services/auth.service.js';
import * as tenantsService from '../services/tenants.service.js';

export async function createTenant(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await tenantsService.createTenant(req.user!.userId, req.body);
    res.status(201).json(result);
  } catch (e) { next(e); }
}

export async function listTenants(req: Request, res: Response, next: NextFunction) {
  try { res.json(await tenantsService.listTenants(req.user!.userId)); }
  catch (e) { next(e); }
}

export async function selectTenant(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.selectTenant(req.user!.userId, str(req.params.id));
    const { setAuthCookies } = await import('../utils/cookies.js');
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.json(result);
  } catch (e) { next(e); }
}

export async function getTenant(req: Request, res: Response, next: NextFunction) {
  try { res.json(await tenantsService.getTenant(req.user!.userId, str(req.params.id))); }
  catch (e) { next(e); }
}

export async function updateTenant(req: Request, res: Response, next: NextFunction) {
  try { res.json(await tenantsService.updateTenant(req.user!.userId, str(req.params.id), req.body)); }
  catch (e) { next(e); }
}

export async function getMembers(req: Request, res: Response, next: NextFunction) {
  try { res.json(await tenantsService.getMembers(str(req.params.id))); }
  catch (e) { next(e); }
}

export async function updateMemberRole(req: Request, res: Response, next: NextFunction) {
  try { res.json(await tenantsService.updateMemberRole(req.user!.userId, str(req.params.id), str(req.params.uid), req.body)); }
  catch (e) { next(e); }
}

export async function updateMemberPermissions(req: Request, res: Response, next: NextFunction) {
  try { res.json(await tenantsService.updateMemberPermissions(req.user!.userId, str(req.params.id), str(req.params.uid), req.body.permissions)); }
  catch (e) { next(e); }
}

export async function removeMember(req: Request, res: Response, next: NextFunction) {
  try { res.json(await tenantsService.removeMember(req.user!.userId, str(req.params.id), str(req.params.uid))); }
  catch (e) { next(e); }
}

export async function lookupByInviteCode(req: Request, res: Response, next: NextFunction) {
  try { res.json(await tenantsService.lookupByInviteCode((req.query.code as string)?.trim())); }
  catch (e) { next(e); }
}

export async function applyToJoin(req: Request, res: Response, next: NextFunction) {
  try {
    const app = await tenantsService.applyToJoin(req.user!.userId, str(req.params.id), req.body.message);
    res.status(201).json(app);
  } catch (e) { next(e); }
}

export async function getApplications(req: Request, res: Response, next: NextFunction) {
  try { res.json(await tenantsService.getApplications(str(req.params.id))); }
  catch (e) { next(e); }
}

export async function reviewApplication(req: Request, res: Response, next: NextFunction) {
  try { res.json(await tenantsService.reviewApplication(req.user!.userId, str(req.params.id), str(req.params.appId), req.body)); }
  catch (e) { next(e); }
}

export async function getMyApplications(req: Request, res: Response, next: NextFunction) {
  try { res.json(await tenantsService.getMyApplications(req.user!.userId)); }
  catch (e) { next(e); }
}

export async function getReportableMembers(req: Request, res: Response, next: NextFunction) {
  try { res.json(await tenantsService.getReportableMembers(str(req.params.id))); }
  catch (e) { next(e); }
}

export async function updateMemberMilestones(req: Request, res: Response, next: NextFunction) {
  try { res.json(await tenantsService.updateMemberMilestones(req.user!.userId, str(req.params.id), str(req.params.uid), req.body.assignedMilestoneIds)); }
  catch (e) { next(e); }
}
