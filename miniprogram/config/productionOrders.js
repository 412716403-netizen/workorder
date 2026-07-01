/**
 * 工单中心模块配置（对齐 shared/types.ts OrderDispatchStatus）
 */

const OrderDispatchStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
};

const ORDER_DISPATCH_STATUS_LABEL = {
  [OrderDispatchStatus.IN_PROGRESS]: '进行中',
  [OrderDispatchStatus.COMPLETED]: '已完成',
};

const OrderStatus = {
  PLANNING: 'PLANNING',
  PRODUCING: 'PRODUCING',
  QC: 'QC',
  SHIPPED: 'SHIPPED',
  ON_HOLD: 'ON_HOLD',
};

const ORDER_STATUS_LABEL = {
  [OrderStatus.PLANNING]: '计划中',
  [OrderStatus.PRODUCING]: '生产中',
  [OrderStatus.QC]: '质检',
  [OrderStatus.SHIPPED]: '已发货',
  [OrderStatus.ON_HOLD]: '暂停',
};

const PRIORITY_LABEL = {
  High: '高',
  Medium: '中',
  Low: '低',
};

const DEFAULT_PAGE_SIZE = 20;

const DESKTOP_HINT =
  '删除工单、表单配置、打印、报工批次编辑、色码矩阵报工、外协详情请在电脑端工单中心操作';

/** 工单中心筛选面板快捷入口（对齐 Web OrderListView 工具栏） */
const ORDER_CENTER_SHORTCUTS = [
  {
    id: 'order-flow',
    label: '工单流水',
    icon: '/assets/icons/scroll-text.png',
    path: '/pages/production-order-flow/production-order-flow',
    permission: null,
  },
  {
    id: 'report-history',
    label: '报工流水',
    icon: '/assets/icons/history.png',
    path: '/pages/production-order-report-history/production-order-report-history',
    permission: 'production:orders_report_records:view',
  },
  {
    id: 'pending-stock',
    label: '待入库清单',
    icon: '/assets/icons/arrow-down-to-line.png',
    path: '/pages/production-order-pending-stock/production-order-pending-stock',
    permission: 'production:orders_pending_stock_in',
    showBadge: true,
  },
];

module.exports = {
  OrderDispatchStatus,
  ORDER_DISPATCH_STATUS_LABEL,
  OrderStatus,
  ORDER_STATUS_LABEL,
  PRIORITY_LABEL,
  DEFAULT_PAGE_SIZE,
  DESKTOP_HINT,
  ORDER_CENTER_SHORTCUTS,
};
