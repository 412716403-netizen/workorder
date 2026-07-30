import type {
  DevMaterialDocGroup,
  DevMaterialDocUpdateRequest,
  DevMaterialRecordLine,
} from '../types';
import { hydrateEntryDatetimeLocal, entryDatetimeLocalToTimestamp } from './docEntryTime';

export interface DevMaterialDocEditLine {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  warehouseId: string;
  batchNo: string;
}

export interface DevMaterialDocEditDraft {
  docNo: string;
  type: 'STOCK_OUT' | 'STOCK_RETURN';
  entryTimestamp: string;
  operator: string;
  lines: DevMaterialDocEditLine[];
}

function lineFromRecord(line: DevMaterialRecordLine): DevMaterialDocEditLine {
  return {
    id: line.id,
    productId: line.productId,
    productName: line.productName,
    productSku: line.productSku,
    quantity: line.quantity,
    warehouseId: String(line.warehouseId ?? '').trim(),
    batchNo: line.batchNo ?? '',
  };
}

export function buildDocEditDraft(doc: DevMaterialDocGroup): DevMaterialDocEditDraft {
  return {
    docNo: doc.docNo,
    type: doc.type,
    entryTimestamp: hydrateEntryDatetimeLocal(doc.timestamp),
    operator: doc.operator ?? '',
    lines: doc.lines.map(lineFromRecord),
  };
}

export function removeDraftLine(
  draft: DevMaterialDocEditDraft,
  lineId: string,
): DevMaterialDocEditDraft {
  return {
    ...draft,
    lines: draft.lines.filter((l) => l.id !== lineId),
  };
}

export function updateDraftLine(
  draft: DevMaterialDocEditDraft,
  lineId: string,
  patch: Partial<Pick<DevMaterialDocEditLine, 'quantity' | 'warehouseId' | 'batchNo'>>,
): DevMaterialDocEditDraft {
  return {
    ...draft,
    lines: draft.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)),
  };
}

export function buildDocUpdateBody(
  draft: DevMaterialDocEditDraft,
  operator: string,
  timestampLocal?: string,
): DevMaterialDocUpdateRequest {
  const ts = timestampLocal ?? draft.entryTimestamp;
  return {
    lines: draft.lines.map((l) => ({
      id: l.id,
      quantity: l.quantity,
      warehouseId: l.warehouseId,
      batchNo: l.batchNo.trim() ? l.batchNo : null,
    })),
    operator: operator.trim() || undefined,
    timestamp: entryDatetimeLocalToTimestamp(ts),
  };
}

export function validateDocEditDraft(
  draft: DevMaterialDocEditDraft,
  batchManagedIds: Set<string>,
): string | null {
  if (draft.lines.length === 0) {
    return '至少保留一条明细；清空请删除整张单据';
  }
  for (let i = 0; i < draft.lines.length; i++) {
    const line = draft.lines[i];
    if (!line.warehouseId.trim()) {
      return `第 ${i + 1} 行请选择仓库`;
    }
    if (!(line.quantity > 0)) {
      return `第 ${i + 1} 行数量须大于 0`;
    }
    if (batchManagedIds.has(line.productId) && !line.batchNo.trim()) {
      return `第 ${i + 1} 行须选择批次`;
    }
  }
  return null;
}
