/**
 * 批量扫码：按批/按件累计归一化（对齐 Web utils/scanBatchIntent.ts）
 */
const { fetchScanByPayload } = require('./scanApi.js');
const { rewriteScanApiErrorForIme } = require('./scanPayload.js');

const SCAN_BATCH_NOT_FOUND_RE = /批次码不存在/;
const SCAN_ITEM_NOT_FOUND_RE = /单品码不存在/;

/**
 * @param {'BATCH'|'ITEM'} intent
 * @param {{ kind: string, token: string|null, raw: string }} payload
 */
async function normalizeScanPayloadForIntent(intent, payload) {
  if (payload.kind === 'UNKNOWN' || !payload.token) {
    return { ok: false, message: '无法识别该扫码内容' };
  }
  if (intent === 'ITEM' && payload.kind === 'BATCH') {
    return { ok: false, message: '当前为按件累计，请扫单品标签，勿扫批次标签' };
  }
  if (intent === 'BATCH' && payload.kind === 'ITEM') {
    let batchNotFound = false;
    try {
      const batchRes = await fetchScanByPayload({ kind: 'BATCH', token: payload.token, raw: payload.raw });
      if (batchRes.kind === 'VIRTUAL_BATCH') {
        if (batchRes.status === 'VOIDED') {
          return { ok: false, message: batchRes.message || '该批次码已作废' };
        }
        return {
          ok: true,
          payload: { kind: 'BATCH', token: payload.token, raw: payload.raw },
        };
      }
    } catch (e) {
      const batchMsg = (e && e.message) || '批次码查询失败';
      if (SCAN_BATCH_NOT_FOUND_RE.test(batchMsg)) {
        batchNotFound = true;
      } else {
        return { ok: false, message: rewriteScanApiErrorForIme(payload.raw, batchMsg) };
      }
    }

    let res;
    try {
      res = await fetchScanByPayload({ kind: 'ITEM', token: payload.token, raw: payload.raw });
    } catch (e) {
      const itemMsg = (e && e.message) || '单品码查询失败';
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
      return { ok: false, message: res.message || '该单品码已作废' };
    }
    const tok = (res.batchScanToken || '').trim();
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

module.exports = {
  normalizeScanPayloadForIntent,
};
