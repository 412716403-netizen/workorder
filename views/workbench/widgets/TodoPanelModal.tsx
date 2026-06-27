import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X, Plus, Bell, Pencil, Trash2, Check, RotateCcw, Loader2, ListTodo, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useTodos } from '../../../hooks/useTodos';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { formatTimestamp } from '../../../utils/formatTime';
import { navigateTodoHref } from '../../../utils/todoHrefNavigate';
import AddTodoModal from '../../../components/AddTodoModal';
import type { TodoItemDTO, TodoStatus } from '../../../types';

interface TodoPanelModalProps {
  open: boolean;
  onClose: () => void;
}

const TABS: { id: TodoStatus; label: string }[] = [
  { id: 'open', label: '未完成' },
  { id: 'done', label: '已完成' },
];

const TodoPanelModal: React.FC<TodoPanelModalProps> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [tab, setTab] = useState<TodoStatus>('open');
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<TodoItemDTO | null>(null);
  const [search, setSearch] = useState('');

  const { items, isLoading, updateTodo, removeTodo } = useTodos({ status: tab, enabled: open });

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(item =>
      `${item.note} ${item.sourceDocNo ?? ''} ${item.sourceTitle ?? ''}`.toLowerCase().includes(q),
    );
  }, [items, search]);

  if (!open) return null;

  const handleToggleDone = async (item: TodoItemDTO) => {
    try {
      await updateTodo({ id: item.id, body: { status: item.status === 'done' ? 'open' : 'done' } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleDelete = async (item: TodoItemDTO) => {
    const ok = await confirm({ message: '确定删除这条待办吗？', danger: true });
    if (!ok) return;
    try {
      await removeTodo(item.id);
      toast.success('已删除');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  const handleJump = (item: TodoItemDTO) => {
    if (!item.href) return;
    navigateTodoHref(navigate, item.href);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/45 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] min-h-[60vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-black text-slate-900">
            <ListTodo className="h-5 w-5 text-rose-500" /> 待办事项
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
            >
              <Plus className="h-3.5 w-3.5" /> 新建待办
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="关闭"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3">
          <div className="flex shrink-0 gap-1">
            {TABS.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                  tab === t.id
                    ? 'bg-indigo-50 text-indigo-600'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索待办内容或关联单据"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-9 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                aria-label="清除搜索"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
            </div>
          ) : filteredItems.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              {search.trim()
                ? '未找到匹配的待办'
                : tab === 'open'
                  ? '暂无待办，点「新建待办」添加'
                  : '暂无已完成待办'}
            </p>
          ) : (
            <ul className="space-y-2">
              {filteredItems.map(item => {
                const docLabel = [item.sourceDocNo, item.sourceTitle].filter(Boolean).join(' ');
                const done = item.status === 'done';
                return (
                  <li
                    key={item.id}
                    className="rounded-xl border border-slate-100 bg-slate-50/60 p-3"
                  >
                    <div className="flex items-start gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleToggleDone(item)}
                        title={done ? '标为未完成' : '标为完成'}
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                          done
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : 'border-slate-300 bg-white hover:border-emerald-400'
                        }`}
                      >
                        {done && <Check className="h-3.5 w-3.5" />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <p
                          className={`whitespace-pre-wrap break-words text-sm ${
                            done ? 'text-slate-400 line-through' : 'text-slate-800'
                          }`}
                        >
                          {item.note}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          {docLabel && (
                            <button
                              type="button"
                              onClick={() => handleJump(item)}
                              disabled={!item.href}
                              className={`max-w-full truncate rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                item.href
                                  ? 'cursor-pointer bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                              title={docLabel}
                            >
                              {docLabel}
                            </button>
                          )}
                          {item.remindEnabled && item.remindAt && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-500">
                              <Bell className="h-3 w-3" />
                              {formatTimestamp(item.remindAt)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => setEditing(item)}
                          title="编辑"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-indigo-600"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          title="删除"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {tab === 'done' && items.length > 0 && (
          <div className="border-t border-slate-100 px-5 py-2 text-center text-[10px] text-slate-400">
            <span className="inline-flex items-center gap-1">
              <RotateCcw className="h-3 w-3" /> 点左侧勾选可还原为未完成
            </span>
          </div>
        )}
      </div>

      <AddTodoModal open={addOpen} onClose={() => setAddOpen(false)} zIndexClass="z-[140]" />
      <AddTodoModal
        open={editing != null}
        editing={editing}
        onClose={() => setEditing(null)}
        zIndexClass="z-[140]"
      />
    </div>,
    document.body,
  );
};

export default TodoPanelModal;
