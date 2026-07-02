import React, { useMemo } from 'react';
import { Check, Lock, RotateCcw } from 'lucide-react';
import type { GlobalNodeTemplate } from '../../types';
import { sortNodeIdsByGlobalOrder } from '../../utils/globalNodeOrder';
import { milestoneNodeIdsEqual } from '../../shared/productProcessLock';

export interface PlanProcessRouteEditorProps {
  globalNodes: GlobalNodeTemplate[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** 产品标准路线，用于「恢复默认」与来源提示 */
  productMilestoneNodeIds: string[];
  /** 计划是否已持久化覆盖（非沿用产品） */
  hasPlanOverride?: boolean;
  /** 嵌入弹窗时去掉外边距 */
  embedded?: boolean;
}

const PlanProcessRouteEditor: React.FC<PlanProcessRouteEditorProps> = ({
  globalNodes,
  value,
  onChange,
  disabled = false,
  productMilestoneNodeIds,
  hasPlanOverride = false,
  embedded = false,
}) => {
  const selectedNodesOrdered = useMemo(
    () =>
      value
        .map(id => globalNodes.find(gn => gn.id === id))
        .filter((n): n is GlobalNodeTemplate => Boolean(n)),
    [value, globalNodes],
  );

  const isSameAsProduct = milestoneNodeIdsEqual(value, productMilestoneNodeIds);

  const toggleNode = (nodeId: string) => {
    if (disabled) return;
    const current = [...value];
    const index = current.indexOf(nodeId);
    if (index > -1) {
      current.splice(index, 1);
    } else {
      current.push(nodeId);
    }
    onChange(sortNodeIdsByGlobalOrder(current, globalNodes));
  };

  const moveNode = (fromIdx: number, toIdx: number) => {
    if (disabled) return;
    const current = [...value];
    const [moved] = current.splice(fromIdx, 1);
    current.splice(toIdx, 0, moved);
    onChange(current);
  };

  const resetToProduct = () => {
    if (disabled) return;
    onChange([...productMilestoneNodeIds]);
  };

  const sourceLabel = hasPlanOverride && !isSameAsProduct
    ? '本计划已自定义工序路线'
    : '当前沿用产品标准生产路线';

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-4 mb-6'}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardCheckIcon />
          <span className="text-[11px] font-bold text-slate-600 truncate">{sourceLabel}</span>
        </div>
        {!disabled && productMilestoneNodeIds.length > 0 && !isSameAsProduct && (
          <button
            type="button"
            onClick={resetToProduct}
            className="inline-flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 px-2.5 py-1 rounded-lg hover:bg-indigo-50 transition-colors shrink-0"
          >
            <RotateCcw className="w-3 h-3" />
            恢复为产品默认
          </button>
        )}
      </div>

      {disabled && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
          <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs font-medium text-amber-900 leading-snug">
            已下达工单，工序路线已锁定。删除全部关联工单后可再次调整。
          </p>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50/90 to-white p-4 sm:p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 gap-y-1 mb-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-[10px] font-black text-white">1</span>
          <h4 className="text-xs font-black text-slate-800">可选工序</h4>
          <span className="text-[10px] text-slate-400">点击加入下方路线</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {globalNodes.map(gn => {
            const isSelected = value.includes(gn.id);
            return (
              <button
                key={gn.id}
                type="button"
                disabled={disabled}
                onClick={() => toggleNode(gn.id)}
                className={`p-2.5 rounded-lg border text-left transition-all flex items-center justify-between gap-2 ${disabled ? 'opacity-50 cursor-not-allowed border-slate-200 bg-slate-50' : isSelected ? 'border-indigo-600 bg-indigo-50/50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'}`}
              >
                <span className={`text-xs font-semibold truncate ${isSelected ? 'text-indigo-900' : 'text-slate-600'}`}>{gn.name}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border-2 border-indigo-100 bg-indigo-50/20 p-4 sm:p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-[10px] font-black text-white">2</span>
            <h4 className="text-xs font-black text-slate-800">本计划生产路线</h4>
          </div>
          <span className="text-[10px] font-bold text-indigo-700 bg-white/80 border border-indigo-100 px-2 py-0.5 rounded-full">
            共 {value.length} 道工序 · ↑↓ 调整顺序
          </span>
        </div>
        {selectedNodesOrdered.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">请先在上方选择工序</p>
        ) : (
          <div className="space-y-2 relative">
            {selectedNodesOrdered.length > 1 && (
              <div className="absolute left-[11px] top-6 bottom-6 w-0.5 bg-indigo-100 z-0 hidden sm:block" aria-hidden />
            )}
            {selectedNodesOrdered.map((node, idx) => (
              <div key={node.id} className="relative z-10 rounded-xl border border-white bg-white/90 shadow-sm ring-1 ring-indigo-50 group">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-2.5 sm:pl-3">
                  <div className="w-6 h-6 bg-indigo-600 text-white rounded-lg flex items-center justify-center text-[10px] font-black shrink-0">{idx + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800">{node.name}</p>
                  </div>
                  {!disabled && (
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {idx > 0 && (
                        <button type="button" title="上移" onClick={() => moveNode(idx, idx - 1)} className="p-1 hover:bg-indigo-50 rounded-lg text-slate-400 hover:text-indigo-600">↑</button>
                      )}
                      {idx < selectedNodesOrdered.length - 1 && (
                        <button type="button" title="下移" onClick={() => moveNode(idx, idx + 1)} className="p-1 hover:bg-indigo-50 rounded-lg text-slate-400 hover:text-indigo-600">↓</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

function ClipboardCheckIcon() {
  return (
    <svg className="w-4 h-4 text-indigo-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  );
}

export default PlanProcessRouteEditor;
