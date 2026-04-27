import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import type {
  PlanFormSettings,
  PlanOrder,
  OrderFormSettings,
  MaterialFormSettings,
  OutsourceFormSettings,
  ReworkFormSettings,
  PurchaseOrderFormSettings,
  SalesOrderFormSettings,
  PurchaseBillFormSettings,
  SalesBillFormSettings,
  ReceiptFormSettings,
  PaymentFormSettings,
  PrintTemplate,
  ProductionOrder,
  Product,
} from '../../types';
import { PrintTemplateManager } from '../PrintTemplateManager';
import { createBuiltinOutsourceDispatchPrintTemplate } from '../../utils/outsourceDispatchPrintTemplate';

export type PlanPrintTemplateManageScope =
  | 'planList'
  | 'planLabel'
  | 'orderDetail'
  | 'reportBatchDetail'
  | 'stockInFlowDetail'
  | 'materialIssueFlowDetail'
  | 'materialReturnFlowDetail'
  | 'materialOutsourceIssueFlowDetail'
  | 'materialOutsourceReturnFlowDetail'
  | 'outsourceDispatchFlowDetail'
  | 'outsourceReceiveFlowDetail'
  | 'defectTreatmentFlowDetail'
  | 'reworkReportFlowDetail'
  | 'purchaseOrderList'
  | 'salesOrderList'
  | 'purchaseBillList'
  | 'salesBillList'
  | 'receiptList'
  | 'paymentList';

function allowedTemplateIdsForScope(
  form:
    | PlanFormSettings
    | OrderFormSettings
    | MaterialFormSettings
    | OutsourceFormSettings
    | ReworkFormSettings
    | PurchaseOrderFormSettings
    | SalesOrderFormSettings
    | PurchaseBillFormSettings
    | SalesBillFormSettings
    | ReceiptFormSettings
    | PaymentFormSettings,
  scope: PlanPrintTemplateManageScope,
): string[] | undefined {
  if (scope === 'purchaseOrderList') return (form as PurchaseOrderFormSettings).listPrint?.allowedTemplateIds;
  if (scope === 'salesOrderList') return (form as SalesOrderFormSettings).listPrint?.allowedTemplateIds;
  if (scope === 'purchaseBillList') return (form as PurchaseBillFormSettings).listPrint?.allowedTemplateIds;
  if (scope === 'salesBillList') return (form as SalesBillFormSettings).listPrint?.allowedTemplateIds;
  if (scope === 'receiptList') return (form as ReceiptFormSettings).listPrint?.allowedTemplateIds;
  if (scope === 'paymentList') return (form as PaymentFormSettings).listPrint?.allowedTemplateIds;
  if (scope === 'defectTreatmentFlowDetail' || scope === 'reworkReportFlowDetail') {
    const rw = form as ReworkFormSettings;
    if (scope === 'defectTreatmentFlowDetail') return rw.reworkCenterPrint?.defectTreatmentFlowDetail?.allowedTemplateIds;
    return rw.reworkCenterPrint?.reworkReportFlowDetail?.allowedTemplateIds;
  }
  if (scope === 'outsourceDispatchFlowDetail' || scope === 'outsourceReceiveFlowDetail') {
    const os = form as OutsourceFormSettings;
    if (scope === 'outsourceDispatchFlowDetail') return os.outsourceCenterPrint?.dispatchFlowDetail?.allowedTemplateIds;
    return os.outsourceCenterPrint?.receiveFlowDetail?.allowedTemplateIds;
  }
  if (scope === 'planList') return (form as PlanFormSettings).listPrint?.allowedTemplateIds;
  if (scope === 'planLabel') return (form as PlanFormSettings).labelPrint?.allowedTemplateIds;
  if (
    scope === 'materialIssueFlowDetail' ||
    scope === 'materialReturnFlowDetail' ||
    scope === 'materialOutsourceIssueFlowDetail' ||
    scope === 'materialOutsourceReturnFlowDetail'
  ) {
    const m = (form as MaterialFormSettings).materialCenterPrint;
    if (scope === 'materialIssueFlowDetail') return m?.stockOutFlowDetail?.allowedTemplateIds;
    if (scope === 'materialReturnFlowDetail') return m?.stockReturnFlowDetail?.allowedTemplateIds;
    if (scope === 'materialOutsourceIssueFlowDetail') return m?.outsourceStockOutFlowDetail?.allowedTemplateIds;
    return m?.outsourceStockReturnFlowDetail?.allowedTemplateIds;
  }
  const o = (form as OrderFormSettings).orderCenterPrint;
  if (scope === 'orderDetail') return o?.orderDetail?.allowedTemplateIds;
  if (scope === 'reportBatchDetail') return o?.reportBatchDetail?.allowedTemplateIds;
  if (scope === 'stockInFlowDetail') return o?.stockInFlowDetail?.allowedTemplateIds;
  return undefined;
}

