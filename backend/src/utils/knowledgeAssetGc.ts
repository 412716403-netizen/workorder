import type { TenantPrismaClient } from '../lib/prisma.js';

/** 文档正文中是否仍引用该 asset */
export async function isKnowledgeAssetReferenced(
  db: TenantPrismaClient,
  assetId: string,
): Promise<boolean> {
  const pattern = `%/assets/${assetId}%`;
  const rows = await db.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS(
      SELECT 1 FROM knowledge_documents
      WHERE content LIKE ${pattern}
      LIMIT 1
    ) AS exists
  `;
  return rows[0]?.exists === true;
}

/** 删除租户内未被任何文档正文引用的 asset */
export async function gcKnowledgeAssets(
  db: TenantPrismaClient,
  candidateIds: string[],
): Promise<number> {
  const unique = [...new Set(candidateIds.filter(Boolean))];
  if (unique.length === 0) return 0;

  let deleted = 0;
  for (const assetId of unique) {
    const referenced = await isKnowledgeAssetReferenced(db, assetId);
    if (!referenced) {
      await db.knowledgeAsset.deleteMany({ where: { id: assetId } });
      deleted += 1;
    }
  }
  return deleted;
}
