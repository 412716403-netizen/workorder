import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  resolveDocViewScope,
  canViewDocList,
  hasDocViewPermission,
  hasShortcutPerm,
} = {
  ...require('./permissions.js'),
  ...require('./accessControl.js'),
} as {
  resolveDocViewScope: (perms: string[] | null | undefined, base: string) => 'all' | 'own' | 'none';
  canViewDocList: (perms: string[] | null | undefined, base: string) => boolean;
  hasDocViewPermission: (perms: string[], viewPerm: string) => boolean;
  hasShortcutPerm: (perms: string[], perm: string) => boolean;
};

describe('小程序单据 view_own 入口对齐', () => {
  it('resolveDocViewScope：view / view_own / none', () => {
    expect(resolveDocViewScope(['psi:sales_order:view'], 'psi:sales_order')).toBe('all');
    expect(resolveDocViewScope(['psi:sales_order:view_own'], 'psi:sales_order')).toBe('own');
    expect(resolveDocViewScope(['psi:purchase_order:view'], 'psi:sales_order')).toBe('none');
    expect(resolveDocViewScope(['psi'], 'psi:sales_order')).toBe('all');
  });

  it('canViewDocList / hasDocViewPermission：view_own 可进入口', () => {
    expect(canViewDocList(['finance:receipt:view_own'], 'finance:receipt')).toBe(true);
    expect(hasDocViewPermission(['psi:sales_bill:view_own'], 'psi:sales_bill:view')).toBe(true);
    expect(hasDocViewPermission(['psi:sales_bill:create'], 'psi:sales_bill:view')).toBe(false);
  });

  it('hasShortcutPerm：菜单过滤兼容 view_own', () => {
    expect(hasShortcutPerm(['psi:sales_order:view_own'], 'psi:sales_order:view')).toBe(true);
    expect(hasShortcutPerm(['finance:payment:view_own'], 'finance:payment:view')).toBe(true);
    expect(hasShortcutPerm(['finance:payment:create'], 'finance:payment:view')).toBe(false);
    expect(hasShortcutPerm(['finance:reconciliation:allow'], 'finance:reconciliation:allow')).toBe(true);
  });
});
