import { useEffect, useRef } from 'react';
import { isRecognizableScanPayload } from '../utils/scanPayload';
import {
  isScanCaptureCompositionTarget,
  notifyScanImeCompositionStart,
} from '../utils/scanPassthroughInput';

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
    if (e.isComposing) return;
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

function installScanCaptureCompositionListener(): () => void {
  const onCompositionStart = (e: CompositionEvent) => {
    if (isScanCaptureCompositionTarget(e.target)) {
      notifyScanImeCompositionStart();
    }
  };
  window.addEventListener('compositionstart', onCompositionStart, true);
  return () => window.removeEventListener('compositionstart', onCompositionStart, true);
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

    const removeComposition = installScanCaptureCompositionListener();
    const removeKeydown = installScanGunKeydownListener({
      minLength,
      fastIntervalMs,
      scanIdleMs,
      gapClearsBuffer: 'gt',
      onScan: value => onScanRef.current(value),
      shouldHandleEvent: e => {
        const target = e.target;
        if (target instanceof HTMLElement) {
          // 秤框 / passthrough 输入框由 input 事件 + useScanPassthroughInputSubmit 处理，避免与 keydown 双提交
          if (
            target.closest('[data-scan-manual-input], [data-scale-capture-input], [data-scan-gun-passthrough]')
          ) {
            return false;
          }

          const tag = target.tagName;
          const isEditable =
            tag === 'INPUT' ||
            tag === 'TEXTAREA' ||
            tag === 'SELECT' ||
            target.isContentEditable;
          if (isEditable) {
            return false;
          }
        }
        return true;
      },
    });
    return () => {
      removeComposition();
      removeKeydown();
    };
  }, [active, minLength, fastIntervalMs, scanIdleMs]);
}

/**
 * @deprecated 称重场景改由 `[data-scale-capture-input]` 的 input 事件 + `useScanPassthroughInputSubmit` 提交。
 * 与 keydown 并行监听会导致同一扫码多次触发 onScan。保留空实现以免旧引用报错。
 */
export function useScanGunParallel(_params: UseScanGunParams): void {
  /* no-op */
}
