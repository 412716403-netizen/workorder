import React, { useCallback, useMemo } from 'react';
import ReactGridLayout, { type Layout } from 'react-grid-layout/legacy';
import { useContainerWidth } from 'react-grid-layout';
import type { WorkbenchLayoutItem } from '../../types';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './workbench-grid.css';

interface WorkbenchGridProps {
  items: WorkbenchLayoutItem[];
  editing: boolean;
  isItemPinned?: (item: WorkbenchLayoutItem) => boolean;
  renderWidget: (item: WorkbenchLayoutItem) => React.ReactNode;
  onLayoutChange: (items: WorkbenchLayoutItem[]) => void;
}

function mergeLayoutItems(
  items: WorkbenchLayoutItem[],
  next: Layout[],
): WorkbenchLayoutItem[] {
  const map = new Map(next.map(l => [l.i, l]));
  return items.map(it => {
    const l = map.get(it.i);
    if (!l) return it;
    return { ...it, x: l.x, y: l.y, w: l.w, h: l.h };
  });
}

/** 仅比较位置/尺寸，避免值未变时回写 state 造成无限渲染 */
function isSameGeometry(items: WorkbenchLayoutItem[], next: Layout[]): boolean {
  if (items.length !== next.length) return false;
  const map = new Map(next.map(l => [l.i, l]));
  return items.every(it => {
    const l = map.get(it.i);
    return !!l && l.x === it.x && l.y === it.y && l.w === it.w && l.h === it.h;
  });
}

const WorkbenchGrid: React.FC<WorkbenchGridProps> = ({
  items,
  editing,
  isItemPinned,
  renderWidget,
  onLayoutChange,
}) => {
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1280 });

  const layout: Layout = useMemo(
    () => items.map(it => ({
      i: it.i,
      x: it.x,
      y: it.y,
      w: it.w,
      h: it.h,
      minW: it.minW,
      minH: it.minH,
      static: !editing || (isItemPinned?.(it) ?? false),
    })),
    [items, editing, isItemPinned],
  );

  const commitLayout = useCallback(
    (next: Layout) => {
      if (isSameGeometry(items, next)) return;
      onLayoutChange(mergeLayoutItems(items, next));
    },
    [items, onLayoutChange],
  );

  if (items.length === 0) {
    return (
      <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 text-sm text-slate-400">
        {editing ? '点击「添加组件」为此页面添加卡片' : '此页面暂无组件'}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="workbench-grid-host">
      {mounted && width > 0 && (
        <ReactGridLayout
          className={`workbench-grid${editing ? ' workbench-grid--editing' : ''}`}
          width={width}
          cols={12}
          rowHeight={40}
          margin={[16, 16] as const}
          containerPadding={[0, 0] as const}
          layout={layout}
          onDragStop={commitLayout}
          onResizeStop={commitLayout}
          isDraggable={editing}
          isResizable={editing}
          draggableCancel=".workbench-no-drag, button, a, input, textarea, select, label, .react-resizable-handle"
          resizeHandles={['se']}
          compactType="vertical"
          useCSSTransforms
        >
          {items.map(item => (
            <div key={item.i} className="workbench-grid-item-inner">
              {renderWidget(item)}
            </div>
          ))}
        </ReactGridLayout>
      )}
    </div>
  );
};

export default WorkbenchGrid;
