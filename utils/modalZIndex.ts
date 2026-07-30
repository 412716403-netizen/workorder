/**
 * 叠层弹窗的 z-index 工具。
 *
 * 宿主弹窗层级用 Tailwind 类（`z-[12100]` 等）传递，但派生层级只能走内联 style：
 * 动态拼出的 `z-[12110]` 不在源码里，Tailwind JIT 扫不到，类名不会生成，
 * 子层会落在父层后面，看起来像「弹窗没打开」。
 */

/** 从 `z-[N]` 解析出数字，解析不出时返回 fallback */
export function parseModalZIndex(zIndexClass: string | undefined, fallback: number): number {
  const m = /^z-\[(\d+)\]$/.exec((zIndexClass ?? '').trim());
  return m ? Number(m[1]) : fallback;
}
