import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { LayoutGrid, Sparkles } from 'lucide-react';
import WidgetShell from '../WidgetShell';
import WorkbenchIconGrid from '../WorkbenchIconGrid';
import PluginMarketModal from './PluginMarketModal';
import PluginDetailModal from './PluginDetailModal';
import { PluginIcon } from './pluginWidgetShared';
import {
  FEATURE_PLUGIN_MARKET_CATALOG,
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
  layoutLocked?: boolean;
  onRemove?: () => void;
}

interface PluginTileProps {
  plugin: FeaturePluginMarketItem;
  activated: boolean;
  badge?: 'new';
  onSelect: (plugin: FeaturePluginMarketItem) => void;
}

const PluginTile: React.FC<PluginTileProps> = ({ plugin, activated, badge, onSelect }) => (
  <button
    type="button"
    onClick={() => onSelect(plugin)}
    className="workbench-no-drag flex flex-col items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50/80 p-3.5 transition hover:border-indigo-200 hover:bg-indigo-50/50"
  >
    <span className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm">
      <PluginIcon icon={plugin.icon} size="lg" />
      {badge === 'new' && (
        <span className="absolute -right-1 -top-1 rounded-md bg-gradient-to-r from-rose-500 to-orange-400 px-1 py-0.5 text-[8px] font-bold leading-none text-white">
          NEW
        </span>
      )}
    </span>
    <span className="text-center text-xs font-bold leading-tight text-slate-700">
      {plugin.label}
    </span>
    <span className={`text-center text-[10px] leading-tight ${activated ? 'text-emerald-600' : 'text-slate-400'}`}>
      {activated ? '已开通' : '未开通'}
    </span>
  </button>
);

const PluginCenterWidget: React.FC<PluginCenterWidgetProps> = ({ editing, layoutLocked, onRemove }) => {
  const { plugins, updatePlugins, isUpdating } = useFeaturePlugins();
  const { tenantCtx } = useAuth();
  const [marketOpen, setMarketOpen] = useState(false);
  const [detailPlugin, setDetailPlugin] = useState<FeaturePluginMarketItem | null>(null);

  const canEdit =
    isTenantElevatedRole(tenantCtx?.tenantRole)
    || (tenantCtx?.permissions ?? []).some(p => p === 'settings' || p.startsWith('settings:'));

  const latestPlugins = useMemo(() => getLatestFeaturePlugins(LATEST_DISPLAY_COUNT), []);

  const activatedPlugins = useMemo(
    () => FEATURE_PLUGIN_MARKET_CATALOG.filter(p => isFeaturePluginActivated(p, plugins)),
    [plugins],
  );

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
        layoutLocked={layoutLocked}
        onRemove={onRemove}
        headerExtra={headerExtra}
        className="!overflow-visible"
      >
        <div className="flex flex-col gap-4">
          <section>
            <div className="mb-2 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs font-bold text-slate-700">最新上线</span>
            </div>
            <WorkbenchIconGrid>
              {latestPlugins.map((plugin, idx) => (
                <PluginTile
                  key={plugin.id}
                  plugin={plugin}
                  activated={isFeaturePluginActivated(plugin, plugins)}
                  badge={idx === 0 ? 'new' : undefined}
                  onSelect={setDetailPlugin}
                />
              ))}
            </WorkbenchIconGrid>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
              <span className="text-xs font-bold text-slate-700">已开通</span>
            </div>
            {activatedPlugins.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">暂无已开通插件</p>
            ) : (
              <WorkbenchIconGrid>
                {activatedPlugins.map(plugin => (
                  <PluginTile
                    key={plugin.id}
                    plugin={plugin}
                    activated
                    onSelect={setDetailPlugin}
                  />
                ))}
              </WorkbenchIconGrid>
            )}
          </section>
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
      />
    </>
  );
};

export default PluginCenterWidget;
