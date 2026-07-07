/**
 * 采购订单模块配置（对齐 shared/types.ts PSI 常量）
 */

const PSI_TYPE = 'PURCHASE_ORDER';
const PSI_BILL_TYPE = 'PURCHASE_BILL';
const PSI_PO_CUSTOM_DATA_SOURCE_PLAN_ID = 'sourcePlanId';
const PSI_PO_CUSTOM_DATA_SOURCE_PLAN_NUMBER = 'sourcePlanNumber';

const DEFAULT_PAGE_SIZE = 20;

const PURCHASE_ORDER_FLOW_STATUS_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'none', label: '未入库' },
  { value: 'partial', label: '部分入库' },
  { value: 'completed', label: '已入库' },
];

const PURCHASE_ORDER_FLOW_STATUS_PILL = {
  none: 'st-pill--pending',
  partial: 'st-pill--primary',
  completed: 'st-pill--success',
  over_received: 'st-pill--rejected',
};

const PURCHASE_ORDER_SHORTCUTS = [
  {
    id: 'order-flow',
    label: '订单流水',
    icon: '/assets/icons/scroll-text.png',
    path: '/packageBusiness/psi-purchase-order-flow/psi-purchase-order-flow',
    permission: null,
  },
];

const DESKTOP_HINT = '表单配置、列表打印请在电脑端进销存操作';

module.exports = {
  PSI_TYPE,
  PSI_BILL_TYPE,
  PSI_PO_CUSTOM_DATA_SOURCE_PLAN_ID,
  PSI_PO_CUSTOM_DATA_SOURCE_PLAN_NUMBER,
  DEFAULT_PAGE_SIZE,
  PURCHASE_ORDER_FLOW_STATUS_OPTIONS,
  PURCHASE_ORDER_FLOW_STATUS_PILL,
  PURCHASE_ORDER_SHORTCUTS,
  DESKTOP_HINT,
};
