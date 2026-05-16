import { describe, expect, it } from 'vitest';
import {
  buildScanUrl,
  formatScanRecentChipText,
  getUnrecognizedScanImeHint,
  parseScanPayload,
  rewriteScanApiErrorForIme,
  scanInputLikelyImeIssue,
  scanRawLooksLikeImeCorruption,
} from './scanPayload';

describe('parseScanPayload', () => {
  it('parses item scan URL when token contains tenant prefix dot (cabbaeb9.xxx)', () => {
    const token = 'cabbaeb9.SBUEPxwv9TDYabcd';
    const raw = `http://localhost:3000/scan/${token}`;
    const p = parseScanPayload(raw);
    expect(p.kind).toBe('ITEM');
    expect(p.token).toBe(token);
  });

  it('parses batch scan URL when token contains a dot', () => {
    const token = 'a1b2c3d4.Z9Y8X7W6V5U4T3S2';
    const raw = `https://app.example.com/scan/batch/${token}`;
    const p = parseScanPayload(raw);
    expect(p.kind).toBe('BATCH');
    expect(p.token).toBe(token);
  });

  it('parses bare token with dot as ITEM', () => {
    const token = 'deadbeef.AbCdEfGhIjKlMnOp';
    const p = parseScanPayload(token);
    expect(p.kind).toBe('ITEM');
    expect(p.token).toBe(token);
  });

  it('rejects token shorter than min length', () => {
    expect(parseScanPayload('http://localhost:3000/scan/short').kind).toBe('UNKNOWN');
  });

  it('buildScanUrl round-trips with dotted token', () => {
    const token = 'feedface.AbCdEfGhIjKlMnOp';
    const url = buildScanUrl('https://x.com', 'ITEM', token);
    expect(parseScanPayload(url).token).toBe(token);
  });

  it('normalizes Chinese IME mistakes: 。 → . and — → -', () => {
    // 模拟扫码枪在中文输入法状态下扫到的 token：cabbaeb9。P6vnWi—KRwerKWpZ
    const ime = 'cabbaeb9。P6vnWi—KRwerKWpZ';
    const p = parseScanPayload(ime);
    expect(p.kind).toBe('ITEM');
    expect(p.token).toBe('cabbaeb9.P6vnWi-KRwerKWpZ');
  });

  it('normalizes IME mistakes inside URL', () => {
    const url = 'http://localhost:3000/scan/cabbaeb9。P6vnWi—KRwerKWpZ';
    const p = parseScanPayload(url);
    expect(p.kind).toBe('ITEM');
    expect(p.token).toBe('cabbaeb9.P6vnWi-KRwerKWpZ');
  });

  it('normalizes fullwidth slashes in batch scan URL', () => {
    const token = 'a1b2c3d4.Z9Y8X7W6V5U4T3S2';
    const url = `https://app.example.com\uFF0Fscan\uFF0Fbatch\uFF0F${token}`;
    const p = parseScanPayload(url);
    expect(p.kind).toBe('BATCH');
    expect(p.token).toBe(token);
  });

  it('normalizes IME in batch scan URL token', () => {
    const url = 'http://localhost:3000/scan/batch/cabbaeb9。P6vnWi—KRwerKWpZ';
    const p = parseScanPayload(url);
    expect(p.kind).toBe('BATCH');
    expect(p.token).toBe('cabbaeb9.P6vnWi-KRwerKWpZ');
  });

  it('normalizes fullwidth digits/letters via NFKC', () => {
    const fw = 'cabbaeb9.Ｐ６ｖｎＷｉ_KRwerKWpZ'; // 全角 P6vnWi
    const p = parseScanPayload(fw);
    expect(p.kind).toBe('ITEM');
    expect(p.token).toBe('cabbaeb9.P6vnWi_KRwerKWpZ');
  });
});

describe('scanRawLooksLikeImeCorruption', () => {
  it('returns true for Chinese period and em dash in raw', () => {
    expect(scanRawLooksLikeImeCorruption('cabbaeb9。P6vnWi—KRwerKWpZ')).toBe(true);
  });

  it('returns true for fullwidth letters', () => {
    expect(scanRawLooksLikeImeCorruption('abcＤＥＦ')).toBe(true);
  });

  it('returns false for plain ASCII token', () => {
    expect(scanRawLooksLikeImeCorruption('cabbaeb9.P6vnWi-KRwerKWpZ')).toBe(false);
  });
});

describe('scanInputLikelyImeIssue', () => {
  it('returns true when raw still shows IME punctuation', () => {
    expect(scanInputLikelyImeIssue('cabbaeb9。P6vnWi—KRwerKWpZ')).toBe(true);
  });

  it('returns true when NFKC would change the trimmed line (fullwidth alnum)', () => {
    expect(scanInputLikelyImeIssue('cabbaeb9.Ｐ６ｖｎＷｉ_KRwerKWpZ')).toBe(true);
  });

  it('returns false for clean ASCII scan line', () => {
    expect(scanInputLikelyImeIssue('cabbaeb9.P6vnWi-KRwerKWpZ')).toBe(false);
  });
});

describe('getUnrecognizedScanImeHint', () => {
  it('returns hint for fullwidth slash batch URL', () => {
    const token = 'a1b2c3d4.Z9Y8X7W6V5U4T3S2';
    expect(getUnrecognizedScanImeHint(`https://x.com\uFF0Fscan\uFF0Fbatch\uFF0F${token}`)).toContain('输入法');
  });
});

describe('rewriteScanApiErrorForIme', () => {
  it('replaces 批次码不存在 when IME is likely', () => {
    const out = rewriteScanApiErrorForIme('cabbaeb9。wrongtokenhere', '批次码不存在');
    expect(out).toContain('输入法');
    expect(out).not.toBe('批次码不存在');
  });

  it('replaces 单品码不存在 when IME is likely', () => {
    const out = rewriteScanApiErrorForIme('http://x/scan/cabbaeb9。AbCdEfGhIjKlMnOp', '单品码不存在');
    expect(out).toContain('输入法');
  });

  it('keeps server message when IME is unlikely', () => {
    expect(rewriteScanApiErrorForIme('deadbeef.AbCdEfGhIjKlMnOp', '批次码不存在')).toBe('批次码不存在');
  });

  it('does not rewrite non-not-found errors', () => {
    expect(rewriteScanApiErrorForIme('cabbaeb9。x', '网络错误')).toBe('网络错误');
  });
});

describe('formatScanRecentChipText', () => {
  it('shows token only for batch scan URL', () => {
    expect(
      formatScanRecentChipText('http://localhost:3000/scan/batch/cabbaeb9.02uspTSecDlgL5kh'),
    ).toBe('cabbaeb9.02uspTSecDlgL5kh');
  });

  it('shows token only for item scan URL', () => {
    expect(formatScanRecentChipText('https://app.example.com/scan/deadbeef.AbCdEfGhIjKlMnOp')).toBe(
      'deadbeef.AbCdEfGhIjKlMnOp',
    );
  });
});
