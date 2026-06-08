import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, Lightbulb } from 'lucide-react';
import type { FeaturePluginMarketItem } from '../../../types';
import { isFeaturePluginActivated } from '../../../types';
import type { FeaturePluginsConfig } from '../../../types';
import { PluginIcon, formatPluginLaunchLabel } from './pluginWidgetShared';

type DetailTab = 'intro' | 'guide';

interface PluginDetailModalProps {
  open: boolean;
  plugin: FeaturePluginMarketItem | null;
  plugins: FeaturePluginsConfig;
  canEdit: boolean;
  isUpdating?: boolean;
  onClose: () => void;
  onToggle?: (id: string, enabled: boolean) => void;
}

const PluginDetailModal: React.FC<PluginDetailModalProps> = ({
  open,
  plugin,
  plugins,
  canEdit,
  isUpdating,
  onClose,
  onToggle,
}) => {
  const [tab, setTab] = useState<DetailTab>('intro');

  useEffect(() => {
    if (open && plugin) setTab('intro');
  }, [open, plugin?.id]);

  if (!open || !plugin) return null;

  const activated = isFeaturePluginActivated(plugin, plugins);
  const showToggle = plugin.toggleable && canEdit && onToggle;

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/45 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex min-h-[75vh] max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部摘要 */}
        <div className="relative border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:pr-10">
            <div className="flex min-w-0 gap-4">
              <PluginIcon icon={plugin.icon} size="lg" className="!h-14 !w-14 [&_svg]:!h-7 [&_svg]:!w-7" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-black text-slate-900">{plugin.label}</h2>
                  {plugin.tags.map(tag => (
                    <span
                      key={tag}
                      className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <p className="mt-1 text-sm text-slate-500">{plugin.tagline}</p>
                <p className="mt-1 text-[10px] text-slate-400">
                  {formatPluginLaunchLabel(plugin.launchedAt)} 上线
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              {activated ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> 已开通
                </span>
              ) : (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                  未开通
                </span>
              )}
              {showToggle && (
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => onToggle(plugin.id, !activated)}
                  className={`rounded-xl px-4 py-2 text-xs font-bold text-white transition disabled:opacity-60 ${
                    activated
                      ? 'bg-slate-500 hover:bg-slate-600'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {activated ? '关闭插件' : '开通插件'}
                </button>
              )}
              {plugin.toggleable && !canEdit && (
                <p className="text-[10px] text-slate-400">仅管理员可修改开关</p>
              )}
            </div>
          </div>
        </div>

        {/* Tab */}
        <div className="flex gap-6 border-b border-slate-100 px-6">
          {([
            { id: 'intro' as const, label: '功能介绍' },
            { id: 'guide' as const, label: '使用说明' },
          ]).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`border-b-2 py-3 text-sm font-bold transition ${
                tab === t.id
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 内容 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {tab === 'intro' ? (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  {plugin.label} · 功能介绍
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{plugin.introduction.summary}</p>
              </div>

              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-emerald-800">
                  <Lightbulb className="h-4 w-4" /> 快速了解
                </div>
                <ul className="space-y-1.5 text-sm text-emerald-900/80">
                  {plugin.introduction.highlights.map(h => (
                    <li key={h} className="flex gap-2">
                      <span className="text-emerald-500">·</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-800">适用场景</h4>
                <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
                  {plugin.introduction.scenarios.map(s => (
                    <li key={s} className="flex gap-2">
                      <span className="text-slate-300">—</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {plugin.usageGuide.map((section, idx) => (
                <div key={section.title}>
                  <h4 className="flex items-center gap-2 text-sm font-black text-slate-900">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">
                      {idx + 1}
                    </span>
                    {section.title}
                  </h4>
                  <p className="mt-2 pl-8 text-sm leading-relaxed text-slate-600">{section.body}</p>
                  {section.bullets && section.bullets.length > 0 && (
                    <ul className="mt-2 space-y-1 pl-8 text-sm text-slate-600">
                      {section.bullets.map(b => (
                        <li key={b} className="flex gap-2">
                          <span className="text-indigo-400">•</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default PluginDetailModal;
