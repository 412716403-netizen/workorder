/**
 * 扫码会话「批次 ⇄ 单品」重叠判定（纯函数；ScanBatchSessionModal 使用）。
 *
 * 在同一次批量扫码会话内：
 *   - 扫到「整批」：若该批次已被扫入（无论以批次码还是其包含的某个单品码进入会话），
 *     视为重叠 — 否则会造成「整批数量」与「批内单个件」的重复计入；
 *   - 扫到「单品」：若该单品自身已在会话；或其父批次曾以「批次码」整批进入会话，
 *     视为重叠 — 但允许同一父批次下多个不同单品分别扫入（典型抽件场景）。
 *
 * 注意：仅纠正"同一次会话"的拼接错误；持久化层的去重由
 * `backend/src/services/scanValidate.service.ts` 兜底。
 */

export type ScanSessionPayloadKind = 'BATCH' | 'ITEM' | 'UNKNOWN';

export interface ScanSessionState {
  /** 会话内已加入的单品 ID 集合 */
  itemCodeIds: ReadonlySet<string>;
  /** 会话内以「批次码」整批扫入的批次 ID 集合 */
  batchScannedIds: ReadonlySet<string>;
  /** 会话内由「单品码」带出的父批次 ID 集合（不含 batchScannedIds） */
  itemParentBatchIds: ReadonlySet<string>;
}

export interface ScanSessionCandidate {
  kind: ScanSessionPayloadKind;
  itemCodeId?: string | null;
  virtualBatchId?: string | null;
}

export type ScanSessionOverlapReason =
  | 'BATCH_ALREADY_SCANNED'
  | 'BATCH_CONTAINS_SCANNED_ITEM'
  | 'ITEM_PARENT_BATCH_SCANNED'
  | 'ITEM_ALREADY_SCANNED';

export interface ScanSessionOverlapResult {
  overlaps: boolean;
  reason?: ScanSessionOverlapReason;
  message?: string;
}

const REASON_MESSAGES: Record<ScanSessionOverlapReason, string> = {
  BATCH_ALREADY_SCANNED: '该批次已在列表中，不可重复扫码',
  BATCH_CONTAINS_SCANNED_ITEM: '该批次内的单品已在列表中，不可再扫整批（请勿同时扫批次与其包含的单品）',
  ITEM_PARENT_BATCH_SCANNED: '该单品所在批次已在列表中，不可再单独扫该单品',
  ITEM_ALREADY_SCANNED: '该单品已在列表中，不可重复扫码',
};

export function checkScanSessionOverlap(
  state: ScanSessionState,
  candidate: ScanSessionCandidate,
): ScanSessionOverlapResult {
  const { kind, itemCodeId, virtualBatchId } = candidate;
  if (kind === 'BATCH' && virtualBatchId) {
    if (state.batchScannedIds.has(virtualBatchId)) {
      return overlap('BATCH_ALREADY_SCANNED');
    }
    if (state.itemParentBatchIds.has(virtualBatchId)) {
      return overlap('BATCH_CONTAINS_SCANNED_ITEM');
    }
  }
  if (kind === 'ITEM') {
    if (virtualBatchId && state.batchScannedIds.has(virtualBatchId)) {
      return overlap('ITEM_PARENT_BATCH_SCANNED');
    }
    if (itemCodeId && state.itemCodeIds.has(itemCodeId)) {
      return overlap('ITEM_ALREADY_SCANNED');
    }
  }
  return { overlaps: false };
}

function overlap(reason: ScanSessionOverlapReason): ScanSessionOverlapResult {
  return { overlaps: true, reason, message: REASON_MESSAGES[reason] };
}
