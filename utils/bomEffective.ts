import type { BOM } from '../types';

/** 是否存在至少一条有效子件（与领料/展示「有 BOM」口径一致） */
export function bomHasConfiguredItems(b: BOM): boolean {
  return (b.items ?? []).some(it => (it.productId ?? '').trim() !== '');
}
