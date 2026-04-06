import type {
  PlanOrder,
  ProductionOrder,
  Product,
  PrintImageElementConfig,
  PrintRenderContext,
  OrderStatus,
  PlanStatus,
} from '../types';

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PLANNING: '计划中',
  PRODUCING: '生产中',
  QC: '质检',
  SHIPPED: '已发货',
  ON_HOLD: '暂停',
};

const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  DRAFT: '草稿',
  APPROVED: '已批准',
  CONVERTED: '已下达',
};

const PRIORITY_LABEL: Record<string, string> = {
  High: '高',
  Medium: '中',
  Low: '低',
};

/**
 * 开始/交期等为日历语义；接口常为 ISO（含 T 与时区）。打印只输出 YYYY-MM-DD，避免多余时间或时区偏差。
 */
function formatPrintCalendarDate(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth() + 1;
      const day = d.getUTCDate();
      return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return String(value);
  }
  if (typeof value !== 'string') return String(value);
  const s = value.trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const head = /^(\d{4}-\d{2}-\d{2})(?:[T\s]|$)/.exec(s);
  if (head) return head[1];
  const t = Date.parse(s);
  if (Number.isNaN(t)) return s;
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function planField(plan: PlanOrder, key: string, _ctx: PrintRenderContext): unknown {
  switch (key) {
    case 'planNumber': return plan.planNumber;
    case 'customer': return plan.customer;
    case 'dueDate': return formatPrintCalendarDate(plan.dueDate);
    case 'startDate': return formatPrintCalendarDate(plan.startDate);
    case 'priority': return PRIORITY_LABEL[plan.priority] ?? plan.priority;
    case 'status': return PLAN_STATUS_LABEL[plan.status] ?? plan.status;
    case 'createdAt': return formatPrintCalendarDate(plan.createdAt ?? '');
    default:
      if (key.startsWith('custom.')) {
        const id = key.slice('custom.'.length);
        return plan.customData?.[id] ?? '';
      }
      return undefined;
  }
}

function orderField(order: ProductionOrder, key: string): unknown {
  switch (key) {
    case 'id': return order.id;
    case 'orderNumber': return order.orderNumber;
    case 'customer': return order.customer;
    case 'dueDate': return formatPrintCalendarDate(order.dueDate);
    case 'startDate': return formatPrintCalendarDate(order.startDate);
    case 'priority': return PRIORITY_LABEL[order.priority] ?? order.priority;
    case 'status': return ORDER_STATUS_LABEL[order.status] ?? order.status;
    case 'productName': return order.productName;
    case 'sku': return order.sku;
    case 'createdAt': return formatPrintCalendarDate(order.createdAt ?? '');
    default:
      if (key.startsWith('custom.')) {
        const id = key.slice('custom.'.length);
        return (order as unknown as { customData?: Record<string, unknown> }).customData?.[id] ?? '';
      }
      return undefined;
  }
}

function productField(product: Product, key: string): unknown {
  switch (key) {
    case 'name': return product.name;
    case 'sku': return product.sku;
    case 'description': return product.description ?? '';
    case 'imageUrl': return product.imageUrl ?? '';
    default: return undefined;
  }
}

function resolvePath(ctx: PrintRenderContext, path: string): unknown {
  const trimmed = path.trim();
  const [ns, ...rest] = trimmed.split('.');
  const sub = rest.join('.');
  if (ns === '行' && ctx.listRow) {
    const v = ctx.listRow[sub];
    return v;
  }
  if (ns === '批次') {
    const b = ctx.virtualBatch;
    if (!b) return '';
    const val = b[sub];
    if (val == null || val === '') return '';
    return val;
  }
  if (ns === '系统') {
    if (sub === 'systemTime') return new Date().toLocaleString('zh-CN');
    if (sub === 'pageCurrent' || sub === 'page.current') return String(ctx.page?.current ?? 1);
    if (sub === 'pageTotal' || sub === 'page.total') return String(ctx.page?.total ?? 1);
    return undefined;
  }
  if (ns === '计划' && ctx.plan) return planField(ctx.plan, sub, ctx);
  if (ns === '工单' && ctx.order) return orderField(ctx.order, sub);
  if (ns === '产品' && ctx.product) return productField(ctx.product, sub);
  if (ns === '工序') {
    if (sub === 'name') return ctx.milestoneName ?? '';
    if (sub === 'completedQuantity') return ctx.completedQuantity != null ? String(ctx.completedQuantity) : '';
  }
  return undefined;
}

/** 替换 {{a.b}} 与 ${a.b} */
export function resolvePrintPlaceholders(text: string, ctx: PrintRenderContext): string {
  if (!text) return '';
  const replaceOne = (raw: string, open: string, close: string) => {
    const trimmed = raw.trim();
    const v = resolvePath(ctx, trimmed);
    if (trimmed.startsWith('批次.') && (v === '' || v === undefined)) return '';
    return v != null && v !== '' ? String(v) : `${open}${raw}${close}`;
  };
  return text
    .replace(/\{\{([^}]+)\}\}/g, (_, raw: string) => replaceOne(raw, '{{', '}}'))
    .replace(/\$\{([^}]+)\}/g, (_, raw: string) => replaceOne(raw, '${', '}'));
}

/** 解析后的地址是否可作为 img src 使用（无未替换占位符且为 data/http(s)/绝对路径） */
export function isLikelyPrintImageUrl(s: string): boolean {
  const t = s.trim();
  if (!t || t.includes('{{') || t.includes('${')) return false;
  if (t.startsWith('data:image/')) return true;
  if (/^https?:\/\//i.test(t)) return true;
  if (t.startsWith('/')) return true;
  return false;
}

/** 按来源类型解析打印图片地址（上传类型不解析占位符） */
export function resolvePrintImageSrc(c: PrintImageElementConfig, ctx: PrintRenderContext): string {
  const src = c.src?.trim() ?? '';
  if (!src) return '';
  if (c.sourceType === 'upload') return src;
  return resolvePrintPlaceholders(src, ctx);
}

export function formatNumberForPrint(n: number, thousandSeparator?: boolean, uppercase?: boolean): string {
  let s = thousandSeparator
    ? n.toLocaleString('zh-CN', { maximumFractionDigits: 6 })
    : String(n);
  if (uppercase) s = s.toUpperCase();
  return s;
}
