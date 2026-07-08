const { hasPermission } = require('../../utils/permissions.js');

/** 扫码类型目录（枢纽页与会话页单一事实源） */
const SCAN_TYPE_CATALOG = [
  {
    key: 'report',
    label: '报工',
    desc: '页内选工序后扫码，自动匹配工单',
    icon: '/assets/icons/clipboard-list.png',
    permission: 'production:orders_report_records:create',
  },
  {
    key: 'outsource',
    label: '外协',
    desc: '页内选加工厂后扫码收货',
    icon: '/assets/icons/truck.png',
    permission: 'production:outsource_receive:allow',
  },
  {
    key: 'rework',
    label: '返工',
    desc: '页内选返工工序后扫码报工',
    icon: '/assets/icons/rotate-ccw.png',
    permission: 'production:orders_rework:allow',
  },
  {
    key: 'stock_in',
    label: '入库',
    desc: '直接扫码，自动匹配工单入库',
    icon: '/assets/icons/warehouse.png',
    permission: 'production:orders_pending_stock_in:create',
  },
  {
    key: 'query',
    label: '查询',
    desc: '扫码查看产品与码信息',
    icon: '/assets/icons/search.png',
    permission: 'production:plans:view',
  },
];

function getScanType(key) {
  return SCAN_TYPE_CATALOG.find((t) => t.key === key) || null;
}

function buildScanTypeEntries(permissions) {
  return SCAN_TYPE_CATALOG.map((item) => ({
    ...item,
    allowed: hasPermission(permissions, item.permission),
  }));
}

module.exports = {
  SCAN_TYPE_CATALOG,
  getScanType,
  buildScanTypeEntries,
};
