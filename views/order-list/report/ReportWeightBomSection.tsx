/**
 * 报工弹窗 - 重量 + BOM 预估消耗 (Phase P4 抽离)。
 * 仅在工序开启「报工时记录重量」时展示。
 */
import React from 'react';
import type { calcUsageByWeight } from '../../../utils/bomMaterialUsageByWeight';

interface Props {
  weight: number;
  onWeightChange: (n: number) => void;
  weightPreviewRows: ReturnType<typeof calcUsageByWeight>;
}

const ReportWeightBomSection: React.FC<Props> = ({ weight, onWeightChange, weightPreviewRows }) => (
  <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 space-y-2">
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <label className="text-[11px] font-bold text-indigo-700 uppercase tracking-widest">本次交货总重量 (kg)</label>
      <span className="text-[10px] text-indigo-500 font-medium leading-snug sm:text-right">将按 BOM 自动分摊到各子物料</span>
    </div>
    <input
      type="number"
      min={0}
      step="0.0001"
      value={weight === 0 ? '' : weight}
      onChange={e => {
        const n = parseFloat(e.target.value);
        onWeightChange(Number.isFinite(n) && n > 0 ? n : 0);
      }}
      className="w-full bg-white border border-indigo-200 rounded-lg py-2 px-3 text-sm font-bold text-indigo-700 text-right outline-none focus:ring-2 focus:ring-indigo-200"
    />
    {weightPreviewRows.length > 0 ? (
      <div className="rounded-xl bg-white border border-indigo-100 overflow-hidden">
        <div className="px-3 py-2 text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50/70 border-b border-indigo-100">
          预估物料消耗（按 BOM 占比 × 输入重量）
        </div>
        <table className="w-full text-[11px]">
          <thead className="bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <tr>
              <th className="px-3 py-1.5 text-left">物料</th>
              <th className="px-3 py-1.5 text-right">占比</th>
              <th className="px-3 py-1.5 text-right" title="BOM 单位用量 × 报工件数">理论重量 (kg)</th>
              <th className="px-3 py-1.5 text-right">实际消耗 (kg)</th>
            </tr>
          </thead>
          <tbody>
            {weightPreviewRows.map(row => (
              <tr key={row.materialProductId} className="border-t border-slate-100 last:border-b-0">
                <td className="px-3 py-1.5 text-slate-700 font-bold">{row.materialName || row.materialProductId}</td>
                <td className="px-3 py-1.5 text-right text-slate-500 tabular-nums">{(row.ratio * 100).toFixed(1)}%</td>
                <td className="px-3 py-1.5 text-right text-slate-500 tabular-nums">
                  {row.theoreticalQty != null ? row.theoreticalQty.toFixed(4) : '—'}
                </td>
                <td className="px-3 py-1.5 text-right text-indigo-600 font-bold tabular-nums">{row.actualWeight.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      weight > 0 && (
        <p className="text-[10px] text-amber-600 font-bold">
          未找到适用 BOM 或 BOM 无可分摊子项，提交后将仅保存重量，暂不拆分物料消耗。
        </p>
      )
    )}
  </div>
);

export default ReportWeightBomSection;
