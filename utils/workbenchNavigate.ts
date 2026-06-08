import type { NavigateFunction } from 'react-router-dom';
import type { WorkbenchShortcutDefinition } from '../shared/workbenchShortcuts';

/** 快捷入口跳转：模块子 Tab 走 state.tab；系统设置走 query tab */
export function navigateWorkbenchShortcut(
  navigate: NavigateFunction,
  item: WorkbenchShortcutDefinition,
): void {
  if (item.href === '/settings' && item.tab) {
    navigate(`${item.href}?tab=${encodeURIComponent(item.tab)}`);
    return;
  }
  if (item.tab) {
    navigate(item.href, { state: { tab: item.tab } });
    return;
  }
  navigate(item.href);
}
