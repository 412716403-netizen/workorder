import React, { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import WidgetShell from '../WidgetShell';
import ProductEconomicsModal from '../ProductEconomicsModal';
import { useAuth } from '../../../contexts/AuthContext';
import { hasPriceAmountModuleAccess } from '../../../utils/canViewAmount';
import { useWorkbenchPageFullAccess } from '../WorkbenchPageAccessContext';
import { useProductEconomics } from '../../../hooks/useProductEconomics';
import { useWorkbenchPeriodFilter } from '../../../hooks/useWorkbenchPeriodFilter';
import type { ProductMaterialCostMode } from '../../../types';
import {
  formatWorkbenchAmount,
  formatWorkbenchCount,
  WorkbenchKpiHero,
  WorkbenchKpiMetric,
  WorkbenchStatsHeaderExtra,
} from './WorkbenchKpiCard';

interface ProductEconomicsWidgetProps {
  materialCostMode: ProductMaterialCostMode;
  title: string;
  editing?: boolean;
  onRemove?: () => void;
}

const PRODUCT_ECONOMICS_THEME = {
  periodBorder: 'border-violet-200',
  periodActive: 'bg-violet-500',
  periodText: 'text-violet-700',
} as const;

const ProductEconomicsWidget: React.FC<ProductEconomicsWidgetProps> = ({
  materialCostMode,
  title,
  editing,
  onRemove,
}) => {
  const documentLinked = materialCostMode === 'document_linked';
  const [modalOpen, setModalOpen] = useState(false);
  const periodState = useWorkbenchPeriodFilter('today');
  const {
    periodTab,
    setPeriodTab,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    filter,
    periodLabel,
    customRangeInvalid,
    headerShellProps,
  } = periodState;
  const { tenantCtx } = useAuth();
  const fullAccess = useWorkbenchPageFullAccess();
  const showAmount =
    fullAccess || hasPriceAmountModuleAccess(tenantCtx?.tenantRole, tenantCtx?.permissions);
  const { data, isLoading, isFetching, refetch } = useProductEconomics(filter, materialCostMode);

  const headerExtra = (
    <WorkbenchStatsHeaderExtra
      periodTab={periodTab}
      onPeriodTabChange={setPeriodTab}
      customStart={customStart}
      customEnd={customEnd}
      onCustomStartChange={setCustomStart}
      onCustomEndChange={setCustomEnd}
      theme={PRODUCT_ECONOMICS_THEME}
      isFetching={isFetching}
      onRefresh={() => void refetch()}
      middleExtra={
        !editing && data ? (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="workbench-no-drag shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold text-violet-600 hover:bg-violet-50"
          >
            更多
          </button>
        ) : null
      }
    />
  );

  const heroHint = useMemo(() => {
    if (!data) return undefined;
    return `${periodLabel} · ${formatWorkbenchCount(data.summary.productCount)} 个产品有数据`;
  }, [data, periodLabel]);

  const grossTone = useMemo(() => {
    if (!data || !showAmount) return 'violet' as const;
    if (data.summary.grossProfit > 0) return 'emerald' as const;
    if (data.summary.grossProfit < 0) return 'rose' as const;
    return 'violet' as const;
  }, [data, showAmount]);

  const costSub = documentLinked
    ? '采购入库+关联付款+报工+外协+返工+报损'
    : '物料+报工+外协+返工+报损';

  const salesSub = documentLinked ? '销售出库+关联收款' : '销售出库';

  return (
    <>
      <WidgetShell
        title={title}
        editing={editing}
        onRemove={onRemove}
        headerExtra={headerExtra}
        {...headerShellProps}
      >
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
          </div>
        ) : !data ? (
          <p className="py-10 text-center text-sm text-slate-400">无生产或进销存模块权限</p>
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-3">
            <WorkbenchKpiHero
              label={`${periodLabel}毛利参考`}
              value={formatWorkbenchAmount(data.summary.grossProfit, showAmount)}
              hint={heroHint}
              tone={grossTone === 'violet' ? 'indigo' : grossTone}
            />
            <div className="grid grid-cols-2 gap-3">
              <WorkbenchKpiMetric
                label={`${periodLabel}总成本`}
                value={formatWorkbenchAmount(data.summary.totalCost, showAmount)}
                sub={costSub}
                tone="amber"
              />
              <WorkbenchKpiMetric
                label={documentLinked ? `${periodLabel}收入` : `${periodLabel}销售额`}
                value={formatWorkbenchAmount(
                  documentLinked ? data.summary.totalRevenue : data.summary.totalSalesAmount,
                  showAmount,
                )}
                sub={salesSub}
                tone="sky"
              />
            </div>
            {customRangeInvalid && (
              <p className="text-center text-[10px] text-rose-500">结束日期不能早于开始</p>
            )}
          </div>
        )}
      </WidgetShell>

      <ProductEconomicsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        showAmount={showAmount}
        materialCostMode={materialCostMode}
        title={title}
      />
    </>
  );
};

export default ProductEconomicsWidget;
