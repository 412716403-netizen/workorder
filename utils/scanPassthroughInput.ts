import { toast } from 'sonner';
import { looksLikeScanPollutedInput } from './parseScaleInput';
import { getUnrecognizedScanImeHint, isRecognizableScanPayload } from './scanPayload';
import { playScanErrorSound } from './scanFeedbackSound';

export const SCAN_IME_COMPOSITION_TOAST_ID = 'scan-ime-composition-warn';

/** 同一读入串在此窗口内只提交一次（keydown + input + Enter 可能并发触发）。 */
export const SCAN_PASSTHROUGH_SUBMIT_DEDUPE_MS = 600;

export type ScanSubmitDedupeGate = {
  shouldSkip: (raw: string) => boolean;
  mark: (raw: string) => void;
  reset: () => void;
};

export function createScanSubmitDedupeGate(
  windowMs = SCAN_PASSTHROUGH_SUBMIT_DEDUPE_MS,
): ScanSubmitDedupeGate {
  let last: { raw: string; at: number } | null = null;
  return {
    shouldSkip(raw) {
      const trimmed = String(raw ?? '').trim();
      if (!trimmed || !last) return false;
      return last.raw === trimmed && Date.now() - last.at < windowMs;
    },
    mark(raw) {
      last = { raw: String(raw ?? '').trim(), at: Date.now() };
    },
    reset() {
      last = null;
    },
  };
}

/** 中文输入法开始组字时提示切换英文半角（同 id 去重，避免重复弹出）。 */
export function notifyScanImeCompositionStart(): void {
  toast.warning('检测到中文输入法，扫码请先切换到英文（半角）输入法', {
    id: SCAN_IME_COMPOSITION_TOAST_ID,
  });
}

/** 输入框内容是否应视为「扫码枪误写入」而非普通手工键入。 */
export function shouldTreatInputAsScanAttempt(raw: string): boolean {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return false;
  return looksLikeScanPollutedInput(trimmed) || isRecognizableScanPayload(trimmed);
}

export function notifyUnrecognizedScanInput(raw: string): void {
  const trimmed = String(raw ?? '').trim();
  const preview = `${trimmed.slice(0, 30)}${trimmed.length > 30 ? '…' : ''}`;
  const imeHint = getUnrecognizedScanImeHint(trimmed);
  toast.error(`无法识别的扫码内容：${preview}`, imeHint ? { description: imeHint } : undefined);
  playScanErrorSound();
}

export type ScanPassthroughSubmitResult = 'submitted' | 'unrecognized' | 'skipped';

/**
 * 从 passthrough / 秤捕获框读入串尝试提交扫码。
 * 中文 IME 下 keydown 缓冲常为空，字符会直接落入 input，需靠 input 事件 + idle 兜底。
 */
export function trySubmitScanPassthroughInput(
  raw: string,
  submit: (value: string) => void,
  options?: { notifyUnrecognized?: boolean },
): ScanPassthroughSubmitResult {
  const trimmed = String(raw ?? '').trim();
  if (!shouldTreatInputAsScanAttempt(trimmed)) return 'skipped';
  if (isRecognizableScanPayload(trimmed)) {
    submit(trimmed);
    return 'submitted';
  }
  // 流式输入 idle 提交：半截 URL/token 仍可能继续流入，静默跳过；Enter 等明确结束再报错
  if (options?.notifyUnrecognized) {
    notifyUnrecognizedScanInput(trimmed);
    return 'unrecognized';
  }
  return 'skipped';
}

/** composition 事件是否发生在扫码专用输入框内。 */
export function isScanCaptureCompositionTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('[data-scale-capture-input], [data-scan-gun-passthrough]'));
}
