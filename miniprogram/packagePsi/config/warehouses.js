/**
 * 仓库管理模块配置（对齐 Web WarehousePanel / shared/types PSI 常量）
 */

const PSI_TRANSFER_TYPE = 'TRANSFER';
const PSI_STOCKTAKE_TYPE = 'STOCKTAKE';

const DEFAULT_PAGE_SIZE = 20;

const INVENTORY_VIEW_MODES = [
  { value: 'warehouse', label: '按仓库' },
  { value: 'product', label: '按物料' },
];

const WAREHOUSE_FLOW_TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'PURCHASE_BILL', label: '采购入库' },
  { value: 'PURCHASE_RETURN', label: '采购退货' },
  { value: 'SALES_BILL', label: '销售出库' },
  { value: 'SALES_RETURN', label: '销售退货' },
  { value: 'TRANSFER', label: '调拨' },
  { value: 'STOCKTAKE', label: '盘点' },
  { value: 'STOCK_IN', label: '生产入库' },
  { value: 'STOCK_RETURN', label: '生产退料' },
  { value: 'STOCK_OUT', label: '领料发出' },
];

const WAREHOUSE_SHORTCUTS = [
  {
    id: 'warehouse-flow',
    label: '流水',
    icon: '/assets/icons/scroll-text.png',
    path: '/packagePsi/psi-warehouse-flow/psi-warehouse-flow',
    permission: 'psi:warehouse_flow:allow',
  },
  {
    id: 'stocktake',
    label: '盘点',
    icon: '/assets/icons/clipboard-list.png',
    path: '/packagePsi/psi-warehouse-stocktake/psi-warehouse-stocktake',
    permission: 'psi:warehouse_stocktake:view',
  },
  {
    id: 'transfer',
    label: '调拨',
    icon: '/assets/icons/truck.png',
    path: '/packagePsi/psi-warehouse-transfer/psi-warehouse-transfer',
    permission: 'psi:warehouse_transfer:view',
  },
];

const DESKTOP_HINT = '批量盘点、复杂库存调整请在电脑端仓库管理操作';

module.exports = {
  PSI_TRANSFER_TYPE,
  PSI_STOCKTAKE_TYPE,
  DEFAULT_PAGE_SIZE,
  INVENTORY_VIEW_MODES,
  WAREHOUSE_FLOW_TYPE_OPTIONS,
  WAREHOUSE_SHORTCUTS,
  DESKTOP_HINT,
};
