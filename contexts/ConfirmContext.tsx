import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** 使用危险操作主按钮样式 */
  danger?: boolean;
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<(v: boolean) => void>(() => {});

  const confirm = useCallback<ConfirmFn>((o) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOpts(o);
      setOpen(true);
    });
  }, []);

  const finish = (result: boolean) => {
    setOpen(false);
    setOpts(null);
    resolverRef.current(result);
  };

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {open && opts && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            aria-label="关闭"
            onClick={() => finish(false)}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="app-confirm-title"
            aria-describedby="app-confirm-desc"
            className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="app-confirm-title" className="text-lg font-semibold text-slate-900 tracking-tight">
              {opts.title ?? '请确认'}
            </h2>
            <p id="app-confirm-desc" className="mt-2 text-sm leading-relaxed text-slate-600 whitespace-pre-wrap">
              {opts.message}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => finish(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                {opts.cancelText ?? '取消'}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => finish(true)}
                className={
                  opts.danger
                    ? 'rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700'
                    : 'rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700'
                }
              >
                {opts.confirmText ?? '确定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm 必须在 ConfirmProvider 内使用');
  }
  return ctx;
}
