import React, { useCallback, useState } from 'react';
import { ScanLine, Camera, Keyboard } from 'lucide-react';
import { useScanGun } from '../../hooks/useScanGun';
import { formatScanRecentChipText, parseScanPayload, type ScanPayload } from '../../utils/scanPayload';
import { playScanErrorSound, playScanSuccessSound } from '../../utils/scanFeedbackSound';
import { CameraScannerModal } from './CameraScannerModal';
import { formStandardLabelClass } from '../../styles/uiDensity';

/**
 * 大号扫码面板，追溯页 / 专用扫码页使用。
 * 支持：扫码枪（可开关激活）+ 可选摄像头 + 手工粘贴输入。
 */
export function ScanPanel({
  onScan,
  placeholder = '扫码枪扫一下 / 粘贴 token / 打开摄像头',
  autoActivate = true,
  suppressDispatchSounds = false,
  showCameraButton = true,
  recentDisplayByRaw,
}: {
  onScan: (payload: ScanPayload) => void;
  placeholder?: string;
  autoActivate?: boolean;
  /** 为 true 时不播放解析成功/失败提示音（由 onScan 内异步逻辑统一处理，如产品追溯） */
  suppressDispatchSounds?: boolean;
  /** 为 false 时隐藏摄像头入口（如产品追溯仅允许扫码枪） */
  showCameraButton?: boolean;
  /** 最近扫码芯片展示文案：key 为当次读入的原始字符串（与 `ScanPayload.raw` 一致），value 为产品名等短标签 */
  recentDisplayByRaw?: Record<string, string>;
}) {
  const [active, setActive] = useState(autoActivate);
  const [manual, setManual] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  const dispatch = useCallback(
    (raw: string) => {
      const payload = parseScanPayload(raw);
      setRecent(prev => [raw, ...prev.filter(r => r !== raw)].slice(0, 5));
      if (payload.kind === 'UNKNOWN' || !payload.token) {
        if (!suppressDispatchSounds) playScanErrorSound();
      } else if (!suppressDispatchSounds) {
        playScanSuccessSound();
      }
      onScan(payload);
    },
    [onScan, suppressDispatchSounds],
  );

  useScanGun({ active: active && (!showCameraButton || !cameraOpen), onScan: dispatch });

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
        {showCameraButton ? (
          <button
            type="button"
            onClick={() => setCameraOpen(true)}
            className="px-3 h-9 rounded-xl text-xs font-bold bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 flex items-center gap-1"
          >
            <Camera className="w-3.5 h-3.5" /> 摄像头
          </button>
        ) : null}
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
          <span className={formStandardLabelClass}>最近扫码</span>
          <div className="flex flex-wrap gap-1.5">
            {recent.map((r) => {
              const display = recentDisplayByRaw?.[r] ?? formatScanRecentChipText(r);
              const isProductLabel = Boolean(recentDisplayByRaw?.[r]);
              return (
              <button
                key={r}
                type="button"
                onClick={() => dispatch(r)}
                className={`rounded-full bg-slate-50 px-2.5 py-1 text-[10px] hover:bg-slate-100 max-w-[min(100%,14rem)] truncate ${
                  isProductLabel ? 'font-bold text-slate-700' : 'font-mono text-slate-500'
                }`}
                title={r}
              >
                {display}
              </button>
              );
            })}
          </div>
        </div>
      )}

      {showCameraButton && cameraOpen ? (
        <CameraScannerModal
          onClose={() => setCameraOpen(false)}
          onScan={value => {
            dispatch(value);
            setCameraOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

export default ScanPanel;
