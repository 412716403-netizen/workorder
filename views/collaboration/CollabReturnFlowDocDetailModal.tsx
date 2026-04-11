import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { ScrollText, X, Check, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import type { ProductionOpRecord, Product, Warehouse, AppDictionaries } from '../../types';
import { useConfirm } from '../../contexts/ConfirmContext';
import * as api from '../../services/api';
import { sortedVariantColorEntries } from '../../utils/sortVariantsByProduct';

type ProductVariant = { id: string; colorId: string; sizeId: string; [k: string]: any };

function normSpec(s?: string | null) {
  return String(s ?? '').trim();
}

/** 将修订 payload 行按颜色/尺码名映射到产品规格 id */
function variantQtyFromAmendmentItems(
  variants: ProductVariant[],
  items: Array<{ colorName?: string; sizeName?: string; quantity: unknown }>,
  dictionaries: AppDictionaries,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of variants) {
    const cn = v.colorId ? dictionaries.colors.find(c => c.id === v.colorId)?.name : '';
    const sn = v.sizeId ? dictionaries.sizes.find(s => s.id === v.sizeId)?.name : '';
    const row = items.find(
      it => normSpec(it.colorName) === normSpec(cn) && normSpec(it.sizeName) === normSpec(sn),
    );
    out[v.id] = row ? Number(row.quantity) || 0 : 0;
  }
  return out;
}

interface CollabReturnFlowDocDetailModalProps {
  docNo: string;
  records: ProductionOpRecord[];
  products: Product[];
  warehouses: Warehouse[];
  dictionaries: AppDictionaries;
  onClose: () => void;
  onRefreshRecords?: () => Promise<void>;
}

