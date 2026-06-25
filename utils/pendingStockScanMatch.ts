import type { PendingStockItem } from '../views/order-list/pendingStockStockInHelpers';
import { checkExceedMax } from './scanApplyGuards';

export function findPendingStockRowForScan(
  items: PendingStockItem[],
  params: {
    productId: string;
    planOrderId?: string | null;
    orderNumbers?: string[];
    productionLinkMode: 'order' | 'product';
  },
): PendingStockItem | null {
  const { productId, planOrderId, orderNumbers, productionLinkMode } = params;
  let candidates = items.filter(i => i.order.productId === productId && i.pendingTotal > 0);
  if (candidates.length === 0) return null;

  if (productionLinkMode === 'product') {
    return candidates.length === 1 ? candidates[0]! : (candidates[0] ?? null);
  }

  if (planOrderId) {
    candidates = candidates.filter(
      i =>
        i.order.planOrderId === planOrderId ||
        i.ordersInRow.some(o => o.planOrderId === planOrderId),
    );
  }
  if (candidates.length === 0) return null;

  if (orderNumbers && orderNumbers.length > 0) {
    const byOrder = candidates.filter(i =>
      orderNumbers.some(
        on => i.order.orderNumber === on || i.ordersInRow.some(o => o.orderNumber === on),
      ),
    );
    if (byOrder.length === 1) return byOrder[0]!;
    return null;
  }

  return candidates.length === 1 ? candidates[0]! : null;
}

export type StockInQtyFormSlice = {
  variantQuantities: Record<string, number>;
  singleQuantity: number;
};

/** `tryAddScanQtyToStockInForm` 的返回：累加成功返回新表单 + 用掉的数量；超上限返回拒绝原因 */
export type TryAddScanQtyResult =
  | { ok: true; form: StockInQtyFormSlice; appliedQty: number }
  | { ok: false; reason: 'EXCEEDS_MAX'; max: number; current: number; addQty: number; message: string };

/**
 * 扫码累加入库表单：超过单据待入上限则**拒绝**（不再静默截断为 `Math.min`），
 * 由上层提示并放弃这次扫码（行也不应入清单）。
 *
 * 与「报工 / 返工 / 外协收货」扫码入口的拒绝式行为对齐：所有扫码累加都需通过 `checkExceedMax`。
 */
export function tryAddScanQtyToStockInForm(
  form: StockInQtyFormSlice,
  opts: {
    hasColorSize: boolean;
    pendingTotal: number;
    pendingByVariant: Record<string, number>;
    variantId: string;
    addQty: number;
    /**
     * 受 SystemSetting.allowExceedMaxStockInQty 控制：true 时跳过待入库上限校验，
     * 允许扫码累加超过待入库数量（与手输/矩阵放开口径一致）。
     */
    allowExceed?: boolean;
  },
): TryAddScanQtyResult {
  const { hasColorSize, pendingTotal, pendingByVariant, variantId, addQty, allowExceed } = opts;
  if (addQty <= 0) return { ok: true, form, appliedQty: 0 };

  if (hasColorSize) {
    if (!variantId) {
      return { ok: true, form, appliedQty: 0 };
    }
    const cur = form.variantQuantities[variantId] ?? 0;
    const cap = pendingByVariant[variantId] ?? 0;
    const check = checkExceedMax(cur, addQty, allowExceed ? undefined : cap);
    if (check.exceeds) {
      return {
        ok: false,
        reason: 'EXCEEDS_MAX',
        max: cap,
        current: cur,
        addQty,
        message: check.message ?? '本次扫入数量超过该规格待入库上限',
      };
    }
    return {
      ok: true,
      appliedQty: addQty,
      form: {
        ...form,
        variantQuantities: { ...form.variantQuantities, [variantId]: cur + addQty },
      },
    };
  }

  const cur = form.singleQuantity || 0;
  const check = checkExceedMax(cur, addQty, allowExceed ? undefined : pendingTotal);
  if (check.exceeds) {
    return {
      ok: false,
      reason: 'EXCEEDS_MAX',
      max: pendingTotal,
      current: cur,
      addQty,
      message: check.message ?? '本次扫入数量超过该单待入库上限',
    };
  }
  return {
    ok: true,
    appliedQty: addQty,
    form: { ...form, singleQuantity: cur + addQty },
  };
}

/**
 * @deprecated 截断式累加，仅历史兼容；新代码请用 `tryAddScanQtyToStockInForm`，超上限时拒绝并提示。
 */
export function addScanQtyToStockInForm(
  form: StockInQtyFormSlice,
  opts: {
    hasColorSize: boolean;
    pendingTotal: number;
    pendingByVariant: Record<string, number>;
    variantId: string;
    addQty: number;
  },
): StockInQtyFormSlice {
  const result = tryAddScanQtyToStockInForm(form, opts);
  if (result.ok) return result.form;
  return form;
}
