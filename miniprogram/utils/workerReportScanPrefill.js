/** 可报任务扫码 → 自报工表单的一次性预填（读后即删） */
const STORAGE_KEY = 'workerReportScanPrefill';

function writeWorkerReportScanPrefill(payload) {
  try {
    wx.setStorageSync(STORAGE_KEY, payload);
  } catch {
    /* ignore */
  }
}

function readWorkerReportScanPrefill() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    wx.removeStorageSync(STORAGE_KEY);
    return raw && typeof raw === 'object' ? raw : null;
  } catch {
    return null;
  }
}

function serializeReportScanMeta(meta) {
  if (!meta) return null;
  const itemCodeIdsByVariant = [];
  if (meta.itemCodeIdsByVariant && typeof meta.itemCodeIdsByVariant.forEach === 'function') {
    meta.itemCodeIdsByVariant.forEach((ids, vid) => {
      itemCodeIdsByVariant.push([vid, ids]);
    });
  } else if (meta.itemCodeIdsByVariant && typeof meta.itemCodeIdsByVariant === 'object') {
    Object.keys(meta.itemCodeIdsByVariant).forEach((vid) => {
      itemCodeIdsByVariant.push([vid, meta.itemCodeIdsByVariant[vid]]);
    });
  }
  return {
    link: meta.link || { itemCodeId: null, virtualBatchId: null },
    hadBatchScan: !!meta.hadBatchScan,
    itemCodeIdsByVariant,
  };
}

function deserializeReportScanMeta(serialized) {
  if (!serialized) return null;
  const itemCodeIdsByVariant = new Map();
  (serialized.itemCodeIdsByVariant || []).forEach((entry) => {
    if (Array.isArray(entry) && entry.length >= 2) {
      itemCodeIdsByVariant.set(entry[0], entry[1]);
    }
  });
  return {
    link: serialized.link || { itemCodeId: null, virtualBatchId: null },
    hadBatchScan: !!serialized.hadBatchScan,
    itemCodeIdsByVariant,
  };
}

module.exports = {
  STORAGE_KEY,
  writeWorkerReportScanPrefill,
  readWorkerReportScanPrefill,
  serializeReportScanMeta,
  deserializeReportScanMeta,
};
