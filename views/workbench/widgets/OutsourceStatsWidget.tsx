import React, { useMemo } from 'react';
import ProductionNodeStatsWidget from './ProductionNodeStatsWidget';
import { useDashboardOutsourceStats } from '../../../hooks/useDashboardOutsourceStats';
import { useDashboardOutsourceStatsSettings } from '../../../hooks/useDashboardOutsourceStatsSettings';
import { useWorkbenchPeriodFilter } from '../../../hooks/useWorkbenchPeriodFilter';

interface OutsourceStatsWidgetProps {
  editing?: boolean;
  onRemove?: () => void;
}

const OutsourceStatsWidget: React.FC<OutsourceStatsWidgetProps> = ({ editing, onRemove }) => {
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
  const settings = useDashboardOutsourceStatsSettings();
  const { data, isLoading, isFetching, refetch } = useDashboardOutsourceStats(filter);

  const rows = useMemo(
    () => data?.rows.map(row => ({
      templateId: row.templateId,
      name: row.name,
      taskCount: row.taskCount,
      pendingQty: row.pendingQty,
      metric2Qty: row.receivedQty,
      metric3Qty: row.dispatchedQty,
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
        title: '外协统计',
        taskCount: '外协任务数',
        pending: '待收回',
        metric2: '已收回',
        metric3: '已派出',
        metric2Class: 'text-emerald-600',
        metric3Class: 'text-sky-600',
        editTitle: '编辑外协展示工序',
        empty: '暂无工序数据，请点击「设置」选择工序',
        noPermission: '无生产模块权限',
      }}
      theme={{
        periodBorder: 'border-amber-200',
        periodActive: 'bg-amber-500',
        periodText: 'text-amber-700',
      }}
      rows={rows}
      isLoading={isLoading}
      isFetching={isFetching}
      refetch={() => void refetch()}
      settings={settings}
    />
  );
};

export default OutsourceStatsWidget;
