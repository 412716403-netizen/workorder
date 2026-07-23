/**
 * Phase 3.H：为存量产品回填 imageThumb（幂等，可重跑）。
 *
 * 用法（在 backend 目录）:
 *   npm run db:backfill-product-thumbs
 *   npm run db:backfill-product-thumbs -- --force   # 已有 thumb 也强制重算
 *   npm run db:backfill-product-thumbs -- --force --rewrite-url
 *     # 同时把 imageUrl 黑底/透明抠图归一为白底 JPEG（点开大图也白底）
 *
 * 仅处理有 imageUrl 且（默认）无 imageThumb 的记录；http(s) 外链直接复用为 thumb。
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { buildImageThumb, normalizeProductImageDataUrl } from '../src/lib/imageThumb.js';

const prisma = new PrismaClient();
const BATCH = 50;
const force = process.argv.includes('--force');
const rewriteUrl = process.argv.includes('--rewrite-url');

async function main() {
  const where = force
    ? { imageUrl: { not: null } }
    : {
        imageUrl: { not: null },
        OR: [{ imageThumb: null }, { imageThumb: '' }],
      };

  const total = await prisma.product.count({ where });
  console.log(
    `[backfill-product-thumbs] candidates=${total} force=${force} rewriteUrl=${rewriteUrl}`,
  );

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let cursor: string | undefined;

  while (processed < total) {
    const rows = await prisma.product.findMany({
      where,
      select: { id: true, imageUrl: true, imageThumb: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      processed += 1;
      cursor = row.id;
      const url = (row.imageUrl ?? '').trim();
      if (!url) {
        skipped += 1;
        continue;
      }
      if (!force && (row.imageThumb ?? '').trim()) {
        skipped += 1;
        continue;
      }
      try {
        let nextUrl = url;
        if (rewriteUrl && url.startsWith('data:')) {
          const normalized = await normalizeProductImageDataUrl(url, {
            replaceBlackBackdrop: true,
          });
          if (normalized) nextUrl = normalized;
        }
        const thumb = await buildImageThumb(nextUrl, { replaceBlackBackdrop: !rewriteUrl });
        await prisma.product.update({
          where: { id: row.id },
          data: {
            imageThumb: thumb,
            ...(rewriteUrl && nextUrl !== url ? { imageUrl: nextUrl } : {}),
          },
        });
        updated += 1;
      } catch (err) {
        failed += 1;
        console.error(`[backfill-product-thumbs] fail id=${row.id}`, err);
      }
    }
    console.log(
      `[backfill-product-thumbs] progress ${processed}/${total} updated=${updated} skipped=${skipped} failed=${failed}`,
    );
  }

  console.log(`[backfill-product-thumbs] done updated=${updated} skipped=${skipped} failed=${failed}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
