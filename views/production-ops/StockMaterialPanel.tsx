import React, { useState, useMemo } from 'react';
import {
  ArrowUpFromLine,
  Undo2,
  Truck,
  Layers,
  X,
  ScrollText,
  Check,
  Filter,
  FileText,
  Pencil,
  Trash2,
  Package,
} from 'lucide-react';
import type {
  ProductionOpRecord,
  ProductionOrder,
  Product,
  ProdOpType,
  Warehouse,
  BOM,
  AppDictionaries,
  ProductMilestoneProgress,
} from '../../types';
import { PanelProps, hasOpsPerm, getOrderFamilyIds } from './types';
import {
  moduleHeaderRowClass,
  outlineAccentToolbarButtonClass,
  pageSubtitleClass,
  pageTitleClass,
} from '../../styles/uiDensity';
import { useConfirm } from '../../contexts/ConfirmContext';

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
  const confirm = useConfirm();
  const canViewMainList = hasOpsPerm(tenantRole, userPermissions, 'production:material_list:allow');

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    orderId: '',
    productId: '',
    quantity: 0,
    reason: '',
    partner: '',
    warehouseId: ''
  });
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
  const [stockFlowFilterType, setStockFlowFilterType] = useState<'all' | 'STOCK_OUT' | 'STOCK_RETURN'>('all');
  const [stockFlowFilterOrderKeyword, setStockFlowFilterOrderKeyword] = useState('');
  const [stockFlowFilterProductKeyword, setStockFlowFilterProductKeyword] = useState('');
  const [stockFlowFilterDocNo, setStockFlowFilterDocNo] = useState('');
  const [stockFlowFilterDateFrom, setStockFlowFilterDateFrom] = useState('');
  const [stockFlowFilterDateTo, setStockFlowFilterDateTo] = useState('');
  const [stockDocDetail, setStockDocDetail] = useState<{
    docNo: string;
    type: 'STOCK_OUT' | 'STOCK_RETURN';
    orderId: string;
    sourceProductId?: string;
    timestamp: string;
    warehouseId: string;
    lines: { productId: string; quantity: number }[];
    reason?: string;
    operator: string;
  } | null>(null);
  const [stockDocEditForm, setStockDocEditForm] = useState<{
    warehouseId: string;
    lines: { productId: string; quantity: number }[];
    reason: string;
  } | null>(null);

  const stockFlowRecords = useMemo(() =>
    records.filter(r => r.type === 'STOCK_OUT' || r.type === 'STOCK_RETURN').sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  , [records]);
  const { filteredStockFlowRecords, totalIssueQty, totalReturnQty, countIssue, countReturn } = useMemo(() => {
    let list = stockFlowRecords;
    if (stockFlowFilterType !== 'all') list = list.filter(r => r.type === stockFlowFilterType);
    if (stockFlowFilterOrderKeyword.trim()) {
      const kw = stockFlowFilterOrderKeyword.trim().toLowerCase();
      if (productionLinkMode === 'product') {
        list = list.filter(r => {
          const sp = r.sourceProductId ? products.find(x => x.id === r.sourceProductId) : null;
          const name = (sp?.name ?? '').toLowerCase();
          const id = (r.sourceProductId ?? '').toLowerCase();
          return name.includes(kw) || id.includes(kw);
        });
      } else {
        list = list.filter(r => {
          const o = orders.find(x => x.id === r.orderId);
          const orderNum = (o?.orderNumber ?? '').toLowerCase();
          const orderId = (r.orderId ?? '').toLowerCase();
          return orderNum.includes(kw) || orderId.includes(kw);
        });
      }
    }
    if (stockFlowFilterProductKeyword.trim()) {
      const kw = stockFlowFilterProductKeyword.trim().toLowerCase();
      list = list.filter(r => {
        const p = products.find(x => x.id === r.productId);
        const name = (p?.name ?? '').toLowerCase();
        const productId = (r.productId ?? '').toLowerCase();
        return name.includes(kw) || productId.includes(kw);
      });
    }
    if (stockFlowFilterDocNo.trim()) {
      const kw = stockFlowFilterDocNo.trim().toLowerCase();
      list = list.filter(r => ((r.docNo ?? '').toLowerCase()).includes(kw));
    }
    if (stockFlowFilterDateFrom) {
      const from = stockFlowFilterDateFrom;
      list = list.filter(r => {
        const d = r.timestamp ? new Date(r.timestamp).toISOString().split('T')[0] : '';
        return d >= from;
      });
    }
    if (stockFlowFilterDateTo) {
      const to = stockFlowFilterDateTo;
      list = list.filter(r => {
        const d = r.timestamp ? new Date(r.timestamp).toISOString().split('T')[0] : '';
        return d <= to;
      });
    }
    const issueList = list.filter(r => r.type === 'STOCK_OUT');
    const returnList = list.filter(r => r.type === 'STOCK_RETURN');
    const totalIssueQty = issueList.reduce((s, r) => s + r.quantity, 0);
    const totalReturnQty = returnList.reduce((s, r) => s + r.quantity, 0);
    return {
      filteredStockFlowRecords: list,
      totalIssueQty,
      totalReturnQty,
      countIssue: issueList.length,
      countReturn: returnList.length
    };
  }, [stockFlowRecords, stockFlowFilterType, stockFlowFilterOrderKeyword, stockFlowFilterProductKeyword, stockFlowFilterDocNo, stockFlowFilterDateFrom, stockFlowFilterDateTo, orders, products, productionLinkMode]);

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

  const buildStockDocDetailFromDocNo = (docNo: string) => {
    const docRecords = stockFlowRecords.filter(r => r.docNo === docNo);
    if (docRecords.length === 0) return null;
    const first = docRecords[0];
    return {
      docNo,
      type: first.type as 'STOCK_OUT' | 'STOCK_RETURN',
      orderId: first.orderId ?? '',
      sourceProductId: first.sourceProductId,
      timestamp: first.timestamp,
      warehouseId: first.warehouseId ?? '',
      lines: docRecords.map(r => ({ productId: r.productId, quantity: r.quantity })),
      reason: first.reason,
      operator: first.operator
    };
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

  const handleAdd = () => {
    const isStockReturn = stockModalMode === 'stock_return';
    const recordType: ProdOpType = isStockReturn ? 'STOCK_RETURN' : 'STOCK_OUT';
    const docNo = getNextStockDocNo(recordType);
    const newRecord: ProductionOpRecord = {
      id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: recordType,
      orderId: productionLinkMode === 'product' ? undefined : (form.orderId || undefined),
      productId: form.productId,
      quantity: form.quantity,
      reason: form.reason,
      partner: form.partner,
      operator: '张主管',
      timestamp: new Date().toLocaleString(),
      status: '已完成',
      warehouseId: form.warehouseId || undefined,
      docNo
    };
    onAddRecord(newRecord);
    setShowModal(false);
    setStockModalMode(null);
    setForm({ orderId: '', productId: '', quantity: 0, reason: '', partner: '', warehouseId: '' });
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

      {showStockConfirmModal && (stockSelectOrderId || stockSelectSourceProductId) && stockSelectMode && (() => {
        const order = stockSelectOrderId ? orders.find(o => o.id === stockSelectOrderId) : undefined;
        const srcProd = stockSelectSourceProductId ? products.find(p => p.id === stockSelectSourceProductId) : undefined;
        const selectedList: string[] = Array.from(stockSelectedIds);
        const hasValidQty = selectedList.some(pid => (stockConfirmQuantities[pid] ?? 0) > 0);
        const isReturn = stockSelectMode === 'stock_return';
        const getUnitName = (productId: string) => {
          const p = products.find(x => x.id === productId);
          return (p?.unitId && (dictionaries?.units ?? []).find(u => u.id === p.unitId)?.name) || '件';
        };
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setShowStockConfirmModal(false); setStockConfirmReason(''); }} aria-hidden />
            <div className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                    {srcProd ? srcProd.name : (order?.orderNumber ?? '')}
                  </span>
                  {isReturn ? '确认退料' : '确认领料'}
                </h3>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => { setShowStockConfirmModal(false); setStockConfirmReason(''); }} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">取消</button>
                  <button
                    type="button"
                    onClick={handleStockConfirmSubmit}
                    disabled={!hasValidQty}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-50 ${isReturn ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                  >
                    <Check className="w-4 h-4" /> {isReturn ? '确认退料' : '确认领料'}
                  </button>
                  <button type="button" onClick={() => { setShowStockConfirmModal(false); setStockConfirmReason(''); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-4">
                <h2 className="text-xl font-bold text-slate-900">{srcProd?.name ?? (order ? (products.find(p => p.id === order.productId)?.name ?? order.productName ?? '—') : '—')}</h2>
                <div className={`grid gap-3 ${warehouses.length > 0 ? 'grid-cols-[1fr_1.5fr]' : 'grid-cols-1'}`}>
                  {warehouses.length > 0 && (
                    <div className="bg-slate-50 rounded-xl px-4 py-2">
                      <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">{isReturn ? '退回仓库' : '出库仓库'}</p>
                      <select
                        value={stockConfirmWarehouseId}
                        onChange={e => setStockConfirmWarehouseId(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                      >
                        {warehouses.map(w => (
                          <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="bg-slate-50 rounded-xl px-4 py-2">
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">备注</p>
                    <input
                      type="text"
                      value={stockConfirmReason}
                      onChange={e => setStockConfirmReason(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                      placeholder="选填"
                    />
                  </div>
                </div>
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">物料</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-16">单位</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedList.map(pid => {
                        const prod = products.find(p => p.id === pid);
                        return (
                          <tr key={pid} className="border-b border-slate-100">
                            <td className="px-4 py-3 font-medium text-slate-800">{prod?.name ?? pid}</td>
                            <td className="px-4 py-3 text-right">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={stockConfirmQuantities[pid] ?? ''}
                                onChange={e => setStockConfirmQuantities(prev => ({ ...prev, [pid]: Number(e.target.value) || 0 }))}
                                className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200"
                                placeholder="0"
                              />
                            </td>
                            <td className="px-4 py-3 text-slate-500">{getUnitName(pid)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 领料/退料单保存后的单据详情弹窗 */}
      {stockDocDetail && (() => {
        const order = orders.find(o => o.id === stockDocDetail.orderId);
        const sourceProd = stockDocDetail.sourceProductId
          ? products.find(p => p.id === stockDocDetail.sourceProductId)
          : null;
        const warehouse = warehouses.find(w => w.id === stockDocDetail.warehouseId);
        const getUnitName = (productId: string) => {
          const p = products.find(x => x.id === productId);
          return (p?.unitId && (dictionaries?.units ?? []).find(u => u.id === p.unitId)?.name) || '件';
        };
        const isReturn = stockDocDetail.type === 'STOCK_RETURN';
        const isEditing = stockDocEditForm !== null;
        const startEdit = () => setStockDocEditForm({
          warehouseId: stockDocDetail.warehouseId,
          lines: stockDocDetail.lines.map(l => ({ productId: l.productId, quantity: l.quantity })),
          reason: stockDocDetail.reason ?? ''
        });
        const cancelEdit = () => setStockDocEditForm(null);
        const saveEdit = () => {
          if (!stockDocEditForm || !onUpdateRecord) return;
          const docRecords = records.filter(r => r.docNo === stockDocDetail.docNo);
          docRecords.forEach(rec => {
            const line = stockDocEditForm.lines.find(l => l.productId === rec.productId);
            if (line) {
              onUpdateRecord({
                ...rec,
                quantity: line.quantity,
                warehouseId: stockDocEditForm.warehouseId || undefined,
                reason: stockDocEditForm.reason.trim() || undefined
              });
            }
          });
          setStockDocDetail(prev => prev ? {
            ...prev,
            warehouseId: stockDocEditForm.warehouseId,
            lines: stockDocEditForm.lines,
            reason: stockDocEditForm.reason.trim() || undefined
          } : null);
          setStockDocEditForm(null);
        };
        const editForm = stockDocEditForm;
        return (
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setStockDocDetail(null); setStockDocEditForm(null); }} aria-hidden />
            <div className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                    {order
                      ? order.orderNumber
                      : sourceProd?.name ??
                        (stockDocDetail.lines[0]
                          ? products.find(p => p.id === stockDocDetail.lines[0].productId)?.name ?? stockDocDetail.docNo
                          : stockDocDetail.docNo)}
                  </span>
                  {isReturn ? '退料单详情' : '领料单详情'}
                </h3>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <button type="button" onClick={cancelEdit} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">取消</button>
                      <button type="button" onClick={saveEdit} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700">
                        <Check className="w-4 h-4" /> 保存
                      </button>
                    </>
                  ) : (
                    <>
                      {onUpdateRecord && hasOpsPerm(tenantRole, userPermissions, 'production:material_records:edit') && (
                        <button
                          type="button"
                          onClick={startEdit}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
                        >
                          <Pencil className="w-4 h-4" /> 编辑
                        </button>
                      )}
                      {onDeleteRecord && hasOpsPerm(tenantRole, userPermissions, 'production:material_records:delete') && (
                        <button
                          type="button"
                          onClick={() => {
                            void confirm({ message: `确定要删除该张${isReturn ? '退料' : '领料'}单的所有记录吗？此操作不可恢复。`, danger: true }).then((ok) => {
                              if (!ok) return;
                              const docRecords = records.filter(r => r.docNo === stockDocDetail.docNo);
                              docRecords.forEach(rec => onDeleteRecord(rec.id));
                              setStockDocDetail(null);
                              setStockDocEditForm(null);
                            });
                          }}
                          className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-bold"
                        >
                          <Trash2 className="w-4 h-4" /> 删除
                        </button>
                      )}
                    </>
                  )}
                  <button type="button" onClick={() => { setStockDocDetail(null); setStockDocEditForm(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-4">
                <h2 className="text-xl font-bold text-slate-900">
                  {sourceProd?.name ?? (order ? (products.find(p => p.id === order.productId)?.name ?? order.productName ?? '—') : '—')}
                </h2>
                {!isEditing ? (
                  <>
                    <div className="flex flex-wrap gap-4">
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">单据号</p>
                        <p className="text-sm font-bold text-slate-800 font-mono">{stockDocDetail.docNo}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">类型</p>
                        <p className="text-sm font-bold text-slate-800">{isReturn ? '退料' : '领料'}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">业务时间</p>
                        <p className="text-sm font-bold text-slate-800">{stockDocDetail.timestamp}</p>
                      </div>
                      {warehouse && (
                        <div className="bg-slate-50 rounded-xl px-4 py-2">
                          <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">{isReturn ? '退回仓库' : '出库仓库'}</p>
                          <p className="text-sm font-bold text-slate-800">{warehouse.name}{warehouse.code ? ` (${warehouse.code})` : ''}</p>
                        </div>
                      )}
                      <div className="bg-slate-50 rounded-xl px-4 py-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">经办</p>
                        <p className="text-sm font-bold text-slate-800">{stockDocDetail.operator}</p>
                      </div>
                      {stockDocDetail.reason && (
                        <div className="bg-slate-50 rounded-xl px-4 py-2">
                          <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">备注</p>
                          <p className="text-sm font-bold text-slate-800">{stockDocDetail.reason}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 overflow-auto -mt-2">
                      <div className="border border-slate-200 rounded-2xl overflow-hidden">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">物料</th>
                              <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                              <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-16">单位</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stockDocDetail.lines.map(({ productId, quantity }) => {
                              const prod = products.find(p => p.id === productId);
                              return (
                                <tr key={productId} className="border-b border-slate-100">
                                  <td className="px-4 py-3 font-medium text-slate-800">{prod?.name ?? productId}</td>
                                  <td className="px-4 py-3 font-bold text-indigo-600 text-right">{quantity}</td>
                                  <td className="px-4 py-3 text-slate-500">{getUnitName(productId)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {editForm && (
                      <>
                        <div className="grid grid-cols-[1fr_1.5fr] gap-3">
                          <div className="bg-slate-50 rounded-xl px-4 py-2">
                            <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">{isReturn ? '退回仓库' : '出库仓库'}</p>
                            <select
                              value={editForm.warehouseId}
                              onChange={e => setStockDocEditForm(prev => prev ? { ...prev, warehouseId: e.target.value } : null)}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                            >
                              {warehouses.map(w => (
                                <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                              ))}
                            </select>
                          </div>
                          <div className="bg-slate-50 rounded-xl px-4 py-2">
                            <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">备注</p>
                            <input
                              type="text"
                              value={editForm.reason}
                              onChange={e => setStockDocEditForm(prev => prev ? { ...prev, reason: e.target.value } : null)}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                              placeholder="选填"
                            />
                          </div>
                        </div>
                        <div className="border border-slate-200 rounded-2xl overflow-hidden">
                          <table className="w-full text-left text-sm">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">物料</th>
                                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-16">单位</th>
                              </tr>
                            </thead>
                            <tbody>
                              {editForm.lines.map(({ productId, quantity }) => {
                                const prod = products.find(p => p.id === productId);
                                return (
                                  <tr key={productId} className="border-b border-slate-100">
                                    <td className="px-4 py-3 font-medium text-slate-800">{prod?.name ?? productId}</td>
                                    <td className="px-4 py-3 text-right">
                                      <input
                                        type="number"
                                        min={0}
                                        value={quantity}
                                        onChange={e => {
                                          const v = Number(e.target.value) || 0;
                                          setStockDocEditForm(prev => prev ? {
                                            ...prev,
                                            lines: prev.lines.map(l => l.productId === productId ? { ...l, quantity: v } : l)
                                          } : null);
                                        }}
                                        className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200"
                                      />
                                    </td>
                                    <td className="px-4 py-3 text-slate-500">{getUnitName(productId)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 领料退料流水弹窗 */}
      {showStockFlowModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowStockFlowModal(false)} aria-hidden />
          <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><ScrollText className="w-5 h-5 text-indigo-600" /> 领料退料流水</h3>
              <button type="button" onClick={() => setShowStockFlowModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <Filter className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">日期起</label>
                  <input
                    type="date"
                    value={stockFlowFilterDateFrom}
                    onChange={e => setStockFlowFilterDateFrom(e.target.value)}
                    className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">日期止</label>
                  <input
                    type="date"
                    value={stockFlowFilterDateTo}
                    onChange={e => setStockFlowFilterDateTo(e.target.value)}
                    className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">类型</label>
                  <select
                    value={stockFlowFilterType}
                    onChange={e => setStockFlowFilterType(e.target.value as 'all' | 'STOCK_OUT' | 'STOCK_RETURN')}
                    className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
                  >
                    <option value="all">全部</option>
                    <option value="STOCK_OUT">领料</option>
                    <option value="STOCK_RETURN">退料</option>
                  </select>
                </div>
                {productionLinkMode !== 'product' ? (
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">工单</label>
                    <input
                      type="text"
                      value={stockFlowFilterOrderKeyword}
                      onChange={e => setStockFlowFilterOrderKeyword(e.target.value)}
                      placeholder="工单号模糊搜索"
                      className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">关联产品</label>
                    <input
                      type="text"
                      value={stockFlowFilterOrderKeyword}
                      onChange={e => setStockFlowFilterOrderKeyword(e.target.value)}
                      placeholder="成品名称模糊搜索"
                      className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </div>
                )}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">物料</label>
                  <input
                    type="text"
                    value={stockFlowFilterProductKeyword}
                    onChange={e => setStockFlowFilterProductKeyword(e.target.value)}
                    placeholder="物料名称模糊搜索"
                    className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">单据号</label>
                  <input
                    type="text"
                    value={stockFlowFilterDocNo}
                    onChange={e => setStockFlowFilterDocNo(e.target.value)}
                    placeholder="LL/TL 模糊搜索"
                    className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
              </div>
              <div className="mt-2 flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => { setStockFlowFilterType('all'); setStockFlowFilterOrderKeyword(''); setStockFlowFilterProductKeyword(''); setStockFlowFilterDocNo(''); setStockFlowFilterDateFrom(''); setStockFlowFilterDateTo(''); }}
                  className="text-xs font-bold text-slate-500 hover:text-slate-700"
                >
                  清空筛选
                </button>
                <span className="text-xs text-slate-400">共 {filteredStockFlowRecords.length} 条</span>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {filteredStockFlowRecords.length === 0 ? (
                <p className="text-slate-500 text-center py-12">暂无领料/退料流水</p>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单据号</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">类型</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">业务时间</th>
                        {productionLinkMode !== 'product' ? (
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工单</th>
                        ) : (
                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">关联产品</th>
                        )}
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">物料</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">外协工厂</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">原因/备注</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">经办</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap w-24">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStockFlowRecords.map(rec => {
                        const order = orders.find(o => o.id === rec.orderId);
                        const matProduct = products.find(p => p.id === rec.productId);
                        const sourceProd = rec.sourceProductId ? products.find(p => p.id === rec.sourceProductId) : null;
                        const isReturn = rec.type === 'STOCK_RETURN';
                        const isOutsourceDispatch = rec.type === 'STOCK_OUT' && !!rec.partner;
                        const isOutsourceReturn = rec.type === 'STOCK_RETURN' && !!rec.partner;
                        const docNo = rec.docNo ?? '';
                        const openDetail = () => {
                          if (!docNo) return;
                          const detail = buildStockDocDetailFromDocNo(docNo);
                          if (detail) setStockDocDetail(detail);
                        };
                        const linkCol =
                          productionLinkMode === 'product'
                            ? sourceProd?.name ?? (rec.orderId ? order?.orderNumber ?? '—' : '—')
                            : rec.orderId
                              ? order?.orderNumber ?? '—'
                              : matProduct?.name ?? '—';
                        const typeLabel = isOutsourceReturn ? '外退' : isReturn ? '退料' : isOutsourceDispatch ? '外发' : '领料';
                        const typeClass = isOutsourceReturn ? 'bg-orange-100 text-orange-800' : isReturn ? 'bg-amber-100 text-amber-800' : isOutsourceDispatch ? 'bg-teal-100 text-teal-800' : 'bg-indigo-100 text-indigo-800';
                        return (
                          <tr key={rec.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="px-4 py-3 text-[10px] font-mono font-bold text-slate-600 whitespace-nowrap">{rec.docNo ?? '—'}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${typeClass}`}>
                                {isOutsourceReturn ? <Undo2 className="w-3 h-3" /> : isReturn ? <Undo2 className="w-3 h-3" /> : isOutsourceDispatch ? <Truck className="w-3 h-3" /> : <ArrowUpFromLine className="w-3 h-3" />}
                                {typeLabel}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{rec.timestamp}</td>
                            <td className="px-4 py-3 text-[10px] font-black text-indigo-600">{linkCol}</td>
                            <td className="px-4 py-3 font-bold text-slate-800">{matProduct?.name ?? '未知物料'}</td>
                            <td className="px-4 py-3 text-right font-black text-indigo-600">{rec.quantity}</td>
                            <td className="px-4 py-3 text-xs font-bold text-teal-700 whitespace-nowrap">{rec.partner ?? '—'}</td>
                            <td className="px-4 py-3 text-xs text-slate-500 max-w-[180px] truncate">{rec.reason ?? '—'}</td>
                            <td className="px-4 py-3 text-right text-xs font-bold text-slate-600">{rec.operator}</td>
                            <td className="px-4 py-3">
                              {docNo && hasOpsPerm(tenantRole, userPermissions, 'production:material_records:view') ? (
                                <button
                                  type="button"
                                  onClick={openDetail}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0"
                                >
                                  <FileText className="w-3.5 h-3.5" /> 详情
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                        <td className="px-4 py-3" colSpan={10}>
                          <span className="text-[10px] text-slate-500 uppercase mr-3">合计</span>
                          <span className="text-xs text-indigo-600">领料 {countIssue} 条，{totalIssueQty}</span>
                          <span className="text-slate-300 mx-2">|</span>
                          <span className="text-xs text-amber-600">退料 {countReturn} 条，{totalReturnQty}</span>
                          <span className="text-slate-300 mx-2">|</span>
                          <span className="text-xs text-slate-700">净领料 {Math.round((totalIssueQty - totalReturnQty) * 100) / 100}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showModal && stockModalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => { setShowModal(false); setStockModalMode(null); }} aria-hidden />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 p-4 space-y-4">
            <h3 className="text-lg font-black text-slate-900">
              {stockModalMode === 'stock_return' ? '生产退料' : '生产领料'}
            </h3>
            {form.orderId && (
              <div className="text-sm">
                <span className="text-slate-500">工单：</span>
                <span className="font-bold text-slate-800">{orders.find(o => o.id === form.orderId)?.orderNumber ?? form.orderId}</span>
              </div>
            )}
            {warehouses.length > 0 && (
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">
                  {stockModalMode === 'stock_return' ? '退回仓库' : '出库仓库'}
                </label>
                <select
                  value={form.warehouseId}
                  onChange={e => setForm(f => ({ ...f, warehouseId: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">物料</label>
              <select
                value={form.productId}
                onChange={e => setForm(f => ({ ...f, productId: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">请选择物料</option>
                {[...products].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id)).map(p => (
                  <option key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">数量</label>
              <input
                type="number"
                min={0}
                step={1}
                value={form.quantity || ''}
                onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) || 0 }))}
                className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">原因/备注</label>
              <input
                type="text"
                value={form.reason || ''}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="选填"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowModal(false); setStockModalMode(null); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!form.productId || (form.quantity ?? 0) <= 0}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(StockMaterialPanel);
