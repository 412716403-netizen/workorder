import React, { useCallback, useState } from 'react';
import {
  ScanSearch,
  Factory,
  PackageCheck,
  RotateCw,
  Warehouse,
  ArrowLeftRight,
  CircleDot,
  Building2,
  Hash,
  Tag,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import ScanPanel from '../components/scan/ScanPanel';
import { getUnrecognizedScanImeHint, rewriteScanApiErrorForIme, type ScanPayload } from '../utils/scanPayload';
import { itemCodesApi } from '../services/api';
import type { ScanItemCodeResult, TraceEvent, TraceResult } from '../types';
import { formatItemCodeSerialLabel } from '../utils/serialLabels';
import { playScanErrorSound, playScanSuccessSound } from '../utils/scanFeedbackSound';

const TRACE_PAGE_SIZE = 50;

/**
 * 产品追溯查询页：仅支持扫单品码；扫码后展示码信息与单件口径生产链路时间轴。
 */
export default function TraceView() {
  const [loading, setLoading] = useState(false);
  const [scan, setScan] = useState<ScanItemCodeResult | null>(null);
  const [trace, setTrace] = useState<TraceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [traceToken, setTraceToken] = useState<string | null>(null);
  const [tracePage, setTracePage] = useState(1);
  const [traceLoadingMore, setTraceLoadingMore] = useState(false);
  const [recentDisplayByRaw, setRecentDisplayByRaw] = useState<Record<string, string>>({});

  const executeTrace = useCallback(async (payload: ScanPayload): Promise<ScanItemCodeResult | null> => {
    if (payload.kind === 'UNKNOWN' || !payload.token) {
      const preview = `${payload.raw.slice(0, 32)}${payload.raw.length > 32 ? '…' : ''}`;
      const imeHint = getUnrecognizedScanImeHint(payload.raw);
      playScanErrorSound();
      toast.error(`无法识别：${preview}`, imeHint ? { description: imeHint } : undefined);
      return null;
    }
    if (payload.kind === 'BATCH') {
      playScanErrorSound();
      toast.error('产品追溯仅支持扫单品码，请勿扫批次码');
      return null;
    }
    setLoading(true);
    setError(null);
    setScan(null);
    setTrace(null);
    setTraceToken(payload.token);
    setTracePage(1);
    try {
      const s = await itemCodesApi.scan(payload.token);
      if (s.kind !== 'ITEM_CODE') {
        toast.error('扫码结果类型异常');
        return null;
      }
      try {
        const t = await itemCodesApi.trace(payload.token, { page: 1, pageSize: TRACE_PAGE_SIZE });
        setTrace(t);
      } catch (traceErr) {
        setTrace(null);
        toast.error((traceErr as Error)?.message || '加载生产链路时间轴失败');
      }
      setScan(s);
      return s;
    } catch (e) {
      playScanErrorSound();
      const msg = rewriteScanApiErrorForIme(payload.raw, (e as Error)?.message || '查询失败');
      setError(msg);
      toast.error(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const onScan = useCallback(
    (payload: ScanPayload) => {
      void (async () => {
        const s = await executeTrace(payload);
        if (s) {
          playScanSuccessSound();
          const label =
            s.serialLabel?.trim() ||
            (s.planNumber && s.serialNo != null
              ? formatItemCodeSerialLabel(s.planNumber, s.serialNo, {
                  batchSequenceNo: s.batchSequenceNo,
                  batchPieceNo: s.batchPieceNo,
                })
              : null) ||
            (s.productName ?? s.sku)?.trim() ||
            '—';
          setRecentDisplayByRaw(prev => ({ ...prev, [payload.raw]: label }));
        }
      })();
    },
    [executeTrace],
  );

  const loadMoreTrace = useCallback(async () => {
    if (!traceToken || !trace?.hasMore || traceLoadingMore) return;
    setTraceLoadingMore(true);
    try {
      const nextPage = tracePage + 1;
      const t = await itemCodesApi.trace(traceToken, { page: nextPage, pageSize: TRACE_PAGE_SIZE });
      setTrace(prev =>
        prev
          ? {
              ...prev,
              events: [...prev.events, ...t.events],
              total: t.total,
              page: t.page,
              pageSize: t.pageSize,
              hasMore: t.hasMore,
            }
          : t,
      );
      setTracePage(nextPage);
    } catch (e) {
      toast.error((e as Error)?.message || '加载更多失败');
    } finally {
      setTraceLoadingMore(false);
    }
  }, [traceToken, trace?.hasMore, traceLoadingMore, tracePage]);

  return (
    <div className="max-w-5xl mx-auto space-y-5 py-4">
      <header className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
          <ScanSearch className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-black text-slate-900">产品追溯查询</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            仅支持扫单品码：扫码枪或粘贴查询；每扫一次展示该单品码的生产链路（不含批次码）
          </p>
        </div>
      </header>

      <ScanPanel
        onScan={onScan}
        suppressDispatchSounds
        showCameraButton={false}
        recentDisplayByRaw={recentDisplayByRaw}
        placeholder="仅支持扫单品码：粘贴 URL 或 token 后按回车或扫码枪扫入"
      />

      {loading && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          正在查询…
        </div>
      )}

      {error && !loading && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {scan && !loading && (
        <>
          <ScanSummaryCard scan={scan} />
          <TimelineCard trace={trace} onLoadMore={loadMoreTrace} loadingMore={traceLoadingMore} />
        </>
      )}
    </div>
  );
}

function ScanSummaryCard({ scan }: { scan: ScanItemCodeResult }) {
  if (scan.status === 'VOIDED') {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex items-center gap-2">
        <AlertCircle className="w-4 h-4" />
        该单品码已作废：{scan.message}
      </div>
    );
  }

  const serialLabel =
    scan.serialLabel?.trim() ||
    (scan.planNumber && scan.serialNo != null
      ? formatItemCodeSerialLabel(scan.planNumber, scan.serialNo, {
          batchSequenceNo: scan.batchSequenceNo,
          batchPieceNo: scan.batchPieceNo,
        })
      : null);

  const fields: Array<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = [
    { icon: <Tag className="w-3.5 h-3.5" />, label: '产品', value: scan.productName || scan.sku || '-' },
    { icon: <Hash className="w-3.5 h-3.5" />, label: '规格', value: scan.variantLabel || '（无规格）' },
    {
      icon: <Factory className="w-3.5 h-3.5" />,
      label: '计划单',
      value: scan.planNumber || '-',
    },
    {
      icon: <Building2 className="w-3.5 h-3.5" />,
      label: '所属企业',
      value: scan.ownerTenantName || '-',
    },
  ];
  if (scan.batchSerialLabel) {
    fields.push({ icon: <PackageCheck className="w-3.5 h-3.5" />, label: '所属批次', value: scan.batchSerialLabel });
  }
  if (scan.orderNumbers && scan.orderNumbers.length > 0) {
    fields.push({
      icon: <CircleDot className="w-3.5 h-3.5" />,
      label: '所属工单',
      value: scan.orderNumbers.join('，'),
    });
  }

  const ctx = scan.callerContext;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-600">
            单品码
          </span>
          {serialLabel && (
            <span className="text-base font-black text-slate-900 font-mono">{serialLabel}</span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {fields.map((f, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-slate-400">{f.icon}</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase w-16 shrink-0">{f.label}</span>
            <span className="text-sm font-bold text-slate-800 truncate">{f.value}</span>
          </div>
        ))}
      </div>
      {ctx && ctx.callerPlanOrderId && ctx.relation !== 'OWNER' && (
        <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600">
          <span className="font-bold text-slate-500">本企业视角：</span>
          <span className="ml-1">关系 <span className="font-bold text-indigo-600">{relationLabel(ctx.relation)}</span></span>
          <span className="ml-3">计划 <span className="font-mono">{ctx.callerPlanNumber}</span></span>
          {ctx.callerOrderNumbers.length > 0 && (
            <span className="ml-3">工单 <span className="font-mono">{ctx.callerOrderNumbers.join('，')}</span></span>
          )}
        </div>
      )}
    </div>
  );
}

function relationLabel(r: 'OWNER' | 'DOWNSTREAM' | 'UPSTREAM' | 'PEER'): string {
  switch (r) {
    case 'OWNER':
      return '本企业原码';
    case 'DOWNSTREAM':
      return '下游承接';
    case 'UPSTREAM':
      return '上游派发';
    case 'PEER':
      return '同树协作';
  }
}

function TimelineCard({
  trace,
  onLoadMore,
  loadingMore,
}: {
  trace: TraceResult | null;
  onLoadMore: () => void;
  loadingMore: boolean;
}) {
  const scopeNote = trace?.scopeNote?.trim();

  if (!trace || trace.events.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-black text-slate-900 mb-2">
          生产链路时间轴
          {trace?.itemSerialLabel ? (
            <span className="ml-2 font-mono text-indigo-600">{trace.itemSerialLabel}</span>
          ) : null}
        </h3>
        <div className="text-xs text-slate-400 py-6 text-center">暂无与该单品码匹配的生产事件</div>
        {scopeNote ? <p className="text-[10px] text-slate-400 text-center leading-snug">{scopeNote}</p> : null}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-sm font-black text-slate-900">
          生产链路时间轴
          {trace.itemSerialLabel ? (
            <span className="ml-2 font-mono text-indigo-600">{trace.itemSerialLabel}</span>
          ) : null}
        </h3>
        <span className="text-[10px] text-slate-400">
          已加载 {trace.events.length}
          {trace.total != null ? ` / 共 ${trace.total}` : ''} 条事件 · {trace.tenants.length} 家企业
        </span>
      </div>
      <div className="relative pl-5">
        <div className="absolute left-1.5 top-1 bottom-1 w-px bg-slate-200" />
        <ul className="space-y-3">
          {trace.events.map(ev => (
            <TimelineItem key={`${ev.kind}-${ev.id}`} event={ev} />
          ))}
        </ul>
      </div>
      {trace.hasMore && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void onLoadMore()}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {loadingMore
              ? '加载中…'
              : trace.total != null
                ? `加载更多（约 ${Math.max(0, trace.total - trace.events.length)} 条未显示）`
                : '加载更多'}
          </button>
        </div>
      )}
      {scopeNote ? (
        <p className="mt-4 text-[10px] text-slate-400 leading-snug">{scopeNote}</p>
      ) : (
        <p className="mt-4 text-[10px] text-slate-400">
          注：仅展示扫码报工/扫码入库时写入关联的事件；同批次下各单品码共享批次链路。
        </p>
      )}
    </div>
  );
}

function TimelineItem({ event }: { event: TraceEvent }) {
  const { icon, tone, title } = eventMeta(event);
  return (
    <li className="relative">
      <div className={`absolute -left-[1.1rem] top-1 h-2.5 w-2.5 rounded-full ${tone.dot}`} />
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 h-7 w-7 shrink-0 rounded-lg flex items-center justify-center ${tone.bg}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-black text-slate-900">{title}</span>
            <span className="text-[10px] text-slate-400">{formatTime(event.timestamp)}</span>
            {event.tenantName && (
              <span className="rounded bg-slate-100 px-1.5 py-px text-[10px] font-bold text-slate-600">
                {event.tenantName}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600">
            <span>数量 <span className="font-bold text-slate-900">{event.quantity}</span></span>
            {event.orderNumber && <span>工单 <span className="font-mono text-slate-700">{event.orderNumber}</span></span>}
            {event.nodeName && <span>工序 <span className="font-medium text-slate-700">{event.nodeName}</span></span>}
            {event.operator && <span>操作人 {event.operator}</span>}
            {event.partner && <span>合作方 {event.partner}</span>}
          </div>
          {event.notes && <p className="mt-1 text-[10px] text-slate-400 line-clamp-2">{event.notes}</p>}
        </div>
      </div>
    </li>
  );
}

function eventMeta(e: TraceEvent): {
  icon: React.ReactNode;
  tone: { dot: string; bg: string };
  title: string;
} {
  switch (e.kind) {
    case 'REPORT':
      return {
        icon: <Factory className="w-3.5 h-3.5 text-white" />,
        tone: { dot: 'bg-indigo-500', bg: 'bg-indigo-500' },
        title: '工序报工',
      };
    case 'OUTSOURCE':
      return {
        icon: <ArrowLeftRight className="w-3.5 h-3.5 text-white" />,
        tone: { dot: 'bg-amber-500', bg: 'bg-amber-500' },
        title: e.subKind?.includes('RECEIVE') ? '外协收货' : '外协发出',
      };
    case 'REWORK':
      return {
        icon: <RotateCw className="w-3.5 h-3.5 text-white" />,
        tone: { dot: 'bg-rose-500', bg: 'bg-rose-500' },
        title: '返工',
      };
    case 'STOCK':
      return {
        icon: <Warehouse className="w-3.5 h-3.5 text-white" />,
        tone: { dot: 'bg-emerald-500', bg: 'bg-emerald-500' },
        title:
          e.subKind === 'STOCK_IN'
            ? '生产入库'
            : e.subKind?.includes('OUT')
              ? '出库'
              : '入库',
      };
    case 'TRANSFER':
      return {
        icon: <ArrowLeftRight className="w-3.5 h-3.5 text-white" />,
        tone: { dot: 'bg-sky-500', bg: 'bg-sky-500' },
        title: '调拨',
      };
    default:
      return {
        icon: <CircleDot className="w-3.5 h-3.5 text-white" />,
        tone: { dot: 'bg-slate-400', bg: 'bg-slate-400' },
        title: e.subKind || '其他',
      };
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
