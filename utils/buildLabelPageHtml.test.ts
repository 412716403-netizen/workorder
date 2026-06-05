import { describe, expect, it } from 'vitest';
import type { PrintRenderContext, PrintTemplate } from '../types';
import { collectLabelQrValues } from './labelPrintExportShared';
import { hexToRgb, lineHeightMm, linesFittingBox } from './renderLabelPageVectorPdf';

const miniTemplate: PrintTemplate = {
  id: 't1',
  name: 'test',
  paperSize: { widthMm: 30, heightMm: 50 },
  paperSizeCustom: true,
  paperMarginsMm: { top: 2, left: 2, right: 2, bottom: 2 },
  elements: [
    {
      id: 'txt',
      type: 'text',
      x: 0,
      y: 0,
      width: 26,
      height: 8,
      zIndex: 1,
      config: {
        content: '{{行.serialLabel}}',
        fontSizePt: 10,
        fontWeight: 'normal',
        textAlign: 'center',
        color: '#111827',
      },
    },
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

describe('labelPrintExportShared', () => {
  it('collectLabelQrValues gathers qrcode payloads', () => {
    const contexts: PrintRenderContext[] = [
      { listRow: { scanUrl: 'https://a/1' } },
      { listRow: { scanUrl: 'https://a/2' } },
    ];
    const values = collectLabelQrValues(miniTemplate, contexts);
    expect(values.sort()).toEqual(['https://a/1', 'https://a/2'].sort());
  });
});

describe('linesFittingBox', () => {
  it('allows last line when its top is inside the box (browser overflow behavior)', () => {
    const lh = lineHeightMm(10);
    const box = { y: 35.5, h: 7 };
    expect(linesFittingBox(2, box, lh)).toBe(2);
  });

  it('clips when lines exceed box height', () => {
    const lh = lineHeightMm(10);
    const box = { y: 0, h: 6 };
    expect(linesFittingBox(4, box, lh)).toBeLessThan(4);
  });
});

describe('hexToRgb', () => {
  it('parses 6-digit hex', () => {
    expect(hexToRgb('#111827')).toEqual([17, 24, 39]);
  });

  it('parses 3-digit hex', () => {
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
  });
});
