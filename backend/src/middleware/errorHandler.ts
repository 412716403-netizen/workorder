import type { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    /** 可选机器可读码（如 WECHAT_NOT_BOUND），前端可按 code 分支 */
    public code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * P2002 唯一冲突的友好文案，key 为 `${meta.modelName}:${冲突列名以逗号连接}`。
 * `meta.target` 给的是**数据库列名**数组（Product 冲突实测为 `["tenant_id","name"]`），
 * 且不同模型可能有完全相同的列组合（Product 与 DevStageTemplate 都是 tenant_id+name），
 * 因此必须带 modelName 精确匹配；按列名做子串猜测会串味（例如 `username` 命中 `name`）。
 * 未列出的约束走兜底文案，会附带冲突列名便于排查。
 */
const UNIQUE_CONFLICT_MESSAGES: Record<string, string> = {
  'Product:tenant_id,name': '产品编号已存在，请更换后再试',
  'DevStageTemplate:tenant_id,name': '开发节点名称已存在，请更换后再试',
  'DictionaryItem:tenant_id,type,name': '该名称在同类型字典项中已存在，请更换后再试',
  'Partner:tenant_id,partner_list_no': '合作单位编号已存在，请更换后再试',
  'PlanOrder:tenant_id,plan_number': '计划单号已存在，请更换后再试',
  'ProductionOrder:tenant_id,order_number': '工单号已存在，请更换后再试',
  'CollaborationProductMap:collaboration_id,sender_sku':
    '该协同产品映射已存在：同一协同关系下，同一来源产品名称只能映射一条',
  'User:username': '用户名已被占用，请更换后再试',
  'User:phone': '手机号已被其他账号使用',
  'User:email': '邮箱已被其他账号使用',
  'User:wx_mini_openid': '该微信已绑定其他账号',
};

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    const body: { error: string; code?: string } = { error: err.message };
    if (err.code) body.code = err.code;
    res.status(err.statusCode).json(body);
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
    if (msg.includes('processLocked')) {
      res.status(500).json({
        error: '保存产品时携带了只读字段 processLocked，请刷新页面后重试。',
      });
      return;
    }
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
      case 'P2000':
        res.status(400).json({
          error: '提交字段超长或格式不符合数据库约束，请检查单号、批号、备注等后重试',
        });
        return;
      case 'P2002': {
        const meta = err.meta as { modelName?: unknown; target?: unknown } | undefined;
        const model = typeof meta?.modelName === 'string' ? meta.modelName : '';
        const columns = Array.isArray(meta?.target) ? meta.target.map((t) => String(t)) : [];
        const mapped = UNIQUE_CONFLICT_MESSAGES[`${model}:${columns.join(',')}`];
        if (mapped) {
          res.status(409).json({ error: mapped });
          return;
        }
        res.status(409).json({
          error: columns.length
            ? `数据重复，违反唯一约束（冲突字段：${columns.join('、')}）`
            : '数据重复，违反唯一约束',
        });
        return;
      }
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
