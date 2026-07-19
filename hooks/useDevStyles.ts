import { useCallback, useEffect, useState } from 'react';
import * as api from '../services/api';
import type { DevBomDto, DevStyleDto } from '../types';
import { toast } from 'sonner';

export function useDevStyles() {
  const [styles, setStyles] = useState<DevStyleDto[]>([]);
  const [devBoms, setDevBoms] = useState<DevBomDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{ categoryId?: string; search?: string; status?: string }>({});
  /** 当前选中款详情（含原图与节点附件二进制）；列表项不含这些大字段 */
  const [selectedDetail, setSelectedDetail] = useState<DevStyleDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  const loadStyleDetail = useCallback(async (id: string | null) => {
    if (!id) {
      setSelectedDetail(null);
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    try {
      const full = await api.devStyles.get(id);
      setSelectedDetail(full);
    } catch (e: unknown) {
      setSelectedDetail(null);
      toast.error(e instanceof Error ? e.message : '加载款式详情失败');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const refreshSelectedDetail = useCallback(async (id?: string | null) => {
    const targetId = id ?? selectedDetail?.id ?? null;
    if (!targetId) return;
    try {
      const full = await api.devStyles.get(targetId);
      setSelectedDetail(full);
    } catch {
      /* 列表 refresh 已提示时此处静默 */
    }
  }, [selectedDetail?.id]);

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
    await refreshSelectedDetail(saved.id);
    return saved;
  }, [refresh, refreshSelectedDetail]);

  const removeStyle = useCallback(async (id: string) => {
    await api.devStyles.delete(id);
    if (selectedDetail?.id === id) setSelectedDetail(null);
    await refresh();
  }, [refresh, selectedDetail?.id]);

  const publishStyle = useCallback(async (id: string) => {
    const result = await api.devStyles.publish(id);
    await refresh();
    await refreshSelectedDetail(id);
    return result;
  }, [refresh, refreshSelectedDetail]);

  const saveDevBom = useCallback(async (bom: DevBomDto, exists: boolean) => {
    const saved = exists
      ? await api.devBoms.update(bom.id, bom)
      : await api.devBoms.create(bom);
    await refresh();
    await refreshSelectedDetail(bom.parentStyleId);
    return saved as DevBomDto;
  }, [refresh, refreshSelectedDetail]);

  const deleteDevBom = useCallback(async (id: string) => {
    await api.devBoms.delete(id);
    await refresh();
    await refreshSelectedDetail();
  }, [refresh, refreshSelectedDetail]);

  const updateStage = useCallback(async (
    stageId: string,
    data: Parameters<typeof api.devStyles.updateStage>[1],
  ) => {
    const saved = await api.devStyles.updateStage(stageId, data);
    await refresh();
    await refreshSelectedDetail(saved.id);
    return saved;
  }, [refresh, refreshSelectedDetail]);

  const addSample = useCallback(async (
    styleId: string,
    data: { name?: string; stageNames?: string[]; colorId?: string; sizeId?: string },
  ) => {
    const saved = await api.devStyles.addSample(styleId, data);
    await refresh();
    await refreshSelectedDetail(styleId);
    return saved;
  }, [refresh, refreshSelectedDetail]);

  const removeSample = useCallback(async (sampleId: string) => {
    const saved = await api.devStyles.deleteSample(sampleId);
    await refresh();
    await refreshSelectedDetail(saved.id);
    return saved;
  }, [refresh, refreshSelectedDetail]);

  return {
    styles,
    devBoms,
    loading,
    filter,
    setFilter,
    selectedDetail,
    detailLoading,
    loadStyleDetail,
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
