import { describe, it, expect } from 'vitest';
import { resolveInsertPopupContentTop } from './EditorInsertHandle';

describe('resolveInsertPopupContentTop', () => {
  it('keeps popup aligned with button when there is room below in the viewport', () => {
    // 按钮在可视区 top=80，滚动了 2000 → 内容绝对 top = 2080
    expect(resolveInsertPopupContentTop(80, 600, 2000, 400)).toBe(2080);
  });

  it('clamps within viewport then adds scrollTop when near the bottom', () => {
    // 按钮在可视区底部，弹窗会溢出 → 可视区内夹到 192，再加 scrollTop
    expect(resolveInsertPopupContentTop(500, 600, 2000, 400)).toBe(2192);
  });

  it('does not pin popup to document top after scrolling (regression)', () => {
    // 旧逻辑把 contentTop=2500 与 clientHeight=600 比较，会错误得到 192
    const top = resolveInsertPopupContentTop(500, 600, 2000, 400);
    expect(top).toBeGreaterThan(2000);
    expect(top).not.toBe(192);
  });
});
