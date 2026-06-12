import { useEffect, useRef } from 'react';

/**
 * 扫码枪监听 hook。
 *
 * 扫码枪本质是"超高速键盘"，扫一次会快速打完 token 字符后补一个 Enter。
 * 默认只在焦点不在普通 input/textarea 时接管。
 */
export function useScanGun(params: {
  active: boolean;
  onScan: (value: string) => void;
  minLength?: number;
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
      if (target?.closest('[data-scan-manual-input], [data-scale-capture-input]')) return;

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

/**
 * 与 HID 秤并存：绝不拦截可打印字符（秤可完整写入输入框），
 * 仅在检测到快速扫码序列 + Enter 时触发 onScan。
 * 用于 `[data-scale-capture-input]` 获焦时的报工称重场景。
 */
export function useScanGunParallel(params: {
  active: boolean;
  onScan: (value: string) => void;
  minLength?: number;
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
      // 秤捕获框：不参与并行扫码检测
      if (target?.closest('[data-scan-manual-input]') && !target?.closest('[data-scale-capture-input]')) {
        return;
      }

      const now = performance.now();
      const gap = lastTimeRef.current > 0 ? now - lastTimeRef.current : Number.POSITIVE_INFINITY;
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
        if (gap >= fastIntervalMs) {
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
