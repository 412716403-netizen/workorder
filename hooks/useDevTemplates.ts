import { useCallback, useEffect, useState } from 'react';
import * as api from '../services/api';
import type { DevStageTemplateDto } from '../types';
import { toast } from 'sonner';

export function useDevTemplates(enabled = true) {
  const [templates, setTemplates] = useState<DevStageTemplateDto[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const list = await api.devTemplates.list();
      setTemplates((list as DevStageTemplateDto[]).sort((a, b) => a.order - b.order));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '加载开发节点模板失败');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createTemplate = useCallback(async (name: string) => {
    const maxOrder = templates.reduce((m, t) => Math.max(m, t.order), -1);
    const row = await api.devTemplates.create({ name, order: maxOrder + 1 }) as DevStageTemplateDto;
    await refresh();
    return row;
  }, [templates, refresh]);

  const updateTemplate = useCallback(async (id: string, data: Partial<DevStageTemplateDto>) => {
    await api.devTemplates.update(id, data);
    await refresh();
  }, [refresh]);

  const deleteTemplate = useCallback(async (id: string) => {
    await api.devTemplates.delete(id);
    await refresh();
  }, [refresh]);

  const moveTemplate = useCallback(async (id: string, dir: 'up' | 'down') => {
    const sorted = [...templates].sort(
      (a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh-CN'),
    );
    const idx = sorted.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const reordered = [...sorted];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    try {
      await Promise.all(reordered.map((t, i) => api.devTemplates.update(t.id, { order: i })));
      await refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '调整顺序失败');
      throw e;
    }
  }, [templates, refresh]);

  return {
    templates,
    loading,
    refresh,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    moveTemplate,
  };
}
