import type {
  PlanOrder,
  ProductionOrder,
  Product,
  PrintImageElementConfig,
  PrintRenderContext,
  SalesBillPrintDoc,
  PurchaseOrderPrintContext,
  PurchaseBillPrintContext,
  FinanceDocPrintContext,
  OrderStatus,
  PlanStatus,
} from '../types';
import { formatCustomFieldDatetimeForPrint } from './localDateTime';

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
    case 'startDate': return formatPrintCalendarDate(plan.startDate);
    case 'dueDate': return formatPrintCalendarDate(plan.dueDate);
    case 'priority': return PRIORITY_LABEL[plan.priority] ?? plan.priority;
    case 'status': return PLAN_STATUS_LABEL[plan.status] ?? plan.status;
    case 'totalQuantity': {
      const sum = (plan.items ?? []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
      return Number.isFinite(sum) ? String(Math.round(sum)) : '0';
    }
    case 'createdAt': return formatPrintCalendarDate(plan.createdAt ?? '');
    default:
      if (key.startsWith('custom.')) {
        const id = key.slice('custom.'.length);
        const v = plan.customData?.[id];
        if (typeof v === 'string' && v.startsWith('data:')) return '[附件]';
        if (v == null || v === '') return '';
        return formatCustomFieldDatetimeForPrint(v);
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
        const v = (order as unknown as { customData?: Record<string, unknown> }).customData?.[id];
        if (typeof v === 'string' && v.startsWith('data:')) return '[附件]';
        if (v == null || v === '') return '';
        return formatCustomFieldDatetimeForPrint(v);
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
    default:
      if (key.startsWith('custom.')) {
        const id = key.slice('custom.'.length);
        if (!id) return '';
        const v = product.categoryCustomData?.[id];
        if (typeof v === 'string' && v.startsWith('data:image/')) return v;
        if (typeof v === 'string' && v.startsWith('data:')) return '[附件]';
        if (v == null || v === '') return '';
        return formatCustomFieldDatetimeForPrint(v);
      }
      return undefined;
  }
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const s = n.toFixed(2);
  return s.endsWith('.00') ? String(Math.round(n)) : s;
}

function purchaseOrderField(po: PurchaseOrderPrintContext, key: string): unknown {
  switch (key) {
    case 'docNumber':
      return po.docNumber;
    case 'partner':
      return po.partner;
    case 'operator':
      return po.operator ?? '';
    case 'docTotalQty':
      return String(Math.round(Number(po.docTotalQty) || 0));
    case 'docTotalAmount':
      return fmtMoney(Number(po.docTotalAmount) || 0);
    default:
      if (key.startsWith('custom.')) {
        const id = key.slice('custom.'.length);
        if (!id) return '';
        const raw = po.custom?.[id];
        if (raw == null || raw === '') return '';
        if (typeof raw === 'string' && raw.startsWith('data:')) return '[附件]';
        return formatCustomFieldDatetimeForPrint(raw);
      }
      return undefined;
  }
}

function purchaseBillField(pb: PurchaseBillPrintContext, key: string): unknown {
  switch (key) {
    case 'docNumber':
      return pb.docNumber;
    case 'partner':
      return pb.partner;
    case 'operator':
      return pb.operator ?? '';
    case 'warehouseName':
      return pb.warehouseName ?? '';
    case 'docTotalQty':
      return String(Math.round(Number(pb.docTotalQty) || 0));
    case 'docTotalAmount':
      return fmtMoney(Number(pb.docTotalAmount) || 0);
    default:
      if (key.startsWith('custom.')) {
        const id = key.slice('custom.'.length);
        if (!id) return '';
        const raw = pb.custom?.[id];
        if (raw == null || raw === '') return '';
        if (typeof raw === 'string' && raw.startsWith('data:')) return '[附件]';
        return formatCustomFieldDatetimeForPrint(raw);
      }
      return undefined;
  }
}

