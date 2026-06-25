/**
 * 物料统计表格（领料/退料/净领用/报工耗材/结余）。
 * 从 StockMaterialPanel.tsx 抽出（S11 工程性整理）。在 4 套布局分支里复用。
 *
 * 表格本身无状态：选中态、点击响应、行内单元格样式均由 props 注入；
 * compact 模式用于嵌套在 OutsourcePanel / ReworkPanel 等子面板，避免大尺寸版本撑爆容器宽度。
 */
import React from 'react';
import { ArrowUpFromLine, Undo2 } from 'lucide-react';
import type { Product, ReportFieldDefinition } from '../../types';
import { getProductCategoryCustomFieldEntries } from '../../utils/reportCustomDocField';
import { matRowReportCost, type MatRow } from './stockMaterialPanelHelpers';

export interface MaterialStatsTableProps {
  materials: MatRow[];
  selecting: boolean;
  compact?: boolean;
  selectedIds: Set<string>;
  onSelectAll: (ids: Set<string>) => void;
  onToggleSelect: (productId: string) => void;
  productsById: Map<string, Product>;
  categoryMap: Map<string, { id: string; customFields: ReportFieldDefinition[] }>;
  emptyMessage?: string;
}

export const MaterialStatsTable: React.FC<MaterialStatsTableProps> = ({
  materials,
  selecting,
  compact,
  selectedIds,
  onSelectAll,
  onToggleSelect,
  productsById,
  categoryMap,
  emptyMessage = '暂无物料',
}) => {
  const cols = selecting ? 7 : 6;
  const px = compact ? 'px-2.5' : 'px-6';
  const py = compact ? 'py-1.5' : 'py-2.5';
  const thTrack = compact ? 'tracking-wider' : 'tracking-widest';
  const thBase = `${compact ? '' : px} ${py} text-[10px] font-black text-slate-400 uppercase ${thTrack}`;
  return (
    <div className={compact ? 'overflow-x-auto min-w-0 pr-4 sm:pr-5' : 'overflow-x-auto'}>
      <table className={compact ? 'w-full min-w-[680px] table-fixed border-collapse text-left' : 'w-full text-left border-collapse'}>
        {compact && (
          <colgroup>
            {selecting ? <col className="w-[5%]" /> : null}
            <col className={selecting ? 'w-[10%]' : 'w-[15%]'} />
            <col className="w-[17%]" /><col className="w-[17%]" /><col className="w-[17%]" /><col className="w-[17%]" /><col className="w-[17%]" />
          </colgroup>
        )}
        <thead>
          <tr className="bg-slate-50/80">
            {selecting && (
              <th className={compact ? 'px-2 py-2 align-middle w-10' : 'px-4 py-3 w-12'}>
                <input type="checkbox" checked={materials.length > 0 && materials.every(m => selectedIds.has(m.productId))} onChange={e => { if (e.target.checked) onSelectAll(new Set(materials.map(m => m.productId))); else onSelectAll(new Set()); }} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
              </th>
            )}
            <th className={compact ? `pl-4 pr-1 ${py} ${thBase} text-left align-middle` : `${thBase}`}>{compact ? '物料' : '物料信息'}</th>
            <th className={compact ? `pl-2 pr-2 ${py} ${thBase} text-right align-middle whitespace-nowrap tabular-nums` : `${thBase} text-center`}>{compact ? '领料(+)' : '生产领料(+)'}</th>
            <th className={compact ? `${px} ${py} ${thBase} text-right align-middle whitespace-nowrap tabular-nums` : `${thBase} text-center`}>{compact ? '退料(-)' : '生产退料(-)'}</th>
            <th className={compact ? `${px} ${py} ${thBase} text-right align-middle whitespace-nowrap tabular-nums` : `${thBase} text-center`}>净领用</th>
            <th className={compact ? `${px} ${py} ${thBase} text-right align-middle whitespace-nowrap` : `${thBase} text-center`}>报工耗材</th>
            <th className={compact ? `pl-2 pr-6 ${py} ${thBase} text-right align-middle whitespace-nowrap tabular-nums` : `${thBase} text-center`}>{compact ? '结余' : '当前结余'}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {materials.length === 0 ? (
            <tr><td colSpan={cols} className={compact ? 'px-4 py-6 text-center text-slate-400 text-sm' : 'px-6 py-8 text-center text-slate-400 text-sm'}>{emptyMessage}</td></tr>
          ) : materials.map(row => {
            const { productId, issue, returnQty } = row;
            const prod = productsById.get(productId);
            const customTags = getProductCategoryCustomFieldEntries(
              prod,
              prod ? categoryMap.get(prod.categoryId) : undefined,
              { includeFile: false },
            );
            const net = issue - returnQty;
            const reportCost = matRowReportCost(row);
            const balance = Math.round((net - reportCost) * 100) / 100;
            return (
              <tr
                key={productId}
                className={`hover:bg-slate-50/50 transition-colors${selecting ? ' cursor-pointer' : ''}`}
                onClick={selecting ? () => onToggleSelect(productId) : undefined}
              >
                {selecting && (
                  <td
                    className={compact ? 'px-2 py-2 align-middle w-10' : 'px-4 py-3'}
                    onClick={e => e.stopPropagation()}
                  >
                    <input type="checkbox" checked={selectedIds.has(productId)} onChange={() => onToggleSelect(productId)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  </td>
                )}
                <td className={compact ? `pl-4 pr-1 ${py} align-middle min-w-0` : `${px} ${py}`}>
                  {compact ? (
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-800" title={prod?.name}>
                        {prod?.name ?? '未知物料'}
                        {prod?.sku ? <span className="ml-2 text-[10px] font-medium text-slate-400">{prod.sku}</span> : null}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {customTags.map(({ field, display }) => (
                          <span
                            key={field.id}
                            className="rounded bg-slate-50 px-1 py-px text-[8px] font-bold text-slate-500"
                          >
                            {field.label}: {display}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800">
                        {prod?.name ?? '未知物料'}
                        {prod?.sku ? <span className="ml-2 text-[10px] font-medium text-slate-400">{prod.sku}</span> : null}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {customTags.map(({ field, display }) => (
                          <span
                            key={field.id}
                            className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500"
                          >
                            {field.label}: {display}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </td>
                {compact ? (
                  <>
                    <td className={`pl-2 pr-2 ${py} text-right align-middle tabular-nums`}><span className="text-sm font-bold text-indigo-600">{issue}</span></td>
                    <td className={`${px} ${py} text-right align-middle tabular-nums`}><span className="text-sm font-bold text-rose-600">{returnQty}</span></td>
                    <td className={`${px} ${py} text-right align-middle tabular-nums`}><span className="text-sm font-bold text-slate-800">{net}</span></td>
                    <td className={`${px} ${py} text-right align-middle tabular-nums`}><span className="text-sm font-bold text-amber-600">{reportCost}</span></td>
                    <td className={`pl-2 pr-6 ${py} text-right align-middle tabular-nums`}><span className={`text-sm font-bold ${balance >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>{balance}</span></td>
                  </>
                ) : (
                  <>
                    <td className={`${px} ${py} text-center`}><span className="text-sm font-bold text-indigo-600 inline-flex items-center gap-0.5">{issue} <ArrowUpFromLine className="w-3.5 h-3.5 opacity-70" /></span></td>
                    <td className={`${px} ${py} text-center`}><span className="text-sm font-bold text-rose-600 inline-flex items-center gap-0.5">{returnQty} <Undo2 className="w-3.5 h-3.5 opacity-70" /></span></td>
                    <td className={`${px} ${py} text-center`}><span className="text-sm font-bold text-slate-800">{net}</span></td>
                    <td className={`${px} ${py} text-center`}><span className="text-sm font-bold text-amber-600">{reportCost}</span></td>
                    <td className={`${px} ${py} text-center`}><span className={`text-sm font-bold ${balance >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>{balance}</span></td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default MaterialStatsTable;
