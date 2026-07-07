/**
 * 小程序首页：加载 Web 工作台首页布局中的统计组件并拉数
 */

const {
  WORKBENCH_HOME_PAGE_ID,
  HOME_PINNED_WIDGET_TYPES,
  STAT_WIDGET_TYPES,
  WIDGET_META,
  DEFAULT_HOME_STAT_WIDGETS,
} = require('../config/workbenchWidgets.js');

const { buildStatsQueryString, workbenchPeriodFilterLabel } = require('./workbenchPeriodFilter.js');

const PINNED_SET = new Set(HOME_PINNED_WIDGET_TYPES);
const STAT_SET = new Set(STAT_WIDGET_TYPES);

function cloneDefaultStatWidgets() {
  return DEFAULT_HOME_STAT_WIDGETS.map((it) => {
    const copy = {};
    Object.keys(it).forEach((key) => {
      copy[key] = it[key];
    });
    return copy;
  });
}

function extractPageStatWidgets(workbenchEffective, pageId) {
  const targetPageId = pageId || WORKBENCH_HOME_PAGE_ID;
  const isHome = targetPageId === WORKBENCH_HOME_PAGE_ID;
  const pages = workbenchEffective && workbenchEffective.pages;

  if (!Array.isArray(pages) || pages.length === 0) {
    return isHome ? cloneDefaultStatWidgets() : [];
  }

  const page = pages.find((p) => p.id === targetPageId);
  if (!page) {
    return isHome ? cloneDefaultStatWidgets() : [];
  }

  const items = page.layout && page.layout.items;
  if (!Array.isArray(items) || items.length === 0) {
    return isHome ? cloneDefaultStatWidgets() : [];
  }

  return items
    .filter((it) => it && STAT_SET.has(it.widgetType) && !PINNED_SET.has(it.widgetType))
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));
}

function extractHomeStatWidgets(workbenchEffective) {
  return extractPageStatWidgets(workbenchEffective, WORKBENCH_HOME_PAGE_ID);
}

function buildWorkbenchPageTabs(workbenchEffective) {
  const pages = workbenchEffective && workbenchEffective.pages;
  if (!Array.isArray(pages) || pages.length === 0) {
    return [{ id: WORKBENCH_HOME_PAGE_ID, title: '首页', isHome: true }];
  }
  return pages.slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map((page) => ({
      id: page.id,
      title: page.title || '页面',
      isHome: page.id === WORKBENCH_HOME_PAGE_ID,
    }));
}

function resolveActiveWorkbenchPageId(workbenchEffective, preferredId) {
  const tabs = buildWorkbenchPageTabs(workbenchEffective);
  if (!tabs.length) return WORKBENCH_HOME_PAGE_ID;
  if (preferredId && tabs.some((tab) => tab.id === preferredId)) return preferredId;
  const activePageId = workbenchEffective && workbenchEffective.activePageId;
  if (activePageId && tabs.some((tab) => tab.id === activePageId)) return activePageId;
  return tabs[0].id;
}

