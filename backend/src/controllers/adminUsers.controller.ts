import type { Request, Response, NextFunction } from 'express';
import * as adminUsersService from '../services/adminUsers.service.js';
import { str } from '../utils/request.js';

export async function list(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await adminUsersService.listAdminUsers());
  } catch (e) {
    next(e);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await adminUsersService.createAdminUser(req.body);
    res.status(201).json(user);
  } catch (e) {
    next(e);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const id = str(req.params.id);
    const user = await adminUsersService.updateAdminUser(req.user!.userId, id, req.body);
    res.json(user);
  } catch (e) {
    next(e);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const id = str(req.params.id);
    await adminUsersService.deleteAdminUser(req.user!.userId, id);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
}
