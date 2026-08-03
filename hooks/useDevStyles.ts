import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';
import type { DevBomDto, DevStyleDto } from '../types';
import { toast } from 'sonner';
import { DEV_MATERIAL_QK_BASE, devMaterialQueryKey } from './useDevMaterials';

/** 用详情结果更新侧栏列表项，但不把原图/字段 data URL 塞进列表态 */
function mergeStyleListItem(full: DevStyleDto, prev?: DevStyleDto): DevStyleDto {
  return {
    ...full,
    imageUrl: prev?.imageUrl,
    imageThumb: full.imageThumb ?? prev?.imageThumb,
    samples: full.samples.map((sample) => ({
      ...sample,
      stages: sample.stages.map((stage) => ({
        ...stage,
        fields: stage.fields.map((f) => ({
          id: f.id,
          label: f.label,
          type: f.type,
          value: '',
        })),
        attachments: stage.attachments.map((a) => ({
          id: a.id,
          fileName: a.fileName,
          fileType: a.fileType,
          fileUrl: '',
        })),
      })),
    })),
  };
}

export function useDevStyles() {
  const queryClient = useQueryClient();
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

  /** 用写接口返回的完整详情更新本地态（选中详情 + 侧栏列表 patch），避免再 list+GET */
  const applySavedStyle = useCallback((saved: DevStyleDto) => {
    setSelectedDetail((prev) => (prev == null || prev.id === saved.id ? saved : prev));
    setStyles((prev) => {
      const idx = prev.findIndex((s) => s.id === saved.id);
      if (idx < 0) return [mergeStyleListItem(saved), ...prev];
      const next = [...prev];
      next[idx] = mergeStyleListItem(saved, prev[idx]);
      return next;
    });
  }, []);

  const saveStyle = useCallback(async (
    style: DevStyleDto,
    isNew: boolean,
    opts?: { templateStageNames?: string[] },
  ) => {
    // 详情态含 samples（节点字段/附件 data URL）与服务端生成的 imageThumb，保存时剥离；
    // 主图未变时省略 imageUrl（后端未收到该键即保持原值），避免大 data URL 反复 PUT
    const { samples: _samples, imageThumb: _thumb, ...payload } = style as DevStyleDto & {
      imageUrl?: string;
    };
    if (
      !isNew
      && selectedDetail?.id === style.id
      && (style.imageUrl ?? '').trim() === (selectedDetail.imageUrl ?? '').trim()
    ) {
      delete payload.imageUrl;
    }
    const saved = isNew
      ? await api.devStyles.create({
          ...payload,
          variants: style.variants,
          templateStageNames: opts?.templateStageNames,
        })
      : await api.devStyles.update(style.id, { ...payload, variants: style.variants });
    applySavedStyle(saved);
    return saved;
  }, [selectedDetail, applySavedStyle]);

  const removeStyle = useCallback(async (id: string) => {
    await api.devStyles.delete(id);
    if (selectedDetail?.id === id) setSelectedDetail(null);
    await refresh();
  }, [refresh, selectedDetail?.id]);

  const publishStyle = useCallback(async (id: string) => {
    const result = await api.devStyles.publish(id);
    applySavedStyle(result.style);
    return result;
  }, [applySavedStyle]);

  const invalidateDevMaterials = useCallback((styleId?: string | null) => {
    if (styleId) {
      void queryClient.invalidateQueries({ queryKey: devMaterialQueryKey(styleId) });
    } else {
      void queryClient.invalidateQueries({ queryKey: DEV_MATERIAL_QK_BASE });
    }
  }, [queryClient]);

  const saveDevBom = useCallback(async (
    bom: DevBomDto,
    exists: boolean,
    opts?: { skipDetailRefresh?: boolean },
  ) => {
    const saved = (exists
      ? await api.devBoms.update(bom.id, bom)
      : await api.devBoms.create(bom)) as DevBomDto;
    setDevBoms((prev) => {
      const idx = prev.findIndex((b) => b.id === saved.id);
      if (idx < 0) return [...prev, saved];
      const next = [...prev];
      next[idx] = saved;
      return next;
    });
    // 变体款随后会 syncVariantNodeBoms（已返回全量详情）；单 SKU 仍需补一次详情
    if (!opts?.skipDetailRefresh) {
      await refreshSelectedDetail(bom.parentStyleId);
    }
    // 领料物料列表后台刷新，不阻塞保存 toast
    invalidateDevMaterials(bom.parentStyleId);
    return saved;
  }, [refreshSelectedDetail, invalidateDevMaterials]);

  const syncVariantNodeBoms = useCallback(async (
    styleId: string,
    variantId: string,
    nodeBoms: Record<string, string>,
  ) => {
    const saved = await api.devStyles.syncVariantNodeBoms(styleId, variantId, nodeBoms);
    applySavedStyle(saved);
    return saved;
  }, [applySavedStyle]);

  const deleteDevBom = useCallback(async (id: string) => {
    const target = devBoms.find((b) => b.id === id);
    await api.devBoms.delete(id);
    setDevBoms((prev) => prev.filter((b) => b.id !== id));
    await refreshSelectedDetail(target?.parentStyleId);
    invalidateDevMaterials(target?.parentStyleId);
  }, [devBoms, refreshSelectedDetail, invalidateDevMaterials]);

  const updateStage = useCallback(async (
    stageId: string,
    data: Parameters<typeof api.devStyles.updateStage>[1],
  ) => {
    // PUT 已返回完整详情：直接落选中态，并轻量 patch 侧栏列表（勿再 list + BOM + GET）
    const saved = await api.devStyles.updateStage(stageId, data);
    applySavedStyle(saved);
    return saved;
  }, [applySavedStyle]);

  const addSample = useCallback(async (
    styleId: string,
    data: { name?: string; stageNames?: string[]; colorId?: string; sizeId?: string },
  ) => {
    const saved = await api.devStyles.addSample(styleId, data);
    applySavedStyle(saved);
    return saved;
  }, [applySavedStyle]);

  const removeSample = useCallback(async (sampleId: string) => {
    const saved = await api.devStyles.deleteSample(sampleId);
    applySavedStyle(saved);
    return saved;
  }, [applySavedStyle]);

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
    syncVariantNodeBoms,
    deleteDevBom,
    updateStage,
    addSample,
    removeSample,
  };
}
