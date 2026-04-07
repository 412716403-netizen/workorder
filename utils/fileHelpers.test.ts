import { describe, it, expect } from 'vitest';
import { getFileExtFromDataUrl } from './fileHelpers';

describe('getFileExtFromDataUrl', () => {
  it('extracts png extension', () => {
    expect(getFileExtFromDataUrl('data:image/png;base64,abc')).toBe('png');
  });

  it('extracts jpeg as jpg', () => {
    expect(getFileExtFromDataUrl('data:image/jpeg;base64,abc')).toBe('jpg');
  });

  it('extracts pdf extension', () => {
    expect(getFileExtFromDataUrl('data:application/pdf;base64,abc')).toBe('pdf');
  });

  it('returns bin for unknown mime type', () => {
    expect(getFileExtFromDataUrl('data:application/octet-stream;base64,abc')).toBe('bin');
  });

  it('returns bin for malformed data url', () => {
    expect(getFileExtFromDataUrl('not-a-data-url')).toBe('bin');
  });

  it('returns bin for empty string', () => {
    expect(getFileExtFromDataUrl('')).toBe('bin');
  });
});
