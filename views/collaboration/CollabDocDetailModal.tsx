import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Package, Truck, X, Check, RotateCcw, Trash2, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '../../contexts/ConfirmContext';
import * as api from '../../services/api';
import type { Partner, Product, ProductionOpRecord, AppDictionaries, Warehouse } from '../../types';
import { dispatchStatusLabel, returnStatusLabel } from './collabHelpers';
import QtyMatrixTable from '../../components/variant-matrix/QtyMatrixTable';
import { collabPayloadItemsToQtyMatrixProps, type CollabPayloadItem } from './collabDocDisplay';

type DocKind = 'dispatch' | 'return';

interface CollabDocDetailModalProps {
  open: boolean;
  onClose: () => void;
  docKind: DocKind;
  doc: any;
  transfer: any;
  warehouses: Warehouse[];
  products: Product[];
  partners: Partner[];
  prodRecords: ProductionOpRecord[];
  dictionaries: AppDictionaries;
  onRefreshList: () => void;
  onRefreshOrders?: () => Promise<void>;
  onRefreshProdRecords?: () => Promise<void>;
  onRefreshPMP?: () => Promise<void>;
  onRefreshProducts?: () => Promise<void>;
  /** 保留 prop 签名以兼容调用方，内部已不再使用（接受/回传/转发入口迁移至右侧栏批量弹窗） */
  onOpenCollabSettings?: () => void;
}

function sumItemsQty(items: any[] | undefined): number {
  if (!Array.isArray(items)) return 0;
  let total = 0;
  for (const it of items) total += Number(it?.quantity) || 0;
  return total;
}

function formatDocNo(doc: any, kind: DocKind): string {
  const p = doc?.payload;
  if (!p) return '';
  if (kind === 'return' && typeof p.stockOutDocNo === 'string' && p.stockOutDocNo) return p.stockOutDocNo;
  const senderRef = p.senderRef;
  if (senderRef && Array.isArray(senderRef.docNos) && senderRef.docNos.length > 0) {
    return senderRef.docNos.join('、');
  }
  return '';
}

