const STORAGE_KEY = 'scanHistory';
const MAX_ITEMS = 20;

function readHistory() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (!raw) return [];
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeHistory(list) {
  wx.setStorageSync(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ITEMS)));
}

function statusLabelFor(status) {
  if (status === 'pending') return '待确认';
  if (status === 'error') return '失败';
  return '成功';
}

/**
 * @param {{ code: string, type: string, typeLabel: string, nodeName?: string, partnerName?: string, status?: string, summary?: string }} entry
 */
function pushScanRecord(entry) {
  const list = readHistory();
  const status = entry.status || 'success';
  const item = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    code: entry.code,
    type: entry.type,
    typeLabel: entry.typeLabel,
    nodeName: entry.nodeName || '',
    partnerName: entry.partnerName || '',
    status,
    statusLabel: statusLabelFor(status),
    summary: entry.summary || '',
    time: formatTime(new Date()),
    timestamp: Date.now(),
  };
  list.unshift(item);
  writeHistory(list);
  return item;
}

function formatTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

module.exports = {
  readHistory,
  pushScanRecord,
  MAX_ITEMS,
};
