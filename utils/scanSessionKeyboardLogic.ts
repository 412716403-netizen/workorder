import { parseScaleInputText } from './parseScaleInput';

export interface ScanSessionKeyboardBuffers {
  scanBuffer: string;
  scaleBuffer: string;
  lastKeyTimeMs: number;
  /** 当前 scanBuffer 是否由连续快速按键积累（扫码枪特征） */
  scanBurstActive: boolean;
}

export const DEFAULT_SCAN_SESSION_KEYBOARD_CONFIG = {
  minScanLength: 6,
  fastIntervalMs: 35,
  weightIdleMs: 280,
} as const;

export type ScanSessionKeyOutcome =
  | { kind: 'ignore' }
  | { kind: 'intercept'; next: ScanSessionKeyboardBuffers }
  | { kind: 'scan'; value: string; next: ScanSessionKeyboardBuffers }
  | { kind: 'weight'; kg: number; next: ScanSessionKeyboardBuffers };

export function createEmptyScanSessionBuffers(): ScanSessionKeyboardBuffers {
  return { scanBuffer: '', scaleBuffer: '', lastKeyTimeMs: 0, scanBurstActive: false };
}

function emptyBuffers(): ScanSessionKeyboardBuffers {
  return createEmptyScanSessionBuffers();
}

function tryWeightFromText(text: string): number | null {
  return parseScaleInputText(text);
}

