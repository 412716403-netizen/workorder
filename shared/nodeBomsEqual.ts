/**
 * 比较两份工序 → BOM id 映射是否语义相同（忽略 key 顺序与空串）。
 */
export function nodeBomsMapsEqual(
  a: unknown,
  b: unknown,
): boolean {
  const norm = (raw: unknown): Record<string, string> => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const key = String(k).trim();
      const val = v == null ? '' : String(v).trim();
      if (!key || !val) continue;
      out[key] = val;
    }
    return out;
  };
  const left = norm(a);
  const right = norm(b);
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (let i = 0; i < leftKeys.length; i++) {
    if (leftKeys[i] !== rightKeys[i]) return false;
    const k = leftKeys[i]!;
    if (left[k] !== right[k]) return false;
  }
  return true;
}
