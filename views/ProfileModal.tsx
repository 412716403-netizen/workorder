import React, { useEffect, useState } from 'react';
import {
  X,
  User,
  Loader2,
  CalendarClock,
  Smartphone,
  BadgeCheck,
  KeyRound,
  ChevronRight,
  Building2,
  Pencil,
} from 'lucide-react';
import { auth, tenants, type MeUser } from '../services/api';
import ChangePhoneModal from './ChangePhoneModal';

const CN_PHONE_RE = /^1[3-9]\d{9}$/;

function formatExpiry(iso: string | null) {
  if (!iso) return '永不到期';
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function maskMobile(phone: string) {
  if (phone.length === 11) return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  return phone;
}

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
  onUpdated: (user: Record<string, unknown>) => void;
  tenantId?: string;
  tenantName?: string;
  tenantRole?: string;
  tenantExpiresAt?: string | null;
  onTenantNameChanged?: (name: string) => void;
}

export default function ProfileModal({ open, onClose, onUpdated, tenantId, tenantName, tenantRole, tenantExpiresAt, onTenantNameChanged }: ProfileModalProps) {
  const [me, setMe] = useState<MeUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [changePhoneOpen, setChangePhoneOpen] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [editingTenantName, setEditingTenantName] = useState(false);
  const [tenantNameInput, setTenantNameInput] = useState('');
  const [savingTenantName, setSavingTenantName] = useState(false);
  const isOwner = tenantRole === 'owner';

  async function handleSaveTenantName() {
    const trimmed = tenantNameInput.trim();
    if (!trimmed || !tenantId) return;
    setSavingTenantName(true);
    setError('');
    try {
      await tenants.update(tenantId, { name: trimmed });
      onTenantNameChanged?.(trimmed);
      setEditingTenantName(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSavingTenantName(false);
    }
  }

  const isPhoneUser = me ? CN_PHONE_RE.test(me.username) : false;

  useEffect(() => {
    if (!open) {
      setMe(null);
      setError('');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setChangePhoneOpen(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    auth
      .me()
      .then((data) => {
        if (cancelled) return;
        setMe(data);
        setDisplayName(data.displayName || '');
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!me) return;

    if (newPassword || confirmPassword || oldPassword) {
      if (!oldPassword) {
        setError('修改密码请填写当前密码');
        return;
      }
      if (newPassword.length < 6) {
        setError('新密码至少6位');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('两次新密码不一致');
        return;
      }
    }

    const body: { displayName?: string; oldPassword?: string; newPassword?: string } = {};
    const dn = displayName.trim();
    const origDn = (me.displayName || '').trim();
    if (dn !== origDn) body.displayName = dn;
    if (newPassword) {
      body.oldPassword = oldPassword;
      body.newPassword = newPassword;
    }

    if (Object.keys(body).length === 0) {
      setError('未修改显示名称或密码');
      return;
    }

    setSaving(true);
    try {
      const result = await auth.updateProfile(body);
      onUpdated(result.user as unknown as Record<string, unknown>);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMe(result.user);
      setDisplayName(result.user.displayName || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col border border-slate-200">
          <div className="shrink-0 p-5 sm:p-6 border-b border-slate-100 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900">个人信息</h2>
                <p className="text-xs text-slate-500 mt-0.5">管理账号资料与安全设置</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors shrink-0"
              aria-label="关闭"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-20 text-indigo-600">
                <Loader2 className="w-10 h-10 animate-spin" />
              </div>
            ) : me ? (
              <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>
                )}

                {isOwner && <section className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                    <span className="text-sm font-bold text-slate-800">当前企业状态</span>
                  </div>
                  <div className="p-4 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                        <Building2 className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          企业名称
                        </div>
                        {editingTenantName ? (
                          <div className="flex items-center gap-2 mt-1">
                            <input
                              type="text"
                              value={tenantNameInput}
                              onChange={e => setTenantNameInput(e.target.value)}
                              className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                              autoFocus
                              onKeyDown={e => { if (e.key === 'Escape') setEditingTenantName(false); if (e.key === 'Enter') { e.preventDefault(); handleSaveTenantName(); } }}
                            />
                            <button type="button" onClick={handleSaveTenantName} disabled={savingTenantName || !tenantNameInput.trim()}
                              className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50">
                              {savingTenantName ? <Loader2 className="w-3 h-3 animate-spin" /> : '保存'}
                            </button>
                            <button type="button" onClick={() => setEditingTenantName(false)}
                              className="px-2 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100 text-xs font-bold">取消</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-base font-semibold text-slate-900">{tenantName || '—'}</span>
                            {isOwner && (
                              <button type="button" onClick={() => { setTenantNameInput(tenantName || ''); setEditingTenantName(true); }}
                                className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="修改企业名称">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start gap-3 pt-2 border-t border-slate-100">
                      <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                        <CalendarClock className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          企业到期时间
                        </div>
                        <div className="text-base font-semibold text-slate-900 mt-1">
                          {formatExpiry(tenantExpiresAt ?? null)}
                        </div>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          到期后企业所有成员将无法进入该企业，请联系管理员续期
                        </p>
                      </div>
                    </div>
                  </div>
                </section>}

                <section className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                    <BadgeCheck className="w-4 h-4 text-indigo-600" />
                    <span className="text-sm font-bold text-slate-800">个人账号信息</span>
                  </div>
                  <div className="p-4 space-y-4">
                    {isPhoneUser ? (
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                          <Smartphone className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                            绑定手机（登录账号）
                          </div>
                          <div className="text-lg font-mono font-semibold text-slate-900 mt-1 tracking-wide">
                            {maskMobile(me.username)}
                          </div>
                          <button
                            type="button"
                            onClick={() => setChangePhoneOpen(true)}
                            className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-indigo-600 hover:text-indigo-700"
                          >
                            更换手机
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center shrink-0">
                          <User className="w-5 h-5 text-slate-600" />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-500">登录账号</div>
                          <div className="text-base font-mono font-medium text-slate-800 mt-1">
                            {me.username}
                          </div>
                          <p className="text-xs text-slate-400 mt-1">管理员账号不可更换登录号</p>
                        </div>
                      </div>
                    )}

                    <div className="pt-4 border-t border-slate-100">
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-2">
                        <User className="w-4 h-4 text-indigo-600" />
                        显示名称
                      </div>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="在系统中展示的名称"
                      />
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    <KeyRound className="w-4 h-4 text-amber-600" />
                    登录密码
                  </div>
                  <p className="text-xs text-slate-500 -mt-1">不修改请留空以下三项</p>
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="当前密码"
                    autoComplete="current-password"
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="新密码（至少 6 位）"
                    autoComplete="new-password"
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="确认新密码"
                    autoComplete="new-password"
                  />
                </section>

                <div className="flex gap-3 pt-1 pb-1">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-3 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50"
                  >
                    关闭
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                    保存资料
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      </div>

      <ChangePhoneModal
        open={changePhoneOpen}
        onClose={() => setChangePhoneOpen(false)}
        boundPhone={isPhoneUser ? me?.username : undefined}
        currentPhoneHint={me?.username || ''}
        onSuccess={(user) => {
          onUpdated(user);
          setMe(user as unknown as MeUser);
          setChangePhoneOpen(false);
        }}
      />
    </>
  );
}
