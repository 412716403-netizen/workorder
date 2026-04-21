import React from 'react';

export type QtyMatrixTableRow = {
  key: string;
  colorCell: React.ReactNode;
  cells: React.ReactNode[];
  subtotalCell: React.ReactNode;
};

export type QtyMatrixTableProps = {
  sizeHeaders: string[];
  rows: QtyMatrixTableRow[];
  /** 表整体最小宽度，避免列过多时挤压 */
  minWidth?: string;
  /**
   * 紧凑尺码列：表宽随内容、尺码列靠颜色列左侧排列（报工弹窗等）。
   * 默认 false 时表为通栏 + 尺码列最小宽度 6.75rem。
   */
  compactSizeColumns?: boolean;
  /** 更紧的行高与内边距（如报工弹窗内省纵向空间） */
  dense?: boolean;
};

/**
 * 颜色 × 尺码数量矩阵表壳（表头灰底、行间横线、无竖向网格线），与协作回传矩阵视觉一致。
 */
const QtyMatrixTable: React.FC<QtyMatrixTableProps> = ({
  sizeHeaders,
  rows,
  minWidth,
  compactSizeColumns = false,
  dense = false,
}) => {
  const thPad = dense ? 'px-2 py-1.5' : compactSizeColumns ? 'px-2 py-2 pl-1 pr-2' : 'px-3 py-2.5';
  const thSizePad = dense ? 'px-2 py-1.5' : compactSizeColumns ? 'px-2 py-2 pl-1 pr-2' : 'px-3 py-2.5';
  const tdColor = dense ? 'px-2 py-1.5' : compactSizeColumns ? 'px-3 py-2' : 'px-3 py-2.5';
  const tdCell = dense
    ? 'px-2 py-1.5 align-middle'
    : compactSizeColumns
      ? 'w-auto px-2 py-2 pl-1 pr-2 align-top text-left'
      : 'px-3 py-2.5 align-middle';
  const tdSub = dense ? 'px-2 py-1.5 text-right align-middle' : compactSizeColumns ? 'px-3 py-2 align-top text-right' : 'px-3 py-2.5 align-middle text-right';
  const thText = dense ? 'text-[9px]' : 'text-[10px]';

  return (
  <div className="overflow-x-auto rounded-xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-100">
    <table
      className={`border-collapse text-left text-sm ${
        compactSizeColumns ? 'w-max max-w-full' : 'w-full min-w-[480px]'
      }`}
      style={minWidth ? { minWidth } : undefined}
    >
      <thead>
        <tr className="border-b border-slate-200 bg-slate-100/90">
          <th className={`w-[5.5rem] shrink-0 ${thPad} ${thText} font-black uppercase tracking-wide text-slate-500`}>颜色</th>
          {sizeHeaders.map((h, i) => (
            <th
              key={`${i}-${h}`}
              className={`text-left ${thText} font-black uppercase tracking-wide text-slate-500 ${
                compactSizeColumns
                  ? `w-auto whitespace-nowrap ${thSizePad} align-top`
                  : dense
                    ? `${thSizePad} align-middle`
                    : 'min-w-[6.75rem] px-3 py-2.5'
              }`}
            >
              {h}
            </th>
          ))}
          <th className={`w-[4.5rem] shrink-0 ${thPad} text-right ${thText} font-black uppercase tracking-wide text-slate-500`}>
            颜色小计
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map(r => (
          <tr key={r.key} className="bg-white transition-colors hover:bg-slate-50/60">
            <td
              className={`whitespace-nowrap ${tdColor} text-sm font-bold text-slate-800 ${
                compactSizeColumns && !dense ? 'align-top' : 'align-middle'
              }`}
            >
              {r.colorCell}
            </td>
            {r.cells.map((cell, i) => (
              <td
                key={i}
                className={tdCell}
              >
                {cell}
              </td>
            ))}
            <td
              className={`${tdSub} text-sm font-black tabular-nums text-slate-800`}
            >
              {r.subtotalCell}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
  );
};

export default React.memo(QtyMatrixTable);
