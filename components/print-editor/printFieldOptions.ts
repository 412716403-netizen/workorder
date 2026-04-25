import type {
  FinanceCategory,
  PlanFormFieldConfig,
  PrintDynamicListDataSource,
  PrintTemplateDocumentType,
  ProductCategory,
} from '../../types';

function financeKindCustomPrintOptions(
  financeCategories: FinanceCategory[] | undefined,
  kind: 'RECEIPT' | 'PAYMENT',
  group: '收款单' | '付款单',
): PrintFieldOption[] {
  if (!financeCategories?.length) return [];
  const byId = new Map<string, { id: string; label: string }>();
  for (const c of financeCategories) {
    if (c.kind !== kind) continue;
    for (const f of c.customFields ?? []) {
      if (!f?.id || byId.has(f.id)) continue;
      byId.set(f.id, { id: f.id, label: f.label || f.id });
    }
  }
  return [...byId.values()].map(f => ({
    group,
    value: `${group}.custom.${f.id}`,
    label: f.label,
  }));
}

/** 合并各产品分类上的自定义字段（按 id 去重）；占位符 {{产品.custom.<id>}} 对应 Product.categoryCustomData */
function productCategoryCustomPrintOptions(categories: ProductCategory[] | undefined): PrintFieldOption[] {
  if (!categories?.length) return [];
  const byId = new Map<string, PrintFieldOption>();
  for (const cat of categories) {
    for (const f of cat.customFields ?? []) {
      if (!f?.id || byId.has(f.id)) continue;
      const base = (f.label || '').trim() || f.id;
      const typeHint = f.type === 'file' ? '（文件/图片）' : '';
      byId.set(f.id, {
        group: '产品',
        value: `产品.custom.${f.id}`,
        label: `「${cat.name}」${base}${typeHint}`,
      });
    }
  }
  return [...byId.values()];
}

export interface PrintFieldOption {
  value: string;
  label: string;
  group: string;
}

/** 插入到模板中的占位片段（含花括号） */
export function wrapFieldPlaceholder(path: string, style: 'mustache' | 'dollar' = 'mustache'): string {
  const p = path.trim();
  return style === 'mustache' ? `{{${p}}}` : `\${${p}}`;
}

