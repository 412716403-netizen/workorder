import { describe, expect, it } from 'vitest';
import {
  applyTraceabilityLabelPrintDefaults,
  resolveTraceabilityDefaultBatchLabelTemplateIds,
  resolveTraceabilityDefaultItemLabelTemplateIds,
  TRACEABILITY_DEFAULT_BATCH_LABEL_PRINT_TEMPLATE_IDS,
  TRACEABILITY_DEFAULT_ITEM_LABEL_PRINT_TEMPLATE_IDS,
} from './traceabilityLabelPrintDefaults';

const tpl = (id: string, scope: 'planList' | 'planItemLabel' | 'planBatchLabel' | 'planLabel') => ({
  id,
  printTemplateManageScope: scope,
});

describe('resolveTraceabilityDefaultItemLabelTemplateIds', () => {
  it('returns builtin item id when present in catalog', () => {
    const ids = resolveTraceabilityDefaultItemLabelTemplateIds([
      tpl('builtin-plan-label-v1', 'planItemLabel'),
    ]);
    expect(ids).toEqual([...TRACEABILITY_DEFAULT_ITEM_LABEL_PRINT_TEMPLATE_IDS]);
  });
});

describe('resolveTraceabilityDefaultBatchLabelTemplateIds', () => {
  it('returns builtin batch id when present in catalog', () => {
    const ids = resolveTraceabilityDefaultBatchLabelTemplateIds([
      tpl('builtin-plan-batch-label-v1', 'planBatchLabel'),
    ]);
    expect(ids).toEqual([...TRACEABILITY_DEFAULT_BATCH_LABEL_PRINT_TEMPLATE_IDS]);
  });
});

describe('applyTraceabilityLabelPrintDefaults', () => {
  const templates = [
    tpl('builtin-plan-label-v1', 'planItemLabel'),
    tpl('builtin-plan-batch-label-v1', 'planBatchLabel'),
  ];

  it('enables trace section and split whitelists when labelPrint is missing', () => {
    const next = applyTraceabilityLabelPrintDefaults({}, templates);
    expect(next.labelPrint?.showPlanDetailTraceSection).toBe(true);
    expect(next.labelPrint?.itemCodePrint?.allowedTemplateIds).toEqual([
      ...TRACEABILITY_DEFAULT_ITEM_LABEL_PRINT_TEMPLATE_IDS,
    ]);
    expect(next.labelPrint?.batchPrint?.allowedTemplateIds).toEqual([
      ...TRACEABILITY_DEFAULT_BATCH_LABEL_PRINT_TEMPLATE_IDS,
    ]);
  });

  it('does not override explicit showPlanDetailTraceSection false', () => {
    const next = applyTraceabilityLabelPrintDefaults(
      { labelPrint: { showPlanDetailTraceSection: false } },
      templates,
    );
    expect(next.labelPrint?.showPlanDetailTraceSection).toBe(false);
  });

  it('forceEnableTraceSection turns trace section on even when previously false', () => {
    const next = applyTraceabilityLabelPrintDefaults(
      { labelPrint: { showPlanDetailTraceSection: false } },
      templates,
      { forceEnableTraceSection: true },
    );
    expect(next.labelPrint?.showPlanDetailTraceSection).toBe(true);
  });

  it('preserves existing item whitelist when already configured', () => {
    const next = applyTraceabilityLabelPrintDefaults(
      {
        labelPrint: {
          itemCodePrint: { allowedTemplateIds: ['custom-lbl'] },
          showPlanDetailTraceSection: true,
        },
      },
      templates,
    );
    expect(next.labelPrint?.itemCodePrint?.allowedTemplateIds).toEqual(['custom-lbl']);
  });

  it('migrates legacy allowedTemplateIds to itemCodePrint when applying defaults', () => {
    const next = applyTraceabilityLabelPrintDefaults(
      { labelPrint: { allowedTemplateIds: ['custom-lbl'], showPlanDetailTraceSection: true } },
      templates,
    );
    expect(next.labelPrint?.itemCodePrint?.allowedTemplateIds).toEqual(['custom-lbl']);
    expect(next.labelPrint?.batchPrint?.allowedTemplateIds).toEqual([
      ...TRACEABILITY_DEFAULT_BATCH_LABEL_PRINT_TEMPLATE_IDS,
    ]);
  });
});
