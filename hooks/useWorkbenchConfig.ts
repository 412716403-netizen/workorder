import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dashboard } from '../services/api/dashboard';
import { dashboardQueryKey } from './dashboardQueryKeys';
import { useAuth } from '../contexts/AuthContext';
import {
  normalizeWorkbenchConfig,
  WORKBENCH_HOME_PAGE_ID,
  isWorkbenchHomePage,
  isHomePinnedWidgetType,
  mergeWorkbenchHomePinnedItems,
  canEditWorkbenchPage,
  hasWorkbenchPageFullAccess,
  hasWorkbenchNavAccess,
  type WorkbenchConfig,
  type WorkbenchLayoutItem,
  type WorkbenchPage,
  type WorkbenchWidgetType,
  WORKBENCH_WIDGET_CATALOG,
} from '../types';

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

/** 工作台相关权限摘要，纳入 queryKey 以便角色变更后重新拉取 */
function workbenchPermKey(permissions: string[]): string {
  return permissions
    .filter(p => p === 'workbench' || p.startsWith('workbench:'))
    .sort()
    .join('|');
}

export function useWorkbenchConfig() {
  const qc = useQueryClient();
  const { tenantCtx, userId } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  const tenantRole = tenantCtx?.tenantRole;
  const permissions = useMemo(() => tenantCtx?.permissions ?? [], [tenantCtx?.permissions]);
  /** 本地预判：用于决定是否发起请求；最终以服务端 canAccess 为准 */
  const localNavAllowed = hasWorkbenchNavAccess(permissions, tenantRole);
  const permKey = useMemo(() => workbenchPermKey(permissions), [permissions]);
  const workbenchKey = useMemo(
    () => dashboardQueryKey(tenantId, 'workbench', permKey),
    [tenantId, permKey],
  );

  const query = useQuery({
    queryKey: workbenchKey,
    // 始终请求：避免 localStorage 残留 workbench 权限时误显示，或本地漏判导致不拉数
    queryFn: () => dashboard.getWorkbench(),
    staleTime: 0,
    enabled: !!tenantId,
  });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<WorkbenchConfig | null>(null);
  /** 当前 Tab 仅会话内有效；刷新后回到首个可见页 */
  const [sessionActivePageId, setSessionActivePageId] = useState(WORKBENCH_HOME_PAGE_ID);

  useEffect(() => {
    setEditing(false);
    setDraft(null);
    setSessionActivePageId(WORKBENCH_HOME_PAGE_ID);
  }, [tenantId, permKey]);

  /** 页面可见性与入口权限均以服务端为准 */
  const serverCanAccess = query.data?.canAccess;
  const navAllowed = serverCanAccess ?? localNavAllowed;
  const effective =
    navAllowed && query.data?.effective && Array.isArray(query.data.effective.pages)
      ? query.data.effective
      : navAllowed
        ? null
        : { version: 1 as const, activePageId: '', pages: [] };

  const loadError = query.error instanceof Error ? query.error.message : query.isError ? '加载失败' : null;

  useEffect(() => {
    if (!editing) {
      if (effective && effective.pages.length > 0) {
        const firstId = effective.pages[0]?.id ?? WORKBENCH_HOME_PAGE_ID;
        setDraft(normalizeWorkbenchConfig({ ...effective, activePageId: firstId }, false));
      } else if (!query.isLoading) {
        setDraft(null);
      }
    }
  }, [effective, editing, query.isLoading]);

  const layoutConfig = draft ?? effective ?? null;

  const config = useMemo(() => {
    if (!layoutConfig) return null;
    const normalized = normalizeWorkbenchConfig(layoutConfig, false);
    const pageIds = new Set(normalized.pages.map(p => p.id));
    const fallbackId = normalized.pages[0]?.id ?? WORKBENCH_HOME_PAGE_ID;
    const activePageId = pageIds.has(sessionActivePageId) ? sessionActivePageId : fallbackId;
    return { ...normalized, activePageId };
  }, [layoutConfig, sessionActivePageId]);

  const saveMutation = useMutation({
    mutationFn: (config: WorkbenchConfig) => dashboard.saveWorkbench(config),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dashboard', tenantId, 'workbench'] });
      toast.success('工作台布局已保存');
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message || '保存失败'),
  });

  const activePage = useMemo(() => {
    if (!config) return null;
    return config.pages.find(p => p.id === config.activePageId) ?? config.pages[0] ?? null;
  }, [config]);

  const sortedPages = useMemo(() => {
    if (!config) return [];
    return [...config.pages].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [config]);

  const startEdit = useCallback(() => {
    if (layoutConfig && layoutConfig.pages.length > 0) {
      const firstId = layoutConfig.pages[0]?.id ?? WORKBENCH_HOME_PAGE_ID;
      setDraft(normalizeWorkbenchConfig({ ...layoutConfig, activePageId: firstId }, false));
    }
    setEditing(true);
  }, [layoutConfig]);

  const cancelEdit = useCallback(() => {
    if (effective && effective.pages.length > 0) {
      const firstId = effective.pages[0]?.id ?? WORKBENCH_HOME_PAGE_ID;
      setDraft(normalizeWorkbenchConfig({ ...effective, activePageId: firstId }, false));
    } else {
      setDraft(null);
    }
    setEditing(false);
  }, [effective]);

  const save = useCallback(() => {
    if (!draft) return;
    const firstId = draft.pages[0]?.id ?? WORKBENCH_HOME_PAGE_ID;
    saveMutation.mutate(
      normalizeWorkbenchConfig({ ...draft, activePageId: firstId }, false),
    );
  }, [draft, saveMutation]);

  const setActivePageId = useCallback((pageId: string) => {
    setSessionActivePageId(pageId);
  }, []);

  const focusHomePage = useCallback(() => {
    if (effective?.pages.some(p => isWorkbenchHomePage(p.id))) {
      setSessionActivePageId(WORKBENCH_HOME_PAGE_ID);
      return;
    }
    setSessionActivePageId(effective?.pages[0]?.id ?? WORKBENCH_HOME_PAGE_ID);
  }, [effective]);

  const addPage = useCallback((title: string) => {
    const page: WorkbenchPage = {
      id: newId('page'),
      title: title.trim() || '新页面',
      sortOrder: 0,
      layout: { version: 1, items: [] },
      createdByUserId: userId || null,
    };
    setDraft(prev => {
      if (!prev) return prev;
      const maxOrder = prev.pages.reduce((m, p) => Math.max(m, p.sortOrder), -1);
      return {
        ...prev,
        pages: [...prev.pages, { ...page, sortOrder: maxOrder + 1 }],
      };
    });
    setSessionActivePageId(page.id);
  }, [userId]);

  const renamePage = useCallback((pageId: string, title: string) => {
    if (isWorkbenchHomePage(pageId)) return;
    setDraft(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        pages: prev.pages.map(p => (p.id === pageId ? { ...p, title: title.trim() || p.title } : p)),
      };
    });
  }, []);

  const deletePage = useCallback((pageId: string) => {
    if (isWorkbenchHomePage(pageId)) return;
    setDraft(prev => {
      if (!prev || prev.pages.length <= 1) return prev;
      return { ...prev, pages: prev.pages.filter(p => p.id !== pageId) };
    });
    setSessionActivePageId(prev => {
      if (prev !== pageId) return prev;
      const remaining = draft?.pages.filter(p => p.id !== pageId) ?? [];
      return remaining[0]?.id ?? WORKBENCH_HOME_PAGE_ID;
    });
  }, [draft]);

  const reorderPages = useCallback((orderedIds: string[]) => {
    setDraft(prev => {
      if (!prev) return prev;
      const map = new Map(prev.pages.map(p => [p.id, p]));
      const home = map.get(WORKBENCH_HOME_PAGE_ID);
      const movableIds = orderedIds.filter(id => !isWorkbenchHomePage(id));
      const pages = [
        ...(home ? [{ ...home, sortOrder: 0, title: '首页' }] : []),
        ...movableIds
          .map((id, idx) => {
            const p = map.get(id);
            return p ? { ...p, sortOrder: idx + 1 } : null;
          })
          .filter((p): p is WorkbenchPage => p != null),
      ];
      return normalizeWorkbenchConfig({ ...prev, pages }, false);
    });
  }, []);

  const updatePageLayout = useCallback((pageId: string, items: WorkbenchLayoutItem[]) => {
    setDraft(prev => {
      if (!prev) return prev;
      const nextItems = isWorkbenchHomePage(pageId)
        ? mergeWorkbenchHomePinnedItems(items)
        : items;
      return {
        ...prev,
        pages: prev.pages.map(p =>
          p.id === pageId ? { ...p, layout: { version: 1, items: nextItems } } : p,
        ),
      };
    });
  }, []);

  const addWidget = useCallback((pageId: string, widgetType: WorkbenchWidgetType) => {
    const def = WORKBENCH_WIDGET_CATALOG.find(w => w.type === widgetType);
    if (!def) return;
    setDraft(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        pages: prev.pages.map(p => {
          if (p.id !== pageId) return p;
          const maxY = p.layout.items.reduce((m, it) => Math.max(m, it.y + it.h), 0);
          const item: WorkbenchLayoutItem = {
            i: newId('w'),
            widgetType,
            x: 0,
            y: maxY,
            w: def.defaultW,
            h: def.defaultH,
            minW: def.minW,
            minH: def.minH,
          };
          return { ...p, layout: { version: 1, items: [...p.layout.items, item] } };
        }),
      };
    });
  }, []);

  const removeWidget = useCallback((pageId: string, itemId: string) => {
    setDraft(prev => {
      if (!prev) return prev;
      if (isWorkbenchHomePage(pageId)) {
        const target = prev.pages
          .find(p => p.id === pageId)
          ?.layout.items.find(it => it.i === itemId);
        if (target && isHomePinnedWidgetType(target.widgetType)) return prev;
      }
      return {
        ...prev,
        pages: prev.pages.map(p =>
          p.id === pageId
            ? { ...p, layout: { version: 1, items: p.layout.items.filter(it => it.i !== itemId) } }
            : p,
        ),
      };
    });
  }, []);

  const canCreatePages = tenantRole === 'owner';
  const canEditPage = useCallback(
    (page: WorkbenchPage) => canEditWorkbenchPage(page, { userId, permissions, tenantRole }),
    [userId, permissions, tenantRole],
  );
  const hasFullAccess = useCallback(
    (page: WorkbenchPage) => hasWorkbenchPageFullAccess(page, { userId, permissions, tenantRole }),
    [userId, permissions, tenantRole],
  );

  return {
    isLoading: query.isLoading,
    error: loadError,
    isFallback: false,
    navAllowed,
    canEditPage,
    hasFullAccess,
    canCreatePages,
    refetch: query.refetch,
    config,
    activePage,
    sortedPages,
    editing,
    startEdit,
    cancelEdit,
    save,
    focusHomePage,
    isSaving: saveMutation.isPending,
    setActivePageId,
    addPage,
    renamePage,
    deletePage,
    reorderPages,
    updatePageLayout,
    addWidget,
    removeWidget,
  };
}
