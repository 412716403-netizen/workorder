/**
 * 单据保存成功后统一回到所属列表页。
 *
 * 规则（新功能必须遵守，详见 docs/10-miniprogram-ui.md §保存后导航）：
 * 1. 新建 / 确认 / 处置类提交页 → 回到**模块 Hub 主列表**（如返工管理、工单中心、外协中心）
 *    例外：从明确子清单进入的确认页（待发/待收回/待入库）→ 回到该子清单
 * 2. 流水 / 批次详情编辑或删除 → 回到对应流水列表（非 Hub、非详情）
 * 3. 优先 navigateBack 到栈内已有列表并标记 _refreshOnNextShow；否则 redirectTo
 * 4. 目标 Hub 列表 onShow 须 consumeListRefreshOnShow → bootstrap 重新拉 API（不能只重筛缓存）
 * 4. 扫码连续作业 scan-session 除外；详情页内联编辑（不离开页）除外
 */

const DEFAULT_DELAY_MS = 400;

const LIST_ROUTES = {
  OUTSOURCE_DISPATCH: '/pages/production-outsource-dispatch/production-outsource-dispatch',
  OUTSOURCE_RECEIVE: '/pages/production-outsource-receive/production-outsource-receive',
  OUTSOURCE_HUB: '/pages/production-outsource/production-outsource',
  OUTSOURCE_FLOW: '/pages/production-outsource-flow/production-outsource-flow',
  PENDING_STOCK: '/pages/production-order-pending-stock/production-order-pending-stock',
  STOCK_OUT: '/pages/production-stock-out/production-stock-out',
  STOCK_IN_HISTORY: '/pages/production-order-stock-in-history/production-order-stock-in-history',
  PRODUCTION_ORDERS: '/pages/production-orders/production-orders',
  PRODUCTION_PLANS: '/pages/production-plans/production-plans',
  REWORK_DEFECT_FLOW: '/pages/production-rework-defect-flow/production-rework-defect-flow',
  REWORK_REPORT_FLOW: '/pages/production-rework-report-flow/production-rework-report-flow',
  REWORK_HUB: '/pages/production-rework/production-rework',
  REWORK_PENDING: '/pages/production-rework-pending/production-rework-pending',
  PSI_PURCHASE_ORDERS: '/pages/psi-purchase-orders/psi-purchase-orders',
  PSI_PURCHASE_ORDER_FLOW: '/pages/psi-purchase-order-flow/psi-purchase-order-flow',
  PSI_PURCHASE_BILLS: '/pages/psi-purchase-bills/psi-purchase-bills',
  PSI_PURCHASE_BILL_FLOW: '/pages/psi-purchase-bill-flow/psi-purchase-bill-flow',
  PSI_SALES_ORDERS: '/pages/psi-sales-orders/psi-sales-orders',
  PSI_SALES_ORDER_FLOW: '/pages/psi-sales-order-flow/psi-sales-order-flow',
  PSI_SALES_ORDER_PENDING_SHIP: '/pages/psi-sales-order-pending-ship/psi-sales-order-pending-ship',
  PSI_SALES_BILLS: '/pages/psi-sales-bills/psi-sales-bills',
  PSI_SALES_BILL_FLOW: '/pages/psi-sales-bill-flow/psi-sales-bill-flow',
  PSI_WAREHOUSES: '/pages/psi-warehouses/psi-warehouses',
  PSI_WAREHOUSE_FLOW: '/pages/psi-warehouse-flow/psi-warehouse-flow',
  PSI_WAREHOUSE_PRODUCT_FLOW: '/pages/psi-warehouse-product-flow/psi-warehouse-product-flow',
  PSI_WAREHOUSE_TRANSFER: '/pages/psi-warehouse-transfer/psi-warehouse-transfer',
  PSI_WAREHOUSE_STOCKTAKE: '/pages/psi-warehouse-stocktake/psi-warehouse-stocktake',
  FINANCE_RECEIPTS: '/pages/finance-receipts/finance-receipts',
  FINANCE_RECEIPT_FLOW: '/pages/finance-receipt-flow/finance-receipt-flow',
  FINANCE_PAYMENTS: '/pages/finance-payments/finance-payments',
  FINANCE_PAYMENT_FLOW: '/pages/finance-payment-flow/finance-payment-flow',
};

/** 各业务模块 Hub 主列表（处置/报工/领料等默认回到此处） */
const MODULE_HUB_ROUTES = {
  rework: LIST_ROUTES.REWORK_HUB,
  outsource: LIST_ROUTES.OUTSOURCE_HUB,
  orders: LIST_ROUTES.PRODUCTION_ORDERS,
  plans: LIST_ROUTES.PRODUCTION_PLANS,
  stockOut: LIST_ROUTES.STOCK_OUT,
  psiPurchaseOrder: LIST_ROUTES.PSI_PURCHASE_ORDERS,
  psiPurchaseBill: LIST_ROUTES.PSI_PURCHASE_BILLS,
  psiSalesOrder: LIST_ROUTES.PSI_SALES_ORDERS,
  psiSalesBill: LIST_ROUTES.PSI_SALES_BILLS,
  psiWarehouse: LIST_ROUTES.PSI_WAREHOUSES,
  financeReceipt: LIST_ROUTES.FINANCE_RECEIPTS,
  financePayment: LIST_ROUTES.FINANCE_PAYMENTS,
};

