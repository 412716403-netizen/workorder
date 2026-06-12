import { describe, expect, it } from 'vitest';
import {
  applyTraceabilityLabelPrintDefaults,
  resolveTraceabilityDefaultLabelTemplateIds,
  TRACEABILITY_DEFAULT_LABEL_PRINT_TEMPLATE_IDS,
} from './traceabilityLabelPrintDefaults';

const tpl = (id: string, scope: 'planList' | 'planLabel') => ({
  id,
  printTemplateManageScope: scope,
});

describe('resolveTraceabilityDefaultLabelTemplateIds', () => {
  it('returns builtin ids when planLabel templates exist in catalog', () => {
    const ids = resolveTraceabilityDefaultLabelTemplateIds([
      tpl('builtin-plan-label-v1', 'planLabel'),
      tpl('builtin-plan-batch-label-v1', 'planLabel'),
    ]);
    expect(ids).toEqual([...TRACEABILITY_DEFAULT_LABEL_PRINT_TEMPLATE_IDS]);
  });

  it('falls back to builtin ids when catalog is empty', () => {
    expect(resolveTraceabilityDefaultLabelTemplateIds([])).toEqual([
      ...TRACEABILITY_DEFAULT_LABEL_PRINT_TEMPLATE_IDS,
    ]);
  });
});

describe('applyTraceabilityLabelPrintDefaults', () => {
  const templates = [
    tpl('builtin-plan-label-v1', 'planLabel'),
    tpl('builtin-plan-batch-label-v1', 'planLabel'),
  ];

  it('enables trace section and whitelist when labelPrint is missing', () => {
    const next = applyTraceabilityLabelPrintDefaults({}, templates);
    expect(next.labelPrint?.showPlanDetailTraceSection).toBe(true);
    expect(next.labelPrint?.allowedTemplateIds).toEqual([...TRACEABILITY_DEFAULT_LABEL_PRINT_TEMPLATE_IDS]);
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

  it('preserves existing whitelist when already configured', () => {
    const next = applyTraceabilityLabelPrintDefaults(
      { labelPrint: { allowedTemplateIds: ['custom-lbl'], showPlanDetailTraceSection: true } },
      templates,
    );
    expect(next.labelPrint?.allowedTemplateIds).toEqual(['custom-lbl']);
  });
});
