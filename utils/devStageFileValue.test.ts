import { describe, expect, it } from 'vitest';
import {
  DEV_STAGE_FILE_MAX_COUNT,
  isDevStageFileValueFilled,
  listDevStageImageUrls,
  parseDevStageFileItems,
  parseDevStageFileUrls,
  resolveDevStageFileDownloadName,
  serializeDevStageFileItems,
  serializeDevStageFileUrls,
} from './devStageFileValue';

describe('devStageFileValue', () => {
  it('parses legacy single data URL', () => {
    const url = 'data:image/jpeg;base64,abc';
    expect(parseDevStageFileUrls(url)).toEqual([url]);
    expect(parseDevStageFileItems(url)).toEqual([{ url, name: '' }]);
    expect(serializeDevStageFileUrls([url])).toBe(url);
  });

  it('roundtrips multiple urls as JSON', () => {
    const urls = ['data:image/jpeg;base64,a', 'data:image/png;base64,b'];
    const raw = serializeDevStageFileUrls(urls);
    expect(raw.startsWith('[')).toBe(true);
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
});
