import type { ScanItemCodeResult, ScanVirtualBatchResult } from '../types';
import type { ScanPayload } from './scanPayload';
import { rewriteScanApiErrorForIme } from './scanPayload';

export type ScanIntent = 'BATCH' | 'ITEM';

const SCAN_BATCH_NOT_FOUND_RE = /批次码不存在/;
const SCAN_ITEM_NOT_FOUND_RE = /单品码不存在/;

export interface NormalizeScanPayloadDeps {
  scanItemByToken: (token: string) => Promise<ScanItemCodeResult>;
  scanBatchByToken: (token: string) => Promise<ScanVirtualBatchResult>;
}

/**
 * 批量扫码弹窗：按所选「批次码 / 单品码」方式把 parseScanPayload 结果规范化为
 * 最终写入列表与 onApply 的 payload（批次方式下扫单品 → BATCH + 批次 scanToken）。
 */
export async function normalizeScanPayloadForIntent(
  intent: ScanIntent,
  payload: ScanPayload,
  deps: NormalizeScanPayloadDeps,
): Promise<{ ok: true; payload: ScanPayload } | { ok: false; message: string }> {
  if (payload.kind === 'UNKNOWN' || !payload.token) {
    return { ok: false, message: '无法识别该扫码内容' };
  }
  if (intent === 'ITEM' && payload.kind === 'BATCH') {
    return { ok: false, message: '当前为单品码扫码，请勿扫批次码' };
  }
  if (intent === 'BATCH' && payload.kind === 'ITEM') {
    let batchNotFound = false;
    try {
      const batchRes = await deps.scanBatchByToken(payload.token);
      if (batchRes.kind === 'VIRTUAL_BATCH') {
        if (batchRes.status === 'VOIDED') {
          return { ok: false, message: batchRes.message ?? '该批次码已作废' };
        }
        return {
          ok: true,
          payload: { kind: 'BATCH', token: payload.token, raw: payload.raw },
        };
      }
    } catch (e) {
      const batchMsg = (e as Error)?.message ?? '批次码查询失败';
      if (SCAN_BATCH_NOT_FOUND_RE.test(batchMsg)) {
        batchNotFound = true;
      } else {
        return { ok: false, message: rewriteScanApiErrorForIme(payload.raw, batchMsg) };
      }
    }

    let res: ScanItemCodeResult;
    try {
      res = await deps.scanItemByToken(payload.token);
    } catch (e) {
      const itemMsg = (e as Error)?.message ?? '单品码查询失败';
      const preferBatch = batchNotFound && SCAN_ITEM_NOT_FOUND_RE.test(itemMsg);
      return {
        ok: false,
        message: rewriteScanApiErrorForIme(
          payload.raw,
          preferBatch ? '批次码不存在' : itemMsg,
        ),
      };
    }
    if (res.status === 'VOIDED') {
      return { ok: false, message: res.message ?? '该单品码已作废' };
    }
    const tok = res.batchScanToken?.trim();
    if (!tok) {
      return { ok: false, message: '该单品码没有对应的批次信息' };
    }
    return {
      ok: true,
      payload: { kind: 'BATCH', token: tok, raw: payload.raw },
    };
  }
  return { ok: true, payload };
}
