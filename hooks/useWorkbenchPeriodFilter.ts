import { useMemo, useState } from 'react';
import { localTodayYmd } from '../utils/localDateTime';
import type {
  WorkbenchPeriodFilter,
  WorkbenchPeriodTab,
  WorkbenchStatsListQuery,
} from '../types';
import {
  isValidWorkbenchCustomRange,
  workbenchPeriodFilterLabel,
  workbenchPeriodFilterQueryKey,
} from '../types';

export function useWorkbenchPeriodFilter(initialTab: WorkbenchPeriodTab = 'today') {
  const [periodTab, setPeriodTab] = useState<WorkbenchPeriodTab>(initialTab);
  const [customStart, setCustomStart] = useState(() => localTodayYmd());
  const [customEnd, setCustomEnd] = useState(() => localTodayYmd());

  const filter = useMemo((): WorkbenchPeriodFilter => {
    if (periodTab === 'custom') {
      return { mode: 'custom', startDate: customStart, endDate: customEnd };
    }
    return { mode: 'preset', period: periodTab };
  }, [periodTab, customStart, customEnd]);

  const queryKeySuffix = useMemo(() => workbenchPeriodFilterQueryKey(filter), [filter]);

  const apiQuery = useMemo((): WorkbenchStatsListQuery => {
    if (filter.mode === 'custom') {
      return { startDate: filter.startDate, endDate: filter.endDate };
    }
    return { period: filter.period };
  }, [filter]);

  const periodLabel = useMemo(() => workbenchPeriodFilterLabel(filter), [filter]);

  const customRangeInvalid =
    periodTab === 'custom' && !isValidWorkbenchCustomRange(customStart, customEnd);

  const queryEnabled = periodTab !== 'custom' || isValidWorkbenchCustomRange(customStart, customEnd);

  const headerShellProps = useMemo(
    () =>
      periodTab === 'custom'
        ? {
            titleClassName: 'max-w-[4.5rem] shrink-0 sm:max-w-[6.5rem]',
            headerExtraClassName: 'min-w-0 flex-1',
          }
        : {},
    [periodTab],
  );

  return {
    periodTab,
    setPeriodTab,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    filter,
    apiQuery,
    queryKeySuffix,
    periodLabel,
    customRangeInvalid,
    queryEnabled,
    headerShellProps,
  };
}
