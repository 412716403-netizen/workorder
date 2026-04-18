import { lazy, type ComponentType } from 'react';

const SESSION_KEY = '__st_vite_chunk_reload_once';

/**
 * 开发时 Vite 进程被结束/重启后，浏览器里旧的 dynamic import 会报
 * “Failed to fetch dynamically imported module”。在可识别为 chunk 拉取失败时
 * 自动整页刷新一次（每标签页仅一次），便于 Vite 已重新拉起后自愈。
 */
export function lazyWithReloadOnChunkError<T extends ComponentType<unknown>>(
  importer: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await importer();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const chunkFailed =
        /Failed to fetch dynamically imported module|dynamically imported module|Importing a module script failed/i.test(
          message,
        );
      if (chunkFailed && typeof sessionStorage !== 'undefined') {
        if (!sessionStorage.getItem(SESSION_KEY)) {
          sessionStorage.setItem(SESSION_KEY, '1');
          window.location.reload();
          return new Promise(() => {}) as Promise<{ default: T }>;
        }
      }
      throw e;
    }
  });
}