export interface PlanPrintTemplateManageDialogProps {
  open: boolean;
  onClose: () => void;
  scope: PlanPrintTemplateManageScope;
  printTemplates: PrintTemplate[];
  onUpdatePrintTemplates: (list: PrintTemplate[]) => void | Promise<void>;
  /** 用于简易字段选项与白名单是否处于「限制模式」；工单中心打印时传入含 `orderCenterPrint` 的工单表单配置；外协打印传入 `outsourceFormSettings`；返工管理传入 `reworkFormSettings`；采购订单/采购单传入对应表单配置 */
  planFormSettings:
    | PlanFormSettings
    | OrderFormSettings
    | MaterialFormSettings
    | OutsourceFormSettings
    | ReworkFormSettings
    | PurchaseOrderFormSettings
    | SalesOrderFormSettings
    | PurchaseBillFormSettings
    | SalesBillFormSettings
    | ReceiptFormSettings
    | PaymentFormSettings;
  /** 将当前选中模版 id 合并进对应白名单；若当前未配置则初始化为仅该模版 */
  onMergePrintWhitelist: (templateId: string) => void;
  onRefreshPrintTemplates?: () => void | Promise<void>;
  plans: PlanOrder[];
  orders: ProductionOrder[];
  products: Product[];
}

function scopeTitle(scope: PlanPrintTemplateManageScope): string {
  switch (scope) {
    case 'planList':
      return '计划单列表打印模版';
    case 'planLabel':
      return '计划单标签打印模版';
    case 'orderDetail':
      return '工单详情打印模版';
    case 'reportBatchDetail':
      return '报工详情打印模版';
    case 'stockInFlowDetail':
      return '入库详情打印模版';
    case 'materialIssueFlowDetail':
      return '领料发出详情打印模版';
    case 'materialReturnFlowDetail':
      return '生产退料详情打印模版';
    case 'materialOutsourceIssueFlowDetail':
      return '外协领料发出详情打印模版';
    case 'materialOutsourceReturnFlowDetail':
      return '外协生产退料详情打印模版';
    case 'outsourceDispatchFlowDetail':
      return '外协发出详情打印模版';
    case 'outsourceReceiveFlowDetail':
      return '外协收回详情打印模版';
    case 'defectTreatmentFlowDetail':
      return '处理不良流水详情打印模版';
    case 'reworkReportFlowDetail':
      return '返工报工流水详情打印模版';
    case 'purchaseOrderList':
      return '采购订单打印模版';
    case 'salesOrderList':
      return '销售订单打印模版';
    case 'purchaseBillList':
      return '采购单打印模版';
    case 'salesBillList':
      return '销售单打印模版';
    case 'receiptList':
      return '收款单打印模版';
    case 'paymentList':
      return '付款单打印模版';
    default:
      return '打印模版';
  }
}

