import { describe, expect, it } from 'vitest';
import {
  AMOUNT_PERMISSION_KEYS,
  COLLABORATION_PERMISSION_KEYS,
  canViewAmount,
  canViewAmountViaHasPerm,
  canViewCollaborationList,
  hasCollaborationModuleAccess,
} from './canViewAmount';

describe('canViewAmount', () => {
  it('owner/admin 始终可见', () => {
    expect(canViewAmount('owner', [], AMOUNT_PERMISSION_KEYS.PSI_PURCHASE_ORDER)).toBe(true);
    expect(canViewAmount('admin', ['psi:purchase_order:view'], AMOUNT_PERMISSION_KEYS.PSI_PURCHASE_ORDER)).toBe(true);
  });

  it('未配置权限列表时向后兼容为可见', () => {
    expect(canViewAmount('member', undefined, AMOUNT_PERMISSION_KEYS.PSI_PURCHASE_ORDER)).toBe(true);
    expect(canViewAmount('member', [], AMOUNT_PERMISSION_KEYS.PSI_PURCHASE_ORDER)).toBe(true);
  });

  it('裸模块键且无细粒度子键时可见', () => {
    expect(canViewAmount('member', ['psi', 'price_amount'], AMOUNT_PERMISSION_KEYS.PSI_PURCHASE_ORDER)).toBe(true);
  });

  it('细粒度角色需精确命中 amount 键', () => {
    const perms = ['psi:purchase_order:view', 'psi:purchase_order:create'];
    expect(canViewAmount('member', perms, AMOUNT_PERMISSION_KEYS.PSI_PURCHASE_ORDER)).toBe(false);
    expect(
      canViewAmount('member', [...perms, AMOUNT_PERMISSION_KEYS.PSI_PURCHASE_ORDER], AMOUNT_PERMISSION_KEYS.PSI_PURCHASE_ORDER),
    ).toBe(true);
  });

  it('canViewAmountViaHasPerm 委托 hasPerm', () => {
    const hasPerm = (key: string) => key === AMOUNT_PERMISSION_KEYS.OUTSOURCE;
    expect(canViewAmountViaHasPerm(hasPerm, AMOUNT_PERMISSION_KEYS.OUTSOURCE)).toBe(true);
    expect(canViewAmountViaHasPerm(hasPerm, AMOUNT_PERMISSION_KEYS.COLLABORATION)).toBe(false);
  });

  it('未勾选 price_amount 模块且无 amount 细粒度键时不可见', () => {
    expect(canViewAmount('member', ['psi'], AMOUNT_PERMISSION_KEYS.PSI_PURCHASE_ORDER)).toBe(false);
    expect(canViewAmount('member', ['production'], AMOUNT_PERMISSION_KEYS.OUTSOURCE)).toBe(false);
  });

  it('勾选 price_amount 裸模块键且无细粒度时各域金额可见', () => {
    expect(canViewAmount('member', ['price_amount'], AMOUNT_PERMISSION_KEYS.PSI_PURCHASE_ORDER)).toBe(true);
    expect(canViewAmount('member', ['price_amount'], AMOUNT_PERMISSION_KEYS.OUTSOURCE)).toBe(true);
  });

  it('历史角色仅有 amount 细粒度键时仍可见（兼容）', () => {
    expect(canViewAmount('member', ['psi:purchase_order:amount'], AMOUNT_PERMISSION_KEYS.PSI_PURCHASE_ORDER)).toBe(true);
  });
});

describe('hasCollaborationModuleAccess / canViewCollaborationList', () => {
  it('侧栏须勾选裸模块键 collaboration', () => {
    expect(hasCollaborationModuleAccess('member', ['collaboration'])).toBe(true);
    expect(hasCollaborationModuleAccess('member', ['collaboration:list:allow'])).toBe(false);
    expect(hasCollaborationModuleAccess('member', ['collaboration:amount:allow'])).toBe(false);
  });

  it('列表：裸模块无细粒度时放行；细粒度须命中 list', () => {
    expect(canViewCollaborationList('member', ['collaboration'])).toBe(true);
    expect(canViewCollaborationList('member', ['collaboration', COLLABORATION_PERMISSION_KEYS.LIST])).toBe(true);
    expect(canViewCollaborationList('member', ['collaboration', COLLABORATION_PERMISSION_KEYS.AMOUNT])).toBe(false);
    expect(
      canViewCollaborationList('member', ['collaboration', COLLABORATION_PERMISSION_KEYS.LIST, COLLABORATION_PERMISSION_KEYS.AMOUNT]),
    ).toBe(true);
  });

  it('未勾选模块时即使有细粒度也不可访问列表', () => {
    expect(canViewCollaborationList('member', [COLLABORATION_PERMISSION_KEYS.LIST])).toBe(false);
  });
});
