import React from 'react';
import { Download, X } from 'lucide-react';
import { usePwaInstall } from '../hooks/usePwaInstall';

/** 登录页：Chrome/Edge 可安装 PWA 时提示「安装到桌面」 */
export default function PwaInstallBanner() {
  const { canShow, install, dismiss } = usePwaInstall();

  if (!canShow) return null;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/90 px-4 py-3 text-sm text-indigo-900 shadow-sm">
      <Download className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">安装到桌面</p>
        <p className="mt-0.5 text-xs leading-relaxed text-indigo-700/90">
          可从开始菜单或 Dock 独立打开，界面随系统更新自动刷新。
        </p>
        <button
          type="button"
          onClick={() => void install()}
          className="mt-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
        >
          立即安装
        </button>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded p-1 text-indigo-400 transition-colors hover:bg-indigo-100 hover:text-indigo-600"
        aria-label="关闭安装提示"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
