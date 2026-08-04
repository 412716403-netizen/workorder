import { describe, expect, it } from 'vitest';
import {
  DEV_STAGE_FILE_MAX_COUNT,
  hasDevStageFileDeferred,
  hasDevStageFilePayload,
  isDevStageFileValueFilled,
  listDevStageImageUrls,
  parseDevStageFileItems,
  parseDevStageFileUrls,
  peelDevStageFileNamesHeader,
  resolveDevStageFileDownloadName,
  serializeDevStageFileItems,
  serializeDevStageFileUrls,
  stripDevStageFilePayloads,
  stubDevStageFileValueFromHead,
} from './devStageFileValue';

describe('devStageFileValue', () => {
  it('parses legacy single data URL', () => {
    const url = 'data:image/jpeg;base64,abc';
    expect(parseDevStageFileUrls(url)).toEqual([url]);
    expect(parseDevStageFileItems(url)).toEqual([{ url, name: '' }]);
  });

  it('roundtrips multiple urls as JSON with names header', () => {
    const urls = ['data:image/jpeg;base64,a', 'data:image/png;base64,b'];
    const raw = serializeDevStageFileUrls(urls);
    expect(raw.startsWith('/*devStageFiles:')).toBe(true);
    expect(parseDevStageFileUrls(raw)).toEqual(urls);
  });

  it('roundtrips named files and keeps original names', () => {
    const items = [
      { url: 'data:application/pdf;base64,aaa', name: '报价单.pdf' },
      { url: 'data:image/png;base64,bbb', name: '款式图.png' },
    ];
    const raw = serializeDevStageFileItems(items);
    expect(parseDevStageFileItems(raw)).toEqual(items);
    expect(resolveDevStageFileDownloadName(items[0]!, '附件', 0)).toBe('报价单.pdf');
    const { names } = peelDevStageFileNamesHeader(raw);
    expect(names).toEqual(['报价单.pdf', '款式图.png']);
  });

  it('treats empty as not filled', () => {
    expect(isDevStageFileValueFilled('')).toBe(false);
    expect(isDevStageFileValueFilled('[]')).toBe(false);
    expect(isDevStageFileValueFilled('data:image/jpeg;base64,x')).toBe(true);
  });

  it('lists only images', () => {
    const raw = serializeDevStageFileItems([
      { url: 'data:image/jpeg;base64,a', name: 'a.jpg' },
      { url: 'data:application/pdf;base64,b', name: 'b.pdf' },
    ]);
    expect(listDevStageImageUrls(raw)).toEqual(['data:image/jpeg;base64,a']);
  });

  it('caps at max count', () => {
    const urls = Array.from({ length: DEV_STAGE_FILE_MAX_COUNT + 3 }, (_, i) => `data:image/jpeg;base64,${i}`);
    expect(parseDevStageFileUrls(serializeDevStageFileUrls(urls))).toHaveLength(DEV_STAGE_FILE_MAX_COUNT);
  });

  it('falls back download name when name missing', () => {
    expect(
      resolveDevStageFileDownloadName({ url: 'data:application/pdf;base64,x', name: '' }, '检测报告', 1),
    ).toBe('检测报告-2.pdf');
  });

  it('strips payloads to deferred stubs and parse keeps names', () => {
    const raw = serializeDevStageFileItems([
      { url: 'data:image/png;base64,aaa', name: '图A.png' },
      { url: 'data:application/pdf;base64,bbb', name: '报告.pdf' },
    ]);
    const stub = stripDevStageFilePayloads(raw);
    expect(stub.includes('base64')).toBe(false);
    const items = parseDevStageFileItems(stub);
    expect(items).toEqual([
      { url: '', name: '图A.png', deferred: true },
      { url: '', name: '报告.pdf', deferred: true },
    ]);
    expect(hasDevStageFileDeferred(stub)).toBe(true);
    expect(hasDevStageFilePayload(stub)).toBe(false);
    expect(isDevStageFileValueFilled(stub)).toBe(true);
  });

  it('builds deferred stub from LEFT(value) head using names header', () => {
    const full = serializeDevStageFileItems([
      { url: `data:image/png;base64,${'A'.repeat(5000)}`, name: '大图.png' },
      { url: `data:application/pdf;base64,${'B'.repeat(5000)}`, name: '大PDF.pdf' },
    ]);
    const headerEnd = full.indexOf('*/') + 2;
    const head = full.slice(0, headerEnd);
    expect(head.includes('大图.png')).toBe(true);
    expect(head.includes('AAAA')).toBe(false);
    const stub = stubDevStageFileValueFromHead(head);
    expect(parseDevStageFileItems(stub)).toEqual([
      { url: '', name: '大图.png', deferred: true },
      { url: '', name: '大PDF.pdf', deferred: true },
    ]);
  });

  it('legacy url-first head without names falls back to 附件1', () => {
    const head = '[{"url":"data:image/jpeg;base64,/9j/4AAQ';
    const stub = stubDevStageFileValueFromHead(head);
    expect(parseDevStageFileItems(stub)).toEqual([
      { url: '', name: '附件1', deferred: true },
    ]);
  });

  it('recovers a legacy url-first file name from the value tail', () => {
    const head = '[{"url":"data:application/pdf;base64,AAAA';
    const tail = 'BBBB","name":"历史图纸.pdf"}]';
    const stub = stubDevStageFileValueFromHead(head, tail);
    expect(parseDevStageFileItems(stub)).toEqual([
      { url: '', name: '历史图纸.pdf', deferred: true },
    ]);
    expect(stub.includes('base64')).toBe(false);
  });

  it('extracts raw binary bytes from a named data URL item', async () => {
    const { extractDevStageFileBinary } = await import('./devStageFileValue');
    const raw = serializeDevStageFileItems([
      { url: 'data:video/mp4;base64,AAAA', name: 'demo.mp4' },
    ]);
    const payload = extractDevStageFileBinary(raw, 0, '视频');
    expect(payload?.name).toBe('demo.mp4');
    expect(payload?.mimeType).toBe('video/mp4');
    expect(Array.from(payload?.bytes ?? [])).toEqual([0, 0, 0]);
  });
});
