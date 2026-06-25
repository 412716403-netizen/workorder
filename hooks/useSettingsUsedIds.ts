import { useEffect, useState } from 'react';

/**
 * 拉取「系统设置」某类资源被业务数据引用的 id 集合，供前端置灰删除按钮。
 * 仅在挂载时请求一次（设置页切换 tab 会重新挂载）；失败时静默回退为空集合，
 * 真正的删除拦截以后端 409 为准。
 */
export function useSettingsUsedIds(
  fetcher: () => Promise<{ usedIds: string[] }>,
): Set<string> {
  const [usedIds, setUsedIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    let alive = true;
    fetcher()
      .then((res) => {
        if (alive) setUsedIds(new Set(res?.usedIds ?? []));
      })
      .catch(() => {
        /* 静默：拿不到用量时不阻塞 UI，删除仍由后端 409 兜底 */
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return usedIds;
}
