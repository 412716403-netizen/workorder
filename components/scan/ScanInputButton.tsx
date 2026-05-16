import React, { useCallback, useEffect, useState } from 'react';
import { ScanLine, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { useScanGun } from '../../hooks/useScanGun';
import { getUnrecognizedScanImeHint, parseScanPayload, type ScanPayload } from '../../utils/scanPayload';
import { playScanErrorSound, playScanSuccessSound } from '../../utils/scanFeedbackSound';
import { CameraScannerModal } from './CameraScannerModal';

export interface ScanInputButtonProps {
  onScan: (payload: ScanPayload) => void;
  /** 按钮尺寸：默认与 input 同高 */
  size?: 'sm' | 'md';
  /** 文案提示，显示在激活态按钮旁 */
  hint?: string;
  disabled?: boolean;
  className?: string;
  title?: string;
  /** 是否显示摄像头扫码按钮；为 false 时不展示摄像头入口，且扫码键不再长按打开摄像头 */
  showCameraButton?: boolean;
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
  showCameraButton = true,
}: ScanInputButtonProps) {
  const [active, setActive] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const handleValue = useCallback(
    (raw: string) => {
      const payload = parseScanPayload(raw);
      if (payload.kind === 'UNKNOWN' || !payload.token) {
        const preview = `${raw.slice(0, 30)}${raw.length > 30 ? '…' : ''}`;
        const imeHint = getUnrecognizedScanImeHint(raw);
        toast.error(`无法识别的扫码内容：${preview}`, imeHint ? { description: imeHint } : undefined);
        playScanErrorSound();
        return;
      }
      playScanSuccessSound();
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
          title={
            title ??
            (active
              ? '扫码中，扫码枪扫一下即可'
              : showCameraButton
                ? '点击激活扫码枪 / 长按打开摄像头'
                : '点击激活扫码枪')
          }
          onClick={() => setActive(v => !v)}
          onContextMenu={
            showCameraButton
              ? e => {
                  e.preventDefault();
                  setCameraOpen(true);
                }
              : undefined
          }
          className={`${dim} inline-flex items-center justify-center rounded-lg border transition-colors ${
            active
              ? 'bg-indigo-600 border-indigo-600 text-white animate-pulse'
              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-indigo-600'
          } disabled:opacity-40`}
        >
          <ScanLine className={iconDim} />
        </button>
        {showCameraButton && size !== 'sm' && (
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

export default ScanInputButton;
