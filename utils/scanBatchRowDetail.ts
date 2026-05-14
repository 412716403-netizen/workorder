import type { ScanItemCodeResult, ScanVirtualBatchResult } from '../types';

/** 批量扫码弹窗列表行展示（产品 / 颜色 / 尺码 / 数量） */
export interface ScanBatchRowDetail {
  kindLabel: string;
  productName: string;
  colorName: string;
  sizeName: string;
  quantity: number;
  /** 颜色尺码皆空但有 variantLabel 时展示 */
  specNote?: string | null;
}

function deriveColorSizeSpec(res: {
  colorName?: string | null;
  sizeName?: string | null;
  variantLabel?: string | null;
}): { colorName: string; sizeName: string; specNote: string | null } {
  const c = (res.colorName ?? '').trim();
  const s = (res.sizeName ?? '').trim();
  const v = (res.variantLabel ?? '').trim();
  if (c || s) {
    return { colorName: c || '—', sizeName: s || '—', specNote: null };
  }
  if (v) {
    return { colorName: '—', sizeName: '—', specNote: v };
  }
  return { colorName: '—', sizeName: '—', specNote: null };
}

export function scanItemResultToRowDetail(res: ScanItemCodeResult): ScanBatchRowDetail {
  const { colorName, sizeName, specNote } = deriveColorSizeSpec(res);
  return {
    kindLabel: '单品',
    productName: (res.productName ?? '').trim() || (res.sku ?? '').trim() || '—',
    colorName,
    sizeName,
    quantity: 1,
    specNote,
  };
}

export function scanVirtualBatchResultToRowDetail(res: ScanVirtualBatchResult): ScanBatchRowDetail {
  const { colorName, sizeName, specNote } = deriveColorSizeSpec(res);
  return {
    kindLabel: '批次',
    productName: (res.productName ?? '').trim() || (res.sku ?? '').trim() || '—',
    colorName,
    sizeName,
    quantity: Math.max(0, Math.floor(Number(res.quantity ?? 0))),
    specNote,
  };
}
