import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import * as api from '../../services/api';
import type { RoleRow } from '../../services/api';
import { toast } from 'sonner';
import {
  ALL_PERMISSIONS,
  SETTINGS_SUB_MODULES,
  DEVELOPMENT_SUB_MODULES,
  KNOWLEDGE_BASE_SUB_MODULES,
  BASIC_SUB_MODULES,
  PRODUCTION_SUB_MODULES,
  PSI_SUB_MODULES,
  FINANCE_SUB_MODULES,
  COLLABORATION_SUB_MODULES,
  ACTION_LABELS,
} from './constants';
import {
  AMOUNT_FINE_GRAINED_PERM_KEYS,
  PRICE_AMOUNT_SUB_MODULES,
} from '../../utils/amountPermissionKeys';

interface RoleEditModalProps {
  editingRole: RoleRow | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function computeInitialPerms(role: RoleRow | null): string[] {
  if (!role) return [];
  const perms = Array.isArray(role.permissions) ? [...role.permissions as string[]] : [];
  if (!perms.includes('settings') && perms.some(p => p.startsWith('settings:'))) {
    perms.push('settings');
  }
  if (!perms.includes('development') && perms.some(p => p.startsWith('development:'))) {
    perms.push('development');
  }
  if (!perms.includes('knowledge_base') && perms.some(p => p.startsWith('knowledge_base:'))) {
    perms.push('knowledge_base');
  }
  if (!perms.includes('basic') && perms.some(p => p.startsWith('basic:'))) {
    perms.push('basic');
  }
  if (!perms.includes('production') && perms.some(p => p.startsWith('production:'))) {
    perms.push('production');
  }
  if (!perms.includes('psi') && perms.some(p => p.startsWith('psi:'))) {
    perms.push('psi');
  }
  if (!perms.includes('finance') && perms.some(p => p.startsWith('finance:'))) {
    perms.push('finance');
  }
  if (!perms.includes('collaboration') && perms.some(p => p.startsWith('collaboration:'))) {
    perms.push('collaboration');
  }
  if (!perms.includes('price_amount') && AMOUNT_FINE_GRAINED_PERM_KEYS.some(k => perms.includes(k))) {
    perms.push('price_amount');
  }
  return perms;
}

function RoleEditModal({ editingRole, onClose, onSaved }: RoleEditModalProps) {
  const [roleName, setRoleName] = useState(editingRole?.name || '');
  const [roleDesc, setRoleDesc] = useState(editingRole?.description || '');
  const [rolePerms, setRolePerms] = useState<string[]>(() => computeInitialPerms(editingRole));

  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [developmentExpanded, setDevelopmentExpanded] = useState(false);
  const [knowledgeBaseExpanded, setKnowledgeBaseExpanded] = useState(false);
  const [basicExpanded, setBasicExpanded] = useState(false);
  const [productionExpanded, setProductionExpanded] = useState(false);
  const [psiExpanded, setPsiExpanded] = useState(false);
  const [financeExpanded, setFinanceExpanded] = useState(false);
  const [collaborationExpanded, setCollaborationExpanded] = useState(false);
  const [priceAmountExpanded, setPriceAmountExpanded] = useState(false);

  const settingsModuleChecked = rolePerms.includes('settings');
  const developmentModuleChecked = rolePerms.includes('development');
  const knowledgeBaseModuleChecked = rolePerms.includes('knowledge_base');
  const basicModuleChecked = rolePerms.includes('basic');
  const productionModuleChecked = rolePerms.includes('production');
  const psiModuleChecked = rolePerms.includes('psi');
  const financeModuleChecked = rolePerms.includes('finance');
  const collaborationModuleChecked = rolePerms.includes('collaboration');
  const priceAmountModuleChecked = rolePerms.includes('price_amount');

  async function handleSaveRole() {
    if (!roleName.trim()) { toast.error('请输入角色名称'); return; }
    let permsToSave = [...rolePerms];
    if (permsToSave.some(p => p.startsWith('settings:'))) {
      permsToSave = permsToSave.filter(p => p !== 'settings');
    }
    if (permsToSave.some(p => p.startsWith('development:'))) {
      permsToSave = permsToSave.filter(p => p !== 'development');
    }
    if (permsToSave.some(p => p.startsWith('knowledge_base:'))) {
      permsToSave = permsToSave.filter(p => p !== 'knowledge_base');
    }
    if (permsToSave.some(p => p.startsWith('basic:'))) {
      permsToSave = permsToSave.filter(p => p !== 'basic');
    }
    if (permsToSave.some(p => p.startsWith('production:'))) {
      permsToSave = permsToSave.filter(p => p !== 'production');
    }
    if (permsToSave.some(p => p.startsWith('psi:'))) {
      permsToSave = permsToSave.filter(p => p !== 'psi');
    }
    if (permsToSave.some(p => p.startsWith('finance:'))) {
      permsToSave = permsToSave.filter(p => p !== 'finance');
    }
    // 协作：保留裸模块键 `collaboration` 作为侧栏入口开关；细粒度 list 另存
    // 单价/金额：保留裸模块键 `price_amount`；各业务 amount 键另存
    try {
      if (editingRole) {
        await api.roles.update(editingRole.id, { name: roleName.trim(), description: roleDesc.trim() || undefined, permissions: permsToSave });
        toast.success('角色已更新');
      } else {
        await api.roles.create({ name: roleName.trim(), description: roleDesc.trim() || undefined, permissions: permsToSave });
        toast.success('角色已创建');
      }
      onClose();
      await onSaved();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  }

  function toggleSettingsPerm(perm: string) {
    setRolePerms(prev => {
      const parts = perm.split(':');
      const mod = `${parts[0]}:${parts[1]}`;
      const action = parts[2];

      if (prev.includes(perm)) {
        if (action === 'view') {
          return prev.filter(p => !p.startsWith(`${mod}:`));
        }
        return prev.filter(p => p !== perm);
      } else {
        const next = [...prev, perm];
        if (action !== 'view') {
          const viewPerm = `${mod}:view`;
          if (!next.includes(viewPerm)) next.push(viewPerm);
        }
        return next;
      }
    });
  }

  function toggleDevelopmentPerm(perm: string) {
    setRolePerms(prev => {
      const parts = perm.split(':');
      const mod = `${parts[0]}:${parts[1]}`;
      const action = parts[2];
      if (prev.includes(perm)) {
        if (action === 'view') return prev.filter(p => !p.startsWith(`${mod}:`));
        return prev.filter(p => p !== perm);
      }
      const next = [...prev, perm];
      if (action !== 'view') {
        const viewPerm = `${mod}:view`;
        if (!next.includes(viewPerm)) next.push(viewPerm);
      }
      return next;
    });
  }

  function toggleDevelopmentAll() {
    const all = DEVELOPMENT_SUB_MODULES.flatMap(sm => sm.actions.map(a => `development:${sm.key}:${a}`));
    const hasAll = all.every(p => rolePerms.includes(p));
    setRolePerms(prev =>
      hasAll ? prev.filter(p => !p.startsWith('development:')) : [...new Set([...prev.filter(p => !p.startsWith('development:')), ...all])],
    );
  }

  function toggleDevelopmentSubModuleAll(smKey: string) {
    const sm = DEVELOPMENT_SUB_MODULES.find(s => s.key === smKey);
    if (!sm) return;
    const perms = sm.actions.map(a => `development:${smKey}:${a}`);
    const hasAll = perms.every(p => rolePerms.includes(p));
    setRolePerms(prev =>
      hasAll ? prev.filter(p => !p.startsWith(`development:${smKey}:`)) : [...prev.filter(p => !p.startsWith(`development:${smKey}:`)), ...perms],
    );
  }

  function toggleKnowledgeBasePerm(perm: string) {
    setRolePerms(prev => {
      const parts = perm.split(':');
      const mod = `${parts[0]}:${parts[1]}`;
      const action = parts[2];
      if (prev.includes(perm)) {
        if (action === 'view') return prev.filter(p => !p.startsWith(`${mod}:`));
        return prev.filter(p => p !== perm);
      }
      const next = [...prev, perm];
      if (action !== 'view') {
        const viewPerm = `${mod}:view`;
        if (!next.includes(viewPerm)) next.push(viewPerm);
      }
      return next;
    });
  }

  function toggleKnowledgeBaseAll() {
    const all = KNOWLEDGE_BASE_SUB_MODULES.flatMap(sm => sm.actions.map(a => `knowledge_base:${sm.key}:${a}`));
    const hasAll = all.every(p => rolePerms.includes(p));
    setRolePerms(prev =>
      hasAll ? prev.filter(p => !p.startsWith('knowledge_base:')) : [...new Set([...prev.filter(p => !p.startsWith('knowledge_base:')), ...all])],
    );
  }

  function toggleKnowledgeBaseSubModuleAll(smKey: string) {
    const sm = KNOWLEDGE_BASE_SUB_MODULES.find(s => s.key === smKey);
    if (!sm) return;
    const perms = sm.actions.map(a => `knowledge_base:${smKey}:${a}`);
    const hasAll = perms.every(p => rolePerms.includes(p));
    setRolePerms(prev =>
      hasAll ? prev.filter(p => !p.startsWith(`knowledge_base:${smKey}:`)) : [...prev.filter(p => !p.startsWith(`knowledge_base:${smKey}:`)), ...perms],
    );
  }

  function toggleBasicPerm(perm: string) {
    setRolePerms(prev => {
      const parts = perm.split(':');
      const mod = `${parts[0]}:${parts[1]}`;
      const action = parts[2];

      if (prev.includes(perm)) {
        if (action === 'view') {
          return prev.filter(p => !p.startsWith(`${mod}:`));
        }
        return prev.filter(p => p !== perm);
      } else {
        const next = [...prev, perm];
        if (action !== 'view') {
          const viewPerm = `${mod}:view`;
          if (!next.includes(viewPerm)) next.push(viewPerm);
        }
        return next;
      }
    });
  }

  function toggleBasicAll() {
    const allBasicPerms = BASIC_SUB_MODULES.flatMap(sm =>
      sm.actions.map(a => `basic:${sm.key}:${a}`)
    );
    const hasAll = allBasicPerms.every(p => rolePerms.includes(p));
    setRolePerms(prev =>
      hasAll ? prev.filter(p => !p.startsWith('basic:')) : [...new Set([...prev.filter(p => !p.startsWith('basic:')), ...allBasicPerms])]
    );
  }

  function toggleBasicSubModuleAll(smKey: string) {
    const sm = BASIC_SUB_MODULES.find(s => s.key === smKey);
    if (!sm) return;
    const perms = sm.actions.map(a => `basic:${smKey}:${a}`);
    const hasAll = perms.every(p => rolePerms.includes(p));
    setRolePerms(prev =>
      hasAll ? prev.filter(p => !p.startsWith(`basic:${smKey}:`)) : [...prev.filter(p => !p.startsWith(`basic:${smKey}:`)), ...perms]
    );
  }

  function toggleSettingsAll() {
    const allSettingsPerms = SETTINGS_SUB_MODULES.flatMap(sm =>
      sm.actions.map(a => `settings:${sm.key}:${a}`)
    );
    const hasAll = allSettingsPerms.every(p => rolePerms.includes(p));
    setRolePerms(prev =>
      hasAll ? prev.filter(p => !p.startsWith('settings:')) : [...new Set([...prev.filter(p => !p.startsWith('settings:')), ...allSettingsPerms])]
    );
  }

  function toggleSettingsSubModuleAll(smKey: string) {
    const sm = SETTINGS_SUB_MODULES.find(s => s.key === smKey);
    if (!sm) return;
    const perms = sm.actions.map(a => `settings:${smKey}:${a}`);
    const hasAll = perms.every(p => rolePerms.includes(p));
    setRolePerms(prev =>
      hasAll ? prev.filter(p => !p.startsWith(`settings:${smKey}:`)) : [...prev.filter(p => !p.startsWith(`settings:${smKey}:`)), ...perms]
    );
  }

  function toggleProductionPerm(perm: string) {
    setRolePerms(prev => {
      const parts = perm.split(':');
      const mod = `${parts[0]}:${parts[1]}`;
      const action = parts[2];
      if (prev.includes(perm)) {
        if (action === 'view') {
          return prev.filter(p => !p.startsWith(`${mod}:`));
        }
        return prev.filter(p => p !== perm);
      } else {
        const next = [...prev, perm];
        if (action !== 'view' && action !== 'allow') {
          const viewPerm = `${mod}:view`;
          if (!next.includes(viewPerm)) next.push(viewPerm);
        }
        return next;
      }
    });
  }

  function toggleProductionAll() {
    const allPerms = PRODUCTION_SUB_MODULES.flatMap(sm =>
      sm.actions.map(a => `production:${sm.key}:${a}`)
    );
    const hasAll = allPerms.every(p => rolePerms.includes(p));
    setRolePerms(prev =>
      hasAll ? prev.filter(p => !p.startsWith('production:')) : [...new Set([...prev.filter(p => !p.startsWith('production:')), ...allPerms])]
    );
  }

  function toggleProductionSubModuleAll(smKey: string) {
    const sm = PRODUCTION_SUB_MODULES.find(s => s.key === smKey);
    if (!sm) return;
    const perms = sm.actions.map(a => `production:${smKey}:${a}`);
    const hasAll = perms.every(p => rolePerms.includes(p));
    setRolePerms(prev =>
      hasAll ? prev.filter(p => !p.startsWith(`production:${smKey}:`)) : [...prev.filter(p => !p.startsWith(`production:${smKey}:`)), ...perms]
    );
  }

  function toggleProductionGroupAll(group: string) {
    const groupItems = PRODUCTION_SUB_MODULES.filter(sm => sm.group === group);
    const allPerms = groupItems.flatMap(sm => sm.actions.map(a => `production:${sm.key}:${a}`));
    const hasAll = allPerms.every(p => rolePerms.includes(p));
    setRolePerms(prev => {
      const groupPrefixes = groupItems.map(sm => `production:${sm.key}:`);
      const withoutGroup = prev.filter(p => !groupPrefixes.some(prefix => p.startsWith(prefix)));
      return hasAll ? withoutGroup : [...new Set([...withoutGroup, ...allPerms])];
    });
  }

  function togglePsiPerm(perm: string) {
    setRolePerms(prev => {
      const parts = perm.split(':');
      const mod = `${parts[0]}:${parts[1]}`;
      const action = parts[2];
      if (prev.includes(perm)) {
        if (action === 'view') {
          return prev.filter(p => !p.startsWith(`${mod}:`));
        }
        return prev.filter(p => p !== perm);
      } else {
        const next = [...prev, perm];
        if (action !== 'view' && action !== 'allow') {
          const viewPerm = `${mod}:view`;
          if (!next.includes(viewPerm)) next.push(viewPerm);
        }
        return next;
      }
    });
  }

  function togglePsiAll() {
    const allPerms = PSI_SUB_MODULES.flatMap(sm =>
      sm.actions.map(a => `psi:${sm.key}:${a}`)
    );
    const hasAll = allPerms.every(p => rolePerms.includes(p));
    setRolePerms(prev =>
      hasAll ? prev.filter(p => !p.startsWith('psi:')) : [...new Set([...prev.filter(p => !p.startsWith('psi:')), ...allPerms])]
    );
  }

  function togglePsiSubModuleAll(smKey: string) {
    const sm = PSI_SUB_MODULES.find(s => s.key === smKey);
    if (!sm) return;
    const perms = sm.actions.map(a => `psi:${smKey}:${a}`);
    const hasAll = perms.every(p => rolePerms.includes(p));
    setRolePerms(prev =>
      hasAll ? prev.filter(p => !p.startsWith(`psi:${smKey}:`)) : [...prev.filter(p => !p.startsWith(`psi:${smKey}:`)), ...perms]
    );
  }

  function togglePsiGroupAll(group: string) {
    const groupItems = PSI_SUB_MODULES.filter(sm => sm.group === group);
    const allPerms = groupItems.flatMap(sm => sm.actions.map(a => `psi:${sm.key}:${a}`));
    const hasAll = allPerms.every(p => rolePerms.includes(p));
    setRolePerms(prev => {
      const groupPrefixes = groupItems.map(sm => `psi:${sm.key}:`);
      const withoutGroup = prev.filter(p => !groupPrefixes.some(prefix => p.startsWith(prefix)));
      return hasAll ? withoutGroup : [...new Set([...withoutGroup, ...allPerms])];
    });
  }

  function toggleFinancePerm(perm: string) {
    setRolePerms(prev => {
      const parts = perm.split(':');
      const mod = `${parts[0]}:${parts[1]}`;
      const action = parts[2];
      if (prev.includes(perm)) {
        if (action === 'view') {
          return prev.filter(p => !p.startsWith(`${mod}:`));
        }
        return prev.filter(p => p !== perm);
      } else {
        const next = [...prev, perm];
        if (action !== 'view' && action !== 'allow') {
          const viewPerm = `${mod}:view`;
          if (!next.includes(viewPerm)) next.push(viewPerm);
        }
        return next;
      }
    });
  }

  function toggleFinanceAll() {
    const allPerms = FINANCE_SUB_MODULES.flatMap(sm =>
      sm.actions.map(a => `finance:${sm.key}:${a}`)
    );
    const hasAll = allPerms.every(p => rolePerms.includes(p));
    setRolePerms(prev =>
      hasAll ? prev.filter(p => !p.startsWith('finance:')) : [...new Set([...prev.filter(p => !p.startsWith('finance:')), ...allPerms])]
    );
  }

  function toggleFinanceSubModuleAll(smKey: string) {
    const sm = FINANCE_SUB_MODULES.find(s => s.key === smKey);
    if (!sm) return;
    const perms = sm.actions.map(a => `finance:${smKey}:${a}`);
    const hasAll = perms.every(p => rolePerms.includes(p));
    setRolePerms(prev =>
      hasAll ? prev.filter(p => !p.startsWith(`finance:${smKey}:`)) : [...prev.filter(p => !p.startsWith(`finance:${smKey}:`)), ...perms]
    );
  }

  function toggleFinanceGroupAll(group: string) {
    const groupItems = FINANCE_SUB_MODULES.filter(sm => sm.group === group);
    const allPerms = groupItems.flatMap(sm => sm.actions.map(a => `finance:${sm.key}:${a}`));
    const hasAll = allPerms.every(p => rolePerms.includes(p));
    setRolePerms(prev => {
      const groupPrefixes = groupItems.map(sm => `finance:${sm.key}:`);
      const withoutGroup = prev.filter(p => !groupPrefixes.some(prefix => p.startsWith(prefix)));
      return hasAll ? withoutGroup : [...new Set([...withoutGroup, ...allPerms])];
    });
  }

  function toggleCollaborationPerm(perm: string) {
    setRolePerms(prev => {
      const parts = perm.split(':');
      const mod = `${parts[0]}:${parts[1]}`;
      const action = parts[2];
      if (prev.includes(perm)) {
        if (action === 'view') {
          return prev.filter(p => !p.startsWith(`${mod}:`));
        }
        return prev.filter(p => p !== perm);
      }
      return [...prev, perm];
    });
  }

  function toggleCollaborationAll() {
    const allPerms = COLLABORATION_SUB_MODULES.flatMap(sm =>
      sm.actions.map(a => `collaboration:${sm.key}:${a}`),
    );
    const hasAll = allPerms.every(p => rolePerms.includes(p));
    setRolePerms(prev =>
      hasAll ? prev.filter(p => !p.startsWith('collaboration:')) : [...new Set([...prev.filter(p => !p.startsWith('collaboration:')), ...allPerms])],
    );
  }

  function toggleCollaborationSubModuleAll(smKey: string) {
    const sm = COLLABORATION_SUB_MODULES.find(s => s.key === smKey);
    if (!sm) return;
    const perms = sm.actions.map(a => `collaboration:${smKey}:${a}`);
    const hasAll = perms.every(p => rolePerms.includes(p));
    setRolePerms(prev =>
      hasAll ? prev.filter(p => !p.startsWith(`collaboration:${smKey}:`)) : [...prev.filter(p => !p.startsWith(`collaboration:${smKey}:`)), ...perms],
    );
  }

  function togglePriceAmountPerm(permKey: string) {
    setRolePerms(prev => {
      if (prev.includes(permKey)) {
        return prev.filter(p => p !== permKey);
      }
      const next = [...prev, permKey];
      const sm = PRICE_AMOUNT_SUB_MODULES.find(s => s.permKey === permKey);
      if (sm?.requiresDocViewOnEnable) {
        const viewPerm = permKey.replace(':amount', ':view');
        if (!next.includes(viewPerm)) next.push(viewPerm);
      }
      return next;
    });
  }

  function togglePriceAmountAll() {
    const allKeys = PRICE_AMOUNT_SUB_MODULES.map(sm => sm.permKey);
    const hasAll = allKeys.every(k => rolePerms.includes(k));
    setRolePerms(prev => {
      if (hasAll) {
        return prev.filter(p => !AMOUNT_FINE_GRAINED_PERM_KEYS.includes(p));
      }
      const next = new Set(prev);
      for (const sm of PRICE_AMOUNT_SUB_MODULES) {
        next.add(sm.permKey);
        if (sm.requiresDocViewOnEnable) {
          next.add(sm.permKey.replace(':amount', ':view'));
        }
      }
      return [...next];
    });
  }

  function togglePriceAmountGroupAll(group: string) {
    const items = PRICE_AMOUNT_SUB_MODULES.filter(sm => sm.group === group);
    const keys = items.map(sm => sm.permKey);
    const hasAll = keys.every(k => rolePerms.includes(k));
    setRolePerms(prev => {
      const without = prev.filter(p => !keys.includes(p));
      if (hasAll) return without;
      const next = new Set(without);
      for (const sm of items) {
        next.add(sm.permKey);
        if (sm.requiresDocViewOnEnable) {
          next.add(sm.permKey.replace(':amount', ':view'));
        }
      }
      return [...next];
    });
  }

  function toggleModulePerm(modId: string) {
    setRolePerms(prev => {
      if (prev.includes(modId)) {
        if (modId === 'settings') {
          return prev.filter(p => p !== modId && !p.startsWith('settings:'));
        }
        if (modId === 'basic') {
          return prev.filter(p => p !== modId && !p.startsWith('basic:'));
        }
        if (modId === 'production') {
          return prev.filter(p => p !== modId && !p.startsWith('production:'));
        }
        if (modId === 'psi') {
          return prev.filter(p => p !== modId && !p.startsWith('psi:'));
        }
        if (modId === 'finance') {
          return prev.filter(p => p !== modId && !p.startsWith('finance:'));
        }
        if (modId === 'collaboration') {
          return prev.filter(p => p !== modId && !p.startsWith('collaboration:'));
        }
        if (modId === 'knowledge_base') {
          return prev.filter(p => p !== modId && !p.startsWith('knowledge_base:'));
        }
        if (modId === 'price_amount') {
          return prev.filter(p => p !== modId && !AMOUNT_FINE_GRAINED_PERM_KEYS.includes(p));
        }
        return prev.filter(p => p !== modId);
      }
      return [...prev, modId];
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col mx-4"
        onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-100 flex-shrink-0">
          <h3 className="text-lg font-bold text-slate-900">{editingRole ? '编辑角色' : '新建角色'}</h3>
        </div>
        <div className="p-6 space-y-5 flex-1 overflow-y-auto min-h-0">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">角色名称 *</label>
            <input type="text" value={roleName} onChange={e => setRoleName(e.target.value)}
              placeholder="如：生产主管、仓库管理员"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
            <input type="text" value={roleDesc} onChange={e => setRoleDesc(e.target.value)}
              placeholder="可选，简述此角色的职责"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>

          {/* 模块级权限 */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">模块权限</label>
            <div className="flex flex-wrap gap-2">
              {ALL_PERMISSIONS.map(p => (
                <label key={p.id} className="flex items-center gap-1.5 text-xs cursor-pointer px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">
                  <input type="checkbox" checked={rolePerms.includes(p.id)}
                    onChange={() => toggleModulePerm(p.id)}
                    className="rounded border-gray-300 text-indigo-600" />
                  {p.label}
                </label>
              ))}
            </div>
          </div>

          {developmentModuleChecked && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setDevelopmentExpanded(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <span className="text-sm font-bold text-slate-700">开发管理 - 细粒度权限</span>
                <div className="flex items-center gap-2">
                  {!developmentExpanded && rolePerms.some(p => p.startsWith('development:')) && (
                    <span className="text-xs text-indigo-500 font-medium">
                      已配置 {DEVELOPMENT_SUB_MODULES.filter(sm => rolePerms.some(p => p.startsWith(`development:${sm.key}:`))).length} 项
                    </span>
                  )}
                  {developmentExpanded
                    ? <ChevronDown className="w-4 h-4 text-slate-400" />
                    : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </div>
              </button>
              {developmentExpanded && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-t border-slate-100">
                      <th className="text-left px-4 py-2 font-medium text-slate-600 w-[40%]">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={DEVELOPMENT_SUB_MODULES.flatMap(sm => sm.actions.map(a => `development:${sm.key}:${a}`)).every(p => rolePerms.includes(p))}
                            onChange={toggleDevelopmentAll}
                            className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                          />
                          全选
                        </label>
                      </th>
                      {['view', 'create', 'edit', 'delete'].map(a => (
                        <th key={a} className="text-center px-2 py-2 font-medium text-slate-600">{ACTION_LABELS[a]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {DEVELOPMENT_SUB_MODULES.map(sm => (
                      <tr key={sm.key} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2.5 text-slate-700 font-medium">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={sm.actions.every(a => rolePerms.includes(`development:${sm.key}:${a}`))}
                              onChange={() => toggleDevelopmentSubModuleAll(sm.key)}
                              className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                            />
                            {sm.label}
                          </label>
                        </td>
                        {['view', 'create', 'edit', 'delete'].map(action => {
                          const perm = `development:${sm.key}:${action}`;
                          const available = sm.actions.includes(action);
                          return (
                            <td key={action} className="text-center px-2 py-2.5">
                              {available ? (
                                <input
                                  type="checkbox"
                                  checked={rolePerms.includes(perm)}
                                  onChange={() => toggleDevelopmentPerm(perm)}
                                  className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                />
                              ) : <span className="text-slate-200">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {knowledgeBaseModuleChecked && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setKnowledgeBaseExpanded(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <span className="text-sm font-bold text-slate-700">资料库 - 细粒度权限</span>
                <div className="flex items-center gap-2">
                  {!knowledgeBaseExpanded && rolePerms.some(p => p.startsWith('knowledge_base:')) && (
                    <span className="text-xs text-indigo-500 font-medium">
                      已配置 {KNOWLEDGE_BASE_SUB_MODULES.filter(sm => rolePerms.some(p => p.startsWith(`knowledge_base:${sm.key}:`))).length} 项
                    </span>
                  )}
                  {knowledgeBaseExpanded
                    ? <ChevronDown className="w-4 h-4 text-slate-400" />
                    : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </div>
              </button>
              {knowledgeBaseExpanded && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-t border-slate-100">
                      <th className="text-left px-4 py-2 font-medium text-slate-600 w-[40%]">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={KNOWLEDGE_BASE_SUB_MODULES.flatMap(sm => sm.actions.map(a => `knowledge_base:${sm.key}:${a}`)).every(p => rolePerms.includes(p))}
                            onChange={toggleKnowledgeBaseAll}
                            className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                          />
                          全选
                        </label>
                      </th>
                      {['view', 'create', 'edit', 'delete'].map(a => (
                        <th key={a} className="text-center px-2 py-2 font-medium text-slate-600">{ACTION_LABELS[a]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {KNOWLEDGE_BASE_SUB_MODULES.map(sm => (
                      <tr key={sm.key} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2.5 text-slate-700 font-medium">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={sm.actions.every(a => rolePerms.includes(`knowledge_base:${sm.key}:${a}`))}
                              onChange={() => toggleKnowledgeBaseSubModuleAll(sm.key)}
                              className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                            />
                            {sm.label}
                          </label>
                        </td>
                        {['view', 'create', 'edit', 'delete'].map(action => {
                          const perm = `knowledge_base:${sm.key}:${action}`;
                          const available = sm.actions.includes(action);
                          return (
                            <td key={action} className="text-center px-2 py-2.5">
                              {available ? (
                                <input
                                  type="checkbox"
                                  checked={rolePerms.includes(perm)}
                                  onChange={() => toggleKnowledgeBasePerm(perm)}
                                  className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                />
                              ) : <span className="text-slate-200">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* 基础信息细粒度权限矩阵 */}
          {basicModuleChecked && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setBasicExpanded(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <span className="text-sm font-bold text-slate-700">基础信息 - 细粒度权限</span>
                <div className="flex items-center gap-2">
                  {!basicExpanded && rolePerms.some(p => p.startsWith('basic:')) && (
                    <span className="text-xs text-indigo-500 font-medium">
                      已配置 {BASIC_SUB_MODULES.filter(sm => rolePerms.some(p => p.startsWith(`basic:${sm.key}:`))).length} 项
                    </span>
                  )}
                  {basicExpanded
                    ? <ChevronDown className="w-4 h-4 text-slate-400" />
                    : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </div>
              </button>
              {basicExpanded && (
                <>
                  <p className="px-4 py-2 text-xs text-slate-400 bg-slate-50/50 border-t border-slate-100">
                    不配置细粒度权限时，拥有基础信息的全部权限
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-t border-slate-100">
                        <th className="text-left px-4 py-2 font-medium text-slate-600 w-[40%]">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={BASIC_SUB_MODULES.flatMap(sm => sm.actions.map(a => `basic:${sm.key}:${a}`)).every(p => rolePerms.includes(p))}
                              onChange={toggleBasicAll}
                              className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                            />
                            全选
                          </label>
                        </th>
                        {['view', 'create', 'edit', 'delete'].map(a => (
                          <th key={a} className="text-center px-2 py-2 font-medium text-slate-600">{ACTION_LABELS[a]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {BASIC_SUB_MODULES.map(sm => (
                        <tr key={sm.key} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 text-slate-700 font-medium">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={sm.actions.every(a => rolePerms.includes(`basic:${sm.key}:${a}`))}
                                onChange={() => toggleBasicSubModuleAll(sm.key)}
                                className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                              />
                              {sm.label}
                            </label>
                          </td>
                          {['view', 'create', 'edit', 'delete'].map(action => {
                            const perm = `basic:${sm.key}:${action}`;
                            const available = sm.actions.includes(action);
                            return (
                              <td key={action} className="text-center px-2 py-2.5">
                                {available ? (
                                  <input
                                    type="checkbox"
                                    checked={rolePerms.includes(perm)}
                                    onChange={() => toggleBasicPerm(perm)}
                                    className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                  />
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          {/* 生产管理细粒度权限矩阵 */}
          {productionModuleChecked && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setProductionExpanded(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <span className="text-sm font-bold text-slate-700">生产管理 - 细粒度权限</span>
                <div className="flex items-center gap-2">
                  {!productionExpanded && rolePerms.some(p => p.startsWith('production:')) && (
                    <span className="text-xs text-indigo-500 font-medium">
                      已配置 {PRODUCTION_SUB_MODULES.filter(sm => rolePerms.some(p => p.startsWith(`production:${sm.key}:`))).length} 项
                    </span>
                  )}
                  {productionExpanded
                    ? <ChevronDown className="w-4 h-4 text-slate-400" />
                    : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </div>
              </button>
              {productionExpanded && (
                <>
                  <p className="px-4 py-2 text-xs text-slate-400 bg-slate-50/50 border-t border-slate-100">
                    不配置细粒度权限时，拥有生产管理的全部权限
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-t border-slate-100">
                        <th className="text-left px-4 py-2 font-medium text-slate-600 w-[40%]">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={PRODUCTION_SUB_MODULES.flatMap(sm => sm.actions.map(a => `production:${sm.key}:${a}`)).every(p => rolePerms.includes(p))}
                              onChange={toggleProductionAll}
                              className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                            />
                            全选
                          </label>
                        </th>
                        {['view', 'create', 'edit', 'delete'].map(a => (
                          <th key={a} className="text-center px-2 py-2 font-medium text-slate-600">{ACTION_LABELS[a]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(() => {
                        const groups = [...new Set(PRODUCTION_SUB_MODULES.map(sm => sm.group))];
                        const rows: React.ReactNode[] = [];
                        for (const group of groups) {
                          const items = PRODUCTION_SUB_MODULES.filter(sm => sm.group === group);
                          const allowItems = items.filter(sm => sm.actions.length === 1 && sm.actions[0] === 'allow');
                          const crudItems = items.filter(sm => !(sm.actions.length === 1 && sm.actions[0] === 'allow'));
                          rows.push(
                            <tr key={`pg-${group}`} className="bg-indigo-50/40">
                              <td colSpan={5} className="px-4 py-1.5">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={items.flatMap(sm => sm.actions.map(a => `production:${sm.key}:${a}`)).every(p => rolePerms.includes(p))}
                                    onChange={() => toggleProductionGroupAll(group)}
                                    className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                  />
                                  <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{group}</span>
                                </label>
                              </td>
                            </tr>
                          );
                          {allowItems.length > 0 && rows.push(
                            <tr key={`pa-${group}`} className="hover:bg-slate-50/50">
                              <td colSpan={5} className="px-4 pl-8 py-2.5">
                                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                                  {allowItems.map(sm => (
                                    <label key={sm.key} className="flex items-center gap-1.5 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={rolePerms.includes(`production:${sm.key}:allow`)}
                                        onChange={() => toggleProductionSubModuleAll(sm.key)}
                                        className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                      />
                                      <span className="text-sm text-slate-700 font-medium">{sm.label}</span>
                                    </label>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                          for (const sm of crudItems) {
                            rows.push(
                              <tr key={sm.key} className="hover:bg-slate-50/50">
                                <td className="px-4 pl-8 py-2.5 text-slate-700 font-medium">
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={sm.actions.every(a => rolePerms.includes(`production:${sm.key}:${a}`))}
                                      onChange={() => toggleProductionSubModuleAll(sm.key)}
                                      className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                    />
                                    {sm.label}
                                  </label>
                                </td>
                                {['view', 'create', 'edit', 'delete'].map(action => {
                                  const perm = `production:${sm.key}:${action}`;
                                  const available = sm.actions.includes(action);
                                  return (
                                    <td key={action} className="text-center px-2 py-2.5">
                                      {available ? (
                                        <input
                                          type="checkbox"
                                          checked={rolePerms.includes(perm)}
                                          onChange={() => toggleProductionPerm(perm)}
                                          className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                        />
                                      ) : (
                                        <span className="text-slate-300">—</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          }
                        }
                        return rows;
                      })()}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          {/* 进销存细粒度权限矩阵 */}
          {psiModuleChecked && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setPsiExpanded(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <span className="text-sm font-bold text-slate-700">进销存 - 细粒度权限</span>
                <div className="flex items-center gap-2">
                  {!psiExpanded && rolePerms.some(p => p.startsWith('psi:')) && (
                    <span className="text-xs text-indigo-500 font-medium">
                      已配置 {PSI_SUB_MODULES.filter(sm => rolePerms.some(p => p.startsWith(`psi:${sm.key}:`))).length} 项
                    </span>
                  )}
                  {psiExpanded
                    ? <ChevronDown className="w-4 h-4 text-slate-400" />
                    : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </div>
              </button>
              {psiExpanded && (
                <>
                  <p className="px-4 py-2 text-xs text-slate-400 bg-slate-50/50 border-t border-slate-100">
                    不配置细粒度权限时，拥有进销存的全部权限
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-t border-slate-100">
                        <th className="text-left px-4 py-2 font-medium text-slate-600 w-[40%]">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={PSI_SUB_MODULES.flatMap(sm => sm.actions.map(a => `psi:${sm.key}:${a}`)).every(p => rolePerms.includes(p))}
                              onChange={togglePsiAll}
                              className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                            />
                            全选
                          </label>
                        </th>
                        {['view', 'create', 'edit', 'delete'].map(a => (
                          <th key={a} className="text-center px-2 py-2 font-medium text-slate-600">{ACTION_LABELS[a] ?? a}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(() => {
                        const groups = [...new Set(PSI_SUB_MODULES.map(sm => sm.group))];
                        const rows: React.ReactNode[] = [];
                        for (const group of groups) {
                          const items = PSI_SUB_MODULES.filter(sm => sm.group === group);
                          const allowItems = items.filter(sm => sm.actions.length === 1 && sm.actions[0] === 'allow');
                          const crudItems = items.filter(sm => !(sm.actions.length === 1 && sm.actions[0] === 'allow'));
                          rows.push(
                            <tr key={`psi-g-${group}`} className="bg-indigo-50/40">
                              <td colSpan={5} className="px-4 py-1.5">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={items.flatMap(sm => sm.actions.map(a => `psi:${sm.key}:${a}`)).every(p => rolePerms.includes(p))}
                                    onChange={() => togglePsiGroupAll(group)}
                                    className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                  />
                                  <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{group}</span>
                                </label>
                              </td>
                            </tr>
                          );
                          {allowItems.length > 0 && rows.push(
                            <tr key={`psi-a-${group}`} className="hover:bg-slate-50/50">
                              <td colSpan={5} className="px-4 pl-8 py-2.5">
                                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                                  {allowItems.map(sm => (
                                    <label key={sm.key} className="flex items-center gap-1.5 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={rolePerms.includes(`psi:${sm.key}:allow`)}
                                        onChange={() => togglePsiSubModuleAll(sm.key)}
                                        className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                      />
                                      <span className="text-sm text-slate-700 font-medium">{sm.label}</span>
                                    </label>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                          for (const sm of crudItems) {
                            rows.push(
                              <tr key={sm.key} className="hover:bg-slate-50/50">
                                <td className="px-4 pl-8 py-2.5 text-slate-700 font-medium">
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={sm.actions.every(a => rolePerms.includes(`psi:${sm.key}:${a}`))}
                                      onChange={() => togglePsiSubModuleAll(sm.key)}
                                      className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                    />
                                    {sm.label}
                                  </label>
                                </td>
                                {['view', 'create', 'edit', 'delete'].map(action => {
                                  const perm = `psi:${sm.key}:${action}`;
                                  const available = sm.actions.includes(action);
                                  return (
                                    <td key={action} className="text-center px-2 py-2.5">
                                      {available ? (
                                        <input
                                          type="checkbox"
                                          checked={rolePerms.includes(perm)}
                                          onChange={() => togglePsiPerm(perm)}
                                          className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                        />
                                      ) : (
                                        <span className="text-slate-300">—</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          }
                        }
                        return rows;
                      })()}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          {/* 财务结算细粒度权限矩阵 */}
          {financeModuleChecked && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setFinanceExpanded(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <span className="text-sm font-bold text-slate-700">财务结算 - 细粒度权限</span>
                <div className="flex items-center gap-2">
                  {!financeExpanded && rolePerms.some(p => p.startsWith('finance:')) && (
                    <span className="text-xs text-indigo-500 font-medium">
                      已配置 {FINANCE_SUB_MODULES.filter(sm => rolePerms.some(p => p.startsWith(`finance:${sm.key}:`))).length} 项
                    </span>
                  )}
                  {financeExpanded
                    ? <ChevronDown className="w-4 h-4 text-slate-400" />
                    : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </div>
              </button>
              {financeExpanded && (
                <>
                  <p className="px-4 py-2 text-xs text-slate-400 bg-slate-50/50 border-t border-slate-100">
                    不配置细粒度权限时，拥有财务结算的全部权限
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-t border-slate-100">
                        <th className="text-left px-4 py-2 font-medium text-slate-600 w-[40%]">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={FINANCE_SUB_MODULES.flatMap(sm => sm.actions.map(a => `finance:${sm.key}:${a}`)).every(p => rolePerms.includes(p))}
                              onChange={toggleFinanceAll}
                              className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                            />
                            全选
                          </label>
                        </th>
                        {['view', 'create', 'edit', 'delete'].map(a => (
                          <th key={a} className="text-center px-2 py-2 font-medium text-slate-600">{ACTION_LABELS[a]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(() => {
                        const groups = [...new Set(FINANCE_SUB_MODULES.map(sm => sm.group))];
                        const rows: React.ReactNode[] = [];
                        for (const group of groups) {
                          const items = FINANCE_SUB_MODULES.filter(sm => sm.group === group);
                          const allowItems = items.filter(sm => sm.actions.length === 1 && sm.actions[0] === 'allow');
                          const crudItems = items.filter(sm => !(sm.actions.length === 1 && sm.actions[0] === 'allow'));
                          rows.push(
                            <tr key={`fin-g-${group}`} className="bg-indigo-50/40">
                              <td colSpan={5} className="px-4 py-1.5">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={items.flatMap(sm => sm.actions.map(a => `finance:${sm.key}:${a}`)).every(p => rolePerms.includes(p))}
                                    onChange={() => toggleFinanceGroupAll(group)}
                                    className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                  />
                                  <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{group}</span>
                                </label>
                              </td>
                            </tr>
                          );
                          {allowItems.length > 0 && rows.push(
                            <tr key={`fin-a-${group}`} className="hover:bg-slate-50/50">
                              <td colSpan={5} className="px-4 pl-8 py-2.5">
                                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                                  {allowItems.map(sm => (
                                    <label key={sm.key} className="flex items-center gap-1.5 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={rolePerms.includes(`finance:${sm.key}:allow`)}
                                        onChange={() => toggleFinanceSubModuleAll(sm.key)}
                                        className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                      />
                                      <span className="text-sm text-slate-700 font-medium">{sm.label}</span>
                                    </label>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                          for (const sm of crudItems) {
                            rows.push(
                              <tr key={sm.key} className="hover:bg-slate-50/50">
                                <td className="px-4 pl-8 py-2.5 text-slate-700 font-medium">
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={sm.actions.every(a => rolePerms.includes(`finance:${sm.key}:${a}`))}
                                      onChange={() => toggleFinanceSubModuleAll(sm.key)}
                                      className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                    />
                                    {sm.label}
                                  </label>
                                </td>
                                {['view', 'create', 'edit', 'delete'].map(action => {
                                  const perm = `finance:${sm.key}:${action}`;
                                  const available = sm.actions.includes(action);
                                  return (
                                    <td key={action} className="text-center px-2 py-2.5">
                                      {available ? (
                                        <input
                                          type="checkbox"
                                          checked={rolePerms.includes(perm)}
                                          onChange={() => toggleFinancePerm(perm)}
                                          className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                        />
                                      ) : (
                                        <span className="text-slate-300">—</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          }
                        }
                        return rows;
                      })()}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          {/* 单价/金额细粒度权限 */}
          {priceAmountModuleChecked && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setPriceAmountExpanded(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <span className="text-sm font-bold text-slate-700">单价/金额 - 细粒度权限</span>
                <div className="flex items-center gap-2">
                  {!priceAmountExpanded && AMOUNT_FINE_GRAINED_PERM_KEYS.some(k => rolePerms.includes(k)) && (
                    <span className="text-xs text-indigo-500 font-medium">
                      已配置 {PRICE_AMOUNT_SUB_MODULES.filter(sm => rolePerms.includes(sm.permKey)).length} 项
                    </span>
                  )}
                  {priceAmountExpanded
                    ? <ChevronDown className="w-4 h-4 text-slate-400" />
                    : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </div>
              </button>
              {priceAmountExpanded && (
                <>
                  <p className="px-4 py-2 text-xs text-slate-400 bg-slate-50/50 border-t border-slate-100">
                    勾选模块且未配置细粒度时，各业务域单价/金额均可见；配置后仅勾选的业务可见（PSI 单据金额会自动补 view 权限）
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-t border-slate-100">
                        <th className="text-left px-4 py-2 font-medium text-slate-600 w-[40%]">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={PRICE_AMOUNT_SUB_MODULES.every(sm => rolePerms.includes(sm.permKey))}
                              onChange={togglePriceAmountAll}
                              className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                            />
                            全选
                          </label>
                        </th>
                        <th className="text-center px-2 py-2 font-medium text-slate-600">允许查看</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(() => {
                        const groups = [...new Set(PRICE_AMOUNT_SUB_MODULES.map(sm => sm.group))];
                        const rows: React.ReactNode[] = [];
                        for (const group of groups) {
                          const items = PRICE_AMOUNT_SUB_MODULES.filter(sm => sm.group === group);
                          rows.push(
                            <tr key={`pa-g-${group}`} className="bg-indigo-50/40">
                              <td colSpan={2} className="px-4 py-1.5">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={items.every(sm => rolePerms.includes(sm.permKey))}
                                    onChange={() => togglePriceAmountGroupAll(group)}
                                    className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                  />
                                  <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{group}</span>
                                </label>
                              </td>
                            </tr>,
                          );
                          for (const sm of items) {
                            rows.push(
                              <tr key={sm.key} className="hover:bg-slate-50/50">
                                <td className="px-4 pl-8 py-2.5 text-slate-700 font-medium">
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={rolePerms.includes(sm.permKey)}
                                      onChange={() => togglePriceAmountPerm(sm.permKey)}
                                      className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                    />
                                    {sm.label}
                                  </label>
                                </td>
                                <td className="text-center px-2 py-2.5">
                                  <input
                                    type="checkbox"
                                    checked={rolePerms.includes(sm.permKey)}
                                    onChange={() => togglePriceAmountPerm(sm.permKey)}
                                    className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                  />
                                </td>
                              </tr>,
                            );
                          }
                        }
                        return rows;
                      })()}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          {/* 协作管理细粒度权限 */}
          {collaborationModuleChecked && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setCollaborationExpanded(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <span className="text-sm font-bold text-slate-700">协作管理 - 细粒度权限</span>
                <div className="flex items-center gap-2">
                  {!collaborationExpanded && rolePerms.some(p => p.startsWith('collaboration:')) && (
                    <span className="text-xs text-indigo-500 font-medium">
                      已配置 {COLLABORATION_SUB_MODULES.filter(sm => rolePerms.some(p => p.startsWith(`collaboration:${sm.key}:`))).length} 项
                    </span>
                  )}
                  {collaborationExpanded
                    ? <ChevronDown className="w-4 h-4 text-slate-400" />
                    : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </div>
              </button>
              {collaborationExpanded && (
                <>
                  <p className="px-4 py-2 text-xs text-slate-400 bg-slate-50/50 border-t border-slate-100">
                    须先勾选上方「协作管理」模块；不配置细粒度时拥有列表全部权限；单价/金额请在「单价/金额」模块中配置
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-t border-slate-100">
                        <th className="text-left px-4 py-2 font-medium text-slate-600 w-[40%]">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={COLLABORATION_SUB_MODULES.flatMap(sm => sm.actions.map(a => `collaboration:${sm.key}:${a}`)).every(p => rolePerms.includes(p))}
                              onChange={toggleCollaborationAll}
                              className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                            />
                            全选
                          </label>
                        </th>
                        <th className="text-center px-2 py-2 font-medium text-slate-600">允许</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {COLLABORATION_SUB_MODULES.map(sm => (
                        <tr key={sm.key} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 text-slate-700 font-medium">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={sm.actions.every(a => rolePerms.includes(`collaboration:${sm.key}:${a}`))}
                                onChange={() => toggleCollaborationSubModuleAll(sm.key)}
                                className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                              />
                              {sm.label}
                            </label>
                          </td>
                          {sm.actions.map(action => {
                            const perm = `collaboration:${sm.key}:${action}`;
                            return (
                              <td key={action} className="text-center px-2 py-2.5">
                                <input
                                  type="checkbox"
                                  checked={rolePerms.includes(perm)}
                                  onChange={() => toggleCollaborationPerm(perm)}
                                  className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          {/* 系统设置细粒度权限矩阵 */}
          {settingsModuleChecked && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setSettingsExpanded(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <span className="text-sm font-bold text-slate-700">系统设置 - 细粒度权限</span>
                <div className="flex items-center gap-2">
                  {!settingsExpanded && rolePerms.some(p => p.startsWith('settings:')) && (
                    <span className="text-xs text-indigo-500 font-medium">
                      已配置 {SETTINGS_SUB_MODULES.filter(sm => rolePerms.some(p => p.startsWith(`settings:${sm.key}:`))).length} 项
                    </span>
                  )}
                  {settingsExpanded
                    ? <ChevronDown className="w-4 h-4 text-slate-400" />
                    : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </div>
              </button>
              {settingsExpanded && (
                <>
                  <p className="px-4 py-2 text-xs text-slate-400 bg-slate-50/50 border-t border-slate-100">
                    不配置细粒度权限时，拥有系统设置的全部权限
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-t border-slate-100">
                        <th className="text-left px-4 py-2 font-medium text-slate-600 w-[40%]">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={SETTINGS_SUB_MODULES.flatMap(sm => sm.actions.map(a => `settings:${sm.key}:${a}`)).every(p => rolePerms.includes(p))}
                              onChange={toggleSettingsAll}
                              className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                            />
                            全选
                          </label>
                        </th>
                        {['view', 'create', 'edit', 'delete'].map(a => (
                          <th key={a} className="text-center px-2 py-2 font-medium text-slate-600">{ACTION_LABELS[a]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {SETTINGS_SUB_MODULES.map(sm => (
                        <tr key={sm.key} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 text-slate-700 font-medium">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={sm.actions.every(a => rolePerms.includes(`settings:${sm.key}:${a}`))}
                                onChange={() => toggleSettingsSubModuleAll(sm.key)}
                                className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                              />
                              {sm.label}
                            </label>
                          </td>
                          {['view', 'create', 'edit', 'delete'].map(action => {
                            const perm = `settings:${sm.key}:${action}`;
                            const available = sm.actions.includes(action);
                            return (
                              <td key={action} className="text-center px-2 py-2.5">
                                {available ? (
                                  <input
                                    type="checkbox"
                                    checked={rolePerms.includes(perm)}
                                    onChange={() => toggleSettingsPerm(perm)}
                                    className="rounded border-gray-300 text-indigo-600 cursor-pointer w-4 h-4"
                                  />
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}
        </div>
        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0 bg-white rounded-b-2xl">
          <button onClick={onClose}
            className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200">
            取消
          </button>
          <button onClick={handleSaveRole}
            className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700">
            {editingRole ? '保存修改' : '创建角色'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default React.memo(RoleEditModal);
