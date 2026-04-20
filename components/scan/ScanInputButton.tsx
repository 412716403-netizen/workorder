import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScanLine, Camera, X, Keyboard } from 'lucide-react';
import { toast } from 'sonner';
import { useScanGun } from '../../hooks/useScanGun';
import { parseScanPayload, type ScanPayload } from '../../utils/scanPayload';

export interface ScanInputButtonProps {
  onScan: (payload: ScanPayload) => void;
  /** 按钮尺寸：默认与 input 同高 */
  size?: 'sm' | 'md';
  /** 文案提示，显示在激活态按钮旁 */
  hint?: string;
  disabled?: boolean;
  className?: string;
  title?: string;
}

/**
 * 扫码入口按钮：点一下进入"激活态"，扫码枪扫码直达 onScan；
 * 右键或长按 400ms 打开摄像头扫码（懒加载 @zxing/browser）。
 */
export function ScanInputButton({
  onScan,
  size = 'md',
  hint,
  disabled,
  className = '',
  title,
}: ScanInputButtonProps) {
  const [active, setActive] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const handleValue = useCallback(
    (raw: string) => {
      const payload = parseScanPayload(raw);
      if (payload.kind === 'UNKNOWN' || !payload.token) {
        toast.error(`无法识别的扫码内容：${raw.slice(0, 30)}`);
        return;
      }
      onScan(payload);
    },
    [onScan],
  );

  useScanGun({
    active: active && !cameraOpen,
    onScan: handleValue,
  });

  useEffect(() => {
    if (!active) return;
    const off = () => setActive(false);
    window.addEventListener('blur', off);
    return () => window.removeEventListener('blur', off);
  }, [active]);

  const dim = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  const iconDim = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <>
      <span className={`inline-flex items-center gap-1 ${className}`}>
        <button
          type="button"
          disabled={disabled}
          title={title ?? (active ? '扫码中，扫码枪扫一下即可' : '点击激活扫码枪 / 长按打开摄像头')}
          onClick={() => setActive(v => !v)}
          onContextMenu={e => {
            e.preventDefault();
            setCameraOpen(true);
          }}
          className={`${dim} inline-flex items-center justify-center rounded-lg border transition-colors ${
            active
              ? 'bg-indigo-600 border-indigo-600 text-white animate-pulse'
              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-indigo-600'
          } disabled:opacity-40`}
        >
          <ScanLine className={iconDim} />
        </button>
        {size !== 'sm' && (
          <button
            type="button"
            disabled={disabled}
            title="用摄像头扫码"
            onClick={() => setCameraOpen(true)}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-40"
          >
            <Camera className={iconDim} />
          </button>
        )}
        {active && hint && (
          <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">{hint ?? '扫码中'}</span>
        )}
      </span>
      {cameraOpen && (
        <CameraScannerModal
          onClose={() => setCameraOpen(false)}
          onScan={value => {
            handleValue(value);
            setCameraOpen(false);
          }}
        />
      )}
    </>
  );
}

/**
 * 摄像头扫码弹窗：懒加载 @zxing/browser，避免首屏成本。
 */
function CameraScannerModal({
  onClose,
  onScan,
}: {
  onClose: () => void;
  onScan: (value: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [manual, setManual] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

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
              onChange={e => setManual(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && manual.trim()) {
                  onScan(manual.trim());
                }
              }}
              className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
              placeholder="粘贴后按回车"
              data-scan-gun-passthrough="true"
            />
            <button
              type="button"
              onClick={() => manual.trim() && onScan(manual.trim())}
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

export default ScanInputButton;
