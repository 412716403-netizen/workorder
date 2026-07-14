/**
 * 编辑采购订单等「整单替换」场景：复用原 PsiRecord.id，
 * 避免采购入库单等仍用 sourceLineId 指向旧行 id 时关联断裂。
 */

export type PsiLineIdCandidate = {
  id: string;
  type?: string | null;
  variantId?: string | null;
};

/**
 * 从 `sourceRecordIds` 中按变体匹配并占用一条原记录 id；无匹配则返回 fallbackId。
 * `usedIds` 用于同一保存批次内避免同一旧 id 被多行复用。
 */
export function resolvePreservedPsiLineRecordId(opts: {
  type: string;
  sourceRecordIds: string[] | undefined;
  variantId: string | undefined;
  records: PsiLineIdCandidate[];
  usedIds: Set<string>;
  fallbackId: string;
}): string {
  const ids = opts.sourceRecordIds?.filter(Boolean);
  if (!ids?.length) return opts.fallbackId;
  const idSet = new Set(ids);
  const candidate = opts.records.find(
    (r) =>
      r.type === opts.type &&
      idSet.has(r.id) &&
      !opts.usedIds.has(r.id) &&
      (opts.variantId ? r.variantId === opts.variantId : !r.variantId),
  );
  if (!candidate) return opts.fallbackId;
  opts.usedIds.add(candidate.id);
  return candidate.id;
}
