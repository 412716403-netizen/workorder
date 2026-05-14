/**
 * 租户打印模版与「系统层」逻辑的衔接点。
 * - 历史上 `builtin-outsource-dispatch-v1` 已移除，读/写时仍过滤该 id。
 * - `builtin-outsource-dispatch-v2`：统一下发「外协发出单」打印模版。
 * - `builtin-outsource-receive-v2`：统一下发「外协收回单」打印模版（含单价/金额列与合计金额）。
 * - `builtin-purchase-order-v2`：统一下发「采购订单」列表打印模版（布局同外协收回单；占位符 `采购订单.*`）。
 * - `builtin-sales-order-v2`：统一下发「销售订单」列表打印模版（占位符 `销售订单.*`）。
 * - `builtin-purchase-bill-v2`：统一下发进销存「采购单」（入库单）列表/详情打印模版（占位符 `采购单.*` = `purchaseBillPrint`）。
 * - `builtin-sales-bill-v2`：统一下发「销售单」（出库单）列表打印模版（占位符 `销售单.*`）。
 * - `builtin-material-issue-v1`：统一下发「领料发出单」生产物料详情打印（占位符 `领料发出.*`）。
 * - `builtin-material-return-v1`：统一下发「生产退料单」详情打印（占位符 `生产退料.*`）。
 * - `builtin-outsource-material-issue-v1`：统一下发「外协领料发出单」详情打印（占位符 `外协领料发出.*`）。
 * - `builtin-outsource-material-return-v1`：统一下发「外协生产退料单」详情打印（占位符 `外协生产退料.*`）。
 * - `builtin-rework-defect-treatment-v1`：统一下发「处理不良单」返工管理详情打印（占位符 `处理不良.*`，版式参考外协发出）。
 * - `builtin-rework-report-flow-v1`：统一下发「返工报工单」详情打印（占位符 `返工报工.*`，含工序列与颜色尺码矩阵）。
 * - `builtin-plan-list-v1`：统一下发「计划单」列表打印（A4；含颜色尺码矩阵与颜色×工序物料矩阵列）。
 * - `builtin-plan-label-v1`：统一下发「计划单品码」小标签打印（30×50mm，`planLabel`；10pt、货号色码左对齐、小二维码、边距 2mm；序列号下居中短横线）。
 * - `builtin-plan-batch-label-v1`：统一下发「计划批次码」小标签打印（30×50mm，`planLabel`；占位符 `批次.*`；与单品码标签版式类似，用于虚拟批次扫码标签）。
 * 以上合并进各租户 `printTemplates`；持久化写入时剔除，避免与代码副本重复落库。
 */

/** 已从产品中移除的系统模版 id */
const OBSOLETE_SYSTEM_PRINT_TEMPLATE_IDS = new Set(['builtin-outsource-dispatch-v1']);

/** 外协发出详情打印：统一下发模版 id（白名单、文档引用） */
export const BUILTIN_OUTSOURCE_DISPATCH_PRINT_TEMPLATE_ID = 'builtin-outsource-dispatch-v2' as const;

/** 外协收回详情打印：统一下发模版 id */
export const BUILTIN_OUTSOURCE_RECEIVE_PRINT_TEMPLATE_ID = 'builtin-outsource-receive-v2' as const;

/** 采购订单列表打印：统一下发模版 id */
export const BUILTIN_PURCHASE_ORDER_PRINT_TEMPLATE_ID = 'builtin-purchase-order-v2' as const;

/** 销售订单列表打印：统一下发模版 id */
export const BUILTIN_SALES_ORDER_PRINT_TEMPLATE_ID = 'builtin-sales-order-v2' as const;

/** 采购单（入库 / PURCHASE_BILL）列表打印：统一下发模版 id */
export const BUILTIN_PURCHASE_BILL_PRINT_TEMPLATE_ID = 'builtin-purchase-bill-v2' as const;

/** 销售单（出库 / SALES_BILL）列表打印：统一下发模版 id */
export const BUILTIN_SALES_BILL_PRINT_TEMPLATE_ID = 'builtin-sales-bill-v2' as const;

/** 生产物料：领料发出单详情打印 */
export const BUILTIN_MATERIAL_ISSUE_PRINT_TEMPLATE_ID = 'builtin-material-issue-v1' as const;
/** 生产物料：生产退料单详情打印 */
export const BUILTIN_MATERIAL_RETURN_PRINT_TEMPLATE_ID = 'builtin-material-return-v1' as const;
/** 生产物料：外协领料发出单详情打印 */
export const BUILTIN_OUTSOURCE_MATERIAL_ISSUE_PRINT_TEMPLATE_ID = 'builtin-outsource-material-issue-v1' as const;
/** 生产物料：外协生产退料单详情打印 */
export const BUILTIN_OUTSOURCE_MATERIAL_RETURN_PRINT_TEMPLATE_ID = 'builtin-outsource-material-return-v1' as const;

/** 返工管理：处理不良流水详情打印 */
export const BUILTIN_REWORK_DEFECT_TREATMENT_PRINT_TEMPLATE_ID = 'builtin-rework-defect-treatment-v1' as const;
/** 返工管理：返工报工流水详情打印 */
export const BUILTIN_REWORK_REPORT_FLOW_PRINT_TEMPLATE_ID = 'builtin-rework-report-flow-v1' as const;

/** 计划单列表打印：统一下发模版 id */
export const BUILTIN_PLAN_LIST_PRINT_TEMPLATE_ID = 'builtin-plan-list-v1' as const;

/** 计划单品码（标签）打印：统一下发模版 id */
export const BUILTIN_PLAN_LABEL_PRINT_TEMPLATE_ID = 'builtin-plan-label-v1' as const;

/** 计划批次码（标签）打印：统一下发模版 id */
export const BUILTIN_PLAN_BATCH_LABEL_PRINT_TEMPLATE_ID = 'builtin-plan-batch-label-v1' as const;

/** 由代码合并、不应写入租户 `printTemplates` 持久化的内置 id */
const MERGED_CODE_PRINT_TEMPLATE_IDS = new Set<string>([
  BUILTIN_OUTSOURCE_DISPATCH_PRINT_TEMPLATE_ID,
  BUILTIN_OUTSOURCE_RECEIVE_PRINT_TEMPLATE_ID,
  BUILTIN_PURCHASE_ORDER_PRINT_TEMPLATE_ID,
  BUILTIN_SALES_ORDER_PRINT_TEMPLATE_ID,
  BUILTIN_PURCHASE_BILL_PRINT_TEMPLATE_ID,
  BUILTIN_SALES_BILL_PRINT_TEMPLATE_ID,
  BUILTIN_MATERIAL_ISSUE_PRINT_TEMPLATE_ID,
  BUILTIN_MATERIAL_RETURN_PRINT_TEMPLATE_ID,
  BUILTIN_OUTSOURCE_MATERIAL_ISSUE_PRINT_TEMPLATE_ID,
  BUILTIN_OUTSOURCE_MATERIAL_RETURN_PRINT_TEMPLATE_ID,
  BUILTIN_REWORK_DEFECT_TREATMENT_PRINT_TEMPLATE_ID,
  BUILTIN_REWORK_REPORT_FLOW_PRINT_TEMPLATE_ID,
  BUILTIN_PLAN_LIST_PRINT_TEMPLATE_ID,
  BUILTIN_PLAN_LABEL_PRINT_TEMPLATE_ID,
  BUILTIN_PLAN_BATCH_LABEL_PRINT_TEMPLATE_ID,
]);

