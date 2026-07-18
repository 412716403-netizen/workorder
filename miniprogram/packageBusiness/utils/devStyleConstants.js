/** 与 shared/types.ts DevStyleStatus / DevStageStatus 对齐 */

const DevStyleStatus = {
  DEVELOPING: 'developing',
  ARCHIVED: 'archived',
  PUBLISHED: 'published',
};

const DEV_STYLE_STATUS_LABEL = {
  developing: '开发中',
  archived: '已归档',
  published: '已发布大货',
};

const DevStageStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  EXCEPTION: 'exception',
};

const DEV_STAGE_STATUS_LABEL = {
  pending: '待开始',
  in_progress: '进行中',
  completed: '已完成',
  exception: '异常/退回',
};

module.exports = {
  DevStyleStatus,
  DEV_STYLE_STATUS_LABEL,
  DevStageStatus,
  DEV_STAGE_STATUS_LABEL,
};
