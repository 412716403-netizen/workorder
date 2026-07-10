const { readTenantCtx } = require('../../utils/session.js');
const { readTabShellInsets } = require('../../utils/tabShell.js');
const { hasPermission, hasPrefixPermission } = require('../../utils/permissions.js');
const {
  listMyReportableTasks,
  listMyReportHistory,
  fetchProductsAll,
  fetchNodesAll,
} = require('../../utils/workerReportApi.js');
const { loadTraceabilityScanEnabled } = require('../../utils/featurePlugins.js');
const {
  defaultDateRange,
  dateInputToIsoStart,
  dateInputToIsoEndExclusive,
  groupMyReportHistory,
} = require('../../utils/workerReportHistory.js');
const {
  listProductDisplayFieldsFromMap,
} = require('../../utils/listProductThumb.js');

const APPROVAL_LABEL = {
  PENDING: '未审核',
  APPROVED: '已审核',
  REJECTED: '已驳回',
};

function canAccessProcessReport(permissions) {
  return (
    hasPermission(permissions, 'process_report') ||
    hasPrefixPermission(permissions, 'process_report')
  );
}

function mapTaskRow(task, options) {
  const groupedByMilestone = options && options.groupedByMilestone;
  const productMap = options && options.productMap;
  const display = listProductDisplayFieldsFromMap(productMap, task.productId, {
    name: task.productName,
    sku: task.productSku,
    productName: task.productName,
    productSku: task.productSku,
  });
  const remaining = Math.max(0, Number(task.remaining) || 0);
  const milestoneName = task.milestoneName || '工序';
  const milestoneTemplateId = task.milestoneTemplateId || '';
  const orderNumber = task.orderNumber || '';
  const showOrderNumber = Boolean(orderNumber);
  let orderHeadline = milestoneName;
  if (showOrderNumber) {
    orderHeadline = groupedByMilestone
      ? orderNumber
      : `${orderNumber} · ${milestoneName}`;
  }
  return {
    key: `${task.orderId || task.productId}-${task.milestoneId || task.milestoneTemplateId}`,
    orderId: task.orderId || '',
    milestoneId: task.milestoneId || '',
    milestoneTemplateId,
    productId: task.productId || '',
    orderNumber,
    orderHeadline,
    milestoneName,
    productName: display.productName,
    productSku: display.productSku,
    showProductSku: display.showProductSku,
    productImageUrl: display.productImageUrl,
    showProductImage: display.showProductImage,
    placeholderIconSrc: display.placeholderIconSrc,
    remainingText: `可报 ${remaining}`,
    remaining,
  };
}

function buildTaskGroups(tasks, assignedIds, nodeMap) {
  const byTemplate = new Map();
  (tasks || []).forEach((task) => {
    const templateId = task.milestoneTemplateId || task.milestoneName || 'unknown';
    if (!byTemplate.has(templateId)) byTemplate.set(templateId, []);
    byTemplate.get(templateId).push(task);
  });

  const groups = [];
  const seen = new Set();
  const orderIds = (assignedIds || []).filter(Boolean);

  orderIds.forEach((templateId) => {
    const items = byTemplate.get(templateId);
    if (!items || !items.length) return;
    seen.add(templateId);
    groups.push({
      id: templateId,
      name: nodeMap.get(templateId) || items[0].milestoneName || templateId,
      count: items.length,
      tasks: items,
    });
  });

  byTemplate.forEach((items, templateId) => {
    if (seen.has(templateId)) return;
    groups.push({
      id: templateId,
      name: nodeMap.get(templateId) || items[0].milestoneName || templateId,
      count: items.length,
      tasks: items,
    });
  });

  return groups;
}

function buildMilestoneFilters(groups, totalCount) {
  if (!groups || groups.length <= 1) return [];
  const filters = [{ id: 'all', name: '全部', count: totalCount }];
  groups.forEach((group) => {
    filters.push({
      id: group.id,
      name: group.name,
      count: group.count,
    });
  });
  return filters;
}