/** 锁定：租户不可删、编辑器走「系统模版」只读/复制为自有流程 */
export const SYSTEM_LOCKED_PRINT_TEMPLATE_IDS = [
  BUILTIN_OUTSOURCE_DISPATCH_PRINT_TEMPLATE_ID,
  BUILTIN_OUTSOURCE_RECEIVE_PRINT_TEMPLATE_ID,
  BUILTIN_PURCHASE_ORDER_PRINT_TEMPLATE_ID,
  BUILTIN_SALES_ORDER_PRINT_TEMPLATE_ID,
  BUILTIN_PURCHASE_BILL_PRINT_TEMPLATE_ID,
  BUILTIN_SALES_BILL_PRINT_TEMPLATE_ID,
  BUILTIN_MATERIAL_ISSUE_PRINT_TEMPLATE_ID,
  BUILTIN_MATERIAL_RETURN_PRINT_TEMPLATE_ID,
  BUILTIN_OUTSOURCE_MATERIAL_ISSUE_PRINT_TEMPLATE_ID,
  BUILTIN_OUTSOURCE_MATERIAL_RETURN_PRINT_TEMPLATE_ID,
  BUILTIN_REWORK_DEFECT_TREATMENT_PRINT_TEMPLATE_ID,
  BUILTIN_REWORK_REPORT_FLOW_PRINT_TEMPLATE_ID,
  BUILTIN_PLAN_LIST_PRINT_TEMPLATE_ID,
  BUILTIN_PLAN_LABEL_PRINT_TEMPLATE_ID,
  BUILTIN_PLAN_BATCH_LABEL_PRINT_TEMPLATE_ID,
] as const;

const LOCKED_SET = new Set<string>(SYSTEM_LOCKED_PRINT_TEMPLATE_IDS);

export function isSystemLockedPrintTemplateId(id: string | undefined): boolean {
  return id != null && LOCKED_SET.has(String(id).trim());
}

/** 系统统一下发或标记为系统模版：不可删除、不可直接可视化编辑保存（可复制为自有模版） */
export function isReadonlySystemPrintTemplate(t: { id: string; isSystemTemplate?: boolean } | null | undefined): boolean {
  if (!t?.id) return false;
  return t.isSystemTemplate === true || isSystemLockedPrintTemplateId(t.id);
}

/** 统一下发、租户只读（与 {@link isSystemLockedPrintTemplateId} 区分） */
export function isCodeMergedPrintTemplateId(id: string | undefined): boolean {
  return id != null && MERGED_CODE_PRINT_TEMPLATE_IDS.has(String(id).trim());
}

/**
 * 内置「外协发出单」241×140mm；数据源外协管理；占位符与产品约定一致。
 * `isSystemTemplate: true`：打印编辑器中不可直接改库内副本，可复制为自有模版。
 */
