/** 单价/金额细粒度权限 key（角色编辑与 canViewAmount 共用） */
export const AMOUNT_FINE_GRAINED_PERM_KEYS = [
  'production:outsource_amount:allow',
  'psi:purchase_order:amount',
  'psi:purchase_bill:amount',
  'psi:sales_order:amount',
  'psi:sales_bill:amount',
  'collaboration:amount:allow',
] as const;

export type AmountFineGrainedPermKey = (typeof AMOUNT_FINE_GRAINED_PERM_KEYS)[number];

export type PriceAmountSubModule = {
  key: string;
  label: string;
  permKey: AmountFineGrainedPermKey;
  group: string;
  /** 勾选时自动补全对应 PSI 单据的 view 权限 */
  requiresDocViewOnEnable?: boolean;
};

export const PRICE_AMOUNT_SUB_MODULES: PriceAmountSubModule[] = [
  { key: 'outsource_amount', label: '外协 · 加工费/单价', permKey: 'production:outsource_amount:allow', group: '生产管理' },
  { key: 'psi_purchase_order', label: '采购订单', permKey: 'psi:purchase_order:amount', group: '进销存', requiresDocViewOnEnable: true },
  { key: 'psi_purchase_bill', label: '采购入库', permKey: 'psi:purchase_bill:amount', group: '进销存', requiresDocViewOnEnable: true },
  { key: 'psi_sales_order', label: '销售订单', permKey: 'psi:sales_order:amount', group: '进销存', requiresDocViewOnEnable: true },
  { key: 'psi_sales_bill', label: '销售单', permKey: 'psi:sales_bill:amount', group: '进销存', requiresDocViewOnEnable: true },
  { key: 'collaboration_amount', label: '协作 · 单价/金额', permKey: 'collaboration:amount:allow', group: '协作管理' },
];
