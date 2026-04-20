import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Check, X, ChevronDown, ChevronRight, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import * as api from '../../services/api';
import { normalizeAcceptSpecList } from './collabHelpers';

interface CollabPeerAcceptModalProps {
  open: boolean;
  onClose: () => void;
  /** 待接受的 transfers（已按 dispatchDocNo 聚合或就是选中合作单位下的全部待接 transfer） */
  eligibleTransfers: any[];
  onDone: () => Promise<void> | void;
}

type TransferBlock = {
  transfer: any;
  selected: boolean;
  expanded: boolean;
  /** 接受该 transfer 时新建乙方产品的字段（默认来自甲方信息） */
  acceptName: string;
  acceptSku: string;
  acceptDesc: string;
  acceptColors: string[];
  acceptSizes: string[];
  pendingDispatchIds: string[];
  pendingQty: number;
  specPreview: string;
};

function sumDispatchQty(dispatches: any[]): number {
  let total = 0;
  for (const d of dispatches) {
    for (const it of d.payload?.items ?? []) total += Number(it.quantity) || 0;
  }
  return total;
}

function specPreview(dispatches: any[], max = 3): string {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const d of dispatches) {
    for (const it of d.payload?.items ?? []) {
      const label = [it.colorName, it.sizeName].filter(Boolean).join('/');
      if (!label || seen.has(label)) continue;
      seen.add(label);
      labels.push(label);
      if (labels.length >= max) return labels.join('，') + '…';
    }
  }
  return labels.join('，');
}

