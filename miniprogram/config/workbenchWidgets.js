/**
 * 工作台统计组件元数据（对齐 shared/workbench.ts WORKBENCH_WIDGET_CATALOG）
 */

const WORKBENCH_HOME_PAGE_ID = 'page-overview';

const HOME_PINNED_WIDGET_TYPES = ['shortcuts', 'plugin_center', 'messages'];

const STAT_WIDGET_TYPES = [
  'order_stats',
  'outsource_stats',
  'rework_stats',
  'sales_stats',
  'sales_order_stats',
  'finance_stats',
  'product_economics',
  'product_economics_consumable',
  'product_economics_document',
];

const WIDGET_META = {
  order_stats: {
    title: '工单统计',
    variant: 'node',
    theme: 'emerald',
    iconChar: '工',
    subtitle: '按工序查看报工与进度',
  },
  outsource_stats: {
    title: '外协统计',
    variant: 'node',
    theme: 'amber',
    iconChar: '协',
    subtitle: '外协派出与收回情况',
  },
  rework_stats: {
    title: '返工统计',
    variant: 'node',
    theme: 'rose',
    iconChar: '返',
    subtitle: '返工任务完成进度',
  },
  sales_stats: {
    title: '销售统计',
    variant: 'kpi',
    theme: 'sky',
    iconChar: '销',
    subtitle: '出库单与销售额',
  },
  sales_order_stats: {
    title: '销售订单',
    variant: 'kpi',
    theme: 'cyan',
    iconChar: '订',
    subtitle: '销售订单汇总',
  },
  finance_stats: {
    title: '财务统计',
    variant: 'kpi',
    theme: 'indigo',
    iconChar: '财',
    subtitle: '收付款与现金流',
  },
  product_economics: {
    title: '产品经营',
    variant: 'kpi',
    theme: 'violet',
    iconChar: '品',
    subtitle: '产品成本与毛利',
  },
  product_economics_consumable: {
    title: '产品经营',
    variant: 'kpi',
    theme: 'violet',
    iconChar: '品',
    subtitle: '按耗材与结余损耗',
  },
  product_economics_document: {
    title: '产品经营',
    variant: 'kpi',
    theme: 'violet',
    iconChar: '品',
    subtitle: '按关联单据口径',
  },
};

/** 首页默认统计组件（对齐 WORKBENCH_HOME_DEFAULT_LAYOUT 中的统计区） */
const DEFAULT_HOME_STAT_WIDGETS = [
  { i: 'w-order-stats', widgetType: 'order_stats', x: 0, y: 6, w: 6, h: 7 },
  { i: 'w-outsource-stats', widgetType: 'outsource_stats', x: 6, y: 6, w: 6, h: 7 },
  { i: 'w-finance-stats', widgetType: 'finance_stats', x: 0, y: 13, w: 4, h: 6 },
  { i: 'w-sales-stats', widgetType: 'sales_stats', x: 4, y: 13, w: 4, h: 6 },
  { i: 'w-rework-stats', widgetType: 'rework_stats', x: 8, y: 13, w: 4, h: 6 },
];

module.exports = {
  WORKBENCH_HOME_PAGE_ID,
  HOME_PINNED_WIDGET_TYPES,
  STAT_WIDGET_TYPES,
  WIDGET_META,
  DEFAULT_HOME_STAT_WIDGETS,
};
