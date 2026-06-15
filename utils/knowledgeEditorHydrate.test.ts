import { describe, expect, it } from 'vitest';
import { shouldApplyRemoteContentHydrate } from './knowledgeEditorHydrate';

describe('shouldApplyRemoteContentHydrate', () => {
  const base = {
    documentSwitched: false,
    remoteContent: '<p>a</p>',
    editorHtml: '<p>b</p>',
    isDirty: false,
    isEditorFocused: false,
  };

  it('切换文档时始终写入', () => {
    expect(shouldApplyRemoteContentHydrate({ ...base, documentSwitched: true })).toBe(true);
  });

  it('正文已一致时跳过', () => {
    expect(
      shouldApplyRemoteContentHydrate({ ...base, remoteContent: '<p>x</p>', editorHtml: '<p>x</p>' }),
    ).toBe(false);
  });

  it('有未保存改动或编辑器聚焦时跳过', () => {
    expect(shouldApplyRemoteContentHydrate({ ...base, isDirty: true })).toBe(false);
    expect(shouldApplyRemoteContentHydrate({ ...base, isEditorFocused: true })).toBe(false);
  });

  it('失焦且无本地改动时写入远端正文', () => {
    expect(shouldApplyRemoteContentHydrate(base)).toBe(true);
  });
});
