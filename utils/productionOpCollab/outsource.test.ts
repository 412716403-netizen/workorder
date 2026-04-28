import { describe, it, expect } from 'vitest';
import {
  OUTSOURCE_DISPATCH_CUSTOM_DATA_KEY,
  mergeOutsourceDetailEditCollab,
} from './outsource';

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
});