function scopeHint(scope: PlanPrintTemplateManageScope): string {
  if (scope === 'planList') {
    return '用于计划单列表「打印」输出；新建模版在新窗口中编辑，保存后会自动同步到本页列表。选中左侧模版后点「加入列表打印可选」可加入表单中的列表可选模版（首次加入会从「全部可用」变为仅已加入项）。';
  }
  if (scope === 'planLabel') {
    return '用于计划详情单品码与批次标签；选中模版后点「加入标签打印可选」加入表单中的标签可选模版（首次加入会从「全部可用」变为仅已加入项）。';
  }
  if (scope === 'orderDetail') {
    return '用于工单中心工单详情弹窗「打印」；模版建议使用「工单」单据类型。选中左侧模版后点下方按钮加入可选列表。';
  }
  if (scope === 'reportBatchDetail') {
    return '用于报工流水 → 报工批次详情「打印」；可选用「报工」「工单」「产品」等占位符。选中左侧模版后点下方按钮加入可选列表。';
  }
  if (scope === 'stockInFlowDetail') {
    return '用于待入库清单 → 入库流水 → 入库详情「打印」；可选用「入库」「工单」等占位符。选中左侧模版后点下方按钮加入可选列表。';
  }
  if (scope === 'materialIssueFlowDetail') {
    return '用于生产物料领料单详情「打印」；请在模版编辑中将「数据源」选为「生产物料」，并选用「领料发出」等占位符。';
  }
  if (scope === 'materialReturnFlowDetail') {
    return '用于生产物料退料单详情「打印」；数据源请选「生产物料」，并选用「生产退料」等占位符。';
  }
  if (scope === 'materialOutsourceIssueFlowDetail') {
    return '用于带加工厂的外协领料发出单详情「打印」；数据源请选「生产物料」，并选用「外协领料发出」等占位符（与「外协管理」外协发出不同）。';
  }
  if (scope === 'materialOutsourceReturnFlowDetail') {
    return '用于带加工厂的外协生产退料单详情「打印」；数据源请选「生产物料」，并选用「外协生产退料」等占位符。';
  }
  if (scope === 'outsourceDispatchFlowDetail') {
    return '用于外协流水 → 外协发出单详情「打印」；请在模版编辑中将「数据源」选为「外协管理」，并选用「外协发出」等占位符。';
  }
  if (scope === 'outsourceReceiveFlowDetail') {
    return '用于外协流水 → 外协收回单详情「打印」；数据源请选「外协管理」，并选用「外协收回」等占位符。';
  }
  if (scope === 'defectTreatmentFlowDetail') {
    return '用于返工管理 → 处理不良品流水 → 详情「打印」；请在模版编辑中将「数据源」选为「返工管理」，并选用「处理不良」等占位符。';
  }
  if (scope === 'reworkReportFlowDetail') {
    return '用于返工管理 → 返工报工流水 → 详情「打印」；数据源请选「返工管理」，并选用「返工报工」等占位符。';
  }
  if (scope === 'purchaseOrderList') {
    return '用于进销存采购订单列表「打印」；请将模版数据源选为「采购订单」。选中左侧模版后点「加入列表打印可选」。';
  }
  if (scope === 'salesOrderList') {
    return '用于进销存销售订单列表「打印」及登记/详情页「打印」；请将模版数据源选为「销售订单」。选中左侧模版后点「加入列表打印可选」。';
  }
  if (scope === 'purchaseBillList') {
    return '用于进销存采购单列表「打印」及登记/详情页「打印」；请将模版数据源选为「采购单」。选中左侧模版后点「加入列表打印可选」。';
  }
  if (scope === 'salesBillList') {
    return '用于进销存销售单列表「打印」及登记/详情页「打印」；请将模版数据源选为「销售单」。选中左侧模版后点「加入列表打印可选」。';
  }
  if (scope === 'receiptList') {
    return '用于财务收款单列表「打印」；请将模版数据源选为「收款单」。选中左侧模版后点「加入列表打印可选」。';
  }
  if (scope === 'paymentList') {
    return '用于财务付款单列表「打印」；请将模版数据源选为「付款单」。选中左侧模版后点「加入列表打印可选」。';
  }
  return '选中左侧模版后点下方按钮加入可选列表。';
}

function joinButtonLabel(scope: PlanPrintTemplateManageScope): string {
  if (scope === 'planList') return '加入列表打印可选';
  if (scope === 'planLabel') return '加入标签打印可选';
  if (scope === 'purchaseOrderList') return '加入列表打印可选';
  if (scope === 'salesOrderList') return '加入列表打印可选';
  if (scope === 'purchaseBillList') return '加入列表打印可选';
  if (scope === 'salesBillList') return '加入列表打印可选';
  if (scope === 'receiptList') return '加入列表打印可选';
  if (scope === 'paymentList') return '加入列表打印可选';
  return '加入可选模版';
}

