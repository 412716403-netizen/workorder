import React from 'react';
import {
  Link2,
  ToggleLeft,
  ToggleRight,
  BarChart3,
} from 'lucide-react';
import { useTraceabilityPlugin } from '../../hooks/useTraceabilityPlugin';
import {
  PRODUCT_MATERIAL_COST_MODE_LABEL,
  PRODUCT_MATERIAL_COST_MODES,
  type ProductMaterialCostMode,
  type ProductEconomicsSettings,
} from '../../types';

interface ProductionConfigTabProps {
  allowExceedMaxReportQty: boolean;
  onUpdateAllowExceedMaxReportQty?: (value: boolean) => void;
  allowExceedMaxOutsourceReceiveQty: boolean;
  onUpdateAllowExceedMaxOutsourceReceiveQty?: (value: boolean) => void;
  allowExceedMaxStockInQty: boolean;
  onUpdateAllowExceedMaxStockInQty?: (value: boolean) => void;
  weightTolerancePercent: number;
  onUpdateWeightTolerancePercent?: (value: number) => void;
  productEconomicsSettings: ProductEconomicsSettings;
  onUpdateProductEconomicsSettings?: (value: ProductEconomicsSettings) => void;
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
  allowExceedMaxStockInQty,
  onUpdateAllowExceedMaxStockInQty,
  weightTolerancePercent,
  onUpdateWeightTolerancePercent,
  productEconomicsSettings,
  onUpdateProductEconomicsSettings,
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
          <div className={TOGGLE_ROW}>
            <div>
              <p className={OPTION_LABEL}>允许生产入库数量超过最大可入库数量</p>
              <p className={OPTION_DESC}>
                关闭后，工单中心「待入库清单」做入库时，入库数量将被限制在每行/每规格的「待入库 N」以内，无法录入更大的数值。
              </p>
            </div>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => onUpdateAllowExceedMaxStockInQty?.(!allowExceedMaxStockInQty)}
              className={`ml-4 shrink-0 ${!canEdit ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              {allowExceedMaxStockInQty ? (
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
                报工/外协扫码时，电子秤实测重量与「单件标准重量 × 数量」偏差超过此百分比将提示告警（默认 ±5%）。
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

      <div className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className={SECTION_TITLE}>
          <BarChart3 className="h-4 w-4 text-indigo-600" />
          产品经营 · 物料成本口径
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          工作台「产品经营情况」按所选口径计算物料/采购相关成本（与报工、外协、返工、报损叠加）。两种口径互斥，请按企业习惯选择一种。
        </p>
        <div className="space-y-3">
          {PRODUCT_MATERIAL_COST_MODES.map(mode => {
            const active = productEconomicsSettings.materialCostMode === mode;
            return (
              <label
                key={mode}
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition ${
                  active ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-100 bg-slate-50/60'
                } ${!canEdit ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <input
                  type="radio"
                  name="productMaterialCostMode"
                  className="mt-1"
                  checked={active}
                  disabled={!canEdit}
                  onChange={() => {
                    if (!canEdit || active) return;
                    void onUpdateProductEconomicsSettings?.({ materialCostMode: mode });
                  }}
                />
                <div>
                  <p className={OPTION_LABEL}>{PRODUCT_MATERIAL_COST_MODE_LABEL[mode]}</p>
                  <p className={OPTION_DESC}>
                    {mode === 'consumable'
                      ? '按报工耗材数量（BOM 或称重）× 物料采购价，并计入领退料结余损耗。适合精细领料、横机称重等场景。'
                      : '按采购入库「关联成品」金额与财务「关联产品」的收付款累计。给供应商付货款时请勿再关联产品，以免与入库重复；关联付款适用于运费、外协现金等无法走入库的费用。'}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default React.memo(ProductionConfigTab);
