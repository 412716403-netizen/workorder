import React, { ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { PrintTemplate } from '../../types';

export interface PrintTemplateWhitelistCardProps {
  title: string;
  hint?: ReactNode;
  /** 已加入的模版白名单（空/不填表示打印时可选全部模版） */
  allowedTemplateIds?: string[];
  onChangeAllowedTemplateIds: (next: string[] | undefined) => void;
  /**
   * 可选的布尔开关：
   * - 列表打印：`showPrintButton`（「在 xx 列表显示打印按钮」）
   * - 计划标签打印：`showPlanDetailTraceSection`（「在计划详情中显示追溯码区块」）
   */
  toggle?: {
    label: ReactNode;
    description?: ReactNode;
    checked: boolean;
    onChange: (v: boolean) => void;
  };
  availableTemplates: PrintTemplate[];
  /** 点「增加模版」时的回调，通常在外层打开 PlanPrintTemplateManageDialog */
  onRequestAddTemplate: () => void;
  addButtonLabel?: string;
  emptyHint?: ReactNode;
}

/**
 * 打印模版白名单卡片。合并原本分散在 5 处的 `printCard` / `listPrintSection` JSX：
 * PSI 4 个 Modal、Plan 标签/列表打印、Order 工单中心三块、Material/Outsource/Rework 流水详情。
 *
 * 说明：本组件只负责卡片 UI；「增加模版」打开的 PlanPrintTemplateManageDialog 由外层统一挂载。
 */
export const PrintTemplateWhitelistCard: React.FC<PrintTemplateWhitelistCardProps> = ({
  title,
  hint,
  allowedTemplateIds,
  onChangeAllowedTemplateIds,
  toggle,
  availableTemplates,
  onRequestAddTemplate,
  addButtonLabel = '增加模版',
  emptyHint,
}) => {
  const ids = allowedTemplateIds ?? [];
  return (
    <div className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-black text-slate-800">{title}</h4>
        <button
          type="button"
          onClick={onRequestAddTemplate}
          className="flex shrink-0 items-center gap-1 rounded-xl border border-indigo-200 bg-white px-3 py-1.5 text-xs font-black text-indigo-700 hover:bg-indigo-50"
        >
          <Plus className="h-3.5 w-3.5" /> {addButtonLabel}
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {toggle && (
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm font-bold text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 rounded text-indigo-600"
            checked={toggle.checked}
            onChange={e => toggle.onChange(e.target.checked)}
          />
          <span>
            {toggle.label}
            {toggle.description && (
              <span className="mt-0.5 block text-xs font-normal font-medium text-slate-500">{toggle.description}</span>
            )}
          </span>
        </label>
      )}
      <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-400">可选模版（已加入）</p>
      <div className="mt-2 flex max-h-36 flex-wrap gap-2 overflow-y-auto">
        {ids.length === 0 ? (
          emptyHint ? (
            <span className="text-xs text-slate-400">{emptyHint}</span>
          ) : null
        ) : (
          ids.map(tid => {
            const t = availableTemplates.find(x => x.id === tid);
            return (
              <div
                key={tid}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white pl-2.5 pr-1 py-1 text-xs font-bold text-slate-700"
              >
                <span className="max-w-[200px] truncate">{t?.name ?? `已删除模版 (${tid.slice(0, 8)}…)`}</span>
                <button
                  type="button"
                  title="从可选列表移除"
                  onClick={() => {
                    const next = ids.filter(x => x !== tid);
                    onChangeAllowedTemplateIds(next.length > 0 ? next : undefined);
                  }}
                  className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default PrintTemplateWhitelistCard;
