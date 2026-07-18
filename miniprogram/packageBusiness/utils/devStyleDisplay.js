const {
  DevStyleStatus,
  DevStageStatus,
  DEV_STAGE_STATUS_LABEL,
  DEV_STYLE_STATUS_LABEL,
} = require('./devStyleConstants.js');

function getDevSampleSidebarProgress(sample) {
  const stages = (sample && sample.stages) || [];
  const errorSt = stages.find((st) => st.status === DevStageStatus.EXCEPTION);
  if (errorSt) {
    return { kind: 'exception', label: `异常 (${errorSt.name})` };
  }
  const inProgress = stages.find((st) => st.status === DevStageStatus.IN_PROGRESS);
  if (inProgress) {
    return { kind: 'in_progress', label: inProgress.name };
  }
  if (stages.length > 0 && stages.every((st) => st.status === DevStageStatus.COMPLETED)) {
    return { kind: 'completed', label: DEV_STAGE_STATUS_LABEL.completed };
  }
  return { kind: 'pending', label: DEV_STAGE_STATUS_LABEL.pending };
}

function resolveDevStyleCustomerName(style, partners) {
  const legacy = style && style.customerName ? String(style.customerName).trim() : '';
  if (legacy) return legacy;
  const sid = style && style.supplierId ? String(style.supplierId).trim() : '';
  if (!sid || !partners || !partners.length) return undefined;
  const p = partners.find((x) => x.id === sid);
  return p && p.name ? String(p.name).trim() : undefined;
}

function formatDevStyleCreatedAt(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso || '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  } catch {
    return iso || '';
  }
}

function isDevStyleArchived(style) {
  return style && style.status === DevStyleStatus.ARCHIVED;
}

function isDevStylePublished(style) {
  return style && style.status === DevStyleStatus.PUBLISHED;
}

function isDevStyleReadOnly(style) {
  return isDevStylePublished(style);
}

function canDeleteDevStyle(style) {
  if (!style || style.status === DevStyleStatus.PUBLISHED) return false;
  const samples = style.samples || [];
  return samples.every((s) =>
    (s.stages || []).every((st, idx) => {
      if (idx === 0) return st.status === 'pending' || st.status === 'in_progress';
      return st.status === 'pending';
    }),
  );
}

function devStageHasEnteredData(stage) {
  if (!stage) return false;
  if ((stage.attachments || []).length > 0) return true;
  return (stage.fields || []).some((f) => String((f && f.value) || '').trim() !== '');
}

function canDeleteDevSample(sample) {
  return (sample.stages || []).every((st, idx) => {
    if (st.status === DevStageStatus.PENDING) return true;
    if (idx === 0 && st.status === DevStageStatus.IN_PROGRESS && !devStageHasEnteredData(st)) {
      return true;
    }
    return false;
  });
}

function getDevSampleDeleteBlockReason(sample) {
  if (!canDeleteDevSample(sample)) {
    return '该样品轮次存在已录入资料或已推进的节点，无法删除';
  }
  return null;
}

function styleStatusLabel(status) {
  return DEV_STYLE_STATUS_LABEL[status] || status || '';
}

function stageStatusLabel(status) {
  return DEV_STAGE_STATUS_LABEL[status] || status || '';
}

/** 列表卡片缩略图：imageThumb || imageUrl */
function resolveDevStyleThumb(style) {
  if (!style) return '';
  return style.imageThumb || style.imageUrl || '';
}

module.exports = {
  getDevSampleSidebarProgress,
  resolveDevStyleCustomerName,
  formatDevStyleCreatedAt,
  isDevStyleArchived,
  isDevStylePublished,
  isDevStyleReadOnly,
  canDeleteDevStyle,
  canDeleteDevSample,
  getDevSampleDeleteBlockReason,
  devStageHasEnteredData,
  styleStatusLabel,
  stageStatusLabel,
  resolveDevStyleThumb,
};
