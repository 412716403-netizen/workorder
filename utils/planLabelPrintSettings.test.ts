import { describe, expect, it } from 'vitest';
import { migratePlanLabelPrintSettings } from './planLabelPrintSettings';

describe('migratePlanLabelPrintSettings', () => {
  it('moves legacy allowedTemplateIds to itemCodePrint', () => {
    const next = migratePlanLabelPrintSettings({
      allowedTemplateIds: ['custom-a', 'custom-b'],
      showPlanDetailTraceSection: true,
    });
    expect(next?.itemCodePrint?.allowedTemplateIds).toEqual(['custom-a', 'custom-b']);
    expect(next?.allowedTemplateIds).toBeUndefined();
    expect(next?.batchPrint).toBeUndefined();
  });

  it('keeps explicit item/batch slots when present', () => {
    const next = migratePlanLabelPrintSettings({
      allowedTemplateIds: ['legacy'],
      itemCodePrint: { allowedTemplateIds: ['item-1'] },
      batchPrint: { allowedTemplateIds: ['batch-1'] },
    });
    expect(next?.itemCodePrint?.allowedTemplateIds).toEqual(['item-1']);
    expect(next?.batchPrint?.allowedTemplateIds).toEqual(['batch-1']);
  });
});
