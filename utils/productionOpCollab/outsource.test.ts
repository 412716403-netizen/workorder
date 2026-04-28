import { describe, it, expect } from 'vitest';
import {
  OUTSOURCE_DISPATCH_CUSTOM_DATA_KEY,
  OUTSOURCE_DISPATCH_DELIVERY_DATE_KEY,
  buildOutsourceDispatchCollabSnapshot,
  mergeOutsourceDetailEditCollab,
} from './outsource';

describe('buildOutsourceDispatchCollabSnapshot', () => {
  it('returns only custom when no delivery date', () => {
    const r = buildOutsourceDispatchCollabSnapshot({ a: '1' }, '');
    expect(r.collabData?.[OUTSOURCE_DISPATCH_CUSTOM_DATA_KEY]).toEqual({ a: '1' });
    expect(r.collabData?.[OUTSOURCE_DISPATCH_DELIVERY_DATE_KEY]).toBeUndefined();
  });

  it('merges delivery date with custom', () => {
    const r = buildOutsourceDispatchCollabSnapshot({ a: '1' }, '2026-04-28');
    expect(r.collabData?.[OUTSOURCE_DISPATCH_DELIVERY_DATE_KEY]).toBe('2026-04-28');
  });

  it('returns only delivery when no custom', () => {
    const r = buildOutsourceDispatchCollabSnapshot({}, '2026-01-02');
    expect(r.collabData?.[OUTSOURCE_DISPATCH_CUSTOM_DATA_KEY]).toBeUndefined();
    expect(r.collabData?.[OUTSOURCE_DISPATCH_DELIVERY_DATE_KEY]).toBe('2026-01-02');
  });
});

describe('mergeOutsourceDetailEditCollab', () => {
  it('writes empty clean object to custom key so old segment is cleared', () => {
    const preserved = {
      foo: 1,
      [OUTSOURCE_DISPATCH_CUSTOM_DATA_KEY]: { oldField: 'x' },
    };
    const result = mergeOutsourceDetailEditCollab(
      preserved,
      OUTSOURCE_DISPATCH_CUSTOM_DATA_KEY,
      {},
    );
    expect(result.collabData?.[OUTSOURCE_DISPATCH_CUSTOM_DATA_KEY]).toEqual({});
    expect(result.collabData?.foo).toBe(1);
  });

  it('merges non-empty cleaned fields', () => {
    const result = mergeOutsourceDetailEditCollab(
      undefined,
      OUTSOURCE_DISPATCH_CUSTOM_DATA_KEY,
      { a: '1', b: '' },
    );
    expect(result.collabData?.[OUTSOURCE_DISPATCH_CUSTOM_DATA_KEY]).toEqual({ a: '1' });
  });

  it('writes dispatch delivery date when updateDispatchDeliveryDate', () => {
    const result = mergeOutsourceDetailEditCollab(undefined, OUTSOURCE_DISPATCH_CUSTOM_DATA_KEY, {}, {
      updateDispatchDeliveryDate: true,
      dispatchDeliveryDate: '2026-05-01',
    });
    expect(result.collabData?.[OUTSOURCE_DISPATCH_DELIVERY_DATE_KEY]).toBe('2026-05-01');
  });

  it('removes dispatch delivery date when cleared and updateDispatchDeliveryDate', () => {
    const preserved = { [OUTSOURCE_DISPATCH_DELIVERY_DATE_KEY]: '2026-01-01', [OUTSOURCE_DISPATCH_CUSTOM_DATA_KEY]: {} };
    const result = mergeOutsourceDetailEditCollab(preserved, OUTSOURCE_DISPATCH_CUSTOM_DATA_KEY, {}, {
      updateDispatchDeliveryDate: true,
      dispatchDeliveryDate: '',
    });
    expect(result.collabData?.[OUTSOURCE_DISPATCH_DELIVERY_DATE_KEY]).toBeUndefined();
  });
});
