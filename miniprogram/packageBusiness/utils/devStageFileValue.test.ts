import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  hasDevStageFileDeferred,
  parseDevStageFileItems,
  serializeDevStageFileItems,
} = require('./devStageFileValue.js');

describe('mini devStageFileValue', () => {
  it('parses web names header and payload', () => {
    const raw =
      '/*devStageFiles:["款式图.png"]*/'
      + '[{"name":"款式图.png","url":"data:image/png;base64,abc"}]';
    expect(parseDevStageFileItems(raw)).toEqual([
      { url: 'data:image/png;base64,abc', name: '款式图.png' },
    ]);
  });

  it('parses deferred detail stubs', () => {
    const raw = '[{"name":"报告.pdf","deferred":true}]';
    expect(parseDevStageFileItems(raw)).toEqual([
      { url: '', name: '报告.pdf', deferred: true },
    ]);
    expect(hasDevStageFileDeferred(raw)).toBe(true);
  });

  it('serializes in the shared header format', () => {
    const raw = serializeDevStageFileItems([
      { url: 'data:application/pdf;base64,abc', name: '报告.pdf' },
    ]);
    expect(raw.startsWith('/*devStageFiles:["报告.pdf"]*/')).toBe(true);
    expect(parseDevStageFileItems(raw)).toEqual([
      { url: 'data:application/pdf;base64,abc', name: '报告.pdf' },
    ]);
  });
});
