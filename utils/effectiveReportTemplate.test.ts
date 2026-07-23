import { describe, it, expect } from 'vitest';
import { getReportCustomDataDisplayEntries } from './effectiveReportTemplate';

describe('getReportCustomDataDisplayEntries', () => {
  it('formats JSON file field as file names instead of raw JSON', () => {
    const raw = JSON.stringify([
      {
        url: 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,AAA',
        name: '报告.docx',
      },
    ]);
    const entries = getReportCustomDataDisplayEntries(
      { f1: raw },
      [{ id: 'f1', label: '报告', type: 'file' }],
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]!.fieldType).toBe('file');
    expect(entries[0]!.display).toBe('报告.docx');
    expect(entries[0]!.rawValue).toBe(raw);
    expect(entries[0]!.display.startsWith('[')).toBe(false);
  });

  it('keeps text fields as plain display', () => {
    const entries = getReportCustomDataDisplayEntries(
      { note: '新选项' },
      [{ id: 'note', label: '备注', type: 'text' }],
    );
    expect(entries[0]).toMatchObject({ display: '新选项', fieldType: 'text' });
  });
});
