import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Keyboard, X } from 'lucide-react';
import { useScanPassthroughInputSubmit } from '../../hooks/useScanPassthroughInputSubmit';
import { notifyScanImeCompositionStart } from '../../utils/scanPassthroughInput';

export interface CameraScannerModalProps {
  onClose: () => void;
  onScan: (value: string) => void;
}

/**
 * 摄像头扫码弹窗：懒加载 @zxing/browser，供即时扫码入口与追溯等使用。
 */
export function CameraScannerModal({ onClose, onScan }: CameraScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [manual, setManual] = useState('');
  const manualRef = useRef('');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  const { handleValue: handlePassthroughScan, cancel: cancelPassthroughScan } =
    useScanPassthroughInputSubmit(
      raw => {
        onScan(raw);
        setManual('');
        manualRef.current = '';
      },
      {
        onUnrecognized: () => {
          setManual('');
          manualRef.current = '';
        },
      },
    );

  // 显式提交（Enter / 确认）：先取消流式防抖，避免随后误触发重复 onScan
  const submitManual = useCallback(
    (raw: string) => {
      cancelPassthroughScan();
      const v = raw.trim();
      if (!v) return;
      onScan(v);
      setManual('');
      manualRef.current = '';
    },
    [cancelPassthroughScan, onScan],
  );

  useEffect(() => {
    let controls: { stop: () => void } | null = null;
    let mounted = true;

    (async () => {
      try {
        const mod = await import('@zxing/browser');
        if (!mounted) return;
        const reader = new mod.BrowserMultiFormatReader();
        const el = videoRef.current;
        if (!el) return;
        controls = await reader.decodeFromVideoDevice(undefined, el, (result) => {
          if (result) {
            onScan(result.getText());
          }
        });
        setStarting(false);
      } catch (e) {
        if (!mounted) return;
        setError((e as Error)?.message || '无法启动摄像头');
        setStarting(false);
      }
    })();

    return () => {
      mounted = false;
      controls?.stop();
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <Camera className="w-5 h-5 text-indigo-600" /> 摄像头扫码
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-900">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          {starting && (
            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-300">
              正在启动摄像头…
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs font-bold text-rose-300">
              {error}
            </div>
          )}
        </div>
        <div className="mt-3 space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
            <Keyboard className="w-3 h-3" /> 手工粘贴 token / URL
          </label>
          <div className="flex gap-1">
            <input
              type="text"
              value={manual}
              onChange={e => {
                const v = e.target.value;
                setManual(v);
                manualRef.current = v;
                handlePassthroughScan(v, () => manualRef.current);
              }}
              onCompositionStart={() => notifyScanImeCompositionStart()}
              onKeyDown={e => {
                if (e.key === 'Enter' && manual.trim()) {
                  submitManual(manual);
                }
              }}
              className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
              placeholder="粘贴后按回车"
              data-scan-gun-passthrough="true"
            />
            <button
              type="button"
              onClick={() => submitManual(manual)}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
              disabled={!manual.trim()}
            >
              确认
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
