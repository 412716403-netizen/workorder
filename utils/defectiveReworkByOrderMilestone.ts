import type { ProductionOrder, ProductionOpRecord } from '../types';
import {
  buildDefectiveReworkByOrderMilestone as buildDefectiveReworkShared,
  type ReportableOrder,
  type ReportableProdRecord,
} from '../shared/orderReportableAggregates';

/** 与工单中心一致：本工序不良、来源工序返工完成（按规格） */
export function buildDefectiveReworkByOrderMilestone(
  orders: ProductionOrder[],
  prodRecords: ProductionOpRecord[] | undefined,
) {
  return buildDefectiveReworkShared(
    orders as ReportableOrder[],
    prodRecords as ReportableProdRecord[] | undefined,
  );
}
