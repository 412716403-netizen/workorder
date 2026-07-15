/**
 * 销售订单模块配置（对齐 shared/types.ts PSI 常量）
 */

const PSI_TYPE = 'SALES_ORDER';
const PSI_BILL_TYPE = 'SALES_BILL';

const DEFAULT_PAGE_SIZE = 20;

const SALES_ORDER_FLOW_STATUS_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'not_shipped', label: '未发货' },
  { value: 'partial_shipped', label: '发部分' },
  { value: 'fully_shipped', label: '已发齐' },
];

const SALES_ORDER_FLOW_STATUS_PILL = {
  not_shipped: 'st-pill--pending',
  partial_shipped: 'st-pill--primary',
  fully_shipped: 'st-pill--success',
};

const SALES_ORDER_SHORTCUTS = [
  {
    id: 'order-flow',
    label: '订单流水',
    icon: '/assets/icons/scroll-text.png',
    path: '/packagePsi/psi-sales-order-flow/psi-sales-order-flow',
    permission: null,
  },
  {
    id: 'pending-ship',
    label: '待发货',
    icon: '/assets/icons/truck.png',
    path: '/packagePsi/psi-sales-order-pending-ship/psi-sales-order-pending-ship',
    permission: 'psi:sales_order_pending_shipment:allow',
  },
];

const DESKTOP_HINT = '表单配置、列表打印请在电脑端进销存操作';

module.exports = {
  PSI_TYPE,
  PSI_BILL_TYPE,
  DEFAULT_PAGE_SIZE,
  SALES_ORDER_FLOW_STATUS_OPTIONS,
  SALES_ORDER_FLOW_STATUS_PILL,
  SALES_ORDER_SHORTCUTS,
  DESKTOP_HINT,
};
