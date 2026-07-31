import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../../../services/api';

interface WxMpBindModalProps {
  open: boolean;
  onClose: () => void;
}

const WxMpBindModal: React.FC<WxMpBindModalProps> = ({ open, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [bound, setBound] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [qrcodeUrl, setQrcodeUrl] = useState<string | null>(null);
  const [expireSeconds, setExpireSeconds] = useState(600);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const status = await api.wxMp.status();
      setConfigured(status.configured);
      setBound(status.bound);
      if (!status.configured) {
        setQrcodeUrl(null);
        return;
      }
      if (status.bound) {
        setQrcodeUrl(null);
        return;
      }
      const qr = await api.wxMp.createBindQrcode();
      setQrcodeUrl(qr.qrcodeUrl);
      setExpireSeconds(qr.expireSeconds);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
    const timer = window.setInterval(() => {
      void api.wxMp.status().then(s => {
        setBound(s.bound);
        if (s.bound) setQrcodeUrl(null);
      }).catch(() => {});
    }, 3000);
    return () => window.clearInterval(timer);
  }, [open, refresh]);

  const handleUnbind = async () => {
    try {
      await api.wxMp.unbind();
      setBound(false);
      toast.success('已关闭微信提醒');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="text-sm font-bold text-slate-800">微信提醒</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-50">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4 text-sm text-slate-600">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
            </div>
          ) : !configured ? (
            <p>服务号推送尚未配置，请联系管理员。</p>
          ) : bound ? (
            <>
              <p className="text-emerald-700">已开启：待办到点后将通过服务号推送到微信。</p>
              <button
                type="button"
                onClick={() => void handleUnbind()}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                关闭微信提醒
              </button>
            </>
          ) : (
            <>
              <p>请使用微信扫描下方二维码并关注服务号，即可接收待办提醒。</p>
              {qrcodeUrl ? (
                <div className="flex flex-col items-center gap-2 py-2">
                  <img src={qrcodeUrl} alt="绑定二维码" className="h-52 w-52 rounded-lg border border-slate-100" />
                  <p className="text-xs text-slate-400">约 {Math.round(expireSeconds / 60)} 分钟内有效，扫码后自动生效</p>
                  <button
                    type="button"
                    onClick={() => void refresh()}
                    className="text-xs font-bold text-indigo-600 hover:underline"
                  >
                    刷新二维码
                  </button>
                </div>
              ) : (
                <p className="text-slate-400">二维码加载失败，请重试</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default WxMpBindModal;
