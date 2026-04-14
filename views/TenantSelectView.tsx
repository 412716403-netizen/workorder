import React, { useState, useRef } from 'react';
import { Building2, ChevronRight, Loader2, Plus, CalendarClock, LogOut, Clock, XCircle } from 'lucide-react';
import * as api from '../services/api';
import type { TenantInfo } from '../services/api';
import { toast } from 'sonner';

function isExpired(expiresAt?: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

interface TenantSelectViewProps {
  tenants: TenantInfo[];
  onSelect: (result: { tenantId: string; tenantName: string; tenantRole: string; permissions: string[]; expiresAt?: string | null }) => void;
  onCreateOrJoin: () => void;
  onLogout?: () => void;
}

export default function TenantSelectView({ tenants, onSelect, onCreateOrJoin, onLogout }: TenantSelectViewProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const selectLockRef = useRef(false);

  async function handleSelect(tenantId: string) {
    if (selectLockRef.current) return;
    selectLockRef.current = true;
    setLoading(tenantId);
    try {
      const result = await api.tenants.select(tenantId);
      onSelect(result);
    } catch (err: any) {
      toast.error(err.message || '切换企业失败');
    } finally {
      selectLockRef.current = false;
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">选择企业</h1>
          <p className="text-gray-500 mt-2">请选择要进入的企业，或创建/加入新企业</p>
        </div>
        <div className="space-y-3">
          {tenants.map(t => {
            const expired = isExpired(t.expiresAt);
            const pending = t.status === 'pending';
            const rejected = t.status === 'rejected';
            const disabled = !!loading || pending || rejected;
            const abnormal = expired || pending || rejected;

            return (
              <button key={t.id} onClick={() => !pending && !rejected && handleSelect(t.id)} disabled={disabled}
                className={`w-full bg-white rounded-xl shadow-md border p-4 flex items-center gap-4 transition-all ${
                  pending ? 'border-amber-200 opacity-80 cursor-default' :
                  rejected ? 'border-red-200 opacity-60 cursor-default' :
                  expired ? 'border-red-200 opacity-70' :
                  loading ? 'opacity-50' :
                  'border-gray-100 hover:border-blue-300 hover:shadow-lg'
                }`}>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  pending ? 'bg-amber-50' : abnormal ? 'bg-red-50' : 'bg-blue-100'
                }`}>
                  <Building2 className={`w-5 h-5 ${
                    pending ? 'text-amber-500' : abnormal ? 'text-red-400' : 'text-blue-600'
                  }`} />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-bold text-gray-800">{t.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                    <span>{t.role === 'owner' ? '创建者' : t.role === 'admin' ? '管理员' : '成员'}</span>
                    {pending && (
                      <span className="inline-flex items-center gap-0.5 text-amber-600 font-bold">
                        <Clock className="w-3 h-3" /> 审核中
                      </span>
                    )}
                    {rejected && (
                      <span className="inline-flex items-center gap-0.5 text-red-500 font-bold">
                        <XCircle className="w-3 h-3" /> 已拒绝
                      </span>
                    )}
                    {!pending && !rejected && expired && (
                      <span className="inline-flex items-center gap-0.5 text-red-500 font-bold">
                        <CalendarClock className="w-3 h-3" /> 已到期
                      </span>
                    )}
                  </div>
                </div>
                {loading === t.id ? (
                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                ) : !pending && !rejected ? (
                  <ChevronRight className={`w-5 h-5 ${expired ? 'text-red-200' : 'text-gray-300'}`} />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200 space-y-3">
          <button onClick={onCreateOrJoin}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors">
            <Plus className="w-4 h-4" /> 创建新企业 / 加入其他企业
          </button>
          {onLogout && (
            <button onClick={onLogout}
              className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors">
              <LogOut className="w-4 h-4" /> 退出登录
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
