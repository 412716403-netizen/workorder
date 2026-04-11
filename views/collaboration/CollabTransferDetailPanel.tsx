import React, { useState, useCallback } from 'react';
import {
  Package, Check, X, ArrowLeft, Truck, RotateCcw,
  ChevronRight, RefreshCw, Forward, CheckCircle2, Trash2, Settings2
} from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '../../contexts/ConfirmContext';
import * as api from '../../services/api';
import type { Partner, Product, ProductionOpRecord, AppDictionaries, Warehouse } from '../../types';
import { statusLabel, dispatchStatusLabel, returnStatusLabel } from './collabHelpers';
import CollabAcceptModal from './CollabAcceptModal';
import CollabReturnModal from './CollabReturnModal';
import CollabForwardModal from './CollabForwardModal';

interface CollabTransferDetailPanelProps {
  initialTransfer: any;
  onBack: () => void;
  onRefreshList: () => void;
  warehouses: Warehouse[];
  products: Product[];
  partners: Partner[];
  /** 打开协作设置弹窗（合作单位绑定） */
  onOpenCollabSettings?: () => void;
  prodRecords: ProductionOpRecord[];
  dictionaries: AppDictionaries;
  onRefreshProdRecords?: () => Promise<void>;
  onRefreshOrders?: () => Promise<void>;
  onRefreshPMP?: () => Promise<void>;
  onRefreshProducts?: () => Promise<void>;
}

