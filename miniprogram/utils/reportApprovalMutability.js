/**
 * 报工审核后是否允许编辑/删除（对齐 shared/types.ts reportAllowsEditDelete）
 */
const WORKER_SELF_REPORT_NO_PREFIX = 'ZBG';

function reportAllowsEditDelete(approvalStatus, reportNo) {
  if (approvalStatus === 'REJECTED') return false;
  if (approvalStatus === 'PENDING') return true;
  if (approvalStatus === 'APPROVED') {
    const no = (reportNo || '').trim();
    if (no.startsWith(WORKER_SELF_REPORT_NO_PREFIX)) return false;
    return true;
  }
  return true;
}

module.exports = {
  reportAllowsEditDelete,
};
