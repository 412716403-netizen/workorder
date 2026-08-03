import { Prisma } from '@prisma/client';
import type { TenantPrismaClient } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  DEV_STAGE_FILE_VALUE_HEAD_LEN,
  stubDevStageFileValueFromHead,
} from '../../../shared/devStageFileValue.js';
import { devStyleInclude, mapDevStyleRow } from './dev-styles.mapper.js';

/**
 * 详情装载：样品字段 value 按类型轻量合并。
 * file 只取 LEFT(value) 生成 deferred stub（保留文件名头），避免把 data URL 读进 Node。
 */
export async function loadMappedDevStyle(db: TenantPrismaClient, id: string) {
  const row = await db.devStyle.findUnique({ where: { id }, include: devStyleInclude });
  if (!row) throw new AppError(404, '款式不存在');

  const fieldIds = row.samples.flatMap((s) => s.stages.flatMap((st) => st.fields.map((f) => f.id)));
  const valueById = new Map<string, string>();
  if (fieldIds.length > 0) {
    const headLen = DEV_STAGE_FILE_VALUE_HEAD_LEN;
    const valueRows = await db.$queryRaw<Array<{ id: string; type: string; value: string | null }>>`
      SELECT f.id, f.type,
        CASE
          WHEN f.type = 'file' THEN LEFT(f.value, CAST(${headLen} AS INTEGER))
          ELSE f.value
        END AS value
      FROM dev_stage_fields f
      INNER JOIN dev_stages st ON st.id = f.stage_id
      INNER JOIN dev_samples sa ON sa.id = st.sample_id
      WHERE sa.style_id = ${id}
        AND f.id IN (${Prisma.join(fieldIds)})
    `;
    for (const vr of valueRows) {
      if (vr.type === 'file') {
        valueById.set(vr.id, stubDevStageFileValueFromHead(vr.value ?? ''));
      } else {
        valueById.set(vr.id, vr.value ?? '');
      }
    }
  }

  const withValues = {
    ...row,
    samples: row.samples.map((s) => ({
      ...s,
      stages: s.stages.map((st) => ({
        ...st,
        fields: st.fields.map((f) => ({
          ...f,
          value: valueById.get(f.id) ?? '',
        })),
        attachments: st.attachments.map((a) => ({ ...a, fileUrl: '' })),
      })),
    })),
  };

  return mapDevStyleRow(withValues);
}
