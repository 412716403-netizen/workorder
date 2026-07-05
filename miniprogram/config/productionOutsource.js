/**
 * 外协管理模块配置（对齐 Web OutsourcePanel + productionOrders 快捷入口模式）
 */

const DEFAULT_PAGE_SIZE = 20;

const DESKTOP_HINT =
  '外协表单配置、流水编辑/删除/打印、色码矩阵外协、协作同步请在电脑端操作';

/** 外协 Hub 筛选面板快捷入口 */
const OUTSOURCE_SHORTCUTS = [
  {
    id: 'dispatch',
    label: '待发清单',
    icon: '/assets/icons/truck.png',
    path: '/pages/production-outsource-dispatch/production-outsource-dispatch',
    permission: 'production:outsource_send:allow',
  },
  {
    id: 'receive',
    label: '待收回清单',
    icon: '/assets/icons/arrow-down-to-line.png',
    path: '/pages/production-outsource-receive/production-outsource-receive',
    permission: 'production:outsource_receive:allow',
  },
  {
    id: 'flow',
    label: '外协流水',
    icon: '/assets/icons/scroll-text.png',
    path: '/pages/production-outsource-flow/production-outsource-flow',
    permission: 'production:outsource_records:view',
  },
];

module.exports = {
  DEFAULT_PAGE_SIZE,
  DESKTOP_HINT,
  OUTSOURCE_SHORTCUTS,
};
