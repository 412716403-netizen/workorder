import React, { useState, useEffect } from 'react';
import { Building2, UserPlus, Search, Clock, ArrowLeft, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import * as api from '../services/api';
import { toast } from 'sonner';

interface OnboardingViewProps {
  onTenantReady: (result: { tenantId: string; tenantName: string; tenantRole: string; permissions: string[] }) => void;
  onBack?: () => void;
  /** 退出当前会话并回到登录页 */
  onBackToLogin?: () => void;
}

export default function OnboardingView({ onTenantReady, onBack, onBackToLogin }: OnboardingViewProps) {
  const [mode, setMode] = useState<'choose' | 'create' | 'join' | 'pending'>('choose');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [lookupResult, setLookupResult] = useState<{ id: string; name: string; memberCount: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [applications, setApplications] = useState<Array<{ id: string; tenantId: string; status: string; tenant: { id: string; name: string }; createdAt: string }>>([]);

  useEffect(() => {
    if (mode === 'pending') {
      loadApplications();
      const interval = setInterval(loadApplications, 5000);
      return () => clearInterval(interval);
    }
  }, [mode]);

  async function loadApplications() {
    try {
      const apps = await api.tenants.myApplications();
      setApplications(apps);
      const approved = apps.find(a => a.status === 'APPROVED');
      if (approved) {
        const result = await api.tenants.select(approved.tenantId);
        onTenantReady(result);
      }
    } catch {}
  }

  const [createSubmitted, setCreateSubmitted] = useState(false);

  async function handleCreate() {
    if (!name.trim()) { toast.warning('请输入企业名称'); return; }
    setLoading(true);
    try {
      await api.tenants.create({ name: name.trim() });
      setCreateSubmitted(true);
    } catch (err: any) { toast.error(err.message || '创建失败'); }
    finally { setLoading(false); }
  }

  async function handleLookup() {
    if (!inviteCode.trim()) { toast.warning('请输入企业邀请码'); return; }
    setLoading(true);
    try {
      const result = await api.tenants.lookup(inviteCode.trim());
      setLookupResult(result);
    } catch (err: any) { toast.error(err.message || '未找到企业'); }
    finally { setLoading(false); }
  }

  async function handleApply() {
    if (!lookupResult) return;
    setLoading(true);
    try {
      await api.tenants.apply(lookupResult.id);
      toast.success('申请已提交，等待企业审核');
      setMode('pending');
    } catch (err: any) { toast.error(err.message || '提交申请失败'); }
    finally { setLoading(false); }
  }

  const backToLoginBtn = onBackToLogin ? (
    <button
      type="button"
      onClick={onBackToLogin}
      className="absolute top-6 left-6 z-10 flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
    >
      <ArrowLeft className="w-4 h-4 shrink-0" />
      返回登录
    </button>
  ) : null;

  if (mode === 'pending') {
    return (
      <div className="relative min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
        {backToLoginBtn}
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <div className="text-center mb-6">
            <Clock className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-800">等待审核</h2>
            <p className="text-gray-500 mt-2 text-sm">您的加入申请已提交，企业管理员审核后将自动进入系统</p>
          </div>
          <div className="space-y-3">
            {applications.map(app => (
              <div key={app.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="font-medium text-sm">{app.tenant.name}</span>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  app.status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                  app.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {app.status === 'PENDING' ? '审核中' : app.status === 'APPROVED' ? '已通过' : '已拒绝'}
                </span>
              </div>
            ))}
          </div>
          <button onClick={() => setMode('choose')} className="mt-6 w-full flex items-center justify-center gap-2 py-2.5 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-4 h-4" /> 返回
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'create') {
    if (createSubmitted) {
      return (
        <div className="relative min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
          {backToLoginBtn}
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-8 text-center">
            <Clock className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-800">企业已提交审核</h2>
            <p className="text-gray-500 mt-2 text-sm">您的企业创建申请已提交，平台管理员审核通过后即可使用</p>
            <button onClick={() => { setCreateSubmitted(false); setName(''); setMode('choose'); }}
              className="mt-6 w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors">
              <ArrowLeft className="w-4 h-4" /> 返回
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="relative min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
        {backToLoginBtn}
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <h2 className="text-xl font-bold text-gray-800 mb-6">创建企业</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">企业名称</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="请输入企业名称"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>
            <button onClick={handleCreate} disabled={loading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />} 提交创建申请
            </button>
          </div>
          <button onClick={() => setMode('choose')} className="mt-4 w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-4 h-4" /> 返回
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'join') {
    return (
      <div className="relative min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
        {backToLoginBtn}
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <h2 className="text-xl font-bold text-gray-800 mb-6">加入企业</h2>
          <div className="space-y-4">
            <div className="flex gap-2">
              <input type="text" value={inviteCode} onChange={e => setInviteCode(e.target.value)} placeholder="输入企业邀请码"
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              <button onClick={handleLookup} disabled={loading}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>
            {lookupResult && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-bold text-blue-900">{lookupResult.name}</span>
                  <span className="text-xs text-blue-600">{lookupResult.memberCount} 位成员</span>
                </div>
                <button onClick={handleApply} disabled={loading}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} 申请加入
                </button>
              </div>
            )}
          </div>
          <button onClick={() => { setMode('choose'); setLookupResult(null); setInviteCode(''); }}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-4 h-4" /> 返回
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      {backToLoginBtn}
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">欢迎使用 SmartTrack Pro</h1>
          <p className="text-gray-500 mt-2">请选择创建企业或加入现有企业</p>
        </div>
        <div className="grid gap-4">
          <button onClick={() => setMode('create')}
            className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 text-left hover:border-blue-300 hover:shadow-xl transition-all group">
            <Building2 className="w-10 h-10 text-blue-600 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-bold text-gray-800 text-lg">创建企业</h3>
            <p className="text-sm text-gray-500 mt-1">创建一个新的企业空间，您将成为管理员</p>
          </button>
          <button onClick={() => setMode('join')}
            className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 text-left hover:border-green-300 hover:shadow-xl transition-all group">
            <UserPlus className="w-10 h-10 text-green-600 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-bold text-gray-800 text-lg">加入企业</h3>
            <p className="text-sm text-gray-500 mt-1">通过邀请码加入已有的企业</p>
          </button>
        </div>
        {onBack && (
          <button onClick={onBack} className="mt-6 w-full flex items-center justify-center gap-2 py-2.5 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-4 h-4" /> 返回企业列表
          </button>
        )}
      </div>
    </div>
  );
}
