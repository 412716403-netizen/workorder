/** 展示用量：消除浮点误差（如 28.000000000000004 → 28） */
export function formatMaterialQtyDisplay(n: number, maxDecimals = 6): string {
  if (!Number.isFinite(n)) return '0';
  const t = Number(n.toFixed(maxDecimals));
  return String(t);
}
