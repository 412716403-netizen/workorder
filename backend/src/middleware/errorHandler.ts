import type { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2025':
        res.status(404).json({ error: '记录不存在或已被删除' });
        return;
      case 'P2002':
        res.status(409).json({ error: '数据重复，违反唯一约束' });
        return;
      case 'P2003':
        res.status(409).json({ error: '无法操作，存在关联数据' });
        return;
    }
  }

  console.error(`[${_req.method} ${_req.originalUrl}] Unhandled error:`, err.message, err.stack?.split('\n').slice(0, 5).join('\n'));
  res.status(500).json({ error: err.message || 'Internal server error' });
}
