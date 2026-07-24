/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { openFileUrlInNewTab } from './openFileUrlInNewTab';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), message: vi.fn() } }));

const openOffice = vi.fn();
vi.mock('./openOfficePreviewInNewTab', () => ({
  openOfficePreviewInNewTab: (...args: unknown[]) => openOffice(...args),
}));

describe('openFileUrlInNewTab', () => {
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    openOffice.mockReset();
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  it('opens http(s) url in a new tab', () => {
    openFileUrlInNewTab('https://example.com/a.pdf');
    expect(openSpy).toHaveBeenCalledWith('https://example.com/a.pdf', '_blank');
  });

  it('returns null for empty url', () => {
    expect(openFileUrlInNewTab('')).toBeNull();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('routes excel to HTML preview helper instead of raw download', () => {
    openFileUrlInNewTab('https://example.com/a.xlsx', {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName: 'a.xlsx',
    });
    expect(openOffice).toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('routes word to HTML preview helper instead of raw download', () => {
    openFileUrlInNewTab('https://example.com/a.docx', {
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileName: 'a.docx',
    });
    expect(openOffice).toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });
});
