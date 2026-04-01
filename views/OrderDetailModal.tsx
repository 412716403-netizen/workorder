import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { X, Layers, Trash2, Pencil, Check, ClipboardList, Truck, FileText } from 'lucide-react';
import { ProductionOrder, Product, OrderFormSettings, ProductionOpRecord, OrderItem, ProductCategory, AppDictionaries, ProductMilestoneProgress, GlobalNodeTemplate } from '../types';
import { useConfirm } from '../contexts/ConfirmContext';

interface OrderDetailModalProps {
  orderId: string | null;
  onClose: () => void;
  orders: ProductionOrder[];
  products: Product[];
  prodRecords: ProductionOpRecord[];
  dictionaries?: AppDictionaries;
  categories?: ProductCategory[];
  orderFormSettings?: OrderFormSettings;
  /** 关联产品模式下隐藏客户、交期 */
  productionLinkMode?: 'order' | 'product';
  /** 关联产品模式下展示产品工序进度 */
  productMilestoneProgresses?: ProductMilestoneProgress[];
  globalNodes?: GlobalNodeTemplate[];
  onUpdateOrder?: (orderId: string, updates: Partial<ProductionOrder>) => void;
  onDeleteOrder?: (orderId: string) => void;
}

const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  orderId, onClose, orders, products, prodRecords, dictionaries, categories, orderFormSettings, productionLinkMode, productMilestoneProgresses = [], globalNodes = [], onUpdateOrder, onDeleteOrder
}) => {
  const confirm = useConfirm();
  const showInDetail = (id: string) => orderFormSettings?.standardFields.find(f => f.id === id)?.showInDetail ?? true;
  const order = orders.find(o => o.id === orderId);
  const product = products.find(p => p.id === order?.productId);
  const category = categories?.find(c => c.id === product?.categoryId);
  const hasColorSize = Boolean(product?.colorIds?.length && product?.sizeIds?.length) || Boolean(category?.hasColorSize);
  const unitName = (product?.unitId && dictionaries?.units?.find(u => u.id === product.unitId)?.name) || '件';

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<{
    customer: string;
    dueDate: string;
    startDate: string;
    items: OrderItem[];
  }>({ customer: '', dueDate: '', startDate: '', items: [] });

  const orderTotalQty = useMemo(() => order?.items.reduce((s, i) => s + i.quantity, 0) || 0, [order]);

  /** 该工单的外协统计：按外协工厂+工序汇总 发出/收回/未收（用于详情页外协管理小便签） */
  const outsourceStatsForOrder = useMemo(() => {
    if (!order) return [];
    const outsourceRecs = prodRecords.filter(r => r.type === 'OUTSOURCE' && r.orderId === order.id && r.partner);
    const byKey: Record<string, { partner: string; nodeId: string; dispatched: number; received: number }> = {};
    outsourceRecs.forEach(r => {
      const nodeId = r.nodeId ?? '';
      const key = `${r.partner}|${nodeId}`;
      if (!byKey[key]) byKey[key] = { partner: r.partner, nodeId, dispatched: 0, received: 0 };
      if (r.status === '加工中') byKey[key].dispatched += r.quantity;
      else if (r.status === '已收回') byKey[key].received += r.quantity;
    });
    const milestoneIndex = (nodeId: string) => {
      const idx = order.milestones?.findIndex(m => m.templateId === nodeId) ?? -1;
      return idx >= 0 ? idx : 9999;
    };
    return Object.values(byKey)
      .map(v => ({
        ...v,
        nodeName: order.milestones?.find(m => m.templateId === v.nodeId)?.name ?? (v.nodeId || '—'),
        pending: Math.max(0, v.dispatched - v.received)
      }))
      .filter(v => v.dispatched > 0 || v.received > 0)
      .sort((a, b) => milestoneIndex(a.nodeId) - milestoneIndex(b.nodeId));
  }, [order?.id, order?.milestones, prodRecords]);

  React.useEffect(() => {
    if (order && product) {
      let items: OrderItem[] = order.items.map(i => ({ ...i }));
      if (hasColorSize && product.variants?.length) {
        const byVariant = new Map(order.items.map(i => [i.variantId, i.quantity]));
        items = product.variants.map(v => ({
          variantId: v.id,
          quantity: byVariant.get(v.id) ?? 0,
          completedQuantity: order.items.find(i => i.variantId === v.id)?.completedQuantity ?? 0
        }));
      } else if (!hasColorSize && items.length === 0) {
        const total = order.items.reduce((s, i) => s + i.quantity, 0);
        const completed = order.milestones?.[0]?.completedQuantity ?? 0;
        items = [{ variantId: undefined, quantity: total, completedQuantity: completed }];
      } else if (!hasColorSize && items.length > 1) {
        const total = items.reduce((s, i) => s + i.quantity, 0);
        const completed = items.reduce((s, i) => s + (i.completedQuantity ?? 0), 0);
        items = [{ variantId: undefined, quantity: total, completedQuantity: completed }];
      }
      setEditForm({
        customer: order.customer || '',
        dueDate: order.dueDate || '',
        startDate: order.startDate || '',
        items
      });
      setIsEditing(false);
    }
  }, [order?.id, product?.id, hasColorSize]);

  /** 关联产品模式：该产品下所有工单及工序进度汇总 */
  const productOrders = useMemo(() => order ? orders.filter(o => o.productId === order.productId) : [], [orders, order?.productId]);
  const productTotalQty = useMemo(() => productOrders.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0), [productOrders]);
  const progressByMilestone = useMemo(() => {
    if (!order) return [];
    const byTpl = new Map<string, { name: string; completed: number }>();
    productMilestoneProgresses
      .filter(p => p.productId === order.productId)
      .forEach(pmp => {
        const name = globalNodes.find(n => n.id === pmp.milestoneTemplateId)?.name ?? pmp.milestoneTemplateId;
        const cur = byTpl.get(pmp.milestoneTemplateId);
        byTpl.set(pmp.milestoneTemplateId, {
          name: cur?.name || name,
          completed: (cur?.completed ?? 0) + (pmp.completedQuantity ?? 0)
        });
      });
    return Array.from(byTpl.entries()).sort(([a], [b]) => {
      const nodeIds = product?.milestoneNodeIds ?? [];
      const ia = nodeIds.indexOf(a);
      const ib = nodeIds.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [order?.productId, productMilestoneProgresses, globalNodes, product?.milestoneNodeIds]);

  if (!orderId || !order) return null;

  const handleSave = () => {
    if (!onUpdateOrder) return;
    const sanitizedItems = editForm.items.map(item => ({
      ...item,
      completedQuantity: Math.min(item.completedQuantity, item.quantity)
    }));
    onUpdateOrder(order.id, {
      customer: editForm.customer,
      dueDate: editForm.dueDate,
      startDate: editForm.startDate,
      items: sanitizedItems
    });
    setIsEditing(false);
  };

  const handleItemQuantityChange = (idx: number, quantity: number) => {
    setEditForm(prev => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === idx ? { ...item, quantity: Math.max(0, quantity) } : item
      )
    }));
  };

  const handleItemQuantityChangeByVariant = (variantId: string, quantity: number) => {
    setEditForm(prev => ({
      ...prev,
      items: prev.items.map(item =>
        item.variantId === variantId ? { ...item, quantity: Math.max(0, quantity) } : item
      )
    }));
  };

  const handleSingleQuantityChange = (quantity: number) => {
    setEditForm(prev => {
      const q = Math.max(0, quantity);
      const first = prev.items[0];
      return {
        ...prev,
        items: [{ variantId: undefined, quantity: q, completedQuantity: first?.completedQuantity ?? 0 }]
      };
    });
  };

  const getQuantityByVariant = (variantId: string) => {
    const item = (isEditing ? editForm.items : order?.items ?? []).find(i => i.variantId === variantId);
    return item?.quantity ?? 0;
  };

  const handleDelete = async () => {
    if (!onDeleteOrder) return;
    if (productionLinkMode !== 'product') {
      const hasReport = order.milestones.some(m => m.completedQuantity > 0 || (m.reports?.length ?? 0) > 0);
      if (hasReport) {
        toast.error('该工单已有报工记录，不允许删除。');
        return;
      }
      const relatedRecords = prodRecords.filter(r => r.orderId === order.id);
      if (relatedRecords.length > 0) {
        toast.error(`该工单存在 ${relatedRecords.length} 条关联单据（领料出库/外协/返工/报损/生产入库），请先在相关模块删除后再试。`);
        return;
      }
      const childOrders = orders.filter(o => o.parentOrderId === order.id);
      if (childOrders.length > 0) {
        toast.error(`该工单存在 ${childOrders.length} 条子工单，请先删除子工单后再试。`);
        return;
      }
    }
    const ok = await confirm({ message: `确定要删除工单「${order.orderNumber}」吗？此操作不可恢复。`, danger: true });
    if (!ok) return;
    onDeleteOrder(order.id);
    onClose();
  };

  const displayTotalQty = isEditing
    ? editForm.items.reduce((s, i) => s + i.quantity, 0)
    : orderTotalQty;

  if (productionLinkMode === 'product') {
    return (
      <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />
        <div className="relative bg-white w-full max-w-2xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{product?.name ?? order.productName}</span>
              产品生产详情
            </h3>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-6 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-4">{product?.name ?? order.productName}{order.sku ? ` · ${order.sku}` : ''}</h2>
              <div className="flex flex-wrap gap-4">
                <div className="bg-slate-50 rounded-xl px-4 py-2">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">总计划量</p>
                  <p className="text-sm font-bold text-indigo-600">{productTotalQty} {unitName}</p>
                </div>
                <div className="bg-slate-50 rounded-xl px-4 py-2">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">工单数</p>
                  <p className="text-sm font-bold text-slate-800">{productOrders.length}</p>
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-3">
                <ClipboardList className="w-3.5 h-3.5" /> 关联工单
              </h4>
              <ul className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
                {productOrders.map(o => (
                  <li key={o.id} className="px-4 py-3 flex items-center justify-between bg-white hover:bg-slate-50/50">
                    <span className="font-bold text-slate-800">{o.orderNumber}</span>
                    <span className="text-sm text-slate-600">{o.items.reduce((s, i) => s + i.quantity, 0)} {unitName}</span>
                  </li>
                ))}
              </ul>
            </div>
            {progressByMilestone.length > 0 && (
              <div>
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-3">
                  <Layers className="w-3.5 h-3.5" /> 工序进度
                </h4>
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">工序</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">已完成</th>
                      </tr>
                    </thead>
                    <tbody>
                      {progressByMilestone.map(([tid, m]) => (
                        <tr key={tid} className="border-b border-slate-100 last:border-0">
                          <td className="px-4 py-3 text-sm font-bold text-slate-700">{m.name}</td>
                          <td className="px-4 py-3 text-sm font-bold text-emerald-600 text-right">{m.completed} {unitName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-white w-full max-w-2xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{order.orderNumber}</span>
            工单详情
          </h3>
          <div className="flex items-center gap-2">
            {onUpdateOrder && (
              isEditing ? (
                <>
                  <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">取消</button>
                  <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700">
                    <Check className="w-4 h-4" /> 保存
                  </button>
                </>
              ) : (
                <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">
                  <Pencil className="w-4 h-4" /> 编辑
                </button>
              )
            )}
            {onDeleteOrder && !isEditing && (
              <button onClick={handleDelete} className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-bold">
                <Trash2 className="w-4 h-4" /> 删除
              </button>
            )}
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-4">{order.productName}{order.sku ? ` · ${order.sku}` : ''}</h2>
            <div className="flex flex-wrap gap-4">
              <div className="bg-slate-50 rounded-xl px-4 py-2">
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">工单总量</p>
                {isEditing && !hasColorSize ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      value={displayTotalQty}
                      onChange={e => handleSingleQuantityChange(parseInt(e.target.value) || 0)}
                      className="w-24 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                    <span className="text-sm font-bold text-slate-600">{unitName}</span>
                  </div>
                ) : (
                  <p className="text-sm font-bold text-indigo-600">{displayTotalQty} {unitName}</p>
                )}
              </div>
              {showInDetail('customer') && productionLinkMode !== 'product' && (
                <div className="bg-slate-50 rounded-xl px-4 py-2 min-w-[140px]">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">客户</p>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editForm.customer}
                      onChange={e => setEditForm(f => ({ ...f, customer: e.target.value }))}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold outline-none"
                    />
                  ) : (
                    <p className="text-sm font-bold text-slate-800">{order.customer || '—'}</p>
                  )}
                </div>
              )}
              {showInDetail('dueDate') && productionLinkMode !== 'product' && (
                <div className="bg-slate-50 rounded-xl px-4 py-2">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">交期</p>
                  {isEditing ? (
                    <input
                      type="date"
                      value={editForm.dueDate}
                      onChange={e => setEditForm(f => ({ ...f, dueDate: e.target.value }))}
                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold outline-none"
                    />
                  ) : (
                    <p className="text-sm font-bold text-slate-800">{order.dueDate || '—'}</p>
                  )}
                </div>
              )}
              {showInDetail('startDate') && (
                <div className="bg-slate-50 rounded-xl px-4 py-2">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">开始日期</p>
                  {isEditing ? (
                    <input
                      type="date"
                      value={editForm.startDate}
                      onChange={e => setEditForm(f => ({ ...f, startDate: e.target.value }))}
                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold outline-none"
                    />
                  ) : (
                    <p className="text-sm font-bold text-slate-800">{order.startDate || '—'}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 工单明细（仅在有颜色尺码时显示） */}
          {hasColorSize && (
          <div>
            <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-3">
              <Layers className="w-3.5 h-3.5" /> 工单明细
            </h4>
            {product && dictionaries && product.variants?.length && product.colorIds?.length && product.sizeIds?.length ? (
              <div className="space-y-3 bg-slate-50/50 rounded-2xl p-3">
                {product.colorIds.map(colorId => {
                  const color = dictionaries.colors.find(c => c.id === colorId);
                  if (!color) return null;
                  return (
                    <div key={colorId} className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="w-4 h-4 rounded-full border border-slate-200" style={{ backgroundColor: color.value }} />
                        <span className="text-sm font-bold text-slate-800">{color.name}</span>
                      </div>
                      <div className="flex items-center gap-3 flex-1">
                        {product.sizeIds.map(sizeId => {
                          const size = dictionaries.sizes.find(s => s.id === sizeId);
                          const variant = product.variants.find(v => v.colorId === colorId && v.sizeId === sizeId);
                          if (!size || !variant) return null;
                          const qty = getQuantityByVariant(variant.id);
                          return (
                            <div key={sizeId} className="flex flex-col gap-1 min-w-[64px]">
                              <span className="text-[10px] font-bold text-slate-400">{size.name}</span>
                              {isEditing ? (
                                <input
                                  type="number"
                                  min={0}
                                  value={qty}
                                  onChange={e => handleItemQuantityChangeByVariant(variant.id, parseInt(e.target.value) || 0)}
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-indigo-600 text-right outline-none focus:ring-2 focus:ring-indigo-200"
                                />
                              ) : (
                                <span className="text-sm font-bold text-indigo-600">{qty}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
          )}

          {/* 各工序报工汇总（仅关联工单模式下显示） */}
          {productionLinkMode !== 'product' && order.milestones.some(m => (m.reports?.length ?? 0) > 0) && (
            <div>
              <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-3">
                <ClipboardList className="w-3.5 h-3.5" /> 各工序报工汇总
              </h4>
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">工序</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">良品</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">不良品</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">报损</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.milestones.map(m => {
                      const goodQty = (m.reports || []).reduce((s, r) => s + r.quantity, 0);
                      const defQty = (m.reports || []).reduce((s, r) => s + (r.defectiveQuantity ?? 0), 0);
                      const scrapQty = prodRecords
                        .filter(r => r.type === 'SCRAP' && r.orderId === order.id && r.nodeId === m.templateId)
                        .reduce((s, r) => s + r.quantity, 0);
                      if (goodQty === 0 && defQty === 0 && scrapQty === 0) return null;
                      return (
                        <tr key={m.id} className="border-b border-slate-100 last:border-0">
                          <td className="px-4 py-3 text-sm font-bold text-slate-700">{m.name}</td>
                          <td className="px-4 py-3 text-sm font-bold text-emerald-600 text-right">{goodQty} {unitName}</td>
                          <td className="px-4 py-3 text-sm font-bold text-amber-600 text-right">{defQty > 0 ? `${defQty} ${unitName}` : '—'}</td>
                          <td className="px-4 py-3 text-sm font-bold text-rose-600 text-right">{scrapQty > 0 ? `${scrapQty} ${unitName}` : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 外协管理：该工单对应的小便签（仅当有外协数据时显示） */}
          {outsourceStatsForOrder.length > 0 && (
            <div>
              <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-3">
                <Truck className="w-3.5 h-3.5" /> 外协管理
              </h4>
              <div className="flex flex-wrap gap-4">
                {outsourceStatsForOrder.map((row, idx) => (
                  <div
                    key={`${row.partner}|${row.nodeId}|${idx}`}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 min-w-[140px] flex flex-col items-center gap-2"
                  >
                    <div className="w-full text-center">
                      <p className="text-[11px] font-bold text-emerald-600">{row.nodeName}</p>
                      <p className="text-sm font-bold text-slate-900 truncate" title={row.partner}>{row.partner}</p>
                    </div>
                    <div className="w-16 h-16 rounded-full border-2 border-violet-200 bg-violet-50/50 flex items-center justify-center shrink-0">
                      <span className="text-xl font-black text-slate-900">{row.dispatched}</span>
                    </div>
                    <div className="flex items-center justify-center gap-1.5 w-full">
                      <span className="text-xs font-bold text-slate-600">{row.dispatched}/{row.received}</span>
                      <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderDetailModal;
