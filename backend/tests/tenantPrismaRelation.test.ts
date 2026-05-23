/**
 * lib/prisma.ts 的「关系继承租户」纯函数行为单测。
 *
 * 这套测试只覆盖 where 注入逻辑（pure function），不打 Prisma：
 * 1. buildRelationTenantWhere：把关系链 + tenantId 转成嵌套 where 形状。
 * 2. injectRelationTenantWhere：把租户关系过滤合进 args.where（用 AND 包，不浅合并）。
 *
 * 真实的 hook 串联（findMany / findUnique / update / deleteMany 等）依赖 Prisma 扩展
 * 实例，不在此处 mock。改动 lib/prisma.ts 时如果新增了模型路径，请同时在 EXPECTED_PATHS
 * 里加一条断言，避免静默漏挂。
 */
import { describe, it, expect } from 'vitest';
import {
  buildRelationTenantWhere,
  injectRelationTenantWhere,
} from '../src/lib/prisma.js';

const TENANT = 'tenant-A';

describe('buildRelationTenantWhere', () => {
  it('单跳关系：Milestone → productionOrder.tenantId', () => {
    expect(buildRelationTenantWhere(['productionOrder'], TENANT)).toEqual({
      productionOrder: { tenantId: TENANT },
    });
  });

  it('两跳关系：MilestoneReport → milestone → productionOrder.tenantId', () => {
    expect(
      buildRelationTenantWhere(['milestone', 'productionOrder'], TENANT),
    ).toEqual({
      milestone: { productionOrder: { tenantId: TENANT } },
    });
  });

  it('单跳关系：ProductProgressReport → progress.tenantId', () => {
    expect(buildRelationTenantWhere(['progress'], TENANT)).toEqual({
      progress: { tenantId: TENANT },
    });
  });

  it('每次调用返回新对象（避免在多 hook 之间共享引用导致互相污染）', () => {
    const a = buildRelationTenantWhere(['progress'], TENANT);
    const b = buildRelationTenantWhere(['progress'], TENANT);
    expect(a).not.toBe(b);
    expect(a.progress).not.toBe(b.progress);
  });
});

describe('injectRelationTenantWhere', () => {
  it('args.where 为空：直接写入嵌套租户过滤', () => {
    const args: any = {};
    injectRelationTenantWhere(args, TENANT, ['progress']);
    expect(args.where).toEqual({ progress: { tenantId: TENANT } });
  });

  it('args.where 已存在普通字段：用 AND 包，不浅合并 / 不覆盖', () => {
    const args: any = { where: { timestamp: { gte: new Date('2026-05-23') } } };
    injectRelationTenantWhere(args, TENANT, ['milestone', 'productionOrder']);
    expect(args.where).toEqual({
      AND: [
        { timestamp: { gte: new Date('2026-05-23') } },
        { milestone: { productionOrder: { tenantId: TENANT } } },
      ],
    });
  });

  it('args.where 已经在同一关系上有过滤：靠 AND 与租户过滤共存（Prisma 自身扁平化）', () => {
    const args: any = {
      where: { milestone: { productionOrderId: { in: ['o1', 'o2'] } } },
    };
    injectRelationTenantWhere(args, TENANT, ['milestone', 'productionOrder']);
    expect(args.where).toEqual({
      AND: [
        { milestone: { productionOrderId: { in: ['o1', 'o2'] } } },
        { milestone: { productionOrder: { tenantId: TENANT } } },
      ],
    });
  });

  it('args.where 为带 OR/NOT 的复杂表达：仍然用 AND 整体包一层，原表达不变', () => {
    const original = {
      OR: [{ operator: '阿华' }, { operator: '横机张三' }],
    };
    const args: any = { where: original };
    injectRelationTenantWhere(args, TENANT, ['progress']);
    expect(args.where).toEqual({
      AND: [original, { progress: { tenantId: TENANT } }],
    });
    // 不应原地改写调用方 where 对象
    expect(original).toEqual({
      OR: [{ operator: '阿华' }, { operator: '横机张三' }],
    });
  });
});
