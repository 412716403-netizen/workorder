import type { ScanItemCodeResult, ScanVirtualBatchResult } from '../types';
import { formatBatchSerialLabel, formatItemCodeSerialLabel } from './serialLabels';

/** 批量扫码弹窗列表行展示（产品 / 颜色 / 尺码 / 数量） */
export interface ScanBatchRowDetail {
  kindLabel: string;
  productName: string;
  /** 扫入码展示编号：批次 PLN47-2、单品 PLN47-2-1 */
  codeLabel?: string | null;
  colorName: string;
  sizeName: string;
  quantity: number;
  /** 颜色尺码皆空但有 variantLabel 时展示 */
  specNote?: string | null;
  /**
   * 扫入码对应的单品/批次 ID（用于 ScanBatchSessionModal 在同一会话中
   * 检测「批次 ⇄ 其包含的单品」重叠，避免重复计入）。
   */
  itemCodeId?: string | null;
  virtualBatchId?: string | null;
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

function itemCodeLabel(res: ScanItemCodeResult): string | null {
  if (res.serialLabel?.trim()) return res.serialLabel.trim();
  const planNumber = (res.planNumber ?? '').trim();
  if (!planNumber || res.serialNo == null) return null;
  return formatItemCodeSerialLabel(planNumber, res.serialNo, {
    batchSequenceNo: res.batchSequenceNo,
    batchPieceNo: res.batchPieceNo,
  });
}

function batchCodeLabel(res: ScanVirtualBatchResult): string | null {
  if (res.serialLabel?.trim()) return res.serialLabel.trim();
  const planNumber = (res.planNumber ?? '').trim();
  if (!planNumber || res.sequenceNo == null) return null;
  return formatBatchSerialLabel(planNumber, res.sequenceNo);
}

export function scanItemResultToRowDetail(res: ScanItemCodeResult): ScanBatchRowDetail {
  const { colorName, sizeName, specNote } = deriveColorSizeSpec(res);
  return {
    kindLabel: '单品',
    productName: (res.productName ?? '').trim() || (res.sku ?? '').trim() || '—',
    codeLabel: itemCodeLabel(res),
    colorName,
    sizeName,
    quantity: 1,
    specNote,
    itemCodeId: res.itemCodeId ?? null,
    virtualBatchId: res.batchId ?? null,
  };
}

export function scanVirtualBatchResultToRowDetail(res: ScanVirtualBatchResult): ScanBatchRowDetail {
  const { colorName, sizeName, specNote } = deriveColorSizeSpec(res);
  return {
    kindLabel: '批次',
    productName: (res.productName ?? '').trim() || (res.sku ?? '').trim() || '—',
    codeLabel: batchCodeLabel(res),
    colorName,
    sizeName,
    quantity: Math.max(0, Math.floor(Number(res.quantity ?? 0))),
    specNote,
    itemCodeId: null,
    virtualBatchId: res.batchId ?? null,
  };
}
