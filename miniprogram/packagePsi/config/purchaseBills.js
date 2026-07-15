/**
 * 采购入库模块配置（对齐 shared/types.ts PSI 常量）
 */

const PSI_TYPE = 'PURCHASE_BILL';
const PSI_ORDER_TYPE = 'PURCHASE_ORDER';

const DEFAULT_PAGE_SIZE = 20;

const PURCHASE_BILL_SHORTCUTS = [
  {
    id: 'bill-flow',
    label: '入库流水',
    icon: '/assets/icons/scroll-text.png',
    path: '/packagePsi/psi-purchase-bill-flow/psi-purchase-bill-flow',
    permission: null,
  },
];

const DESKTOP_HINT = '表单配置、列表打印请在电脑端进销存操作';

module.exports = {
  PSI_TYPE,
  PSI_ORDER_TYPE,
  DEFAULT_PAGE_SIZE,
  PURCHASE_BILL_SHORTCUTS,
  DESKTOP_HINT,
};