const CollabTransferDetailPanel: React.FC<CollabTransferDetailPanelProps> = ({
  initialTransfer, onBack, onRefreshList,
  warehouses, products, partners, onOpenCollabSettings,
  prodRecords, dictionaries,
  onRefreshProdRecords, onRefreshOrders, onRefreshPMP, onRefreshProducts,
}) => {
  const confirm = useConfirm();
  const [transfer, setTransfer] = useState<any>(initialTransfer);

  const [acceptOpen, setAcceptOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [returnBindBlockedOpen, setReturnBindBlockedOpen] = useState(false);

  const [withdrawing, setWithdrawing] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [confirmingForward, setConfirmingForward] = useState(false);

  const refreshSelf = useCallback(async () => {
    try {
      const detail = await api.collaboration.getTransfer(transfer.id);
      setTransfer(detail);
    } catch { /* ignore */ }
  }, [transfer.id]);

  const handleAccepted = useCallback(async () => {
    await refreshSelf();
    onRefreshList();
    onRefreshProducts?.();
    onRefreshOrders?.();
  }, [refreshSelf, onRefreshList, onRefreshProducts, onRefreshOrders]);

  const handleReturned = useCallback(async () => {
    await refreshSelf();
    onRefreshList();
    onRefreshProdRecords?.();
  }, [refreshSelf, onRefreshList, onRefreshProdRecords]);

  const handleForwarded = useCallback(async () => {
    await refreshSelf();
    onRefreshList();
    onRefreshProdRecords?.();
  }, [refreshSelf, onRefreshList, onRefreshProdRecords]);

  const handleConfirmForward = async (transferId: string) => {
    const ok = await confirm({ message: '确认该转发？确认后将自动生成外协收回/发出流水和报工记录。' });
    if (!ok) return;
    setConfirmingForward(true);
    try {
      const res = await api.collaboration.confirmForward(transferId);
      toast.success(`已确认转发，收回单号: ${res.receiveDocNo}，发出单号: ${res.dispatchDocNo}`);
      await refreshSelf();
      onRefreshList();
      onRefreshProdRecords?.();
      onRefreshOrders?.();
      onRefreshPMP?.();
    } catch (err: any) {
      toast.error(err.message || '确认失败');
    } finally {
      setConfirmingForward(false);
    }
  };

  const handleWithdrawDispatch = async (dispatchId: string) => {
    const ok = await confirm({ message: '确认撤回该发出批次？撤回后对方将无法看到此批次。' });
    if (!ok) return;
    setWithdrawing(true);
    try {
      await api.collaboration.withdrawDispatch(dispatchId);
      toast.success('已撤回发出');
      await refreshSelf();
      onRefreshList();
      onRefreshProdRecords?.();
    } catch (err: any) {
      toast.error(err.message || '撤回失败');
    } finally {
      setWithdrawing(false);
    }
  };

  const handleWithdrawReturn = async (returnId: string) => {
    const ok = await confirm({ message: '确认撤回该回传？撤回后出库记录将被还原。' });
    if (!ok) return;
    setWithdrawing(true);
    try {
      await api.collaboration.withdrawReturn(returnId);
      toast.success('已撤回回传');
      await refreshSelf();
      onRefreshList();
      onRefreshProdRecords?.();
    } catch (err: any) {
      toast.error(err.message || '撤回失败');
    } finally {
      setWithdrawing(false);
    }
  };

  const handleWithdrawForward = async (transferId: string) => {
    const ok = await confirm({ message: '确认撤回该转发？撤回后将恢复到转发前的状态，出库记录将被还原。' });
    if (!ok) return;
    setWithdrawing(true);
    try {
      await api.collaboration.withdrawForward(transferId);
      toast.success('已撤回转发');
      await refreshSelf();
      onRefreshList();
      onRefreshProdRecords?.();
    } catch (err: any) {
      toast.error(err.message || '撤回失败');
    } finally {
      setWithdrawing(false);
    }
  };

  const handleDeleteDispatch = async (dispatchId: string) => {
    const ok = await confirm({ message: '确认删除该发出记录？删除后不可恢复。', danger: true });
    if (!ok) return;
    try {
      await api.collaboration.deleteDispatch(dispatchId);
      toast.success('已删除');
      await refreshSelf();
      onRefreshList();
    } catch (err: any) {
      toast.error(err.message || '删除失败');
    }
  };

  const handleDeleteReturn = async (returnId: string) => {
    const ok = await confirm({ message: '确认删除该回传记录？删除后不可恢复。', danger: true });
    if (!ok) return;
    try {
      await api.collaboration.deleteReturn(returnId);
      toast.success('已删除');
      await refreshSelf();
      onRefreshList();
    } catch (err: any) {
      toast.error(err.message || '删除失败');
    }
  };

  // ── 修订相关 handlers ──

  const handleConfirmDispatchAmendment = async (dispatchId: string) => {
    const ok = await confirm({ message: '确认接受甲方的发出修订？修订后将更新对应工单明细。' });
    if (!ok) return;
    try {
      const res = await api.collaboration.confirmDispatchAmendment(dispatchId);
      toast.success(res.quantityWarning ? `已确认修订（注意：${res.quantityWarning}）` : '已确认发出修订');
      await refreshSelf();
      onRefreshList();
      onRefreshOrders?.();
    } catch (err: any) {
      toast.error(err.message || '确认失败');
    }
  };

  const handleRejectDispatchAmendment = async (dispatchId: string) => {
    const ok = await confirm({ message: '拒绝甲方的发出修订？拒绝后将保持原有数据不变。' });
    if (!ok) return;
    try {
      await api.collaboration.rejectDispatchAmendment(dispatchId);
      toast.success('已拒绝修订');
      await refreshSelf();
      onRefreshList();
    } catch (err: any) {
      toast.error(err.message || '操作失败');
    }
  };

  const handleConfirmReturnAmendment = async (returnId: string) => {
    const ok = await confirm({ message: '确认接受乙方的回传修订？确认后将重建外协收回记录和生产进度。' });
    if (!ok) return;
    try {
      const res = await api.collaboration.confirmReturnAmendment(returnId);
      toast.success(res.receiptDocNo ? `已确认回传修订，新单号: ${res.receiptDocNo}` : '已确认回传修订');
      await refreshSelf();
      onRefreshList();
      onRefreshProdRecords?.();
      onRefreshOrders?.();
      onRefreshPMP?.();
    } catch (err: any) {
      toast.error(err.message || '确认失败');
    }
  };

  const handleRejectReturnAmendment = async (returnId: string) => {
    const ok = await confirm({ message: '拒绝乙方的回传修订？拒绝后将保持原有数据不变。' });
    if (!ok) return;
    try {
      await api.collaboration.rejectReturnAmendment(returnId);
      toast.success('已拒绝修订');
      await refreshSelf();
      onRefreshList();
    } catch (err: any) {
      toast.error(err.message || '操作失败');
    }
  };

  const handleReceive = async (returnId: string) => {
    setReceiving(true);
    try {
      const res = await api.collaboration.receiveReturn(returnId);
      toast.success(res.receiptDocNo ? `已确认收回，外协回收单号: ${res.receiptDocNo}` : '已确认收回');
      await refreshSelf();
      onRefreshList();
      onRefreshProdRecords?.();
      onRefreshOrders?.();
      onRefreshPMP?.();
    } catch (err: any) {
      toast.error(err.message || '收回确认失败');
    } finally {
      setReceiving(false);
    }
  };

  const openReturnModal = () => {
    if (!transfer?.receiverProductId) {
      toast.warning('缺少乙方产品信息，无法回传');
      return;
    }
    const sid = transfer?.senderTenantId as string | undefined;
    if (sid && !partners.some(p => p.collaborationTenantId === sid)) {
      setReturnBindBlockedOpen(true);
      return;
    }
    setReturnOpen(true);
  };

  const t = transfer;
  const isSender = t.senderTenantName === '本企业';
  const pendingDispatches = (t.dispatches || []).filter((d: any) => d.status === 'PENDING');
  const totalDispatched = (t.dispatches || []).reduce((sum: number, d: any) => {
    const items = d.payload?.items ?? [];
    return sum + items.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0);
  }, 0);
  const totalReturned = (t.returns || []).reduce((sum: number, r: any) => {
    const items = r.payload?.items ?? [];
    return sum + items.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0);
  }, 0);

  return (
    <div className="w-full min-w-0 space-y-4 animate-in slide-in-from-bottom-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
          <ArrowLeft className="w-4 h-4" /> 返回列表
        </button>
        <button onClick={refreshSelf} className="flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-800"><RefreshCw className="w-4 h-4" /> 刷新</button>
      </div>

      {/* 主单信息 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className="w-6 h-6 text-indigo-600" />
            <div>
              <h3 className="text-lg font-black text-slate-900">{t.senderProductName}</h3>
              <p className="text-xs text-slate-500">SKU: {t.senderProductSku}</p>
            </div>
          </div>
          {statusLabel(t.status)}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span className="text-[10px] font-black text-slate-400 uppercase block">甲方</span><span className="font-bold text-slate-800">{t.senderTenantName}</span></div>
          <div><span className="text-[10px] font-black text-slate-400 uppercase block">乙方</span><span className="font-bold text-slate-800">{t.receiverTenantName}</span></div>
          <div><span className="text-[10px] font-black text-slate-400 uppercase block">发出总量</span><span className="font-bold text-slate-800">{totalDispatched}</span></div>
          <div><span className="text-[10px] font-black text-slate-400 uppercase block">已回传</span><span className="font-bold text-emerald-600">{totalReturned}</span></div>
        </div>
        {t.bReceiveMode && (
          <p className="text-xs text-slate-500">乙方接收模式：{t.bReceiveMode === 'product' ? '关联产品' : '关联工单'}</p>
        )}

        {/* 链式外协路线进度 */}
        {t.outsourceRouteSnapshot && Array.isArray(t.outsourceRouteSnapshot) && (
          <div className="pt-2">
            <p className="text-[10px] font-black text-slate-400 uppercase mb-2">外协路线进度</p>
            <div className="flex items-center gap-1 flex-wrap">
              {(t.outsourceRouteSnapshot as any[]).sort((a: any, b: any) => a.stepOrder - b.stepOrder).map((step: any, i: number) => {
                const isComplete = i < t.chainStep;
                const isCurrent = i === t.chainStep;
                return (
                  <React.Fragment key={i}>
                    {i > 0 && <ChevronRight className="w-3 h-3 text-slate-400" />}
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${
                      isComplete ? 'bg-emerald-50 text-emerald-700' :
                      isCurrent ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-300' :
                      'bg-slate-100 text-slate-500'
                    }`}>
                      {isComplete && <Check className="w-3 h-3" />}
                      {step.nodeName} · {step.receiverTenantName}
                    </span>
                  </React.Fragment>
                );
              })}
              <ChevronRight className="w-3 h-3 text-slate-400" />
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${
                t.status === 'CLOSED' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {t.status === 'CLOSED' && <Check className="w-3 h-3" />}
                回传甲方
              </span>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3 pt-2">
          {!isSender && pendingDispatches.length > 0 && (
            <button onClick={() => setAcceptOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all">
              <Check className="w-4 h-4" /> 接受 ({pendingDispatches.length} 待处理)
            </button>
          )}
          {!isSender && t.outsourceRouteSnapshot && Array.isArray(t.outsourceRouteSnapshot) &&
            (t.outsourceRouteSnapshot as any[]).some((s: any) => s.stepOrder > t.chainStep) &&
            t.status !== 'CLOSED' && (t.dispatches || []).some((d: any) => d.status === 'ACCEPTED' || d.status === 'FORWARDED') && (
            <button onClick={() => setForwardOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 transition-all">
              <Forward className="w-4 h-4" /> 转发到下一站
            </button>
          )}
          {!isSender && t.status !== 'CLOSED' && t.status !== 'CANCELLED' && (t.dispatches || []).some((d: any) => d.status === 'ACCEPTED' || d.status === 'FORWARDED') &&
            (!t.outsourceRouteSnapshot || !Array.isArray(t.outsourceRouteSnapshot) ||
              !(t.outsourceRouteSnapshot as any[]).some((s: any) => s.stepOrder > t.chainStep)) && (
            <button onClick={openReturnModal} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all">
              <Truck className="w-4 h-4" /> 回传给甲方
            </button>
          )}
          {isSender && t.chainStep > 0 && !t.originConfirmedAt && (
            <button onClick={() => handleConfirmForward(t.id)} disabled={confirmingForward} className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 disabled:opacity-50 transition-all">
              <CheckCircle2 className="w-4 h-4" /> {confirmingForward ? '确认中...' : '确认转发'}
            </button>
          )}
          {!isSender && t.childTransferId && !t.childConfirmed && (
            <button onClick={() => handleWithdrawForward(t.childTransferId)} disabled={withdrawing} className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-300 disabled:opacity-50 transition-all">
              <RotateCcw className="w-4 h-4" /> {withdrawing ? '撤回中...' : '撤回转发'}
            </button>
          )}
        </div>
      </div>

      {/* Dispatch 列表 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">发出批次 ({(t.dispatches || []).length})</h4>
        </div>
        <div className="divide-y divide-slate-100">
          {(t.dispatches || []).map((d: any) => {
            const items = d.payload?.items ?? [];
            const qty = items.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0);
            return (
              <div key={d.id} className="px-6 py-4 space-y-2">
                <div className="flex items-center justify-between gap-4 min-w-0">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {dispatchStatusLabel(d.status)}
                      <span className="text-sm font-bold text-slate-800">数量 {qty}</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {items.map((i: any) => {
                        const parts = [i.colorName, i.sizeName].filter(Boolean).join('/');
                        return parts ? `${parts}: ${i.quantity}` : `${i.quantity}`;
                      }).join('  ')}
                    </p>
                    <p className="text-[10px] text-slate-400">{new Date(d.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {d.receiverProductionOrderId && (
                      <span className="text-xs text-indigo-600 font-bold">工单: {d.receiverProductionOrderId.slice(0, 16)}...</span>
                    )}
                    {isSender && d.status === 'PENDING' && !(t._chainTransfers && d.transferId && (t._chainTransfers as any[]).some((ct: any) => ct.id === d.transferId && ct.chainStep > 0)) && (
                      <button
                        disabled={withdrawing}
                        onClick={e => { e.stopPropagation(); handleWithdrawDispatch(d.id); }}
                        className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold hover:bg-slate-200 disabled:opacity-50 transition-all"
                      >
                        <RotateCcw className="w-3 h-3" /> 撤回
                      </button>
                    )}
                    {isSender && d.status === 'WITHDRAWN' && !(t._chainTransfers && d.transferId && (t._chainTransfers as any[]).some((ct: any) => ct.id === d.transferId && ct.chainStep > 0)) && (
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteDispatch(d.id); }}
                        className="flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-500 rounded-lg text-[10px] font-bold hover:bg-rose-100 transition-all"
                      >
                        <Trash2 className="w-3 h-3" /> 删除
                      </button>
                    )}
                  </div>
                </div>
                {d.amendmentStatus === 'PENDING_B_CONFIRM' && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-amber-400 text-white text-[10px] font-black rounded">待确认修订</span>
                      {d.amendmentNote && <span className="text-xs text-amber-700">备注: {d.amendmentNote}</span>}
                    </div>
                    <div className="text-xs text-amber-800">
                      <span className="font-bold">修订内容: </span>
                      {(d.amendmentPayload?.items ?? []).map((ai: any, ai_idx: number) => {
                        const parts = [ai.colorName, ai.sizeName].filter(Boolean).join('/');
                        return <span key={ai_idx} className="mr-2">{parts ? `${parts}: ${ai.quantity}` : ai.quantity}</span>;
                      })}
                    </div>
                    {!isSender && (
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleConfirmDispatchAmendment(d.id)} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-all">
                          <Check className="w-3.5 h-3.5" /> 确认修订
                        </button>
                        <button onClick={() => handleRejectDispatchAmendment(d.id)} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50 transition-all">
                          <X className="w-3.5 h-3.5" /> 拒绝
                        </button>
                      </div>
                    )}
                    {isSender && (
                      <p className="text-[10px] text-amber-600 font-bold">等待乙方确认修订中...</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Return 列表 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">回传记录 ({(t.returns || []).length})</h4>
        </div>
        {(t.returns || []).length === 0 ? (
          <div className="px-6 py-8 text-center text-slate-400 text-sm">暂无回传记录</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {(t.returns || []).map((r: any) => {
              const items = r.payload?.items ?? [];
              const qty = items.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0);
              return (
                <div key={r.id} className="px-6 py-4 space-y-2">
                  <div className="flex items-center justify-between gap-4 min-w-0">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {returnStatusLabel(r.status)}
                        <span className="text-sm font-bold text-slate-800">合计 {qty}</span>
                      </div>
                      {items.length > 0 && (
                        <ul className="text-xs text-slate-600 space-y-0.5 mt-1">
                          {items.map((it: any, i: number) => (
                            <li key={i}>
                              {[it.colorName, it.sizeName].filter(Boolean).join('/') || '无规格'}：{it.quantity}
                            </li>
                          ))}
                        </ul>
                      )}
                      {r.payload?.note && <p className="text-xs text-slate-500">备注: {r.payload.note}</p>}
                      {r.payload?.receiptDocNo && (
                        <p className="text-[10px] font-bold text-emerald-600">回收单号: {r.payload.receiptDocNo}</p>
                      )}
                      <p className="text-[10px] text-slate-400">{new Date(r.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isSender && r.status === 'PENDING_A_RECEIVE' && (
                        <button
                          disabled={receiving}
                          onClick={() => handleReceive(r.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all"
                        >
                          <Check className="w-3.5 h-3.5" /> 确认收回
                        </button>
                      )}
                      {!isSender && r.status === 'PENDING_A_RECEIVE' && (
                        <button
                          disabled={withdrawing}
                          onClick={e => { e.stopPropagation(); handleWithdrawReturn(r.id); }}
                          className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold hover:bg-slate-200 disabled:opacity-50 transition-all"
                        >
                          <RotateCcw className="w-3 h-3" /> 撤回
                        </button>
                      )}
                      {!isSender && r.status === 'WITHDRAWN' && (
                        <button
                          onClick={e => { e.stopPropagation(); handleDeleteReturn(r.id); }}
                          className="flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-500 rounded-lg text-[10px] font-bold hover:bg-rose-100 transition-all"
                        >
                          <Trash2 className="w-3 h-3" /> 删除
                        </button>
                      )}
                    </div>
                  </div>
                  {r.amendmentStatus === 'PENDING_A_CONFIRM' && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-amber-400 text-white text-[10px] font-black rounded">待甲方确认修订</span>
                        {r.amendmentNote && <span className="text-xs text-amber-700">备注: {r.amendmentNote}</span>}
                      </div>
                      <div className="text-xs text-amber-800">
                        <span className="font-bold">修订内容: </span>
                        {(r.amendmentPayload?.items ?? []).map((ai: any, ai_idx: number) => {
                          const parts = [ai.colorName, ai.sizeName].filter(Boolean).join('/');
                          return <span key={ai_idx} className="mr-2">{parts ? `${parts}: ${ai.quantity}` : ai.quantity}</span>;
                        })}
                      </div>
                      {isSender && (
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleConfirmReturnAmendment(r.id)} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-all">
                            <Check className="w-3.5 h-3.5" /> 确认修订
                          </button>
                          <button onClick={() => handleRejectReturnAmendment(r.id)} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50 transition-all">
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
              );
            })}
          </div>
        )}
      </div>

      {returnBindBlockedOpen && (
        <div className="fixed inset-0 z-[92] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="collab-return-bind-title">
          <button type="button" aria-label="关闭" className="absolute inset-0 bg-slate-900/50" onClick={() => setReturnBindBlockedOpen(false)} />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 id="collab-return-bind-title" className="text-base font-black text-slate-900">需先绑定合作单位</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              提交回传前，请先在<strong className="text-slate-800">协作设置</strong>中将本企业的<strong className="text-slate-800">合作单位</strong>绑定到该委托方（甲方）企业，回传流水才能正确显示合作单位并完成出库。
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => setReturnBindBlockedOpen(false)}
                className="flex-1 min-w-[100px] py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  setReturnBindBlockedOpen(false);
                  onOpenCollabSettings?.();
                }}
                disabled={!onOpenCollabSettings}
                className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                <Settings2 className="w-4 h-4 shrink-0" /> 打开协作设置
              </button>
            </div>
          </div>
        </div>
      )}

      <CollabAcceptModal
        open={acceptOpen}
        onClose={() => setAcceptOpen(false)}
        transfer={transfer}
        onAccepted={handleAccepted}
      />

      <CollabReturnModal
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        transfer={transfer}
        warehouses={warehouses}
        products={products}
        prodRecords={prodRecords}
        dictionaries={dictionaries}
        onReturned={handleReturned}
      />

      <CollabForwardModal
        open={forwardOpen}
        onClose={() => setForwardOpen(false)}
        transfer={transfer}
        warehouses={warehouses}
        products={products}
        prodRecords={prodRecords}
        dictionaries={dictionaries}
        onForwarded={handleForwarded}
      />
    </div>
  );
};

export default React.memo(CollabTransferDetailPanel);
