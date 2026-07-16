import { describe, expect, it } from 'vitest';
import {
  getKnowledgeTableCellAlign,
  isKnowledgeSelectionInTable,
} from './knowledgeTableAlign';

function mockEditor(opts: {
  isActiveTable?: boolean;
  isHeader?: boolean;
  attrs?: Record<string, unknown>;
}) {
  return {
    isActive: (name: string) => {
      if (name === 'table') return !!opts.isActiveTable;
      if (name === 'tableHeader') return !!opts.isHeader;
      if (name === 'tableCell') return !opts.isHeader && !!opts.isActiveTable;
      return false;
    },
    getAttributes: () => opts.attrs ?? {},
  } as never;
}

describe('isKnowledgeSelectionInTable', () => {
  it('detects table context', () => {
    expect(isKnowledgeSelectionInTable(mockEditor({ isActiveTable: true }))).toBe(true);
    expect(isKnowledgeSelectionInTable(mockEditor({ isActiveTable: false }))).toBe(false);
  });
});

describe('getKnowledgeTableCellAlign', () => {
  it('reads valid align attrs', () => {
    expect(
      getKnowledgeTableCellAlign(mockEditor({
        isActiveTable: true,
        attrs: { align: 'center', verticalAlign: 'middle' },
      })),
    ).toEqual({ align: 'center', verticalAlign: 'middle' });
  });

  it('ignores invalid align values', () => {
    expect(
      getKnowledgeTableCellAlign(mockEditor({
        isActiveTable: true,
        attrs: { align: 'justify', verticalAlign: 'baseline' },
      })),
    ).toEqual({ align: null, verticalAlign: null });
  });
});
