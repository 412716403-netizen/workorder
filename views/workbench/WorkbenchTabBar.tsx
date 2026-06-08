import React, { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, X } from 'lucide-react';
import { isWorkbenchHomePage, WORKBENCH_HOME_PAGE_ID, type WorkbenchPage } from '../../types';
import {
  subModuleTabBarBackdropClass,
  subModuleTabButtonClass,
  subModuleTabPillClass,
} from '../../styles/uiDensity';

interface WorkbenchTabBarProps {
  pages: WorkbenchPage[];
  activePageId: string;
  editing: boolean;
  onSelect: (id: string) => void;
  onAddPage: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  toolbar?: React.ReactNode;
}

function FixedHomeTab({
  page,
  active,
  onSelect,
}: {
  page: WorkbenchPage;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <div className="shrink-0">
      <button type="button" onClick={onSelect} className={subModuleTabButtonClass(active)}>
        <span className="max-w-[8rem] truncate">{page.title}</span>
      </button>
    </div>
  );
}

function SortableTab({
  page,
  active,
  editing,
  onSelect,
  onRename,
  onDelete,
}: {
  page: WorkbenchPage;
  active: boolean;
  editing: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(page.title);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
    disabled: !editing,
  });

  useEffect(() => {
    if (!renaming) setName(page.title);
  }, [page.title, renaming]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  };

  const commitRename = () => {
    setRenaming(false);
    if (name.trim() && name.trim() !== page.title) onRename(name.trim());
    else setName(page.title);
  };

  if (!editing) {
    return (
      <div ref={setNodeRef} style={style} className="shrink-0">
        <button type="button" onClick={onSelect} className={subModuleTabButtonClass(active)}>
          <span className="max-w-[8rem] truncate">{page.title}</span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`inline-flex shrink-0 items-center rounded-xl transition-all ${
        active ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-slate-400 hover:bg-slate-50/50 hover:text-slate-600'
      }`}
    >
      <span
        className="cursor-grab touch-none pl-2 text-slate-300 hover:text-slate-500 active:cursor-grabbing"
        {...attributes}
        {...listeners}
        onClick={e => e.stopPropagation()}
        aria-hidden
      >
        <GripVertical className="h-3.5 w-3.5" />
      </span>
      <button
        type="button"
        onClick={onSelect}
        className="px-3 py-2 pl-1.5 text-sm font-bold whitespace-nowrap"
      >
        {renaming ? (
          <input
            className="w-24 rounded-lg border border-indigo-200 bg-white px-2 py-0.5 text-xs font-bold text-slate-800 outline-none ring-2 ring-indigo-100"
            value={name}
            autoFocus
            onClick={e => e.stopPropagation()}
            onChange={e => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') {
                setRenaming(false);
                setName(page.title);
              }
            }}
          />
        ) : (
          <span
            className="max-w-[8rem] truncate"
            onDoubleClick={e => {
              e.stopPropagation();
              setRenaming(true);
            }}
          >
            {page.title}
          </span>
        )}
      </button>
      {!renaming && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onDelete();
          }}
          className="mr-1.5 rounded-md p-0.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500"
          aria-label={`删除页面 ${page.title}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

const WorkbenchTabBar: React.FC<WorkbenchTabBarProps> = ({
  pages,
  activePageId,
  editing,
  onSelect,
  onAddPage,
  onRename,
  onDelete,
  onReorder,
  toolbar,
}) => {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const homePage = useMemo(
    () => pages.find(p => isWorkbenchHomePage(p.id)),
    [pages],
  );
  const movablePages = useMemo(
    () => pages.filter(p => !isWorkbenchHomePage(p.id)),
    [pages],
  );
  const movableIds = useMemo(() => movablePages.map(p => p.id), [movablePages]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = movableIds.indexOf(String(active.id));
    const newIndex = movableIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = [...movableIds];
    const [removed] = next.splice(oldIndex, 1);
    next.splice(newIndex, 0, removed);
    onReorder([WORKBENCH_HOME_PAGE_ID, ...next]);
  };

  return (
    <div className={`${subModuleTabBarBackdropClass} mb-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2 py-1">
        <div className={subModuleTabPillClass}>
          <div className="flex min-w-0 items-center gap-1">
            {homePage && (
              <FixedHomeTab
                page={homePage}
                active={homePage.id === activePageId}
                onSelect={() => onSelect(homePage.id)}
              />
            )}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={movableIds} strategy={horizontalListSortingStrategy}>
                {movablePages.map(page => (
                  <SortableTab
                    key={page.id}
                    page={page}
                    active={page.id === activePageId}
                    editing={editing}
                    onSelect={() => onSelect(page.id)}
                    onRename={title => onRename(page.id, title)}
                    onDelete={() => onDelete(page.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
            {editing && (
              <button
                type="button"
                onClick={onAddPage}
                className="flex shrink-0 items-center gap-1 rounded-xl border border-dashed border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50/80"
              >
                <Plus className="h-3.5 w-3.5" /> 添加页面
              </button>
            )}
          </div>
        </div>
        {toolbar ? <div className="flex shrink-0 flex-wrap items-center gap-2">{toolbar}</div> : null}
      </div>
    </div>
  );
};

export default WorkbenchTabBar;
