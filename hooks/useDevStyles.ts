import { useCallback, useEffect, useState } from 'react';
import * as api from '../services/api';
import type { DevBomDto, DevStyleDto } from '../types';
import { toast } from 'sonner';

export function useDevStyles() {
  const [styles, setStyles] = useState<DevStyleDto[]>([]);
  const [devBoms, setDevBoms] = useState<DevBomDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{ categoryId?: string; search?: string; status?: string }>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, boms] = await Promise.all([
        api.devStyles.list(filter),
        api.devBoms.list(),
      ]);
      setStyles(list);
      setDevBoms(boms as DevBomDto[]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '加载款式失败');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveStyle = useCallback(async (
    style: DevStyleDto,
    isNew: boolean,
    opts?: { templateStageNames?: string[] },
  ) => {
    const saved = isNew
      ? await api.devStyles.create({
          ...style,
          variants: style.variants,
          templateStageNames: opts?.templateStageNames,
        })
      : await api.devStyles.update(style.id, { ...style, variants: style.variants });
    await refresh();
    return saved;
  }, [refresh]);

  const removeStyle = useCallback(async (id: string) => {
    await api.devStyles.delete(id);
    await refresh();
  }, [refresh]);

  const publishStyle = useCallback(async (id: string) => {
    const result = await api.devStyles.publish(id);
    await refresh();
    return result;
  }, [refresh]);

  const saveDevBom = useCallback(async (bom: DevBomDto, exists: boolean) => {
    const saved = exists
      ? await api.devBoms.update(bom.id, bom)
      : await api.devBoms.create(bom);
    await refresh();
    return saved as DevBomDto;
  }, [refresh]);

  const deleteDevBom = useCallback(async (id: string) => {
    await api.devBoms.delete(id);
    await refresh();
  }, [refresh]);

  const updateStage = useCallback(async (
    stageId: string,
    data: Parameters<typeof api.devStyles.updateStage>[1],
  ) => {
    const saved = await api.devStyles.updateStage(stageId, data);
    await refresh();
    return saved;
  }, [refresh]);

  const addSample = useCallback(async (styleId: string, data: { name?: string; stageNames?: string[] }) => {
    const saved = await api.devStyles.addSample(styleId, data);
    await refresh();
    return saved;
  }, [refresh]);

  const removeSample = useCallback(async (sampleId: string) => {
    await api.devStyles.deleteSample(sampleId);
    await refresh();
  }, [refresh]);

  return {
    styles,
    devBoms,
    loading,
    filter,
    setFilter,
    refresh,
    saveStyle,
    removeStyle,
    publishStyle,
    saveDevBom,
    deleteDevBom,
    updateStage,
    addSample,
    removeSample,
  };
}
