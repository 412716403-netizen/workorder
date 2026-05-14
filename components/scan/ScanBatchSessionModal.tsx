import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScanLine, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useScanGun } from '../../hooks/useScanGun';
import { itemCodesApi } from '../../services/api';
import {
  parseScanPayload,
  rewriteScanApiErrorForIme,
  scanRawLooksLikeImeCorruption,
  type ScanPayload,
} from '../../utils/scanPayload';
import { normalizeScanPayloadForIntent, type ScanIntent } from '../../utils/scanBatchIntent';
import type { ScanBatchRowDetail } from '../../utils/scanBatchRowDetail';
import { playScanErrorSound, playScanSuccessSound } from '../../utils/scanFeedbackSound';

export type { ScanBatchRowDetail } from '../../utils/scanBatchRowDetail';
export type { ScanIntent } from '../../utils/scanBatchIntent';

export interface ScanBatchSessionModalProps {
  open: boolean;
  onClose: () => void;
  /** 返回 false 时弹窗保持打开；void/undefined/true 时关闭并清空列表 */
  onApply: (payloads: ScanPayload[]) => void | Promise<boolean | void>;
  /** 扫入后解析展示字段（产品名、颜色、尺码、数量）；失败返回 null 且不应加入列表 */
  resolveRowPreview?: (payload: ScanPayload) => Promise<ScanBatchRowDetail | null>;
  title?: string;
  hint?: string;
  /** 是否显示底部手工粘贴区（默认 true） */
  allowManualPaste?: boolean;
  /** 为 true 时显示「批次码 / 单品码」扫码方式，并在扫入后按方式归一化 payload（默认 false，保持旧行为） */
  showScanIntentToggle?: boolean;
  /** 与 `showScanIntentToggle` 配合：每次打开弹窗时的默认扫码方式（未传时组件内默认为「批次码」） */
  defaultScanIntent?: ScanIntent;
}

type Row = { id: string; payload: ScanPayload; detail: ScanBatchRowDetail };

function rowKey(p: ScanPayload): string {
  return `${p.kind}:${p.token ?? ''}`;
}

