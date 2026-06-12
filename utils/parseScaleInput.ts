/** 电子秤串口/HID 输入文本解析（单行） */

export type ScaleInputProtocol = 'auto' | 'plain_kg' | 'comma_st';

export interface ScaleInputReading {
  weightKg: number;
  stable: boolean;
  rawLine: string;
}

/** 是否像扫码 URL/Token 混入秤框（不可整段解析为重量） */
export function looksLikeScanPollutedInput(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (/\/scan\//i.test(t)) return true;
  if (/^https?:\/\//i.test(t)) return true;
  if (/[a-zA-Z]:\/\//.test(t)) return true;
  if (/^[a-f0-9]{8}\./i.test(t)) return true;
  if (/[a-zA-Z]/.test(t)) {
    return !/^[\d.\s+\-kgKG]+$/.test(t);
  }
  return false;
}

/** 从秤输出的一行/一段文本解析重量(kg) */
export function parseScaleLine(line: string, protocol: ScaleInputProtocol = 'auto'): ScaleInputReading | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  /** 整数 50–999 且无小数点：按克(g)解析，如 193 → 0.193kg（排除 3000 等端口/杂数字） */
  const tryGramsInt = (): ScaleInputReading | null => {
    const m = trimmed.match(/^([+-]?\d{2,4})$/);
    if (!m) return null;
    const n = parseInt(m[1]!, 10);
    if (!Number.isFinite(n) || n < 50 || n > 999) return null;
    return { weightKg: n / 1000, stable: true, rawLine: trimmed };
  };

  const tryPlain = (): ScaleInputReading | null => {
    const m = trimmed.match(/^([+-]?\d+(?:\.\d+)?)\s*(kg|g|KG|G)?$/i);
    if (!m) return null;
    const numStr = m[1]!;
    let val = parseFloat(numStr);
    if (!Number.isFinite(val)) return null;
    const unit = (m[2] ?? '').toLowerCase();
    if (unit === 'g') val /= 1000;
    else if (!unit && !numStr.includes('.')) {
      if (val >= 50 && val <= 999) val /= 1000;
      else return null;
    }
    if (!(val > 0)) return null;
    const stable = !/unstable|motion|~~|ST,NT/i.test(trimmed);
    return { weightKg: Math.abs(val), stable, rawLine: trimmed };
  };

  const tryComma = (): ScaleInputReading | null => {
    const parts = trimmed.split(',');
    if (parts.length < 2) return null;
    const status = parts[0]?.toUpperCase() ?? '';
    const stable = status === 'ST' || /GS|STABLE/i.test(trimmed);
    const numPart = parts.find(p => /[+-]?\d/.test(p)) ?? parts[parts.length - 1]!;
    const m = numPart.match(/([+-]?\d+(?:\.\d+)?)\s*(kg|g|KG|G)?/i);
    if (!m) return null;
    let val = parseFloat(m[1]!);
    if (!Number.isFinite(val)) return null;
    const unit = (m[2] ?? 'kg').toLowerCase();
    if (unit === 'g') val /= 1000;
    return { weightKg: Math.abs(val), stable, rawLine: trimmed };
  };

  if (protocol === 'plain_kg') return tryPlain() ?? tryGramsInt();
  if (protocol === 'comma_st') return tryComma();
  return tryComma() ?? tryPlain() ?? tryGramsInt();
}

/** 从重量输入框当前文本读取 kg；无效或 ≤0 返回 null */
export function parseScaleInputText(text: string, protocol: ScaleInputProtocol = 'auto'): number | null {
  const reading = parseScaleLine(text, protocol);
  if (!reading || !(reading.weightKg > 0)) return null;
  return reading.weightKg;
}

/** 从秤捕获框文本提取重量（兼容尾部误扫入的 URL 片段） */
export function extractWeightFromCaptureText(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (looksLikeScanPollutedInput(trimmed)) {
    const prefix = trimmed.match(/^([\d.\s+\-kgKG]+)/)?.[1]?.trim();
    if (prefix) return parseScaleInputText(prefix);
    return null;
  }

  return parseScaleInputText(trimmed);
}
