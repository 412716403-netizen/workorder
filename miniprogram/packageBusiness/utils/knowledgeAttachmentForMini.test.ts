import { createRequire } from 'module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const {
  formatFileSize,
  resolveAttachmentKind,
  resolveOpenDocumentFileType,
  formatUnpreviewableMessage,
} = require('./knowledgeAttachmentForMini.js');

describe('knowledgeAttachmentForMini', () => {
  it('formats size', () => {
    expect(formatFileSize(512)).toBe('512B');
    expect(formatFileSize(0)).toBe('0B');
  });

  it('resolves kinds', () => {
    expect(resolveAttachmentKind('application/pdf', 'a.pdf')).toBe('pdf');
    expect(
      resolveAttachmentKind(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'a.xlsx',
      ),
    ).toBe('excel');
    expect(resolveAttachmentKind('image/png', 'a.png')).toBe('image');
    expect(resolveAttachmentKind('application/octet-stream', 'a.dwg')).toBe('other');
  });

  it('resolves openDocument fileType', () => {
    expect(resolveOpenDocumentFileType('a.pdf', '')).toBe('pdf');
    expect(resolveOpenDocumentFileType('a.xlsx', '')).toBe('xlsx');
    expect(resolveOpenDocumentFileType('a.dwg', '')).toBeNull();
  });

  it('formats unpreviewable message', () => {
    expect(formatUnpreviewableMessage('x.dwg')).toBe('.dwg 文件类型无法预览');
  });
});