function buildReportHistoryListUrl(params) {
  const q = [];
  if (params && params.dateFrom) q.push(`dateFrom=${encodeURIComponent(params.dateFrom)}`);
  if (params && params.dateTo) q.push(`dateTo=${encodeURIComponent(params.dateTo)}`);
  if (params && params.orderId) q.push(`orderId=${encodeURIComponent(params.orderId)}`);
  const qs = q.length ? `?${q.join('&')}` : '';
  return `/pages/production-order-report-history/production-order-report-history${qs}`;
}

function normalizePageRoute(url) {
  const raw = String(url || '').split('?')[0];
  return raw.replace(/^\//, '');
}

function findNavigateBackDelta(listUrl) {
  const targetRoute = normalizePageRoute(listUrl);
  if (!targetRoute) return 0;
  const pages = getCurrentPages();
  if (pages.length <= 1) return 0;
  for (let i = pages.length - 2; i >= 0; i -= 1) {
    const pageRoute = pages[i].route || '';
    if (pageRoute === targetRoute) {
      return pages.length - 1 - i;
    }
  }
  return 0;
}

function ensurePendingRefreshRoutes(app) {
  if (!app.globalData) app.globalData = {};
  if (!app.globalData.pendingHubListRefreshRoutes) {
    app.globalData.pendingHubListRefreshRoutes = {};
  }
  return app.globalData.pendingHubListRefreshRoutes;
}

function markRouteRefreshPending(route) {
  const normalized = normalizePageRoute(route);
  if (!normalized) return;
  try {
    const pages = getCurrentPages();
    pages.forEach((page) => {
      if ((page.route || '') === normalized) {
        page._refreshOnNextShow = true;
      }
    });
  } catch (_) {
    // getCurrentPages 在部分测试环境不可用
  }
  try {
    const app = getApp();
    if (app) {
      const routes = ensurePendingRefreshRoutes(app);
      routes[normalized] = true;
      app.globalData.pendingHubListRefresh = normalized;
    }
  } catch (_) {
    // getApp 在部分测试环境不可用
  }
}

function markListRoutesRefreshOnShow(listUrls) {
  (listUrls || []).forEach((url) => markRouteRefreshPending(url));
}

function markListPageRefreshOnShow(delta, listUrl) {
  const pages = getCurrentPages();
  const targetIndex = pages.length - 1 - delta;
  const targetPage = pages[targetIndex];
  const route = normalizePageRoute(listUrl || (targetPage && targetPage.route) || '');
  if (targetPage) {
    targetPage._refreshOnNextShow = true;
  }
  if (route) {
    markRouteRefreshPending(route);
  }
}

function consumeHubListRefresh(pageRoute) {
  const route = normalizePageRoute(pageRoute);
  if (!route) return false;
  try {
    const app = getApp();
    const gd = app && app.globalData;
    if (gd && gd.pendingHubListRefreshRoutes && gd.pendingHubListRefreshRoutes[route]) {
      delete gd.pendingHubListRefreshRoutes[route];
      return true;
    }
    const pending = gd && gd.pendingHubListRefresh;
    if (pending && pending === route) {
      gd.pendingHubListRefresh = '';
      return true;
    }
  } catch (_) {
    // ignore
  }
  return false;
}

/**
 * Hub 列表页 onShow 调用：保存/删除回退后是否需重新拉 API。
 * 返回 true 时须 bootstrap / refetch，不能只 reloadList 重筛本地缓存。
 */
function consumeListRefreshOnShow(page, listRoute) {
  const flagged = !!(page && page._refreshOnNextShow);
  const pending = consumeHubListRefresh(listRoute);
  if (page && page._refreshOnNextShow) {
    page._refreshOnNextShow = false;
  }
  return flagged || pending;
}

/**
 * @param {{ listUrl?: string, toastTitle?: string, delay?: number, navigateBackDelta?: number }} opts
 */
function afterSaveReturnToList(opts) {
  const options = opts || {};
  const {
    listUrl,
    toastTitle,
    delay = DEFAULT_DELAY_MS,
    navigateBackDelta,
    alsoRefreshListUrls,
  } = options;
  if (alsoRefreshListUrls && alsoRefreshListUrls.length) {
    markListRoutesRefreshOnShow(alsoRefreshListUrls);
  }
  if (toastTitle) {
    wx.showToast({ title: toastTitle, icon: 'success' });
  }
  setTimeout(() => {
    if (listUrl) {
      const delta = navigateBackDelta != null && navigateBackDelta > 0
        ? navigateBackDelta
        : findNavigateBackDelta(listUrl);
      if (delta > 0) {
        markListPageRefreshOnShow(delta, listUrl);
        wx.navigateBack({ delta });
        return;
      }
      wx.redirectTo({ url: listUrl });
      return;
    }
    wx.navigateBack();
  }, delay);
}

module.exports = {
  LIST_ROUTES,
  MODULE_HUB_ROUTES,
  buildReportHistoryListUrl,
  normalizePageRoute,
  findNavigateBackDelta,
  markListRoutesRefreshOnShow,
  consumeHubListRefresh,
  consumeListRefreshOnShow,
  afterSaveReturnToList,
};
