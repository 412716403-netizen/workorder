import { describe, expect, it } from 'vitest';
import {
  effectiveCustomDocFieldType,
  formatReportCustomDataForList,
  normalizeReportCustomDataValue,
  normalizeReportDisplayFieldDefinitions,
  normalizeReportFieldDefinition,
  normalizeReportFieldDefinitions,
} from './reportCustomDocField';
import type { ReportFieldDefinition } from '../types';

describe('effectiveCustomDocFieldType', () => {
  it('maps legacy number to text', () => {
    expect(effectiveCustomDocFieldType({ type: 'number' })).toBe('text');
  });
  it('maps boolean to select', () => {
    expect(effectiveCustomDocFieldType({ type: 'boolean' })).toBe('select');
  });
  it('passes through canonical types', () => {
    expect(effectiveCustomDocFieldType({ type: 'text' })).toBe('text');
    expect(effectiveCustomDocFieldType({ type: 'date' })).toBe('date');
    expect(effectiveCustomDocFieldType({ type: 'select' })).toBe('select');
    expect(effectiveCustomDocFieldType({ type: 'file' })).toBe('file');
    expect(effectiveCustomDocFieldType({ type: 'knowledge' })).toBe('knowledge');
  });
});

describe('normalizeReportFieldDefinition', () => {
  it('boolean becomes select with default 是/否', () => {
    const f: ReportFieldDefinition = { id: '1', label: 'x', type: 'boolean' as unknown as ReportFieldDefinition['type'] };
    const n = normalizeReportFieldDefinition(f);
    expect(n.type).toBe('select');
    expect(n.options).toEqual(['是', '否']);
  });
  it('boolean keeps existing options', () => {
    const f: ReportFieldDefinition = {
      id: '1',
      label: 'x',
      type: 'boolean' as unknown as ReportFieldDefinition['type'],
      options: ['Y', 'N'],
    };
    const n = normalizeReportFieldDefinition(f);
    expect(n.options).toEqual(['Y', 'N']);
  });
  it('number becomes text', () => {
    const f: ReportFieldDefinition = { id: '1', label: 'n', type: 'number' as unknown as ReportFieldDefinition['type'] };
    const n = normalizeReportFieldDefinition(f);
    expect(n.type).toBe('text');
    expect(n.options).toBeUndefined();
  });
});

describe('normalizeReportFieldDefinitions', () => {
  it('handles empty', () => {
    expect(normalizeReportFieldDefinitions(undefined)).toEqual([]);
    expect(normalizeReportFieldDefinitions(null)).toEqual([]);
    expect(normalizeReportFieldDefinitions([])).toEqual([]);
  });
});

describe('normalizeReportCustomDataValue', () => {
  it('maps boolean stored value to option labels', () => {
    const field = normalizeReportFieldDefinition({
      id: '1',
      label: 'b',
      type: 'boolean' as unknown as ReportFieldDefinition['type'],
    });
    expect(normalizeReportCustomDataValue(field, true)).toBe('是');
    expect(normalizeReportCustomDataValue(field, false)).toBe('否');
  });
});

describe('formatReportCustomDataForList', () => {
  it('formats legacy boolean for select field', () => {
    const field = normalizeReportFieldDefinition({
      id: '1',
      label: 'x',
      type: 'boolean' as unknown as ReportFieldDefinition['type'],
    });
    expect(formatReportCustomDataForList(field, true)).toBe('是');
    expect(formatReportCustomDataForList(field, false)).toBe('否');
  });
  it('abbreviates file data url', () => {
    const f: ReportFieldDefinition = { id: '1', label: 'f', type: 'file' };
    expect(formatReportCustomDataForList(f, 'data:image/png;base64,xx')).toBe('[附件]');
  });
  it('shows knowledge title', () => {
    const f: ReportFieldDefinition = { id: '1', label: 'k', type: 'knowledge' };
    expect(formatReportCustomDataForList(f, '{"id":"d1","title":"工艺SOP"}')).toBe('工艺SOP');
    expect(formatReportCustomDataForList(f, '{"id":"d1","title":""}')).toBe('[资料库文件]');
    expect(formatReportCustomDataForList(f, '')).toBe('');
  });
});

describe('normalizeReportDisplayFieldDefinitions', () => {
  it('keeps text, file and knowledge', () => {
    const defs: ReportFieldDefinition[] = [
      { id: 'a', label: 't', type: 'text' },
      { id: 'b', label: 'f', type: 'file' },
      { id: 'c', label: 'k', type: 'knowledge' },
    ];
    expect(normalizeReportDisplayFieldDefinitions(defs)).toEqual(defs);
  });
  it('downgrades date/select to text', () => {
    const defs: ReportFieldDefinition[] = [
      { id: 'a', label: 'd', type: 'date', dateWithTime: true },
      { id: 'b', label: 's', type: 'select', options: ['a', 'b'] },
    ];
    const out = normalizeReportDisplayFieldDefinitions(defs);
    expect(out[0].type).toBe('text');
    expect(out[0].dateWithTime).toBeUndefined();
    expect(out[1].type).toBe('text');
    expect(out[1].options).toBeUndefined();
  });
});
