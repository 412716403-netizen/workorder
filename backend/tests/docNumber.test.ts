import { describe, expect, it, vi } from 'vitest';
import {
  getMaxPlnWoPrimarySeq,
  getNextPlanNumber,
  getNextWorkOrderNumber,
  parsePlnWoPrimarySeq,
  planNumberToOrderNumber,
} from '../src/utils/docNumber.js';

describe('parsePlnWoPrimarySeq', () => {
  it('parses PLN and WO primary sequence', () => {
    expect(parsePlnWoPrimarySeq('PLN40')).toBe(40);
    expect(parsePlnWoPrimarySeq('PLN-40')).toBe(40);
    expect(parsePlnWoPrimarySeq('WO40')).toBe(40);
    expect(parsePlnWoPrimarySeq('wo39')).toBe(39);
  });

  it('ignores suffix segments', () => {
    expect(parsePlnWoPrimarySeq('PLN40-S1')).toBe(40);
    expect(parsePlnWoPrimarySeq('PLN40-1')).toBe(40);
    expect(parsePlnWoPrimarySeq('WO2-1-2')).toBe(2);
  });

  it('returns null for unrelated numbers', () => {
    expect(parsePlnWoPrimarySeq('PO-0001')).toBeNull();
    expect(parsePlnWoPrimarySeq('')).toBeNull();
  });
});

describe('planNumberToOrderNumber', () => {
  it('converts PLN to WO preserving suffix', () => {
    expect(planNumberToOrderNumber('PLN40')).toBe('WO40');
    expect(planNumberToOrderNumber('PLN40-S1')).toBe('WO40-S1');
    expect(planNumberToOrderNumber('PLN-40')).toBe('WO40');
    expect(planNumberToOrderNumber('PLN40-1')).toBe('WO40-1');
  });
});

describe('getMaxPlnWoPrimarySeq / unified numbering', () => {
  const tenantId = 'tenant-1';

  function mockDb(planNumbers: string[], orderNumbers: string[]) {
    return {
      planOrder: {
        findMany: vi.fn().mockResolvedValue(planNumbers.map(planNumber => ({ planNumber }))),
      },
      productionOrder: {
        findMany: vi.fn().mockResolvedValue(orderNumbers.map(orderNumber => ({ orderNumber }))),
      },
    };
  }

  it('uses max across plans and orders', async () => {
    const db = mockDb(['PLN39', 'PLN5-S1'], ['WO38', 'WO39']);
    await expect(getMaxPlnWoPrimarySeq(tenantId, db as never)).resolves.toBe(39);
  });

  it('allocates next plan number after highest WO when plan not yet at that seq', async () => {
    const db = mockDb(['PLN39'], ['WO40']);
    await expect(getNextPlanNumber(tenantId, db as never)).resolves.toBe('PLN41');
  });

  it('allocates next WO after highest plan when order not yet at that seq', async () => {
    const db = mockDb(['PLN40'], ['WO39']);
    await expect(getNextWorkOrderNumber(tenantId, db as never)).resolves.toBe('WO41');
  });

  it('continues sequence when plans and orders aligned', async () => {
    const db = mockDb(['PLN39'], ['WO39']);
    await expect(getNextPlanNumber(tenantId, db as never)).resolves.toBe('PLN40');
    await expect(getNextWorkOrderNumber(tenantId, db as never)).resolves.toBe('WO40');
  });
});
