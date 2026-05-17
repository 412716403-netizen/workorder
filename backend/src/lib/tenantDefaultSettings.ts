/**
 * 新租户默认系统配置（createTenant / seed 共用）。
 * 生产：关联工单、按工序顺序、不允许超报；表单标准字段列表显示默认关闭。
 */
export const TENANT_DEFAULT_SETTINGS: Record<string, unknown> = {
  productionLinkMode: 'order',
  processSequenceMode: 'sequential',
  allowExceedMaxReportQty: false,
  planFormSettings: {
    standardFields: [
      { id: 'planNumber', label: '计划单号', showInList: false, showInCreate: false, showInDetail: true },
      { id: 'product', label: '产品名称', showInList: true, showInCreate: false, showInDetail: true },
      { id: 'customer', label: '客户', showInList: false, showInCreate: true, showInDetail: true },
      { id: 'createdAt', label: '创建时间', showInList: false, showInCreate: false, showInDetail: true },
      { id: 'startDate', label: '开始日期', showInList: false, showInCreate: true, showInDetail: true },
      { id: 'priority', label: '优先级', showInList: false, showInCreate: true, showInDetail: true },
    ],
    customFields: [],
    listPrint: { showPrintButton: false },
  },
  orderFormSettings: {
    standardFields: [
      { id: 'orderNumber', label: '工单号', showInList: false, showInCreate: false, showInDetail: true },
      { id: 'customer', label: '客户', showInList: false, showInCreate: false, showInDetail: true },
      { id: 'dueDate', label: '交期', showInList: false, showInCreate: false, showInDetail: true },
      { id: 'startDate', label: '开始日期', showInList: false, showInCreate: false, showInDetail: true },
    ],
    customFields: [],
    orderCenterPrint: {
      orderDetail: { showPrintButton: false },
      reportBatchDetail: { showPrintButton: false },
      stockInFlowDetail: { showPrintButton: false },
    },
  },
  purchaseOrderFormSettings: {
    standardFields: [
      { id: 'docNumber', label: '单据编号', showInList: false, showInCreate: true, showInDetail: true },
      { id: 'partner', label: '供应商', showInList: false, showInCreate: true, showInDetail: true },
    ],
    customFields: [],
    listPrint: { showPrintButton: false },
    relatedProductEnabled: false,
  },
  salesOrderFormSettings: {
    standardFields: [
      { id: 'docNumber', label: '单据编号', showInList: false, showInCreate: false, showInDetail: true },
      { id: 'partner', label: '客户', showInList: false, showInCreate: true, showInDetail: true },
    ],
    customFields: [],
    listPrint: { showPrintButton: false },
  },
  purchaseBillFormSettings: {
    standardFields: [
      { id: 'docNumber', label: '单据号', showInList: false, showInCreate: false, showInDetail: true },
      { id: 'partner', label: '供应商', showInList: false, showInCreate: true, showInDetail: true },
      { id: 'warehouse', label: '入库仓库', showInList: false, showInCreate: true, showInDetail: true },
    ],
    customFields: [],
    listPrint: { showPrintButton: false },
  },
  salesBillFormSettings: {
    standardFields: [],
    customFields: [],
    listPrint: { showPrintButton: false },
  },
  receiptFormSettings: {
    listPrint: { showPrintButton: false },
  },
  paymentFormSettings: {
    listPrint: { showPrintButton: false },
  },
  materialPanelSettings: {
    groupByOutsourcePartner: false,
  },
  materialFormSettings: {
    materialIssueCustomFields: [],
    materialReturnCustomFields: [],
    outsourceMaterialIssueCustomFields: [],
    outsourceMaterialReturnCustomFields: [],
    materialCenterPrint: {
      stockOutFlowDetail: { showPrintButton: false },
      stockReturnFlowDetail: { showPrintButton: false },
      outsourceStockOutFlowDetail: { showPrintButton: false },
      outsourceStockReturnFlowDetail: { showPrintButton: false },
    },
  },
  outsourceFormSettings: {
    outsourceDispatchCustomFields: [],
    outsourceReceiveCustomFields: [],
    showOutsourceDispatchDeliveryDate: false,
    showPartnerFlowDetailOnList: false,
    outsourceCenterPrint: {
      dispatchFlowDetail: { showPrintButton: false },
      receiveFlowDetail: { showPrintButton: false },
    },
  },
  reworkFormSettings: {
    defectTreatmentCustomFields: [],
    reworkReportCustomFields: [],
    reworkCenterPrint: {
      defectTreatmentFlowDetail: { showPrintButton: false },
      reworkReportFlowDetail: { showPrintButton: false },
    },
  },
};

type SettingsDb = {
  systemSetting: {
    createMany: (args: {
      data: Array<{ tenantId: string; key: string; value: object }>;
      skipDuplicates?: boolean;
    }) => Promise<{ count: number }>;
  };
};

/** 为新租户写入默认 systemSetting（已存在 key 则跳过）。 */
export async function seedTenantDefaultSettings(tenantId: string, db: SettingsDb) {
  await db.systemSetting.createMany({
    data: Object.entries(TENANT_DEFAULT_SETTINGS).map(([key, value]) => ({
      tenantId,
      key,
      value: value as object,
    })),
    skipDuplicates: true,
  });
}
