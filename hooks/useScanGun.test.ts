// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { DEFAULT_SCAN_IDLE_MS, useScanGun } from './useScanGun';

const ITEM_TOKEN = 'cabbaeb9.SBUEPxwv9TDYabcd';
const ITEM_URL = `https://app.example.com/scan/${ITEM_TOKEN}`;

function dispatchKey(key: string, opts?: { gapMs?: number }) {
  if (opts?.gapMs) {
    vi.advanceTimersByTime(opts.gapMs);
  }
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

function typeFast(text: string, charGapMs = 8) {
  for (const ch of text) {
    dispatchKey(ch, { gapMs: charGapMs });
  }
}

describe('useScanGun scanIdleMs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('auto-submits recognizable scan without Enter after scanIdleMs', () => {
    const onScan = vi.fn();
    renderHook(() =>
      useScanGun({ active: true, onScan, scanIdleMs: DEFAULT_SCAN_IDLE_MS }),
    );

    typeFast(ITEM_URL);
    expect(onScan).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(DEFAULT_SCAN_IDLE_MS);
    });

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith(ITEM_URL);
  });

  it('does not auto-submit partial or non-scan text on idle', () => {
    const onScan = vi.fn();
    renderHook(() =>
      useScanGun({ active: true, onScan, scanIdleMs: DEFAULT_SCAN_IDLE_MS }),
    );

    typeFast('0.193', 120);
    act(() => {
      vi.advanceTimersByTime(DEFAULT_SCAN_IDLE_MS);
    });

    expect(onScan).not.toHaveBeenCalled();
  });

  it('scanIdleMs=0 disables idle submit but Enter still works', () => {
    const onScan = vi.fn();
    renderHook(() => useScanGun({ active: true, onScan, scanIdleMs: 0 }));

    typeFast(ITEM_URL);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onScan).not.toHaveBeenCalled();

    dispatchKey('Enter');
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith(ITEM_URL);
  });

  it('ignores keyboard when focus is in a normal input', () => {
    const onScan = vi.fn();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    renderHook(() =>
      useScanGun({ active: true, onScan, scanIdleMs: DEFAULT_SCAN_IDLE_MS }),
    );

    const event = new KeyboardEvent('keydown', { key: 'h', bubbles: true });
    Object.defineProperty(event, 'target', { value: input, configurable: true });
    input.dispatchEvent(event);

    act(() => {
      vi.advanceTimersByTime(DEFAULT_SCAN_IDLE_MS);
    });

    expect(onScan).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });
});
