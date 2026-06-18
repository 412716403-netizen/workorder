import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Scale } from 'lucide-react';
import { formatWeightKg } from '../../utils/scanWeightCheck';
import { notifyScanImeCompositionStart } from '../../utils/scanPassthroughInput';

export interface ScaleWeightInputProps {
  weightKg: number | null;
  onCaptureInput: (raw: string) => void;
  /** Enter（扫码枪结束符）按下时回调；用于立即提交，不等防抖 */
  onCaptureSubmit?: (raw: string) => void;
  onCaptureBlur?: () => void;
  /** 中文输入法开始组字时回调（用于提示切换英文半角后再扫码） */
  onImeCompositionStart?: () => void;
}

export interface ScaleWeightInputHandle {
  clear: () => void;
  getRaw: () => string;
  focus: () => void;
}

/**
 * HID 键盘秤专用接收框（非受控 + 原生 input 事件）。
 * 标记 data-scan-manual-input，扫码 hook 不拦截按键。
 */
export const ScaleWeightInput = forwardRef<ScaleWeightInputHandle, ScaleWeightInputProps>(
  function ScaleWeightInput(
    { weightKg, onCaptureInput, onCaptureSubmit, onCaptureBlur, onImeCompositionStart },
    ref,
  ) {
    const inputRef = useRef<HTMLInputElement>(null);
    const onCaptureRef = useRef(onCaptureInput);
    onCaptureRef.current = onCaptureInput;
    const onCaptureSubmitRef = useRef(onCaptureSubmit);
    onCaptureSubmitRef.current = onCaptureSubmit;
    const onImeCompositionStartRef = useRef(onImeCompositionStart);
    onImeCompositionStartRef.current = onImeCompositionStart;

    useImperativeHandle(ref, () => ({
      clear: () => {
        if (inputRef.current) inputRef.current.value = '';
      },
      getRaw: () => inputRef.current?.value ?? '',
      focus: () => inputRef.current?.focus(),
    }));

    useEffect(() => {
      const el = inputRef.current;
      if (!el) return;
      const sync = () => onCaptureRef.current(el.value);
      el.addEventListener('input', sync);
      return () => el.removeEventListener('input', sync);
    }, []);

    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2.5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-indigo-600 shadow-sm">
              <Scale className="h-4 w-4" />
            </span>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">当前秤重</div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-black tabular-nums text-slate-900">
                  {weightKg != null ? formatWeightKg(weightKg) : '—'}
                </span>
                <span className="text-[10px] font-bold text-slate-500">kg</span>
              </div>
            </div>
          </div>
          <div className="min-w-[8rem] flex-1">
            <label className="mb-0.5 block text-[9px] font-bold uppercase text-slate-400">
              秤输出（自动接收）
            </label>
            <input
              ref={inputRef}
              type="text"
              defaultValue=""
              onCompositionStart={() =>
                onImeCompositionStartRef.current?.() ?? notifyScanImeCompositionStart()
              }
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const v = e.currentTarget.value;
                  if (onCaptureSubmitRef.current) onCaptureSubmitRef.current(v);
                  else onCaptureRef.current(v);
                }
              }}
              onBlur={onCaptureBlur}
              data-scan-manual-input="true"
              data-scale-capture-input="true"
              className="w-full rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-xs font-bold tabular-nums text-slate-800 ring-1 ring-indigo-100 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="放货稳定后自动填入"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
          放货待重量显示 → 扫本包标签 → 换下一包重复。无需回到电脑前操作。
        </p>
      </div>
    );
  },
);