const CollabPeerAcceptModal: React.FC<CollabPeerAcceptModalProps> = ({ open, onClose, eligibleTransfers, onDone }) => {
  const navigate = useNavigate();
  const [blocks, setBlocks] = useState<TransferBlock[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      const next: TransferBlock[] = eligibleTransfers.map(t => {
        const pendingDispatches = (t.dispatches || []).filter((d: any) => d.status === 'PENDING');
        const firstPayload = pendingDispatches[0]?.payload;
        let colors = normalizeAcceptSpecList(firstPayload?.colorNames);
        let sizes = normalizeAcceptSpecList(firstPayload?.sizeNames);
        if (!colors.length || !sizes.length) {
          const allItems = pendingDispatches.flatMap((d: any) => d.payload?.items ?? []);
          if (!colors.length) colors = [...new Set(allItems.map((i: any) => i.colorName).filter(Boolean))] as string[];
          if (!sizes.length) sizes = [...new Set(allItems.map((i: any) => i.sizeName).filter(Boolean))] as string[];
        }
        return {
          transfer: t,
          selected: true,
          expanded: eligibleTransfers.length === 1,
          acceptName: t.senderProductName || '',
          acceptSku: t.senderProductSku || '',
          acceptDesc: firstPayload?.description || '',
          acceptColors: colors,
          acceptSizes: sizes,
          pendingDispatchIds: pendingDispatches.map((d: any) => d.id),
          pendingQty: sumDispatchQty(pendingDispatches),
          specPreview: specPreview(pendingDispatches),
        };
      });
      setBlocks(next);
    }
    prevOpenRef.current = open;
  }, [open, eligibleTransfers]);

  const selectedCount = useMemo(() => blocks.filter(b => b.selected).length, [blocks]);

  if (!open) return null;

  const toggleSelect = (idx: number) => {
    setBlocks(prev => prev.map((b, i) => i === idx ? { ...b, selected: !b.selected } : b));
  };
  const toggleExpand = (idx: number) => {
    setBlocks(prev => prev.map((b, i) => i === idx ? { ...b, expanded: !b.expanded } : b));
  };
  const toggleAll = () => {
    const all = blocks.every(b => b.selected);
    setBlocks(prev => prev.map(b => ({ ...b, selected: !all })));
  };
  const updateField = <K extends keyof TransferBlock>(idx: number, key: K, value: TransferBlock[K]) => {
    setBlocks(prev => prev.map((b, i) => i === idx ? { ...b, [key]: value } : b));
  };

  const submit = async () => {
    const targets = blocks.filter(b => b.selected);
    if (targets.length === 0) {
      toast.warning('请至少勾选一个产品');
      return;
    }
    for (const b of targets) {
      if (!b.acceptName.trim()) {
        toast.warning(`「${b.transfer.senderProductName}」请填写乙方产品名称`);
        return;
      }
      if (!b.acceptSku.trim()) {
        toast.warning(`「${b.transfer.senderProductName}」请填写乙方产品编号/SKU`);
        return;
      }
    }

    setSubmitting(true);
    const results = await Promise.allSettled(
      targets.map(b => {
        const specColors = normalizeAcceptSpecList(b.acceptColors);
        const specSizes = normalizeAcceptSpecList(b.acceptSizes);
        return api.collaboration.acceptTransfer(b.transfer.id, {
          dispatchIds: b.pendingDispatchIds,
          createProduct: {
            name: b.acceptName.trim(),
            sku: b.acceptSku.trim(),
            description: b.acceptDesc.trim() || undefined,
            colorNames: specColors.length ? specColors : undefined,
            sizeNames: specSizes.length ? specSizes : undefined,
          },
        });
      }),
    );
    setSubmitting(false);

    const fails: Array<{ name: string; err: string }> = [];
    let acceptedSum = 0;
    let ordersSum = 0;
    let firstPendingProcessProductId: string | null = null;
    let anyPendingProcess = false;
    type ProductInfoChange = { field: string; from: string; to: string; skipped?: boolean; reason?: string };
    const productChangeGroups: Array<{ name: string; changes: ProductInfoChange[] }> = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        const res: any = r.value;
        acceptedSum += Number(res?.accepted) || 0;
        if (Array.isArray(res?.createdOrders)) ordersSum += res.createdOrders.length;
        if (res?.pendingProcess) {
          anyPendingProcess = true;
          if (!firstPendingProcessProductId && res?.receiverProductId) firstPendingProcessProductId = res.receiverProductId;
        }
        if (Array.isArray(res?.productInfoChanges) && res.productInfoChanges.length > 0) {
          productChangeGroups.push({
            name: targets[i].transfer.senderProductName || targets[i].acceptName || '—',
            changes: res.productInfoChanges as ProductInfoChange[],
          });
        }
      } else {
        fails.push({ name: targets[i].transfer.senderProductName || '—', err: (r as PromiseRejectedResult).reason?.message || '未知错误' });
      }
    });

    const okCount = targets.length - fails.length;

    if (fails.length === 0) {
      toast.success(
        anyPendingProcess
          ? `已接受 ${okCount} 个产品 · ${acceptedSum} 条派发 · 生成 ${ordersSum} 张工单（部分待配工序）`
          : `已接受 ${okCount} 个产品 · ${acceptedSum} 条派发 · 生成 ${ordersSum} 张工单`,
        {
          duration: 8000,
          action: firstPendingProcessProductId
            ? {
                label: '去配置工序 →',
                onClick: () => navigate('/basic', { state: { editProductId: firstPendingProcessProductId } }),
              }
            : undefined,
        },
      );
    } else if (okCount > 0) {
      toast.error(`${okCount} 成功 / ${fails.length} 失败：${fails[0].name}：${fails[0].err}`, { duration: 8000 });
    } else {
      toast.error(`接受失败：${fails[0].err}`, { duration: 8000 });
    }

    if (productChangeGroups.length > 0) {
      const totalChanges = productChangeGroups.reduce((s, g) => s + g.changes.length, 0);
      const lines: string[] = [];
      for (const g of productChangeGroups) {
        lines.push(`【${g.name}】`);
        for (const c of g.changes) {
          if (c.skipped) {
            lines.push(`· ${c.field}：未同步（${c.reason || '存在冲突'}）`);
          } else {
            lines.push(`· ${c.field}：${c.from || '—'} → ${c.to}`);
          }
        }
      }
      toast.info(
        `商品信息已根据甲方最新数据同步修改（共 ${totalChanges} 项变更）：\n${lines.join('\n')}`,
        { duration: 15000 },
      );
    }

    if (okCount > 0) {
      onClose();
      await onDone();
    }
  };

  const allSelected = blocks.length > 0 && blocks.every(b => b.selected);

  return (
    <div className="fixed inset-0 z-[86] flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 z-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative z-[1] w-full max-w-3xl max-h-[92vh] rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200 bg-white shrink-0">
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <Check className="w-5 h-5 text-indigo-600" /> 批量接受协作单
            <span className="text-xs text-slate-500 font-bold">{selectedCount}/{blocks.length} 个产品</span>
          </h3>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors" aria-label="关闭">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 shrink-0 flex items-center gap-3 text-xs">
          {blocks.length > 1 && (
            <button
              type="button"
              onClick={toggleAll}
              className="px-3 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100"
            >
              {allSelected ? '全部取消' : '全部选中'}
            </button>
          )}
          <span className="text-slate-500">
            接受后将为每个产品在本企业创建乙方产品与对应工单（工序可稍后在基础信息配置）。
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50 px-5 py-4 space-y-3">
          {blocks.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">暂无待接受的派发</div>
          ) : (
            blocks.map((b, idx) => (
              <div key={b.transfer.id} className={`rounded-xl border overflow-hidden ${b.selected ? 'border-indigo-300 bg-white' : 'border-slate-200 bg-white/60'}`}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={b.selected}
                    onChange={() => toggleSelect(idx)}
                    className="w-4 h-4 accent-indigo-600"
                  />
                  <button
                    type="button"
                    onClick={() => toggleExpand(idx)}
                    className="flex items-center gap-1 text-slate-400 hover:text-slate-600"
                  >
                    {b.expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  <Package className="w-5 h-5 text-indigo-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-black text-slate-900 truncate">{b.transfer.senderProductName || '—'}</span>
                      {b.transfer.senderProductSku && <span className="text-xs font-bold text-slate-500 shrink-0">{b.transfer.senderProductSku}</span>}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-700">合计 {b.pendingQty} 件</span>
                      <span>{b.pendingDispatchIds.length} 条派发</span>
                      {b.specPreview && <span className="truncate">{b.specPreview}</span>}
                    </div>
                  </div>
                </div>
                {b.expanded && (
                  <div className="border-t border-slate-100 p-4 space-y-3 bg-slate-50">
                    <p className="text-[10px] font-black text-slate-400 uppercase">乙方新建产品（默认沿用甲方信息，可修改）</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase block ml-1">产品名称 *</label>
                        <input
                          type="text"
                          value={b.acceptName}
                          onChange={e => updateField(idx, 'acceptName', e.target.value)}
                          disabled={!b.selected}
                          className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase block ml-1">产品编号/SKU *</label>
                        <input
                          type="text"
                          value={b.acceptSku}
                          onChange={e => updateField(idx, 'acceptSku', e.target.value)}
                          disabled={!b.selected}
                          className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase block ml-1">描述</label>
                      <input
                        type="text"
                        value={b.acceptDesc}
                        onChange={e => updateField(idx, 'acceptDesc', e.target.value)}
                        disabled={!b.selected}
                        placeholder="选填"
                        className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-sm font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
                      />
                    </div>
                    {(b.acceptColors.length > 0 || b.acceptSizes.length > 0) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {b.acceptColors.length > 0 && (
                          <div>
                            <span className="text-[10px] font-black text-slate-400 uppercase block ml-1 mb-1">颜色（来自甲方）</span>
                            <div className="flex flex-wrap gap-1.5">
                              {b.acceptColors.map((c, i) => (
                                <span key={i} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs font-bold">{c}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {b.acceptSizes.length > 0 && (
                          <div>
                            <span className="text-[10px] font-black text-slate-400 uppercase block ml-1 mb-1">尺码（来自甲方）</span>
                            <div className="flex flex-wrap gap-1.5">
                              {b.acceptSizes.map((s, i) => (
                                <span key={i} className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-xs font-bold">{s}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="flex gap-3 px-5 py-3 border-t border-slate-200 bg-white shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">取消</button>
          <button
            disabled={submitting || selectedCount === 0}
            onClick={submit}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? '处理中...' : `确认接受${selectedCount > 0 ? `（${selectedCount}）` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(CollabPeerAcceptModal);
