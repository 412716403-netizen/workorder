import { describe, it, expect, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { withSerializableRetry } from '../src/utils/withSerializableRetry.js';

function p2034(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('serialization', {
    code: 'P2034',
    clientVersion: 'test',
  });
}

describe('withSerializableRetry', () => {
  it('retries on P2034 then succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(p2034())
      .mockRejectedValueOnce(p2034())
      .mockResolvedValueOnce(42);

    const r = await withSerializableRetry(fn, { maxAttempts: 5, baseDelayMs: 1 });
    expect(r).toBe(42);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('rethrows non-P2034 immediately', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' });
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withSerializableRetry(fn, { maxAttempts: 5, baseDelayMs: 1 })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws last error after max attempts', async () => {
    const fn = vi.fn().mockImplementation(() => Promise.reject(p2034()));
    await expect(withSerializableRetry(fn, { maxAttempts: 3, baseDelayMs: 1 })).rejects.toMatchObject({
      code: 'P2034',
    });
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
