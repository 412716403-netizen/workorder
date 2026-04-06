
import React, { useState, useMemo } from 'react';
import { Package, X, ArrowUpFromLine } from 'lucide-react';
import {
  ProductionOrder,
  Product,
  BOM,
  Warehouse,
  AppDictionaries,
  ProductionOpRecord,
  ProdOpType,
  GlobalNodeTemplate,
} from '../../types';

interface MaterialIssueModalProps {
  orderId: string | null;
  forProduct: { productId: string; orders: ProductionOrder[] } | null;
  orders: ProductionOrder[];
  products: Product[];
  boms: BOM[];
  warehouses: Warehouse[];
  globalNodes: GlobalNodeTemplate[];
  dictionaries: AppDictionaries;
  prodRecords: ProductionOpRecord[];
  productionLinkMode: 'order' | 'product';
  onAddRecord: (record: ProductionOpRecord) => void;
  onAddRecordBatch?: (records: ProductionOpRecord[]) => Promise<void>;
  onClose: () => void;
  userPermissions?: string[];
  tenantRole?: string;
}

type BomMaterial = {
  productId: string;
  name: string;
  sku: string;
  unitNeeded: number;
  nodeNames: string[];
};

const MaterialIssueModal: React.FC<MaterialIssueModalProps> = ({
  orderId,
  forProduct,
  orders,
  products,
  boms,
  warehouses,
  globalNodes,
  prodRecords,
  onAddRecord,
  onClose,
}) => {
  const [materialIssueQty, setMaterialIssueQty] = useState<Record<string, number>>({});
  const [materialIssueWarehouseId, setMaterialIssueWarehouseId] = useState<string>(warehouses[0]?.id ?? '');

  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);

  if (!orderId && !forProduct) return null;

  const handleClose = () => {
    setMaterialIssueQty({});
    onClose();
  };

  const getNextStockDocNo = () => {
    const prefix = 'LL';
    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const pattern = `${prefix}${todayStr}-`;
    const existing = prodRecords.filter(r => r.type === 'STOCK_OUT' && r.docNo && r.docNo.startsWith(pattern));
    const seqs = existing.map(r => parseInt(r.docNo!.slice(pattern.length), 10)).filter(n => !isNaN(n));
    const maxSeq = seqs.length ? Math.max(...seqs) : 0;
    return `${prefix}${todayStr}-${String(maxSeq + 1).padStart(4, '0')}`;
  };

  /* ────── Order-based material issue ────── */
  if (orderId && !forProduct) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return null;
    const product = productMap.get(order.productId);
    const orderQty = order.items.reduce((s, i) => s + i.quantity, 0);
    const bomMaterials: BomMaterial[] = [];
    const matMap = new Map<string, { name: string; sku: string; unitNeeded: number; nodeNames: Set<string> }>();
    const addBomItems = (bom: BOM, qty: number, nodeName: string) => {
      bom.items.forEach(bi => {
        const mp = products.find(px => px.id === bi.productId);
        const add = Number(bi.quantity) * qty;
        const existing = matMap.get(bi.productId);
        if (existing) {
          existing.unitNeeded += add;
          if (nodeName) existing.nodeNames.add(nodeName);
        } else {
          const ns = new Set<string>();
          if (nodeName) ns.add(nodeName);
          matMap.set(bi.productId, { name: mp?.name ?? '未知物料', sku: mp?.sku ?? '', unitNeeded: add, nodeNames: ns });
        }
      });
    };
    const variants = product?.variants ?? [];
    if (variants.length > 0) {
      order.items.forEach(item => {
        const v = variants.find(vx => vx.id === item.variantId) ?? variants[0];
        const lineQty = item.quantity;
        const seenBomIds = new Set<string>();
        if (v?.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
          Object.entries(v.nodeBoms).forEach(([nodeId, bomId]) => {
            if (seenBomIds.has(bomId)) return;
            seenBomIds.add(bomId);
            const nodeName = globalNodes.find(n => n.id === nodeId)?.name ?? '';
            const bom = boms.find(b => b.id === bomId);
            if (bom) addBomItems(bom, lineQty, nodeName);
          });
        } else {
          boms.filter(b => b.parentProductId === product!.id && b.variantId === v.id && b.nodeId).forEach(bom => {
            if (seenBomIds.has(bom.id)) return;
            seenBomIds.add(bom.id);
            const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
            addBomItems(bom, lineQty, nodeName);
          });
        }
      });
    }
    if (matMap.size === 0 && product) {
      const seenBomIds = new Set<string>();
      boms.filter(b => b.parentProductId === product.id && b.nodeId).forEach(bom => {
        if (seenBomIds.has(bom.id)) return;
        seenBomIds.add(bom.id);
        const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
        const qty = bom.variantId
          ? (order.items.find(i => i.variantId === bom.variantId)?.quantity ?? 0)
          : orderQty;
        addBomItems(bom, qty, nodeName);
      });
    }
    matMap.forEach((v, productId) => {
      bomMaterials.push({ productId, ...v, nodeNames: Array.from(v.nodeNames) });
    });
    const issuedMap = new Map<string, number>();
    prodRecords.filter(r => r.type === 'STOCK_OUT' && r.orderId === order.id && r.reason !== '来自于返工').forEach(r => {
      issuedMap.set(r.productId, (issuedMap.get(r.productId) ?? 0) + r.quantity);
    });
    const handleIssueMaterials = () => {
      const toIssue = bomMaterials.filter(m => (materialIssueQty[m.productId] ?? 0) > 0);
      if (toIssue.length === 0) return;
      const docNo = getNextStockDocNo();
      toIssue.forEach(m => {
        const rec: ProductionOpRecord = {
          id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'STOCK_OUT' as ProdOpType,
          orderId: order.id,
          productId: m.productId,
          quantity: materialIssueQty[m.productId],
          operator: '张主管',
          timestamp: new Date().toLocaleString(),
          status: '已完成',
          warehouseId: materialIssueWarehouseId || undefined,
          docNo
        };
        onAddRecord(rec);
      });
      handleClose();
    };
    return (
      <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={handleClose} aria-hidden />
        <div className="relative bg-white w-full max-w-2xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-600" /> 物料发出
              </h3>
              <p className="text-sm text-slate-500 mt-0.5">{order.orderNumber} — {product?.name ?? order.productName}</p>
            </div>
            <button type="button" onClick={handleClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {warehouses.length > 0 && (
              <div className="mb-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">出库仓库</label>
                <select
                  value={materialIssueWarehouseId}
                  onChange={e => setMaterialIssueWarehouseId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}{w.code ? ` (${w.code})` : ''}</option>
                  ))}
                </select>
              </div>
            )}
            {bomMaterials.length === 0 ? (
              <p className="py-8 text-center text-slate-400 text-sm">该工单未配置 BOM 物料，无法进行物料发出</p>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">物料</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">理论需量</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-36">领料进度</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-40">本次领料数量</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {bomMaterials.map(m => {
                    const issued = issuedMap.get(m.productId) ?? 0;
                    return (
                    <tr key={m.productId} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-slate-800">{m.name}</p>
                          {m.nodeNames.map(nn => (
                            <span key={nn} className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{nn}</span>
                          ))}
                        </div>
                        {m.sku && <p className="text-[10px] text-slate-400 mt-0.5">{m.sku}</p>}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-slate-600">{m.unitNeeded}</td>
                      <td className="px-4 py-3">
                        {(() => {
                          const needed = m.unitNeeded;
                          const pct = needed > 0 ? Math.min(100, (issued / needed) * 100) : 0;
                          const overIssue = issued > needed;
                          return (
                            <div className="flex flex-col gap-1">
                              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                                {overIssue ? (
                                  <>
                                    <div className="h-full bg-emerald-500" style={{ width: `${(needed / issued) * 100}%` }} />
                                    <div className="h-full bg-rose-500" style={{ width: `${((issued - needed) / issued) * 100}%` }} />
                                  </>
                                ) : (
                                  <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
                                )}
                              </div>
                              <span className="text-[9px] font-bold text-slate-500">
                                {overIssue ? <span>已发 {issued} <span className="text-rose-500">（超发 {issued - needed}）</span></span> : `已发 ${issued}`}
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={materialIssueQty[m.productId] ?? ''}
                          onChange={e => setMaterialIssueQty(prev => ({ ...prev, [m.productId]: Number(e.target.value) || 0 }))}
                          className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-right focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="0"
                        />
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {bomMaterials.length > 0 && (
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleIssueMaterials}
                disabled={!bomMaterials.some(m => (materialIssueQty[m.productId] ?? 0) > 0)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                <ArrowUpFromLine className="w-4 h-4" /> 确认领料发出
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ────── Product-based material issue (关联产品) ────── */
  if (forProduct) {
    const { productId: sourceProductId, orders: groupOrders } = forProduct;
    const finishedProduct = productMap.get(sourceProductId);
    const matMap = new Map<string, { name: string; sku: string; unitNeeded: number; nodeNames: Set<string> }>();
    const mergeLocal = (local: Map<string, { name: string; sku: string; unitNeeded: number; nodeNames: Set<string> }>) => {
      local.forEach((v, pid) => {
        const existing = matMap.get(pid);
        if (existing) {
          existing.unitNeeded += v.unitNeeded;
          v.nodeNames.forEach(n => existing.nodeNames.add(n));
        } else {
          matMap.set(pid, {
            name: v.name,
            sku: v.sku,
            unitNeeded: v.unitNeeded,
            nodeNames: new Set(v.nodeNames)
          });
        }
      });
    };
    const addOrderBom = (order: ProductionOrder) => {
      const orderQty = order.items.reduce((s, i) => s + i.quantity, 0);
      if (orderQty <= 0) return;
      const product = productMap.get(order.productId) ?? finishedProduct;
      const local = new Map<string, { name: string; sku: string; unitNeeded: number; nodeNames: Set<string> }>();
      const variants = product?.variants ?? [];
      const addLocal = (bom: BOM, qty: number, nodeName: string) => {
        bom.items.forEach(bi => {
          const mp = products.find(px => px.id === bi.productId);
          const add = Number(bi.quantity) * qty;
          const existing = local.get(bi.productId);
          if (existing) {
            existing.unitNeeded += add;
            if (nodeName) existing.nodeNames.add(nodeName);
          } else {
            const ns = new Set<string>();
            if (nodeName) ns.add(nodeName);
            local.set(bi.productId, { name: mp?.name ?? '未知物料', sku: mp?.sku ?? '', unitNeeded: add, nodeNames: ns });
          }
        });
      };
      if (variants.length > 0) {
        order.items.forEach(item => {
          const v = variants.find(vx => vx.id === item.variantId) ?? variants[0];
          const lineQty = item.quantity;
          const seenBomIds = new Set<string>();
          if (v?.nodeBoms && Object.keys(v.nodeBoms).length > 0) {
            Object.entries(v.nodeBoms).forEach(([nodeId, bomId]) => {
              if (seenBomIds.has(bomId)) return;
              seenBomIds.add(bomId);
              const nodeName = globalNodes.find(n => n.id === nodeId)?.name ?? '';
              const bom = boms.find(b => b.id === bomId);
              if (bom) addLocal(bom, lineQty, nodeName);
            });
          } else {
            boms.filter(b => b.parentProductId === (product ?? finishedProduct)!.id && b.variantId === v.id && b.nodeId).forEach(bom => {
              if (seenBomIds.has(bom.id)) return;
              seenBomIds.add(bom.id);
              const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
              addLocal(bom, lineQty, nodeName);
            });
          }
        });
      }
      if (local.size === 0 && product) {
        const seenBomIds = new Set<string>();
        boms.filter(b => b.parentProductId === product.id && b.nodeId).forEach(bom => {
          if (seenBomIds.has(bom.id)) return;
          seenBomIds.add(bom.id);
          const nodeName = globalNodes.find(n => n.id === bom.nodeId)?.name ?? '';
          const qty = bom.variantId
            ? (order.items.find(i => i.variantId === bom.variantId)?.quantity ?? 0)
            : orderQty;
          addLocal(bom, qty, nodeName);
        });
      }
      mergeLocal(local);
    };
    groupOrders.forEach(addOrderBom);
    const bomMaterials: BomMaterial[] = [];
    matMap.forEach((v, pid) => {
      bomMaterials.push({ productId: pid, ...v, nodeNames: Array.from(v.nodeNames) });
    });
    const familyIds = new Set(groupOrders.map(o => o.id));
    const issuedMap = new Map<string, number>();
    prodRecords
      .filter(r => r.type === 'STOCK_OUT' && r.reason !== '来自于返工')
      .forEach(r => {
        const hit =
          r.sourceProductId === sourceProductId ||
          (!r.sourceProductId && r.orderId && familyIds.has(r.orderId));
        if (hit) issuedMap.set(r.productId, (issuedMap.get(r.productId) ?? 0) + r.quantity);
      });
    const handleIssueMaterials = () => {
      const toIssue = bomMaterials.filter(m => (materialIssueQty[m.productId] ?? 0) > 0);
      if (toIssue.length === 0) return;
      const docNo = getNextStockDocNo();
      toIssue.forEach((m, i) => {
        onAddRecord({
          id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'STOCK_OUT' as ProdOpType,
          productId: m.productId,
          quantity: materialIssueQty[m.productId],
          operator: '张主管',
          timestamp: new Date().toLocaleString(),
          status: '已完成',
          warehouseId: materialIssueWarehouseId || undefined,
          docNo,
          sourceProductId
        });
      });
      handleClose();
    };
    const orderLabels = groupOrders.map(o => o.orderNumber).filter(Boolean).join('、');
    return (
      <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
          onClick={handleClose}
          aria-hidden
        />
        <div className="relative bg-white w-full max-w-2xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-600" /> 物料发出（关联产品）
              </h3>
              <p className="text-sm text-slate-500 mt-0.5">
                {finishedProduct?.name ?? '—'} · 共 {groupOrders.length} 条工单{orderLabels ? `（${orderLabels}）` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {warehouses.length > 0 && (
              <div className="mb-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">出库仓库</label>
                <select
                  value={materialIssueWarehouseId}
                  onChange={e => setMaterialIssueWarehouseId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 py-2.5 px-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                      {w.code ? ` (${w.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {bomMaterials.length === 0 ? (
              <p className="py-8 text-center text-slate-400 text-sm">该产品未配置 BOM 物料，无法进行物料发出</p>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">物料</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">累计理论需量</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-36">领料进度</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-40">本次领料</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {bomMaterials.map(m => {
                    const issued = issuedMap.get(m.productId) ?? 0;
                    return (
                      <tr key={m.productId} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold text-slate-800">{m.name}</p>
                            {m.nodeNames.map(nn => (
                              <span key={nn} className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                                {nn}
                              </span>
                            ))}
                          </div>
                          {m.sku && <p className="text-[10px] text-slate-400 mt-0.5">{m.sku}</p>}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-slate-600">{m.unitNeeded}</td>
                        <td className="px-4 py-3">
                          {(() => {
                            const needed = m.unitNeeded;
                            const pct = needed > 0 ? Math.min(100, (issued / needed) * 100) : 0;
                            const overIssue = issued > needed;
                            return (
                              <div className="flex flex-col gap-1">
                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                                  {overIssue ? (
                                    <>
                                      <div className="h-full bg-emerald-500" style={{ width: `${(needed / issued) * 100}%` }} />
                                      <div
                                        className="h-full bg-rose-500"
                                        style={{ width: `${((issued - needed) / issued) * 100}%` }}
                                      />
                                    </>
                                  ) : (
                                    <div
                                      className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  )}
                                </div>
                                <span className="text-[9px] font-bold text-slate-500">
                                  {overIssue ? (
                                    <span>
                                      已发 {issued} <span className="text-rose-500">（超发 {issued - needed}）</span>
                                    </span>
                                  ) : (
                                    `已发 ${issued}`
                                  )}
                                </span>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={materialIssueQty[m.productId] ?? ''}
                            onChange={e =>
                              setMaterialIssueQty(prev => ({ ...prev, [m.productId]: Number(e.target.value) || 0 }))
                            }
                            className="w-full rounded-xl border border-slate-200 py-2 px-3 text-sm font-bold text-slate-800 text-right focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="0"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {bomMaterials.length > 0 && (
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleIssueMaterials}
                disabled={!bomMaterials.some(m => (materialIssueQty[m.productId] ?? 0) > 0)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                <ArrowUpFromLine className="w-4 h-4" /> 确认领料发出
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
};

export default React.memo(MaterialIssueModal);
