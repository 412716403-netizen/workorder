import type { PlanFormSettings, PlanLabelPrintSettings, PrintTemplate } from '../types';
import { filterPrintTemplatesByAllowedIds } from './printTemplateWhitelist';

export type PlanLabelPrintKind = 'itemCode' | 'batch';

/**
 * 将历史 `labelPrint.allowedTemplateIds` 整份迁移至单品码白名单（用户自建模版默认归单品码管理）。
 */
export function migratePlanLabelPrintSettings(
  labelPrint: PlanLabelPrintSettings | undefined,
): PlanLabelPrintSettings | undefined {
  if (!labelPrint) return labelPrint;
  const legacy = labelPrint.allowedTemplateIds?.filter(Boolean).map(String) ?? [];
  const itemIds = labelPrint.itemCodePrint?.allowedTemplateIds?.filter(Boolean).map(String) ?? [];
  const batchIds = labelPrint.batchPrint?.allowedTemplateIds?.filter(Boolean).map(String) ?? [];

  let nextItem = itemIds;
  let nextBatch = batchIds;
  if (legacy.length > 0 && itemIds.length === 0 && batchIds.length === 0) {
    nextItem = legacy;
  }

  const { allowedTemplateIds: _legacy, ...rest } = labelPrint;
  return {
    ...rest,
    ...(nextItem.length > 0
      ? { itemCodePrint: { allowedTemplateIds: nextItem } }
      : labelPrint.itemCodePrint
        ? { itemCodePrint: labelPrint.itemCodePrint }
        : {}),
    ...(nextBatch.length > 0
      ? { batchPrint: { allowedTemplateIds: nextBatch } }
      : labelPrint.batchPrint
        ? { batchPrint: labelPrint.batchPrint }
        : {}),
  };
}

export function getPlanLabelPrintAllowedIds(
  labelPrint: PlanLabelPrintSettings | undefined,
  kind: PlanLabelPrintKind,
): string[] | undefined {
  const migrated = migratePlanLabelPrintSettings(labelPrint);
  const slot = kind === 'itemCode' ? migrated?.itemCodePrint : migrated?.batchPrint;
  const ids = slot?.allowedTemplateIds?.filter(Boolean).map(String) ?? [];
  return ids.length > 0 ? ids : undefined;
}

export function buildPlanLabelPrintPicker(
  printTemplates: PrintTemplate[],
  labelPrint: PlanLabelPrintSettings | undefined,
  kind: PlanLabelPrintKind,
): { templates: PrintTemplate[]; hasWhitelist: boolean } {
  const raw = getPlanLabelPrintAllowedIds(labelPrint, kind);
  const filtered = filterPrintTemplatesByAllowedIds(printTemplates, raw);
  const hasWhitelist =
    Array.isArray(raw) && raw.some(x => x != null && x !== '' && String(x).trim() !== '');
  return { templates: filtered, hasWhitelist };
}

export function mergePlanLabelPrintWhitelistInSettings(
  planForm: PlanFormSettings,
  kind: PlanLabelPrintKind,
  templateId: string,
): PlanFormSettings {
  const migrated = migratePlanLabelPrintSettings(planForm.labelPrint) ?? {};
  const slotKey = kind === 'itemCode' ? 'itemCodePrint' : 'batchPrint';
  const prev = migrated[slotKey]?.allowedTemplateIds;
  const allowedTemplateIds = prev?.length
    ? Array.from(new Set([...prev, templateId]))
    : [templateId];
  return {
    ...planForm,
    labelPrint: {
      ...migrated,
      [slotKey]: { allowedTemplateIds },
    },
  };
}
