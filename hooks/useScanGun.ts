import { useEffect, useRef } from 'react';
import { isRecognizableScanPayload } from '../utils/scanPayload';

/** 扫码枪连打结束后无 Enter 时，停顿多久自动提交（ms）；0 表示禁用 */
export const DEFAULT_SCAN_IDLE_MS = 100;

export interface UseScanGunParams {
  active: boolean;
  onScan: (value: string) => void;
  minLength?: number;
  fastIntervalMs?: number;
  scanIdleMs?: number;
}

type GapClearsBuffer = 'gt' | 'gte';

function installScanGunKeydownListener(options: {
  minLength: number;
  fastIntervalMs: number;
  scanIdleMs: number;
  gapClearsBuffer: GapClearsBuffer;
  onScan: (value: string) => void;
  shouldHandleEvent: (e: KeyboardEvent) => boolean;
}): () => void {
  const { minLength, fastIntervalMs, scanIdleMs, gapClearsBuffer, onScan, shouldHandleEvent } = options;

  let buffer = '';
  let lastTimeMs = 0;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const clearIdleTimer = () => {
    if (idleTimer != null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };

  const tryIdleSubmit = () => {
    if (!isRecognizableScanPayload(buffer, minLength)) return;
    const value = buffer;
    buffer = '';
    clearIdleTimer();
    onScan(value);
  };

  const scheduleIdleSubmit = () => {
    if (scanIdleMs <= 0) return;
    clearIdleTimer();
    idleTimer = setTimeout(() => {
      idleTimer = null;
      tryIdleSubmit();
    }, scanIdleMs);
  };

  const handler = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    if (!shouldHandleEvent(e)) return;

    const now = performance.now();
    const gap = lastTimeMs > 0 ? now - lastTimeMs : Number.POSITIVE_INFINITY;
    lastTimeMs = now;

    if (e.key === 'Enter') {
      clearIdleTimer();
      const value = buffer;
      buffer = '';
      if (value.length >= minLength) {
        e.preventDefault();
        e.stopPropagation();
        onScan(value);
      }
      return;
    }

    if (e.key.length === 1) {
      const gapClears =
        gapClearsBuffer === 'gt' ? gap > fastIntervalMs : gap >= fastIntervalMs;
      if (gapClears && buffer.length > 0) {
        buffer = '';
        clearIdleTimer();
      }
      buffer += e.key;
      if (buffer.length > 256) {
        buffer = buffer.slice(-256);
      }
      scheduleIdleSubmit();
      return;
    }

    if (['Escape', 'Tab'].includes(e.key)) {
      clearIdleTimer();
      buffer = '';
    }
  };

  window.addEventListener('keydown', handler, true);
  return () => {
    clearIdleTimer();
    buffer = '';
    lastTimeMs = 0;
    window.removeEventListener('keydown', handler, true);
  };
}

/**
 * 扫码枪监听 hook。
 *
 * 扫码枪本质是"超高速键盘"，扫一次会快速打完 token 字符后补一个 Enter。
 * 若扫码枪未配置 Enter 后缀，可在停顿 {@link DEFAULT_SCAN_IDLE_MS} 后自动提交可识别的扫码串。
 * 默认只在焦点不在普通 input/textarea 时接管。
 */
export function useScanGun(params: UseScanGunParams): void {
  const {
    active,
    onScan,
    minLength = 6,
    fastIntervalMs = 35,
    scanIdleMs = DEFAULT_SCAN_IDLE_MS,
  } = params;

  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!active) return;

    return installScanGunKeydownListener({
      minLength,
      fastIntervalMs,
      scanIdleMs,
      gapClearsBuffer: 'gt',
      onScan: value => onScanRef.current(value),
      shouldHandleEvent: e => {
        const target = e.target;
        if (target instanceof HTMLElement) {
          if (target.closest('[data-scan-manual-input], [data-scale-capture-input]')) return false;

          const tag = target.tagName;
          const isEditable =
            tag === 'INPUT' ||
            tag === 'TEXTAREA' ||
            tag === 'SELECT' ||
            target.isContentEditable;
          if (isEditable && !target.hasAttribute('data-scan-gun-passthrough')) {
            return false;
          }
        }
        return true;
      },
    });
  }, [active, minLength, fastIntervalMs, scanIdleMs]);
}

/**
 * 与 HID 秤并存：绝不拦截可打印字符（秤可完整写入输入框），
 * 在检测到快速扫码序列 + Enter（或 idle 停顿）时触发 onScan。
 * 用于 `[data-scale-capture-input]` 获焦时的报工称重场景。
 */
export function useScanGunParallel(params: UseScanGunParams): void {
  const {
    active,
    onScan,
    minLength = 6,
    fastIntervalMs = 35,
    scanIdleMs = DEFAULT_SCAN_IDLE_MS,
  } = params;

  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!active) return;

    return installScanGunKeydownListener({
      minLength,
      fastIntervalMs,
      scanIdleMs,
      gapClearsBuffer: 'gte',
      onScan: value => onScanRef.current(value),
      shouldHandleEvent: e => {
        const target = e.target;
        if (
          target instanceof HTMLElement &&
          target.closest('[data-scan-manual-input]') &&
          !target.closest('[data-scale-capture-input]')
        ) {
          return false;
        }
        return true;
      },
    });
  }, [active, minLength, fastIntervalMs, scanIdleMs]);
}