export const PlanPrintTemplateManageDialog: React.FC<PlanPrintTemplateManageDialogProps> = ({
  open,
  onClose,
  scope,
  printTemplates,
  onUpdatePrintTemplates,
  planFormSettings,
  onMergePrintWhitelist,
  onRefreshPrintTemplates,
  plans,
  orders,
  products,
}) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  /**
   * 打开弹窗时锁定「已存在模版 id 快照」；之后（含跨标签页/本地）出现的新模版会被识别为「新增」，
   * 并在已有白名单时自动加入白名单，避免出现「新增模版后打印选择器里看不到」的情况。
   */
  const baselineIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (open) {
      baselineIdsRef.current = new Set(printTemplates.map(t => t.id));
      void onRefreshPrintTemplates?.();
    } else {
      baselineIdsRef.current = null;
    }
    // 仅按 open 触发；printTemplates 的变化不应重置基线，否则无法检测「新增」
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** 跨标签页/本地新增模版时：若当前 scope 已配置白名单，则自动把新模版合并进白名单 */
  useEffect(() => {
    if (!open) return;
    const baseline = baselineIdsRef.current;
    if (!baseline) return;
    const allowed = allowedTemplateIdsForScope(planFormSettings, scope);
    if (!allowed?.length) return;
    const newIds: string[] = [];
    for (const t of printTemplates) {
      if (!baseline.has(t.id)) newIds.push(t.id);
    }
    if (newIds.length === 0) return;
    for (const id of newIds) {
      baseline.add(id);
      onMergePrintWhitelist(id);
    }
  }, [open, printTemplates, planFormSettings, scope, onMergePrintWhitelist]);

  /** 窗口重新获得焦点时刷新：兜底 BroadcastChannel 不可用或被浏览器拦截的场景（新标签页保存后返回当前标签） */
  useEffect(() => {
    if (!open || !onRefreshPrintTemplates) return;
    const onFocus = () => void onRefreshPrintTemplates();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void onRefreshPrintTemplates();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [open, onRefreshPrintTemplates]);

  const onAfterPersist = useCallback(
    (nextList: PrintTemplate[], prevList: PrintTemplate[]) => {
      const prevIds = new Set(prevList.map(t => t.id));
      const added = nextList.filter(t => !prevIds.has(t.id));
      const allowed = allowedTemplateIdsForScope(planFormSettings, scope);
      if (!allowed?.length) return;
      for (const t of added) {
        baselineIdsRef.current?.add(t.id);
        onMergePrintWhitelist(t.id);
      }
    },
    [onMergePrintWhitelist, planFormSettings, scope],
  );

  const handleJoinWhitelist = () => {
    if (!selectedTemplateId) {
      toast.error('请先在左侧选择一个模版');
      return;
    }
    onMergePrintWhitelist(selectedTemplateId);
    toast.success('已加入可选模版');
  };

  const handleAddBuiltinOutsourceDispatch = useCallback(() => {
    if (scope !== 'outsourceDispatchFlowDetail') return;
    const built = createBuiltinOutsourceDispatchPrintTemplate();
    const nextList = [...printTemplates, built];
    baselineIdsRef.current?.add(built.id);
    void onUpdatePrintTemplates(nextList);
    setSelectedTemplateId(built.id);
    const allowed = allowedTemplateIdsForScope(planFormSettings, scope);
    if (allowed?.length) onMergePrintWhitelist(built.id);
    toast.success('已添加「外协发出单（二等分·矩阵）」模版');
  }, [scope, printTemplates, onUpdatePrintTemplates, planFormSettings, onMergePrintWhitelist]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" aria-label="关闭" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div className="min-w-0">
            <h3 className="text-lg font-black text-slate-900">增加 / 管理模版 · {scopeTitle(scope)}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{scopeHint(scope)}</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-4 pb-2 pt-3">
          <div className="h-[min(70vh,640px)] min-h-[320px] overflow-hidden">
            <PrintTemplateManager
              printTemplates={printTemplates}
              onUpdatePrintTemplates={onUpdatePrintTemplates}
              plans={plans}
              orders={orders}
              products={products}
              onAfterPersist={onAfterPersist}
              onSelectionChange={setSelectedTemplateId}
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-slate-100 bg-slate-50/90 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-slate-500">
            加入后模版会出现在表单配置「已加入」列表及对应打印选择器中；若此前未配置任何项，首次加入后仅允许使用已加入的模版。可在表单配置中删除某项以恢复为「未加入=全部可用」。
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {scope === 'outsourceDispatchFlowDetail' ? (
              <button
                type="button"
                onClick={handleAddBuiltinOutsourceDispatch}
                className="rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-50"
              >
                添加内置：外协发出（二等分·矩阵）
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleJoinWhitelist}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              disabled={!selectedTemplateId}
            >
              {joinButtonLabel(scope)}
            </button>
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