const CollabDocDetailModal: React.FC<CollabDocDetailModalProps> = ({
  open, onClose, docKind, doc: initialDoc, transfer: initialTransfer,
  onRefreshList, onRefreshOrders, onRefreshProdRecords, onRefreshPMP, onRefreshProducts,
}) => {
  const confirm = useConfirm();
  const [transfer, setTransfer] = useState<any>(initialTransfer);
  const [doc, setDoc] = useState<any>(initialDoc);
  const [refreshing, setRefreshing] = useState(false);

  const [busy, setBusy] = useState(false);

  // 弹窗打开时以入参为准
  const openRef = useRef(false);
  useEffect(() => {
    if (open && !openRef.current) {
      setTransfer(initialTransfer);
      setDoc(initialDoc);
    }
    openRef.current = open;
  }, [open, initialDoc, initialTransfer]);

  const refreshSelf = useCallback(async () => {
    if (!transfer?.id || !doc?.id) return;
    setRefreshing(true);
    try {
      const detail = await api.collaboration.getTransfer(transfer.id);
      setTransfer(detail);
      const pool: any[] = docKind === 'dispatch' ? (detail.dispatches || []) : (detail.returns || []);
      const next = pool.find((x: any) => x.id === doc.id);
      if (next) {
        setDoc(next);
      } else {
        onClose();
      }
    } catch (err: any) {
      toast.error(err?.message || '刷新失败');
    } finally {
      setRefreshing(false);
    }
  }, [transfer?.id, doc?.id, docKind, onClose]);

  const afterMutation = useCallback(async (opts?: { closeAfter?: boolean; refreshProducts?: boolean; refreshOrders?: boolean; refreshProd?: boolean; refreshPMP?: boolean }) => {
    onRefreshList();
    if (opts?.refreshProducts) onRefreshProducts?.();
    if (opts?.refreshOrders) onRefreshOrders?.();
    if (opts?.refreshProd) onRefreshProdRecords?.();
    if (opts?.refreshPMP) onRefreshPMP?.();
    if (opts?.closeAfter) {
      onClose();
    } else {
      await refreshSelf();
    }
  }, [onRefreshList, onRefreshProducts, onRefreshOrders, onRefreshProdRecords, onRefreshPMP, refreshSelf, onClose]);

  // ── Dispatch 动作 ──
  const handleWithdrawDispatch = async () => {
    const ok = await confirm({ message: '确认撤回该发出批次？撤回后对方将无法看到此批次。' });
    if (!ok) return;
    setBusy(true);
    try {
      await api.collaboration.withdrawDispatch(doc.id);
      toast.success('已撤回发出');
      await afterMutation({ refreshProd: true });
    } catch (err: any) {
      toast.error(err?.message || '撤回失败');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteDispatch = async () => {
    const ok = await confirm({ message: '确认删除该发出记录？删除后不可恢复。', danger: true });
    if (!ok) return;
    setBusy(true);
    try {
      await api.collaboration.deleteDispatch(doc.id);
      toast.success('已删除');
      await afterMutation({ closeAfter: true });
    } catch (err: any) {
      toast.error(err?.message || '删除失败');
    } finally {
      setBusy(false);
    }
  };

  const handleWithdrawForward = async () => {
    const ok = await confirm({ message: '确认撤回该转发？撤回后将恢复到转发前的状态，出库记录将被还原。' });
    if (!ok) return;
    setBusy(true);
    try {
      await api.collaboration.withdrawForward(transfer.childTransferId);
      toast.success('已撤回转发');
      await afterMutation({ refreshProd: true });
    } catch (err: any) {
      toast.error(err?.message || '撤回失败');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDispatchAmendment = async () => {
    const ok = await confirm({ message: '确认接受甲方的发出修订？修订后将更新对应工单明细。' });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await api.collaboration.confirmDispatchAmendment(doc.id);
      toast.success(res.quantityWarning ? `已确认修订（注意：${res.quantityWarning}）` : '已确认发出修订');
      await afterMutation({ refreshOrders: true });
    } catch (err: any) {
      toast.error(err?.message || '确认失败');
    } finally {
      setBusy(false);
    }
  };

  const handleRejectDispatchAmendment = async () => {
    const ok = await confirm({ message: '拒绝甲方的发出修订？拒绝后将保持原有数据不变。' });
    if (!ok) return;
    setBusy(true);
    try {
      await api.collaboration.rejectDispatchAmendment(doc.id);
      toast.success('已拒绝修订');
      await afterMutation();
    } catch (err: any) {
      toast.error(err?.message || '操作失败');
    } finally {
      setBusy(false);
    }
  };

  // ── Return 动作 ──
  const handleWithdrawReturn = async () => {
    const ok = await confirm({
      message: '确认撤回该回传？若与同一张出库单号合并提交的多产品回传，将一并撤回并还原对应出库记录。',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = (await api.collaboration.withdrawReturn(doc.id)) as { withdrawnCount?: number };
      const n = res?.withdrawnCount ?? 1;
      toast.success(n > 1 ? `已撤回 ${n} 条关联回传（同一出库单号）` : '已撤回回传');
      await afterMutation({ refreshProd: true });
    } catch (err: any) {
      toast.error(err?.message || '撤回失败');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteReturn = async () => {
    const ok = await confirm({ message: '确认删除该回传记录？删除后不可恢复。', danger: true });
    if (!ok) return;
    setBusy(true);
    try {
      await api.collaboration.deleteReturn(doc.id);
      toast.success('已删除');
      await afterMutation({ closeAfter: true });
    } catch (err: any) {
      toast.error(err?.message || '删除失败');
    } finally {
      setBusy(false);
    }
  };

  /** 甲方：待收回 → 确认收货（与收件箱批量确认收回同一接口） */
  const handleReceiveReturn = async () => {
    const ok = await confirm({
      message: '确认收货该回传？将按明细生成外协「已收回」记录，并更新相关工单与工序进度。',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = (await api.collaboration.receiveReturn(doc.id)) as { receiptDocNo?: string };
      toast.success(res?.receiptDocNo ? `已确认收货，回收单号：${res.receiptDocNo}` : '已确认收货');
      await afterMutation({ refreshProd: true, refreshOrders: true, refreshPMP: true });
    } catch (err: any) {
      toast.error(err?.message || '确认收回失败');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmReturnAmendment = async () => {
    const ok = await confirm({ message: '确认接受乙方的回传修订？确认后将重建外协收回记录和生产进度。' });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await api.collaboration.confirmReturnAmendment(doc.id);
      toast.success(res.receiptDocNo ? `已确认回传修订，新单号: ${res.receiptDocNo}` : '已确认回传修订');
      await afterMutation({ refreshProd: true, refreshOrders: true, refreshPMP: true });
    } catch (err: any) {
      toast.error(err?.message || '确认失败');
    } finally {
      setBusy(false);
    }
  };

  const handleRejectReturnAmendment = async () => {
    const ok = await confirm({ message: '拒绝乙方的回传修订？拒绝后将保持原有数据不变。' });
    if (!ok) return;
    setBusy(true);
    try {
      await api.collaboration.rejectReturnAmendment(doc.id);
      toast.success('已拒绝修订');
      await afterMutation();
    } catch (err: any) {
      toast.error(err?.message || '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const items: any[] = doc?.payload?.items ?? [];
  const totalQty = sumItemsQty(items);
  const specMatrix = useMemo(
    () => collabPayloadItemsToQtyMatrixProps(items, { showPricing: docKind === 'return' }),
    [items, docKind],
  );
  const amendmentMatrix = useMemo(
    () =>
      collabPayloadItemsToQtyMatrixProps((doc?.amendmentPayload?.items ?? []) as CollabPayloadItem[], {
        showPricing: docKind === 'return',
      }),
    [doc?.amendmentPayload?.items, docKind],
  );

  if (!open) return null;

  const isSender = transfer.senderTenantName === '本企业';
  const peerName = isSender ? transfer.receiverTenantName : transfer.senderTenantName;
  const docNo = formatDocNo(doc, docKind);
  const createdStr = doc?.createdAt ? new Date(doc.createdAt).toLocaleString() : '';
  const kindLabel = docKind === 'dispatch' ? '派发单' : '回传单';
  const KindIcon = docKind === 'dispatch' ? Package : Truck;
  const kindIconCls = docKind === 'dispatch' ? 'text-indigo-600' : 'text-emerald-600';
  const statusNode = docKind === 'dispatch' ? dispatchStatusLabel(doc.status) : returnStatusLabel(doc.status);

  // ── 按条件判定动作按钮（接受/回传/转发/确认收回/确认转发 已迁移至右侧栏批量入口，此处仅保留撤回/删除/修订） ──
  const isMidChainDispatch = transfer._chainTransfers && doc?.transferId
    && (transfer._chainTransfers as any[]).some((ct: any) => ct.id === doc.transferId && ct.chainStep > 0);

  // 派发单
  const canWithdrawDispatch = docKind === 'dispatch' && isSender && doc.status === 'PENDING' && !isMidChainDispatch;
  const canDeleteDispatch = docKind === 'dispatch' && isSender && doc.status === 'WITHDRAWN' && !isMidChainDispatch;
  const canWithdrawForward = docKind === 'dispatch' && !isSender && !!transfer.childTransferId && !transfer.childConfirmed;
  const dispatchAmendmentPending = docKind === 'dispatch' && doc.amendmentStatus === 'PENDING_B_CONFIRM';

  // 回传单
  const canReceiveReturn = docKind === 'return' && isSender && doc.status === 'PENDING_A_RECEIVE';
  const canWithdrawReturn = docKind === 'return' && !isSender && doc.status === 'PENDING_A_RECEIVE';
  const canDeleteReturn = docKind === 'return' && !isSender && doc.status === 'WITHDRAWN';
  const returnAmendmentPending = docKind === 'return' && doc.amendmentStatus === 'PENDING_A_CONFIRM';

  const hasActions = canWithdrawDispatch || canDeleteDispatch
    || canWithdrawForward
    || canWithdrawReturn || canDeleteReturn;

  return (
    <>
      <div className="fixed inset-0 z-[86] flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="collab-doc-modal-title">
        <button
          type="button"
          aria-label="关闭"
          className="absolute inset-0 z-0 bg-slate-900/40 backdrop-blur-sm"
          onClick={onClose}
        />
        <div
          className="relative z-[1] w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl border border-slate-200 bg-white overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* 头部 */}
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200 bg-white shrink-0">
            <h2 id="collab-doc-modal-title" className="text-base font-black text-slate-900 flex items-center gap-2 min-w-0">
              <KindIcon className={`w-5 h-5 shrink-0 ${kindIconCls}`} />
              <span className="shrink-0">{kindLabel}</span>
              <span className="shrink-0">{statusNode}</span>
            </h2>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={refreshSelf}
                disabled={refreshing}
                className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors disabled:opacity-50"
                aria-label="刷新"
                title="刷新"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                aria-label="关闭"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 主体 */}
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
            <div className="shrink-0 border-b border-slate-100 bg-slate-50/50 px-5 py-4">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">单据基本信息</h4>
              <div className="flex items-start gap-3 mb-4">
                <Package className="w-6 h-6 text-indigo-600 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-black text-slate-900 truncate">{transfer.senderProductName || '—'}</h3>
                  {transfer.senderProductSku ? (
                    <p className="text-xs font-semibold text-slate-500 mt-0.5">SKU {transfer.senderProductSku}</p>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">对方单位</span>
                  <span className="font-bold text-slate-800 break-all">{peerName || '—'}</span>
                </div>
                <div>
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">数量合计</span>
                  <span className="font-bold text-indigo-700 tabular-nums">{totalQty} 件</span>
                </div>
                <div>
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">创建时间</span>
                  <span className="font-bold text-slate-800 text-xs">{createdStr || '—'}</span>
                </div>
                <div className="min-w-0">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">单据号</span>
                  <span className="font-bold text-slate-800 text-xs break-all">{docNo || '—'}</span>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 p-5">
            <div>
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                规格明细{items.length > 0 ? `（${items.length}）` : ''}
              </h4>
              {specMatrix.rows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center text-sm text-slate-400">
                  暂无明细
                </div>
              ) : (
                <QtyMatrixTable sizeHeaders={specMatrix.sizeHeaders} rows={specMatrix.rows} />
              )}
            </div>

            {/* 甲方：回传单详情内确认收货（与批量确认收回同一接口） */}
            {canReceiveReturn && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/90 p-4 space-y-3">
                <p className="text-sm text-indigo-950 font-bold leading-relaxed">
                  该回传单为「待甲方收回」。确认收货后将为上述明细生成外协收回记录，并回写生产进度。
                </p>
                <button
                  type="button"
                  onClick={handleReceiveReturn}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  <Check className="w-4 h-4 shrink-0" />
                  {busy ? '处理中…' : '确认收货'}
                </button>
              </div>
            )}

            {/* 备注 / 回收单号 */}
            {(doc?.payload?.note || doc?.payload?.receiptDocNo) && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-1 text-xs">
                {doc?.payload?.note && (
                  <p className="text-slate-600"><span className="font-bold text-slate-500">备注：</span>{doc.payload.note}</p>
                )}
                {doc?.payload?.receiptDocNo && (
                  <p className="font-bold text-emerald-700">外协回收单号：{doc.payload.receiptDocNo}</p>
                )}
              </div>
            )}

            {/* 修订区 */}
            {dispatchAmendmentPending && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 bg-amber-400 text-white text-[10px] font-black rounded">待确认修订</span>
                  {doc.amendmentNote && <span className="text-xs text-amber-700">备注: {doc.amendmentNote}</span>}
                </div>
                <div className="space-y-2">
                  <span className="text-xs font-bold text-amber-900">修订规格明细</span>
                  {amendmentMatrix.rows.length === 0 ? (
                    <p className="text-xs text-amber-800">（无结构化明细）</p>
                  ) : (
                    <QtyMatrixTable sizeHeaders={amendmentMatrix.sizeHeaders} rows={amendmentMatrix.rows} />
                  )}
                </div>
                {!isSender && (
                  <div className="flex items-center gap-2">
                    <button onClick={handleConfirmDispatchAmendment} disabled={busy} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all">
                      <Check className="w-3.5 h-3.5" /> 确认修订
                    </button>
                    <button onClick={handleRejectDispatchAmendment} disabled={busy} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50 disabled:opacity-50 transition-all">
                      <X className="w-3.5 h-3.5" /> 拒绝
                    </button>
                  </div>
                )}
                {isSender && (
                  <p className="text-[10px] text-amber-600 font-bold">等待乙方确认修订中...</p>
                )}
              </div>
            )}
            {returnAmendmentPending && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 bg-amber-400 text-white text-[10px] font-black rounded">待甲方确认修订</span>
                  {doc.amendmentNote && <span className="text-xs text-amber-700">备注: {doc.amendmentNote}</span>}
                </div>
                <div className="space-y-2">
                  <span className="text-xs font-bold text-amber-900">修订规格明细</span>
                  {amendmentMatrix.rows.length === 0 ? (
                    <p className="text-xs text-amber-800">（无结构化明细）</p>
                  ) : (
                    <QtyMatrixTable sizeHeaders={amendmentMatrix.sizeHeaders} rows={amendmentMatrix.rows} />
                  )}
                </div>
                {isSender && (
                  <div className="flex items-center gap-2">
                    <button onClick={handleConfirmReturnAmendment} disabled={busy} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all">
                      <Check className="w-3.5 h-3.5" /> 确认修订
                    </button>
                    <button onClick={handleRejectReturnAmendment} disabled={busy} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50 disabled:opacity-50 transition-all">
                      <X className="w-3.5 h-3.5" /> 拒绝
                    </button>
                  </div>
                )}
                {!isSender && (
                  <p className="text-[10px] text-amber-600 font-bold">等待甲方确认修订中...</p>
                )}
              </div>
            )}
            </div>
          </div>

          {/* 底部动作按钮（撤回/删除；确认收回已置于回传单正文区） */}
          {hasActions && (
            <div className="flex flex-wrap gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50 shrink-0">
              {canWithdrawForward && (
                <button onClick={handleWithdrawForward} disabled={busy} className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-300 disabled:opacity-50 transition-all">
                  <RotateCcw className="w-4 h-4" /> {busy ? '撤回中...' : '撤回转发'}
                </button>
              )}
              {canWithdrawDispatch && (
                <button onClick={handleWithdrawDispatch} disabled={busy} className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-300 disabled:opacity-50 transition-all">
                  <RotateCcw className="w-4 h-4" /> 撤回
                </button>
              )}
              {canDeleteDispatch && (
                <button onClick={handleDeleteDispatch} disabled={busy} className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 rounded-xl text-sm font-bold hover:bg-rose-100 disabled:opacity-50 transition-all">
                  <Trash2 className="w-4 h-4" /> 删除
                </button>
              )}
              {canWithdrawReturn && (
                <button onClick={handleWithdrawReturn} disabled={busy} className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-300 disabled:opacity-50 transition-all">
                  <RotateCcw className="w-4 h-4" /> 撤回
                </button>
              )}
              {canDeleteReturn && (
                <button onClick={handleDeleteReturn} disabled={busy} className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 rounded-xl text-sm font-bold hover:bg-rose-100 disabled:opacity-50 transition-all">
                  <Trash2 className="w-4 h-4" /> 删除
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CollabDocDetailModal;
