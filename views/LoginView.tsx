import React, { useState } from 'react';
import { LogIn, UserPlus, Factory } from 'lucide-react';
import { setTokens } from '../services/api';

const CN_PHONE_RE = /^1[3-9]\d{9}$/;

interface LoginViewProps {
  onLogin: (loginData: { user: Record<string, unknown>; tenants: Array<{ id: string; name: string; role: string; permissions: string[] }>; isEnterprise: boolean; tenantId?: string | null }) => void;
}

export default function LoginView({ onLogin }: LoginViewProps) {
  const [isRegister, setIsRegister] = useState(false);
  /** 登录：界面仅提示手机号；后端仍支持管理员账号（如 admin）登录 */
  const [account, setAccount] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [successHint, setSuccessHint] = useState('');
  const [loading, setLoading] = useState(false);

  const API_BASE = (import.meta as Record<string, Record<string, string>>).env?.VITE_API_BASE || 'http://localhost:3001/api';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccessHint('');

    if (isRegister) {
      const p = phone.trim();
      if (!CN_PHONE_RE.test(p)) {
        setError('请输入正确的11位中国大陆手机号');
        return;
      }
      if (!password.trim()) {
        setError('请设置密码');
        return;
      }
      if (password.length < 6) {
        setError('密码至少6位');
        return;
      }
      if (password !== confirmPassword) {
        setError('两次密码不一致');
        return;
      }
    } else {
      if (!account.trim() || !password.trim()) {
        setError('请填写手机号和密码');
        return;
      }
    }

    setLoading(true);
    try {
      const endpoint = isRegister ? '/auth/register' : '/auth/login';
      const body = isRegister
        ? {
            phone: phone.trim(),
            password,
            displayName: displayName.trim() || undefined,
          }
        : { username: account.trim(), password };

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失败');

      if (isRegister) {
        const registeredPhone = phone.trim();
        setPhone('');
        setDisplayName('');
        setPassword('');
        setConfirmPassword('');
        setIsRegister(false);
        setAccount(registeredPhone);
        setSuccessHint('注册成功，请使用手机号登录');
        return;
      }

      setTokens(data.accessToken, data.refreshToken);
      onLogin({
        user: data.user,
        tenants: data.tenants || [],
        isEnterprise: data.isEnterprise ?? false,
        tenantId: data.tenantId || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <Factory className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">SmartTrack Pro</h1>
          <p className="text-gray-500 mt-1">生产进度节点报工系统</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-1">
            {isRegister ? '手机号注册' : '手机号登录'}
          </h2>
          {!isRegister ? (
            <p className="text-sm text-gray-500 mb-6">请使用注册时填写的手机号与密码登录</p>
          ) : (
            <div className="mb-5" />
          )}

          {successHint && !isRegister && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm">
              {successHint}
            </div>
          )}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">手机号</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    maxLength={11}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    placeholder="11位中国大陆手机号"
                  />
                  <p className="mt-1 text-xs text-gray-400">上线后将增加短信验证码校验</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">显示名称</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    placeholder="选填，默认同手机号"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">手机号</label>
                <input
                  type="text"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="请输入11位手机号"
                  autoComplete="username"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder={isRegister ? '至少6位' : '请输入密码'}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
              />
            </div>

            {isRegister && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">确认密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="再次输入密码"
                  autoComplete="new-password"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : isRegister ? (
                <>
                  <UserPlus className="w-4 h-4" /> 注册
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" /> 登录
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister);
                setError('');
                setSuccessHint('');
              }}
              className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
            >
              {isRegister ? '已有账号？去登录' : '没有账号？去注册'}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          SmartTrack Pro v1.0 &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