/** 是否更像扫码 token/URL 而非纯重量 */
export function looksLikeScanContent(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (/\/scan\//i.test(t)) return true;
  if (/^https?:\/\//i.test(t)) return true;
  if (/^[a-f0-9]{8}\./i.test(t)) return true;
  if (/[a-z]/i.test(t) && t.includes('.') && t.length >= 8) return true;
  return false;
}

export function isScaleLikeChar(ch: string): boolean {
  return /^[\d.\s+\-]$/.test(ch) || ch.toLowerCase() === 'g' || ch.toLowerCase() === 'k';
}

export function isScaleLikeBuffer(buf: string): boolean {
  const t = buf.trim();
  if (!t) return false;
  if (looksLikeScanContent(t)) return false;
  return /^[\d.\s+\-kgKG]+$/.test(t) && /\d/.test(t);
}

export function isScaleCompleteBuffer(buf: string): boolean {
  return isScaleLikeBuffer(buf) && tryWeightFromText(buf) != null;
}

/** 秤重与扫码连在同一缓冲（如 0.192HTTP://...）时拆分 */
export function splitScaleScanCombined(buf: string): { weightPart: string; scanPart: string } | null {
  const m = buf.match(/^([\d.\s+\-kgKG]+)([A-Za-z/].*)$/);
  if (!m?.[1] || !m[2]) return null;
  if (!isScaleCompleteBuffer(m[1])) return null;
  if (!looksLikeScanContent(m[2]) && m[2].length < DEFAULT_SCAN_SESSION_KEYBOARD_CONFIG.minScanLength) {
    return null;
  }
  return { weightPart: m[1], scanPart: m[2] };
}

function tryWeightFromBuffers(buffers: ScanSessionKeyboardBuffers): number | null {
  const fromScale = tryWeightFromText(buffers.scaleBuffer);
  if (fromScale != null && isScaleLikeBuffer(buffers.scaleBuffer)) return fromScale;

  if (isScaleCompleteBuffer(buffers.scanBuffer)) {
    return tryWeightFromText(buffers.scanBuffer);
  }
  return null;
}

/**
 * 处理 Enter：优先快速扫码缓冲，否则尝试秤重缓冲。
 */
export function handleScanSessionEnter(
  buffers: ScanSessionKeyboardBuffers,
  config: typeof DEFAULT_SCAN_SESSION_KEYBOARD_CONFIG = DEFAULT_SCAN_SESSION_KEYBOARD_CONFIG,
): ScanSessionKeyOutcome[] {
  const { scanBuffer, scaleBuffer, scanBurstActive } = buffers;
  const outcomes: ScanSessionKeyOutcome[] = [];

  const combined = splitScaleScanCombined(scanBuffer);
  if (combined) {
    const kg = tryWeightFromText(combined.weightPart);
    if (kg != null) {
      outcomes.push({ kind: 'weight', kg, next: emptyBuffers() });
    }
    if (combined.scanPart.length >= config.minScanLength) {
      outcomes.push({ kind: 'scan', value: combined.scanPart, next: emptyBuffers() });
      return outcomes;
    }
  }

  const pendingKg = tryWeightFromBuffers(buffers);
  const scanLooksValid =
    scanBuffer.length >= config.minScanLength &&
    (scanBurstActive || looksLikeScanContent(scanBuffer)) &&
    !isScaleCompleteBuffer(scanBuffer);

  if (scanLooksValid) {
    if (pendingKg != null && scaleBuffer) {
      outcomes.push({ kind: 'weight', kg: pendingKg, next: { ...buffers, scaleBuffer: '' } });
    }
    outcomes.push({ kind: 'scan', value: scanBuffer, next: emptyBuffers() });
    return outcomes;
  }

  if (pendingKg != null) {
    outcomes.push({ kind: 'weight', kg: pendingKg, next: emptyBuffers() });
    return outcomes;
  }

  if (scanBuffer.length >= config.minScanLength) {
    outcomes.push({ kind: 'scan', value: scanBuffer, next: emptyBuffers() });
    return outcomes;
  }

  outcomes.push({ kind: 'intercept', next: emptyBuffers() });
  return outcomes;
}

/**
 * 处理可打印字符：快速连打归扫码枪，慢速数字归秤。
 * 若秤缓冲已有重量且开始出现快速连打，先提交秤重再收扫码。
 */
export function handleScanSessionPrintableChar(
  buffers: ScanSessionKeyboardBuffers,
  ch: string,
  nowMs: number,
  config: typeof DEFAULT_SCAN_SESSION_KEYBOARD_CONFIG = DEFAULT_SCAN_SESSION_KEYBOARD_CONFIG,
): ScanSessionKeyOutcome[] {
  const outcomes: ScanSessionKeyOutcome[] = [];
  let { scanBuffer, scaleBuffer, lastKeyTimeMs, scanBurstActive } = buffers;

  const gap = lastKeyTimeMs > 0 ? nowMs - lastKeyTimeMs : Number.POSITIVE_INFINITY;
  const isFast = gap < config.fastIntervalMs;

  if (isFast) {
    const candidate = (scaleBuffer || scanBuffer) + ch;

    if (isScaleCompleteBuffer(scanBuffer) && !isScaleLikeChar(ch)) {
      const kg = tryWeightFromText(scanBuffer);
      if (kg != null) {
        outcomes.push({ kind: 'weight', kg, next: createEmptyScanSessionBuffers() });
      }
      scaleBuffer = '';
      scanBuffer = ch;
      scanBurstActive = true;
    } else if (isScaleLikeBuffer(candidate) && !looksLikeScanContent(candidate)) {
      scaleBuffer = candidate;
      scanBuffer = '';
      scanBurstActive = false;
    } else {
      if (scaleBuffer) {
        const kg = tryWeightFromText(scaleBuffer);
        if (kg != null) {
          outcomes.push({ kind: 'weight', kg, next: createEmptyScanSessionBuffers() });
        }
        scaleBuffer = '';
      }
      scanBuffer += ch;
      scanBurstActive = true;
    }
  } else {
    if (scanBurstActive && scanBuffer && !isScaleLikeBuffer(scanBuffer)) {
      scanBuffer = '';
      scanBurstActive = false;
    }
    if (isScaleLikeChar(ch) && (isScaleLikeBuffer(scaleBuffer + ch) || scaleBuffer === '')) {
      scaleBuffer += ch;
    } else {
      scanBuffer += ch;
      scanBurstActive = false;
    }
  }

  outcomes.push({
    kind: 'intercept',
    next: { scanBuffer, scaleBuffer, lastKeyTimeMs: nowMs, scanBurstActive },
  });
  return outcomes;
}

/** 秤输入停顿后自动提交重量（无 Enter 的秤） */
export function handleScanSessionWeightIdle(
  buffers: ScanSessionKeyboardBuffers,
): ScanSessionKeyOutcome {
  const kg = tryWeightFromBuffers(buffers);
  if (kg != null) {
    return {
      kind: 'weight',
      kg,
      next: {
        ...buffers,
        scaleBuffer: '',
        scanBuffer: isScaleCompleteBuffer(buffers.scanBuffer) ? '' : buffers.scanBuffer,
      },
    };
  }
  return { kind: 'ignore' };
}

/** 扫码触发前：尽量提交尚未落库的秤重（避免用户扫得太快） */
export function peekPendingWeightKg(buffers: ScanSessionKeyboardBuffers): number | null {
  return tryWeightFromBuffers(buffers);
}
