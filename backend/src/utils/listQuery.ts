import type { Request } from 'express';

/** 解析列表接口 query：默认分页；`all=true` 时返回全量（兼容旧客户端，并打 warn 日志）。 */
export function listQueryFromRequest(req: Pick<Request, 'query'>): {
  all: boolean;
  page: number;
  pageSize: number;
} {
  const q = req.query as Record<string, string | string[] | undefined>;
  const rawAll = q.all;
  const all = rawAll === 'true' || rawAll === '1';
  let page = Number(q.page);
  if (!Number.isFinite(page) || page < 1) page = 1;
  let pageSize = Number(q.pageSize);
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = 50;
  pageSize = Math.min(pageSize, 200);
  return { all, page, pageSize };
}

export function warnListAll(service: string, extra?: string): void {
  console.warn(`[list:all] service=${service}${extra ? ` ${extra}` : ''}`);
}

/** 带路由与租户（若存在）的 warn，便于追踪全量 list 调用来源 */
export function warnListAllFromRequest(
  service: string,
  req: { path?: string; originalUrl?: string; tenantId?: string },
): void {
  const route = req.path ?? req.originalUrl ?? '?';
  const tenant = req.tenantId ? ` tenantId=${req.tenantId}` : '';
  warnListAll(service, `route=${route}${tenant}`);
}
