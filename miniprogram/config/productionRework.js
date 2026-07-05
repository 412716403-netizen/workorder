/**
 * 返工管理模块配置（对齐 Web ReworkPanel + productionOutsource 快捷入口模式）
 */

const DEFAULT_PAGE_SIZE = 10;

const DESKTOP_HINT = '返工表单配置、流水打印请在电脑端操作';

/** 返工 Hub 筛选面板快捷入口 */
const REWORK_SHORTCUTS = [
  {
    id: 'pending',
    label: '待处理不良',
    icon: '/assets/icons/clipboard-list.png',
    path: '/pages/production-rework-pending/production-rework-pending',
    permission: 'production:rework_defective:allow',
  },
  {
    id: 'defect-flow',
    label: '处理不良流水',
    icon: '/assets/icons/scroll-text.png',
    path: '/pages/production-rework-defect-flow/production-rework-defect-flow',
    permission: 'production:rework_records:view',
  },
  {
    id: 'report-flow',
    label: '返工报工流水',
    icon: '/assets/icons/history.png',
    path: '/pages/production-rework-report-flow/production-rework-report-flow',
    permission: 'production:rework_report_records:view',
  },
];

module.exports = {
  DEFAULT_PAGE_SIZE,
  DESKTOP_HINT,
  REWORK_SHORTCUTS,
};