function resolveVisibleTaskGroups(taskGroups, activeMilestoneFilter) {
  if (!taskGroups || !taskGroups.length) {
    return { groups: [], showGroupHeaders: false };
  }
  if (activeMilestoneFilter === 'all') {
    return {
      groups: taskGroups,
      showGroupHeaders: taskGroups.length > 1,
    };
  }
  const hit = taskGroups.find((group) => group.id === activeMilestoneFilter);
  return {
    groups: hit ? [hit] : [],
    showGroupHeaders: false,
  };
}

const MY_REPORT_STATUS_ORDER = ['PENDING', 'APPROVED', 'REJECTED'];

function normalizeMyReportStatus(status) {
  if (status === 'PENDING' || status === 'APPROVED' || status === 'REJECTED') return status;
  return 'APPROVED';
}

function buildMyReportStatusGroups(reports) {
  const byStatus = new Map();
  (reports || []).forEach((row) => {
    const status = normalizeMyReportStatus(row.approvalStatus);
    if (!byStatus.has(status)) byStatus.set(status, []);
    byStatus.get(status).push(row);
  });

  const groups = [];
  MY_REPORT_STATUS_ORDER.forEach((status) => {
    const items = byStatus.get(status);
    if (!items || !items.length) return;
    groups.push({
      id: status,
      name: APPROVAL_LABEL[status] || status,
      count: items.length,
      reports: items,
    });
    byStatus.delete(status);
  });
  byStatus.forEach((items, status) => {
    groups.push({
      id: status,
      name: APPROVAL_LABEL[status] || status,
      count: items.length,
      reports: items,
    });
  });
  return groups;
}

function buildMyReportStatusFilters(groups, totalCount) {
  if (!groups || groups.length <= 1) return [];
  const filters = [{ id: 'all', name: '全部', count: totalCount }];
  groups.forEach((group) => {
    filters.push({
      id: group.id,
      name: group.name,
      count: group.count,
    });
  });
  return filters;
}

function sortMyReportsByTime(reports) {
  return [...(reports || [])].sort(
    (a, b) => (b.timestampMs || 0) - (a.timestampMs || 0),
  );
}

function resolveVisibleMyReportGroups(statusGroups, activeStatusFilter, allReports) {
  if (!allReports || !allReports.length) {
    return { groups: [], showGroupHeaders: false };
  }
  if (activeStatusFilter === 'all') {
    return {
      groups: [
        {
          id: 'all',
          name: '全部',
          count: allReports.length,
          reports: sortMyReportsByTime(allReports),
        },
      ],
      showGroupHeaders: false,
    };
  }
  const hit = statusGroups && statusGroups.find((group) => group.id === activeStatusFilter);
  if (!hit || !hit.reports.length) {
    return { groups: [], showGroupHeaders: false };
  }
  return {
    groups: [
      {
        ...hit,
        reports: sortMyReportsByTime(hit.reports),
      },
    ],
    showGroupHeaders: false,
  };
}

function withApprovalBadge(row, raw) {
  const status = raw.approvalStatus || 'APPROVED';
  return Object.assign({}, row, {
    reportId: raw.reportId || row.id,
    approvalStatus: status,
    approvalLabel: APPROVAL_LABEL[status] || status,
    approvalClass:
      status === 'PENDING'
        ? 'worker-report-badge--pending'
        : status === 'REJECTED'
          ? 'worker-report-badge--rejected'
          : 'worker-report-badge--approved',
  });
}

