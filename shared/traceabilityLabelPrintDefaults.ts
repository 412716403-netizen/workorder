import {
  BUILTIN_PLAN_BATCH_LABEL_PRINT_TEMPLATE_ID,
  BUILTIN_PLAN_LABEL_PRINT_TEMPLATE_ID,
} from './systemPrintTemplates.js';

export const TRACEABILITY_DEFAULT_LABEL_PRINT_TEMPLATE_IDS = [
  BUILTIN_PLAN_LABEL_PRINT_TEMPLATE_ID,
  BUILTIN_PLAN_BATCH_LABEL_PRINT_TEMPLATE_ID,
] as const;

export type PlanLabelPrintSlot = {
  showPlanDetailTraceSection?: boolean;
  allowedTemplateIds?: string[];
  bulkQuickSplitBatchSize?: number;
  bulkQuickSplitWithItemCodes?: boolean;
};

export type PlanFormWithLabelPrint = {
  labelPrint?: PlanLabelPrintSlot;
};

type PrintTemplateLike = {
  id: string | number;
  printTemplateManageScope?: string | null;
};

/** 从已合并的打印模版列表解析追溯码默认标签白名单（优先内置 planLabel 模版） */
export function resolveTraceabilityDefaultLabelTemplateIds(
  printTemplates: PrintTemplateLike[],
): string[] {
  const catalogIds = new Set(
    printTemplates
      .filter(t => t.printTemplateManageScope === 'planLabel')
      .map(t => String(t.id).trim())
      .filter(Boolean),
  );
  const builtins = TRACEABILITY_DEFAULT_LABEL_PRINT_TEMPLATE_IDS.filter(id => catalogIds.has(id));
  return builtins.length > 0 ? [...builtins] : [...TRACEABILITY_DEFAULT_LABEL_PRINT_TEMPLATE_IDS];
}

function labelPrintSlotsEqual(a?: PlanLabelPrintSlot, b?: PlanLabelPrintSlot): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const aShow = a.showPlanDetailTraceSection !== false;
  const bShow = b.showPlanDetailTraceSection !== false;
  if (aShow !== bShow) return false;
  const aIds = (a.allowedTemplateIds ?? []).map(String).sort().join(',');
  const bIds = (b.allowedTemplateIds ?? []).map(String).sort().join(',');
  return aIds === bIds;
}

/**
 * 追溯码插件开启时：默认开启计划单「标签打印」（计划详情追溯区块 + 内置标签模版白名单）。
 * - 不覆盖用户显式关闭的 showPlanDetailTraceSection: false（除非 forceEnableTraceSection）
 * - 仅在 allowedTemplateIds 为空/未配置时写入默认白名单
 */
export function applyTraceabilityLabelPrintDefaults<T extends PlanFormWithLabelPrint>(
  planForm: T,
  printTemplates: PrintTemplateLike[],
  opts?: { forceEnableTraceSection?: boolean },
): T {
  const lp = planForm.labelPrint ?? {};
  const defaultIds = resolveTraceabilityDefaultLabelTemplateIds(printTemplates);
  const prevIds = lp.allowedTemplateIds?.filter(Boolean).map(String) ?? [];

  const nextShow =
    opts?.forceEnableTraceSection === true
      ? true
      : lp.showPlanDetailTraceSection === false
        ? false
        : true;

  const nextLabelPrint: PlanLabelPrintSlot = {
    ...lp,
    showPlanDetailTraceSection: nextShow,
    ...(prevIds.length === 0 && defaultIds.length > 0 ? { allowedTemplateIds: defaultIds } : {}),
  };

  if (labelPrintSlotsEqual(lp, nextLabelPrint)) return planForm;
  return { ...planForm, labelPrint: nextLabelPrint };
}
