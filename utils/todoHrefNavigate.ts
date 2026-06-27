import type { NavigateFunction } from 'react-router-dom';

/**
 * 把待办 / 消息中的 href 转成带 `location.state` 的跳转：
 * 解析 href query 里的 `tab/orderId/productId/planId`，交给对应模块视图
 * （ProductionManagementView / PSIView 等）切换页签并打开单据详情弹窗。
 * 无可识别参数时退回直接 `navigate(href)`。
 */
/** query 参数名 → location.state 键名映射（兼容既有工单/产品/计划深链键） */
const STATE_KEY_ALIAS: Record<string, string> = {
  orderId: 'detailOrderId',
  productId: 'detailProductId',
  planId: 'detailPlanId',
};

export function navigateTodoHref(navigate: NavigateFunction, href: string): void {
  try {
    const url = new URL(href, window.location.origin);
    const state: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      state[STATE_KEY_ALIAS[key] ?? key] = value;
    });
    if (Object.keys(state).length > 0) {
      navigate(url.pathname, { state });
      return;
    }
  } catch {
    /* href 非合法 URL 时退回直接跳转 */
  }
  navigate(href);
}
