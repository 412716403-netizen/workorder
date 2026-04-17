/**
 * schema 驱动 FormConfig Modal 使用的 path 读写工具。
 *
 * path 形如 `'a.b.c'`；只处理普通对象（不处理数组索引），能满足 *FormSettings 中
 * 所有现存嵌套场景（orderCenterPrint.orderDetail、reworkCenterPrint.defectTreatmentFlowDetail 等）。
 *
 * 刻意不引入 lodash 依赖，保持实现单一小巧。
 */

export function getByPath<T = unknown>(root: unknown, path: string): T | undefined {
  if (!path) return root as T;
  const keys = path.split('.');
  let cur: unknown = root;
  for (const k of keys) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur as T;
}

/**
 * 不可变地把 `value` 写入 `root[path]`，沿途复制所有父对象（对象类型，非数组）。
 * 若 `value === undefined`，则从末级对象中删除对应 key。
 */
export function setByPath<T>(root: T, path: string, value: unknown): T {
  if (!path) return value as T;
  const keys = path.split('.');
  const clone = (obj: unknown): Record<string, unknown> => ({
    ...((obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {}) as Record<string, unknown>),
  });
  const next = clone(root);
  let cur: Record<string, unknown> = next;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    cur[k] = clone(cur[k]);
    cur = cur[k] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  if (value === undefined) {
    delete cur[last];
  } else {
    cur[last] = value;
  }
  return next as T;
}
