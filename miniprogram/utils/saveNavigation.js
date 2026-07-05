/**
 * 单据保存成功后统一回到所属列表页。
 * 若目标页已在页面栈内则 navigateBack，避免 redirectTo 叠层导致左上角返回仍停在列表。
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

function markListPageRefreshOnShow(delta) {
  const pages = getCurrentPages();
  const targetIndex = pages.length - 1 - delta;
  const targetPage = pages[targetIndex];
  if (targetPage) {
    targetPage._refreshOnNextShow = true;
  }
}

/**
 * @param {{ listUrl?: string, toastTitle?: string, delay?: number, navigateBackDelta?: number }} opts
 */
function afterSaveReturnToList(opts) {
  const options = opts || {};
  const { listUrl, toastTitle, delay = DEFAULT_DELAY_MS, navigateBackDelta } = options;
  if (toastTitle) {
    wx.showToast({ title: toastTitle, icon: 'success' });
  }
  setTimeout(() => {
    if (listUrl) {
      const delta = navigateBackDelta != null && navigateBackDelta > 0
        ? navigateBackDelta
        : findNavigateBackDelta(listUrl);
      if (delta > 0) {
        markListPageRefreshOnShow(delta);
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
  buildReportHistoryListUrl,
  normalizePageRoute,
  findNavigateBackDelta,
  afterSaveReturnToList,
};