const BUILTIN_OUTSOURCE_DISPATCH_V2: Record<string, unknown> = {
  id: BUILTIN_OUTSOURCE_DISPATCH_PRINT_TEMPLATE_ID,
  name: '外协发出单（颜色尺码）',
  isSystemTemplate: true,
  documentType: 'outsource',
  printTemplateManageScope: 'outsourceDispatchFlowDetail',
  paperSize: { widthMm: 241, heightMm: 140 },
  paperMarginsMm: { top: 2, left: 2, right: 2, bottom: 2 },
  paperBackgroundColor: '#FFFFFF',
  elements: [
    {
      x: 87.4,
      y: 4.7,
      id: 'el-1777361215352-qucwb',
      type: 'text',
      width: 72.5,
      config: {
        color: '#111827',
        content: '{{租户.name}}外协发出单',
        textAlign: 'center',
        fontSizePt: 17,
        fontWeight: 'bold',
      },
      height: 8.8,
      zIndex: 1,
    },
    {
      x: 184,
      y: 5.8,
      id: 'el-1777361341143-x2t0k',
      type: 'text',
      width: 47,
      config: {
        color: '#111827',
        content: '{{系统.pageCurrent}}/{{系统.pageTotal}}页\n{{外协发出.timestamp}}\nNO：{{外协发出.docNo}}',
        textAlign: 'right',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 13.5,
      zIndex: 2,
    },
    {
      x: 8.5,
      y: 13.7,
      id: 'el-1777361557093-n7akx',
      type: 'text',
      width: 60,
      config: {
        color: '#111827',
        content: '外协工厂：{{外协发出.partner}}',
        textAlign: 'left',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 10,
      zIndex: 3,
    },
    {
      x: 6.4,
      y: 20.4,
      id: 'el-1777361573486-t3d68',
      type: 'dynamicList',
      width: 226.3,
      config: {
        serialColumnWidthMm: 12,
        columns: [
          {
            id: 'el-1777361573486-4fcyp',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '产品',
            contentTemplate: '{{行.productName}}',
          },
          {
            id: 'el-1777361573486-qsoe0',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '货号',
            contentTemplate: '{{行.sku}}',
          },
          {
            id: 'el-1777361573486-r4ce8',
            color: '#000000',
            cellKind: 'colorSizeMatrix',
            textAlign: 'center',
            headerLabel: '列3',
            contentTemplate: '',
            matrixColorHeader: '颜色',
            matrixSizeGroupTitle: '尺码数量',
          },
          {
            id: 'el-1777361610679-mbx9c',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '数量',
            contentTemplate: '{{行.quantity}}',
          },
        ],
        fontSizePt: 10,
        showHeader: true,
        showSerial: true,
        borderColor: '#000000',
        borderStyle: 'solid',
        dataColumnCount: 4,
        headerFontSizePt: 12,
        serialHeaderLabel: '序号',
        dataColumnWidthsMm: [0, 0, 0, 0],
        headerBackgroundColor: '#f1f5f9',
      },
      height: 35.7,
      zIndex: 4,
    },
    {
      x: 211.4,
      y: 45.2,
      id: 'el-1777361840023-4fdh2',
      type: 'text',
      width: 20.2,
      config: {
        color: '#111827',
        content: '合计：{{外协发出.totalQty}}',
        textAlign: 'right',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 7,
      zIndex: 5,
    },
  ],
  createdAt: '2026-04-28T07:26:36.546Z',
  updatedAt: '2026-04-28T07:39:27.751Z',
};

/** 内置「外协收回单」：动态列含单价、金额；表尾含合计数量与加工费合计。 */
const BUILTIN_OUTSOURCE_RECEIVE_V2: Record<string, unknown> = {
  id: BUILTIN_OUTSOURCE_RECEIVE_PRINT_TEMPLATE_ID,
  name: '外协收回单（颜色尺码）',
  isSystemTemplate: true,
  documentType: 'outsource',
  printTemplateManageScope: 'outsourceReceiveFlowDetail',
  paperSize: { widthMm: 241, heightMm: 140 },
  paperMarginsMm: { top: 2, left: 2, right: 2, bottom: 2 },
  paperBackgroundColor: '#FFFFFF',
  elements: [
    {
      x: 87.4,
      y: 4.7,
      id: 'el-builtin-recv-title',
      type: 'text',
      width: 72.5,
      config: {
        color: '#111827',
        content: '{{租户.name}}外协收回单',
        textAlign: 'center',
        fontSizePt: 17,
        fontWeight: 'bold',
      },
      height: 8.8,
      zIndex: 1,
    },
    {
      x: 184,
      y: 5.8,
      id: 'el-builtin-recv-meta',
      type: 'text',
      width: 47,
      config: {
        color: '#111827',
        content: '{{系统.pageCurrent}}/{{系统.pageTotal}}页\n{{外协收回.timestamp}}\nNO：{{外协收回.docNo}}',
        textAlign: 'right',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 13.5,
      zIndex: 2,
    },
    {
      x: 8.5,
      y: 13.7,
      id: 'el-builtin-recv-partner',
      type: 'text',
      width: 120,
      config: {
        color: '#111827',
        content: '外协工厂：{{外协收回.partner}}',
        textAlign: 'left',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 10,
      zIndex: 3,
    },
    {
      x: 6.4,
      y: 20.4,
      id: 'el-builtin-recv-list',
      type: 'dynamicList',
      width: 226.3,
      config: {
        serialColumnWidthMm: 12,
        columns: [
          {
            id: 'el-builtin-recv-col-pn',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '产品',
            contentTemplate: '{{行.productName}}',
          },
          {
            id: 'el-builtin-recv-col-sku',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '货号',
            contentTemplate: '{{行.sku}}',
          },
          {
            id: 'el-builtin-recv-col-mx',
            color: '#000000',
            cellKind: 'colorSizeMatrix',
            textAlign: 'center',
            headerLabel: '规格',
            contentTemplate: '',
            matrixColorHeader: '颜色',
            matrixSizeGroupTitle: '尺码数量',
          },
          {
            id: 'el-builtin-recv-col-qty',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '数量',
            contentTemplate: '{{行.quantity}}',
          },
          {
            id: 'el-builtin-recv-col-up',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '单价',
            contentTemplate: '{{行.unitPrice}}',
          },
          {
            id: 'el-builtin-recv-col-amt',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '金额',
            contentTemplate: '{{行.amount}}',
          },
        ],
        fontSizePt: 8,
        showHeader: true,
        showSerial: true,
        borderColor: '#000000',
        borderStyle: 'solid',
        dataColumnCount: 6,
        headerFontSizePt: 9,
        serialHeaderLabel: '序号',
        dataColumnWidthsMm: [0, 0, 0, 0, 0, 0],
        headerBackgroundColor: '#f1f5f9',
      },
      height: 35.7,
      zIndex: 4,
    },
    {
      x: 120,
      y: 45.2,
      id: 'el-builtin-recv-footer',
      type: 'text',
      width: 112,
      config: {
        color: '#111827',
        content: '合计数量：{{外协收回.totalQty}}\n总金额：{{外协收回.totalAmount}}元',
        textAlign: 'right',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 10,
      zIndex: 5,
    },
  ],
  createdAt: '2026-04-28T08:00:00.000Z',
  updatedAt: '2026-04-28T08:00:00.000Z',
};

/** 内置「采购单」列表打印：版式同外协收回单；合作方文案为「供应商」。 */
const BUILTIN_PURCHASE_ORDER_V2: Record<string, unknown> = {
  id: BUILTIN_PURCHASE_ORDER_PRINT_TEMPLATE_ID,
  name: '采购订单（颜色尺码）',
  isSystemTemplate: true,
  documentType: 'purchaseOrder',
  printTemplateManageScope: 'purchaseOrderList',
  paperSize: { widthMm: 241, heightMm: 140 },
  paperMarginsMm: { top: 2, left: 2, right: 2, bottom: 2 },
  paperBackgroundColor: '#FFFFFF',
  elements: [
    {
      x: 87.4,
      y: 4.7,
      id: 'el-builtin-po-title',
      type: 'text',
      width: 72.5,
      config: {
        color: '#111827',
        content: '{{租户.name}}采购单',
        textAlign: 'center',
        fontSizePt: 17,
        fontWeight: 'bold',
      },
      height: 8.8,
      zIndex: 1,
    },
    {
      x: 184,
      y: 5.8,
      id: 'el-builtin-po-meta',
      type: 'text',
      width: 47,
      config: {
        color: '#111827',
        content: '{{系统.pageCurrent}}/{{系统.pageTotal}}页\n{{系统.systemTime}}\nNO：{{采购订单.docNumber}}',
        textAlign: 'right',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 13.5,
      zIndex: 2,
    },
    {
      x: 8.5,
      y: 13.7,
      id: 'el-builtin-po-partner',
      type: 'text',
      width: 120,
      config: {
        color: '#111827',
        content: '供应商：{{采购订单.partner}}',
        textAlign: 'left',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 10,
      zIndex: 3,
    },
    {
      x: 6.4,
      y: 20.4,
      id: 'el-builtin-po-list',
      type: 'dynamicList',
      width: 226.3,
      config: {
        serialColumnWidthMm: 12,
        columns: [
          {
            id: 'el-builtin-po-col-pn',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '产品',
            contentTemplate: '{{行.productName}}',
          },
          {
            id: 'el-builtin-po-col-sku',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '货号',
            contentTemplate: '{{行.sku}}',
          },
          {
            id: 'el-builtin-po-col-mx',
            color: '#000000',
            cellKind: 'colorSizeMatrix',
            textAlign: 'center',
            headerLabel: '规格',
            contentTemplate: '',
            matrixColorHeader: '颜色',
            matrixSizeGroupTitle: '尺码数量',
          },
          {
            id: 'el-builtin-po-col-qty',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '数量',
            contentTemplate: '{{行.qty}}',
          },
          {
            id: 'el-builtin-po-col-up',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '单价',
            contentTemplate: '{{行.unitPrice}}',
          },
          {
            id: 'el-builtin-po-col-amt',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '金额',
            contentTemplate: '{{行.amount}}',
          },
        ],
        fontSizePt: 8,
        showHeader: true,
        showSerial: true,
        borderColor: '#000000',
        borderStyle: 'solid',
        dataColumnCount: 6,
        headerFontSizePt: 9,
        serialHeaderLabel: '序号',
        dataColumnWidthsMm: [0, 0, 0, 0, 0, 0],
        headerBackgroundColor: '#f1f5f9',
      },
      height: 35.7,
      zIndex: 4,
    },
    {
      x: 120,
      y: 45.2,
      id: 'el-builtin-po-footer',
      type: 'text',
      width: 112,
      config: {
        color: '#111827',
        content: '合计数量：{{采购订单.docTotalQty}}\n总金额：{{采购订单.docTotalAmount}}元',
        textAlign: 'right',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 10,
      zIndex: 5,
    },
  ],
  createdAt: '2026-04-28T10:00:00.000Z',
  updatedAt: '2026-04-28T10:00:00.000Z',
};

/** 内置「销售单」列表打印：版式同外协收回单；合作方文案为「客户」。 */
const BUILTIN_SALES_ORDER_V2: Record<string, unknown> = {
  id: BUILTIN_SALES_ORDER_PRINT_TEMPLATE_ID,
  name: '销售订单（颜色尺码）',
  isSystemTemplate: true,
  documentType: 'salesOrder',
  printTemplateManageScope: 'salesOrderList',
  paperSize: { widthMm: 241, heightMm: 140 },
  paperMarginsMm: { top: 2, left: 2, right: 2, bottom: 2 },
  paperBackgroundColor: '#FFFFFF',
  elements: [
    {
      x: 87.4,
      y: 4.7,
      id: 'el-builtin-so-title',
      type: 'text',
      width: 72.5,
      config: {
        color: '#111827',
        content: '{{租户.name}}销售单',
        textAlign: 'center',
        fontSizePt: 17,
        fontWeight: 'bold',
      },
      height: 8.8,
      zIndex: 1,
    },
    {
      x: 184,
      y: 5.8,
      id: 'el-builtin-so-meta',
      type: 'text',
      width: 47,
      config: {
        color: '#111827',
        content: '{{系统.pageCurrent}}/{{系统.pageTotal}}页\n{{系统.systemTime}}\nNO：{{销售订单.docNumber}}',
        textAlign: 'right',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 13.5,
      zIndex: 2,
    },
    {
      x: 8.5,
      y: 13.7,
      id: 'el-builtin-so-partner',
      type: 'text',
      width: 120,
      config: {
        color: '#111827',
        content: '客户：{{销售订单.partner}}',
        textAlign: 'left',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 10,
      zIndex: 3,
    },
    {
      x: 6.4,
      y: 20.4,
      id: 'el-builtin-so-list',
      type: 'dynamicList',
      width: 226.3,
      config: {
        serialColumnWidthMm: 12,
        columns: [
          {
            id: 'el-builtin-so-col-pn',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '产品',
            contentTemplate: '{{行.productName}}',
          },
          {
            id: 'el-builtin-so-col-sku',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '货号',
            contentTemplate: '{{行.sku}}',
          },
          {
            id: 'el-builtin-so-col-mx',
            color: '#000000',
            cellKind: 'colorSizeMatrix',
            textAlign: 'center',
            headerLabel: '规格',
            contentTemplate: '',
            matrixColorHeader: '颜色',
            matrixSizeGroupTitle: '尺码数量',
          },
          {
            id: 'el-builtin-so-col-qty',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '数量',
            contentTemplate: '{{行.qty}}',
          },
          {
            id: 'el-builtin-so-col-up',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '单价',
            contentTemplate: '{{行.unitPrice}}',
          },
          {
            id: 'el-builtin-so-col-amt',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '金额',
            contentTemplate: '{{行.amount}}',
          },
        ],
        fontSizePt: 8,
        showHeader: true,
        showSerial: true,
        borderColor: '#000000',
        borderStyle: 'solid',
        dataColumnCount: 6,
        headerFontSizePt: 9,
        serialHeaderLabel: '序号',
        dataColumnWidthsMm: [0, 0, 0, 0, 0, 0],
        headerBackgroundColor: '#f1f5f9',
      },
      height: 35.7,
      zIndex: 4,
    },
    {
      x: 120,
      y: 45.2,
      id: 'el-builtin-so-footer',
      type: 'text',
      width: 112,
      config: {
        color: '#111827',
        content: '合计数量：{{销售订单.docTotalQty}}\n总金额：{{销售订单.docTotalAmount}}元',
        textAlign: 'right',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 10,
      zIndex: 5,
    },
  ],
  createdAt: '2026-04-28T10:00:00.000Z',
  updatedAt: '2026-04-28T10:00:00.000Z',
};

/** 进销存「采购单」入库：版式同外协收回单；`documentType` 为采购单以便本入口列表展示。 */
const BUILTIN_PURCHASE_BILL_V2: Record<string, unknown> = {
  id: BUILTIN_PURCHASE_BILL_PRINT_TEMPLATE_ID,
  name: '采购单（颜色尺码）',
  isSystemTemplate: true,
  documentType: 'purchaseBill',
  printTemplateManageScope: 'purchaseBillList',
  paperSize: { widthMm: 241, heightMm: 140 },
  paperMarginsMm: { top: 2, left: 2, right: 2, bottom: 2 },
  paperBackgroundColor: '#FFFFFF',
  elements: [
    {
      x: 87.4,
      y: 4.7,
      id: 'el-builtin-pb-title',
      type: 'text',
      width: 72.5,
      config: {
        color: '#111827',
        content: '{{租户.name}}采购单',
        textAlign: 'center',
        fontSizePt: 17,
        fontWeight: 'bold',
      },
      height: 8.8,
      zIndex: 1,
    },
    {
      x: 184,
      y: 5.8,
      id: 'el-builtin-pb-meta',
      type: 'text',
      width: 47,
      config: {
        color: '#111827',
        content: '{{系统.pageCurrent}}/{{系统.pageTotal}}页\n{{系统.systemTime}}\nNO：{{采购单.docNumber}}',
        textAlign: 'right',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 13.5,
      zIndex: 2,
    },
    {
      x: 8.5,
      y: 13.7,
      id: 'el-builtin-pb-partner',
      type: 'text',
      width: 160,
      config: {
        color: '#111827',
        content: '供应商：{{采购单.partner}}\n入库仓库：{{采购单.warehouseName}}',
        textAlign: 'left',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 12,
      zIndex: 3,
    },
    {
      x: 6.4,
      y: 25.5,
      id: 'el-builtin-pb-list',
      type: 'dynamicList',
      width: 226.3,
      config: {
        serialColumnWidthMm: 12,
        columns: [
          {
            id: 'el-builtin-pb-col-pn',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '产品',
            contentTemplate: '{{行.productName}}',
          },
          {
            id: 'el-builtin-pb-col-sku',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '货号',
            contentTemplate: '{{行.sku}}',
          },
          {
            id: 'el-builtin-pb-col-mx',
            color: '#000000',
            cellKind: 'colorSizeMatrix',
            textAlign: 'center',
            headerLabel: '规格',
            contentTemplate: '',
            matrixColorHeader: '颜色',
            matrixSizeGroupTitle: '尺码数量',
          },
          {
            id: 'el-builtin-pb-col-qty',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '数量',
            contentTemplate: '{{行.qty}}',
          },
          {
            id: 'el-builtin-pb-col-up',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '单价',
            contentTemplate: '{{行.unitPrice}}',
          },
          {
            id: 'el-builtin-pb-col-amt',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '金额',
            contentTemplate: '{{行.amount}}',
          },
        ],
        fontSizePt: 8,
        showHeader: true,
        showSerial: true,
        borderColor: '#000000',
        borderStyle: 'solid',
        dataColumnCount: 6,
        headerFontSizePt: 9,
        serialHeaderLabel: '序号',
        dataColumnWidthsMm: [0, 0, 0, 0, 0, 0],
        headerBackgroundColor: '#f1f5f9',
      },
      height: 32,
      zIndex: 4,
    },
    {
      x: 120,
      y: 45.2,
      id: 'el-builtin-pb-footer',
      type: 'text',
      width: 112,
      config: {
        color: '#111827',
        content: '合计数量：{{采购单.docTotalQty}}\n总金额：{{采购单.docTotalAmount}}元',
        textAlign: 'right',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 10,
      zIndex: 5,
    },
  ],
  createdAt: '2026-04-28T12:00:00.000Z',
  updatedAt: '2026-04-28T12:00:00.000Z',
};

/** 进销存「销售单」出库：版式同上；占位符 `销售单.*`。 */
const BUILTIN_SALES_BILL_V2: Record<string, unknown> = {
  id: BUILTIN_SALES_BILL_PRINT_TEMPLATE_ID,
  name: '销售单（颜色尺码）',
  isSystemTemplate: true,
  documentType: 'salesBill',
  printTemplateManageScope: 'salesBillList',
  paperSize: { widthMm: 241, heightMm: 140 },
  paperMarginsMm: { top: 2, left: 2, right: 2, bottom: 2 },
  paperBackgroundColor: '#FFFFFF',
  elements: [
    {
      x: 87.4,
      y: 4.7,
      id: 'el-builtin-sb-title',
      type: 'text',
      width: 72.5,
      config: {
        color: '#111827',
        content: '{{租户.name}}销售单',
        textAlign: 'center',
        fontSizePt: 17,
        fontWeight: 'bold',
      },
      height: 8.8,
      zIndex: 1,
    },
    {
      x: 184,
      y: 5.8,
      id: 'el-builtin-sb-meta',
      type: 'text',
      width: 47,
      config: {
        color: '#111827',
        content: '{{系统.pageCurrent}}/{{系统.pageTotal}}页\n{{系统.systemTime}}\nNO：{{销售单.docNumber}}',
        textAlign: 'right',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 13.5,
      zIndex: 2,
    },
    {
      x: 8.5,
      y: 13.7,
      id: 'el-builtin-sb-partner',
      type: 'text',
      width: 160,
      config: {
        color: '#111827',
        content: '客户：{{销售单.partner}}\n出库仓库：{{销售单.warehouseName}}',
        textAlign: 'left',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 12,
      zIndex: 3,
    },
    {
      x: 6.4,
      y: 25.5,
      id: 'el-builtin-sb-list',
      type: 'dynamicList',
      width: 226.3,
      config: {
        serialColumnWidthMm: 12,
        columns: [
          {
            id: 'el-builtin-sb-col-pn',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '产品',
            contentTemplate: '{{行.productName}}',
          },
          {
            id: 'el-builtin-sb-col-sku',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '货号',
            contentTemplate: '{{行.sku}}',
          },
          {
            id: 'el-builtin-sb-col-mx',
            color: '#000000',
            cellKind: 'colorSizeMatrix',
            textAlign: 'center',
            headerLabel: '规格',
            contentTemplate: '',
            matrixColorHeader: '颜色',
            matrixSizeGroupTitle: '尺码数量',
          },
          {
            id: 'el-builtin-sb-col-qty',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '数量',
            contentTemplate: '{{行.qty}}',
          },
          {
            id: 'el-builtin-sb-col-up',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '单价',
            contentTemplate: '{{行.unitPrice}}',
          },
          {
            id: 'el-builtin-sb-col-amt',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '金额',
            contentTemplate: '{{行.amount}}',
          },
        ],
        fontSizePt: 8,
        showHeader: true,
        showSerial: true,
        borderColor: '#000000',
        borderStyle: 'solid',
        dataColumnCount: 6,
        headerFontSizePt: 9,
        serialHeaderLabel: '序号',
        dataColumnWidthsMm: [0, 0, 0, 0, 0, 0],
        headerBackgroundColor: '#f1f5f9',
      },
      height: 32,
      zIndex: 4,
    },
    {
      x: 120,
      y: 45.2,
      id: 'el-builtin-sb-footer',
      type: 'text',
      width: 112,
      config: {
        color: '#111827',
        content: '合计数量：{{销售单.docTotalQty}}\n总金额：{{销售单.docTotalAmount}}元',
        textAlign: 'right',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 10,
      zIndex: 5,
    },
  ],
  createdAt: '2026-04-28T12:00:00.000Z',
  updatedAt: '2026-04-28T12:00:00.000Z',
};

/** 241×140mm；与租户侧「领料发出单」版式一致；扁平行明细（产品 / SKU / 数量 / 批次） */
const BUILTIN_MATERIAL_ISSUE_V1: Record<string, unknown> = {
  id: BUILTIN_MATERIAL_ISSUE_PRINT_TEMPLATE_ID,
  name: '领料发出单',
  isSystemTemplate: true,
  documentType: 'productionMaterial',
  printTemplateManageScope: 'materialIssueFlowDetail',
  paperSize: { widthMm: 241, heightMm: 140 },
  paperMarginsMm: { top: 2, left: 2, right: 2, bottom: 2 },
  paperBackgroundColor: '#FFFFFF',
  elements: [
    {
      x: 20.5,
      y: 3.5,
      id: 'el-builtin-mat-issue-title',
      type: 'text',
      width: 200,
      config: {
        color: '#111827',
        content: '{{租户.name}}领料发出单',
        textAlign: 'center',
        fontSizePt: 17,
        fontWeight: 'bold',
      },
      height: 9,
      zIndex: 1,
    },
    {
      x: 15.2,
      y: 27,
      id: 'el-builtin-mat-issue-list',
      type: 'dynamicList',
      width: 213.4,
      config: {
        columns: [
          {
            id: 'el-builtin-mat-issue-col-pn',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '产品',
            contentTemplate: '{{行.productName}}',
          },
          {
            id: 'el-builtin-mat-issue-col-sku',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '产品编号',
            contentTemplate: '{{行.sku}}',
          },
          {
            id: 'el-builtin-mat-issue-col-qty',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '数量',
            contentTemplate: '{{行.quantity}}',
          },
          {
            id: 'el-builtin-mat-issue-col-batch',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '批次',
            contentTemplate: '{{行.batchNo}}',
          },
        ],
        fontSizePt: 10,
        showHeader: true,
        showSerial: true,
        borderColor: '#000000',
        borderStyle: 'solid',
        dataColumnCount: 4,
        headerFontSizePt: 12,
        serialHeaderLabel: '序号',
        serialColumnWidthMm: 12,
        dataColumnWidthsMm: [0, 0, 0, 0],
        headerBackgroundColor: '#f1f5f9',
      },
      height: 18.2,
      zIndex: 2,
    },
    {
      x: 15.1,
      y: 14.5,
      id: 'el-builtin-mat-issue-wh',
      type: 'text',
      width: 60,
      config: {
        color: '#111827',
        content: '出库仓库：{{领料发出.warehouseName}}',
        textAlign: 'left',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 10,
      zIndex: 3,
    },
    {
      x: 168.7,
      y: 5.5,
      id: 'el-builtin-mat-issue-meta',
      type: 'text',
      width: 59.1,
      config: {
        color: '#111827',
        content: '{{系统.pageCurrent}}/{{系统.pageTotal}}页\n{{领料发出.timestamp}}\n{{领料发出.docNo}}',
        textAlign: 'right',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 14.7,
      zIndex: 4,
    },
    {
      x: 168.2,
      y: 51,
      id: 'el-builtin-mat-issue-footer',
      type: 'text',
      width: 60,
      config: {
        color: '#111827',
        content: '合计：{{领料发出.totalQty}}',
        textAlign: 'right',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 10,
      zIndex: 5,
    },
  ],
  createdAt: '2026-04-28T09:45:51.301Z',
  updatedAt: '2026-04-28T10:08:00.000Z',
};

/** 同领料发出版式；占位符 `生产退料.*`；退料明细可为颜色尺码矩阵行 */
const BUILTIN_MATERIAL_RETURN_V1: Record<string, unknown> = {
  ...BUILTIN_MATERIAL_ISSUE_V1,
  id: BUILTIN_MATERIAL_RETURN_PRINT_TEMPLATE_ID,
  name: '生产退料单',
  printTemplateManageScope: 'materialReturnFlowDetail',
  elements: (BUILTIN_MATERIAL_ISSUE_V1.elements as object[]).map((el, i) => {
    const copy = JSON.parse(JSON.stringify(el)) as Record<string, unknown>;
    if (i === 0 && copy.config && typeof copy.config === 'object') {
      (copy.config as Record<string, unknown>).content = '{{租户.name}}生产退料单';
    }
    if (i === 2 && copy.config && typeof copy.config === 'object') {
      (copy.config as Record<string, unknown>).content = '出库仓库：{{生产退料.warehouseName}}';
    }
    if (i === 3 && copy.config && typeof copy.config === 'object') {
      (copy.config as Record<string, unknown>).content =
        '{{系统.pageCurrent}}/{{系统.pageTotal}}页\n{{生产退料.timestamp}}\n{{生产退料.docNo}}';
    }
    if (i === 4 && copy.config && typeof copy.config === 'object') {
      (copy.config as Record<string, unknown>).content = '合计：{{生产退料.totalQty}}';
    }
    if (typeof copy.id === 'string') copy.id = copy.id.replace('mat-issue', 'mat-return');
    return copy;
  }),
};

/** 外协加工厂领料发出；表头含仓库与加工厂 */
const BUILTIN_OUTSOURCE_MATERIAL_ISSUE_V1: Record<string, unknown> = {
  ...BUILTIN_MATERIAL_ISSUE_V1,
  id: BUILTIN_OUTSOURCE_MATERIAL_ISSUE_PRINT_TEMPLATE_ID,
  name: '外协领料发出单',
  printTemplateManageScope: 'materialOutsourceIssueFlowDetail',
  elements: (BUILTIN_MATERIAL_ISSUE_V1.elements as object[]).map((el, i) => {
    const copy = JSON.parse(JSON.stringify(el)) as Record<string, unknown>;
    if (i === 0 && copy.config && typeof copy.config === 'object') {
      (copy.config as Record<string, unknown>).content = '{{租户.name}}外协领料发出单';
    }
    if (i === 2 && copy.config && typeof copy.config === 'object') {
      (copy.config as Record<string, unknown>).content =
        '出库仓库：{{外协领料发出.warehouseName}}\n外协工厂：{{外协领料发出.partner}}';
      (copy.config as Record<string, unknown>).textAlign = 'left';
      copy.width = 100;
    }
    if (i === 3 && copy.config && typeof copy.config === 'object') {
      (copy.config as Record<string, unknown>).content =
        '{{系统.pageCurrent}}/{{系统.pageTotal}}页\n{{外协领料发出.timestamp}}\n{{外协领料发出.docNo}}';
    }
    if (i === 4 && copy.config && typeof copy.config === 'object') {
      (copy.config as Record<string, unknown>).content = '合计：{{外协领料发出.totalQty}}';
    }
    if (typeof copy.id === 'string') copy.id = copy.id.replace('mat-issue', 'os-mat-issue');
    return copy;
  }),
};

/** 外协加工厂生产退料 */
const BUILTIN_OUTSOURCE_MATERIAL_RETURN_V1: Record<string, unknown> = {
  ...BUILTIN_MATERIAL_ISSUE_V1,
  id: BUILTIN_OUTSOURCE_MATERIAL_RETURN_PRINT_TEMPLATE_ID,
  name: '外协生产退料单',
  printTemplateManageScope: 'materialOutsourceReturnFlowDetail',
  elements: (BUILTIN_MATERIAL_ISSUE_V1.elements as object[]).map((el, i) => {
    const copy = JSON.parse(JSON.stringify(el)) as Record<string, unknown>;
    if (i === 0 && copy.config && typeof copy.config === 'object') {
      (copy.config as Record<string, unknown>).content = '{{租户.name}}外协生产退料单';
    }
    if (i === 2 && copy.config && typeof copy.config === 'object') {
      (copy.config as Record<string, unknown>).content =
        '出库仓库：{{外协生产退料.warehouseName}}\n外协工厂：{{外协生产退料.partner}}';
      copy.width = 100;
    }
    if (i === 3 && copy.config && typeof copy.config === 'object') {
      (copy.config as Record<string, unknown>).content =
        '{{系统.pageCurrent}}/{{系统.pageTotal}}页\n{{外协生产退料.timestamp}}\n{{外协生产退料.docNo}}';
    }
    if (i === 4 && copy.config && typeof copy.config === 'object') {
      (copy.config as Record<string, unknown>).content = '合计：{{外协生产退料.totalQty}}';
    }
    if (typeof copy.id === 'string') copy.id = copy.id.replace('mat-issue', 'os-mat-return');
    return copy;
  }),
};

/** 处理不良单：241×140mm；版式对齐外协发出（标题 / 右上元信息 / 摘要 / 动态列表 / 合计） */
const BUILTIN_REWORK_DEFECT_TREATMENT_V1: Record<string, unknown> = {
  id: BUILTIN_REWORK_DEFECT_TREATMENT_PRINT_TEMPLATE_ID,
  name: '处理不良单（颜色尺码）',
  isSystemTemplate: true,
  documentType: 'rework',
  printTemplateManageScope: 'defectTreatmentFlowDetail',
  paperSize: { widthMm: 241, heightMm: 140 },
  paperMarginsMm: { top: 2, left: 2, right: 2, bottom: 2 },
  paperBackgroundColor: '#FFFFFF',
  elements: [
    {
      x: 20.5,
      y: 4.7,
      id: 'el-builtin-rework-defect-title',
      type: 'text',
      width: 200,
      config: {
        color: '#111827',
        content: '{{租户.name}}处理不良单',
        textAlign: 'center',
        fontSizePt: 17,
        fontWeight: 'bold',
      },
      height: 8.8,
      zIndex: 1,
    },
    {
      x: 184,
      y: 5.8,
      id: 'el-builtin-rework-defect-meta',
      type: 'text',
      width: 47,
      config: {
        color: '#111827',
        content: '{{系统.pageCurrent}}/{{系统.pageTotal}}页\n{{处理不良.timestamp}}\nNO：{{处理不良.docNo}}',
        textAlign: 'right',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 13.5,
      zIndex: 2,
    },
    {
      x: 8.5,
      y: 13.7,
      id: 'el-builtin-rework-defect-summary',
      type: 'text',
      width: 155,
      config: {
        color: '#111827',
        content: '{{处理不良.outsourceFactoryBlock}}目标工序：{{处理不良.targetNodesLabel}}',
        textAlign: 'left',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 10,
      zIndex: 3,
    },
    {
      x: 6.4,
      y: 24,
      id: 'el-builtin-rework-defect-list',
      type: 'dynamicList',
      width: 226.3,
      config: {
        serialColumnWidthMm: 12,
        columns: [
          {
            id: 'el-builtin-rework-defect-col-pn',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '产品',
            contentTemplate: '{{行.productName}}',
          },
          {
            id: 'el-builtin-rework-defect-col-sku',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '货号',
            contentTemplate: '{{行.sku}}',
          },
          {
            id: 'el-builtin-rework-defect-col-mx',
            color: '#000000',
            cellKind: 'colorSizeMatrix',
            textAlign: 'center',
            headerLabel: '规格',
            contentTemplate: '',
            matrixColorHeader: '颜色',
            matrixSizeGroupTitle: '尺码数量',
          },
          {
            id: 'el-builtin-rework-defect-col-qty',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '数量',
            contentTemplate: '{{行.quantity}}',
          },
        ],
        fontSizePt: 10,
        showHeader: true,
        showSerial: true,
        borderColor: '#000000',
        borderStyle: 'solid',
        dataColumnCount: 4,
        headerFontSizePt: 12,
        serialHeaderLabel: '序号',
        dataColumnWidthsMm: [0, 0, 0, 0],
        headerBackgroundColor: '#f1f5f9',
      },
      height: 35.7,
      zIndex: 4,
    },
    {
      x: 211.4,
      y: 45.2,
      id: 'el-builtin-rework-defect-footer',
      type: 'text',
      width: 20.2,
      config: {
        color: '#111827',
        content: '合计：{{处理不良.totalQty}}',
        textAlign: 'right',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 7,
      zIndex: 5,
    },
  ],
  createdAt: '2026-04-28T12:30:00.000Z',
  updatedAt: '2026-04-28T12:30:00.000Z',
};

/** 返工报工单：含工序列 + 颜色尺码矩阵；表头仅右上元信息与左上角外协厂/操作人摘要 */
const BUILTIN_REWORK_REPORT_FLOW_V1: Record<string, unknown> = {
  id: BUILTIN_REWORK_REPORT_FLOW_PRINT_TEMPLATE_ID,
  name: '返工报工单（颜色尺码）',
  isSystemTemplate: true,
  documentType: 'rework',
  printTemplateManageScope: 'reworkReportFlowDetail',
  paperSize: { widthMm: 241, heightMm: 140 },
  paperMarginsMm: { top: 2, left: 2, right: 2, bottom: 2 },
  paperBackgroundColor: '#FFFFFF',
  elements: [
    {
      x: 20.5,
      y: 4.7,
      id: 'el-builtin-rework-report-title',
      type: 'text',
      width: 200,
      config: {
        color: '#111827',
        content: '{{租户.name}}返工报工单',
        textAlign: 'center',
        fontSizePt: 17,
        fontWeight: 'bold',
      },
      height: 8.8,
      zIndex: 1,
    },
    {
      x: 184,
      y: 5.8,
      id: 'el-builtin-rework-report-meta',
      type: 'text',
      width: 47,
      config: {
        color: '#111827',
        content: '{{系统.pageCurrent}}/{{系统.pageTotal}}页\n{{返工报工.timestamp}}\nNO：{{返工报工.docNo}}',
        textAlign: 'right',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 13.5,
      zIndex: 2,
    },
    {
      x: 8.5,
      y: 13.7,
      id: 'el-builtin-rework-report-summary',
      type: 'text',
      width: 155,
      config: {
        color: '#111827',
        content: '{{返工报工.reworkReportHeaderLeftBlock}}工序：{{返工报工.nodeNames}}',
        textAlign: 'left',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 11,
      zIndex: 3,
    },
    {
      x: 6.4,
      y: 24,
      id: 'el-builtin-rework-report-list',
      type: 'dynamicList',
      width: 226.3,
      config: {
        serialColumnWidthMm: 12,
        columns: [
          {
            id: 'el-builtin-rework-report-col-pn',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '产品',
            contentTemplate: '{{行.productName}}',
          },
          {
            id: 'el-builtin-rework-report-col-sku',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '货号',
            contentTemplate: '{{行.sku}}',
          },
          {
            id: 'el-builtin-rework-report-col-node',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '工序',
            contentTemplate: '{{行.nodeName}}',
          },
          {
            id: 'el-builtin-rework-report-col-mx',
            color: '#000000',
            cellKind: 'colorSizeMatrix',
            textAlign: 'center',
            headerLabel: '规格',
            contentTemplate: '',
            matrixColorHeader: '颜色',
            matrixSizeGroupTitle: '尺码数量',
          },
          {
            id: 'el-builtin-rework-report-col-qty',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '数量',
            contentTemplate: '{{行.quantity}}',
          },
        ],
        fontSizePt: 8,
        showHeader: true,
        showSerial: true,
        borderColor: '#000000',
        borderStyle: 'solid',
        dataColumnCount: 5,
        headerFontSizePt: 9,
        serialHeaderLabel: '序号',
        dataColumnWidthsMm: [0, 0, 0, 0, 0],
        headerBackgroundColor: '#f1f5f9',
      },
      height: 32,
      zIndex: 4,
    },
    {
      x: 120,
      y: 45.2,
      id: 'el-builtin-rework-report-footer',
      type: 'text',
      width: 112,
      config: {
        color: '#111827',
        content: '合计数量：{{返工报工.totalQty}}',
        textAlign: 'right',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 7,
      zIndex: 5,
    },
  ],
  createdAt: '2026-04-28T12:30:00.000Z',
  updatedAt: '2026-04-28T12:30:00.000Z',
};

/** 计划单列表：标题/元信息 + 颜色尺码矩阵与颜色×工序物料矩阵（与用户自建「计划单打印」副本对齐） */
const BUILTIN_PLAN_LIST_V1: Record<string, unknown> = {
  id: BUILTIN_PLAN_LIST_PRINT_TEMPLATE_ID,
  name: '计划单打印',
  isSystemTemplate: true,
  documentType: 'plan',
  printTemplateManageScope: 'planList',
  paperSize: { widthMm: 210, heightMm: 297 },
  paperMarginsMm: { top: 2, left: 2, right: 2, bottom: 2 },
  paperBackgroundColor: '#FFFFFF',
  elements: [
    {
      x: 0,
      y: 2.3,
      id: 'el-builtin-plan-list-title',
      type: 'text',
      width: 204.9,
      config: {
        color: '#111827',
        content: '{{租户.name}}生产计划单',
        textAlign: 'center',
        fontSizePt: 20,
        fontWeight: 'bold',
      },
      height: 12.9,
      zIndex: 1,
    },
    {
      x: 131,
      y: 20.7,
      id: 'el-builtin-plan-list-meta',
      type: 'text',
      width: 75,
      config: {
        color: '#111827',
        content: '计划单时间：{{计划.createdAt}}\n计划单号：{{计划.planNumber}}\n客户：{{计划.customer}}',
        textAlign: 'right',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 16.6,
      zIndex: 2,
    },
    {
      x: 1.9,
      y: 22.9,
      id: 'el-builtin-plan-list-product',
      type: 'text',
      width: 60,
      config: {
        color: '#111827',
        content: '产品名称：{{产品.name}}\n产品编号：{{产品.sku}}',
        textAlign: 'left',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 10,
      zIndex: 3,
    },
    {
      x: 4.3,
      y: 78.1,
      id: 'el-builtin-plan-list-color-material',
      type: 'dynamicList',
      width: 201.6,
      config: {
        columns: [
          {
            id: 'el-builtin-plan-list-cm-col',
            color: '#000000',
            cellKind: 'colorMaterialMatrix',
            textAlign: 'center',
            headerLabel: '',
            contentTemplate: '{{产品.imageUrl}}',
            matrixColorHeader: '颜色',
            matrixSizeGroupTitle: '工序物料',
          },
        ],
        fontSizePt: 10,
        showHeader: true,
        showSerial: false,
        borderColor: '#000000',
        borderStyle: 'solid',
        dataColumnCount: 1,
        headerFontSizePt: 12,
        serialHeaderLabel: '序号',
        dataColumnWidthsMm: [0],
        headerBackgroundColor: '#f1f5f9',
      },
      height: 79.2,
      zIndex: 5,
    },
    {
      x: 3.4,
      y: 34.2,
      id: 'el-builtin-plan-list-main-table',
      type: 'dynamicList',
      width: 202.1,
      config: {
        columns: [
          {
            id: 'el-builtin-plan-list-col-img',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '列1',
            contentTemplate: '{{产品.imageUrl}}',
          },
          {
            id: 'el-builtin-plan-list-col-matrix',
            color: '#000000',
            cellKind: 'colorSizeMatrix',
            textAlign: 'center',
            headerLabel: '',
            contentTemplate: '{{计划.totalQuantity}}',
            matrixColorHeader: '颜色',
            matrixSizeGroupTitle: '尺码数量',
          },
          {
            id: 'el-builtin-plan-list-col-qty',
            color: '#000000',
            textAlign: 'center',
            headerLabel: '数量',
            contentTemplate: '{{计划.totalQuantity}}',
          },
        ],
        fontSizePt: 10,
        showHeader: true,
        showSerial: false,
        borderColor: '#000000',
        borderStyle: 'solid',
        dataColumnCount: 3,
        headerFontSizePt: 12,
        serialHeaderLabel: '序号',
        dataColumnWidthsMm: [0, 0, 0],
        headerBackgroundColor: '#f1f5f9',
      },
      height: 41.5,
      zIndex: 7,
    },
  ],
  createdAt: '2026-05-09T05:06:01.346Z',
  updatedAt: '2026-05-09T09:25:22.098Z',
};

/** 计划单品码小标签：30×50mm、`planLabel`；版式含序列号下居中短横线；与租户「单品码标签（副本）」一致时可同步其 line 段 */
const BUILTIN_PLAN_LABEL_V1: Record<string, unknown> = {
  id: BUILTIN_PLAN_LABEL_PRINT_TEMPLATE_ID,
  name: '单品码标签',
  isSystemTemplate: true,
  documentType: 'plan',
  printTemplateManageScope: 'planLabel',
  paperSize: { widthMm: 30, heightMm: 50 },
  paperSizeCustom: true,
  paperMarginsMm: { top: 2, left: 2, right: 2, bottom: 2 },
  paperBackgroundColor: '#FFFFFF',
  elements: [
    {
      x: 0,
      y: 5.5,
      id: 'el-builtin-plan-label-product',
      type: 'text',
      width: 26,
      config: {
        color: '#111827',
        content: '货号：{{产品.name}}\n颜色：{{行.colorName}}\n尺码：{{行.sizeName}}',
        textAlign: 'left',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 13,
      zIndex: 1,
    },
    {
      x: 0,
      y: 0,
      id: 'el-builtin-plan-label-tenant',
      type: 'text',
      width: 26,
      config: {
        color: '#111827',
        content: '{{租户.name}}',
        textAlign: 'center',
        fontSizePt: 10,
        fontWeight: 'bold',
      },
      height: 5.5,
      zIndex: 2,
    },
    {
      x: 7,
      y: 19,
      id: 'el-builtin-plan-label-qrcode',
      type: 'qrcode',
      width: 12,
      config: {
        content: '{{行.scanUrl}}',
      },
      height: 12,
      zIndex: 3,
    },
    {
      x: 0,
      y: 33.5,
      id: 'el-builtin-plan-label-serial',
      type: 'text',
      width: 26,
      config: {
        color: '#111827',
        content: '{{行.serialLabel}}',
        textAlign: 'center',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 7,
      zIndex: 4,
    },
    {
      x: 6,
      y: 41.2,
      id: 'el-builtin-plan-label-footer-line',
      type: 'line',
      width: 14,
      config: {
        color: '#000000',
        angleDeg: 0,
        lineStyle: 'solid',
        thicknessMm: 0.45,
      },
      height: 1,
      zIndex: 5,
    },
  ],
  createdAt: '2026-05-13T00:00:00.000Z',
  updatedAt: '2026-05-13T16:30:00.000Z',
};

/** 计划批次码小标签：30×50mm、`planLabel`；占位符与 `VirtualBatchPrintRow` / 打印解析一致 */
const BUILTIN_PLAN_BATCH_LABEL_V1: Record<string, unknown> = {
  id: BUILTIN_PLAN_BATCH_LABEL_PRINT_TEMPLATE_ID,
  name: '批次码标签',
  isSystemTemplate: true,
  documentType: 'plan',
  printTemplateManageScope: 'planLabel',
  paperSize: { widthMm: 30, heightMm: 50 },
  paperSizeCustom: true,
  paperMarginsMm: { top: 2, left: 2, right: 2, bottom: 2 },
  paperBackgroundColor: '#FFFFFF',
  elements: [
    {
      x: 0,
      y: 0,
      id: 'el-builtin-plan-batch-label-tenant',
      type: 'text',
      width: 26,
      config: {
        color: '#111827',
        content: '{{租户.name}}',
        textAlign: 'center',
        fontSizePt: 10,
        fontWeight: 'bold',
      },
      height: 5.5,
      zIndex: 1,
    },
    {
      x: 0,
      y: 5.7,
      id: 'el-builtin-plan-batch-label-fields',
      type: 'text',
      width: 25,
      config: {
        color: '#111827',
        content: '货号：{{产品.name}}\n颜色：{{批次.colorName}}\n尺码：{{批次.sizeName}}\n数量：{{批次.quantity}}',
        textAlign: 'left',
        fontSizePt: 10,
        fontWeight: 'normal',
      },
      height: 16.9,
      zIndex: 2,
    },
    {
      x: 7,
      y: 24,
      id: 'el-builtin-plan-batch-label-qrcode',
      type: 'qrcode',
      width: 12.9,
      config: {
        content: '{{批次.scanUrl}}',
      },
      height: 12.6,
      zIndex: 3,
    },
    {
      x: 0,
      y: 37.2,
      id: 'el-builtin-plan-batch-label-serial',
      type: 'text',
      width: 26,
      config: {
        color: '#111827',
        content: '{{批次.serialLabel}}',
        textAlign: 'center',
        fontSizePt: 8,
        fontWeight: 'normal',
      },
      height: 5.1,
      zIndex: 4,
    },
    {
      x: 3.2,
      y: 43.3,
      id: 'el-builtin-plan-batch-label-footer-line',
      type: 'line',
      width: 18,
      config: {
        color: '#000000',
        angleDeg: 0,
        lineStyle: 'solid',
        thicknessMm: 0.4,
      },
      height: 0.5,
      zIndex: 5,
    },
  ],
  createdAt: '2026-05-14T00:00:00.000Z',
  updatedAt: '2026-05-14T00:00:00.000Z',
};

export function listSystemPrintTemplateRecordsForMerge(): Record<string, unknown>[] {
  return [
    BUILTIN_OUTSOURCE_DISPATCH_V2,
    BUILTIN_OUTSOURCE_RECEIVE_V2,
    BUILTIN_PURCHASE_ORDER_V2,
    BUILTIN_SALES_ORDER_V2,
    BUILTIN_PURCHASE_BILL_V2,
    BUILTIN_SALES_BILL_V2,
    BUILTIN_MATERIAL_ISSUE_V1,
    BUILTIN_MATERIAL_RETURN_V1,
    BUILTIN_OUTSOURCE_MATERIAL_ISSUE_V1,
    BUILTIN_OUTSOURCE_MATERIAL_RETURN_V1,
    BUILTIN_REWORK_DEFECT_TREATMENT_V1,
    BUILTIN_REWORK_REPORT_FLOW_V1,
    BUILTIN_PLAN_LIST_V1,
    BUILTIN_PLAN_LABEL_V1,
    BUILTIN_PLAN_BATCH_LABEL_V1,
  ];
}

function filterStoredPrintTemplates(stored: unknown): unknown[] {
  if (!Array.isArray(stored)) return [];
  return stored.filter(x => {
    if (x == null || typeof x !== 'object') return false;
    const id = String((x as { id?: string }).id ?? '').trim();
    if (!id || OBSOLETE_SYSTEM_PRINT_TEMPLATE_IDS.has(id)) return false;
    if (MERGED_CODE_PRINT_TEMPLATE_IDS.has(id)) return false;
    if (isSystemLockedPrintTemplateId(id)) return false;
    return true;
  });
}

/**
 * 合并租户库中已保存的模版与代码统一下发的内置模版（内置 id 与租户保存冲突时以代码为准）。
 */
export function mergePrintTemplatesForTenantConfig(stored: unknown): unknown[] {
  const base = filterStoredPrintTemplates(stored);
  const systemTemplates = listSystemPrintTemplateRecordsForMerge();
  const systemIds = new Set(
    systemTemplates.map(t => String((t as { id?: string }).id ?? '').trim()).filter(Boolean),
  );
  const withoutConflicts = base.filter(t => {
    const id = String((t as { id?: string }).id ?? '').trim();
    return id && !systemIds.has(id);
  });
  return [...withoutConflicts, ...systemTemplates];
}

/** 写入 DB 前移除锁定系统模版、已废弃 id、以及代码合并的内置模版（由读时 merge 再注入） */
export function stripSystemPrintTemplatesForPersistence(value: unknown): unknown[] {
  return filterStoredPrintTemplates(value);
}
