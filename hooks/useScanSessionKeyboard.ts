import { useEffect, useRef } from 'react';
import {
  createEmptyScanSessionBuffers,
  DEFAULT_SCAN_SESSION_KEYBOARD_CONFIG,
  handleScanSessionEnter,
  handleScanSessionPrintableChar,
  handleScanSessionWeightIdle,
  peekPendingWeightKg,
  type ScanSessionKeyboardBuffers,
} from '../utils/scanSessionKeyboardLogic';

/**
 * 批量扫码弹窗专用：全局捕获 HID 秤 + 扫码枪，无需手动切换焦点。
 * 典型顺序：放货 → 秤输出重量 → 扫标签 → 下一包。
 */
export function useScanSessionKeyboard(params: {
  active: boolean;
  onScan: (value: string) => void;
  onWeight: (kg: number) => void;
  minScanLength?: number;
  fastIntervalMs?: number;
  weightIdleMs?: number;
}): void {
  const {
    active,
    onScan,
    onWeight,
    minScanLength = DEFAULT_SCAN_SESSION_KEYBOARD_CONFIG.minScanLength,
    fastIntervalMs = DEFAULT_SCAN_SESSION_KEYBOARD_CONFIG.fastIntervalMs,
    weightIdleMs = DEFAULT_SCAN_SESSION_KEYBOARD_CONFIG.weightIdleMs,
  } = params;

  const buffersRef = useRef<ScanSessionKeyboardBuffers>(createEmptyScanSessionBuffers());
  const onScanRef = useRef(onScan);
  const onWeightRef = useRef(onWeight);
  const weightIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const configRef = useRef({ minScanLength, fastIntervalMs, weightIdleMs });
  configRef.current = { minScanLength, fastIntervalMs, weightIdleMs };

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    onWeightRef.current = onWeight;
  }, [onWeight]);

  useEffect(() => {
    if (!active) {
      buffersRef.current = createEmptyScanSessionBuffers();
      if (weightIdleTimerRef.current) {
        clearTimeout(weightIdleTimerRef.current);
        weightIdleTimerRef.current = null;
      }
      return;
    }

    const scheduleWeightIdle = () => {
      if (weightIdleTimerRef.current) clearTimeout(weightIdleTimerRef.current);
      weightIdleTimerRef.current = setTimeout(() => {
        weightIdleTimerRef.current = null;
        const outcome = handleScanSessionWeightIdle(buffersRef.current);
        if (outcome.kind === 'weight') {
          buffersRef.current = outcome.next;
          onWeightRef.current(outcome.kg);
        }
      }, configRef.current.weightIdleMs);
    };

    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-scan-manual-input]')) return;

      if (e.key === 'Enter') {
        if (weightIdleTimerRef.current) {
          clearTimeout(weightIdleTimerRef.current);
          weightIdleTimerRef.current = null;
        }
        const outcomes = handleScanSessionEnter(buffersRef.current, configRef.current);
        if (outcomes.every(o => o.kind === 'ignore')) return;
        e.preventDefault();
        e.stopPropagation();
        for (const outcome of outcomes) {
          if (outcome.kind === 'weight') {
            onWeightRef.current(outcome.kg);
          }
          if (outcome.kind === 'scan') {
            const pending = peekPendingWeightKg(buffersRef.current);
            if (pending != null) onWeightRef.current(pending);
            onScanRef.current(outcome.value);
          }
          if (outcome.kind !== 'ignore') {
            buffersRef.current = outcome.next;
          }
        }
        return;
      }

      if (e.key.length !== 1) {
        if (['Escape', 'Tab'].includes(e.key)) {
          buffersRef.current = createEmptyScanSessionBuffers();
        }
        return;
      }

      const outcomes = handleScanSessionPrintableChar(
        buffersRef.current,
        e.key,
        performance.now(),
        configRef.current,
      );
      const hasIntercept = outcomes.some(o => o.kind === 'intercept' || o.kind === 'scan' || o.kind === 'weight');
      if (!hasIntercept) return;

      e.preventDefault();
      e.stopPropagation();

      for (const outcome of outcomes) {
        if (outcome.kind === 'weight') {
          onWeightRef.current(outcome.kg);
        }
        if (outcome.kind === 'scan') {
          onScanRef.current(outcome.value);
        }
        if (outcome.kind === 'intercept' || outcome.kind === 'scan' || outcome.kind === 'weight') {
          buffersRef.current = outcome.next;
        }
      }
      scheduleWeightIdle();
    };

    window.addEventListener('keydown', handler, true);
    return () => {
      window.removeEventListener('keydown', handler, true);
      if (weightIdleTimerRef.current) {
        clearTimeout(weightIdleTimerRef.current);
        weightIdleTimerRef.current = null;
      }
    };
  }, [active, minScanLength, fastIntervalMs, weightIdleMs]);
}