const CollabReturnFlowDocDetailModal: React.FC<CollabReturnFlowDocDetailModalProps> = ({
  docNo,
  records,
  products,
  warehouses,
  dictionaries,
  onClose,
  onRefreshRecords,
}) => {
  const confirm = useConfirm();
  const [editMode, setEditMode] = useState(false);
  const [editQuantities, setEditQuantities] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [linkedReturn, setLinkedReturn] = useState<any>(null);

  const docRecords = useMemo(
    () =>
      records
        .filter(r => r.type === 'STOCK_OUT' && r.operator === '协作回传出库' && r.docNo === docNo)
        .sort((a, b) => (a.variantId ?? '').localeCompare(b.variantId ?? '')),
    [records, docNo],
  );

  const collabIds = useMemo(() => {
    const f = docRecords[0];
    if (!f) return { returnId: null as string | null, transferId: null as string | null };
    return {
      returnId: ((f as any).collabData?.returnId ?? null) as string | null,
      transferId: ((f as any).collabData?.transferId ?? null) as string | null,
    };
  }, [docRecords]);

  const docQtySig = useMemo(() => docRecords.map(r => `${r.id}:${r.quantity}`).join(','), [docRecords]);

  const refreshLinkedReturn = useCallback(async () => {
    if (!collabIds.transferId || !collabIds.returnId) {
      setLinkedReturn(null);
      return;
    }
    try {
      const t = await api.collaboration.getTransfer(collabIds.transferId);
      const ret = (t.returns || []).find((r: any) => r.id === collabIds.returnId);
      setLinkedReturn(ret ?? null);
    } catch {
      setLinkedReturn(null);
    }
  }, [collabIds.transferId, collabIds.returnId]);

  useEffect(() => {
    void refreshLinkedReturn();
  }, [refreshLinkedReturn, docQtySig, docNo]);

  if (docRecords.length === 0) return null;

  const first = docRecords[0];
  const collabReturnId = collabIds.returnId;
  const product = products.find(p => p.id === first.productId);
  const wh = first.warehouseId ? warehouses.find(w => w.id === first.warehouseId) : null;
  const allVariants: ProductVariant[] = (product?.variants as ProductVariant[] ?? []);

  const partnerName = first.partner ?? '—';

  const docDateStr = first.timestamp
    ? (() => {
        try {
          const d = new Date(first.timestamp);
          return isNaN(d.getTime())
            ? first.timestamp
            : d.toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              });
        } catch {
          return first.timestamp;
        }
      })()
    : '—';

  const variantQty: Record<string, number> = {};
  docRecords.forEach(r => {
    const vid = r.variantId || '';
    variantQty[vid] = (variantQty[vid] || 0) + r.quantity;
  });

  const variantIdsFromRecords = new Set(Object.keys(variantQty).filter(v => v !== ''));
  const hasVariantRecords = variantIdsFromRecords.size > 0;
  let variantsForDetail: ProductVariant[] = [];
  if (hasVariantRecords && allVariants.length > 0) {
    variantsForDetail = allVariants.filter(v => variantIdsFromRecords.has(v.id));
  }
  const showVariantGrid = variantsForDetail.length > 0 && variantsForDetail.some(v => v.colorId || v.sizeId);

  const totalQty = docRecords.reduce((s, r) => s + r.quantity, 0);

  const pendingAConfirm = linkedReturn?.amendmentStatus === 'PENDING_A_CONFIRM';
  const pendingReceive = linkedReturn?.status === 'PENDING_A_RECEIVE';
  const showWaitPartyA = pendingAConfirm || pendingReceive;
  const amendItems = (linkedReturn?.amendmentPayload?.items ?? []) as Array<{
    colorName?: string;
    sizeName?: string;
    quantity: number;
  }>;

  let displayVariantQty = variantQty;
  let displayTotalQty = totalQty;
  if (pendingAConfirm && amendItems.length > 0) {
    if (showVariantGrid && variantsForDetail.length > 0) {
      displayVariantQty = variantQtyFromAmendmentItems(variantsForDetail, amendItems, dictionaries);
      displayTotalQty = variantsForDetail.reduce((s, v) => s + (displayVariantQty[v.id] ?? 0), 0);
    } else if (!showVariantGrid) {
      displayTotalQty = amendItems.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
    }
  }

  const enterEditMode = () => {
    if (pendingAConfirm) return;
    const initQty: Record<string, number> = {};
    if (showVariantGrid) {
      variantsForDetail.forEach(v => {
        initQty[v.id] = variantQty[v.id] ?? 0;
      });
    } else {
      initQty['__total'] = totalQty;
    }
    setEditQuantities(initQty);
    setEditMode(true);
  };

  const updateLocalRecords = async () => {
    if (showVariantGrid) {
      for (const v of variantsForDetail) {
        const qty = Number(editQuantities[v.id]) || 0;
        const recs = docRecords.filter(r => r.variantId === v.id);
        if (recs.length === 0) continue;
        if (qty <= 0) {
          for (const r of recs) await api.production.delete(r.id);
        } else {
          await api.production.update(recs[0].id, { quantity: qty });
          for (let i = 1; i < recs.length; i++) await api.production.delete(recs[i].id);
        }
      }
    } else {
      const qty = Number(editQuantities['__total']) || 0;
      const recs = [...docRecords].sort((a, b) => a.id.localeCompare(b.id));
      await api.production.update(recs[0].id, { quantity: qty });
      for (let i = 1; i < recs.length; i++) await api.production.delete(recs[i].id);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const hasPositive = showVariantGrid
        ? variantsForDetail.some(v => (Number(editQuantities[v.id]) || 0) > 0)
        : (Number(editQuantities['__total']) || 0) > 0;
      if (!hasPositive) {
        toast.error('数量不能全部为零');
        return;
      }

      if (!collabReturnId) {
        await updateLocalRecords();
        toast.success('已保存');
        await onRefreshRecords?.();
        setEditMode(false);
        return;
      }

      const entries = Object.entries(editQuantities).filter(([, q]) => Number(q) > 0);
      const items: { colorName?: string; sizeName?: string; quantity: number; variantId?: string }[] = [];
      if (showVariantGrid) {
        for (const [vid, qty] of entries) {
          const v = variantsForDetail.find(x => x.id === vid);
          if (!v) continue;
          const color = v.colorId ? dictionaries.colors.find(c => c.id === v.colorId) : null;
          const size = v.sizeId ? dictionaries.sizes.find(s => s.id === v.sizeId) : null;
          items.push({ colorName: color?.name, sizeName: size?.name, quantity: Number(qty) || 0, variantId: vid });
        }
      } else {
        items.push({ quantity: Number(entries[0][1]) || 0 });
      }

      const doSync = await confirm({ message: '是否将修改后的回传数据同步给甲方？\n\n选择"确认"将推送修订。' });
      if (doSync) {
        try {
          await api.collaboration.updateReturnPayload(collabReturnId, { items, warehouseId: first.warehouseId });
          toast.success('回传已更新并同步');
        } catch (err: any) {
          if (err.message?.includes('仅待甲方收回')) {
            try {
              await api.collaboration.amendReturn(collabReturnId, { items });
              await updateLocalRecords();
              toast.success('已向甲方推送回传修订');
            } catch (e2: any) {
              toast.error(`修订失败: ${e2.message || '未知错误'}`);
              return;
            }
          } else {
            toast.error(`更新失败: ${err.message || '未知错误'}`);
            return;
          }
        }
        await refreshLinkedReturn();
      } else {
        await updateLocalRecords();
        toast.success('已保存（未同步至协作方）');
      }

      await onRefreshRecords?.();
      setEditMode(false);
    } catch (err: any) {
      toast.error(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60" onClick={() => { onClose(); setEditMode(false); }} aria-hidden />
      <div className="relative bg-white w-full max-w-3xl max-h-[85vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-emerald-600" /> 回传单据详情 · {docNo}
          </h3>
          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                <button type="button" onClick={() => setEditMode(false)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">取消</button>
                <button type="button" disabled={saving} onClick={handleSave} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                  <Check className="w-4 h-4" /> {saving ? '保存中...' : collabReturnId ? '保存并同步' : '保存'}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={enterEditMode}
                disabled={!!pendingAConfirm}
                title={pendingAConfirm ? '有待甲方确认的修订，请等待对方处理后再编辑' : undefined}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 ${pendingAConfirm ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Pencil className="w-4 h-4" /> 编辑
              </button>
            )}
            <button type="button" onClick={() => { onClose(); setEditMode(false); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Basic info */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">单据基本信息</h4>
          {pendingAConfirm && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 leading-relaxed">
              当前为<strong>待甲方确认</strong>的修订：下列数量与合计已按推送内容展示；本地出库流水仍以甲方确认前为准。
            </div>
          )}
          {pendingReceive && !pendingAConfirm && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 leading-relaxed">
              当前协作状态为<strong>待甲方确认</strong>：甲方尚未收回本单，收回后进度才会按回传更新。
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">单号</label>
              <div className="w-full h-[44px] rounded-xl border border-slate-200 py-2.5 px-4 text-sm font-bold text-slate-800 bg-white flex items-center">{docNo}</div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">业务时间</label>
              <div className="w-full h-[44px] rounded-xl border border-slate-200 py-2.5 px-4 text-sm font-bold text-slate-800 bg-white flex items-center">{docDateStr}</div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">合作单位</label>
              <div className="w-full h-[44px] rounded-xl border border-slate-200 py-2.5 px-4 text-sm font-bold text-teal-700 bg-white flex items-center">{partnerName}</div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">出库仓库</label>
              <div className="w-full h-[44px] rounded-xl border border-slate-200 py-2.5 px-4 text-sm font-bold text-slate-800 bg-white flex items-center">{wh?.name ?? '—'}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">产品</label>
              <div className="w-full min-h-[44px] rounded-xl border border-slate-200 py-2 px-4 text-sm font-bold text-slate-800 bg-white flex flex-col justify-center gap-0.5 leading-snug">
                <span className="break-words">{product?.name ?? '—'}</span>
                {product?.sku ? <span className="text-xs font-semibold text-slate-400 shrink-0">{product.sku}</span> : null}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">总数量</label>
              <div className="w-full h-[44px] rounded-xl border border-slate-200 py-2.5 px-4 text-sm font-black text-indigo-600 bg-white flex items-center">
                {editMode ? Object.values(editQuantities).reduce((s, v) => s + v, 0) : displayTotalQty}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">协作状态</label>
              <div className="w-full min-h-[44px] rounded-xl border border-slate-200 py-2.5 px-4 text-sm font-bold bg-white flex items-center">
                {!collabReturnId && <span className="text-slate-400">无协作关联</span>}
                {collabReturnId && showWaitPartyA && (
                  <span className="text-amber-700 font-black">待甲方确认</span>
                )}
                {collabReturnId && !showWaitPartyA && linkedReturn?.status === 'A_RECEIVED' && (
                  <span className="text-emerald-600">已收回</span>
                )}
                {collabReturnId && !showWaitPartyA && linkedReturn?.status === 'WITHDRAWN' && (
                  <span className="text-slate-500">已撤回</span>
                )}
                {collabReturnId && !showWaitPartyA && linkedReturn && linkedReturn.status !== 'A_RECEIVED' && linkedReturn.status !== 'WITHDRAWN' && (
                  <span className="text-slate-600">{linkedReturn.status}</span>
                )}
                {collabReturnId && !showWaitPartyA && !linkedReturn && (
                  <span className="text-emerald-600">已关联协作回传</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Item detail */}
        <div className="flex-1 overflow-auto min-h-0 p-6">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">明细</h4>

          {showVariantGrid ? (
            <div className="space-y-4">
              {(() => {
                const groupedByColor: Record<string, ProductVariant[]> = {};
                variantsForDetail.forEach(v => {
                  if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = [];
                  groupedByColor[v.colorId].push(v);
                });
                return sortedVariantColorEntries(groupedByColor, product?.colorIds, product?.sizeIds).map(([colorId, colorVariants]) => {
                  const color = dictionaries.colors.find(c => c.id === colorId);
                  return (
                    <div key={colorId} className="flex flex-col md:flex-row md:items-center gap-4 p-4 bg-slate-50/50 rounded-xl border border-slate-200">
                      <div className="flex items-center gap-3 w-36 shrink-0">
                        <div className="w-5 h-5 rounded-full border border-slate-200" style={{ backgroundColor: color?.value }} />
                        <span className="text-sm font-black text-slate-700">{color?.name ?? colorId}</span>
                      </div>
                      <div className="flex-1 flex flex-wrap gap-4">
                        {colorVariants.map(v => {
                          const size = dictionaries.sizes.find(s => s.id === v.sizeId);
                          const qty = editMode ? (editQuantities[v.id] ?? 0) : (displayVariantQty[v.id] ?? 0);
                          return (
                            <div key={v.id} className="flex flex-col gap-1.5 w-24">
                              <span className="text-[10px] font-black text-slate-400 text-center uppercase">{size?.name ?? v.sizeId}</span>
                              {editMode ? (
                                <input
                                  type="number"
                                  min={0}
                                  value={editQuantities[v.id] ?? ''}
                                  onChange={e => setEditQuantities(prev => ({ ...prev, [v.id]: Number(e.target.value) || 0 }))}
                                  className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-indigo-600 text-center focus:outline-none focus:ring-2 focus:ring-emerald-200"
                                />
                              ) : (
                                <div className="flex items-center justify-center bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm font-bold text-indigo-600 min-h-[40px]">{qty}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          ) : (
            <div className="bg-slate-50/50 rounded-2xl border border-slate-200 p-6">
              <div className="flex items-center gap-4">
                <span className="text-sm font-bold text-slate-800">{product?.name ?? '—'}</span>
                <div className="flex items-center gap-3 flex-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">回传数量</label>
                  {editMode ? (
                    <input
                      type="number"
                      min={0}
                      value={editQuantities['__total'] ?? ''}
                      onChange={e => setEditQuantities({ '__total': Number(e.target.value) || 0 })}
                      className="w-32 rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-indigo-600 text-center focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    />
                  ) : (
                    <div className="flex items-center justify-center bg-white border border-slate-200 rounded-xl w-32 py-2 px-3 text-sm font-bold text-indigo-600 min-h-[40px]">{displayTotalQty}</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(CollabReturnFlowDocDetailModal);
