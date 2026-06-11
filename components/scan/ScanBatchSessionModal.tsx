import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScanLine, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useScanGun } from '../../hooks/useScanGun';
import { itemCodesApi, planVirtualBatchesApi } from '../../services/api';
import {
  getUnrecognizedScanImeHint,
  parseScanPayload,
  rewriteScanApiErrorForIme,
  type ScanPayload,
} from '../../utils/scanPayload';
import { normalizeScanPayloadForIntent, type ScanIntent } from '../../utils/scanBatchIntent';
import type { ScanBatchRowDetail } from '../../utils/scanBatchRowDetail';
import { playScanErrorSound, playScanSuccessSound } from '../../utils/scanFeedbackSound';
import { checkScanSessionOverlap } from '../../utils/scanSessionOverlap';

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
  /** 为 true 时显示「按批累计 / 按件累计」切换，并在扫入后按所选方式归一化 payload（默认 false，保持旧行为） */
  showScanIntentToggle?: boolean;
  /** 与 `showScanIntentToggle` 配合：每次打开弹窗时的默认累计方式（未传时组件内默认为「按批累计」） */
  defaultScanIntent?: ScanIntent;
  /**
   * 自定义头部插槽：渲染在标题/hint 与「累计方式」之间。
   * 用于挂载业务上下文选择（如外协收货前先选加工厂）。
   */
  headerSlot?: React.ReactNode;
  /**
   * 为 true 时禁用扫码枪监听 + 手工粘贴回车 + 「确认应用」按钮，
   * 但弹窗内容、关闭按钮仍可交互。常用于 `headerSlot` 内必填项未满足时阻断扫码。
   */
  scanDisabled?: boolean;
  /** `scanDisabled=true` 时在「列表为空」占位文案位置展示的提示文字（替换默认引导）。 */
  scanDisabledHint?: string;
  /**
   * 弹窗打开期间该值变化时清空已扫列表（如外协收货切换加工厂）。
   * 首次打开弹窗时不会因此清空（仅 prev !== current 且 prev 已定义时触发）。
   */
  sessionResetKey?: string;
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
  headerSlot,
  scanDisabled = false,
  scanDisabledHint,
  sessionResetKey,
}: ScanBatchSessionModalProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [manual, setManual] = useState('');
  const [applying, setApplying] = useState(false);
  const [scanIntent, setScanIntent] = useState<ScanIntent>(defaultScanIntent);
  const keysRef = useRef<Set<string>>(new Set());
  /**
   * 会话内「批次 ⇄ 单品」重叠拦截。三个集合互不相同：
   * - `sessionItemCodeIds`：会话中已加入的单品 ID（拒同一单品重复扫入）。
   * - `sessionBatchScannedIds`：「按批次码扫入」的批次 ID（拒重复扫同一批次，
   *   也拒之后再扫该批次包含的任何单品）。
   * - `sessionItemParentBatchIds`：会话内由「单品码」带出的父批次 ID（拒之后
   *   再扫整批，但允许同一父批次下多个单品分别扫入）。
   * 规则：
   *   扫单品 → 若 `sessionBatchScannedIds.has(parentBatchId)` 则拒；
   *   扫批次 → 若 `sessionBatchScannedIds.has(batchId)` 或
   *            `sessionItemParentBatchIds.has(batchId)` 则拒。
   */
  const sessionItemCodeIdsRef = useRef<Set<string>>(new Set());
  const sessionBatchScannedIdsRef = useRef<Set<string>>(new Set());
  const sessionItemParentBatchIdsRef = useRef<Set<string>>(new Set());
  const serialChainRef = useRef<Promise<void>>(Promise.resolve());
  const resolveRef = useRef(resolveRowPreview);
  resolveRef.current = resolveRowPreview;

  const resetSessionDedup = useCallback(() => {
    keysRef.current = new Set();
    sessionItemCodeIdsRef.current = new Set();
    sessionBatchScannedIdsRef.current = new Set();
    sessionItemParentBatchIdsRef.current = new Set();
  }, []);

  useEffect(() => {
    if (!open) {
      setRows([]);
      setManual('');
      resetSessionDedup();
      return;
    }
    if (showScanIntentToggle) {
      setScanIntent(defaultScanIntent);
    }
  }, [open, showScanIntentToggle, defaultScanIntent, resetSessionDedup]);

  const prevSessionResetKeyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!open) {
      prevSessionResetKeyRef.current = sessionResetKey;
      return;
    }
    const prev = prevSessionResetKeyRef.current;
    prevSessionResetKeyRef.current = sessionResetKey;
    if (prev !== undefined && prev !== sessionResetKey) {
      setRows([]);
      setManual('');
      resetSessionDedup();
    }
  }, [sessionResetKey, open, resetSessionDedup]);

  const pushRow = useCallback((payload: ScanPayload, detail: ScanBatchRowDetail) => {
    if (detail.itemCodeId) sessionItemCodeIdsRef.current.add(detail.itemCodeId);
    if (detail.virtualBatchId) {
      if (payload.kind === 'BATCH') {
        sessionBatchScannedIdsRef.current.add(detail.virtualBatchId);
      } else {
        sessionItemParentBatchIdsRef.current.add(detail.virtualBatchId);
      }
    }
    setRows(prev => [{ id: nextRowId(), payload, detail }, ...prev]);
  }, []);

  const ingestRaw = useCallback(
    (raw: string) => {
      if (scanDisabled) {
        if (scanDisabledHint) toast.warning(scanDisabledHint);
        playScanErrorSound();
        return;
      }
      const parsed = parseScanPayload(raw);
      if (parsed.kind === 'UNKNOWN' || !parsed.token) {
        const preview = `${raw.slice(0, 30)}${raw.length > 30 ? '…' : ''}`;
        const imeHint = getUnrecognizedScanImeHint(raw);
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
                scanBatchByToken: async t => {
                  const r = await planVirtualBatchesApi.scan(t);
                  if (r.kind !== 'VIRTUAL_BATCH') {
                    throw new Error('扫码返回类型异常');
                  }
                  return r;
                },
              });
              if (!n.ok) {
                toast.error(rewriteScanApiErrorForIme(raw, n.message));
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
                // 会话内「批次 ⇄ 单品」重叠拦截（纯函数判定）
                const overlap = checkScanSessionOverlap(
                  {
                    itemCodeIds: sessionItemCodeIdsRef.current,
                    batchScannedIds: sessionBatchScannedIdsRef.current,
                    itemParentBatchIds: sessionItemParentBatchIdsRef.current,
                  },
                  {
                    kind: payload.kind,
                    itemCodeId: detail.itemCodeId ?? null,
                    virtualBatchId: detail.virtualBatchId ?? null,
                  },
                );
                if (overlap.overlaps) {
                  keysRef.current.delete(key);
                  toast.error(overlap.message ?? '该码与已扫入的批次/单品重叠');
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
    [pushRow, showScanIntentToggle, scanIntent, scanDisabled, scanDisabledHint],
  );

  // 弹窗打开时始终监听扫码枪；`scanDisabled` 时在 ingestRaw 内 toast 提示（如外协收货未选加工厂），
  // 而非静默丢弃——否则用户直接扫码得不到任何反馈。
  useScanGun({
    active: open,
    onScan: ingestRaw,
  });

  const removeRow = useCallback((id: string) => {
    setRows(prev => {
      const row = prev.find(r => r.id === id);
      if (row) {
        keysRef.current.delete(rowKey(row.payload));
        if (row.detail.itemCodeId) sessionItemCodeIdsRef.current.delete(row.detail.itemCodeId);
        if (row.detail.virtualBatchId) {
          if (row.payload.kind === 'BATCH') {
            // 同一批次理论上只被一行批次码引用，安全删除
            sessionBatchScannedIdsRef.current.delete(row.detail.virtualBatchId);
          } else {
            // 同一父批次可能被多行单品引用，仅当列表中已无任何其他同父单品时再移除
            const stillReferenced = prev.some(
              r =>
                r.id !== id &&
                r.payload.kind === 'ITEM' &&
                r.detail.virtualBatchId === row.detail.virtualBatchId,
            );
            if (!stillReferenced) {
              sessionItemParentBatchIdsRef.current.delete(row.detail.virtualBatchId);
            }
          }
        }
      }
      return prev.filter(r => r.id !== id);
    });
  }, []);

  const clearAll = useCallback(() => {
    setRows([]);
    resetSessionDedup();
  }, [resetSessionDedup]);

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

        {headerSlot ? (
          <div className="shrink-0 border-b border-slate-100 px-4 py-2.5">{headerSlot}</div>
        ) : null}

        {showScanIntentToggle ? (
          <div className="shrink-0 border-b border-slate-100 px-4 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">累计方式</div>
            <div className="mt-1.5 flex gap-1.5" role="tablist" aria-label="扫码累计方式">
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
                按批累计
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
                按件累计
              </button>
            </div>
            <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
              {scanIntent === 'ITEM'
                ? '须扫单品标签登记；扫批次标签将提示不匹配。'
                : '可扫批次或单品标签；扫单品时若有关联批次则按该批累计，否则提示无批次信息。'}
            </p>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-3 py-8 text-center text-xs text-slate-500">
              {scanDisabled && scanDisabledHint
                ? scanDisabledHint
                : '列表为空。请用扫码枪扫入二维码，或在下方粘贴后按回车。'}
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
                      <span className="min-w-0 text-xs font-black text-slate-900">
                        {r.detail.productName}
                        {r.detail.codeLabel ? (
                          <span className="font-mono font-bold text-slate-600"> ({r.detail.codeLabel})</span>
                        ) : null}
                      </span>
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
              disabled={scanDisabled}
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
              placeholder={scanDisabled ? scanDisabledHint || '已禁用' : '粘贴后按回车加入列表'}
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
            disabled={applying || rows.length === 0 || scanDisabled}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-indigo-700 disabled:opacity-40"
          >
            {applying ? '应用中…' : `确认应用（${rows.length} 条）`}
          </button>
        </div>
      </div>
    </div>
  );
}
