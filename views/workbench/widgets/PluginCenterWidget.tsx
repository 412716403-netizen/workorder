import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronRight, LayoutGrid, Sparkles } from 'lucide-react';
import WidgetShell from '../WidgetShell';
import PluginMarketModal from './PluginMarketModal';
import PluginDetailModal from './PluginDetailModal';
import { PluginIcon, formatPluginLaunchLabel } from './pluginWidgetShared';
import {
  getLatestFeaturePlugins,
  isFeaturePluginActivated,
  type FeaturePluginMarketItem,
} from '../../../types';
import { useFeaturePlugins } from '../../../hooks/useFeaturePlugins';
import { useAuth } from '../../../contexts/AuthContext';
import { isTenantElevatedRole } from '../../../utils/hasModulePerm';

const LATEST_DISPLAY_COUNT = 2;

interface PluginCenterWidgetProps {
  editing?: boolean;
  onRemove?: () => void;
}

const PluginCenterWidget: React.FC<PluginCenterWidgetProps> = ({ editing, onRemove }) => {
  const { plugins, updatePlugins, isUpdating } = useFeaturePlugins();
  const { tenantCtx } = useAuth();
  const [marketOpen, setMarketOpen] = useState(false);
  const [detailPlugin, setDetailPlugin] = useState<FeaturePluginMarketItem | null>(null);

  const canEdit =
    isTenantElevatedRole(tenantCtx?.tenantRole)
    || (tenantCtx?.permissions ?? []).some(p => p === 'settings' || p.startsWith('settings:'));

  const latestPlugins = useMemo(() => getLatestFeaturePlugins(LATEST_DISPLAY_COUNT), []);

  const toggle = async (id: string, enabled: boolean) => {
    if (!canEdit) {
      toast.error('仅管理员可修改功能插件');
      return;
    }
    try {
      await updatePlugins({ ...plugins, [id]: enabled });
      toast.success(enabled ? '插件已开通' : '插件已关闭');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '更新失败');
    }
  };

  const headerExtra = (
    <button
      type="button"
      onClick={() => setMarketOpen(true)}
      className="workbench-no-drag inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50"
    >
      <LayoutGrid className="h-3 w-3" /> 浏览插件市场
    </button>
  );

  return (
    <>
      <WidgetShell
        title="插件中心"
        editing={editing}
        onRemove={onRemove}
        headerExtra={headerExtra}
        className="!overflow-visible"
      >
        <div className="flex h-full min-h-0 flex-col gap-3">
          {/* 最新上线 */}
          <div className="min-h-0 flex-1">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs font-bold text-slate-700">最新上线</span>
              </div>
              <span className="text-[10px] text-slate-400">按上线时间</span>
            </div>
            <ul className="space-y-2">
              {latestPlugins.map((plugin, idx) => {
                const activated = isFeaturePluginActivated(plugin, plugins);
                return (
                  <li key={plugin.id}>
                    <button
                      type="button"
                      onClick={() => setDetailPlugin(plugin)}
                      className="workbench-no-drag group flex w-full items-center gap-3 rounded-xl border border-slate-100 bg-white px-2.5 py-2.5 text-left shadow-sm transition hover:border-indigo-200 hover:shadow-md"
                    >
                      <PluginIcon icon={plugin.icon} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-bold text-slate-800">{plugin.label}</span>
                          {idx === 0 && (
                            <span className="shrink-0 rounded-md bg-gradient-to-r from-rose-500 to-orange-400 px-1.5 py-0.5 text-[9px] font-bold text-white">
                              NEW
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400">
                          <span>{formatPluginLaunchLabel(plugin.launchedAt)} 上线</span>
                          {activated ? (
                            <span className="font-medium text-emerald-600">已开通</span>
                          ) : (
                            <span className="text-slate-300">未开通</span>
                          )}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-200 transition group-hover:translate-x-0.5 group-hover:text-indigo-400" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </WidgetShell>

      <PluginMarketModal
        open={marketOpen}
        plugins={plugins}
        canEdit={canEdit}
        isUpdating={isUpdating}
        onClose={() => setMarketOpen(false)}
        onToggle={toggle}
      />

      <PluginDetailModal
        open={detailPlugin != null && !marketOpen}
        plugin={detailPlugin}
        plugins={plugins}
        canEdit={canEdit}
        isUpdating={isUpdating}
        onClose={() => setDetailPlugin(null)}
        onToggle={toggle}
      />
    </>
  );
};

export default PluginCenterWidget;