export function buildPrintFieldOptions(opts: {
  planCustomFields: PlanFormFieldConfig[];
  /** 工单中心入库自定义（与工单表单配置一致）；占位符 {{入库.custom.<id>}} */
  stockInCustomFields?: PlanFormFieldConfig[];
  /** 生产物料领料自定义；{{领料发出.custom.<id>}} */
  materialIssueCustomFields?: PlanFormFieldConfig[];
  /** 生产物料退料自定义；{{生产退料.custom.<id>}} */
  materialReturnCustomFields?: PlanFormFieldConfig[];
  /** 生产物料外协领料自定义；{{外协领料发出.custom.<id>}} */
  outsourceMaterialIssueCustomFields?: PlanFormFieldConfig[];
  /** 生产物料外协退料自定义；{{外协生产退料.custom.<id>}} */
  outsourceMaterialReturnCustomFields?: PlanFormFieldConfig[];
  /** 外协发出自定义；{{外协发出.custom.<id>}} */
  outsourceDispatchCustomFields?: PlanFormFieldConfig[];
  /** 外协收回自定义；{{外协收回.custom.<id>}} */
  outsourceReceiveCustomFields?: PlanFormFieldConfig[];
  /** 返工管理：处理不良自定义；{{处理不良.custom.<id>}} */
  defectTreatmentCustomFields?: PlanFormFieldConfig[];
  /** 返工管理：返工报工自定义；{{返工报工.custom.<id>}} */
  reworkReportCustomFields?: PlanFormFieldConfig[];
  /** 采购订单表单自定义；{{采购订单.custom.<id>}} */
  purchaseOrderCustomFields?: PlanFormFieldConfig[];
  /** 销售订单表单自定义；{{销售订单.custom.<id>}} */
  salesOrderCustomFields?: PlanFormFieldConfig[];
  /** 采购单（入库）表单自定义；{{采购单.custom.<id>}} */
  purchaseBillCustomFields?: PlanFormFieldConfig[];
  /** 销售单表单自定义；{{销售单.custom.<id>}} */
  salesBillCustomFields?: PlanFormFieldConfig[];
  /** 收付款类型设置中的分类自定义字段；{{收款单.custom.<id>}} / {{付款单.custom.<id>}} */
  financeCategories?: FinanceCategory[];
  /** 产品分类上的自定义字段；{{产品.custom.<id>}} 与 Product.categoryCustomData 对齐 */
  productCategories?: ProductCategory[];
}): PrintFieldOption[] {
  const planCustomFields = opts.planCustomFields ?? [];
  const stockInCustomFields = opts.stockInCustomFields ?? [];
  const materialIssueCustomFields = opts.materialIssueCustomFields ?? [];
  const materialReturnCustomFields = opts.materialReturnCustomFields ?? [];
  const outsourceMaterialIssueCustomFields = opts.outsourceMaterialIssueCustomFields ?? [];
  const outsourceMaterialReturnCustomFields = opts.outsourceMaterialReturnCustomFields ?? [];
  const outsourceDispatchCustomFields = opts.outsourceDispatchCustomFields ?? [];
  const outsourceReceiveCustomFields = opts.outsourceReceiveCustomFields ?? [];
  const defectTreatmentCustomFields = opts.defectTreatmentCustomFields ?? [];
  const reworkReportCustomFields = opts.reworkReportCustomFields ?? [];
  const purchaseOrderCustomFields = opts.purchaseOrderCustomFields ?? [];
  const salesOrderCustomFields = opts.salesOrderCustomFields ?? [];
  const purchaseBillCustomFields = opts.purchaseBillCustomFields ?? [];
  const salesBillCustomFields = opts.salesBillCustomFields ?? [];
  const financeCategories = opts.financeCategories ?? [];
  const productCategories = opts.productCategories ?? [];
  const system: PrintFieldOption[] = [
    { group: '系统', value: '系统.systemTime', label: '当前时间' },
    { group: '系统', value: '系统.pageCurrent', label: '当前页码' },
    { group: '系统', value: '系统.pageTotal', label: '总页数' },
  ];
  const planStatic: PrintFieldOption[] = [
    { group: '计划', value: '计划.planNumber', label: '计划单号' },
    { group: '计划', value: '计划.customer', label: '客户' },
    { group: '计划', value: '计划.startDate', label: '开始日期' },
    { group: '计划', value: '计划.priority', label: '优先级' },
    { group: '计划', value: '计划.status', label: '计划状态' },
    { group: '计划', value: '计划.totalQuantity', label: '计划总数量' },
    { group: '计划', value: '计划.createdAt', label: '添加日期' },
  ];
  /** 与计划单「表单配置 → 自定义单据内容」一致，归入「计划」分类便于在插入字段中与标准计划字段一起选用 */
  const planCustom: PrintFieldOption[] = planCustomFields.map(f => ({
    group: '计划',
    value: `计划.custom.${f.id}`,
    label: f.label,
  }));
  const plan: PrintFieldOption[] = [...planStatic, ...planCustom];
  const order: PrintFieldOption[] = [
    { group: '工单', value: '工单.orderNumber', label: '工单编号' },
    { group: '工单', value: '工单.id', label: '工单ID' },
    { group: '工单', value: '工单.customer', label: '客户' },
    { group: '工单', value: '工单.dueDate', label: '交期' },
    { group: '工单', value: '工单.startDate', label: '开始日期' },
    { group: '工单', value: '工单.priority', label: '优先级' },
    { group: '工单', value: '工单.status', label: '工单状态' },
    { group: '工单', value: '工单.productName', label: '产品名称' },
    { group: '工单', value: '工单.sku', label: 'SKU' },
    { group: '工单', value: '工单.createdAt', label: '创建日期' },
  ];
  const productStatic: PrintFieldOption[] = [
    { group: '产品', value: '产品.name', label: '产品名称' },
    { group: '产品', value: '产品.sku', label: 'SKU' },
    { group: '产品', value: '产品.imageUrl', label: '产品主图' },
    { group: '产品', value: '产品.description', label: '描述' },
  ];
  const productCategoryCustom = productCategoryCustomPrintOptions(productCategories);
  const product: PrintFieldOption[] = [...productStatic, ...productCategoryCustom];
  const proc: PrintFieldOption[] = [
    { group: '工序', value: '工序.name', label: '工序名称' },
    { group: '工序', value: '工序.completedQuantity', label: '完成数量' },
  ];
  /**
   * 「明细行」组仅在工单打印上下文（order）里字段完全生效；
   * 在 plan / rework 场景此组会被开放（FIELD_GROUPS_BY_DOCUMENT），
   * 但其中 quantity / completedQuantity / variantId 三个字段只在工单 row 上存在，
   * 其他行结构（销售单明细行、返工明细行）取不到值会返回空串。
   * label 里保留「(工单行)」措辞用于提示用户此字段专属于工单场景。
   */
  const listRow: PrintFieldOption[] = [
    { group: '明细行', value: '行.index', label: '行序号（从 1）' },
    { group: '明细行', value: '行.quantity', label: '数量（工单行）' },
    { group: '明细行', value: '行.completedQuantity', label: '完成数量（工单行）' },
    { group: '明细行', value: '行.variantId', label: '规格 variantId' },
  ];
  const itemCodeRow: PrintFieldOption[] = [
    { group: '单品码行', value: '行.scanUrl', label: '扫码URL（二维码内容）' },
    { group: '单品码行', value: '行.scanToken', label: '扫码Token' },
    { group: '单品码行', value: '行.serialNo', label: '单品码序号（数字）' },
    { group: '单品码行', value: '行.serialLabel', label: '单品码编号（如 J-PLN12-0001）' },
    { group: '单品码行', value: '行.variantLabel', label: '规格文案（颜色+尺码）' },
    { group: '单品码行', value: '行.colorName', label: '颜色名称' },
    { group: '单品码行', value: '行.sizeName', label: '尺码名称' },
    { group: '单品码行', value: '行.orderNumbers', label: '关联工单号' },
    { group: '单品码行', value: '行.status', label: '单品码状态' },
  ];
  const salesBillHeader: PrintFieldOption[] = [
    { group: '销售单', value: '销售单.title', label: '标题' },
    { group: '销售单', value: '销售单.docNumber', label: '单据编号' },
    { group: '销售单', value: '销售单.partner', label: '客户' },
    { group: '销售单', value: '销售单.partnerId', label: '客户ID' },
    { group: '销售单', value: '销售单.warehouseName', label: '出库仓库' },
    { group: '销售单', value: '销售单.createdAtDisplay', label: '开单日期（中文）' },
    { group: '销售单', value: '销售单.note', label: '单据备注' },
    { group: '销售单', value: '销售单.docTotalQty', label: '本单总件数' },
    { group: '销售单', value: '销售单.docTotalAmount', label: '本单总金额' },
    { group: '销售单', value: '销售单.previousBalance', label: '上次结余（应收）' },
    { group: '销售单', value: '销售单.currentDebt', label: '本次应收变动' },
    { group: '销售单', value: '销售单.accumulatedDebt', label: '累计应收余额' },
  ];
  const salesBillCustom: PrintFieldOption[] = salesBillCustomFields.map(f => ({
    group: '销售单',
    value: `销售单.custom.${f.id}`,
    label: f.label,
  }));
  const salesBillBlock: PrintFieldOption[] = [...salesBillHeader, ...salesBillCustom];
  const purchaseOrderHeader: PrintFieldOption[] = [
    { group: '采购订单', value: '采购订单.docNumber', label: '单据编号' },
    { group: '采购订单', value: '采购订单.partner', label: '供应商' },
    { group: '采购订单', value: '采购订单.operator', label: '经办' },
    { group: '采购订单', value: '采购订单.docTotalQty', label: '本单总件数' },
    { group: '采购订单', value: '采购订单.docTotalAmount', label: '本单总金额' },
  ];
  const purchaseOrderCustom: PrintFieldOption[] = purchaseOrderCustomFields.map(f => ({
    group: '采购订单',
    value: `采购订单.custom.${f.id}`,
    label: f.label,
  }));
  const purchaseOrderBlock: PrintFieldOption[] = [...purchaseOrderHeader, ...purchaseOrderCustom];
  const purchaseOrderDetailRow: PrintFieldOption[] = [
    { group: '采购订单明细', value: '行.lineNo', label: '行序号' },
    { group: '采购订单明细', value: '行.sku', label: '货号' },
    { group: '采购订单明细', value: '行.productName', label: '名称' },
    { group: '采购订单明细', value: '行.colorName', label: '颜色' },
    { group: '采购订单明细', value: '行.sizeName', label: '尺码' },
    { group: '采购订单明细', value: '行.qty', label: '数量' },
    { group: '采购订单明细', value: '行.unitPrice', label: '单价' },
    { group: '采购订单明细', value: '行.amount', label: '金额' },
    { group: '采购订单明细', value: '行.remark', label: '备注' },
  ];
  const salesOrderHeader: PrintFieldOption[] = [
    { group: '销售订单', value: '销售订单.docNumber', label: '单据编号' },
    { group: '销售订单', value: '销售订单.partner', label: '客户' },
    { group: '销售订单', value: '销售订单.operator', label: '经办' },
    { group: '销售订单', value: '销售订单.docTotalQty', label: '本单总件数' },
    { group: '销售订单', value: '销售订单.docTotalAmount', label: '本单总金额' },
  ];
  const salesOrderCustom: PrintFieldOption[] = salesOrderCustomFields.map(f => ({
    group: '销售订单',
    value: `销售订单.custom.${f.id}`,
    label: f.label,
  }));
  const salesOrderBlock: PrintFieldOption[] = [...salesOrderHeader, ...salesOrderCustom];
  const salesOrderDetailRow: PrintFieldOption[] = [
    { group: '销售订单明细', value: '行.lineNo', label: '行序号' },
    { group: '销售订单明细', value: '行.sku', label: '货号' },
    { group: '销售订单明细', value: '行.productName', label: '名称' },
    { group: '销售订单明细', value: '行.colorName', label: '颜色' },
    { group: '销售订单明细', value: '行.sizeName', label: '尺码' },
    { group: '销售订单明细', value: '行.qty', label: '数量' },
    { group: '销售订单明细', value: '行.unitPrice', label: '单价' },
    { group: '销售订单明细', value: '行.amount', label: '金额' },
    { group: '销售订单明细', value: '行.remark', label: '备注' },
  ];
  const purchaseBillHeader: PrintFieldOption[] = [
    { group: '采购单', value: '采购单.docNumber', label: '单据编号' },
    { group: '采购单', value: '采购单.partner', label: '供应商' },
    { group: '采购单', value: '采购单.operator', label: '经办' },
    { group: '采购单', value: '采购单.warehouseName', label: '入库仓库' },
    { group: '采购单', value: '采购单.docTotalQty', label: '本单总件数' },
    { group: '采购单', value: '采购单.docTotalAmount', label: '本单总金额' },
  ];
  const purchaseBillCustom: PrintFieldOption[] = purchaseBillCustomFields.map(f => ({
    group: '采购单',
    value: `采购单.custom.${f.id}`,
    label: f.label,
  }));
  const purchaseBillBlock: PrintFieldOption[] = [...purchaseBillHeader, ...purchaseBillCustom];
  const receiptHeader: PrintFieldOption[] = [
    { group: '收款单', value: '收款单.docNo', label: '单据编号' },
    { group: '收款单', value: '收款单.type', label: '单据类型' },
    { group: '收款单', value: '收款单.timestamp', label: '业务时间' },
    { group: '收款单', value: '收款单.category', label: '单据分类' },
    { group: '收款单', value: '收款单.partner', label: '对方（客户）' },
    { group: '收款单', value: '收款单.amount', label: '金额（小写）' },
    { group: '收款单', value: '收款单.amountText', label: '金额大写' },
    { group: '收款单', value: '收款单.paymentAccount', label: '收支账户' },
    { group: '收款单', value: '收款单.workerName', label: '关联工人' },
    { group: '收款单', value: '收款单.productName', label: '关联产品名称' },
    { group: '收款单', value: '收款单.productSku', label: '关联产品货号' },
    { group: '收款单', value: '收款单.relatedDocNo', label: '关联工单号' },
    { group: '收款单', value: '收款单.note', label: '备注' },
    { group: '收款单', value: '收款单.operator', label: '经办人' },
  ];
  const receiptCustom = financeKindCustomPrintOptions(financeCategories, 'RECEIPT', '收款单');
  const receiptBlock: PrintFieldOption[] = [...receiptHeader, ...receiptCustom];
  const paymentHeader: PrintFieldOption[] = [
    { group: '付款单', value: '付款单.docNo', label: '单据编号' },
    { group: '付款单', value: '付款单.type', label: '单据类型' },
    { group: '付款单', value: '付款单.timestamp', label: '业务时间' },
    { group: '付款单', value: '付款单.category', label: '单据分类' },
    { group: '付款单', value: '付款单.partner', label: '对方（供应商等）' },
    { group: '付款单', value: '付款单.amount', label: '金额（小写）' },
    { group: '付款单', value: '付款单.amountText', label: '金额大写' },
    { group: '付款单', value: '付款单.paymentAccount', label: '收支账户' },
    { group: '付款单', value: '付款单.workerName', label: '关联工人' },
    { group: '付款单', value: '付款单.productName', label: '关联产品名称' },
    { group: '付款单', value: '付款单.productSku', label: '关联产品货号' },
    { group: '付款单', value: '付款单.relatedDocNo', label: '关联工单号' },
    { group: '付款单', value: '付款单.note', label: '备注' },
    { group: '付款单', value: '付款单.operator', label: '经办人' },
  ];
  const paymentCustom = financeKindCustomPrintOptions(financeCategories, 'PAYMENT', '付款单');
  const paymentBlock: PrintFieldOption[] = [...paymentHeader, ...paymentCustom];
  const purchaseBillDetailRow: PrintFieldOption[] = [
    { group: '采购单明细', value: '行.lineNo', label: '行序号' },
    { group: '采购单明细', value: '行.sku', label: '货号' },
    { group: '采购单明细', value: '行.productName', label: '名称' },
    { group: '采购单明细', value: '行.colorName', label: '颜色' },
    { group: '采购单明细', value: '行.sizeName', label: '尺码' },
    { group: '采购单明细', value: '行.qty', label: '数量' },
    { group: '采购单明细', value: '行.unitPrice', label: '单价' },
    { group: '采购单明细', value: '行.amount', label: '金额' },
    { group: '采购单明细', value: '行.remark', label: '备注' },
  ];
  const salesBillRow: PrintFieldOption[] = [
    { group: '销售单明细', value: '行.lineNo', label: '行序号' },
    { group: '销售单明细', value: '行.sku', label: '货号' },
    { group: '销售单明细', value: '行.productName', label: '名称' },
    { group: '销售单明细', value: '行.colorName', label: '颜色' },
    { group: '销售单明细', value: '行.sizeName', label: '尺码' },
    { group: '销售单明细', value: '行.qty', label: '数量' },
    { group: '销售单明细', value: '行.unitPrice', label: '单价' },
    { group: '销售单明细', value: '行.amount', label: '金额' },
    { group: '销售单明细', value: '行.remark', label: '备注' },
  ];
  const reportBatchHeader: PrintFieldOption[] = [
    { group: '报工', value: '报工.reportNo', label: '报工单号/批次号' },
    { group: '报工', value: '报工.sourceLabel', label: '来源（工单/产品）' },
    { group: '报工', value: '报工.milestoneName', label: '工序名称' },
    { group: '报工', value: '报工.productName', label: '产品名称' },
    { group: '报工', value: '报工.totalGood', label: '良品合计' },
    { group: '报工', value: '报工.totalDefective', label: '不良合计' },
    { group: '报工', value: '报工.totalAmount', label: '金额合计' },
    { group: '报工', value: '报工.firstTimestamp', label: '首条报工时间' },
    { group: '报工', value: '报工.firstOperator', label: '首条操作员' },
  ];
  const reportBatchRow: PrintFieldOption[] = [
    { group: '报工明细行', value: '行.index', label: '行序号' },
    { group: '报工明细行', value: '行.quantity', label: '良品数量' },
    { group: '报工明细行', value: '行.defectiveQuantity', label: '不良数量' },
    { group: '报工明细行', value: '行.operator', label: '操作员' },
    { group: '报工明细行', value: '行.timestamp', label: '报工时间' },
    { group: '报工明细行', value: '行.variantLabel', label: '规格' },
    { group: '报工明细行', value: '行.orderNumber', label: '工单号' },
    { group: '报工明细行', value: '行.milestoneName', label: '工序' },
  ];
  const stockInCustomOpts: PrintFieldOption[] = stockInCustomFields.map(f => ({
    group: '入库',
    value: `入库.custom.${f.id}`,
    label: f.label,
  }));
  const stockInHeader: PrintFieldOption[] = [
    { group: '入库', value: '入库.docNo', label: '入库单号' },
    { group: '入库', value: '入库.warehouseName', label: '入库仓库' },
    { group: '入库', value: '入库.operator', label: '经办人' },
    { group: '入库', value: '入库.timestamp', label: '入库时间' },
    { group: '入库', value: '入库.productName', label: '产品名称' },
    { group: '入库', value: '入库.orderNumber', label: '工单号' },
    { group: '入库', value: '入库.totalQty', label: '合计数量' },
    ...stockInCustomOpts,
  ];
  const stockInRow: PrintFieldOption[] = [
    { group: '入库明细行', value: '行.index', label: '行序号' },
    { group: '入库明细行', value: '行.variantLabel', label: '规格' },
    { group: '入库明细行', value: '行.quantity', label: '数量' },
  ];
  const materialIssueCustomOpts: PrintFieldOption[] = materialIssueCustomFields.map(f => ({
    group: '领料发出',
    value: `领料发出.custom.${f.id}`,
    label: f.label,
  }));
  const materialIssueHeader: PrintFieldOption[] = [
    { group: '领料发出', value: '领料发出.docNo', label: '单据号' },
    { group: '领料发出', value: '领料发出.warehouseName', label: '仓库' },
    { group: '领料发出', value: '领料发出.operator', label: '经办人' },
    { group: '领料发出', value: '领料发出.timestamp', label: '业务时间' },
    { group: '领料发出', value: '领料发出.partner', label: '加工厂/外协' },
    { group: '领料发出', value: '领料发出.reason', label: '备注' },
    { group: '领料发出', value: '领料发出.orderNumber', label: '工单号' },
    { group: '领料发出', value: '领料发出.productName', label: '成品/来源产品名称' },
    { group: '领料发出', value: '领料发出.totalQty', label: '合计数量' },
    ...materialIssueCustomOpts,
  ];
  const materialIssueRow: PrintFieldOption[] = [
    { group: '领料发出明细行', value: '行.index', label: '行序号' },
    { group: '领料发出明细行', value: '行.productName', label: '物料名称' },
    { group: '领料发出明细行', value: '行.sku', label: '物料SKU' },
    { group: '领料发出明细行', value: '行.quantity', label: '数量' },
    { group: '领料发出明细行', value: '行.unit', label: '单位' },
  ];
  const materialReturnCustomOpts: PrintFieldOption[] = materialReturnCustomFields.map(f => ({
    group: '生产退料',
    value: `生产退料.custom.${f.id}`,
    label: f.label,
  }));
  const materialReturnHeader: PrintFieldOption[] = [
    { group: '生产退料', value: '生产退料.docNo', label: '单据号' },
    { group: '生产退料', value: '生产退料.warehouseName', label: '仓库' },
    { group: '生产退料', value: '生产退料.operator', label: '经办人' },
    { group: '生产退料', value: '生产退料.timestamp', label: '业务时间' },
    { group: '生产退料', value: '生产退料.partner', label: '加工厂/外协' },
    { group: '生产退料', value: '生产退料.reason', label: '备注' },
    { group: '生产退料', value: '生产退料.orderNumber', label: '工单号' },
    { group: '生产退料', value: '生产退料.productName', label: '成品/来源产品名称' },
    { group: '生产退料', value: '生产退料.totalQty', label: '合计数量' },
    ...materialReturnCustomOpts,
  ];
  const materialReturnRow: PrintFieldOption[] = [
    { group: '生产退料明细行', value: '行.index', label: '行序号' },
    { group: '生产退料明细行', value: '行.productName', label: '物料名称' },
    { group: '生产退料明细行', value: '行.sku', label: '物料SKU' },
    { group: '生产退料明细行', value: '行.quantity', label: '数量' },
    { group: '生产退料明细行', value: '行.unit', label: '单位' },
  ];
  const outsourceMaterialIssueCustomOpts: PrintFieldOption[] = outsourceMaterialIssueCustomFields.map(f => ({
    group: '外协领料发出',
    value: `外协领料发出.custom.${f.id}`,
    label: f.label,
  }));
  const outsourceMaterialIssueHeader: PrintFieldOption[] = [
    { group: '外协领料发出', value: '外协领料发出.docNo', label: '单据号' },
    { group: '外协领料发出', value: '外协领料发出.warehouseName', label: '仓库' },
    { group: '外协领料发出', value: '外协领料发出.operator', label: '经办人' },
    { group: '外协领料发出', value: '外协领料发出.timestamp', label: '业务时间' },
    { group: '外协领料发出', value: '外协领料发出.partner', label: '加工厂/外协' },
    { group: '外协领料发出', value: '外协领料发出.reason', label: '备注' },
    { group: '外协领料发出', value: '外协领料发出.orderNumber', label: '工单号' },
    { group: '外协领料发出', value: '外协领料发出.productName', label: '成品/来源产品名称' },
    { group: '外协领料发出', value: '外协领料发出.totalQty', label: '合计数量' },
    ...outsourceMaterialIssueCustomOpts,
  ];
  const outsourceMaterialIssueRow: PrintFieldOption[] = [
    { group: '外协领料发出明细行', value: '行.index', label: '行序号' },
    { group: '外协领料发出明细行', value: '行.productName', label: '物料名称' },
    { group: '外协领料发出明细行', value: '行.sku', label: '物料SKU' },
    { group: '外协领料发出明细行', value: '行.quantity', label: '数量' },
    { group: '外协领料发出明细行', value: '行.unit', label: '单位' },
  ];
  const outsourceMaterialReturnCustomOpts: PrintFieldOption[] = outsourceMaterialReturnCustomFields.map(f => ({
    group: '外协生产退料',
    value: `外协生产退料.custom.${f.id}`,
    label: f.label,
  }));
  const outsourceMaterialReturnHeader: PrintFieldOption[] = [
    { group: '外协生产退料', value: '外协生产退料.docNo', label: '单据号' },
    { group: '外协生产退料', value: '外协生产退料.warehouseName', label: '仓库' },
    { group: '外协生产退料', value: '外协生产退料.operator', label: '经办人' },
    { group: '外协生产退料', value: '外协生产退料.timestamp', label: '业务时间' },
    { group: '外协生产退料', value: '外协生产退料.partner', label: '加工厂/外协' },
    { group: '外协生产退料', value: '外协生产退料.reason', label: '备注' },
    { group: '外协生产退料', value: '外协生产退料.orderNumber', label: '工单号' },
    { group: '外协生产退料', value: '外协生产退料.productName', label: '成品/来源产品名称' },
    { group: '外协生产退料', value: '外协生产退料.totalQty', label: '合计数量' },
    ...outsourceMaterialReturnCustomOpts,
  ];
  const outsourceMaterialReturnRow: PrintFieldOption[] = [
    { group: '外协生产退料明细行', value: '行.index', label: '行序号' },
    { group: '外协生产退料明细行', value: '行.productName', label: '物料名称' },
    { group: '外协生产退料明细行', value: '行.sku', label: '物料SKU' },
    { group: '外协生产退料明细行', value: '行.quantity', label: '数量' },
    { group: '外协生产退料明细行', value: '行.unit', label: '单位' },
  ];
  const outsourceDispatchCustomOpts: PrintFieldOption[] = outsourceDispatchCustomFields.map(f => ({
    group: '外协发出',
    value: `外协发出.custom.${f.id}`,
    label: f.label,
  }));
  const outsourceDispatchHeader: PrintFieldOption[] = [
    { group: '外协发出', value: '外协发出.docNo', label: '单据号' },
    { group: '外协发出', value: '外协发出.partner', label: '外协工厂' },
    { group: '外协发出', value: '外协发出.operator', label: '经办人' },
    { group: '外协发出', value: '外协发出.timestamp', label: '业务时间' },
    { group: '外协发出', value: '外协发出.reason', label: '备注' },
    { group: '外协发出', value: '外协发出.totalQty', label: '合计数量' },
    ...outsourceDispatchCustomOpts,
  ];
  const outsourceDispatchRow: PrintFieldOption[] = [
    { group: '外协发出明细行', value: '行.index', label: '行序号' },
    { group: '外协发出明细行', value: '行.orderNumber', label: '工单号' },
    { group: '外协发出明细行', value: '行.productName', label: '产品名称' },
    { group: '外协发出明细行', value: '行.nodeName', label: '工序名称' },
    { group: '外协发出明细行', value: '行.variantLabel', label: '规格' },
    { group: '外协发出明细行', value: '行.quantity', label: '数量' },
  ];
  const outsourceReceiveCustomOpts: PrintFieldOption[] = outsourceReceiveCustomFields.map(f => ({
    group: '外协收回',
    value: `外协收回.custom.${f.id}`,
    label: f.label,
  }));
  const outsourceReceiveHeader: PrintFieldOption[] = [
    { group: '外协收回', value: '外协收回.docNo', label: '单据号' },
    { group: '外协收回', value: '外协收回.partner', label: '外协工厂' },
    { group: '外协收回', value: '外协收回.operator', label: '经办人' },
    { group: '外协收回', value: '外协收回.timestamp', label: '业务时间' },
    { group: '外协收回', value: '外协收回.reason', label: '备注' },
    { group: '外协收回', value: '外协收回.totalQty', label: '合计数量' },
    { group: '外协收回', value: '外协收回.totalAmount', label: '加工费合计（元）' },
    ...outsourceReceiveCustomOpts,
  ];
  const outsourceReceiveRow: PrintFieldOption[] = [
    { group: '外协收回明细行', value: '行.index', label: '行序号' },
    { group: '外协收回明细行', value: '行.orderNumber', label: '工单号' },
    { group: '外协收回明细行', value: '行.productName', label: '产品名称' },
    { group: '外协收回明细行', value: '行.nodeName', label: '工序名称' },
    { group: '外协收回明细行', value: '行.variantLabel', label: '规格' },
    { group: '外协收回明细行', value: '行.quantity', label: '数量' },
    { group: '外协收回明细行', value: '行.unitPrice', label: '单价（元）' },
    { group: '外协收回明细行', value: '行.amount', label: '金额（元）' },
  ];
  const defectTreatmentCustomOpts: PrintFieldOption[] = defectTreatmentCustomFields.map(f => ({
    group: '处理不良',
    value: `处理不良.custom.${f.id}`,
    label: f.label,
  }));
  const defectTreatmentHeader: PrintFieldOption[] = [
    { group: '处理不良', value: '处理不良.docNo', label: '单据号' },
    { group: '处理不良', value: '处理不良.typeLabel', label: '类型（返工/报损）' },
    { group: '处理不良', value: '处理不良.sourceNodeName', label: '来源工序' },
    { group: '处理不良', value: '处理不良.targetNodesLabel', label: '返工目标工序' },
    { group: '处理不良', value: '处理不良.totalQty', label: '合计数量' },
    { group: '处理不良', value: '处理不良.timestamp', label: '业务时间' },
    { group: '处理不良', value: '处理不良.operators', label: '操作人' },
    { group: '处理不良', value: '处理不良.reason', label: '原因/备注' },
    { group: '处理不良', value: '处理不良.orderNumber', label: '工单号' },
    { group: '处理不良', value: '处理不良.productName', label: '产品名称' },
    ...defectTreatmentCustomOpts,
  ];
  const defectTreatmentRow: PrintFieldOption[] = [
    { group: '处理不良明细行', value: '行.index', label: '行序号' },
    { group: '处理不良明细行', value: '行.variantLabel', label: '规格' },
    { group: '处理不良明细行', value: '行.quantity', label: '数量' },
  ];
  const reworkReportCustomOpts: PrintFieldOption[] = reworkReportCustomFields.map(f => ({
    group: '返工报工',
    value: `返工报工.custom.${f.id}`,
    label: f.label,
  }));
  const reworkReportHeader: PrintFieldOption[] = [
    { group: '返工报工', value: '返工报工.docNo', label: '单据号' },
    { group: '返工报工', value: '返工报工.nodeNames', label: '工序名称' },
    { group: '返工报工', value: '返工报工.sourceNodeName', label: '来源工序' },
    { group: '返工报工', value: '返工报工.totalQty', label: '合计数量' },
    { group: '返工报工', value: '返工报工.timestamp', label: '业务时间' },
    { group: '返工报工', value: '返工报工.operators', label: '操作人' },
    { group: '返工报工', value: '返工报工.workerName', label: '报工人员' },
    { group: '返工报工', value: '返工报工.equipmentName', label: '设备' },
    { group: '返工报工', value: '返工报工.unitPrice', label: '单价（元）' },
    { group: '返工报工', value: '返工报工.batchTotalAmount', label: '金额合计（元）' },
    { group: '返工报工', value: '返工报工.reason', label: '备注' },
    { group: '返工报工', value: '返工报工.orderNumber', label: '工单号' },
    { group: '返工报工', value: '返工报工.productName', label: '产品名称' },
    ...reworkReportCustomOpts,
  ];
  const reworkReportRow: PrintFieldOption[] = [
    { group: '返工报工明细行', value: '行.index', label: '行序号' },
    { group: '返工报工明细行', value: '行.variantLabel', label: '规格' },
    { group: '返工报工明细行', value: '行.quantity', label: '数量' },
    { group: '返工报工明细行', value: '行.nodeName', label: '工序' },
  ];
  const virtualBatchRow: PrintFieldOption[] = [
    { group: '批次码', value: '批次.scanUrl', label: '扫码URL（二维码内容）' },
    { group: '批次码', value: '批次.scanToken', label: '扫码Token' },
    { group: '批次码', value: '批次.sequenceNo', label: '批次序号（数字，计划内）' },
    { group: '批次码', value: '批次.serialLabel', label: '批次编号（B-计划单号-序号）' },
    { group: '批次码', value: '批次.quantity', label: '批次件数' },
    { group: '批次码', value: '批次.variantLabel', label: '规格文案（颜色+尺码）' },
    { group: '批次码', value: '批次.colorName', label: '颜色名称' },
    { group: '批次码', value: '批次.sizeName', label: '尺码名称' },
    { group: '批次码', value: '批次.planNumber', label: '计划单号' },
    { group: '批次码', value: '批次.orderNumbers', label: '关联工单号' },
    { group: '批次码', value: '批次.productName', label: '产品名称' },
    { group: '批次码', value: '批次.sku', label: 'SKU' },
    { group: '批次码', value: '批次.status', label: '批次状态' },
  ];
  return [
    ...system,
    ...plan,
    ...order,
    ...product,
    ...proc,
    ...listRow,
    ...salesBillBlock,
    ...salesBillRow,
    ...itemCodeRow,
    ...virtualBatchRow,
    ...reportBatchHeader,
    ...reportBatchRow,
    ...stockInHeader,
    ...stockInRow,
    ...materialIssueHeader,
    ...materialIssueRow,
    ...materialReturnHeader,
    ...materialReturnRow,
    ...outsourceMaterialIssueHeader,
    ...outsourceMaterialIssueRow,
    ...outsourceMaterialReturnHeader,
    ...outsourceMaterialReturnRow,
    ...outsourceDispatchHeader,
    ...outsourceDispatchRow,
    ...outsourceReceiveHeader,
    ...outsourceReceiveRow,
    ...defectTreatmentHeader,
    ...defectTreatmentRow,
    ...reworkReportHeader,
    ...reworkReportRow,
    ...purchaseOrderBlock,
    ...purchaseOrderDetailRow,
    ...salesOrderBlock,
    ...salesOrderDetailRow,
    ...purchaseBillBlock,
    ...purchaseBillDetailRow,
    ...receiptBlock,
    ...paymentBlock,
  ];
}

