import { describe, it, expect } from 'vitest';
import {
  formatFileSize,
  formatUnpreviewableMessage,
  normalizeAttachmentDisplayMode,
  resolveAttachmentKind,
  resolveUploadMimeType,
} from './knowledgeAttachment';

describe('resolveAttachmentKind', () => {
  it('detects pdf by mime', () => {
    expect(resolveAttachmentKind('application/pdf')).toBe('pdf');
  });

  it('detects excel by mime', () => {
    expect(resolveAttachmentKind('application/vnd.ms-excel')).toBe('excel');
    expect(
      resolveAttachmentKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    ).toBe('excel');
  });

  it('detects previewable image by mime', () => {
    expect(resolveAttachmentKind('image/png')).toBe('image');
  });

  it('does not preview svg as image', () => {
    expect(resolveAttachmentKind('image/svg+xml', 'icon.svg')).toBe('other');
  });

  it('falls back to file extension when mime is empty', () => {
    expect(resolveAttachmentKind('', 'report.xlsx')).toBe('excel');
    expect(resolveAttachmentKind('', '东南亚车型.pdf')).toBe('pdf');
    expect(resolveAttachmentKind('', 'photo.JPG')).toBe('image');
  });

  it('returns other for unknown types', () => {
    expect(resolveAttachmentKind('application/octet-stream', 'part.dwg')).toBe('other');
  });

  it('detects video by mime or extension', () => {
    expect(resolveAttachmentKind('video/mp4', 'a.mp4')).toBe('video');
    expect(resolveAttachmentKind('', 'clip.webm')).toBe('video');
    expect(resolveAttachmentKind('video/quicktime', 'take.mov')).toBe('video');
  });
});

describe('normalizeAttachmentDisplayMode', () => {
  it('defaults video to tag', () => {
    expect(normalizeAttachmentDisplayMode(undefined, 'video/mp4', 'a.mp4')).toBe('tag');
    expect(normalizeAttachmentDisplayMode('tag', 'video/mp4', 'a.mp4')).toBe('tag');
  });

  it('accepts player for video only', () => {
    expect(normalizeAttachmentDisplayMode('player', 'video/mp4', 'a.mp4')).toBe('player');
    expect(normalizeAttachmentDisplayMode('player', 'application/pdf', 'a.pdf')).toBe('tag');
  });
});

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(512)).toBe('512B');
  });

  it('formats kilobytes with two decimals', () => {
    expect(formatFileSize(347_100)).toBe('338.96KB');
  });

  it('formats megabytes with two decimals', () => {
    expect(formatFileSize(26_017_402)).toBe('24.81MB');
  });

  it('guards against non-positive input', () => {
    expect(formatFileSize(0)).toBe('0B');
    expect(formatFileSize(-1)).toBe('0B');
  });
});

describe('resolveUploadMimeType', () => {
  it('prefers browser-provided mime', () => {
    expect(resolveUploadMimeType('a.pdf', 'application/pdf')).toBe('application/pdf');
  });

  it('maps extension when mime is missing', () => {
    expect(resolveUploadMimeType('BOM.xlsx', '')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(resolveUploadMimeType('legacy.xls', '')).toBe('application/vnd.ms-excel');
    expect(resolveUploadMimeType('doc.pdf', '')).toBe('application/pdf');
  });

  it('falls back to octet-stream for unknown extension', () => {
    expect(resolveUploadMimeType('drawing.dwg', '')).toBe('application/acad');
    expect(resolveUploadMimeType('data.bin', '')).toBe('application/octet-stream');
    expect(resolveUploadMimeType('noext', '')).toBe('application/octet-stream');
  });
});

describe('formatUnpreviewableMessage', () => {
  it('includes extension when present', () => {
    expect(formatUnpreviewableMessage('JK924.dwg')).toBe('.dwg 文件类型无法预览');
  });

  it('uses generic text without extension', () => {
    expect(formatUnpreviewableMessage('readme')).toBe('该文件类型无法预览');
    expect(formatUnpreviewableMessage('')).toBe('该文件类型无法预览');
  });
});
