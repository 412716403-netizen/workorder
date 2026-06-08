import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarRange, ClipboardList, ArrowUpFromLine, Truck, RotateCcw,
  Receipt, ShoppingBag, CreditCard, Warehouse,
  ArrowDownCircle, ArrowUpCircle, Scale,
  Boxes, Building2, ShieldCheck, Cpu, Library,
  Inbox, ScanLine, FlaskConical, Settings, Pencil,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import WidgetShell from '../WidgetShell';
import ShortcutsEditModal from './ShortcutsEditModal';
import { useAuth } from '../../../contexts/AuthContext';
import { useFeaturePlugins } from '../../../hooks/useFeaturePlugins';
import { useDashboardShortcuts } from '../../../hooks/useDashboardShortcuts';
import { filterWorkbenchShortcutsByAccess } from '../../../utils/workbenchShortcutsFilter';
import { navigateWorkbenchShortcut } from '../../../utils/workbenchNavigate';
import type { WorkbenchShortcutIconKey } from '../../../types';

const ICON_MAP: Record<WorkbenchShortcutIconKey, LucideIcon> = {
  CalendarRange,
  ClipboardList,
  ArrowUpFromLine,
  Truck,
  RotateCcw,
  Receipt,
  ShoppingBag,
  CreditCard,
  Warehouse,
  ArrowDownCircle,
  ArrowUpCircle,
  Scale,
  Boxes,
  Building2,
  ShieldCheck,
  Cpu,
  Library,
  Inbox,
  ScanLine,
  FlaskConical,
  Settings,
};

interface ShortcutsWidgetProps {
  editing?: boolean;
  onRemove?: () => void;
}

const ShortcutsWidget: React.FC<ShortcutsWidgetProps> = ({ editing, onRemove }) => {
  const navigate = useNavigate();
  const { tenantCtx } = useAuth();
  const { plugins } = useFeaturePlugins();
  const shortcuts = useDashboardShortcuts();
  const [editOpen, setEditOpen] = useState(false);
  const permissions = tenantCtx?.permissions ?? [];

  const items = useMemo(
    () => filterWorkbenchShortcutsByAccess(
      shortcuts.items,
      plugins,
      tenantCtx?.tenantRole,
      permissions,
    ),
    [shortcuts.items, plugins, tenantCtx?.tenantRole, permissions],
  );

  const headerExtra = (
    <button
      type="button"
      onClick={() => setEditOpen(true)}
      className="workbench-no-drag inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50"
    >
      <Pencil className="h-3 w-3" /> 编辑
    </button>
  );

  return (
    <>
      <WidgetShell title="快捷入口" editing={editing} onRemove={onRemove} headerExtra={headerExtra}>
        {shortcuts.isLoading ? (
          <div className="flex min-h-[120px] items-center justify-center text-xs text-slate-400">加载中…</div>
        ) : items.length === 0 ? (
          <div className="flex min-h-[120px] flex-col items-center justify-center gap-1 text-center text-xs text-slate-400">
            <p>暂无可用快捷入口</p>
            <p className="text-[10px]">点击右上角「编辑」添加入口</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {items.map(item => {
              const Icon = ICON_MAP[item.icon];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateWorkbenchShortcut(navigate, item)}
                  className="workbench-no-drag flex flex-col items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3 transition hover:border-indigo-200 hover:bg-indigo-50/50"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-center text-[11px] font-bold leading-tight text-slate-700">{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </WidgetShell>

      <ShortcutsEditModal
        open={editOpen}
        selectedIds={shortcuts.selectedIds}
        isSaving={shortcuts.isSaving}
        onClose={() => setEditOpen(false)}
        onSave={ids => {
          shortcuts.save(ids, {
            onSuccess: () => setEditOpen(false),
          });
        }}
      />
    </>
  );
};

export default ShortcutsWidget;
