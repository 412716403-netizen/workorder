import React, { useState, useMemo } from 'react';
import { ArrowLeft, UserPlus, Building2, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../../services/api';
import type { Partner, PartnerCategory } from '../../types';
import { SearchablePartnerSelect } from '../../components/SearchablePartnerSelect';

interface CollabSettingsPanelProps {
  onBack: () => void;
  activeCollabs: any[];
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  onRefreshPartners: () => Promise<void>;
  onRefreshCollabs: () => Promise<void>;
}

const CollabSettingsPanel: React.FC<CollabSettingsPanelProps> = ({
  onBack, activeCollabs, partners, partnerCategories, onRefreshPartners, onRefreshCollabs,
}) => {
  const [inviteCode, setInviteCode] = useState('');
  const [inviting, setInviting] = useState(false);
  const [bindPartnerId, setBindPartnerId] = useState('');
  const [bindCollabTenantId, setBindCollabTenantId] = useState('');
  const [binding, setBinding] = useState(false);

  const boundPartners = useMemo(() => partners.filter(p => p.collaborationTenantId), [partners]);
  const unboundPartners = useMemo(() => partners.filter(p => !p.collaborationTenantId), [partners]);

  const handleInvite = async () => {
    const code = inviteCode.trim();
    if (!code) { toast.warning('请输入对方企业邀请码'); return; }
    setInviting(true);
    try {
      await api.collaboration.createCollaboration({ inviteCode: code });
      toast.success('协作建立成功');
      setInviteCode('');
      await onRefreshCollabs();
    } catch (err: any) {
      toast.error(err.message || '建立协作失败');
    } finally {
      setInviting(false);
    }
  };

  const handleBindPartner = async () => {
    if (!bindPartnerId || !bindCollabTenantId) { toast.warning('请选择合作单位和协作企业'); return; }
    setBinding(true);
    try {
      await api.partners.update(bindPartnerId, { collaborationTenantId: bindCollabTenantId } as any);
      toast.success('绑定成功');
      setBindPartnerId('');
      setBindCollabTenantId('');
      await onRefreshPartners();
    } catch (err: any) {
      toast.error(err.message || '绑定失败');
    } finally {
      setBinding(false);
    }
  };

  const handleUnbindPartner = async (partnerId: string) => {
    try {
      await api.partners.update(partnerId, { collaborationTenantId: null } as any);
      toast.success('已解除绑定');
      await onRefreshPartners();
    } catch (err: any) {
      toast.error(err.message || '解除绑定失败');
    }
  };

  return (
    <div className="w-full min-w-0 space-y-4 animate-in slide-in-from-bottom-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
          <ArrowLeft className="w-4 h-4" /> 返回收件箱
        </button>
      </div>

      {/* 建立企业协作 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <UserPlus className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="text-lg font-black text-slate-900">建立企业协作</h3>
            <p className="text-xs text-slate-500">输入对方企业的邀请码（在对方成员管理中可查看）来建立互信</p>
          </div>
        </div>
        <div className="px-6 py-5 flex items-end gap-3">
          <div className="flex-1 space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase block ml-1">对方企业邀请码</label>
            <input
              type="text"
              value={inviteCode}
              onChange={e => setInviteCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleInvite()}
              placeholder="输入邀请码..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <button
            disabled={inviting || !inviteCode.trim()}
            onClick={handleInvite}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all shrink-0"
          >
            {inviting ? '建立中...' : '建立协作'}
          </button>
        </div>

        {activeCollabs.length > 0 && (
          <div className="px-6 pb-5">
            <p className="text-[10px] font-black text-slate-400 uppercase mb-2">已建立协作 ({activeCollabs.length})</p>
            <div className="space-y-2">
              {activeCollabs.map(c => (
                <div key={c.id} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3">
                  <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="text-sm font-bold text-slate-800 flex-1">{c.otherTenantName}</span>
                  <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">已生效</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 绑定合作单位 ↔ 协作企业 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <Link2 className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="text-lg font-black text-slate-900">绑定合作单位</h3>
            <p className="text-xs text-slate-500">将「基础信息」中的合作单位绑定到协作企业，外协发出时自动触发同步</p>
          </div>
        </div>

        {activeCollabs.length > 0 && unboundPartners.length > 0 && (
          <div className="px-6 py-5 border-b border-slate-100 flex flex-wrap items-end gap-3">
            <div className="space-y-1 flex-1 min-w-[180px]">
              <label className="text-[10px] font-black text-slate-400 uppercase block ml-1">合作单位</label>
              <SearchablePartnerSelect
                options={unboundPartners}
                categories={partnerCategories}
                value={bindPartnerId}
                onChange={(_, id) => setBindPartnerId(id)}
                valueMode="id"
                placeholder="选择合作单位..."
                triggerClassName="bg-slate-50 border border-slate-200"
              />
            </div>
            <div className="space-y-1 flex-1 min-w-[180px]">
              <label className="text-[10px] font-black text-slate-400 uppercase block ml-1">协作企业</label>
              <select
                value={bindCollabTenantId}
                onChange={e => setBindCollabTenantId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">选择协作企业...</option>
                {activeCollabs.map(c => (
                  <option key={c.otherTenantId} value={c.otherTenantId}>{c.otherTenantName}</option>
                ))}
              </select>
            </div>
            <button
              disabled={binding || !bindPartnerId || !bindCollabTenantId}
              onClick={handleBindPartner}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all shrink-0"
            >
              {binding ? '绑定中...' : '确认绑定'}
            </button>
          </div>
        )}

        {activeCollabs.length === 0 && (
          <div className="px-6 py-8 text-center text-slate-400 text-sm">请先在上方建立企业协作</div>
        )}

        {boundPartners.length > 0 ? (
          <div className="px-6 py-5">
            <p className="text-[10px] font-black text-slate-400 uppercase mb-3">已绑定 ({boundPartners.length})</p>
            <div className="space-y-2">
              {boundPartners.map(p => {
                const collab = activeCollabs.find(c => c.otherTenantId === p.collaborationTenantId);
                return (
                  <div key={p.id} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3">
                    <span className="text-sm font-bold text-slate-800 flex-1">{p.name}</span>
                    <span className="text-xs text-indigo-600 font-bold">→ {collab?.otherTenantName ?? '未知企业'}</span>
                    <button
                      onClick={() => handleUnbindPartner(p.id)}
                      className="text-rose-500 hover:text-rose-700 text-xs font-bold shrink-0"
                    >
                      解除绑定
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : activeCollabs.length > 0 && (
          <div className="px-6 py-8 text-center text-slate-400 text-sm">暂未绑定任何合作单位</div>
        )}
      </div>
    </div>
  );
};

export default React.memo(CollabSettingsPanel);
