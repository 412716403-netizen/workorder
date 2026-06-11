import { describe, expect, it, vi } from 'vitest';
import { normalizeScanPayloadForIntent } from './scanBatchIntent';
import type { ScanPayload } from './scanPayload';

const item = (raw: string, token = 't1'): ScanPayload => ({ kind: 'ITEM', token, raw });
const batch = (raw: string, token = 'b1'): ScanPayload => ({ kind: 'BATCH', token, raw });

const batchNotFound = () => Promise.reject(new Error('批次码不存在'));

function deps(overrides: Partial<Parameters<typeof normalizeScanPayloadForIntent>[2]> = {}) {
  return {
    scanItemByToken: vi.fn(),
    scanBatchByToken: vi.fn(batchNotFound),
    ...overrides,
  };
}

describe('normalizeScanPayloadForIntent', () => {
  it('ITEM intent + BATCH payload → reject', async () => {
    const r = await normalizeScanPayloadForIntent('ITEM', batch('x'), deps());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('按件累计');
  });

  it('BATCH intent + BATCH payload → pass through', async () => {
    const p = batch('x');
    const r = await normalizeScanPayloadForIntent('BATCH', p, deps());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload).toEqual(p);
  });

  it('BATCH intent + ITEM payload → bare batch token resolves via batch scan first', async () => {
    const r = await normalizeScanPayloadForIntent('BATCH', item('raw', 'btok'), {
      scanBatchByToken: async () =>
        ({
          kind: 'VIRTUAL_BATCH',
          status: 'ACTIVE',
        }) as import('../types').ScanVirtualBatchResult,
      scanItemByToken: vi.fn(),
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.kind).toBe('BATCH');
      expect(r.payload.token).toBe('btok');
    }
  });

  it('BATCH intent + ITEM payload → normalize when batchScanToken present', async () => {
    const r = await normalizeScanPayloadForIntent('BATCH', item('raw', 'itok'), {
      scanBatchByToken: batchNotFound,
      scanItemByToken: async () =>
        ({
          kind: 'ITEM_CODE',
          status: 'ACTIVE',
          batchScanToken: 'batchtok',
        }) as import('../types').ScanItemCodeResult,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.kind).toBe('BATCH');
      expect(r.payload.token).toBe('batchtok');
      expect(r.payload.raw).toBe('raw');
    }
  });

  it('BATCH intent + ITEM without batchScanToken → fixed message', async () => {
    const r = await normalizeScanPayloadForIntent('BATCH', item('raw'), {
      scanBatchByToken: batchNotFound,
      scanItemByToken: async () =>
        ({
          kind: 'ITEM_CODE',
          status: 'ACTIVE',
          batchScanToken: null,
        }) as import('../types').ScanItemCodeResult,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('该单品码没有对应的批次信息');
  });

  it('BATCH intent + voided item → reject', async () => {
    const r = await normalizeScanPayloadForIntent('BATCH', item('raw'), {
      scanBatchByToken: batchNotFound,
      scanItemByToken: async () =>
        ({
          kind: 'ITEM_CODE',
          status: 'VOIDED',
          message: '已作废',
        }) as import('../types').ScanItemCodeResult,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('已作废');
  });

  it('BATCH intent + IME-corrupted bare token → suggests input method on not found', async () => {
    const raw = 'cabbaeb9。wrongtokenhere';
    const r = await normalizeScanPayloadForIntent('BATCH', item(raw, 'cabbaeb9.wrongtokenhere'), {
      scanBatchByToken: batchNotFound,
      scanItemByToken: async () => {
        throw new Error('单品码不存在');
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toContain('输入法');
      expect(r.message).not.toBe('单品码不存在');
    }
  });
});
