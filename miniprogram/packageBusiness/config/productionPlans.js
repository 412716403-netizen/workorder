/**
 * 生产计划模块配置（对齐 shared/types.ts PlanDispatchStatus）
 */

const PlanDispatchStatus = {
  NOT_DISPATCHED: 'NOT_DISPATCHED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
};

const PLAN_DISPATCH_STATUS_LABEL = {
  [PlanDispatchStatus.NOT_DISPATCHED]: '未下单',
  [PlanDispatchStatus.IN_PROGRESS]: '未完成',
  [PlanDispatchStatus.COMPLETED]: '已完成',
};

const PLAN_DISPATCH_STATUS_BY_LABEL = {
  未下单: PlanDispatchStatus.NOT_DISPATCHED,
  未完成: PlanDispatchStatus.IN_PROGRESS,
  已完成: PlanDispatchStatus.COMPLETED,
};

const PlanStatus = {
  DRAFT: 'DRAFT',
  APPROVED: 'APPROVED',
  CONVERTED: 'CONVERTED',
};

const PLAN_STATUS_LABEL = {
  [PlanStatus.DRAFT]: '草稿',
  [PlanStatus.APPROVED]: '已批准',
  [PlanStatus.CONVERTED]: '已转工单',
};

const PRIORITY_LABEL = {
  High: '高',
  Medium: '中',
  Low: '低',
};

const DEFAULT_PAGE_SIZE = 20;

const STATUS_FILTER_TABS = [
  { id: 'all', label: '全部' },
  { id: PlanDispatchStatus.NOT_DISPATCHED, label: PLAN_DISPATCH_STATUS_LABEL.NOT_DISPATCHED },
  { id: PlanDispatchStatus.IN_PROGRESS, label: PLAN_DISPATCH_STATUS_LABEL.IN_PROGRESS },
  { id: PlanDispatchStatus.COMPLETED, label: PLAN_DISPATCH_STATUS_LABEL.COMPLETED },
];

const DETAIL_SECTION_IDS = {
  basic: 'basic',
  quantity: 'quantity',
  assignments: 'assignments',
  purchase: 'purchase',
  hint: 'hint',
};

const DESKTOP_HINT =
  '编辑计划、BOM 用料、生成采购订单、追溯码请在电脑端生产计划中操作';

module.exports = {
  PlanDispatchStatus,
  PLAN_DISPATCH_STATUS_LABEL,
  PLAN_DISPATCH_STATUS_BY_LABEL,
  PlanStatus,
  PLAN_STATUS_LABEL,
  PRIORITY_LABEL,
  DEFAULT_PAGE_SIZE,
  STATUS_FILTER_TABS,
  DETAIL_SECTION_IDS,
  DESKTOP_HINT,
};