function financeDocField(doc: FinanceDocPrintContext, key: string): unknown {
  switch (key) {
    case 'docNo':
      return doc.docNo;
    case 'type':
      return doc.type;
    case 'timestamp':
      return doc.timestamp;
    case 'category':
      return doc.category;
    case 'partner':
      return doc.partner;
    case 'amount':
      return fmtMoney(Number(doc.amount) || 0);
    case 'amountText':
      return doc.amountText;
    case 'paymentAccount':
      return doc.paymentAccount;
    case 'workerName':
      return doc.workerName;
    case 'productName':
      return doc.productName;
    case 'productSku':
      return doc.productSku;
    case 'relatedDocNo':
      return doc.relatedDocNo;
    case 'note':
      return doc.note;
    case 'operator':
      return doc.operator;
    default:
      if (key.startsWith('custom.')) {
        const id = key.slice('custom.'.length);
        if (!id) return '';
        const raw = doc.custom?.[id];
        if (raw == null || raw === '') return '';
        if (typeof raw === 'string' && raw.startsWith('data:')) return '[附件]';
        return formatCustomFieldDatetimeForPrint(raw);
      }
      return undefined;
  }
}

function salesBillField(sb: SalesBillPrintDoc, key: string): unknown {
  switch (key) {
    case 'title': return sb.title;
    case 'docNumber': return sb.docNumber;
    case 'partner': return sb.partner;
    case 'partnerId': return sb.partnerId ?? '';
    case 'warehouseName': return sb.warehouseName;
    case 'createdAtDisplay': return sb.createdAtDisplay;
    case 'note': return sb.note;
    case 'docTotalQty': return String(Math.round(sb.docTotalQty || 0));
    case 'docTotalAmount': return fmtMoney(Number(sb.docTotalAmount) || 0);
    case 'previousBalance': return fmtMoney(Number(sb.previousBalance) || 0);
    case 'currentDebt': return fmtMoney(Number(sb.currentDebt) || 0);
    case 'accumulatedDebt': return fmtMoney(Number(sb.accumulatedDebt) || 0);
    default:
      if (key.startsWith('custom.')) {
        const id = key.slice('custom.'.length);
        if (!id) return '';
        const raw = sb.custom?.[id];
        if (raw == null || raw === '') return '';
        if (typeof raw === 'string' && raw.startsWith('data:')) return '[附件]';
        return formatCustomFieldDatetimeForPrint(raw);
      }
      return undefined;
  }
}