Page({
  data: Object.assign(
    {
      hasProcessReport: false,
      segment: 'tasks',
      loading: false,
      taskCount: 0,
      myReportCount: 0,
      myReportPendingCount: 0,
      tasks: [],
      milestoneFilters: [],
      activeMilestoneFilter: 'all',
      visibleTaskGroups: [],
      showTaskGroupHeaders: false,
      myReports: [],
      myReportStatusFilters: [],
      activeMyReportStatusFilter: 'all',
      visibleMyReportGroups: [],
      showMyReportGroupHeaders: false,
      emptyMyReportsFilterText: '该状态下暂无报工记录',
      emptyReason: '',
      emptyTasksText: '暂无可报任务',
      emptyReportsText: '暂无报工记录',
      scanEnabled: false,
      showScanFab: false,
      milestonePickerOpen: false,
      assignedMilestoneOptions: [],
    },
    readTabShellInsets(),
  ),

  onShow() {
    if (!wx.getStorageSync('accessToken')) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    const ctx = readTenantCtx();
    if (!ctx || !ctx.tenantId) {
      wx.reLaunch({ url: '/pages/tenant-select/tenant-select' });
      return;
    }
    const hasProcessReport = canAccessProcessReport(ctx.permissions || []);
    this.setData({ hasProcessReport });
    if (!hasProcessReport) return;
    loadTraceabilityScanEnabled().then((scanEnabled) => {
      this.setData({ scanEnabled });
      this.syncScanFabVisibility();
    });
    this.reload();
  },

  onPullDownRefresh() {
    this.reload()
      .catch(() => {})
      .finally(() => wx.stopPullDownRefresh());
  },

  onSegmentTap(e) {
    const segment = e.currentTarget.dataset.segment;
    if (!segment || segment === this.data.segment) return;
    this.setData({ segment, milestonePickerOpen: false });
    this.syncScanFabVisibility();
    this.reload();
  },

  syncScanFabVisibility() {
    const showScanFab =
      this.data.hasProcessReport &&
      this.data.scanEnabled &&
      this.data.segment === 'tasks' &&
      !this.data.loading &&
      (this.data.assignedMilestoneOptions || []).length > 0;
    this.setData({ showScanFab });
  },

  async reload() {
    if (!this.data.hasProcessReport) return;
    this.setData({ loading: true });
    try {
      if (this.data.segment === 'tasks') {
        await this.loadTasks();
      } else {
        await this.loadMyReports();
      }
    } catch (err) {
      const statusCode = err && err.statusCode;
      let title = (err && err.message) || '加载失败';
      if (statusCode === 404) {
        title = '报工接口未部署，请更新服务端';
      } else if (/timeout|超时/i.test(title)) {
        title = '加载超时，请稍后重试';
      }
      wx.showToast({ title, icon: 'none', duration: 3000 });
    } finally {
      this.setData({ loading: false });
      this.syncScanFabVisibility();
    }
  },

  navigateToWorkerReportScan(templateId, templateName) {
    const q = [
      `templateId=${encodeURIComponent(templateId)}`,
      `templateName=${encodeURIComponent(templateName || '')}`,
      'selfReport=1',
    ].join('&');
    wx.navigateTo({
      url: `/packageBusiness/worker-report-scan/worker-report-scan?${q}`,
    });
  },

  onScanReportFabTap() {
    const options = this.data.assignedMilestoneOptions || [];
    if (!options.length) {
      wx.showToast({ title: '未分配生产工序', icon: 'none' });
      return;
    }
    if (options.length === 1) {
      const only = options[0];
      this.navigateToWorkerReportScan(only.id, only.name);
      return;
    }
    this.setData({ milestonePickerOpen: true });
  },

  onMilestonePickerClose() {
    this.setData({ milestonePickerOpen: false });
  },

  onMilestonePickerSelect(e) {
    const { id, name } = e.currentTarget.dataset;
    if (!id) return;
    this.setData({ milestonePickerOpen: false });
    this.navigateToWorkerReportScan(id, name);
  },

  onMilestoneFilterTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || id === this.data.activeMilestoneFilter) return;
    const productMap = this._productMap;
    const { groups, showGroupHeaders } = resolveVisibleTaskGroups(
      this._rawTaskGroups || [],
      id,
    );
    const visibleTaskGroups = groups.map((group) => ({
      id: group.id,
      name: group.name,
      count: group.count,
      tasks: group.tasks.map((task) => mapTaskRow(task, {
        groupedByMilestone: showGroupHeaders,
        productMap,
      })),
    }));
    this.setData({
      activeMilestoneFilter: id,
      visibleTaskGroups,
      showTaskGroupHeaders: showGroupHeaders,
    });
  },

  applyTaskGrouping(rawTasks, assignedIds, nodeMap, productMap) {
    const taskGroups = buildTaskGroups(rawTasks, assignedIds, nodeMap);
    const milestoneFilters = buildMilestoneFilters(taskGroups, rawTasks.length);
    const activeMilestoneFilter = milestoneFilters.length
      ? (this.data.activeMilestoneFilter || 'all')
      : 'all';
    const safeFilter = milestoneFilters.some((f) => f.id === activeMilestoneFilter)
      ? activeMilestoneFilter
      : 'all';
    const { groups, showGroupHeaders } = resolveVisibleTaskGroups(taskGroups, safeFilter);
    this._rawTaskGroups = taskGroups;
    const mapOpts = { groupedByMilestone: showGroupHeaders, productMap };
    const visibleTaskGroups = groups.map((group) => ({
      id: group.id,
      name: group.name,
      count: group.count,
      tasks: group.tasks.map((task) => mapTaskRow(task, mapOpts)),
    }));
    return {
      tasks: rawTasks.map((task) => mapTaskRow(task, mapOpts)),
      milestoneFilters,
      activeMilestoneFilter: safeFilter,
      visibleTaskGroups,
      showTaskGroupHeaders: showGroupHeaders,
    };
  },

  async loadTasks() {
    const [res, nodesRaw, productsRaw] = await Promise.all([
      listMyReportableTasks(),
      fetchNodesAll(),
      fetchProductsAll().catch(() => []),
    ]);
    const rawTasks = res.tasks || [];
    const assignedIds = res.assignedMilestoneIds || [];
    const nodeMap = new Map(
      (Array.isArray(nodesRaw) ? nodesRaw : []).map((n) => [n.id, n.name || n.id]),
    );
    this._productMap = new Map((productsRaw || []).map((p) => [p.id, p]));
    const grouping = this.applyTaskGrouping(
      rawTasks,
      assignedIds,
      nodeMap,
      this._productMap,
    );
    const assignedMilestoneOptions = assignedIds.map((id) => ({
      id,
      name: nodeMap.get(id) || id,
    }));
    let emptyTasksText = '暂无可报任务';
    if (res.emptyReason === 'unassigned') {
      emptyTasksText = '未分配生产工序，请联系管理员';
    } else if (!rawTasks.length) {
      emptyTasksText = '分配工序下暂无可报内容';
    }
    this.setData({
      tasks: grouping.tasks,
      milestoneFilters: grouping.milestoneFilters,
      activeMilestoneFilter: grouping.activeMilestoneFilter,
      visibleTaskGroups: grouping.visibleTaskGroups,
      showTaskGroupHeaders: grouping.showTaskGroupHeaders,
      taskCount: rawTasks.length,
      emptyReason: res.emptyReason || '',
      emptyTasksText,
      assignedMilestoneOptions,
    });
    this.syncScanFabVisibility();
  },

  onMyReportStatusFilterTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || id === this.data.activeMyReportStatusFilter) return;
    const { groups, showGroupHeaders } = resolveVisibleMyReportGroups(
      this._myReportStatusGroups || [],
      id,
      this.data.myReports || [],
    );
    this.setData({
      activeMyReportStatusFilter: id,
      visibleMyReportGroups: groups,
      showMyReportGroupHeaders: showGroupHeaders,
    });
  },

  applyMyReportGrouping(reports) {
    const statusGroups = buildMyReportStatusGroups(reports);
    const myReportStatusFilters = buildMyReportStatusFilters(statusGroups, reports.length);
    const activeMyReportStatusFilter = myReportStatusFilters.length
      ? (this.data.activeMyReportStatusFilter || 'all')
      : 'all';
    const safeFilter = myReportStatusFilters.some((f) => f.id === activeMyReportStatusFilter)
      ? activeMyReportStatusFilter
      : 'all';
    const { groups, showGroupHeaders } = resolveVisibleMyReportGroups(
      statusGroups,
      safeFilter,
      reports,
    );
    this._myReportStatusGroups = statusGroups;
    return {
      myReportStatusFilters,
      activeMyReportStatusFilter: safeFilter,
      visibleMyReportGroups: groups,
      showMyReportGroupHeaders: showGroupHeaders,
    };
  },

  async loadMyReports() {
    const range = defaultDateRange();
    this._myReportsDateFrom = range.start;
    this._myReportsDateTo = range.end;
    const [hist, products] = await Promise.all([
      listMyReportHistory({
        startDate: dateInputToIsoStart(range.start),
        endDate: dateInputToIsoEndExclusive(range.end),
        productionLinkMode: 'product',
      }),
      fetchProductsAll().catch(() => []),
    ]);
    const productMap = new Map((products || []).map((p) => [p.id, p]));
    const grouped = groupMyReportHistory(hist, productMap, 'order');
    const myReports = grouped.map((row) =>
      withApprovalBadge(row, row._raw || row),
    );
    const myReportPendingCount = myReports.filter(
      (row) => row.approvalStatus === 'PENDING',
    ).length;
    const grouping = this.applyMyReportGrouping(myReports);
    this.setData({
      myReports,
      myReportCount: myReports.length,
      myReportPendingCount,
      myReportStatusFilters: grouping.myReportStatusFilters,
      activeMyReportStatusFilter: grouping.activeMyReportStatusFilter,
      visibleMyReportGroups: grouping.visibleMyReportGroups,
      showMyReportGroupHeaders: grouping.showMyReportGroupHeaders,
    });
  },

  onMyReportDetailTap(e) {
    const batchKey = e.currentTarget.dataset.batchKey;
    if (!batchKey) {
      wx.showToast({ title: '无法打开详情', icon: 'none' });
      return;
    }
    const dateFrom = this._myReportsDateFrom || defaultDateRange().start;
    const dateTo = this._myReportsDateTo || defaultDateRange().end;
    const q = [
      `batchKey=${encodeURIComponent(batchKey)}`,
      `dateFrom=${encodeURIComponent(dateFrom)}`,
      `dateTo=${encodeURIComponent(dateTo)}`,
    ].join('&');
    wx.navigateTo({
      url: `/packageBusiness/production-order-report-batch-detail/production-order-report-batch-detail?${q}`,
    });
  },

  onProductImageError(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    const patchRow = (row) => {
      if (row.key !== key && row.id !== key) return row;
      return { ...row, showProductImage: false, productImageUrl: '' };
    };
    const visibleTaskGroups = (this.data.visibleTaskGroups || []).map((group) => ({
      ...group,
      tasks: (group.tasks || []).map(patchRow),
    }));
    const visibleMyReportGroups = (this.data.visibleMyReportGroups || []).map((group) => ({
      ...group,
      reports: (group.reports || []).map(patchRow),
    }));
    const myReports = (this.data.myReports || []).map(patchRow);
    this.setData({ visibleTaskGroups, visibleMyReportGroups, myReports });
  },

  onTaskTap(e) {
    const { orderId, milestoneId } = e.currentTarget.dataset;
    if (!orderId || !milestoneId) {
      wx.showToast({ title: '任务参数不完整', icon: 'none' });
      return;
    }
    const q = [
      `orderId=${encodeURIComponent(orderId)}`,
      `milestoneId=${encodeURIComponent(milestoneId)}`,
      'selfReport=1',
    ].join('&');
    wx.navigateTo({
      url: `/packageBusiness/production-order-report/production-order-report?${q}`,
    });
  },
});
