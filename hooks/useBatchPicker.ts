import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import * as api from '../services/api';
import { normalizeBatchNo } from '../types';

/**
 * 某产品在某仓库下、按批次汇总的可用库存（仅用于启用批次管理的分类）。
 * `mergeFromLocal`：与前端 PSI 快照合并（如采购刚写入上下文），按 batchNo 取 API 与本地库存的较大值。
 */
export function useWarehouseBatchOptions(
  enabled: boolean,
  productId: string | undefined,
  warehouseId: string | undefined,
  excludeProductionOpRecordId?: string,
  mergeFromLocal?: { batchNo: string; stock: number }[],
) {
  const [options, setOptions] = useState<{ batchNo: string; stock: number }[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!enabled || !productId || !warehouseId) {
      setOptions([]);
      return;
    }
    setLoading(true);
    try {
      const params: Record<string, string> = { productId, warehouseId };
      if (excludeProductionOpRecordId) params.excludeProductionOpRecordId = excludeProductionOpRecordId;
      const data = await api.psi.getStockBatches(params);
      setOptions(Array.isArray(data) ? data : []);
    } catch (e) {
      setOptions([]);
      const msg = e instanceof Error ? e.message : '加载批次列表失败';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [enabled, productId, warehouseId, excludeProductionOpRecordId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const mergedOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of options) {
      const k = normalizeBatchNo(o.batchNo);
      if (!k) continue;
      map.set(k, o.stock);
    }
    for (const m of mergeFromLocal ?? []) {
      const k = normalizeBatchNo(m.batchNo);
      if (!k) continue;
      const prev = map.get(k);
      map.set(k, Math.max(prev ?? 0, m.stock));
    }
    return [...map.entries()]
      .map(([batchNo, stock]) => ({ batchNo, stock }))
      .filter(x => x.stock > 0)
      .sort((a, b) => a.batchNo.localeCompare(b.batchNo, 'zh-CN'));
  }, [options, mergeFromLocal]);

  return { options: mergedOptions, loading, refetch };
}

/** 与后端 `normalizeBatchNo` 对齐；空则返回 `''` 以兼容既有 `if (clampBatchNoInput(...))` 判断 */
export function clampBatchNoInput(raw: string): string {
  return normalizeBatchNo(raw) ?? '';
}
