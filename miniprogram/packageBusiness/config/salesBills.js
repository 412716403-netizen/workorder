/**
 * 销售单模块配置（对齐 shared/types.ts PSI 常量）
 */

const PSI_TYPE = 'SALES_BILL';

const DEFAULT_PAGE_SIZE = 20;

const SALES_BILL_SHORTCUTS = [
  {
    id: 'bill-flow',
    label: '销售流水',
    icon: '/assets/icons/scroll-text.png',
    path: '/packageBusiness/psi-sales-bill-flow/psi-sales-bill-flow',
    permission: null,
  },
];

const DESKTOP_HINT = '表单配置、列表打印请在电脑端进销存操作';

module.exports = {
  PSI_TYPE,
  DEFAULT_PAGE_SIZE,
  SALES_BILL_SHORTCUTS,
  DESKTOP_HINT,
};
