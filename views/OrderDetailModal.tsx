import React, { useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { X, Layers, Trash2, Pencil, Check, ClipboardList, Truck, FileText } from 'lucide-react';
import {
  ProductionOrder,
  Product,
  OrderFormSettings,
  ProductionOpRecord,
  OrderItem,
  ProductCategory,
  AppDictionaries,
  ProductMilestoneProgress,
  GlobalNodeTemplate,
  ProductVariant,
  PrintTemplate,
  PrintRenderContext,
} from '../types';
import { useConfirm } from '../contexts/ConfirmContext';
import { productHasColorSizeMatrix } from '../utils/productColorSize';
import { combinedCompletedAtTemplate } from '../utils/productReportAggregates';
import { buildVariantQtyMatrixLayout } from '../utils/variantQtyMatrix';
import QtyMatrixTable, { type QtyMatrixTableRow } from '../components/variant-matrix/QtyMatrixTable';
import { getEffectiveReportTemplate, getReportCustomDataDisplayEntries } from '../utils/effectiveReportTemplate';
import { buildPrintListRowsFromOrderItemsMatrix } from '../utils/printListPagination';
import { OrderCenterDetailPrintBlock } from '../components/order-print/OrderCenterDetailPrintBlock';
import {
  formatLocalDateTimeZh,
  localCalendarYmdStartToIso,
  parseProductionOpTimestampMs,
  toLocalDateYmd,
  YMD_ONLY,
} from '../utils/localDateTime';

function fmtReportDetailTs(ts: string | Date | undefined | null): string {
  if (ts == null || ts === '') return '—';
  if (ts instanceof Date) {
    const ms = ts.getTime();
    return Number.isNaN(ms) ? '—' : formatLocalDateTimeZh(ts);
  }
  const ms = parseProductionOpTimestampMs(ts);
  if (ms > 0) return formatLocalDateTimeZh(new Date(ms));
  return String(ts);
}

interface OrderDetailModalProps {
  orderId: string | null;
  onClose: () => void;
  orders: ProductionOrder[];
  products: Product[];
  prodRecords: ProductionOpRecord[];
  dictionaries?: AppDictionaries;
  categories?: ProductCategory[];
  orderFormSettings?: OrderFormSettings;
  printTemplates?: PrintTemplate[];
  /** 关联产品模式下隐藏客户、交期 */
  productionLinkMode?: 'order' | 'product';
  /** 关联产品模式下展示产品工序进度 */
  productMilestoneProgresses?: ProductMilestoneProgress[];
  globalNodes?: GlobalNodeTemplate[];
  /** 关联产品模式下：为 true 时按「单张工单」展示详情（如工单流水入口），与关联工单详情一致；为 false 时保留产品汇总卡片 */
  productModeSingleOrderLayout?: boolean;
  /** 详情打印：打开工单表单配置「打印模版」页签 */
  onOpenOrderFormPrintTab?: () => void;
  onUpdateOrder?: (orderId: string, updates: Partial<ProductionOrder>) => void;
  onDeleteOrder?: (orderId: string) => void;
}

const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  orderId, onClose, orders, products, prodRecords, dictionaries, categories, orderFormSettings, printTemplates = [], productionLinkMode, productMilestoneProgresses = [], globalNodes = [], productModeSingleOrderLayout = false, onOpenOrderFormPrintTab, onUpdateOrder, onDeleteOrder
}) => {
  const confirm = useConfirm();
  const showInDetail = (id: string) => orderFormSettings?.standardFields.find(f => f.id === id)?.showInDetail ?? true;
  const order = orders.find(o => o.id === orderId);
  const product = products.find(p => p.id === order?.productId);
  const category = categories?.find(c => c.id === product?.categoryId);
  const hasColorSize = productHasColorSizeMatrix(product, category);
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
        dueDate: toLocalDateYmd(order.dueDate) || (order.dueDate || '').trim(),
        startDate: toLocalDateYmd(order.startDate) || (order.startDate || '').trim(),
        items
      });
      setIsEditing(false);
    }
  }, [order?.id, order?.dueDate, order?.startDate, product?.id, hasColorSize]);

  /** 关联产品模式：该产品下所有工单及工序进度汇总 */
  const productOrders = useMemo(() => order ? orders.filter(o => o.productId === order.productId) : [], [orders, order?.productId]);
  const productTotalQty = useMemo(() => productOrders.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0), [productOrders]);
  /**
   * 产品维度工序进度：合并 PMP（产品池报工）+ 各工单里程碑（关联工单报工 / 外协收回带 orderId 写入）。
   * 与 ReportModal/工单中心的 `combinedCompletedAtTemplate` 口径保持一致，避免详情页与报工弹窗显示
   * "数字突变"。模板范围：当前产品已存在 PMP 进度的工序 ∪ 该产品工序模板列表（取并集兜底新工序）。
   */
  const progressByMilestone = useMemo(() => {
    if (!order) return [];
    const productOrdersForMilestones = productOrders;
    const tplIds = new Set<string>();
    productMilestoneProgresses
      .filter(p => p.productId === order.productId)
      .forEach(p => tplIds.add(p.milestoneTemplateId));
    productOrdersForMilestones.forEach(o => {
      o.milestones.forEach(m => {
        if ((m.completedQuantity ?? 0) > 0 || (m.reports?.length ?? 0) > 0) tplIds.add(m.templateId);
      });
    });
    const tplNameById = new Map<string, string>();
    productMilestoneProgresses
      .filter(p => p.productId === order.productId)
      .forEach(p => tplNameById.set(p.milestoneTemplateId, globalNodes.find(n => n.id === p.milestoneTemplateId)?.name ?? p.milestoneTemplateId));
    productOrdersForMilestones.forEach(o => {
      o.milestones.forEach(m => {
        if (!tplNameById.has(m.templateId)) tplNameById.set(m.templateId, m.name);
      });
    });
    const list: Array<[string, { name: string; completed: number }]> = [];
    tplIds.forEach(tid => {
      const completed = combinedCompletedAtTemplate(
        productOrdersForMilestones,
        productMilestoneProgresses,
        order.productId,
        tid,
      );
      if (completed <= 0) return;
      list.push([tid, { name: tplNameById.get(tid) ?? tid, completed }]);
    });
    return list.sort(([a], [b]) => {
      const nodeIds = product?.milestoneNodeIds ?? [];
      const ia = nodeIds.indexOf(a);
      const ib = nodeIds.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [order?.productId, productOrders, productMilestoneProgresses, globalNodes, product?.milestoneNodeIds]);

  const buildOrderPrintContext = useCallback(
    (_template: PrintTemplate): PrintRenderContext => {
      const o = orders.find(x => x.id === orderId);
      const p = o ? products.find(pr => pr.id === o.productId) : undefined;
      if (!o) return {};
      return {
        order: o,
        product: p,
        printListRows: buildPrintListRowsFromOrderItemsMatrix(o, p, dictionaries),
      };
    },
    [orderId, orders, products, dictionaries],
  );

  if (!orderId || !order) return null;

  const handleSave = () => {
    if (!onUpdateOrder) return;
    const sanitizedItems = editForm.items.map(item => ({
      ...item,
      completedQuantity: Math.min(item.completedQuantity, item.quantity)
    }));
    const normalizeOrderDateField = (v: string): string => {
      const t = (v || '').trim();
      if (!t) return '';
      if (YMD_ONLY.test(t)) return localCalendarYmdStartToIso(t);
      return t;
    };
    onUpdateOrder(order.id, {
      customer: editForm.customer,
      dueDate: normalizeOrderDateField(editForm.dueDate),
      startDate: normalizeOrderDateField(editForm.startDate),
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
    setEditForm(prev => {
      const item = prev.items.find(i => i.variantId === variantId);
      const minQ = item?.completedQuantity ?? 0;
      const q = Math.max(minQ, Math.max(0, quantity));
      return {
        ...prev,
        items: prev.items.map(it => (it.variantId === variantId ? { ...it, quantity: q } : it)),
      };
    });
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

  /**
   * 工单删除校验：原实现在 productionLinkMode === 'product' 时跳过全部前端校验，导致产品模式下
   * 任何工单都能直接走到 confirm 弹窗（即便后端会拦，也是误导用户）。这里改为永远执行三道硬校验：
   * 1) 该工单 milestone 是否已有报工 / completedQuantity > 0；
   * 2) 该工单是否存在关联 ProductionOpRecord（按 orderId）；
   * 3) 该工单是否存在子工单。
   * 产品模式下另外做一次"PMP 进度提示"——PMP 是产品维度共享的，删除单张工单不会清掉它，
   * 仅作信息告知，不阻止删除（PMP 没有 orderId，无法精确归属到具体工单）。
   */
  const handleDelete = async () => {
    if (!onDeleteOrder) return;
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
    let confirmMsg = `确定要删除工单「${order.orderNumber}」吗？此操作不可恢复。`;
    if (productionLinkMode === 'product') {
      const pmpCompleted = productMilestoneProgresses
        .filter(p => p.productId === order.productId)
        .reduce((s, p) => s + (p.completedQuantity ?? 0), 0);
      if (pmpCompleted > 0) {
        confirmMsg = `该产品的产品池 (PMP) 上累计已报工 ${pmpCompleted} 件（跨该产品下所有工单共享）。\n删除本工单不会清除产品池进度，仅会移除本工单本身。\n\n${confirmMsg}`;
      }
    }
    const ok = await confirm({ message: confirmMsg, danger: true });
    if (!ok) return;
    onDeleteOrder(order.id);
    onClose();
  };

  const displayTotalQty = isEditing
    ? editForm.items.reduce((s, i) => s + i.quantity, 0)
    : orderTotalQty;

  if (productionLinkMode === 'product' && !productModeSingleOrderLayout) {
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
            {(productionLinkMode !== 'product' || productModeSingleOrderLayout) && (
              <OrderCenterDetailPrintBlock
                printSlot={orderFormSettings?.orderCenterPrint?.orderDetail}
                printTemplates={printTemplates}
                buildContext={buildOrderPrintContext}
                pickerSubtitle={`工单 ${order.orderNumber}`}
                onAddPrintTemplate={onOpenOrderFormPrintTab}
              />
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
                    <p className="text-sm font-bold text-slate-800">{toLocalDateYmd(order.dueDate) || order.dueDate || '—'}</p>
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
                    <p className="text-sm font-bold text-slate-800">{toLocalDateYmd(order.startDate) || order.startDate || '—'}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 工单明细（仅在有颜色尺码时显示） */}
          {hasColorSize && (
          <div>
            <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-2">
              <Layers className="w-3.5 h-3.5" /> 工单明细
            </h4>
            {product && dictionaries && product.variants?.length ? (
              (() => {
                const itemsForCells = isEditing ? editForm.items : (order?.items ?? []);
                const getItemForVariant = (variantId: string) => itemsForCells.find(i => i.variantId === variantId);
                const renderQtyCell = (variant: ProductVariant) => {
                  const qty = getQuantityByVariant(variant.id);
                  const completed = getItemForVariant(variant.id)?.completedQuantity ?? 0;
                  return (
                    <div key={variant.id} className="flex min-w-0 flex-col gap-1">
                      {isEditing ? (
                        <>
                          <div className="flex min-w-0 items-center gap-1.5">
                            <input
                              type="number"
                              min={completed}
                              value={qty}
                              onChange={e =>
                                handleItemQuantityChangeByVariant(variant.id, parseInt(e.target.value, 10) || 0)
                              }
                              className="h-8 w-[3rem] shrink-0 rounded-md border border-slate-200 bg-white px-1.5 text-left text-sm font-bold text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200"
                            />
                            <span className="min-w-0 text-[10px] font-medium tabular-nums leading-none text-slate-400">
                              最少 {completed}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="text-sm font-bold text-indigo-600 tabular-nums">{qty}</span>
                          {completed > 0 ? (
                            <span className="text-[10px] font-medium tabular-nums text-slate-400">已下工 {completed}</span>
                          ) : null}
                        </>
                      )}
                    </div>
                  );
                };
                const layout = buildVariantQtyMatrixLayout(product, dictionaries);
                if (!layout) return null;
                const rows: QtyMatrixTableRow[] = layout.colorRows.map(row => {
                  let rowSum = 0;
                  const cells = row.variantAtSize.map((variant, si) => {
                    if (!variant) {
                      return <span key={`${row.key}-e-${si}`} className="text-sm text-slate-300">—</span>;
                    }
                    rowSum += getQuantityByVariant(variant.id);
                    return renderQtyCell(variant);
                  });
                  return {
                    key: row.key,
                    colorCell: (
                      <div className="flex items-center gap-2">
                        {row.colorSwatch ? (
                          <span className="h-4 w-4 shrink-0 rounded-full border border-slate-200" style={{ backgroundColor: row.colorSwatch }} />
                        ) : null}
                        <span>{row.colorLabel}</span>
                      </div>
                    ),
                    cells,
                    subtotalCell: rowSum,
                  };
                });
                return (
                  <div className="rounded-xl bg-slate-50/50 p-2 sm:p-2.5 ring-1 ring-slate-100/80">
                    <QtyMatrixTable
                      sizeHeaders={layout.sizeColumns.map(c => c.header)}
                      rows={rows}
                      dense
                    />
                  </div>
                );
              })()
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

          {productionLinkMode !== 'product' && order.milestones.some(m => (m.reports?.length ?? 0) > 0) && (
            <div className="mt-6">
              <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-3">
                <ClipboardList className="w-3.5 h-3.5" /> 报工明细（含填报项）
              </h4>
              <div className="space-y-4">
                {order.milestones.map(m => {
                  const reports = m.reports || [];
                  if (reports.length === 0) return null;
                  const tmpl = getEffectiveReportTemplate(m, globalNodes);
                  return (
                    <div key={m.id} className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                      <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 text-xs font-black text-slate-700">{m.name}</div>
                      <div className="divide-y divide-slate-100">
                        {reports.map(r => {
                          const entries = getReportCustomDataDisplayEntries(r.customData, tmpl);
                          return (
                            <div key={r.id} className="px-4 py-3 space-y-2">
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
                                <span>{fmtReportDetailTs(r.timestamp)}</span>
                                <span>操作人：{r.operator}</span>
                                <span className="font-bold text-emerald-600">良品 {r.quantity} {unitName}</span>
                                {(r.defectiveQuantity ?? 0) > 0 && (
                                  <span className="font-bold text-amber-600">不良 {(r.defectiveQuantity ?? 0)} {unitName}</span>
                                )}
                                {r.reportNo && <span className="text-slate-500">单号 {r.reportNo}</span>}
                              </div>
                              {entries.length > 0 && (
                                <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 space-y-1">
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">填报项</p>
                                  {entries.map(e => (
                                    <p key={e.fieldId} className="text-xs leading-relaxed">
                                      <span className="font-bold text-slate-600">{e.label}：</span>
                                      <span className="text-slate-800 break-all">{e.display}</span>
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
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
