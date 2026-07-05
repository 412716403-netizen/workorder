/**
 * 单据保存成功后统一回到所属列表页。
 *
 * 规则（新功能必须遵守，详见 docs/10-miniprogram-ui.md §保存后导航）：
 * 1. 新建 / 确认 / 处置类提交页 → 回到**模块 Hub 主列表**（如返工管理、工单中心、外协中心）
 *    例外：从明确子清单进入的确认页（待发/待收回/待入库）→ 回到该子清单
 * 2. 流水 / 批次详情编辑或删除 → 回到对应流水列表（非 Hub、非详情）
 * 3. 优先 navigateBack 到栈内已有列表并标记 _refreshOnNextShow；否则 redirectTo
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
};

/** 各业务模块 Hub 主列表（处置/报工/领料等默认回到此处） */
const MODULE_HUB_ROUTES = {
  rework: LIST_ROUTES.REWORK_HUB,
  outsource: LIST_ROUTES.OUTSOURCE_HUB,
  orders: LIST_ROUTES.PRODUCTION_ORDERS,
  plans: LIST_ROUTES.PRODUCTION_PLANS,
  stockOut: LIST_ROUTES.STOCK_OUT,
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
  MODULE_HUB_ROUTES,
  buildReportHistoryListUrl,
  normalizePageRoute,
  findNavigateBackDelta,
  afterSaveReturnToList,
};
