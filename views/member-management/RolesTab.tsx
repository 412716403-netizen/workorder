import React from 'react';
import { KeyRound, Plus, Pencil, Trash2 } from 'lucide-react';
import type { RoleRow } from '../../services/api';
import { permSummary } from './constants';

interface RolesTabProps {
  rolesList: RoleRow[];
  onOpenCreateRole: () => void;
  onOpenEditRole: (role: RoleRow) => void;
  onDeleteRole: (role: RoleRow) => void;
}

function RolesTab({ rolesList, onOpenCreateRole, onOpenEditRole, onDeleteRole }: RolesTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900 tracking-tight">角色列表</h3>
          <p className="text-slate-500 mt-0.5 text-sm leading-snug max-w-xl">创建角色并配置细粒度权限，然后分配给成员</p>
        </div>
        <button
          type="button"
          onClick={onOpenCreateRole}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold shadow-sm hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center gap-2 shrink-0"
        >
          <Plus className="w-4 h-4 shrink-0" /> 新建角色
        </button>
      </div>

      {rolesList.length === 0 ? (
        <div className="bg-white rounded-[32px] border border-slate-200 p-8 shadow-sm text-center">
          <KeyRound className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">还没有自定义角色</p>
          <p className="text-slate-400 text-sm mt-1">点击「新建角色」创建第一个角色</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {rolesList.map(role => (
            <div key={role.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="font-bold text-slate-900">{role.name}</h4>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                      {role._count?.members ?? 0} 人使用
                    </span>
                  </div>
                  {role.description && <p className="text-sm text-slate-500 mb-2">{role.description}</p>}
                  <p className="text-xs text-slate-400">
                    权限：{permSummary(Array.isArray(role.permissions) ? role.permissions as string[] : [])}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => onOpenEditRole(role)}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  {!role.isSystem && (
                    <button onClick={() => onDeleteRole(role)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default React.memo(RolesTab);
