import { useCallback, useRef, useState } from 'react';

/**
 * 防止表单「保存 / 确认添加」被连点触发多次请求。
 * useState 的 disabled 可能晚于第二次点击，故用 ref 同步占位。
 */
export function useAsyncSubmitLock() {
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  return { run, busy };
}
