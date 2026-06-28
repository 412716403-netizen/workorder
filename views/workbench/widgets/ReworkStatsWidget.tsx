import React, { useMemo } from 'react';
import ProductionNodeStatsWidget from './ProductionNodeStatsWidget';
import { useDashboardReworkStats } from '../../../hooks/useDashboardReworkStats';
import { useDashboardReworkStatsSettings } from '../../../hooks/useDashboardReworkStatsSettings';
import { useWorkbenchPeriodFilter } from '../../../hooks/useWorkbenchPeriodFilter';

interface ReworkStatsWidgetProps {
  editing?: boolean;
  onRemove?: () => void;
}

const ReworkStatsWidget: React.FC<ReworkStatsWidgetProps> = ({ editing, onRemove }) => {
  const periodState = useWorkbenchPeriodFilter('today');
  const {
    periodTab,
    setPeriodTab,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    filter,
    customRangeInvalid,
    headerShellProps,
  } = periodState;
  const settings = useDashboardReworkStatsSettings();
  const { data, isLoading, isFetching, refetch } = useDashboardReworkStats(filter);

  const rows = useMemo(
    () => data?.rows.map(row => ({
      templateId: row.templateId,
      name: row.name,
      taskCount: row.taskCount,
      pendingQty: row.pendingQty,
      metric2Qty: row.completedQty,
      metric3Qty: row.newReworkQty,
      progress: row.progress,
    })) ?? (data === null ? null : []),
    [data],
  );

  return (
    <ProductionNodeStatsWidget
      editing={editing}
      onRemove={onRemove}
      periodTab={periodTab}
      onPeriodTabChange={setPeriodTab}
      customStart={customStart}
      customEnd={customEnd}
      onCustomStartChange={setCustomStart}
      onCustomEndChange={setCustomEnd}
      headerShellProps={headerShellProps}
      customRangeInvalid={customRangeInvalid}
      labels={{
        title: '返工统计',
        taskCount: '返工任务数',
        pending: '待返工',
        metric2: '已完成',
        metric3: '新开返工',
        metric2Class: 'text-emerald-600',
        metric3Class: 'text-violet-600',
        editTitle: '编辑返工展示工序',
        empty: '暂无工序数据，请点击「设置」选择工序',
        noPermission: '无生产模块权限',
      }}
      theme={{
        periodBorder: 'border-rose-200',
        periodActive: 'bg-rose-500',
        periodText: 'text-rose-700',
      }}
      rows={rows}
      isLoading={isLoading}
      isFetching={isFetching}
      refetch={() => void refetch()}
      settings={settings}
    />
  );
};

export default ReworkStatsWidget;
