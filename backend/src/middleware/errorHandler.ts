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

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if ((err as any).name === 'TenantAccessError') {
    res.status((err as any).statusCode || 404).json({ error: err.message });
    return;
  }

  const payloadStatus = (err as any).status ?? (err as any).statusCode;
  if (payloadStatus === 413 || (err as any).type === 'entity.too.large') {
    res.status(413).json({
      error:
        '提交数据体积过大（常见于产品图、分类附件为 Base64）。请压缩或删除部分图片后重试。若前端经 Nginx 反向代理，请在对应 server 中设置 client_max_body_size 50m; 并执行 nginx -s reload，且与 JSON_BODY_LIMIT 环境变量保持一致。',
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    const msg = err.message;
    // 按字段语义拆分提示：避免「工序 reportDisplayTemplate」误报成「产品 route_report_values」
    if (msg.includes('routeReportDisplayValues') || msg.includes('route_report_display_values')) {
      res.status(500).json({
        error:
          '产品表缺少「报工页展示内容」存储列（route_report_display_values）。请在 backend 目录执行：npx prisma migrate deploy，并重启 API 服务。',
      });
      return;
    }
    if (msg.includes('routeReportValues') || msg.includes('route_report_values')) {
      res.status(500).json({
        error:
          '产品表缺少「标准生产路线填报」存储列（route_report_values）。请在 backend 目录执行：npx prisma migrate deploy，并重启 API 服务。',
      });
      return;
    }
    if (msg.includes('reportDisplayTemplate') || msg.includes('report_display_template')) {
      res.status(500).json({
        error:
          '数据库缺少「报工页展示模板」相关列（工序节点库 global_node_templates 或工单 milestones 的 report_display_template）。请在 backend 目录执行：npx prisma migrate deploy，并重启 API 服务。',
      });
      return;
    }
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2034':
        res.status(409).json({
          error:
            '当前保存与其他操作冲突（库存事务繁忙）。请稍后重试；若多次失败请稍隔几秒再点保存。',
        });
        return;
      case 'P2025':
        res.status(404).json({ error: '记录不存在或已被删除' });
        return;
      case 'P2002':
        res.status(409).json({ error: '数据重复，违反唯一约束' });
        return;
      case 'P2003':
        res.status(409).json({ error: '无法操作，存在关联数据' });
        return;
      case 'P2022': {
        const pe = err as Prisma.PrismaClientKnownRequestError;
        const msg = pe.message;
        const meta = pe.meta as { column?: string } | undefined;
        const col = typeof meta?.column === 'string' ? meta.column : '';
        const hit = (s: string) => msg.includes(s) || col.includes(s);

        let error =
          '数据库结构与当前代码不一致。请在 backend 目录执行：npx prisma migrate deploy，并重启 API 服务。';
        if (hit('report_display_template')) {
          error =
            '数据库缺少列 report_display_template（工序节点库 global_node_templates 或工单 milestones）。请在 backend 目录执行：npx prisma migrate deploy，并重启 API 服务。';
        } else if (hit('route_report_display_values')) {
          error =
            '产品表缺少列 route_report_display_values（报工页展示内容存档）。请在 backend 目录执行：npx prisma migrate deploy，并重启 API 服务。';
        } else if (hit('route_report_values')) {
          error =
            '产品表缺少列 route_report_values（标准生产路线填报）。请在 backend 目录执行：npx prisma migrate deploy，并重启 API 服务。';
        } else {
          error =
            '数据库结构与当前代码不一致（例如缺少 route_report_values、route_report_display_values、report_display_template 等列）。请在 backend 目录执行：npx prisma migrate deploy，并重启 API 服务。';
        }

        if (process.env.NODE_ENV !== 'production') {
          res.status(500).json({ error, detail: msg });
          return;
        }
        res.status(500).json({ error });
        return;
      }
    }
  }

  console.error(`[${req.method} ${req.originalUrl}] Unhandled error:`, err.message, err.stack?.split('\n').slice(0, 5).join('\n'));

  const isProduction = process.env.NODE_ENV === 'production';
  res.status(500).json({ error: isProduction ? '服务器内部错误，请稍后重试' : err.message || '服务器内部错误' });
}
