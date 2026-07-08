/**
 * 报工扫码溯源元数据（对齐 Web useReportModalState reportScanLink / scanItemCodeIds）
 */
const SCAN_ITEM_CODE_IDS_KEY = '__scanItemCodeIds';

function scanTraceKey(variantId) {
  return variantId || '';
}

function createReportScanMetaSession() {
  return {
    link: { itemCodeId: null, virtualBatchId: null },
    hadBatchScan: false,
    itemCodeIdsByVariant: new Map(),
  };
}

function resetReportScanMeta(page) {
  page._reportScanMeta = createReportScanMetaSession();
}

/**
 * @param {WechatMiniprogram.Page.Instance} page
 * @param {{ detail?: object; vid?: string; payloadKind?: string }} prepared
 */
function recordReportScanMeta(page, prepared) {
  if (!page._reportScanMeta) resetReportScanMeta(page);
  const meta = page._reportScanMeta;
  const detail = prepared && prepared.detail;
  const kind = (prepared && prepared.payloadKind) || (detail && detail.kindLabel === '批次' ? 'BATCH' : 'ITEM');
  const vid = scanTraceKey((prepared && prepared.vid) || (detail && detail.variantId) || '');
  const itemCodeId = (detail && detail.itemCodeId) || null;
  const virtualBatchId = (detail && detail.virtualBatchId) || null;

  if (kind === 'BATCH' && virtualBatchId) {
    meta.hadBatchScan = true;
    meta.link.virtualBatchId = virtualBatchId;
    meta.link.itemCodeId = null;
    return;
  }

  if (itemCodeId) {
    meta.link.itemCodeId = itemCodeId;
    if (virtualBatchId) meta.link.virtualBatchId = virtualBatchId;
    const prev = meta.itemCodeIdsByVariant.get(vid) || [];
    if (prev.indexOf(itemCodeId) < 0) prev.push(itemCodeId);
    meta.itemCodeIdsByVariant.set(vid, prev);
  } else if (virtualBatchId) {
    meta.link.virtualBatchId = virtualBatchId;
  }
}

function collectScanItemCodeIds(meta, variantId) {
  if (!meta || meta.hadBatchScan) return [];
  const key = scanTraceKey(variantId || '');
  const direct = meta.itemCodeIdsByVariant.get(key) || [];
  if (direct.length) return direct.slice();
  const undiff = meta.itemCodeIdsByVariant.get('') || [];
  return undiff.slice();
}

/**
 * @param {ReturnType<typeof createReportScanMetaSession>} meta
 * @param {string|null|undefined} variantId
 * @param {Record<string, unknown>} customData
 */
function buildReportScanPayloadFields(meta, variantId, customData) {
  const base = customData && typeof customData === 'object' ? { ...customData } : {};
  if (!meta) return { customData: base };

  const scanItemCodeIds = collectScanItemCodeIds(meta, variantId);
  const link = meta.link || { itemCodeId: null, virtualBatchId: null };

  if (scanItemCodeIds.length > 0 && !meta.hadBatchScan) {
    base[SCAN_ITEM_CODE_IDS_KEY] = scanItemCodeIds;
  }

  let itemCodeId;
  if (!meta.hadBatchScan) {
    if (scanItemCodeIds.length === 1) {
      itemCodeId = scanItemCodeIds[0];
    } else if (!scanItemCodeIds.length && link.itemCodeId) {
      itemCodeId = link.itemCodeId;
    }
  }

  return {
    itemCodeId,
    virtualBatchId: link.virtualBatchId || undefined,
    customData: base,
  };
}

module.exports = {
  SCAN_ITEM_CODE_IDS_KEY,
  createReportScanMetaSession,
  resetReportScanMeta,
  recordReportScanMeta,
  buildReportScanPayloadFields,
};
