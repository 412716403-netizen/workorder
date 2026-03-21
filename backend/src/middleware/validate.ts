import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: '请求参数校验失败',
          details: err.errors.map(e => ({ path: e.path.join('.'), message: e.message })),
        });
        return;
      }
      next(err);
    }
  };
}
