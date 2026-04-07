import React, { useState, useMemo } from 'react';
import {
  ArrowUpFromLine,
  Undo2,
  Layers,
  ScrollText,
  Check,
  Package,
} from 'lucide-react';
import type {
  ProductionOpRecord,
  ProdOpType,
} from '../../types';
import { PanelProps, hasOpsPerm, getOrderFamilyIds, type StockDocDetail } from './types';
import {
  moduleHeaderRowClass,
  outlineAccentToolbarButtonClass,
  pageSubtitleClass,
  pageTitleClass,
} from '../../styles/uiDensity';
import StockConfirmModal from './StockConfirmModal';
import StockDocDetailModal from './StockDocDetailModal';
import StockFlowListModal from './StockFlowListModal';
import StockMaterialFormModal from './StockMaterialFormModal';

const StockMaterialPanel: React.FC<PanelProps> = ({
  productionLinkMode,
  productMilestoneProgresses,
  records,
  orders,
  products,
  warehouses,
  boms,
  dictionaries,
  onAddRecord,
  onAddRecordBatch,
  onUpdateRecord,
  onDeleteRecord,
  userPermissions,
  tenantRole,
}) => {
  const canViewMainList = hasOpsPerm(tenantRole, userPermissions, 'production:material_list:allow');

  const [showModal, setShowModal] = useState(false);
  const [stockModalMode, setStockModalMode] = useState<'stock_out' | 'stock_return' | null>(null);
  const [showStockFlowModal, setShowStockFlowModal] = useState(false);
  const [stockSelectOrderId, setStockSelectOrderId] = useState<string | null>(null);
  const [stockSelectMode, setStockSelectMode] = useState<'stock_out' | 'stock_return' | null>(null);
  const [stockSelectedIds, setStockSelectedIds] = useState<Set<string>>(new Set());
  const [stockSelectSourceProductId, setStockSelectSourceProductId] = useState<string | null>(null);
  const [showStockConfirmModal, setShowStockConfirmModal] = useState(false);
  const [stockConfirmQuantities, setStockConfirmQuantities] = useState<Record<string, number>>({});
  const [stockConfirmWarehouseId, setStockConfirmWarehouseId] = useState('');
  const [stockConfirmReason, setStockConfirmReason] = useState('');
  const [stockDocDetail, setStockDocDetail] = useState<StockDocDetail | null>(null);

  const parentOrders = useMemo(() => orders.filter(o => !o.parentOrderId), [orders]);

  /** 按父工单聚合：父工单 id -> 该父工单及所有子工单下各物料的 领料/退料/净领用/报工理论耗材 汇总；含 BOM 全部物料（无记录时也显示） */
  const parentMaterialStats = useMemo(() => {
    const result = new Map<string, { productId: string; issue: number; returnQty: number; theoryCost: number }[]>();
    const parentList = orders.filter(o => !o.parentOrderId);
    parentList.forEach(parent => {
      const familyIds = new Set(getOrderFamilyIds(orders, parent.id));
      const prodMap = new Map<string, { issue: number; returnQty: number; theoryCost: number }>();
      const familyOrders = orders.filter(o => familyIds.has(o.id));
      familyOrders.forEach(ord => {
        const ordProduct = products.find(p => p.id === ord.productId);
        const variants = ordProduct?.variants ?? [];
        const variantCompletedMap = new Map<string, number>();
        ord.milestones.forEach(ms => {
          (ms.reports || []).forEach(r => {
            const vid = r.variantId ?? '';
            variantCompletedMap.set(vid, (variantCompletedMap.get(vid) ?? 0) + Number(r.quantity));
          });
        });
        const bestMsIdx = ord.milestones.reduce((bi, ms, i) => ms.completedQuantity > (ord.milestones[bi]?.completedQuantity ?? 0) ? i : bi, 0);
        const bestMs = ord.milestones[bestMsIdx];
        if (bestMs) {
          variantCompletedMap.clear();
          (bestMs.reports || []).forEach(r => {
            const vid = r.variantId ?? '';
            variantCompletedMap.set(vid, (variantCompletedMap.get(vid) ?? 0) + Number(r.quantity));
          });
        }
        const totalCompleted = ord.milestones.reduce((max, ms) => Math.max(max, ms.completedQuantity), 0);

        const addTheory = (bi: { productId: string; quantity: number }, qty: number) => {
          const theory = Number(bi.quantity) * qty;
          if (!prodMap.has(bi.productId)) prodMap.set(bi.productId, { issue: 0, returnQty: 0, theoryCost: 0 });
          prodMap.get(bi.productId)!.theoryCost += theory;
        };

        if (variants.length > 0 && variantCompletedMap.size > 0) {
          variants.forEach(v => {
            const vCompleted = variantCompletedMap.get(v.id) ?? 0;
            if (vCompleted <= 0) return;
            const seenBomIds = new Set<string>();
            if (v.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
              (Object.values(v.nodeBoms) as string[]).forEach(bomId => {
                if (seenBomIds.has(bomId)) return;
                seenBomIds.add(bomId);
                const bom = boms.find(b => b.id === bomId);
                bom?.items.forEach(bi => addTheory(bi, vCompleted));
              });
            } else {
              boms.filter(b => b.parentProductId === ordProduct!.id && b.variantId === v.id && b.nodeId).forEach(bom => {
                if (seenBomIds.has(bom.id)) return;
                seenBomIds.add(bom.id);
                bom.items.forEach(bi => addTheory(bi, vCompleted));
              });
            }
          });
        } else if (variants.length > 0) {
          variants.forEach(v => {
            const seenBomIds = new Set<string>();
            if (v.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
              (Object.values(v.nodeBoms) as string[]).forEach(bomId => {
                if (seenBomIds.has(bomId)) return;
                seenBomIds.add(bomId);
                const bom = boms.find(b => b.id === bomId);
                bom?.items.forEach(bi => addTheory(bi, totalCompleted));
              });
            }
          });
          if (prodMap.size === 0 && ordProduct) {
            boms.filter(b => b.parentProductId === ordProduct.id && b.nodeId).forEach(bom => {
              bom.items.forEach(bi => addTheory(bi, totalCompleted));
            });
          }
        } else if (ordProduct) {
          boms.filter(b => b.parentProductId === ordProduct.id && b.nodeId).forEach(bom => {
            bom.items.forEach(bi => addTheory(bi, totalCompleted));
          });
        }
      });
      records.forEach(r => {
        if ((r.type !== 'STOCK_OUT' && r.type !== 'STOCK_RETURN') || !familyIds.has(r.orderId)) return;
        if (!prodMap.has(r.productId)) prodMap.set(r.productId, { issue: 0, returnQty: 0, theoryCost: 0 });
        const cur = prodMap.get(r.productId)!;
        if (r.type === 'STOCK_OUT') cur.issue += r.quantity;
        else cur.returnQty += r.quantity;
      });
      result.set(parent.id, Array.from(prodMap.entries()).map(([productId, v]) => ({ productId, ...v })));
    });
    return result;
  }, [records, orders, boms, products]);

  /** 关联产品模式：按成品聚合物料（多工单同产品合并一行卡片） */
  const productMaterialStatsByProduct = useMemo(() => {
    if (productionLinkMode !== 'product') return null as Map<string, { productId: string; issue: number; returnQty: number; theoryCost: number }[]> | null;
    const result = new Map<string, { productId: string; issue: number; returnQty: number; theoryCost: number }[]>();
    const finishedProductHasBom = (fpId: string): boolean => {
      const ordProduct = products.find(p => p.id === fpId);
      if (!ordProduct) return false;
      const variants = ordProduct.variants ?? [];
      const bomItems: { productId: string; quantity: number }[] = [];
      if (variants.length > 0) {
        variants.forEach(v => {
          if (v.nodeBoms) {
            Object.values(v.nodeBoms).forEach(bomId => {
              const bom = boms.find(b => b.id === bomId);
              bom?.items.forEach(bi => bomItems.push(bi));
            });
          }
        });
      }
      if (bomItems.length === 0) {
        boms.filter(b => b.parentProductId === ordProduct.id && b.nodeId).forEach(bom => {
          bom.items.forEach(bi => bomItems.push(bi));
        });
      }
      return bomItems.length > 0;
    };
    const finishedIds = ([...new Set(orders.filter(o => !o.parentOrderId).map(o => o.productId))] as string[])
      .filter(Boolean)
      .filter(fpId => finishedProductHasBom(fpId));
    for (const fpId of finishedIds) {
      const roots = orders.filter(o => !o.parentOrderId && o.productId === fpId);
      const allFamilyIds = new Set<string>();
      roots.forEach(p => getOrderFamilyIds(orders, p.id).forEach(id => allFamilyIds.add(id)));
      const prodMap = new Map<string, { issue: number; returnQty: number; theoryCost: number }>();
      roots.forEach(parent => {
        const familyIds = new Set(getOrderFamilyIds(orders, parent.id));
        const familyOrders = orders.filter(o => familyIds.has(o.id));
        familyOrders.forEach(ord => {
          const ordProduct = products.find(p => p.id === ord.productId);
          const variants = ordProduct?.variants ?? [];
          let totalCompleted = ord.milestones.reduce((max, ms) => Math.max(max, ms.completedQuantity), 0);
          if (totalCompleted <= 0 && productMilestoneProgresses.length > 0) {
            const pm = productMilestoneProgresses.filter(p => p.productId === fpId);
            if (pm.length > 0) totalCompleted = Math.max(...pm.map(p => p.completedQuantity ?? 0), 0);
          }

          const variantCompletedMap = new Map<string, number>();
          const bestMsIdx = ord.milestones.reduce((bi, ms, i) => ms.completedQuantity > (ord.milestones[bi]?.completedQuantity ?? 0) ? i : bi, 0);
          const bestMs = ord.milestones[bestMsIdx];
          if (bestMs) {
            (bestMs.reports || []).forEach(r => {
              const vid = r.variantId ?? '';
              variantCompletedMap.set(vid, (variantCompletedMap.get(vid) ?? 0) + Number(r.quantity));
            });
          }

          const addTheory2 = (bi: { productId: string; quantity: number }, qty: number) => {
            const theory = Number(bi.quantity) * qty;
            if (!prodMap.has(bi.productId)) prodMap.set(bi.productId, { issue: 0, returnQty: 0, theoryCost: 0 });
            prodMap.get(bi.productId)!.theoryCost += theory;
          };

          if (variants.length > 0 && variantCompletedMap.size > 0) {
            variants.forEach(v => {
              const vCompleted = variantCompletedMap.get(v.id) ?? 0;
              if (vCompleted <= 0) return;
              const seenBomIds = new Set<string>();
              if (v.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
                (Object.values(v.nodeBoms) as string[]).forEach(bomId => {
                  if (seenBomIds.has(bomId)) return;
                  seenBomIds.add(bomId);
                  const bom = boms.find(b => b.id === bomId);
                  bom?.items.forEach(bi => addTheory2(bi, vCompleted));
                });
              } else {
                boms.filter(b => b.parentProductId === ordProduct!.id && b.variantId === v.id && b.nodeId).forEach(bom => {
                  if (seenBomIds.has(bom.id)) return;
                  seenBomIds.add(bom.id);
                  bom.items.forEach(bi => addTheory2(bi, vCompleted));
                });
              }
            });
          } else if (ordProduct) {
            const bomItems: { productId: string; quantity: number }[] = [];
            if (variants.length > 0) {
              variants.forEach(v => {
                if (v.nodeBoms) {
                  const seenBomIds = new Set<string>();
                  (Object.values(v.nodeBoms) as string[]).forEach(bomId => {
                    if (seenBomIds.has(bomId)) return;
                    seenBomIds.add(bomId);
                    const bom = boms.find(b => b.id === bomId);
                    bom?.items.forEach(bi => bomItems.push({ productId: bi.productId, quantity: Number(bi.quantity) }));
                  });
                }
              });
            }
            if (bomItems.length === 0) {
              boms.filter(b => b.parentProductId === ordProduct.id && b.nodeId).forEach(bom => {
                bom.items.forEach(bi => bomItems.push({ productId: bi.productId, quantity: Number(bi.quantity) }));
              });
            }
            bomItems.forEach(bi => addTheory2(bi, totalCompleted));
          }
        });
      });
      records.forEach(r => {
        if (r.type !== 'STOCK_OUT' && r.type !== 'STOCK_RETURN') return;
        const bySource = r.sourceProductId === fpId;
        const byOrder = r.orderId && allFamilyIds.has(r.orderId);
        if (!bySource && !byOrder) return;
        if (!prodMap.has(r.productId)) prodMap.set(r.productId, { issue: 0, returnQty: 0, theoryCost: 0 });
        const cur = prodMap.get(r.productId)!;
        if (r.type === 'STOCK_OUT') cur.issue += r.quantity;
        else cur.returnQty += r.quantity;
      });
      result.set(fpId, Array.from(prodMap.entries()).map(([productId, v]) => ({ productId, ...v })));
    }
    return result;
  }, [productionLinkMode, records, orders, boms, products, productMilestoneProgresses]);

  /** 领料/退料单据号：领料 LLyyyyMMdd-0001，退料 TLyyyyMMdd-0001，当日同类型顺序递增 */
  const getNextStockDocNo = (type: 'STOCK_OUT' | 'STOCK_RETURN') => {
    const prefix = type === 'STOCK_OUT' ? 'LL' : 'TL';
    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const pattern = `${prefix}${todayStr}-`;
    const existing = records.filter(r => r.type === type && r.docNo && r.docNo.startsWith(pattern));
    const seqs = existing.map(r => parseInt(r.docNo!.slice(pattern.length), 10)).filter(n => !isNaN(n));
    const maxSeq = seqs.length ? Math.max(...seqs) : 0;
    return `${prefix}${todayStr}-${String(maxSeq + 1).padStart(4, '0')}`;
  };

  const handleStockConfirmSubmit = async () => {
    if (!stockSelectMode) return;
    const toSubmit = Array.from(stockSelectedIds).filter(pid => (stockConfirmQuantities[pid] ?? 0) > 0);
    if (toSubmit.length === 0) return;
    const recordType: ProdOpType = stockSelectMode === 'stock_out' ? 'STOCK_OUT' : 'STOCK_RETURN';
    const docNo = getNextStockDocNo(recordType);
    const timestamp = new Date().toLocaleString();
    const operator = '张主管';
    const srcPid = stockSelectSourceProductId;
    if (srcPid) {
      const batch: ProductionOpRecord[] = toSubmit.map(pid => ({
        id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: recordType,
        orderId: undefined,
        sourceProductId: srcPid,
        productId: pid,
        quantity: stockConfirmQuantities[pid],
        reason: stockConfirmReason || undefined,
        operator,
        timestamp,
        status: '已完成',
        warehouseId: stockConfirmWarehouseId || undefined,
        docNo
      } as ProductionOpRecord));
      if (onAddRecordBatch && batch.length > 1) {
        await onAddRecordBatch(batch);
      } else {
        for (const rec of batch) await onAddRecord(rec);
      }
      setStockDocDetail({
        docNo,
        type: recordType,
        orderId: '',
        sourceProductId: srcPid,
        timestamp,
        warehouseId: stockConfirmWarehouseId || '',
        lines: toSubmit.map(pid => ({ productId: pid, quantity: stockConfirmQuantities[pid] })),
        reason: stockConfirmReason || undefined,
        operator
      });
    } else if (stockSelectOrderId) {
      const batch: ProductionOpRecord[] = toSubmit.map(pid => ({
        id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: recordType,
        orderId: stockSelectOrderId,
        productId: pid,
        quantity: stockConfirmQuantities[pid],
        reason: stockConfirmReason || undefined,
        operator,
        timestamp,
        status: '已完成',
        warehouseId: stockConfirmWarehouseId || undefined,
        docNo
      } as ProductionOpRecord));
      if (onAddRecordBatch && batch.length > 1) {
        await onAddRecordBatch(batch);
      } else {
        for (const rec of batch) await onAddRecord(rec);
      }
      setStockDocDetail({
        docNo,
        type: recordType,
        orderId: stockSelectOrderId,
        timestamp,
        warehouseId: stockConfirmWarehouseId || '',
        lines: toSubmit.map(pid => ({ productId: pid, quantity: stockConfirmQuantities[pid] })),
        reason: stockConfirmReason || undefined,
        operator
      });
    } else return;
    setShowStockConfirmModal(false);
    setStockSelectOrderId(null);
    setStockSelectSourceProductId(null);
    setStockSelectMode(null);
    setStockSelectedIds(new Set());
    setStockConfirmQuantities({});
    setStockConfirmReason('');
  };

  return (
    <div className="space-y-4">
      <div className={moduleHeaderRowClass}>
        <div>
          <h1 className={pageTitleClass}>生产物料</h1>
          <p className={pageSubtitleClass}>物料下发与库存扣减</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0 justify-end">
        {!showModal && hasOpsPerm(tenantRole, userPermissions, 'production:material_records:view') && (
            <button
              type="button"
              onClick={() => setShowStockFlowModal(true)}
              className={outlineAccentToolbarButtonClass}
            >
              <ScrollText className="w-4 h-4 shrink-0" />
              领料退料流水
            </button>
        )}
        </div>
      </div>

      {!showModal && !canViewMainList && (
        <div className="bg-white border-2 border-dashed border-slate-100 rounded-[32px] p-20 text-center">
          <Layers className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-400 font-medium">无权限查看生产物料列表</p>
        </div>
      )}
      {!showModal && canViewMainList && (
        <div className="space-y-4">
          {productionLinkMode === 'product' && productMaterialStatsByProduct ? (
            (() => {
              const pEntries = Array.from(productMaterialStatsByProduct.entries());
              if (pEntries.length === 0) {
                return (
                  <div className="bg-white rounded-[32px] border border-slate-200 p-12 text-center">
                    <p className="text-slate-400 text-sm">暂无工单，请先在「生产计划」下达工单</p>
                  </div>
                );
              }
              return pEntries.map(([fpId, materials]) => {
                const fp = products.find(p => p.id === fpId);
                const orderCnt = orders.filter(o => !o.parentOrderId && o.productId === fpId).length;
                const selecting = stockSelectSourceProductId === fpId && stockSelectMode;
                return (
                  <div key={`fp-${fpId}`} className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                          <Package className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">关联产品（共 {orderCnt} 条工单）</p>
                          <p className="text-base font-bold text-slate-900 mt-0.5">{fp?.name ?? '—'}{fp?.sku ? <span className="text-slate-400 font-medium text-sm ml-2">{fp.sku}</span> : null}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {selecting ? (
                          <>
                            <span className="text-sm font-bold text-slate-500">已选 {stockSelectedIds.size} 项</span>
                            <button
                              type="button"
                              onClick={() => {
                                if (stockSelectedIds.size === 0) return;
                                setStockConfirmQuantities({});
                                setStockConfirmWarehouseId(warehouses[0]?.id ?? '');
                                setShowStockConfirmModal(true);
                              }}
                              disabled={stockSelectedIds.size === 0}
                              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-sm disabled:opacity-50 ${stockSelectMode === 'stock_out' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'}`}
                            >
                              <Check className="w-3.5 h-3.5" /> {stockSelectMode === 'stock_out' ? '确认领料' : '确认退料'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setStockSelectSourceProductId(null); setStockSelectMode(null); setStockSelectedIds(new Set()); }}
                              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
                            >
                              取消
                            </button>
                          </>
                        ) : (
                          <>
                            {hasOpsPerm(tenantRole, userPermissions, 'production:material_issue:allow') && (
                            <button
                              type="button"
                              onClick={() => { setStockSelectSourceProductId(fpId); setStockSelectOrderId(null); setStockSelectMode('stock_out'); setStockSelectedIds(new Set()); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-indigo-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all"
                            >
                              <ArrowUpFromLine className="w-3.5 h-3.5" /> 领料发出
                            </button>
                            )}
                            {hasOpsPerm(tenantRole, userPermissions, 'production:material_return:allow') && (
                            <button
                              type="button"
                              onClick={() => { setStockSelectSourceProductId(fpId); setStockSelectOrderId(null); setStockSelectMode('stock_return'); setStockSelectedIds(new Set()); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-indigo-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all"
                            >
                              <Undo2 className="w-3.5 h-3.5" /> 生产退料
                            </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50/80">
                            {selecting && (
                            <th className="px-4 py-3 w-12">
                              <input
                                type="checkbox"
                                checked={materials.length > 0 && materials.every(m => stockSelectedIds.has(m.productId))}
                                onChange={e => {
                                  if (e.target.checked) setStockSelectedIds(new Set(materials.map(m => m.productId)));
                                  else setStockSelectedIds(new Set());
                                }}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                            </th>
                            )}
                          <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">物料信息</th>
                          <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">生产领料(+)</th>
                          <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">生产退料(-)</th>
                          <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">净领用</th>
                          <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">报工耗材<span className="text-slate-300 font-normal">(理论)</span></th>
                          <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">当前结余</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {materials.length === 0 ? (
                          <tr>
                            <td colSpan={selecting ? 7 : 6} className="px-6 py-8 text-center text-slate-400 text-sm">该产品暂无 BOM 物料，请先在产品中配置 BOM</td>
                          </tr>
                        ) : (
                          materials.map(({ productId, issue, returnQty, theoryCost }) => {
                            const prod = products.find(p => p.id === productId);
                            const net = issue - returnQty;
                            const isSelected = stockSelectedIds.has(productId);
                            return (
                              <tr key={productId} className="hover:bg-slate-50/50 transition-colors">
                                {selecting && (
                                  <td className="px-4 py-3">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => {
                                        setStockSelectedIds(prev => {
                                          const next = new Set(prev);
                                          if (next.has(productId)) next.delete(productId);
                                          else next.add(productId);
                                          return next;
                                        });
                                      }}
                                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                  </td>
                                )}
                                <td className="px-6 py-3">
                                  <div>
                                    <p className="text-sm font-bold text-slate-800">{prod?.name ?? '未知物料'}</p>
                                    {prod?.sku && <p className="text-[10px] text-slate-400 font-medium">{prod.sku}</p>}
                                  </div>
                                </td>
                                <td className="px-6 py-3 text-center">
                                  <span className="text-sm font-bold text-indigo-600 inline-flex items-center gap-0.5">{issue} <ArrowUpFromLine className="w-3.5 h-3.5 opacity-70" /></span>
                                </td>
                                <td className="px-6 py-3 text-center">
                                  <span className="text-sm font-bold text-rose-600 inline-flex items-center gap-0.5">{returnQty} <Undo2 className="w-3.5 h-3.5 opacity-70" /></span>
                                </td>
                                <td className="px-6 py-3 text-center">
                                  <span className="text-sm font-bold text-slate-800">{net}</span>
                                </td>
                                <td className="px-6 py-3 text-center">
                                  <span className="text-sm font-bold text-amber-600">{Math.round(theoryCost * 100) / 100}</span>
                                </td>
                                <td className="px-6 py-3 text-center">
                                  {(() => {
                                    const balance = net - theoryCost;
                                    const rounded = Math.round(balance * 100) / 100;
                                    return (
                                      <span className={`text-sm font-bold ${rounded >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>{rounded}</span>
                                    );
                                  })()}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
              });
            })()
          ) : parentOrders.length === 0 ? (
            <div className="bg-white rounded-[32px] border border-slate-200 p-12 text-center">
              <p className="text-slate-400 text-sm">暂无工单，请先在「生产计划」下达工单</p>
            </div>
          ) : (
            parentOrders.map(order => {
              const product = products.find(p => p.id === order.productId);
              const materials = parentMaterialStats.get(order.id) ?? [];
              const familyIds = getOrderFamilyIds(orders, order.id);
              const childCount = familyIds.length - 1;
              return (
                <div key={order.id} className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                        <Layers className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                          工单号: {order.orderNumber}
                          {childCount > 0 && <span className="ml-2 text-slate-400 font-normal">（含 {childCount} 个子工单）</span>}
                        </p>
                        {order.priority && order.priority !== 'Medium' && (
                          <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[9px] font-bold ${order.priority === 'High' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                            {order.priority === 'High' ? 'HIGH' : 'LOW'}
                          </span>
                        )}
                        <p className="text-base font-bold text-slate-900 mt-0.5">{product?.name ?? order.productName ?? '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {stockSelectOrderId === order.id && stockSelectMode ? (
                        <>
                          <span className="text-sm font-bold text-slate-500">已选 {stockSelectedIds.size} 项</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (stockSelectedIds.size === 0) return;
                              setStockConfirmQuantities({});
                              setStockConfirmWarehouseId(warehouses[0]?.id ?? '');
                              setShowStockConfirmModal(true);
                            }}
                            disabled={stockSelectedIds.size === 0}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-sm disabled:opacity-50 ${stockSelectMode === 'stock_out' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'}`}
                          >
                            <Check className="w-3.5 h-3.5" /> {stockSelectMode === 'stock_out' ? '确认领料' : '确认退料'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setStockSelectOrderId(null); setStockSelectMode(null); setStockSelectedIds(new Set()); }}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          {hasOpsPerm(tenantRole, userPermissions, 'production:material_issue:allow') && (
                          <button
                            type="button"
                            onClick={() => { setStockSelectOrderId(order.id); setStockSelectSourceProductId(null); setStockSelectMode('stock_out'); setStockSelectedIds(new Set()); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-indigo-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all"
                          >
                            <ArrowUpFromLine className="w-3.5 h-3.5" /> 领料发出
                          </button>
                          )}
                          {hasOpsPerm(tenantRole, userPermissions, 'production:material_return:allow') && (
                          <button
                            type="button"
                            onClick={() => { setStockSelectOrderId(order.id); setStockSelectSourceProductId(null); setStockSelectMode('stock_return'); setStockSelectedIds(new Set()); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-indigo-600 rounded-lg hover:bg-slate-50 text-xs font-bold transition-all"
                          >
                            <Undo2 className="w-3.5 h-3.5" /> 生产退料
                          </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/80">
                          {stockSelectOrderId === order.id && (
                            <th className="px-4 py-3 w-12">
                              <input
                                type="checkbox"
                                checked={materials.length > 0 && materials.every(m => stockSelectedIds.has(m.productId))}
                                onChange={e => {
                                  if (e.target.checked) setStockSelectedIds(new Set(materials.map(m => m.productId)));
                                  else setStockSelectedIds(new Set());
                                }}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                            </th>
                          )}
                          <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">物料信息</th>
                          <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">生产领料(+)</th>
                          <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">生产退料(-)</th>
                          <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">净领用</th>
                          <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">报工耗材<span className="text-slate-300 font-normal">(理论)</span></th>
                          <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">当前结余</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {materials.length === 0 ? (
                          <tr>
                            <td colSpan={stockSelectOrderId === order.id ? 7 : 6} className="px-6 py-8 text-center text-slate-400 text-sm">该工单暂无 BOM 物料，请先在产品中配置 BOM</td>
                          </tr>
                        ) : (
                          materials.map(({ productId, issue, returnQty, theoryCost }) => {
                            const prod = products.find(p => p.id === productId);
                            const net = issue - returnQty;
                            const isSelected = stockSelectedIds.has(productId);
                            return (
                              <tr key={productId} className="hover:bg-slate-50/50 transition-colors">
                                {stockSelectOrderId === order.id && (
                                  <td className="px-4 py-3">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => {
                                        setStockSelectedIds(prev => {
                                          const next = new Set(prev);
                                          if (next.has(productId)) next.delete(productId);
                                          else next.add(productId);
                                          return next;
                                        });
                                      }}
                                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                  </td>
                                )}
                                <td className="px-6 py-3">
                                  <div>
                                    <p className="text-sm font-bold text-slate-800">{prod?.name ?? '未知物料'}</p>
                                    {prod?.sku && <p className="text-[10px] text-slate-400 font-medium">{prod.sku}</p>}
                                  </div>
                                </td>
                                <td className="px-6 py-3 text-center">
                                  <span className="text-sm font-bold text-indigo-600 inline-flex items-center gap-0.5">{issue} <ArrowUpFromLine className="w-3.5 h-3.5 opacity-70" /></span>
                                </td>
                                <td className="px-6 py-3 text-center">
                                  <span className="text-sm font-bold text-rose-600 inline-flex items-center gap-0.5">{returnQty} <Undo2 className="w-3.5 h-3.5 opacity-70" /></span>
                                </td>
                                <td className="px-6 py-3 text-center">
                                  <span className="text-sm font-bold text-slate-800">{net}</span>
                                </td>
                                <td className="px-6 py-3 text-center">
                                  <span className="text-sm font-bold text-amber-600">{Math.round(theoryCost * 100) / 100}</span>
                                </td>
                                <td className="px-6 py-3 text-center">
                                  {(() => {
                                    const balance = net - theoryCost;
                                    const rounded = Math.round(balance * 100) / 100;
                                    return (
                                      <span className={`text-sm font-bold ${rounded >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>{rounded}</span>
                                    );
                                  })()}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <StockConfirmModal
        visible={showStockConfirmModal}
        onClose={() => { setShowStockConfirmModal(false); setStockConfirmReason(''); }}
        onSubmit={handleStockConfirmSubmit}
        stockSelectMode={stockSelectMode}
        stockSelectOrderId={stockSelectOrderId}
        stockSelectSourceProductId={stockSelectSourceProductId}
        stockSelectedIds={stockSelectedIds}
        stockConfirmQuantities={stockConfirmQuantities}
        onQuantityChange={(pid, qty) => setStockConfirmQuantities(prev => ({ ...prev, [pid]: qty }))}
        stockConfirmWarehouseId={stockConfirmWarehouseId}
        onWarehouseChange={setStockConfirmWarehouseId}
        stockConfirmReason={stockConfirmReason}
        onReasonChange={setStockConfirmReason}
        orders={orders}
        products={products}
        warehouses={warehouses}
        dictionaries={dictionaries}
      />

      <StockDocDetailModal
        detail={stockDocDetail}
        onClose={() => setStockDocDetail(null)}
        onDetailChange={setStockDocDetail}
        records={records}
        orders={orders}
        products={products}
        warehouses={warehouses}
        dictionaries={dictionaries}
        onUpdateRecord={onUpdateRecord}
        onDeleteRecord={onDeleteRecord}
        userPermissions={userPermissions}
        tenantRole={tenantRole}
      />

      <StockFlowListModal
        visible={showStockFlowModal}
        onClose={() => setShowStockFlowModal(false)}
        records={records}
        orders={orders}
        products={products}
        productionLinkMode={productionLinkMode}
        onOpenDocDetail={setStockDocDetail}
        userPermissions={userPermissions}
        tenantRole={tenantRole}
      />

      <StockMaterialFormModal
        visible={showModal}
        onClose={() => { setShowModal(false); setStockModalMode(null); }}
        stockModalMode={stockModalMode}
        orders={orders}
        products={products}
        warehouses={warehouses}
        productionLinkMode={productionLinkMode}
        onAddRecord={onAddRecord}
        getNextStockDocNo={getNextStockDocNo}
      />
    </div>
  );
};

export default React.memo(StockMaterialPanel);
