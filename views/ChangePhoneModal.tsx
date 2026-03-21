import React, { useEffect, useState, useCallback } from 'react';
import { X, Smartphone, Loader2, ChevronRight, ChevronLeft } from 'lucide-react';
import { auth } from '../services/api';

const CN_PHONE_RE = /^1[3-9]\d{9}$/;
const COOLDOWN_SEC = 60;

interface ChangePhoneModalProps {
  open: boolean;
  onClose: () => void;
  /** 当前完整绑定号，用于预填原手机号 */
  boundPhone?: string;
  /** 脱敏尾号展示 */
  currentPhoneHint: string;
  onSuccess: (user: Record<string, unknown>) => void;
}

export default function ChangePhoneModal({
  open,
  onClose,
  boundPhone,
  currentPhoneHint,
  onSuccess,
}: ChangePhoneModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [phaseToken, setPhaseToken] = useState('');
  const [oldPhone, setOldPhone] = useState('');
  const [oldCode, setOldCode] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCode, setNewCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [oldCooldown, setOldCooldown] = useState(0);
  const [newCooldown, setNewCooldown] = useState(0);

  const reset = useCallback(() => {
    setStep(1);
    setPhaseToken('');
    setOldPhone('');
    setOldCode('');
    setNewPhone('');
    setNewCode('');
    setError('');
    setHint('');
    setOldCooldown(0);
    setNewCooldown(0);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    if (boundPhone && CN_PHONE_RE.test(boundPhone.replace(/\D/g, ''))) {
      setOldPhone(boundPhone.replace(/\D/g, ''));
    }
  }, [open, boundPhone, reset]);

  useEffect(() => {
    if (oldCooldown <= 0) return;
    const t = setInterval(() => setOldCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [oldCooldown]);

  useEffect(() => {
    if (newCooldown <= 0) return;
    const t = setInterval(() => setNewCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [newCooldown]);

  async function sendOldCode() {
    setError('');
    setHint('');
    const o = oldPhone.replace(/\D/g, '');
    if (!CN_PHONE_RE.test(o)) {
      setError('请输入正确的11位原手机号');
      return;
    }
    setLoading(true);
    try {
      const res = await auth.phoneChangeSendCodeOld(o);
      setHint(res.devCode ? `开发环境验证码：${res.devCode}` : '验证码已发送（上线后由短信送达）');
      setOldCooldown(COOLDOWN_SEC);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败');
    } finally {
      setLoading(false);
    }
  }

  async function verifyOldAndNext(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const o = oldPhone.replace(/\D/g, '');
    const c = oldCode.replace(/\D/g, '');
    if (!CN_PHONE_RE.test(o)) {
      setError('原手机号格式不正确');
      return;
    }
    if (c.length < 4) {
      setError('请填写原手机收到的验证码');
      return;
    }
    setLoading(true);
    try {
      const { phaseToken: tok } = await auth.phoneChangeVerifyOldCode(o, c);
      setPhaseToken(tok);
      setStep(2);
      setHint('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证失败');
    } finally {
      setLoading(false);
    }
  }

  async function sendNewCode() {
    setError('');
    setHint('');
    const n = newPhone.replace(/\D/g, '');
    if (!CN_PHONE_RE.test(n)) {
      setError('请输入正确的11位新手机号');
      return;
    }
    if (!phaseToken) {
      setError('请先完成上一步验证');
      return;
    }
    setLoading(true);
    try {
      const res = await auth.phoneChangeSendCodeNew(phaseToken, n);
      setHint(res.devCode ? `开发环境验证码：${res.devCode}` : '验证码已发送至新手机号（上线后由短信送达）');
      setNewCooldown(COOLDOWN_SEC);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const n = newPhone.replace(/\D/g, '');
    const c = newCode.replace(/\D/g, '');
    if (!CN_PHONE_RE.test(n)) {
      setError('新手机号格式不正确');
      return;
    }
    if (c.length < 4) {
      setError('请填写新手机收到的验证码');
      return;
    }
    setLoading(true);
    try {
      const result = await auth.phoneChangeComplete(phaseToken, n, c);
      onSuccess(result.user as unknown as Record<string, unknown>);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更换失败');
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black text-slate-900">更换绑定手机</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {step === 1 ? '第 1 步：验证原手机号' : '第 2 步：绑定新手机号'}
              </p>
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

        <div className="px-2 py-1 flex gap-1 border-b border-slate-50 bg-slate-50/80">
          <div className={`h-1 flex-1 rounded-full ${step >= 1 ? 'bg-indigo-600' : 'bg-slate-200'}`} />
          <div className={`h-1 flex-1 rounded-full ${step >= 2 ? 'bg-indigo-600' : 'bg-slate-200'}`} />
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>
          )}
          {hint && !error && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-lg text-amber-900 text-sm">
              {hint}
            </div>
          )}

          {step === 1 ? (
            <form onSubmit={verifyOldAndNext} className="space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                须与当前登录账号一致。将向原手机发送验证码（上线后为短信；本地调试见上方提示）。
              </p>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">原绑定手机号</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={11}
                  value={oldPhone}
                  onChange={(e) => setOldPhone(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono tracking-wide focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="11 位数字"
                  autoComplete="off"
                />
                <p className="mt-1 text-xs text-slate-400">尾号参考：···{currentPhoneHint.slice(-4)}</p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={8}
                  value={oldCode}
                  onChange={(e) => setOldCode(e.target.value.replace(/\D/g, ''))}
                  className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="原手机验证码"
                />
                <button
                  type="button"
                  onClick={sendOldCode}
                  disabled={loading || oldCooldown > 0}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap shrink-0"
                >
                  {oldCooldown > 0 ? `${oldCooldown}s` : '获取验证码'}
                </button>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                验证并继续
                <ChevronRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleComplete} className="space-y-4">
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setPhaseToken('');
                  setHint('');
                  setError('');
                  setNewCooldown(0);
                }}
                className="text-xs font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1 mb-1"
              >
                <ChevronLeft className="w-3 h-3" />
                返回上一步
              </button>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">新手机号</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={11}
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono tracking-wide focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="11 位新号码"
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={8}
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.replace(/\D/g, ''))}
                  className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="新手机验证码"
                />
                <button
                  type="button"
                  onClick={sendNewCode}
                  disabled={loading || newCooldown > 0}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap shrink-0"
                >
                  {newCooldown > 0 ? `${newCooldown}s` : '获取验证码'}
                </button>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                确认更换
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
