import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScanLine, Camera, Keyboard } from 'lucide-react';
import { useScanGun } from '../../hooks/useScanGun';
import { parseScanPayload, type ScanPayload } from '../../utils/scanPayload';

/**
 * 大号扫码面板，追溯页 / 专用扫码页使用。
 * 支持：扫码枪（默认激活）+ 摄像头预览 + 手工粘贴输入。
 */
export function ScanPanel({
  onScan,
  placeholder = '扫码枪扫一下 / 粘贴 token / 打开摄像头',
  autoActivate = true,
}: {
  onScan: (payload: ScanPayload) => void;
  placeholder?: string;
  autoActivate?: boolean;
}) {
  const [active, setActive] = useState(autoActivate);
  const [manual, setManual] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  const dispatch = useCallback(
    (raw: string) => {
      const payload = parseScanPayload(raw);
      setRecent(prev => [raw, ...prev.filter(r => r !== raw)].slice(0, 5));
      onScan(payload);
    },
    [onScan],
  );

  useScanGun({ active: active && !cameraOpen, onScan: dispatch });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl transition-colors ${
            active ? 'bg-indigo-600 text-white animate-pulse' : 'bg-slate-100 text-slate-400'
          }`}
        >
          <ScanLine className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-black text-slate-900">产品追溯扫码</h2>
          <p className="text-xs text-slate-500 mt-0.5">{placeholder}</p>
        </div>
        <button
          type="button"
          onClick={() => setActive(v => !v)}
          className={`px-3 h-9 rounded-xl text-xs font-bold transition-colors ${
            active
              ? 'bg-indigo-50 text-indigo-600 border border-indigo-200'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          {active ? '扫码枪已就绪' : '激活扫码枪'}
        </button>
        <button
          type="button"
          onClick={() => setCameraOpen(true)}
          className="px-3 h-9 rounded-xl text-xs font-bold bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 flex items-center gap-1"
        >
          <Camera className="w-3.5 h-3.5" /> 摄像头
        </button>
      </div>

      <div className="flex items-center gap-2">
        <Keyboard className="w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={manual}
          onChange={e => setManual(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && manual.trim()) {
              dispatch(manual.trim());
              setManual('');
            }
          }}
          placeholder="粘贴 URL 或 token，按回车"
          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
          data-scan-gun-passthrough="true"
        />
        <button
          type="button"
          onClick={() => {
            if (manual.trim()) {
              dispatch(manual.trim());
              setManual('');
            }
          }}
          disabled={!manual.trim()}
          className="px-4 h-10 rounded-xl text-sm font-bold bg-indigo-600 text-white disabled:opacity-40"
        >
          查询
        </button>
      </div>

      {recent.length > 0 && (
        <div className="pt-3 border-t border-slate-100 space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase">最近扫码</span>
          <div className="flex flex-wrap gap-1.5">
            {recent.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => dispatch(r)}
                className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-mono text-slate-500 hover:bg-slate-100"
                title={r}
              >
                {r.length > 28 ? `…${r.slice(-24)}` : r}
              </button>
            ))}
          </div>
        </div>
      )}

      {cameraOpen && (
        <CameraModal
          onClose={() => setCameraOpen(false)}
          onScan={value => {
            dispatch(value);
            setCameraOpen(false);
          }}
        />
      )}
    </div>
  );
}

function CameraModal({
  onClose,
  onScan,
}: {
  onClose: () => void;
  onScan: (value: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          if (result) onScan(result.getText());
        });
      } catch (e) {
        if (!mounted) return;
        setError((e as Error)?.message || '无法启动摄像头');
      }
    })();
    return () => {
      mounted = false;
      controls?.stop();
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-black text-slate-900 mb-3 flex items-center gap-2">
          <Camera className="w-5 h-5 text-indigo-600" /> 摄像头扫码
        </h3>
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-900">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          {error && (
            <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs font-bold text-rose-300">
              {error}
            </div>
          )}
        </div>
        <div className="mt-3 text-right">
          <button
            type="button"
            onClick={onClose}
            className="px-4 h-9 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

export default ScanPanel;
