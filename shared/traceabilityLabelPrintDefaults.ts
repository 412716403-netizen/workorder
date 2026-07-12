import {
  BUILTIN_PLAN_BATCH_LABEL_PRINT_TEMPLATE_ID,
  BUILTIN_PLAN_LABEL_PRINT_TEMPLATE_ID,
} from './systemPrintTemplates.js';

export const TRACEABILITY_DEFAULT_ITEM_LABEL_PRINT_TEMPLATE_IDS = [
  BUILTIN_PLAN_LABEL_PRINT_TEMPLATE_ID,
] as const;

export const TRACEABILITY_DEFAULT_BATCH_LABEL_PRINT_TEMPLATE_IDS = [
  BUILTIN_PLAN_BATCH_LABEL_PRINT_TEMPLATE_ID,
] as const;

/** @deprecated 使用 TRACEABILITY_DEFAULT_ITEM/BATCH_LABEL_PRINT_TEMPLATE_IDS */
export const TRACEABILITY_DEFAULT_LABEL_PRINT_TEMPLATE_IDS = [
  BUILTIN_PLAN_LABEL_PRINT_TEMPLATE_ID,
  BUILTIN_PLAN_BATCH_LABEL_PRINT_TEMPLATE_ID,
] as const;

export type PlanLabelPrintSlot = {
  showPlanDetailTraceSection?: boolean;
  allowedTemplateIds?: string[];
  itemCodePrint?: { allowedTemplateIds?: string[] };
  batchPrint?: { allowedTemplateIds?: string[] };
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

function catalogHasScope(printTemplates: PrintTemplateLike[], scope: string, id: string): boolean {
  return printTemplates.some(
    t =>
      String(t.id).trim() === id &&
      (t.printTemplateManageScope === scope || t.printTemplateManageScope === 'planLabel'),
  );
}

/** 从已合并的打印模版列表解析追溯码默认单品码/批次码白名单 */
export function resolveTraceabilityDefaultItemLabelTemplateIds(
  printTemplates: PrintTemplateLike[],
): string[] {
  const id = BUILTIN_PLAN_LABEL_PRINT_TEMPLATE_ID;
  if (catalogHasScope(printTemplates, 'planItemLabel', id)) return [id];
  return [...TRACEABILITY_DEFAULT_ITEM_LABEL_PRINT_TEMPLATE_IDS];
}

export function resolveTraceabilityDefaultBatchLabelTemplateIds(
  printTemplates: PrintTemplateLike[],
): string[] {
  const id = BUILTIN_PLAN_BATCH_LABEL_PRINT_TEMPLATE_ID;
  if (catalogHasScope(printTemplates, 'planBatchLabel', id)) return [id];
  return [...TRACEABILITY_DEFAULT_BATCH_LABEL_PRINT_TEMPLATE_IDS];
}

function labelPrintSlotsEqual(a?: PlanLabelPrintSlot, b?: PlanLabelPrintSlot): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const aShow = a.showPlanDetailTraceSection !== false;
  const bShow = b.showPlanDetailTraceSection !== false;
  if (aShow !== bShow) return false;
  const norm = (slot?: { allowedTemplateIds?: string[] }) =>
    (slot?.allowedTemplateIds ?? []).map(String).sort().join(',');
  if (norm(a.itemCodePrint) !== norm(b.itemCodePrint)) return false;
  if (norm(a.batchPrint) !== norm(b.batchPrint)) return false;
  const aLegacy = (a.allowedTemplateIds ?? []).map(String).sort().join(',');
  const bLegacy = (b.allowedTemplateIds ?? []).map(String).sort().join(',');
  return aLegacy === bLegacy;
}

/**
 * 追溯码插件开启时：默认开启计划详情追溯区块，并分别补齐单品码/批次码内置模版白名单。
 * - 不覆盖用户显式关闭的 showPlanDetailTraceSection: false（除非 forceEnableTraceSection）
 * - 仅在对应 slot 的 allowedTemplateIds 为空/未配置时写入默认白名单
 */
export function applyTraceabilityLabelPrintDefaults<T extends PlanFormWithLabelPrint>(
  planForm: T,
  printTemplates: PrintTemplateLike[],
  opts?: { forceEnableTraceSection?: boolean },
): T {
  const lp = planForm.labelPrint ?? {};
  const defaultItemIds = resolveTraceabilityDefaultItemLabelTemplateIds(printTemplates);
  const defaultBatchIds = resolveTraceabilityDefaultBatchLabelTemplateIds(printTemplates);
  const prevItemIds = lp.itemCodePrint?.allowedTemplateIds?.filter(Boolean).map(String) ?? [];
  const prevBatchIds = lp.batchPrint?.allowedTemplateIds?.filter(Boolean).map(String) ?? [];
  const legacyIds = lp.allowedTemplateIds?.filter(Boolean).map(String) ?? [];

  const nextShow =
    opts?.forceEnableTraceSection === true
      ? true
      : lp.showPlanDetailTraceSection === false
        ? false
        : true;

  const nextItemIds =
    prevItemIds.length > 0
      ? prevItemIds
      : legacyIds.length > 0
        ? legacyIds
        : defaultItemIds;

  const nextBatchIds = prevBatchIds.length > 0 ? prevBatchIds : defaultBatchIds;

  const nextLabelPrint: PlanLabelPrintSlot = {
    ...lp,
    showPlanDetailTraceSection: nextShow,
    ...(nextItemIds.length > 0 ? { itemCodePrint: { allowedTemplateIds: nextItemIds } } : {}),
    ...(nextBatchIds.length > 0 ? { batchPrint: { allowedTemplateIds: nextBatchIds } } : {}),
  };

  if (labelPrintSlotsEqual(lp, nextLabelPrint)) return planForm;
  return { ...planForm, labelPrint: nextLabelPrint };
}