/**
 * 动态列表「插入字段」分组排序用：仅由模版纸张中的 `documentType` 决定。
 * 不限制 / all / undefined 时与历史默认一致为 `order`（产品专用列表不再单独配置）。
 */
export function printListDataSourceFromTemplate(
  documentType: PrintTemplateDocumentType | undefined,
): PrintDynamicListDataSource {
  if (
    documentType === 'plan' ||
    documentType === 'order' ||
    documentType === 'salesBill' ||
    documentType === 'productionMaterial' ||
    documentType === 'outsource' ||
    documentType === 'rework' ||
    documentType === 'purchaseOrder' ||
    documentType === 'purchaseBill' ||
    documentType === 'salesOrder'
  ) {
    return documentType;
  }
  return 'order';
}

const FIELD_GROUPS_BY_DOCUMENT: Record<Exclude<PrintTemplateDocumentType, 'all'>, ReadonlySet<string>> = {
  /**
   * 含「明细行」：计划单列表打印的 listRow 实际走 buildPlanPrintListRows → 销售单明细行结构
   *   （字段为 lineNo/sku/productName/qty 等，不是工单行 quantity/completedQuantity）。
   * 此处暂保留以维持历史模板编辑能力（至少 `行.index` 能通过 lineNo 间接生效）；
   * 但「明细行」组在 printFieldOptions 中的 label 写的是「(工单行)」，在计划场景会误导用户。
   * TODO: 改造 listRow 字段 label 为中性描述，或为 plan 引入独立行分组（如「计划明细」）。
   */
  plan: new Set(['系统', '计划', '产品', '明细行', '单品码行', '批次码']),
  order: new Set([
    '系统',
    '工单',
    '产品',
    '工序',
    '计划',
    '明细行',
    '报工',
    '报工明细行',
    '入库',
    '入库明细行',
  ]),
  /**
   * 含「计划」以便选用计划单自定义字段（打印时若有计划上下文则解析，否则为空）。
   * 不含「明细行」：该组字段 label 为「(工单行)」且销售单行字段名不兼容（销售单行用 qty/lineNo，
   * 不是 quantity/index）。销售单明细字段请从「销售单明细」组选择。
   */
  salesBill: new Set(['系统', '销售单', '销售单明细', '产品', '计划']),
  /** 生产物料详情打印；分组集合在 buildPrintFieldOptions 与 filter 中同步维护 */
  productionMaterial: new Set([
    '系统',
    '工单',
    '产品',
    '计划',
    '领料发出',
    '领料发出明细行',
    '生产退料',
    '生产退料明细行',
    '外协领料发出',
    '外协领料发出明细行',
    '外协生产退料',
    '外协生产退料明细行',
  ]),
  outsource: new Set([
    '系统',
    '工单',
    '产品',
    '计划',
    '外协发出',
    '外协发出明细行',
    '外协收回',
    '外协收回明细行',
  ]),
  rework: new Set([
    '系统',
    '工单',
    '产品',
    '计划',
    '工序',
    '明细行',
    '处理不良',
    '处理不良明细行',
    '返工报工',
    '返工报工明细行',
  ]),
  purchaseOrder: new Set(['系统', '采购订单', '采购订单明细', '产品']),
  salesOrder: new Set(['系统', '销售订单', '销售订单明细', '产品']),
  purchaseBill: new Set(['系统', '采购单', '采购单明细', '产品']),
  receipt: new Set(['系统', '收款单']),
  payment: new Set(['系统', '付款单']),
};

/** 按模板单据类型过滤插入字段弹层中的分组；all 或未设置则不过滤 */
export function filterPrintFieldOptionsByDocumentType(
  options: PrintFieldOption[],
  documentType: PrintTemplateDocumentType | undefined,
): PrintFieldOption[] {
  const dt = documentType ?? 'all';
  if (dt === 'all') return options;
  const allowed = FIELD_GROUPS_BY_DOCUMENT[dt];
  return options.filter(o => allowed.has(o.group));
}
