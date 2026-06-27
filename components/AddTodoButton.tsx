import React, { useState } from 'react';
import { ListTodo } from 'lucide-react';
import { useFeaturePlugins } from '../hooks/useFeaturePlugins';
import AddTodoModal, { type AddTodoSeed } from './AddTodoModal';

interface AddTodoButtonProps {
  seed: AddTodoSeed;
  /** 'button' 带文字（详情顶栏）；'icon' 仅图标（紧凑场景） */
  variant?: 'button' | 'icon';
  className?: string;
  /** 新建待办弹窗层级；宿主弹窗 z-index 较高时（如开发管理）需上调 */
  modalZIndexClass?: string;
}

/**
 * 详情页「加待办」入口。仅当 todo_reminder 插件开启时显示；
 * 点击打开新建待办弹窗并带入当前单据上下文。
 */
const AddTodoButton: React.FC<AddTodoButtonProps> = ({ seed, variant = 'button', className = '', modalZIndexClass }) => {
  const { isPluginEnabled } = useFeaturePlugins();
  const [open, setOpen] = useState(false);

  if (!isPluginEnabled('todo_reminder')) return null;

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="加入待办"
          aria-label="加入待办"
          className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600 ${className}`}
        >
          <ListTodo className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-600 ${className}`}
        >
          <ListTodo className="h-4 w-4" /> 待办
        </button>
      )}
      <AddTodoModal open={open} onClose={() => setOpen(false)} seed={seed} zIndexClass={modalZIndexClass} />
    </>
  );
};

export default AddTodoButton;
