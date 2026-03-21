import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  UserCog,
  Plus,
  Pencil,
  Trash2,
  ArrowLeft,
  Loader2,
  Shield,
  User,
  Ban,
  CheckCircle,
  CalendarClock,
} from 'lucide-react';
import { adminUsers, type AdminUserRow } from '../services/api';

interface UserAdminViewProps {
  currentUserId: string;
}

function formatDate(iso: string) {
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

function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

function isExpiredAt(iso: string | null) {
  if (!iso) return false;
  return new Date(iso) < new Date();
}

export default function UserAdminView({ currentUserId }: UserAdminViewProps) {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [saving, setSaving] = useState(false);

  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formConfirm, setFormConfirm] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<'admin' | 'user'>('user');
  const [formStatus, setFormStatus] = useState<'active' | 'disabled'>('active');
  const [formNoExpiry, setFormNoExpiry] = useState(true);
  const [formAccountExpiresAt, setFormAccountExpiresAt] = useState('');

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const list = await adminUsers.list();
      setUsers(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setError('');
    setEditing(null);
    setFormUsername('');
    setFormPassword('');
    setFormConfirm('');
    setFormDisplayName('');
    setFormEmail('');
    setFormRole('user');
    setFormNoExpiry(true);
    setFormAccountExpiresAt('');
    setModal('create');
  }

  function openEdit(u: AdminUserRow) {
    setError('');
    setEditing(u);
    setFormPassword('');
    setFormConfirm('');
    setFormDisplayName(u.displayName || '');
    setFormEmail(u.email || '');
    setFormRole(u.role === 'admin' ? 'admin' : 'user');
    setFormStatus(u.status === 'disabled' ? 'disabled' : 'active');
    if (u.accountExpiresAt) {
      setFormNoExpiry(false);
      setFormAccountExpiresAt(toDatetimeLocalValue(u.accountExpiresAt));
    } else {
      setFormNoExpiry(true);
      setFormAccountExpiresAt('');
    }
    setModal('edit');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (formPassword !== formConfirm) {
      setError('两次密码不一致');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await adminUsers.create({
        username: formUsername.trim(),
        password: formPassword,
        displayName: formDisplayName.trim() || undefined,
        email: formEmail.trim() || undefined,
        role: formRole,
        accountExpiresAt: formNoExpiry
          ? null
          : formAccountExpiresAt.trim()
            ? new Date(formAccountExpiresAt).toISOString()
            : null,
      });
      setModal(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (formPassword && formPassword !== formConfirm) {
      setError('两次密码不一致');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await adminUsers.update(editing.id, {
        displayName: formDisplayName.trim(),
        email: formEmail.trim() || null,
        role: formRole,
        status: formStatus,
        accountExpiresAt: formNoExpiry
          ? null
          : formAccountExpiresAt.trim()
            ? new Date(formAccountExpiresAt).toISOString()
            : null,
        ...(formPassword ? { password: formPassword } : {}),
      });
      setModal(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(u: AdminUserRow) {
    if (!confirm(`确定删除用户「${u.username}」？此操作不可恢复。`)) return;
    setError('');
    try {
      await adminUsers.delete(u.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-1 sm:px-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6 sm:mb-8">
        <div className="flex items-start gap-3 sm:gap-4 min-w-0 flex-1">
          <Link
            to="/settings"
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors shrink-0 mt-0.5"
            title="返回系统设置"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 sm:w-12 sm:h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-100 shrink-0">
              <UserCog className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">账号管理</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed max-w-2xl">
                管理员可新增用户、设置到期时间、编辑角色与状态、重置密码或删除用户
              </p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 shadow-md shadow-indigo-100 transition-colors sm:self-start"
        >
          <Plus className="w-4 h-4" />
          新建用户
        </button>
      </div>

      {error && !modal && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto -mx-px">
            <table className="w-full min-w-[920px] text-sm table-fixed border-collapse">
              <colgroup>
                <col className="w-[16%] min-w-[140px]" />
                <col className="w-[14%] min-w-[120px]" />
                <col className="w-[18%] min-w-[160px]" />
                <col className="w-[10%] min-w-[88px]" />
                <col className="w-[9%] min-w-[76px]" />
                <col className="w-[15%] min-w-[150px]" />
                <col className="w-[14%] min-w-[140px]" />
                <col style={{ width: '5.5rem' }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-600">
                  <th className="px-4 py-3.5 text-xs font-black uppercase tracking-wide text-slate-500">
                    登录账号
                  </th>
                  <th className="px-4 py-3.5 text-xs font-black uppercase tracking-wide text-slate-500">
                    显示名
                  </th>
                  <th className="px-4 py-3.5 text-xs font-black uppercase tracking-wide text-slate-500">
                    邮箱
                  </th>
                  <th className="px-4 py-3.5 text-xs font-black uppercase tracking-wide text-slate-500">
                    角色
                  </th>
                  <th className="px-4 py-3.5 text-xs font-black uppercase tracking-wide text-slate-500">
                    状态
                  </th>
                  <th className="px-4 py-3.5 text-xs font-black uppercase tracking-wide text-slate-500 whitespace-nowrap">
                    到期时间
                  </th>
                  <th className="px-4 py-3.5 text-xs font-black uppercase tracking-wide text-slate-500 whitespace-nowrap">
                    创建时间
                  </th>
                  <th className="px-3 py-3.5 text-xs font-black uppercase tracking-wide text-slate-500 text-center w-24">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors align-middle"
                  >
                    <td className="px-4 py-3.5 align-top">
                      <div className="font-mono text-[13px] font-semibold text-slate-800 break-all">
                        {u.username}
                      </div>
                      {u.id === currentUserId && (
                        <span className="inline-block mt-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                          当前登录
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-slate-800 font-medium leading-snug break-words whitespace-normal">
                      {u.displayName?.trim() ? (
                        <span className="inline-block max-w-full">{u.displayName}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 text-[13px] break-all leading-snug">
                      {u.email || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3.5">
                      {u.role === 'admin' ? (
                        <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg text-xs font-bold">
                          <Shield className="w-3 h-3" /> 管理员
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg text-xs font-bold">
                          <User className="w-3 h-3" /> 普通用户
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {u.status === 'disabled' ? (
                        <span className="inline-flex items-center gap-1 text-red-600 bg-red-50 px-2 py-0.5 rounded-lg text-xs font-bold">
                          <Ban className="w-3 h-3" /> 已禁用
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg text-xs font-bold">
                          <CheckCircle className="w-3 h-3" /> 正常
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-[13px]">
                      {!u.accountExpiresAt ? (
                        <span className="text-slate-400 text-xs">永不到期</span>
                      ) : isExpiredAt(u.accountExpiresAt) ? (
                        <span className="inline-flex items-center gap-1 text-red-600 bg-red-50 px-2 py-0.5 rounded-lg text-xs font-bold">
                          <CalendarClock className="w-3 h-3" />
                          已过期
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-600 text-xs">
                          <CalendarClock className="w-3 h-3 text-indigo-400" />
                          {formatDate(u.accountExpiresAt)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap text-[13px]">
                      {formatDate(u.createdAt)}
                    </td>
                    <td className="px-2 py-3.5">
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => openEdit(u)}
                          className="p-2 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="编辑"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(u)}
                          disabled={u.id === currentUserId}
                          className="p-2 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                          title={u.id === currentUserId ? '不可删除当前账号' : '删除'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-lg font-black text-slate-900">
                {modal === 'create' ? '新建用户' : `编辑：${editing?.username}`}
              </h2>
            </div>
            <form onSubmit={modal === 'create' ? handleCreate : handleEdit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>
              )}
              {modal === 'create' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">登录账号 *</label>
                    <input
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={formUsername}
                      onChange={(e) => setFormUsername(e.target.value)}
                      required
                      minLength={2}
                      autoComplete="off"
                      placeholder="11位手机号或自定义账号（如 admin）"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">初始密码 *（至少6位）</label>
                    <input
                      type="password"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">确认密码 *</label>
                    <input
                      type="password"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={formConfirm}
                      onChange={(e) => setFormConfirm(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                </>
              )}
              {modal === 'edit' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">新密码（留空则不修改）</label>
                  <input
                    type="password"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none mb-2"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="至少6位"
                    autoComplete="new-password"
                  />
                  {formPassword && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">确认新密码</label>
                      <input
                        type="password"
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={formConfirm}
                        onChange={(e) => setFormConfirm(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">显示名</label>
                <input
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={formDisplayName}
                  onChange={(e) => setFormDisplayName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">邮箱</label>
                <input
                  type="email"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="选填"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">角色</label>
                <select
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as 'admin' | 'user')}
                >
                  <option value="user">普通用户</option>
                  <option value="admin">管理员</option>
                </select>
              </div>
              {modal === 'edit' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">状态</label>
                  <select
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as 'active' | 'disabled')}
                  >
                    <option value="active">正常</option>
                    <option value="disabled">禁用（无法登录）</option>
                  </select>
                </div>
              )}
              <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/80">
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input
                    type="checkbox"
                    checked={formNoExpiry}
                    onChange={(e) => setFormNoExpiry(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm font-bold text-slate-700">账号永不到期</span>
                </label>
                {!formNoExpiry && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">到期时间（到期后无法登录）</label>
                    <input
                      type="datetime-local"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                      value={formAccountExpiresAt}
                      onChange={(e) => setFormAccountExpiresAt(e.target.value)}
                    />
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setModal(null);
                    setError('');
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {modal === 'create' ? '创建' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
