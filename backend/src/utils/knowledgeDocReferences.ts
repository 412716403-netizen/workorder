import type { TenantPrismaClient } from '../lib/prisma.js';
import type { KnowledgeDocumentReferencesResponse } from '../../../shared/types.js';

const DOC_ID_SAFE = /^[a-zA-Z0-9_-]+$/;

function assertSafeDocId(docId: string): void {
  if (!DOC_ID_SAFE.test(docId)) {
    throw new Error('invalid doc id');
  }
}

function jsonRefPattern(docId: string): string {
  return `%"id":"${docId}"%`;
}

export async function findKnowledgeDocumentReferences(
  db: TenantPrismaClient,
  docId: string,
): Promise<KnowledgeDocumentReferencesResponse> {
  assertSafeDocId(docId);
  const pattern = jsonRefPattern(docId);

  const [products, devStyles] = await Promise.all([
    db.$queryRaw<Array<{ id: string; name: string; sku: string }>>`
      SELECT id, name, sku FROM products
      WHERE category_custom_data::text LIKE ${pattern}
         OR route_report_display_values::text LIKE ${pattern}
      LIMIT 20
    `,
    db.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT id, name FROM dev_styles
      WHERE category_custom_data::text LIKE ${pattern}
      LIMIT 20
    `,
  ]);

  return { products, devStyles };
}

export function formatKnowledgeDocumentReferencesMessage(
  refs: KnowledgeDocumentReferencesResponse,
): string {
  const parts: string[] = [];
  if (refs.products.length > 0) {
    const names = refs.products.map(p => `${p.name}(${p.sku})`).join('、');
    parts.push(`产品：${names}`);
  }
  if (refs.devStyles.length > 0) {
    const names = refs.devStyles.map(s => s.name).join('、');
    parts.push(`开发款：${names}`);
  }
  return parts.length > 0 ? parts.join('；') : '';
}

export function hasKnowledgeDocumentReferences(refs: KnowledgeDocumentReferencesResponse): boolean {
  return refs.products.length > 0 || refs.devStyles.length > 0;
}
