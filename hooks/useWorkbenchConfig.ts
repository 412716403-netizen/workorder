import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dashboard } from '../services/api/dashboard';
import { dashboardQueryKey } from './dashboardQueryKeys';
import { useAuth } from '../contexts/AuthContext';
import {
  normalizeWorkbenchConfig,
  WORKBENCH_BUILTIN_DEFAULT,
  WORKBENCH_HOME_PAGE_ID,
  isWorkbenchHomePage,
  isHomePinnedWidgetType,
  mergeWorkbenchHomePinnedItems,
  canEditWorkbenchPage,
  hasWorkbenchPageFullAccess,
  type WorkbenchConfig,
  type WorkbenchLayoutItem,
  type WorkbenchPage,
  type WorkbenchWidgetType,
  WORKBENCH_WIDGET_CATALOG,
} from '../types';

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function useWorkbenchConfig() {
  const qc = useQueryClient();
  const { tenantCtx, userId } = useAuth();
  const tenantId = tenantCtx?.tenantId;
  const tenantRole = tenantCtx?.tenantRole;
  const permissions = useMemo(() => tenantCtx?.permissions ?? [], [tenantCtx?.permissions]);
  const workbenchKey = useMemo(() => dashboardQueryKey(tenantId, 'workbench'), [tenantId]);

  const query = useQuery({
    queryKey: workbenchKey,
    queryFn: () => dashboard.getWorkbench(),
    staleTime: 30_000,
    enabled: !!tenantId,
  });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<WorkbenchConfig | null>(null);
  /** 当前 Tab 仅会话内有效；刷新后回到首页 */
  const [sessionActivePageId, setSessionActivePageId] = useState(WORKBENCH_HOME_PAGE_ID);

  useEffect(() => {
    setEditing(false);
    setDraft(null);
    setSessionActivePageId(WORKBENCH_HOME_PAGE_ID);
  }, [tenantId]);

  const effective = query.data?.effective ?? null;
  const loadError = query.error instanceof Error ? query.error.message : query.isError ? '加载失败' : null;

  useEffect(() => {
    if (!editing) {
      if (effective) {
        // ensureHome=false：服务端按角色权限可能已隐藏首页，前端不得重新注入
        setDraft(normalizeWorkbenchConfig({ ...effective, activePageId: WORKBENCH_HOME_PAGE_ID }, false));
      } else if (query.isError && !query.isLoading) {
        setDraft(normalizeWorkbenchConfig(WORKBENCH_BUILTIN_DEFAULT));
      }
    }
  }, [effective, editing, query.isError, query.isLoading]);

  const layoutConfig =
    draft
    ?? effective
    ?? (query.isError ? normalizeWorkbenchConfig(WORKBENCH_BUILTIN_DEFAULT) : null);

  const config = useMemo(() => {
    if (!layoutConfig) return null;
    // ensureHome=false：尊重服务端的可见性裁剪（首页可能因角色权限被隐藏）
    const normalized = normalizeWorkbenchConfig(layoutConfig, false);
    const pageIds = new Set(normalized.pages.map(p => p.id));
    const fallbackId = normalized.pages[0]?.id ?? WORKBENCH_HOME_PAGE_ID;
    const activePageId = pageIds.has(sessionActivePageId) ? sessionActivePageId : fallbackId;
    return { ...normalized, activePageId };
  }, [layoutConfig, sessionActivePageId]);

  const saveMutation = useMutation({
    mutationFn: (config: WorkbenchConfig) => dashboard.saveWorkbench(config),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workbenchKey });
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
    if (layoutConfig) {
      setDraft(normalizeWorkbenchConfig({ ...layoutConfig, activePageId: WORKBENCH_HOME_PAGE_ID }));
    }
    setEditing(true);
  }, [layoutConfig]);

  const cancelEdit = useCallback(() => {
    if (effective) {
      setDraft(normalizeWorkbenchConfig({ ...effective, activePageId: WORKBENCH_HOME_PAGE_ID }));
    }
    setEditing(false);
  }, [effective]);

  const save = useCallback(() => {
    if (!draft) return;
    saveMutation.mutate(
      normalizeWorkbenchConfig({ ...draft, activePageId: WORKBENCH_HOME_PAGE_ID }),
    );
  }, [draft, saveMutation]);

  const setActivePageId = useCallback((pageId: string) => {
    setSessionActivePageId(pageId);
  }, []);

  const focusHomePage = useCallback(() => {
    setSessionActivePageId(WORKBENCH_HOME_PAGE_ID);
  }, []);

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
    setSessionActivePageId(prev =>
      prev === pageId ? WORKBENCH_HOME_PAGE_ID : prev,
    );
  }, []);

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
      return normalizeWorkbenchConfig({ ...prev, pages });
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

  // 自定义页面创建/管理权限按业务约定＝企业创建者 owner
  const canCreatePages = tenantRole === 'owner';
  const canEditPage = useCallback(
    (page: WorkbenchPage) => canEditWorkbenchPage(page, { userId, permissions }),
    [userId, permissions],
  );
  /** 页面对当前用户是否「完整授权」（完整展示内容，含金额，跳过模块/金额掩码） */
  const hasFullAccess = useCallback(
    (page: WorkbenchPage) => hasWorkbenchPageFullAccess(page, { userId, permissions, tenantRole }),
    [userId, permissions, tenantRole],
  );

  return {
    isLoading: query.isLoading,
    error: loadError,
    isFallback: query.isError && !effective,
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
