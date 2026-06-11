/**
 * 工作台「工单统计」组件：周期、工序选择与统计数据形状。
 */

export type WorkbenchOrderStatsPeriod = 'today' | 'yesterday' | 'month';

export const WORKBENCH_ORDER_STATS_PERIODS: WorkbenchOrderStatsPeriod[] = [
  'today',
  'yesterday',
  'month',
];

export const WORKBENCH_ORDER_STATS_PERIOD_LABELS: Record<WorkbenchOrderStatsPeriod, string> = {
  today: '今日',
  yesterday: '昨日',
  month: '本月',
};

export const MAX_DASHBOARD_ORDER_STATS_NODES = 12;

export const DEFAULT_DASHBOARD_ORDER_STATS_NODE_COUNT = 8;

export interface DashboardOrderStatsRow {
  templateId: string;
  name: string;
  /** 当前生产任务数（快照，不随周期变化；口径见 shared/orderReportableAggregates.countActiveTasksAtTemplate） */
  taskCount: number;
  /** 可报最多（进度分母） */
  maxReportableQty: number;
  /** 已报数（进度分子） */
  reportedQty: number;
  /** 剩余可报 = 可报最多 − 已报数 */
  remainingQty: number;
  goodQty: number;
  defectiveQty: number;
  /** 已报数 / 可报最多 */
  progress: number;
}

export interface DashboardOrderStatsNodeOption {
  id: string;
  name: string;
}

export function normalizeOrderStatsNodeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string' || !item.trim()) continue;
    const id = item.trim();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_DASHBOARD_ORDER_STATS_NODES) break;
  }
  return out;
}

export function isWorkbenchOrderStatsPeriod(v: unknown): v is WorkbenchOrderStatsPeriod {
  return typeof v === 'string' && (WORKBENCH_ORDER_STATS_PERIODS as string[]).includes(v);
}

/** 工作台统计组件（工单/外协/返工）共用周期范围 */
export function resolveWorkbenchStatsPeriodRange(period: WorkbenchOrderStatsPeriod): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  if (period === 'today') {
    start.setHours(0, 0, 0, 0);
  } else if (period === 'yesterday') {
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);
  } else {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }
  return { start, end };
}

export interface DashboardOutsourceStatsRow {
  templateId: string;
  name: string;
  /** 有待收回的外协任务数（工单或产品维度） */
  taskCount: number;
  /** 待收回数量（快照） */
  pendingQty: number;
  /** 周期内已收回 */
  receivedQty: number;
  /** 周期内已派出 */
  dispatchedQty: number;
  /** 已收回 / 已派出（快照） */
  progress: number;
}

export interface DashboardReworkStatsRow {
  templateId: string;
  name: string;
  /** 进行中的返工任务数 */
  taskCount: number;
  /** 待返工数量（快照） */
  pendingQty: number;
  /** 周期内返工完成数 */
  completedQty: number;
  /** 周期内新开返工数 */
  newReworkQty: number;
  /** 已完成 / 返工总量（快照） */
  progress: number;
}

export const DASHBOARD_OUTSOURCE_STATS_NODES_KEY = 'dashboardOutsourceStatsNodes';
export const DASHBOARD_REWORK_STATS_NODES_KEY = 'dashboardReworkStatsNodes';

/** 工作台销售/财务统计（按周期） */
export interface DashboardSalesStats {
  period: WorkbenchOrderStatsPeriod;
  salesBillCount: number;
  salesAmount: number;
  salesQuantity: number;
  /** 周期内销售退货件数（SALES_BILL 负数量绝对值合计） */
  salesReturnQuantity: number;
}

/** 工作台销售订单统计（按周期） */
export interface DashboardSalesOrderStats {
  period: WorkbenchOrderStatsPeriod;
  /** 周期内销售订单数（按 docNumber 去重） */
  salesOrderCount: number;
  salesOrderAmount: number;
  salesOrderQuantity: number;
  /** 周期内减单/负数量件数绝对值合计 */
  salesOrderReduceQuantity: number;
}

export interface DashboardFinanceStats {
  period: WorkbenchOrderStatsPeriod;
  receiptAmount: number;
  paymentAmount: number;
  cashFlow: number;
  receiptCount: number;
  paymentCount: number;
}

export function workbenchPeriodLabel(period: WorkbenchOrderStatsPeriod): string {
  return WORKBENCH_ORDER_STATS_PERIOD_LABELS[period];
}
