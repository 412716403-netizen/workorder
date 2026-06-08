import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import WorkbenchTabBar from './WorkbenchTabBar';
import WorkbenchGrid from './WorkbenchGrid';
import AddWidgetModal from './AddWidgetModal';
import AddPageModal from './AddPageModal';
import ShortcutsWidget from './widgets/ShortcutsWidget';
import PluginCenterWidget from './widgets/PluginCenterWidget';
import MessageCenterWidget from './widgets/MessageCenterWidget';
import ProductionStatsWidget from './widgets/ProductionStatsWidget';
import SalesStatsWidget from './widgets/SalesStatsWidget';
import FinanceStatsWidget from './widgets/FinanceStatsWidget';
import { useWorkbenchConfig } from '../../hooks/useWorkbenchConfig';
import { isWorkbenchHomePage } from '../../types';
import type { WorkbenchLayoutItem, WorkbenchWidgetType } from '../../types';
import { useConfirm } from '../../contexts/ConfirmContext';

const WorkbenchView: React.FC = () => {
  const wb = useWorkbenchConfig();
  const location = useLocation();
  const confirm = useConfirm();
  const [widgetModalOpen, setWidgetModalOpen] = useState(false);
  const [pageModalOpen, setPageModalOpen] = useState(false);

  useEffect(() => {
    const state = location.state as { workbenchHome?: number } | null;
    if (location.pathname === '/workbench' && state?.workbenchHome) {
      wb.focusHomePage();
    }
  }, [location.pathname, location.state, wb.focusHomePage]);

  const activePageId = wb.config?.activePageId ?? '';
  const activePage = wb.activePage;

  const existingTypesOnPage = useMemo(
    () => (activePage?.layout.items.map(it => it.widgetType) ?? []) as WorkbenchWidgetType[],
    [activePage],
  );

  const renderWidget = useCallback(
    (item: WorkbenchLayoutItem) => {
      const props = {
        editing: wb.editing,
        onRemove: wb.editing && activePage
          ? () => wb.removeWidget(activePage.id, item.i)
          : undefined,
      };
      switch (item.widgetType) {
        case 'shortcuts':
          return <ShortcutsWidget {...props} />;
        case 'plugin_center':
          return <PluginCenterWidget {...props} />;
        case 'messages':
          return <MessageCenterWidget {...props} />;
        case 'production_stats':
          return <ProductionStatsWidget {...props} />;
        case 'sales_stats':
          return <SalesStatsWidget {...props} />;
        case 'finance_stats':
          return <FinanceStatsWidget {...props} />;
        default:
          return null;
      }
    },
    [wb.editing, wb.removeWidget, activePage],
  );

  const handleDeletePage = async (pageId: string) => {
    if (isWorkbenchHomePage(pageId)) {
      toast.error('首页不可删除');
      return;
    }
    if ((wb.sortedPages.length ?? 0) <= 1) {
      toast.error('至少保留一个页面');
      return;
    }
    const ok = await confirm({ title: '删除页面', message: '确定删除此页面及其全部组件？' });
    if (ok) wb.deletePage(pageId);
  };

  if (wb.isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  if (!wb.config || !activePage) {
    return (
      <div className="py-12 text-center">
        <p className="text-slate-500">工作台加载失败</p>
        {wb.error && <p className="mt-2 text-xs text-slate-400">{wb.error}</p>}
        <button
          type="button"
          onClick={() => void wb.refetch()}
          className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0">
      {wb.isFallback && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          无法从服务器加载布局，当前显示内置默认。请刷新或联系管理员检查数据库迁移。
          <button type="button" onClick={() => void wb.refetch()} className="ml-2 font-bold underline">
            重试
          </button>
        </div>
      )}
      <WorkbenchTabBar
        pages={wb.sortedPages}
        activePageId={activePageId}
        editing={wb.editing}
        onSelect={wb.setActivePageId}
        onAddPage={() => setPageModalOpen(true)}
        onRename={wb.renamePage}
        onDelete={handleDeletePage}
        onReorder={wb.reorderPages}
        toolbar={
          !wb.editing ? (
            <button
              type="button"
              onClick={wb.startEdit}
              className="flex items-center gap-1 rounded-xl border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50"
            >
              <Pencil className="h-4 w-4" /> 自定义布局
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setWidgetModalOpen(true)}
                className="flex items-center gap-1 rounded-xl border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50"
              >
                <Plus className="h-4 w-4" /> 添加组件
              </button>
              <button
                type="button"
                onClick={wb.cancelEdit}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={wb.isSaving}
                onClick={wb.save}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                保存
              </button>
            </>
          )
        }
      />

      <WorkbenchGrid
        key={activePage.id}
        items={activePage.layout.items}
        editing={wb.editing}
        renderWidget={renderWidget}
        onLayoutChange={items => wb.updatePageLayout(activePage.id, items)}
      />

      <AddWidgetModal
        open={widgetModalOpen}
        onClose={() => setWidgetModalOpen(false)}
        existingTypes={existingTypesOnPage}
        onAdd={type => wb.addWidget(activePage.id, type)}
      />

      <AddPageModal
        open={pageModalOpen}
        onClose={() => setPageModalOpen(false)}
        onConfirm={title => wb.addPage(title)}
      />
    </div>
  );
};

export default WorkbenchView;
