import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { ChevronRight } from 'lucide-react';
import {
  buildInsertMenuItems,
  insertTable,
  type InsertBasicItem,
  type InsertCommonItem,
  type InsertMenuIconTone,
} from './insertMenuConfig';

interface InsertMenuPopupProps {
  editor: Editor;
  onPickImage?: () => void;
  onOpenLinkDialog?: () => void;
  onClose?: () => void;
}

const TONE_CLASS: Record<InsertMenuIconTone, string> = {
  slate: 'bg-slate-100 text-slate-600',
  blue: 'bg-blue-50 text-blue-600',
  amber: 'bg-amber-50 text-amber-600',
  green: 'bg-emerald-50 text-emerald-600',
  violet: 'bg-violet-50 text-violet-600',
  rose: 'bg-rose-50 text-rose-600',
  sky: 'bg-sky-50 text-sky-600',
  orange: 'bg-orange-50 text-orange-600',
};

function BasicIconButton({ item, onRun }: { item: InsertBasicItem; onRun: () => void }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      title={item.label}
      className="kb-insert-basic-btn"
      onMouseDown={e => {
        e.preventDefault();
        onRun();
      }}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
    </button>
  );
}

interface FlyoutPos {
  top: number;
  left: number;
}

function TableSizePicker({
  editor,
  pos,
  onDone,
  onMouseEnter,
  onMouseLeave,
}: {
  editor: Editor;
  pos: FlyoutPos;
  onDone: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const maxR = 6;
  const maxC = 8;
  const [hoverR, setHoverR] = useState(0);
  const [hoverC, setHoverC] = useState(0);

  return createPortal(
    <div
      className="kb-insert-table-picker-portal"
      style={{ top: pos.top, left: pos.left }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseDown={e => e.preventDefault()}
    >
      <div className="kb-insert-table-picker">
        <p className="kb-insert-table-picker-title">
          {hoverR > 0 && hoverC > 0 ? `${hoverR} × ${hoverC}` : '选择表格大小'}
        </p>
        <div className="kb-insert-table-grid">
          {Array.from({ length: maxR }, (_, r) =>
            Array.from({ length: maxC }, (_, c) => {
              const row = r + 1;
              const col = c + 1;
              const active = row <= hoverR && col <= hoverC;
              return (
                <button
                  key={`${row}-${col}`}
                  type="button"
                  className={`kb-insert-table-cell ${active ? 'is-active' : ''}`}
                  onMouseEnter={() => {
                    setHoverR(row);
                    setHoverC(col);
                  }}
                  onMouseDown={e => {
                    e.preventDefault();
                    insertTable(editor, row, col);
                    onDone();
                  }}
                />
              );
            }),
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CommonRow({
  item,
  editor,
  onRun,
  onClose,
}: {
  item: InsertCommonItem;
  editor: Editor;
  onRun: () => void;
  onClose?: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [flyoutPos, setFlyoutPos] = useState<FlyoutPos | null>(null);
  const Icon = item.icon;

  const clearCloseTimer = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => {
      setFlyoutOpen(false);
      setFlyoutPos(null);
    }, 200);
  };

  const updateFlyoutPos = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pickerWidth = 200;
    const margin = 8;
    let left = rect.right + 6;
    if (left + pickerWidth > window.innerWidth - margin) {
      left = Math.max(margin, rect.left - pickerWidth - 6);
    }
    setFlyoutPos({ top: rect.top, left });
  }, []);

  const openFlyout = () => {
    if (!item.hasSubmenu) return;
    clearCloseTimer();
    setFlyoutOpen(true);
    requestAnimationFrame(updateFlyoutPos);
  };

  useEffect(() => () => clearCloseTimer(), []);

  return (
    <div
      ref={rowRef}
      className="kb-insert-common-row-wrap"
      onMouseEnter={openFlyout}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className={`kb-insert-common-row ${flyoutOpen ? 'is-active' : ''}`}
        onMouseDown={e => {
          e.preventDefault();
          if (!item.hasSubmenu) onRun();
        }}
      >
        <span className={`kb-insert-common-icon ${TONE_CLASS[item.tone]}`}>
          <Icon className="h-[15px] w-[15px]" strokeWidth={2} />
        </span>
        <span className="kb-insert-common-label">{item.label}</span>
        {item.hasSubmenu && <ChevronRight className="kb-insert-common-chevron" />}
      </button>
      {item.hasSubmenu && flyoutOpen && flyoutPos && (
        <TableSizePicker
          editor={editor}
          pos={flyoutPos}
          onDone={() => onClose?.()}
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleClose}
        />
      )}
    </div>
  );
}

const InsertMenuPopup: React.FC<InsertMenuPopupProps> = ({
  editor,
  onPickImage,
  onOpenLinkDialog,
  onClose,
}) => {
  const { basic, common } = buildInsertMenuItems(onPickImage, onOpenLinkDialog);

  const run = (fn: (ed: Editor) => void) => {
    fn(editor);
    onClose?.();
  };

  return (
    <div className="kb-insert-popup" onMouseDown={e => e.preventDefault()}>
      <div className="kb-insert-section">
        <div className="kb-insert-section-title">基础</div>
        <div className="kb-insert-basic-grid">
          {basic.map(item => (
            <BasicIconButton key={item.id} item={item} onRun={() => run(item.run)} />
          ))}
        </div>
      </div>

      <div className="kb-insert-divider" />

      <div className="kb-insert-section">
        <div className="kb-insert-section-title">常用</div>
        <div className="kb-insert-common-list">
          {common.map(item => (
            <CommonRow
              key={item.id}
              item={item}
              editor={editor}
              onRun={() => run(item.run)}
              onClose={onClose}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default InsertMenuPopup;
