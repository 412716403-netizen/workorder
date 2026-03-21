import React, { useState } from 'react';
import { Building2, ChevronRight, Loader2, Plus, UserPlus } from 'lucide-react';
import * as api from '../services/api';
import type { TenantInfo } from '../services/api';
import { toast } from 'sonner';

interface TenantSelectViewProps {
  tenants: TenantInfo[];
  onSelect: (result: { tenantId: string; tenantName: string; tenantRole: string; permissions: string[] }) => void;
  onCreateOrJoin: () => void;
}

export default function TenantSelectView({ tenants, onSelect, onCreateOrJoin }: TenantSelectViewProps) {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleSelect(tenantId: string) {
    setLoading(tenantId);
    try {
      const result = await api.tenants.select(tenantId);
      onSelect(result);
    } catch (err: any) {
      toast.error(err.message || '切换企业失败');
    } finally {
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
          {tenants.map(t => (
            <button key={t.id} onClick={() => handleSelect(t.id)} disabled={!!loading}
              className="w-full bg-white rounded-xl shadow-md border border-gray-100 p-4 flex items-center gap-4 hover:border-blue-300 hover:shadow-lg transition-all disabled:opacity-50">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1 text-left">
                <div className="font-bold text-gray-800">{t.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {t.role === 'owner' ? '创建者' : t.role === 'admin' ? '管理员' : '成员'}
                </div>
              </div>
              {loading === t.id ? (
                <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-300" />
              )}
            </button>
          ))}
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <button onClick={onCreateOrJoin}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors">
            <Plus className="w-4 h-4" /> 创建新企业 / 加入其他企业
          </button>
        </div>
      </div>
    </div>
  );
}
