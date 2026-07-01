/**
 * 协作单据状态文案（对齐 Web views/collaboration/collabHelpers.tsx）
 */

function dispatchStatusLabel(status) {
  if (status === 'PENDING') return '待接受';
  if (status === 'FORWARDED') return '已转发';
  if (status === 'WITHDRAWN') return '已撤回';
  return '已接受';
}

function returnStatusLabel(status) {
  if (status === 'PENDING_A_RECEIVE') return '待甲方收回';
  if (status === 'WITHDRAWN') return '已撤回';
  return '已收回';
}

function forwardStatusLabel(originConfirmedAt) {
  return originConfirmedAt ? '已确认转发' : '待甲方确认';
}

function dispatchStatusTone(status) {
  if (status === 'PENDING') return 'warning';
  if (status === 'FORWARDED') return 'info';
  if (status === 'WITHDRAWN') return 'muted';
  return 'success';
}

function returnStatusTone(status) {
  if (status === 'PENDING_A_RECEIVE') return 'warning';
  if (status === 'WITHDRAWN') return 'muted';
  return 'success';
}

module.exports = {
  dispatchStatusLabel,
  returnStatusLabel,
  forwardStatusLabel,
  dispatchStatusTone,
  returnStatusTone,
};
