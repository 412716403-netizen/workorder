// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { playScanErrorSound } from './scanFeedbackSound';
import {
  createScanSubmitDedupeGate,
  isScanCaptureCompositionTarget,
  shouldTreatInputAsScanAttempt,
  trySubmitScanPassthroughInput,
} from './scanPassthroughInput';

vi.mock('sonner', () => ({
  toast: {
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./scanFeedbackSound', () => ({
  playScanErrorSound: vi.fn(),
}));

const ITEM_TOKEN = 'cabbaeb9.SBUEPxwv9TDYabcd';
const ITEM_URL = `http://localhost:3000/scan/${ITEM_TOKEN}`;

describe('shouldTreatInputAsScanAttempt', () => {
  it('returns true for scan URL', () => {
    expect(shouldTreatInputAsScanAttempt(ITEM_URL)).toBe(true);
  });

  it('returns true for bare dotted token', () => {
    expect(shouldTreatInputAsScanAttempt(ITEM_TOKEN)).toBe(true);
  });

  it('returns false for plain weight text', () => {
    expect(shouldTreatInputAsScanAttempt('0.193')).toBe(false);
  });
});

describe('createScanSubmitDedupeGate', () => {
  it('skips duplicate raw within window', () => {
    vi.useFakeTimers();
    const gate = createScanSubmitDedupeGate(600);
    gate.mark('http://x/scan/token1234567890abcd');
    expect(gate.shouldSkip('http://x/scan/token1234567890abcd')).toBe(true);
    vi.advanceTimersByTime(601);
    expect(gate.shouldSkip('http://x/scan/token1234567890abcd')).toBe(false);
    vi.useRealTimers();
  });
});

describe('trySubmitScanPassthroughInput', () => {
  it('submits recognizable scan URL', () => {
    const submit = vi.fn();
    expect(trySubmitScanPassthroughInput(ITEM_URL, submit)).toBe('submitted');
    expect(submit).toHaveBeenCalledWith(ITEM_URL);
  });

  it('skips non-scan text', () => {
    const submit = vi.fn();
    expect(trySubmitScanPassthroughInput('12.5 kg', submit)).toBe('skipped');
    expect(submit).not.toHaveBeenCalled();
  });

  it('skips partial scan URL on idle without toast', () => {
    const submit = vi.fn();
    expect(trySubmitScanPassthroughInput('http://localh', submit)).toBe('skipped');
    expect(submit).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(playScanErrorSound).not.toHaveBeenCalled();
  });

  it('notifies on explicit submit when scan URL is invalid', () => {
    const submit = vi.fn();
    expect(
      trySubmitScanPassthroughInput('http://localhost:3000/scan/short', submit, {
        notifyUnrecognized: true,
      }),
    ).toBe('unrecognized');
    expect(submit).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });
});

describe('isScanCaptureCompositionTarget', () => {
  it('detects scale capture input', () => {
    const wrap = document.createElement('div');
    const input = document.createElement('input');
    input.setAttribute('data-scale-capture-input', 'true');
    wrap.appendChild(input);
    expect(isScanCaptureCompositionTarget(input)).toBe(true);
  });

  it('detects scan gun passthrough input', () => {
    const input = document.createElement('input');
    input.setAttribute('data-scan-gun-passthrough', 'true');
    expect(isScanCaptureCompositionTarget(input)).toBe(true);
  });

  it('returns false for unrelated element', () => {
    expect(isScanCaptureCompositionTarget(document.createElement('input'))).toBe(false);
  });
});