function formatQty(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function formatAmount(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(2)}万`;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function toneClassName(tone) {
  const allowed = ['default', 'ok', 'warn', 'violet'];
  return allowed.indexOf(tone) >= 0 ? tone : 'default';
}

function enrichKpiCard(card) {
  card.heroToneClass = toneClassName(card.heroTone);
  if (Array.isArray(card.metrics)) {
    card.metrics = card.metrics.map((metric) => ({
      label: metric.label,
      value: metric.value,
      sub: metric.sub,
      tone: metric.tone,
      toneClass: toneClassName(metric.tone),
    }));
  }
  return card;
}

function baseCard(widgetType, layoutItem, periodLabel) {
  const meta = WIDGET_META[widgetType] || {
    title: '统计',
    variant: 'kpi',
    theme: 'indigo',
    iconChar: '数',
    subtitle: '',
  };
  return {
    id: layoutItem.i || widgetType,
    type: widgetType,
    title: meta.title,
    subtitle: meta.subtitle || '',
    theme: meta.theme || 'indigo',
    iconChar: meta.iconChar || '数',
    variant: meta.variant,
    compact: true,
    nodeScroll: widgetType === 'order_stats' || widgetType === 'outsource_stats' || widgetType === 'rework_stats',
    periodLabel,
    loading: true,
    empty: false,
    noPermission: false,
    rows: [],
    heroLabel: '',
    heroValue: '—',
    heroHint: '',
    heroTone: 'default',
    heroToneClass: 'default',
    metrics: [],
  };
}

function nodeLabels(widgetType) {
  if (widgetType === 'order_stats') {
    return {
      taskCount: '任务',
      pending: '剩余',
      m2: '良品',
      m3: '不良',
    };
  }
  if (widgetType === 'outsource_stats') {
    return {
      taskCount: '任务',
      pending: '待收',
      m2: '已收',
      m3: '已派',
    };
  }
  return {
    taskCount: '任务',
    pending: '待返',
    m2: '完成',
    m3: '新开',
  };
}

function mapNodeRows(widgetType, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const labels = nodeLabels(widgetType);
  return rows.map((r, index) => {
    const themeIndex = index % 6;
    if (widgetType === 'order_stats') {
      return {
        name: r.name,
        taskCount: formatQty(r.taskCount),
        pending: formatQty(r.remainingQty),
        m2: formatQty(r.goodQty),
        m3: formatQty(r.defectiveQty),
        progress: Math.min(100, Math.max(0, Math.round(r.progress || 0))),
        labels,
        themeIndex,
      };
    }
    if (widgetType === 'outsource_stats') {
      return {
        name: r.name,
        taskCount: formatQty(r.taskCount),
        pending: formatQty(r.pendingQty),
        m2: formatQty(r.receivedQty),
        m3: formatQty(r.dispatchedQty),
        progress: Math.min(100, Math.max(0, Math.round(r.progress || 0))),
        labels,
        themeIndex,
      };
    }
    return {
      name: r.name,
      taskCount: formatQty(r.taskCount),
      pending: formatQty(r.pendingQty),
      m2: formatQty(r.completedQty),
      m3: formatQty(r.newReworkQty),
      progress: Math.min(100, Math.max(0, Math.round(r.progress || 0))),
      labels,
      themeIndex,
    };
  });
}

async function fetchNodeCard(request, widgetType, layoutItem, periodLabel, statsQuery) {
  const card = baseCard(widgetType, layoutItem, periodLabel);
  const pathMap = {
    order_stats: '/dashboard/order-stats',
    outsource_stats: '/dashboard/outsource-stats',
    rework_stats: '/dashboard/rework-stats',
  };
  const basePath = pathMap[widgetType];
  try {
    const data = await request({ path: `${basePath}?${statsQuery}`, method: 'GET' });
    if (data === null) {
      card.noPermission = true;
      card.loading = false;
      return card;
    }
    card.rows = mapNodeRows(widgetType, data && data.rows);
    card.empty = card.rows.length === 0;
  } catch (_) {
    card.empty = true;
  }
  card.loading = false;
  return card;
}

function buildSalesKpiCard(card, sales, periodLabel) {
  if (!sales) {
    card.noPermission = true;
    return card;
  }
  card.heroLabel = `${periodLabel}销售额`;
  card.heroValue = formatAmount(sales.salesAmount);
  card.heroHint = `${formatQty(sales.salesBillCount)} 单 · ${formatQty(sales.salesQuantity)} 件`;
  card.heroTone = 'default';
  card.metrics = [
    { label: '销售单数', value: formatQty(sales.salesBillCount), sub: '出库单', tone: 'default' },
    { label: '销售件数', value: formatQty(sales.salesQuantity), sub: '出库数量', tone: 'ok' },
    {
      label: `${periodLabel}退货`,
      value: formatQty(sales.salesReturnQuantity),
      sub: '退货件数',
      tone: Number(sales.salesReturnQuantity) > 0 ? 'warn' : 'default',
    },
  ];
  return card;
}

function buildSalesOrderKpiCard(card, salesOrder, periodLabel) {
  if (!salesOrder) {
    card.noPermission = true;
    return card;
  }
  card.heroLabel = `${periodLabel}订单额`;
  card.heroValue = formatAmount(salesOrder.salesOrderAmount);
  card.heroHint = `${formatQty(salesOrder.salesOrderCount)} 单 · ${formatQty(salesOrder.salesOrderQuantity)} 件`;
  card.heroTone = 'default';
  card.metrics = [
    { label: '订单数', value: formatQty(salesOrder.salesOrderCount), tone: 'default' },
    { label: '订单件数', value: formatQty(salesOrder.salesOrderQuantity), tone: 'ok' },
    {
      label: '减单件数',
      value: formatQty(salesOrder.salesOrderReduceQuantity),
      tone: Number(salesOrder.salesOrderReduceQuantity) > 0 ? 'warn' : 'default',
    },
  ];
  return card;
}

function buildFinanceKpiCard(card, finance, periodLabel) {
  if (!finance) {
    card.noPermission = true;
    return card;
  }
  const cashFlow = Number(finance.cashFlow);
  card.heroLabel = `${periodLabel}净现金流`;
  card.heroValue = formatAmount(finance.cashFlow);
  card.heroHint = `收款 ${formatQty(finance.receiptCount)} 笔 · 付款 ${formatQty(finance.paymentCount)} 笔`;
  card.heroTone = cashFlow > 0 ? 'ok' : cashFlow < 0 ? 'warn' : 'default';
  card.metrics = [
    {
      label: `${periodLabel}收款`,
      value: formatAmount(finance.receiptAmount),
      sub: `${formatQty(finance.receiptCount)} 笔`,
      tone: 'ok',
    },
    {
      label: `${periodLabel}支出`,
      value: formatAmount(finance.paymentAmount),
      sub: `${formatQty(finance.paymentCount)} 笔`,
      tone: 'warn',
    },
  ];
  return card;
}

function buildProductEconomicsKpiCard(card, data, periodLabel) {
  if (data === null) {
    card.noPermission = true;
    return card;
  }
  const s = data && data.summary;
  if (!s) {
    card.empty = true;
    return card;
  }
  card.heroLabel = `${periodLabel}毛利`;
  card.heroValue = formatAmount(s.grossProfit);
  card.heroHint = `${formatQty(s.productCount)} 款产品`;
  const profit = Number(s.grossProfit);
  card.heroTone = profit > 0 ? 'ok' : profit < 0 ? 'warn' : 'default';
  card.metrics = [
    { label: '总成本', value: formatAmount(s.totalCost), tone: 'default' },
    { label: '销售额', value: formatAmount(s.totalSalesAmount), tone: 'ok' },
    { label: '总收入', value: formatAmount(s.totalRevenue), tone: 'violet' },
  ];
  return card;
}

async function loadPageStatCards(request, workbenchEffective, pageId, filter) {
  const widgets = extractPageStatWidgets(workbenchEffective, pageId);
  if (widgets.length === 0) {
    return [];
  }

  const periodLabel = workbenchPeriodFilterLabel(filter);
  const statsQuery = buildStatsQueryString(filter);

  const needsStats = widgets.some((w) =>
    ['sales_stats', 'sales_order_stats', 'finance_stats'].includes(w.widgetType),
  );
  const needsProductEconomics = widgets.some((w) =>
    ['product_economics', 'product_economics_consumable', 'product_economics_document'].includes(
      w.widgetType,
    ),
  );

  let statsData = null;
  let productEconomics = null;

  if (needsStats) {
    statsData = await request({ path: `/dashboard/stats?${statsQuery}`, method: 'GET' }).catch(
      () => null,
    );
  }
  if (needsProductEconomics) {
    productEconomics = await request({
      path: `/dashboard/product-economics?${statsQuery}`,
      method: 'GET',
    }).catch(() => null);
  }

  const cards = await Promise.all(
    widgets.map(async (item) => {
      const { widgetType } = item;
      if (widgetType === 'order_stats' || widgetType === 'outsource_stats' || widgetType === 'rework_stats') {
        return fetchNodeCard(request, widgetType, item, periodLabel, statsQuery);
      }

      const card = baseCard(widgetType, item, periodLabel);
      if (widgetType === 'sales_stats') {
        buildSalesKpiCard(card, statsData && statsData.sales, periodLabel);
      } else if (widgetType === 'sales_order_stats') {
        buildSalesOrderKpiCard(card, statsData && statsData.salesOrder, periodLabel);
      } else if (widgetType === 'finance_stats') {
        buildFinanceKpiCard(card, statsData && statsData.finance, periodLabel);
      } else if (
        widgetType === 'product_economics'
        || widgetType === 'product_economics_consumable'
        || widgetType === 'product_economics_document'
      ) {
        buildProductEconomicsKpiCard(card, productEconomics, periodLabel);
      }
      enrichKpiCard(card);
      card.loading = false;
      card.empty = !card.noPermission && card.variant === 'kpi' && card.heroValue === '—' && !card.metrics.length;
      return card;
    }),
  );

  return cards;
}

async function loadHomeStatCards(request, workbenchEffective, filter) {
  return loadPageStatCards(request, workbenchEffective, WORKBENCH_HOME_PAGE_ID, filter);
}

module.exports = {
  extractHomeStatWidgets,
  extractPageStatWidgets,
  buildWorkbenchPageTabs,
  resolveActiveWorkbenchPageId,
  loadHomeStatCards,
  loadPageStatCards,
};