function resolvePath(ctx: PrintRenderContext, path: string): unknown {
  /** 避免模版单元格内换行/软回车把占位符路径拆断（如 `行.productName` 被拆成两段） */
  const trimmed = path.trim().replace(/\r\n|\r|\n/g, '');
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
  if (ns === '租户') {
    if (sub === 'name') return ctx.tenantName?.trim() ?? '';
    return undefined;
  }
  if (ns === '计划' && ctx.plan) return planField(ctx.plan, sub, ctx);
  if (ns === '工单' && ctx.order) return orderField(ctx.order, sub);
  if (ns === '产品' && ctx.product) return productField(ctx.product, sub);
  if (ns === '销售单') {
    if (!ctx.salesBill) return '';
    const v = salesBillField(ctx.salesBill, sub);
    return v === undefined ? '' : v;
  }
  if (ns === '采购订单') {
    if (!ctx.purchaseOrderPrint) return '';
    const v = purchaseOrderField(ctx.purchaseOrderPrint, sub);
    return v === undefined ? '' : v;
  }
  if (ns === '销售订单') {
    if (!ctx.salesOrderPrint) return '';
    const v = purchaseOrderField(ctx.salesOrderPrint, sub);
    return v === undefined ? '' : v;
  }
  if (ns === '采购单') {
    if (!ctx.purchaseBillPrint) return '';
    const v = purchaseBillField(ctx.purchaseBillPrint, sub);
    return v === undefined ? '' : v;
  }
  if (ns === '收款单') {
    if (!ctx.receiptPrint) return '';
    const v = financeDocField(ctx.receiptPrint, sub);
    return v === undefined ? '' : v;
  }
  if (ns === '付款单') {
    if (!ctx.paymentPrint) return '';
    const v = financeDocField(ctx.paymentPrint, sub);
    return v === undefined ? '' : v;
  }
  if (ns === '工序') {
    if (sub === 'name') return ctx.milestoneName ?? '';
    if (sub === 'completedQuantity') return ctx.completedQuantity != null ? String(ctx.completedQuantity) : '';
  }
  if (ns === '报工') {
    const doc = ctx.reportBatchPrint;
    if (!doc) return '';
    const v = doc[sub];
    return v != null && v !== '' ? String(v) : '';
  }
  if (ns === '入库') {
    const doc = ctx.stockInPrint;
    if (!doc) return '';
    if (sub === 'custom') return '';
    if (sub.startsWith('custom.')) {
      const id = sub.slice('custom.'.length);
      if (!id) return '';
      const raw = doc.custom?.[id];
      if (raw == null || raw === '') return '';
      if (typeof raw === 'string' && raw.startsWith('data:')) return '[附件]';
      return formatCustomFieldDatetimeForPrint(raw);
    }
    const v = (doc as Record<string, unknown>)[sub];
    if (v == null || v === '') return '';
    return String(v);
  }
  if (ns === '领料发出') {
    const doc = ctx.materialIssuePrint;
    if (!doc) return '';
    if (sub === 'custom') return '';
    if (sub.startsWith('custom.')) {
      const id = sub.slice('custom.'.length);
      if (!id) return '';
      const raw = doc.custom?.[id];
      if (raw == null || raw === '') return '';
      if (typeof raw === 'string' && raw.startsWith('data:')) return '[附件]';
      return formatCustomFieldDatetimeForPrint(raw);
    }
    const v = (doc as Record<string, unknown>)[sub];
    if (v == null || v === '') return '';
    return String(v);
  }
  if (ns === '生产退料') {
    const doc = ctx.materialReturnPrint;
    if (!doc) return '';
    if (sub === 'custom') return '';
    if (sub.startsWith('custom.')) {
      const id = sub.slice('custom.'.length);
      if (!id) return '';
      const raw = doc.custom?.[id];
      if (raw == null || raw === '') return '';
      if (typeof raw === 'string' && raw.startsWith('data:')) return '[附件]';
      return formatCustomFieldDatetimeForPrint(raw);
    }
    const v = (doc as Record<string, unknown>)[sub];
    if (v == null || v === '') return '';
    return String(v);
  }
  if (ns === '外协领料发出') {
    const doc = ctx.outsourceMaterialIssuePrint;
    if (!doc) return '';
    if (sub === 'custom') return '';
    if (sub.startsWith('custom.')) {
      const id = sub.slice('custom.'.length);
      if (!id) return '';
      const raw = doc.custom?.[id];
      if (raw == null || raw === '') return '';
      if (typeof raw === 'string' && raw.startsWith('data:')) return '[附件]';
      return formatCustomFieldDatetimeForPrint(raw);
    }
    const v = (doc as Record<string, unknown>)[sub];
    if (v == null || v === '') return '';
    return String(v);
  }
  if (ns === '外协生产退料') {
    const doc = ctx.outsourceMaterialReturnPrint;
    if (!doc) return '';
    if (sub === 'custom') return '';
    if (sub.startsWith('custom.')) {
      const id = sub.slice('custom.'.length);
      if (!id) return '';
      const raw = doc.custom?.[id];
      if (raw == null || raw === '') return '';
      if (typeof raw === 'string' && raw.startsWith('data:')) return '[附件]';
      return formatCustomFieldDatetimeForPrint(raw);
    }
    const v = (doc as Record<string, unknown>)[sub];
    if (v == null || v === '') return '';
    return String(v);
  }
  if (ns === '外协发出') {
    const doc = ctx.outsourceDispatchPrint;
    if (!doc) return '';
    if (sub === 'custom') return '';
    if (sub.startsWith('custom.')) {
      const id = sub.slice('custom.'.length);
      if (!id) return '';
      const raw = doc.custom?.[id];
      if (raw == null || raw === '') return '';
      if (typeof raw === 'string' && raw.startsWith('data:')) return '[附件]';
      return formatCustomFieldDatetimeForPrint(raw);
    }
    const v = (doc as Record<string, unknown>)[sub];
    if (v == null || v === '') return '';
    return String(v);
  }
  if (ns === '外协收回') {
    const doc = ctx.outsourceReceivePrint;
    if (!doc) return '';
    if (sub === 'custom') return '';
    if (sub.startsWith('custom.')) {
      const id = sub.slice('custom.'.length);
      if (!id) return '';
      const raw = doc.custom?.[id];
      if (raw == null || raw === '') return '';
      if (typeof raw === 'string' && raw.startsWith('data:')) return '[附件]';
      return formatCustomFieldDatetimeForPrint(raw);
    }
    const v = (doc as Record<string, unknown>)[sub];
    if (v == null || v === '') return '';
    return String(v);
  }
  if (ns === '处理不良') {
    const doc = ctx.defectTreatmentPrint;
    if (!doc) return '';
    if (sub === 'custom') return '';
    if (sub.startsWith('custom.')) {
      const id = sub.slice('custom.'.length);
      if (!id) return '';
      const raw = doc.custom?.[id];
      if (raw == null || raw === '') return '';
      if (typeof raw === 'string' && raw.startsWith('data:')) return '[附件]';
      return formatCustomFieldDatetimeForPrint(raw);
    }
    const v = (doc as Record<string, unknown>)[sub];
    if (v == null || v === '') return '';
    return String(v);
  }
  if (ns === '返工报工') {
    const doc = ctx.reworkReportPrint;
    if (!doc) return '';
    if (sub === 'custom') return '';
    if (sub.startsWith('custom.')) {
      const id = sub.slice('custom.'.length);
      if (!id) return '';
      const raw = doc.custom?.[id];
      if (raw == null || raw === '') return '';
      if (typeof raw === 'string' && raw.startsWith('data:')) return '[附件]';
      return formatCustomFieldDatetimeForPrint(raw);
    }
    const v = (doc as Record<string, unknown>)[sub];
    if (v == null || v === '') return '';
    return String(v);
  }
  return undefined;
}

