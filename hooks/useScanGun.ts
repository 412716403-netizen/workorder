import { useEffect, useRef } from 'react';

/**
 * 扫码枪监听 hook。
 *
 * 扫码枪本质是"超高速键盘"，扫一次会快速打完 token 字符后补一个 Enter。
 * 我们只在 `active=true` 且当前焦点不在普通 input/textarea 时接管。
 *
 * 判定规则：
 *   - 相邻 keydown 间隔 < FAST_INTERVAL_MS(默认 35ms) 视为"扫码枪连打"；
 *   - 收到可打印字符则进入 buffering；遇到 Enter 收尾触发 onScan；
 *   - 太慢的输入被视为人工打字，清空 buffer，不触发。
 */
export function useScanGun(params: {
  active: boolean;
  onScan: (value: string) => void;
  minLength?: number;
  /** ms；相邻 keydown 的间隔超过此值则视为人工输入 */
  fastIntervalMs?: number;
}): void {
  const { active, onScan, minLength = 6, fastIntervalMs = 35 } = params;

  const bufferRef = useRef<string>('');
  const lastTimeRef = useRef<number>(0);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!active) {
      bufferRef.current = '';
      lastTimeRef.current = 0;
      return;
    }

    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        const isEditable =
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          (target as HTMLElement).isContentEditable;
        if (isEditable && !target.hasAttribute('data-scan-gun-passthrough')) {
          return;
        }
      }

      const now = performance.now();
      const gap = now - lastTimeRef.current;
      lastTimeRef.current = now;

      if (e.key === 'Enter') {
        const value = bufferRef.current;
        bufferRef.current = '';
        if (value.length >= minLength) {
          e.preventDefault();
          e.stopPropagation();
          onScanRef.current(value);
        }
        return;
      }

      if (e.key.length === 1) {
        if (gap > fastIntervalMs && bufferRef.current.length > 0) {
          bufferRef.current = '';
        }
        bufferRef.current += e.key;
        if (bufferRef.current.length > 256) {
          bufferRef.current = bufferRef.current.slice(-256);
        }
        return;
      }

      if (['Escape', 'Tab'].includes(e.key)) {
        bufferRef.current = '';
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => {
      window.removeEventListener('keydown', handler, true);
    };
  }, [active, minLength, fastIntervalMs]);
}
