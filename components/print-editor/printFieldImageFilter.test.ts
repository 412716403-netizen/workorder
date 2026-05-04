import { describe, it, expect } from 'vitest';
import type { PrintFieldOption } from './printFieldOptions';
import {
  filterPrintFieldOptionsForImageFieldPicker,
  filterPrintFieldOptionsForTextLikeTables,
} from './printFieldOptions';

const sample: PrintFieldOption[] = [
  { group: '系统', value: '系统.pageCurrent', label: '当前页码' },
  { group: '产品', value: '产品.name', label: '产品名称' },
  { group: '产品', value: '产品.imageUrl', label: '产品主图', isFileOrImageField: true },
  { group: '计划', value: '计划.custom.f1', label: '附件', isFileOrImageField: true },
  { group: '计划', value: '计划.custom.t1', label: '备注', isFileOrImageField: false },
];

describe('filterPrintFieldOptionsForTextLikeTables', () => {
  it('excludes product main image and file custom fields', () => {
    const out = filterPrintFieldOptionsForTextLikeTables(sample);
    expect(out.map(o => o.value)).toEqual(['系统.pageCurrent', '产品.name', '计划.custom.t1']);
  });
});

describe('filterPrintFieldOptionsForImageFieldPicker', () => {
  it('keeps only image-like options', () => {
    const out = filterPrintFieldOptionsForImageFieldPicker(sample);
    expect(out.map(o => o.value)).toEqual(['产品.imageUrl', '计划.custom.f1']);
  });
});
