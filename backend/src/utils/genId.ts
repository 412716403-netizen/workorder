import crypto from 'crypto';

export function genId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(4).toString('hex');
  return `${prefix}-${ts}-${rand}`;
}

/**
 * RFC 9562 UUID v7（带连字符）。时间有序，利于 B-tree 主键与分区写入。
 * 仅用于 ItemCode / PlanVirtualBatch 等海量表；其它实体仍用 genId(prefix)。
 */
export function genUuidV7(): string {
  const ms = BigInt(Date.now());
  const rand = crypto.randomBytes(10);
  const b = Buffer.alloc(16);
  b[0] = Number((ms >> 40n) & 0xffn);
  b[1] = Number((ms >> 32n) & 0xffn);
  b[2] = Number((ms >> 24n) & 0xffn);
  b[3] = Number((ms >> 16n) & 0xffn);
  b[4] = Number((ms >> 8n) & 0xffn);
  b[5] = Number(ms & 0xffn);
  b[6] = (rand[0]! & 0x0f) | 0x70;
  b[7] = rand[1]!;
  b[8] = (rand[2]! & 0x3f) | 0x80;
  rand.copy(b, 9, 3, 10);
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
