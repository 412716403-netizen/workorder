import React from 'react';
import {
  Link2,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { useTraceabilityPlugin } from '../../hooks/useTraceabilityPlugin';

interface ProductionConfigTabProps {
  allowExceedMaxReportQty: boolean;
  onUpdateAllowExceedMaxReportQty?: (value: boolean) => void;
  allowExceedMaxOutsourceReceiveQty: boolean;
  onUpdateAllowExceedMaxOutsourceReceiveQty?: (value: boolean) => void;
  weightTolerancePercent: number;
  onUpdateWeightTolerancePercent?: (value: number) => void;
  canEdit: boolean;
}

/** 本页统一字号：区块标题 / 正文 / 辅助说明 */
const SECTION_TITLE =
  'mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-800';
const OPTION_LABEL = 'text-sm font-bold text-slate-800';
const OPTION_DESC = 'mt-1 text-sm text-slate-500';
const TOGGLE_ROW =
  'flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3';

const ProductionConfigTab: React.FC<ProductionConfigTabProps> = ({
  allowExceedMaxReportQty,
  onUpdateAllowExceedMaxReportQty,
  allowExceedMaxOutsourceReceiveQty,
  onUpdateAllowExceedMaxOutsourceReceiveQty,
  weightTolerancePercent,
  onUpdateWeightTolerancePercent,
  canEdit,
}) => {
  const { weightEnabled } = useTraceabilityPlugin();

  return (
    <div className="max-w-2xl space-y-4 text-sm text-slate-800">
      <div className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className={SECTION_TITLE}>
          <Link2 className="h-4 w-4 text-indigo-600" />
          数量上限
        </h2>
        <div className="space-y-4">
          <div className={TOGGLE_ROW}>
            <div>
              <p className={OPTION_LABEL}>允许报工数量超过最大可报数量</p>
              <p className={OPTION_DESC}>
                关闭后，报工数量将被限制在弹窗中显示的「最多 N」以内，无法录入更大的数值（如计划剩余数或上一道工序报工数）。
              </p>
            </div>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => onUpdateAllowExceedMaxReportQty?.(!allowExceedMaxReportQty)}
              className={`ml-4 shrink-0 ${!canEdit ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              {allowExceedMaxReportQty ? (
                <ToggleRight className={`h-10 w-10 ${!canEdit ? 'text-slate-400' : 'text-indigo-600'}`} />
              ) : (
                <ToggleLeft className="h-10 w-10 text-slate-300" />
              )}
            </button>
          </div>
          <div className={TOGGLE_ROW}>
            <div>
              <p className={OPTION_LABEL}>允许外协收货数量超过最大可收货数量</p>
              <p className={OPTION_DESC}>
                关闭后，外协收货录入与扫码累加将被限制在每行的「最多 N」以内，无法录入更大的数值（待收回数量 = 已派 − 已收）。
              </p>
            </div>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => onUpdateAllowExceedMaxOutsourceReceiveQty?.(!allowExceedMaxOutsourceReceiveQty)}
              className={`ml-4 shrink-0 ${!canEdit ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              {allowExceedMaxOutsourceReceiveQty ? (
                <ToggleRight className={`h-10 w-10 ${!canEdit ? 'text-slate-400' : 'text-indigo-600'}`} />
              ) : (
                <ToggleLeft className="h-10 w-10 text-slate-300" />
              )}
            </button>
          </div>
          {weightEnabled ? (
          <div className={TOGGLE_ROW}>
            <div className="flex-1">
              <p className={OPTION_LABEL}>扫码称重容差（%）</p>
              <p className={OPTION_DESC}>
                报工/外协/返工扫码时，电子秤实测重量与「单件标准重量 × 数量」偏差超过此百分比将提示告警（默认 ±5%）。
              </p>
            </div>
            <div className="ml-4 flex shrink-0 items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                disabled={!canEdit}
                value={weightTolerancePercent}
                onChange={e => onUpdateWeightTolerancePercent?.(parseFloat(e.target.value) || 0)}
                className="w-20 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 text-right disabled:opacity-60"
              />
              <span className="text-sm font-bold text-slate-500">%</span>
            </div>
          </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default React.memo(ProductionConfigTab);
