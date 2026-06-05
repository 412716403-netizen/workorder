import { describe, expect, it } from 'vitest';
import type { PrintRenderContext, PrintTemplate } from '../types';
import { collectLabelQrPayloads, resolveLabelQrPayload } from './labelPrintQr';
import { collectLabelQrValues } from './labelPrintExportShared';
import { getQrCells, getQrVersion } from './qrcodegen';

const miniTemplate: PrintTemplate = {
  id: 't1',
  name: 'test',
  paperSize: { widthMm: 30, heightMm: 50 },
  paperSizeCustom: true,
  paperMarginsMm: { top: 2, left: 2, right: 2, bottom: 2 },
  elements: [
    {
      id: 'qr',
      type: 'qrcode',
      x: 7,
      y: 10,
      width: 12,
      height: 12,
      zIndex: 2,
      config: { content: '{{行.scanUrl}}' },
    },
  ],
  createdAt: '',
  updatedAt: '',
};

describe('qrcodegen', () => {
  it('getQrCells returns square matrix with size version*4+17', () => {
    const cells = getQrCells('https://example.com/scan/token1');
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every(row => row.length === cells.length)).toBe(true);
    expect(cells.length).toBe(getQrVersion('https://example.com/scan/token1') * 4 + 17);
  });

  it('short payload uses version 1 (21x21)', () => {
    const cells = getQrCells('a');
    expect(cells.length).toBe(21);
    expect(cells[0].length).toBe(21);
  });

  it('identical payloads produce identical matrices', () => {
    const url = 'https://example.com/scan/abc123';
    expect(getQrCells(url)).toEqual(getQrCells(url));
  });
});

describe('labelPrintQr', () => {
  it('resolveLabelQrPayload resolves scan url from list row', () => {
    const ctx: PrintRenderContext = {
      listRow: { scanUrl: 'https://example.com/scan/token1' },
    };
    expect(resolveLabelQrPayload('{{行.scanUrl}}', ctx)).toBe('https://example.com/scan/token1');
  });

  it('collectLabelQrPayloads gathers unique payloads', () => {
    const contexts: PrintRenderContext[] = [
      { listRow: { scanUrl: 'https://a/1' } },
      { listRow: { scanUrl: 'https://a/2' } },
    ];
    expect(collectLabelQrPayloads(miniTemplate, contexts).sort()).toEqual(['https://a/1', 'https://a/2'].sort());
    expect(collectLabelQrValues(miniTemplate, contexts).sort()).toEqual(['https://a/1', 'https://a/2'].sort());
  });
});
