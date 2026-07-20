import { describe, expect, it } from 'vitest';
import {
  DEV_STAGE_FILE_MAX_COUNT,
  isDevStageFileValueFilled,
  listDevStageImageUrls,
  parseDevStageFileUrls,
  serializeDevStageFileUrls,
} from './devStageFileValue';

describe('devStageFileValue', () => {
  it('parses legacy single data URL', () => {
    const url = 'data:image/jpeg;base64,abc';
    expect(parseDevStageFileUrls(url)).toEqual([url]);
    expect(serializeDevStageFileUrls([url])).toBe(url);
  });

  it('roundtrips multiple urls as JSON', () => {
    const urls = ['data:image/jpeg;base64,a', 'data:image/png;base64,b'];
    const raw = serializeDevStageFileUrls(urls);
    expect(raw.startsWith('[')).toBe(true);
    expect(parseDevStageFileUrls(raw)).toEqual(urls);
  });

  it('treats empty as not filled', () => {
    expect(isDevStageFileValueFilled('')).toBe(false);
    expect(isDevStageFileValueFilled('[]')).toBe(false);
    expect(isDevStageFileValueFilled('data:image/jpeg;base64,x')).toBe(true);
  });

  it('lists only images', () => {
    const raw = serializeDevStageFileUrls([
      'data:image/jpeg;base64,a',
      'data:application/pdf;base64,b',
    ]);
    expect(listDevStageImageUrls(raw)).toEqual(['data:image/jpeg;base64,a']);
  });

  it('caps at max count', () => {
    const urls = Array.from({ length: DEV_STAGE_FILE_MAX_COUNT + 3 }, (_, i) => `data:image/jpeg;base64,${i}`);
    expect(parseDevStageFileUrls(serializeDevStageFileUrls(urls))).toHaveLength(DEV_STAGE_FILE_MAX_COUNT);
  });
});
