import React from 'react';

interface ListPageControlsProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/** 基础信息列表等表格底部分页条 */
const ListPageControls: React.FC<ListPageControlsProps> = ({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  className = '',
}) => {
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-3 px-4 border-t border-slate-100 bg-slate-50/50 ${className}`}>
      <span className="text-xs text-slate-500 font-medium tabular-nums">
        共 {total} 条，显示 {from}–{to}，第 {page} / {totalPages} 页
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          上一页
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          下一页
        </button>
      </div>
    </div>
  );
};

export default ListPageControls;
