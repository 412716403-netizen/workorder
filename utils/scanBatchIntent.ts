import type { ScanItemCodeResult } from '../types';
import type { ScanPayload } from './scanPayload';

export type ScanIntent = 'BATCH' | 'ITEM';

export interface NormalizeScanPayloadDeps {
  scanItemByToken: (token: string) => Promise<ScanItemCodeResult>;
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
    let res: ScanItemCodeResult;
    try {
      res = await deps.scanItemByToken(payload.token);
    } catch (e) {
      return { ok: false, message: (e as Error)?.message ?? '单品码查询失败' };
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
