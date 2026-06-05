import React from 'react';
import { X, Settings2, Check, ArrowRight } from 'lucide-react';

export interface DevFlowNodePickerOption {
  id: string;
  label: string;
  chipSuffix?: string;
}

interface DevFlowNodePickerProps {
  title: string;
  options: DevFlowNodePickerOption[];
  /** 已选节点 id，顺序即路线顺序 */
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  readOnly?: boolean;
  optionsEmptyMessage?: string;
  selectedEmptyMessage?: string;
  /** 打开开发节点库管理（创建款式弹窗内） */
  onOpenSettings?: () => void;
  settingsLabel?: string;
  /** 嵌入创建弹窗卡片：隐藏区块标题，收紧内边距 */
  embedded?: boolean;
  hideHeader?: boolean;
}

/** 万濮云式：上方节点池网格 + 下方已选标签块 */
const DevFlowNodePicker: React.FC<DevFlowNodePickerProps> = ({
  title,
  options,
  selectedIds,
  onSelectedIdsChange,
  readOnly,
  optionsEmptyMessage = '暂无节点配置',
  selectedEmptyMessage = '请点击上方节点选择',
  onOpenSettings,
  settingsLabel = '节点管理',
  embedded = false,
  hideHeader = false,
}) => {
  const optionById = new Map(options.map((o) => [o.id, o]));
  const selectedSet = new Set(selectedIds);

  const addNode = (id: string) => {
    if (readOnly || selectedIds.includes(id)) return;
    onSelectedIdsChange([...selectedIds, id]);
  };

  const removeAt = (idx: number) => {
    if (readOnly) return;
    onSelectedIdsChange(selectedIds.filter((_, i) => i !== idx));
  };

  const settingsBtn = onOpenSettings && !readOnly && (
    <button
      type="button"
      onClick={onOpenSettings}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-500 hover:border-indigo-200 hover:text-indigo-600 shadow-sm transition-colors"
    >
      <Settings2 className="w-3.5 h-3.5" />
      {settingsLabel}
    </button>
  );

  return (
    <div className={embedded ? '' : 'pt-6 border-t border-slate-100'}>
      {!hideHeader && (
        <div className="flex items-center justify-between gap-3 mb-4 pl-0.5 pr-0.5">
          <div className="flex items-center gap-3">
            <div className="w-1 h-5 bg-indigo-600 rounded-full" />
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">{title}</h4>
          </div>
          {settingsBtn}
        </div>
      )}

      <div
        className={
          embedded
            ? 'space-y-5'
            : 'bg-slate-50 p-8 rounded-[32px] border border-slate-100 space-y-6'
        }
      >
        {!readOnly && (
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
              可选节点
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
              {options.map((opt) => {
                const picked = selectedSet.has(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={picked}
                    onClick={() => addNode(opt.id)}
                    className={`relative px-3 py-2 rounded-xl text-[11px] font-bold transition-all active:scale-95 ${
                      picked
                        ? 'bg-indigo-50 border border-indigo-200 text-indigo-600 cursor-default'
                        : 'bg-white border border-slate-100 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 shadow-sm'
                    }`}
                  >
                    {opt.label}
                    {picked ? (
                      <Check className="absolute top-1 right-1 w-3 h-3 text-indigo-500" aria-hidden />
                    ) : null}
                  </button>
                );
              })}
              {options.length === 0 && (
                <div className="col-span-full text-xs text-slate-400 py-6 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
                  {optionsEmptyMessage}
                </div>
              )}
            </div>
          </div>
        )}

        <div className={!readOnly && options.length > 0 ? 'pt-1' : ''}>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
            已选流程 {selectedIds.length > 0 ? `（${selectedIds.length} 步）` : ''}
          </p>
          {selectedIds.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {selectedIds.map((id, i) => {
                const opt = optionById.get(id);
                const label = opt?.label ?? id;
                return (
                  <React.Fragment key={`${id}-${i}`}>
                    {i > 0 && (
                      <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0 hidden sm:block" aria-hidden />
                    )}
                    <div className="group/tag relative flex items-center gap-2 bg-white border border-slate-200 px-3.5 py-2 rounded-xl shadow-sm">
                      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-indigo-600 text-[10px] font-black text-white">
                        {i + 1}
                      </span>
                      <span className="text-xs font-bold text-slate-700">
                        {label}
                        {opt?.chipSuffix ? (
                          <span className="text-[10px] font-medium text-slate-400 ml-1">{opt.chipSuffix}</span>
                        ) : null}
                      </span>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeAt(i);
                          }}
                          className="ml-0.5 p-0.5 rounded-md text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                          title="移除此节点"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-slate-400 py-3 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 text-center">
              {selectedEmptyMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DevFlowNodePicker;
