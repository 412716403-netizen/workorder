import React, { useState, useMemo } from 'react';
import { ArrowLeft, UserPlus, Building2, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../../services/api';
import type { Partner, PartnerCategory } from '../../types';
import { SearchablePartnerSelect } from '../../components/SearchablePartnerSelect';

interface CollabSettingsPanelProps {
  onBack: () => void;
  /** 嵌入弹窗时隐藏顶部「返回收件箱」 */
  embeddedInModal?: boolean;
  activeCollabs: any[];
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  onRefreshPartners: () => Promise<void>;
  onRefreshCollabs: () => Promise<void>;
}

const CollabSettingsPanel: React.FC<CollabSettingsPanelProps> = ({
  onBack, embeddedInModal = false, activeCollabs, partners, partnerCategories, onRefreshPartners, onRefreshCollabs,
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

  const cardShell = embeddedInModal ? 'rounded-xl' : 'rounded-2xl';
  const sectionPad = embeddedInModal ? 'px-5 sm:px-6' : 'px-6';

  return (
    <div className={`w-full min-w-0 ${embeddedInModal ? '' : 'space-y-4 animate-in slide-in-from-bottom-4'}`}>
      {!embeddedInModal && (
        <div className="flex items-center justify-between">
          <button type="button" onClick={onBack} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
            <ArrowLeft className="w-4 h-4" /> 返回收件箱
          </button>
        </div>
      )}

      <div className={embeddedInModal ? 'grid grid-cols-1 xl:grid-cols-2 gap-4 xl:gap-5 xl:items-stretch' : 'space-y-4'}>
      {/* 建立企业协作 */}
      <div className={`bg-white border border-slate-200 shadow-sm overflow-hidden min-w-0 ${cardShell}`}>
        <div className={`${sectionPad} py-4 border-b border-slate-100 flex items-start gap-3`}>
          <UserPlus className={`${embeddedInModal ? 'w-6 h-6' : 'w-5 h-5'} text-indigo-600 shrink-0 mt-0.5`} />
          <div className="min-w-0">
            <h3 className={`font-black text-slate-900 ${embeddedInModal ? 'text-base sm:text-lg' : 'text-lg'}`}>建立企业协作</h3>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">输入对方企业的邀请码（在对方成员管理中可查看）来建立互信</p>
          </div>
        </div>
        <div className={`${sectionPad} py-5 flex flex-col sm:flex-row sm:items-end gap-3`}>
          <div className="flex-1 min-w-0 space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase block ml-1">对方企业邀请码</label>
            <input
              type="text"
              value={inviteCode}
              onChange={e => setInviteCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleInvite()}
              placeholder="输入邀请码..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <button
            type="button"
            disabled={inviting || !inviteCode.trim()}
            onClick={handleInvite}
            className="w-full sm:w-auto px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all shrink-0"
          >
            {inviting ? '建立中...' : '建立协作'}
          </button>
        </div>

        {activeCollabs.length > 0 && (
          <div className={`${sectionPad} pb-5`}>
            <p className="text-[10px] font-black text-slate-400 uppercase mb-2">已建立协作 ({activeCollabs.length})</p>
            <div className="space-y-2">
              {activeCollabs.map(c => (
                <div key={c.id} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3">
                  <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="text-sm font-bold text-slate-800 flex-1 min-w-0 truncate">{c.otherTenantName}</span>
                  <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded shrink-0">已生效</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 绑定合作单位 ↔ 协作企业 */}
      <div className={`bg-white border border-slate-200 shadow-sm overflow-hidden min-w-0 flex flex-col ${cardShell}`}>
        <div className={`${sectionPad} py-4 border-b border-slate-100 flex items-start gap-3`}>
          <Link2 className={`${embeddedInModal ? 'w-6 h-6' : 'w-5 h-5'} text-indigo-600 shrink-0 mt-0.5`} />
          <div className="min-w-0">
            <h3 className={`font-black text-slate-900 ${embeddedInModal ? 'text-base sm:text-lg' : 'text-lg'}`}>绑定合作单位</h3>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">将「基础信息」中的合作单位绑定到协作企业，外协发出与回传流水会按合作单位展示</p>
          </div>
        </div>

        {activeCollabs.length > 0 && unboundPartners.length > 0 && (
          <div className={`${sectionPad} py-5 border-b border-slate-100 grid grid-cols-1 lg:grid-cols-12 gap-4 items-end`}>
            <div className="space-y-1 lg:col-span-5 min-w-0">
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
            <div className="space-y-1 lg:col-span-5 min-w-0">
              <label className="text-[10px] font-black text-slate-400 uppercase block ml-1">协作企业</label>
              <select
                value={bindCollabTenantId}
                onChange={e => setBindCollabTenantId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">选择协作企业...</option>
                {activeCollabs.map(c => (
                  <option key={c.otherTenantId} value={c.otherTenantId}>{c.otherTenantName}</option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-2 flex lg:justify-stretch">
              <button
                type="button"
                disabled={binding || !bindPartnerId || !bindCollabTenantId}
                onClick={handleBindPartner}
                className="w-full py-3 px-4 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all whitespace-nowrap"
              >
                {binding ? '绑定中...' : '确认绑定'}
              </button>
            </div>
          </div>
        )}

        {activeCollabs.length === 0 && (
          <div className={`${sectionPad} py-8 text-center text-slate-400 text-sm`}>
            {embeddedInModal ? '请先在左侧建立企业协作' : '请先在上方建立企业协作'}
          </div>
        )}

        {boundPartners.length > 0 ? (
          <div className={`${sectionPad} py-5 flex-1`}>
            <p className="text-[10px] font-black text-slate-400 uppercase mb-3">已绑定 ({boundPartners.length})</p>
            <div className="space-y-2">
              {boundPartners.map(p => {
                const collab = activeCollabs.find(c => c.otherTenantId === p.collaborationTenantId);
                return (
                  <div key={p.id} className="flex flex-wrap items-center gap-2 sm:gap-3 bg-slate-50 rounded-xl px-4 py-3">
                    <span className="text-sm font-bold text-slate-800 flex-1 min-w-[8rem]">{p.name}</span>
                    <span className="text-xs text-indigo-600 font-bold min-w-0">→ {collab?.otherTenantName ?? '未知企业'}</span>
                    <button
                      type="button"
                      onClick={() => handleUnbindPartner(p.id)}
                      className="text-rose-500 hover:text-rose-700 text-xs font-bold shrink-0 ml-auto sm:ml-0"
                    >
                      解除绑定
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : activeCollabs.length > 0 && (
          <div className={`${sectionPad} py-8 text-center text-slate-400 text-sm`}>暂未绑定任何合作单位</div>
        )}
      </div>
      </div>
    </div>
  );
};

export default React.memo(CollabSettingsPanel);
