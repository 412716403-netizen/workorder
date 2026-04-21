import React from 'react';

/** 与协作矩阵、单据矩阵输入右侧辅助说明一致 */
export const variantQtyMatrixHintClass =
  'text-[11px] font-medium tabular-nums leading-none text-slate-400';

export function VariantQtyMatrixHint({ children }: { children: React.ReactNode }) {
  if (children == null || children === false) return null;
  return <span className={variantQtyMatrixHintClass}>{children}</span>;
}
