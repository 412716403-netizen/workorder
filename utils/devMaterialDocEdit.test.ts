import { describe, it, expect } from 'vitest';
import type { DevMaterialDocGroup } from '../types';
import {
  buildDocEditDraft,
  buildDocUpdateBody,
  removeDraftLine,
  updateDraftLine,
  validateDocEditDraft,
} from './devMaterialDocEdit';

const sampleDoc: DevMaterialDocGroup = {
  docNo: 'LL1',
  type: 'STOCK_OUT',
  timestamp: '2026-01-15T10:30:00.000Z',
  operator: '张三',
  lines: [
    {
      id: 'a',
      productId: 'm1',
      productName: '面料A',
      productSku: 'SKU1',
      quantity: 5,
      warehouseId: 'wh1',
      batchNo: 'B1',
    },
    {
      id: 'b',
      productId: 'm2',
      productName: '辅料B',
      productSku: 'SKU2',
      quantity: 2,
      warehouseId: 'wh1',
      batchNo: null,
    },
  ],
};

describe('devMaterialDocEdit', () => {
  it('buildDocEditDraft maps doc group to editable draft', () => {
    const draft = buildDocEditDraft(sampleDoc);
    expect(draft.docNo).toBe('LL1');
    expect(draft.type).toBe('STOCK_OUT');
    expect(draft.operator).toBe('张三');
    expect(draft.lines).toHaveLength(2);
    expect(draft.lines[0]).toMatchObject({ id: 'a', quantity: 5, batchNo: 'B1' });
    expect(draft.lines[1].batchNo).toBe('');
    expect(draft.entryTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('removeDraftLine drops one line', () => {
    const draft = buildDocEditDraft(sampleDoc);
    const next = removeDraftLine(draft, 'a');
    expect(next.lines.map((l) => l.id)).toEqual(['b']);
  });

  it('updateDraftLine patches quantity/warehouse/batch', () => {
    const draft = buildDocEditDraft(sampleDoc);
    const next = updateDraftLine(draft, 'a', { quantity: 8, warehouseId: 'wh2' });
    expect(next.lines[0]).toMatchObject({ id: 'a', quantity: 8, warehouseId: 'wh2', batchNo: 'B1' });
    expect(next.lines[1].quantity).toBe(2);
  });

  it('buildDocUpdateBody builds API payload', () => {
    const draft = buildDocEditDraft(sampleDoc);
    const body = buildDocUpdateBody(draft, '李四', '2026-04-21T14:30');
    expect(body.operator).toBe('李四');
    expect(body.timestamp).toMatch(/2026-04-21/);
    expect(body.lines).toEqual([
      { id: 'a', quantity: 5, warehouseId: 'wh1', batchNo: 'B1' },
      { id: 'b', quantity: 2, warehouseId: 'wh1', batchNo: null },
    ]);
  });

  it('validateDocEditDraft rejects empty lines', () => {
    const draft = buildDocEditDraft(sampleDoc);
    const empty = { ...draft, lines: [] };
    expect(validateDocEditDraft(empty, new Set())).toMatch(/至少保留一条明细/);
  });

  it('validateDocEditDraft rejects missing warehouse / non-positive qty / missing batch', () => {
    const draft = buildDocEditDraft(sampleDoc);
    expect(
      validateDocEditDraft(
        { ...draft, lines: [{ ...draft.lines[0], warehouseId: '' }] },
        new Set(),
      ),
    ).toMatch(/仓库/);
    expect(
      validateDocEditDraft(
        { ...draft, lines: [{ ...draft.lines[0], quantity: 0 }] },
        new Set(),
      ),
    ).toMatch(/数量/);
    expect(
      validateDocEditDraft(
        { ...draft, lines: [{ ...draft.lines[0], batchNo: '' }] },
        new Set(['m1']),
      ),
    ).toMatch(/批次/);
  });

  it('validateDocEditDraft passes valid draft', () => {
    const draft = buildDocEditDraft(sampleDoc);
    expect(validateDocEditDraft(draft, new Set(['m1']))).toBeNull();
  });
});