function nextRowId(): string {
  return `scan-row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function fallbackDetail(payload: ScanPayload): ScanBatchRowDetail {
  const token = payload.token ?? '';
  const short = token.length > 24 ? `${token.slice(0, 20)}…` : token;
  return {
    kindLabel: payload.kind === 'BATCH' ? '批次' : '单品',
    productName: short || '—',
    colorName: '—',
    sizeName: '—',
    quantity: payload.kind === 'BATCH' ? 0 : 1,
    specNote: null,
  };
}

export function ScanBatchSessionModal({
  open,
  onClose,
  onApply,
  resolveRowPreview,
  title = '批量扫码',
  hint = '请使用扫码枪；请先切换到英文（半角）输入法。扫入的码将显示在下方列表，确认后一次性写入单据。',
  allowManualPaste = true,
  showScanIntentToggle = false,
  defaultScanIntent = 'BATCH',
}: ScanBatchSessionModalProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [manual, setManual] = useState('');
  const [applying, setApplying] = useState(false);
  const [scanIntent, setScanIntent] = useState<ScanIntent>(defaultScanIntent);
  const keysRef = useRef<Set<string>>(new Set());
  const serialChainRef = useRef<Promise<void>>(Promise.resolve());
  const resolveRef = useRef(resolveRowPreview);
  resolveRef.current = resolveRowPreview;

  useEffect(() => {
    if (!open) {
      setRows([]);
      setManual('');
      keysRef.current = new Set();
      return;
    }
    if (showScanIntentToggle) {
      setScanIntent(defaultScanIntent);
    }
  }, [open, showScanIntentToggle, defaultScanIntent]);

  const pushRow = useCallback((payload: ScanPayload, detail: ScanBatchRowDetail) => {
    setRows(prev => [...prev, { id: nextRowId(), payload, detail }]);
  }, []);

  const ingestRaw = useCallback(
    (raw: string) => {
      const parsed = parseScanPayload(raw);
      if (parsed.kind === 'UNKNOWN' || !parsed.token) {
        const preview = `${raw.slice(0, 30)}${raw.length > 30 ? '…' : ''}`;
        const imeHint = scanRawLooksLikeImeCorruption(raw)
          ? '检测到可能为中文输入法误转（如「。」「—」或全角字母数字）。请切换到英文（半角）输入法后重扫。'
          : undefined;
        toast.error(`无法识别的扫码内容：${preview}`, imeHint ? { description: imeHint } : undefined);
        playScanErrorSound();
        return;
      }

      serialChainRef.current = serialChainRef.current
        .then(async () => {
          try {
            let payload: ScanPayload = parsed;
            if (showScanIntentToggle) {
              const n = await normalizeScanPayloadForIntent(scanIntent, parsed, {
                scanItemByToken: async t => {
                  const r = await itemCodesApi.scan(t);
                  if (r.kind !== 'ITEM_CODE') {
                    throw new Error('扫码返回类型异常');
                  }
                  return r;
                },
              });
              if (!n.ok) {
                toast.error(n.message);
                playScanErrorSound();
                return;
              }
              payload = n.payload;
            }

            const key = rowKey(payload);
            if (keysRef.current.has(key)) {
              toast.warning('该码已在列表中');
              playScanErrorSound();
              return;
            }
            keysRef.current.add(key);

            const resolver = resolveRef.current;
            if (resolver) {
              try {
                const detail = await resolver(payload);
                if (!detail) {
                  keysRef.current.delete(key);
                  playScanErrorSound();
                  return;
                }
                pushRow(payload, detail);
                playScanSuccessSound();
              } catch (e) {
                keysRef.current.delete(key);
                const msg = rewriteScanApiErrorForIme(raw, (e as Error)?.message || '解析扫码失败');
                toast.error(msg);
                playScanErrorSound();
              }
              return;
            }

            pushRow(payload, fallbackDetail(payload));
            playScanSuccessSound();
          } catch (e) {
            toast.error((e as Error)?.message || '扫码处理失败');
            playScanErrorSound();
          }
        })
        .catch(() => {});
    },
    [pushRow, showScanIntentToggle, scanIntent],
  );

  useScanGun({
    active: open,
    onScan: ingestRaw,
  });

  const removeRow = useCallback((id: string) => {
    setRows(prev => {
      const row = prev.find(r => r.id === id);
      if (row) {
        keysRef.current.delete(rowKey(row.payload));
      }
      return prev.filter(r => r.id !== id);
    });
  }, []);

  const clearAll = useCallback(() => {
    setRows([]);
    keysRef.current = new Set();
  }, []);

  const handleConfirm = useCallback(async () => {
    if (rows.length === 0) {
      toast.warning('请先扫码或粘贴至少一条有效内容');
      return;
    }
    setApplying(true);
    try {
      const payloads = rows.map(r => r.payload);
      const result = await onApply(payloads);
      if (result !== false) {
        onClose();
      }
    } catch (e) {
      toast.error((e as Error)?.message || '应用失败');
    } finally {
      setApplying(false);
    }
  }, [rows, onApply, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scan-batch-title"
    >
      <div
        className="flex max-h-[min(90dvh,32rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <ScanLine className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 id="scan-batch-title" className="truncate text-sm font-black text-slate-900">
                {title}
              </h2>
              <p className="mt-0.5 text-[10px] font-medium leading-snug text-slate-500">{hint}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {showScanIntentToggle ? (
          <div className="shrink-0 border-b border-slate-100 px-4 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">扫码方式</div>
            <div className="mt-1.5 flex gap-1.5" role="tablist" aria-label="扫码方式">
              <button
                type="button"
                role="tab"
                aria-selected={scanIntent === 'BATCH'}
                onClick={() => setScanIntent('BATCH')}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-bold transition-colors ${
                  scanIntent === 'BATCH'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                批次码
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={scanIntent === 'ITEM'}
                onClick={() => setScanIntent('ITEM')}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-bold transition-colors ${
                  scanIntent === 'ITEM'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                单品码
              </button>
            </div>
            <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
              {scanIntent === 'ITEM'
                ? '仅接受单品码；扫批次码将提示不匹配。'
                : '接受批次码；扫单品码时若有关联批次则按批次展示与累计，否则提示无批次信息。'}
            </p>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-3 py-8 text-center text-xs text-slate-500">
              列表为空。请用扫码枪扫入二维码，或在下方粘贴后按回车。
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map((r, i) => (
                <li
                  key={r.id}
                  className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50/90 px-2.5 py-2.5"
                >
                  <span className="w-6 shrink-0 pt-0.5 text-center text-[11px] font-black tabular-nums text-slate-400">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-indigo-700">
                        {r.detail.kindLabel}
                      </span>
                      <span className="min-w-0 text-xs font-black text-slate-900">{r.detail.productName}</span>
                    </div>
                    <div className="text-[11px] leading-snug text-slate-600">
                      <span>
                        颜色 <span className="font-bold text-slate-800">{r.detail.colorName}</span>
                      </span>
                      <span className="mx-1.5 text-slate-300">·</span>
                      <span>
                        尺码 <span className="font-bold text-slate-800">{r.detail.sizeName}</span>
                      </span>
                      <span className="mx-1.5 text-slate-300">·</span>
                      <span>
                        数量 <span className="font-bold text-indigo-700 tabular-nums">{r.detail.quantity}</span> 件
                      </span>
                    </div>
                    {r.detail.specNote ? (
                      <p className="text-[10px] font-medium text-slate-500">规格 {r.detail.specNote}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(r.id)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    title="移除此条"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {allowManualPaste && (
          <div className="shrink-0 border-t border-slate-100 px-3 py-2">
            <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">粘贴 token 或 URL 后按回车</label>
            <input
              type="text"
              value={manual}
              onChange={e => setManual(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && manual.trim()) {
                  ingestRaw(manual.trim());
                  setManual('');
                }
              }}
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
              placeholder="粘贴后按回车加入列表"
              data-scan-gun-passthrough="true"
            />
          </div>
        )}

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-3 py-3">
          <button
            type="button"
            onClick={clearAll}
            disabled={rows.length === 0 || applying}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            清空列表
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={applying || rows.length === 0}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-indigo-700 disabled:opacity-40"
          >
            {applying ? '应用中…' : `确认应用（${rows.length} 条）`}
          </button>
        </div>
      </div>
    </div>
  );
}
