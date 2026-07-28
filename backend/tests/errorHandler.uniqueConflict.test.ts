import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { errorHandler } from '../src/middleware/errorHandler.js';

function runErrorHandler(err: Error): { status?: number; error?: string } {
  const captured: { status?: number; error?: string } = {};
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: { error?: string }) {
      captured.error = body.error;
      return this;
    },
  };
  errorHandler(err, {} as never, res as never, (() => undefined) as never);
  return captured;
}

/** meta.target 是数据库列名数组，meta.modelName 是 Prisma 模型名（与运行时实测一致） */
function uniqueConflict(modelName: string, target: string[]): Error {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { modelName, target },
  });
}

describe('errorHandler P2002 唯一冲突文案', () => {
  it('产品编号冲突映射为产品文案', () => {
    const r = runErrorHandler(uniqueConflict('Product', ['tenant_id', 'name']));
    expect(r.status).toBe(409);
    expect(r.error).toBe('产品编号已存在，请更换后再试');
  });

  it('同为 tenant_id+name 的开发节点模板不会误报成产品编号', () => {
    const r = runErrorHandler(uniqueConflict('DevStageTemplate', ['tenant_id', 'name']));
    expect(r.error).toBe('开发节点名称已存在，请更换后再试');
  });

  it('用户名冲突不会因列名含 name 而误报成产品编号', () => {
    const r = runErrorHandler(uniqueConflict('User', ['username']));
    expect(r.error).toBe('用户名已被占用，请更换后再试');
  });

  it('协同产品映射冲突不会因列名含 sku 而误报成产品名称冲突', () => {
    const r = runErrorHandler(
      uniqueConflict('CollaborationProductMap', ['collaboration_id', 'sender_sku']),
    );
    expect(r.error).toBe('该协同产品映射已存在：同一协同关系下，同一来源产品名称只能映射一条');
  });

  it('字典项冲突按同类型重名提示', () => {
    const r = runErrorHandler(uniqueConflict('DictionaryItem', ['tenant_id', 'type', 'name']));
    expect(r.error).toBe('该名称在同类型字典项中已存在，请更换后再试');
  });

  it('未收录的约束走兜底文案并带出冲突列名', () => {
    const r = runErrorHandler(uniqueConflict('ItemCode', ['tenant_id', 'scan_token']));
    expect(r.status).toBe(409);
    expect(r.error).toBe('数据重复，违反唯一约束（冲突字段：tenant_id、scan_token）');
  });

  it('缺少 target 时退回无字段名的兜底文案', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const r = runErrorHandler(err);
    expect(r.error).toBe('数据重复，违反唯一约束');
  });
});
