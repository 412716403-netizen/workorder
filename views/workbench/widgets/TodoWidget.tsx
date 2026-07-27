import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, Loader2, Plus, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import WidgetShell from '../WidgetShell';
import TodoPanelModal from './TodoPanelModal';
import AddTodoModal from '../../../components/AddTodoModal';
import { useTodos } from '../../../hooks/useTodos';
import { formatTimestamp } from '../../../utils/formatTime';
import { navigateTodoHref } from '../../../utils/todoHrefNavigate';
import type { TodoItemDTO } from '../../../types';

interface TodoWidgetProps {
  editing?: boolean;
  layoutLocked?: boolean;
  onRemove?: () => void;
}

const TodoWidget: React.FC<TodoWidgetProps> = ({ editing, layoutLocked, onRemove }) => {
  const navigate = useNavigate();
  const [panelOpen, setPanelOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const { items, isLoading, updateTodo } = useTodos({ status: 'open' });

  const hasDueOpen = useMemo(() => {
    const now = Date.now();
    return items.some(
      item => item.remindEnabled && item.remindAt && new Date(item.remindAt).getTime() <= now,
    );
  }, [items]);

  const handleToggleDone = async (item: TodoItemDTO) => {
    if (editing) return;
    try {
      await updateTodo({ id: item.id, body: { status: 'done' } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleJump = (item: TodoItemDTO) => {
    if (editing || !item.href) return;
    navigateTodoHref(navigate, item.href);
  };

  return (
    <>
      <WidgetShell
        title="待办事项"
        titleDot={hasDueOpen}
        editing={editing}
        layoutLocked={layoutLocked}
        onRemove={onRemove}
        headerExtra={
          <div className="workbench-no-drag flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-600 transition hover:bg-indigo-100"
            >
              <Plus className="h-3.5 w-3.5" /> 新建
            </button>
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-600 transition hover:bg-slate-100"
            >
              <Settings2 className="h-3.5 w-3.5" /> 管理
            </button>
          </div>
        }
      >
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">暂无待办，点「新建」添加</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map(item => {
              const docLabel = [item.sourceDocNo, item.sourceTitle].filter(Boolean).join(' ');
              const remindDue =
                item.remindEnabled
                && item.remindAt
                && new Date(item.remindAt).getTime() <= Date.now();
              return (
                <li key={item.id} className="py-2.5">
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      disabled={editing}
                      onClick={() => handleToggleDone(item)}
                      title="标为完成"
                      className={`workbench-no-drag mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                        editing
                          ? 'cursor-default border-slate-200 bg-slate-50 opacity-70'
                          : 'border-slate-300 bg-white hover:border-emerald-400'
                      }`}
                    >
                      <Check className="h-3.5 w-3.5 text-transparent" />
                    </button>

                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-wrap break-words text-sm text-slate-800" title={item.note}>
                        {item.note}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {docLabel && (
                          <button
                            type="button"
                            disabled={editing || !item.href}
                            onClick={() => handleJump(item)}
                            className={`workbench-no-drag max-w-full truncate rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              !editing && item.href
                                ? 'cursor-pointer bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                            title={docLabel}
                          >
                            {docLabel}
                          </button>
                        )}
                        {item.remindEnabled && item.remindAt && (
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-medium ${
                              remindDue ? 'text-rose-500' : 'text-slate-400'
                            }`}
                          >
                            <Bell className="h-3 w-3" />
                            {formatTimestamp(item.remindAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </WidgetShell>

      <TodoPanelModal open={panelOpen} onClose={() => setPanelOpen(false)} />
      <AddTodoModal open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
};

export default TodoWidget;
