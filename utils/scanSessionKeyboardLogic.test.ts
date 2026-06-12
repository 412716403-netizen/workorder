import { describe, expect, it } from 'vitest';
import {
  createEmptyScanSessionBuffers,
  handleScanSessionEnter,
  handleScanSessionPrintableChar,
  handleScanSessionWeightIdle,
  isScaleCompleteBuffer,
  looksLikeScanContent,
  peekPendingWeightKg,
  splitScaleScanCombined,
} from './scanSessionKeyboardLogic';

describe('scanSessionKeyboardLogic', () => {
  it('detects scan-like content', () => {
    expect(looksLikeScanContent('http://localhost/scan/abc')).toBe(true);
    expect(looksLikeScanContent('0.192')).toBe(false);
  });

  it('parses scale on Enter after slow numeric input', () => {
    let buf = createEmptyScanSessionBuffers();
    let t = 1000;
    for (const ch of '0.192') {
      const outcomes = handleScanSessionPrintableChar(buf, ch, t);
      buf = outcomes[outcomes.length - 1]!.next;
      t += 120;
    }
    const enter = handleScanSessionEnter(buf);
    expect(enter[0]?.kind).toBe('weight');
    if (enter[0]?.kind === 'weight') expect(enter[0].kg).toBe(0.192);
  });

  it('parses fast scale burst as weight on Enter', () => {
    let buf = createEmptyScanSessionBuffers();
    let t = 1000;
    for (const ch of '0.192') {
      const outcomes = handleScanSessionPrintableChar(buf, ch, t);
      buf = outcomes[outcomes.length - 1]!.next;
      t += 10;
    }
    expect(isScaleCompleteBuffer(buf.scaleBuffer)).toBe(true);
    const enter = handleScanSessionEnter(buf);
    expect(enter[0]?.kind).toBe('weight');
  });

  it('commits scale before fast scan burst', () => {
    let buf = createEmptyScanSessionBuffers();
    let t = 1000;
    for (const ch of '0.192') {
      const outcomes = handleScanSessionPrintableChar(buf, ch, t);
      buf = outcomes[outcomes.length - 1]!.next;
      t += 120;
    }
    const weights: number[] = [];
    const url = 'HTTP://LOCALHOST/SCAN/TOKEN';
    for (const ch of url) {
      const outcomes = handleScanSessionPrintableChar(buf, ch, t);
      for (const o of outcomes) {
        if (o.kind === 'weight') weights.push(o.kg);
        if (o.kind === 'intercept') buf = o.next;
      }
      t += 10;
    }
    expect(weights).toEqual([0.192]);
    const enter = handleScanSessionEnter(buf);
    expect(enter.some(o => o.kind === 'scan')).toBe(true);
  });

  it('splits combined scale+scan buffer', () => {
    const split = splitScaleScanCombined('0.192HTTP://LOCALHOST/SCAN/X');
    expect(split?.weightPart).toBe('0.192');
    expect(split?.scanPart).toMatch(/^HTTP/);
  });

  it('idle commits scale without Enter', () => {
    let buf = createEmptyScanSessionBuffers();
    let t = 1000;
    for (const ch of '0.193') {
      const outcomes = handleScanSessionPrintableChar(buf, ch, t);
      buf = outcomes[outcomes.length - 1]!.next;
      t += 100;
    }
    const idle = handleScanSessionWeightIdle(buf);
    expect(idle.kind).toBe('weight');
    if (idle.kind === 'weight') expect(idle.kg).toBe(0.193);
  });

  it('peekPendingWeightKg reads fast scale buffer', () => {
    let buf = createEmptyScanSessionBuffers();
    let t = 1000;
    for (const ch of '0.188') {
      const outcomes = handleScanSessionPrintableChar(buf, ch, t);
      buf = outcomes[outcomes.length - 1]!.next;
      t += 8;
    }
    expect(peekPendingWeightKg(buf)).toBe(0.188);
  });
});
