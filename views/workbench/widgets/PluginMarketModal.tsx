import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronRight, CheckCircle2, LayoutGrid } from 'lucide-react';
import {
  FEATURE_PLUGIN_CATEGORY_TABS,
  FEATURE_PLUGIN_MARKET_CATALOG,
  isFeaturePluginActivated,
  type FeaturePluginCategoryId,
  type FeaturePluginMarketItem,
} from '../../../types';
import type { FeaturePluginsConfig } from '../../../types';
import PluginDetailModal from './PluginDetailModal';
import { PluginIcon, formatPluginLaunchLabel, PLUGIN_ICON_THEME } from './pluginWidgetShared';

interface PluginMarketModalProps {
  open: boolean;
  plugins: FeaturePluginsConfig;
  canEdit: boolean;
  isUpdating?: boolean;
  onClose: () => void;
  onToggle?: (id: string, enabled: boolean) => void;
}

const PluginMarketModal: React.FC<PluginMarketModalProps> = ({
  open,
  plugins,
  canEdit,
  isUpdating,
  onClose,
  onToggle,
}) => {
  const [category, setCategory] = useState<FeaturePluginCategoryId | 'all'>('all');
  const [detailPlugin, setDetailPlugin] = useState<FeaturePluginMarketItem | null>(null);

  const filtered = useMemo(() => {
    if (category === 'all') return FEATURE_PLUGIN_MARKET_CATALOG;
    return FEATURE_PLUGIN_MARKET_CATALOG.filter(p => p.category === category);
  }, [category]);

  const enabledCount = useMemo(
    () => FEATURE_PLUGIN_MARKET_CATALOG.filter(p => isFeaturePluginActivated(p, plugins)).length,
    [plugins],
  );

  if (!open) return null;

  const renderCard = (plugin: FeaturePluginMarketItem) => {
    const activated = isFeaturePluginActivated(plugin, plugins);
    const theme = PLUGIN_ICON_THEME[plugin.icon];
    return (
      <button
        key={plugin.id}
        type="button"
        onClick={() => setDetailPlugin(plugin)}
        className="group flex flex-col rounded-xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg"
      >
        <div className="flex items-start justify-between gap-2">
          <PluginIcon icon={plugin.icon} size="lg" />
          {activated && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
              <CheckCircle2 className="h-3 w-3" /> 已开通
            </span>
          )}
        </div>
        <div className="mt-3 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-black text-slate-900">{plugin.label}</span>
            {plugin.tags.slice(0, 2).map(tag => (
              <span
                key={tag}
                className={`rounded-md px-1.5 py-0.5 font-medium text-slate-500 ${theme.soft} text-[9px]`}
              >
                {tag}
              </span>
            ))}
          </div>
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
            {plugin.tagline}
          </p>
          <p className="mt-1 text-[10px] text-slate-300">
            {formatPluginLaunchLabel(plugin.launchedAt)} 上线
          </p>
        </div>
        <span className="mt-3 inline-flex items-center gap-0.5 text-xs font-bold text-indigo-600 transition-all group-hover:gap-1.5">
          了解详情 <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </button>
    );
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
        role="presentation"
        onClick={onClose}
      >
        <div
          className="flex min-h-[82vh] max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/80"
          role="dialog"
          aria-modal="true"
          aria-labelledby="plugin-market-title"
          onClick={e => e.stopPropagation()}
        >
          {/* 顶栏 */}
          <div className="shrink-0 bg-gradient-to-r from-slate-50 to-indigo-50/40 px-5 pb-0 pt-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md">
                    <LayoutGrid className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 id="plugin-market-title" className="text-lg font-black text-slate-900">
                      插件市场
                    </h2>
                    <p className="text-xs text-slate-500">
                      共 {FEATURE_PLUGIN_MARKET_CATALOG.length} 个插件 · 已开通 {enabledCount} 个
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-slate-400 shadow-sm hover:bg-slate-50 hover:text-slate-600"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 分类胶囊 */}
            <div className="mt-4 flex gap-2 overflow-x-auto pb-4">
              {FEATURE_PLUGIN_CATEGORY_TABS.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategory(tab.id)}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition ${
                    category === tab.id
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-indigo-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* 内容区 */}
          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/80 px-5 py-4">
            {category !== 'all' && (
              <h3 className="mb-2.5 text-xs font-bold text-slate-700">
                {FEATURE_PLUGIN_CATEGORY_TABS.find(t => t.id === category)?.label}
              </h3>
            )}
            {filtered.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-400">该分类暂无插件</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map(plugin => renderCard(plugin))}
              </div>
            )}
          </div>
        </div>
      </div>

      <PluginDetailModal
        open={detailPlugin != null}
        plugin={detailPlugin}
        plugins={plugins}
        canEdit={canEdit}
        isUpdating={isUpdating}
        onClose={() => setDetailPlugin(null)}
        onToggle={onToggle}
      />
    </>,
    document.body,
  );
};

export default PluginMarketModal;