/** 替换 {{a.b}} 与 ${a.b} */
export function resolvePrintPlaceholders(text: string, ctx: PrintRenderContext): string {
  if (!text) return '';
  const replaceOne = (raw: string, open: string, close: string) => {
    const trimmed = raw.trim().replace(/\r\n|\r|\n/g, '');
    const v = resolvePath(ctx, trimmed);
    /**
     * 「行.xxx」只在动态列表行内有上下文：
     * - 行内 listRow 为空字符串或 undefined 时输出空串（避免原始占位符泄漏）；
     * - 若整体不在列表行环境下（例如文本元素误用），也按空串处理，避免出现 `{{行.xxx}}` 原文。
     */
    if (trimmed.startsWith('行.')) {
      if (v === undefined || v === null || v === '') return '';
      return String(v);
    }
    if (trimmed.startsWith('批次.') && (v === '' || v === undefined)) return '';
    if (trimmed.startsWith('销售单.') && (v === '' || v === undefined)) return '';
    if (trimmed.startsWith('报工.') && (v === '' || v === undefined)) return '';
    if (trimmed.startsWith('入库.') && (v === '' || v === undefined)) return '';
    if (trimmed.startsWith('领料发出.') && (v === '' || v === undefined)) return '';
    if (trimmed.startsWith('生产退料.') && (v === '' || v === undefined)) return '';
    if (trimmed.startsWith('外协领料发出.') && (v === '' || v === undefined)) return '';
    if (trimmed.startsWith('外协生产退料.') && (v === '' || v === undefined)) return '';
    if (trimmed.startsWith('外协发出.') && (v === '' || v === undefined)) return '';
    if (trimmed.startsWith('外协收回.') && (v === '' || v === undefined)) return '';
    if (trimmed.startsWith('处理不良.') && (v === '' || v === undefined)) return '';
    if (trimmed.startsWith('返工报工.') && (v === '' || v === undefined)) return '';
    if (trimmed.startsWith('采购订单.') && (v === '' || v === undefined)) return '';
    if (trimmed.startsWith('销售订单.') && (v === '' || v === undefined)) return '';
    if (trimmed.startsWith('采购单.') && (v === '' || v === undefined)) return '';
    if (trimmed.startsWith('计划.') && (v === '' || v === undefined)) return '';
    if (trimmed.startsWith('工单.') && (v === '' || v === undefined)) return '';
    if (trimmed.startsWith('产品.') && (v === '' || v === undefined)) return '';
    if (trimmed.startsWith('工序.') && (v === '' || v === undefined)) return '';
    if (trimmed.startsWith('系统.') && (v === '' || v === undefined)) return '';
    if (trimmed.startsWith('租户.') && (v === '' || v === undefined)) return '';
    if (trimmed.startsWith('收款单.') && (v === '' || v === undefined)) return '';
    if (trimmed.startsWith('付款单.') && (v === '' || v === undefined)) return '';
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
