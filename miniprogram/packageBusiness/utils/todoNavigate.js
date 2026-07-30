/**
 * 将 Web 待办 href 转为小程序详情页路径。
 * @returns {string|null}
 */

function parseHref(href) {
  const raw = String(href || '').trim();
  if (!raw) return null;
  const qIndex = raw.indexOf('?');
  const pathPart = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
  const query = qIndex >= 0 ? raw.slice(qIndex + 1) : '';
  const params = {};
  query.split('&').forEach((pair) => {
    if (!pair) return;
    const eq = pair.indexOf('=');
    const k = eq >= 0 ? pair.slice(0, eq) : pair;
    const v = eq >= 0 ? pair.slice(eq + 1) : '';
    if (!k) return;
    try {
      params[decodeURIComponent(k)] = decodeURIComponent(v || '');
    } catch {
      params[k] = v || '';
    }
  });
  return { pathPart, params };
}

function resolveDevTodoMiniPath(href) {
  const parsed = parseHref(href);
  if (!parsed || parsed.pathPart.indexOf('development') < 0) return null;
  const { params } = parsed;
  const styleId = params.styleId || '';
  if (!styleId) return null;
  const qs = [`styleId=${encodeURIComponent(styleId)}`];
  if (params.devStageId) qs.push(`devStageId=${encodeURIComponent(params.devStageId)}`);
  if (params.devSampleId) {
    qs.push(`devSampleId=${encodeURIComponent(params.devSampleId)}`);
    qs.push('openBom=1');
  }
  return `/packageBusiness/development-style-detail/development-style-detail?${qs.join('&')}`;
}

function resolveProductionTodoMiniPath(href) {
  const parsed = parseHref(href);
  if (!parsed || parsed.pathPart.indexOf('production') < 0) return null;
  const { params } = parsed;
  const tab = String(params.tab || '').toUpperCase();

  if (params.planId) {
    return `/packageBusiness/production-plan-detail/production-plan-detail?id=${encodeURIComponent(params.planId)}`;
  }
  if (params.orderId) {
    return `/packageBusiness/production-order-detail/production-order-detail?id=${encodeURIComponent(params.orderId)}`;
  }
  if (params.reworkOrderId) {
    return `/packageBusiness/production-rework-detail/production-rework-detail?reworkOrderId=${encodeURIComponent(params.reworkOrderId)}`;
  }
  if (params.productId && (tab === 'ORDERS' || params.tab === 'orders')) {
    return `/packageBusiness/production-product-detail/production-product-detail?productId=${encodeURIComponent(params.productId)}`;
  }

  if (tab === 'OUTSOURCE' || params.outsourceFlow) {
    let seed = null;
    try {
      seed = params.outsourceFlow ? JSON.parse(params.outsourceFlow) : null;
    } catch {
      seed = null;
    }
    if (!seed || typeof seed !== 'object') return null;
    const qs = [
      `productId=${encodeURIComponent(seed.productId || '')}`,
      `nodeId=${encodeURIComponent(seed.nodeId || '')}`,
      `partner=${encodeURIComponent(seed.partner || '')}`,
      `nodeName=${encodeURIComponent(seed.nodeName || '')}`,
      `productName=${encodeURIComponent(seed.productName || '')}`,
      `orderNumber=${encodeURIComponent(seed.orderNumber || '')}`,
    ];
    if (seed.orderId) qs.push(`orderId=${encodeURIComponent(seed.orderId)}`);
    return `/packageBusiness/production-outsource-partner-detail/production-outsource-partner-detail?${qs.join('&')}`;
  }

  return null;
}

const PSI_TAB_TO_PATH = {
  PURCHASE_ORDER: '/packagePsi/psi-purchase-order-detail/psi-purchase-order-detail',
  PURCHASE_BILL: '/packagePsi/psi-purchase-bill-detail/psi-purchase-bill-detail',
  SALES_ORDER: '/packagePsi/psi-sales-order-detail/psi-sales-order-detail',
  SALES_BILL: '/packagePsi/psi-sales-bill-detail/psi-sales-bill-detail',
};

function resolvePsiTodoMiniPath(href) {
  const parsed = parseHref(href);
  if (!parsed || parsed.pathPart.indexOf('psi') < 0) return null;
  const tab = String(parsed.params.tab || '').toUpperCase();
  const doc = parsed.params.psiDoc || '';
  const base = PSI_TAB_TO_PATH[tab];
  if (!base || !doc) return null;
  return `${base}?docNumber=${encodeURIComponent(doc)}`;
}

/**
 * @param {string} href
 * @returns {string|null}
 */
function resolveTodoMiniPath(href) {
  return (
    resolveDevTodoMiniPath(href) ||
    resolveProductionTodoMiniPath(href) ||
    resolvePsiTodoMiniPath(href) ||
    null
  );
}

/**
 * 跳转到待办关联单据；无法解析时 toast。
 * @returns {boolean}
 */
function navigateTodoHref(href) {
  const miniPath = resolveTodoMiniPath(href);
  if (!miniPath) {
    wx.showToast({ title: '暂无法打开关联单据', icon: 'none' });
    return false;
  }
  wx.navigateTo({ url: miniPath });
  return true;
}

module.exports = {
  resolveDevTodoMiniPath,
  resolveTodoMiniPath,
  navigateTodoHref,
};
