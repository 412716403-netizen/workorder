/**
 * 为存量开发款回填 imageThumb（幂等，可重跑）。
 *
 * 用法（在 backend 目录）:
 *   npm run db:backfill-dev-style-thumbs
 *   npm run db:backfill-dev-style-thumbs -- --force
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { buildImageThumb } from '../src/lib/imageThumb.js';

const prisma = new PrismaClient();
const BATCH = 50;
const force = process.argv.includes('--force');

async function main() {
  const where = force
    ? { imageUrl: { not: null } }
    : {
        imageUrl: { not: null },
        OR: [{ imageThumb: null }, { imageThumb: '' }],
      };

  const total = await prisma.devStyle.count({ where });
  console.log(`[backfill-dev-style-thumbs] candidates=${total} force=${force}`);

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let cursor: string | undefined;

  while (processed < total) {
    const rows = await prisma.devStyle.findMany({
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
        const thumb = await buildImageThumb(url);
        await prisma.devStyle.update({
          where: { id: row.id },
          data: { imageThumb: thumb },
        });
        updated += 1;
      } catch (err) {
        failed += 1;
        console.error(`[backfill-dev-style-thumbs] fail id=${row.id}`, err);
      }
    }
    console.log(
      `[backfill-dev-style-thumbs] progress ${processed}/${total} updated=${updated} skipped=${skipped} failed=${failed}`,
    );
  }

  console.log(`[backfill-dev-style-thumbs] done updated=${updated} skipped=${skipped} failed=${failed}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
