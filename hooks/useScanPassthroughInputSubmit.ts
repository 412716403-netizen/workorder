import { useCallback, useEffect, useRef } from 'react';
import {
  createScanSubmitDedupeGate,
  shouldTreatInputAsScanAttempt,
  trySubmitScanPassthroughInput,
} from '../utils/scanPassthroughInput';

const DEFAULT_IDLE_MS = 220;

/**
 * 扫码 passthrough 输入框：扫码枪逐字符写入时，token 中途就可能短暂「看起来可识别」
 * （长度过了下限但还没扫完），若此时立即提交会拿半截 token 去查 → 连续「码不存在」。
 * 因此一律走 idle 防抖：等输入停止后只提交一次完整串；Enter 经 {@link flush} 立即提交。
 */
export function useScanPassthroughInputSubmit(
  submit: (raw: string) => void,
  options?: {
    idleMs?: number;
    /** 提交失败（无法识别）时回调，例如清空输入框 */
    onUnrecognized?: (raw: string) => void;
  },
) {
  const idleMs = options?.idleMs ?? DEFAULT_IDLE_MS;
  const submitRef = useRef(submit);
  submitRef.current = submit;
  const onUnrecognizedRef = useRef(options?.onUnrecognized);
  onUnrecognizedRef.current = options?.onUnrecognized;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dedupeRef = useRef(createScanSubmitDedupeGate());

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const runSubmit = useCallback((raw: string, notifyUnrecognized = false) => {
    const trimmed = String(raw ?? '').trim();
    if (dedupeRef.current.shouldSkip(trimmed)) return 'skipped' as const;
    const result = trySubmitScanPassthroughInput(
      trimmed,
      value => {
        dedupeRef.current.mark(value);
        submitRef.current(value);
      },
      { notifyUnrecognized },
    );
    if (result === 'unrecognized') {
      dedupeRef.current.mark(trimmed);
      onUnrecognizedRef.current?.(raw);
    }
    return result;
  }, []);

  /**
   * 输入事件入口：扫码串可能逐字符流入，统一防抖到停止输入后提交一次完整串，
   * 避免半截 token 被提前提交。
   * @returns true 表示当前 raw 已按「扫码尝试」处理（已排程提交）
   */
  const handleValue = useCallback(
    (raw: string, getLatest?: () => string): boolean => {
      if (!shouldTreatInputAsScanAttempt(raw)) return false;

      cancel();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const latest = getLatest?.() ?? raw;
        runSubmit(latest, false);
      }, idleMs);
      return true;
    },
    [cancel, idleMs, runSubmit],
  );

  /** Enter 等明确「结束」信号：立即提交完整串（不再等 idle）。 */
  const flush = useCallback(
    (raw: string): boolean => {
      cancel();
      if (!shouldTreatInputAsScanAttempt(raw)) return false;
      runSubmit(raw, true);
      return true;
    },
    [cancel, runSubmit],
  );

  useEffect(() => () => cancel(), [cancel]);

  return { handleValue, flush, cancel };
}
