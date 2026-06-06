import React, { useMemo, useState, useEffect } from 'react';
import { ScrollText, FileText, Filter } from 'lucide-react';
import { ProductionOrder, Product, PlanFormSettings } from '../types';
import { STATUS_COLORS, ORDER_STATUS_MAP } from '../constants';
import { formatOrderFlowPlacedDisplay, localTodayYmd, toLocalDateYmd, YMD_ONLY } from '../utils/localDateTime';
import FlowListSummaryFooter from '../components/flow/FlowListSummaryFooter';
import FlowListTableShell from '../components/flow/FlowListTableShell';
import FlowListProductCell from '../components/flow/FlowListProductCell';

/** 用于筛选/排序的本地日历日（YYYY-MM-DD） */
function getOrderDateYmd(order: ProductionOrder): string {
  if (order.createdAt) {
    const t = order.createdAt.trim();
    if (YMD_ONLY.test(t)) return t;
    return toLocalDateYmd(order.createdAt);
  }
  const m = order.id.match(/^ord-([^-]+)-/);
  if (m) {
    const ts = parseInt(m[1], 36);
    if (!Number.isNaN(ts)) return toLocalDateYmd(new Date(ts));
  }
  return order.startDate ? toLocalDateYmd(order.startDate) : '';
}

/** 列表展示：与工单 createdAt 语义一致（仅日期不补 08:00） */
function getOrderPlacedDisplay(order: ProductionOrder): string {
  const fromCreated = formatOrderFlowPlacedDisplay(order.createdAt, order.id);
  if (fromCreated) return fromCreated;
  if (order.startDate) return toLocalDateYmd(order.startDate) || order.startDate;
  return '';
}

interface OrderFlowViewProps {
  orders: ProductionOrder[];
  products: Product[];
  /** 嵌入弹窗时隐藏主标题，避免重复 */
  embedded?: boolean;
  /** 关联产品模式下隐藏单据状态列 */
  productionLinkMode?: 'order' | 'product';
  /** 从产品卡片打开时传入，用于预填产品名称筛选 */
  initialProductId?: string | null;
  /** 点击详情时打开弹窗，不传则无详情入口 */
  onOpenOrderDetail?: (orderId: string) => void;
  /** 与计划单表单「列表显示 · 显示交货日期」联动 */
  planFormSettings?: PlanFormSettings;
}

const OrderFlowView: React.FC<OrderFlowViewProps> = ({
  orders,
  products,
  embedded,
  productionLinkMode,
  initialProductId,
  onOpenOrderDetail,
  planFormSettings,
}) => {
  const todayDate = useMemo(() => localTodayYmd(), []);
  const showStatus = productionLinkMode !== 'product';
  const showDueDate =
    productionLinkMode !== 'product' && planFormSettings?.listDisplay?.showDeliveryDate === true;

  const [dateFrom, setDateFrom] = useState(todayDate);
  const [dateTo, setDateTo] = useState(todayDate);
  const [orderNumberKeyword, setOrderNumberKeyword] = useState('');
  const [productNameKeyword, setProductNameKeyword] = useState('');

  useEffect(() => {
    if (initialProductId) {
      const product = products.find(p => p.id === initialProductId);
      setProductNameKeyword(product?.name ?? '');
    } else {
      setProductNameKeyword('');
    }
  }, [initialProductId, products]);

  const filteredOrders = useMemo(() => {
    let list = [...orders];
    if (dateFrom) {
      list = list.filter(o => {
        const d = getOrderDateYmd(o);
        return d && d >= dateFrom;
      });
    }
    if (dateTo) {
      list = list.filter(o => {
        const d = getOrderDateYmd(o);
        return d && d <= dateTo;
      });
    }
    if (initialProductId) {
      list = list.filter(o => o.productId === initialProductId);
    }
    if (orderNumberKeyword.trim()) {
      const kw = orderNumberKeyword.trim().toLowerCase();
      list = list.filter(o => (o.orderNumber ?? '').toLowerCase().includes(kw));
    }
    if (productNameKeyword.trim()) {
      const kw = productNameKeyword.trim().toLowerCase();
      list = list.filter(
        o =>
          (o.productName ?? '').toLowerCase().includes(kw) ||
          (o.sku ?? '').toLowerCase().includes(kw),
      );
    }
    list.sort((a, b) => {
      const da = getOrderDateYmd(a);
      const db = getOrderDateYmd(b);
      if (da !== db) return db.localeCompare(da);
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (ta !== tb) return tb - ta;
      return (b.id || '').localeCompare(a.id || '');
    });
    return list;
  }, [orders, dateFrom, dateTo, orderNumberKeyword, productNameKeyword, initialProductId]);

  const filteredStats = useMemo(() => {
    const count = filteredOrders.length;
    const totalQty = filteredOrders.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0);
    return { count, totalQty };
  }, [filteredOrders]);

  const filterSection = (
    <div className={`border-b border-slate-100 bg-slate-50/50 shrink-0 ${embedded ? 'px-6 py-4' : 'px-6 py-4 rounded-t-[32px]'}`}>
      <div className="flex items-center gap-2 mb-3">
        <Filter className="w-4 h-4 text-slate-500" />
        <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
        <span className="text-[10px] text-slate-400">默认显示当天，扩大日期范围需手动改</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="text-[10px] font-bold text-slate-400 block mb-1">开始时间</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 block mb-1">结束时间</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 block mb-1">工单号</label>
          <input
            type="text"
            value={orderNumberKeyword}
            onChange={e => setOrderNumberKeyword(e.target.value)}
            placeholder="模糊搜索"
            className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 block mb-1">产品名称</label>
          <input
            type="text"
            value={productNameKeyword}
            onChange={e => setProductNameKeyword(e.target.value)}
            placeholder="产品名称模糊搜索"
            className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>
      </div>
    </div>
  );

  const listSection = (
    <div className={`flex-1 min-h-0 flex flex-col ${embedded ? 'p-4' : 'p-4'}`}>
      {filteredOrders.length === 0 ? (
        <p className="text-slate-500 text-center py-12">
          {orders.length === 0 ? '暂无工单数据' : '当前筛选条件下无工单'}
        </p>
      ) : (
        <FlowListTableShell
          className="flex-1 min-h-0"
          footer={
            <FlowListSummaryFooter
              mode="bar"
              count={filteredStats.count}
              countSuffix="条"
              metrics={[
                { label: '件数', value: `${filteredStats.totalQty.toLocaleString()} 件`, className: 'text-indigo-600' },
              ]}
            />
          }
        >
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">下单时间</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工单号</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">产品</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                {showStatus && (
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">状态</th>
                )}
                {showDueDate && (
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">交期</th>
                )}
                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap w-24">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map(order => {
                const orderPlaced = getOrderPlacedDisplay(order);
                const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);
                const product = products.find(p => p.id === order.productId);
                return (
                  <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{orderPlaced}</td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-mono font-bold text-indigo-600 whitespace-nowrap">{order.orderNumber}</span>
                    </td>
                    <td className="px-4 py-3">
                      <FlowListProductCell
                        product={product}
                        name={order.productName}
                        sku={order.sku}
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-black text-indigo-600 whitespace-nowrap">{totalQty}</td>
                    {showStatus && (
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            STATUS_COLORS[order.status] || 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {ORDER_STATUS_MAP[order.status]?.label ?? order.status}
                        </span>
                      </td>
                    )}
                    {showDueDate && (
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {order.dueDate ? toLocalDateYmd(order.dueDate) || order.dueDate : '—'}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {onOpenOrderDetail ? (
                        <button
                          type="button"
                          onClick={() => onOpenOrderDetail(order.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0"
                        >
                          <FileText className="w-3.5 h-3.5" /> 详情
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </FlowListTableShell>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
        {filterSection}
        {listSection}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <ScrollText className="w-8 h-8 text-indigo-600" />
          工单流水
        </h1>
        <p className="text-slate-500 mt-1 italic text-sm">按日期查看工单下达记录，便于统计每日下单量</p>
      </div>
      <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden flex flex-col min-h-[480px]">
        {filterSection}
        {listSection}
      </div>
    </div>
  );
};

export default OrderFlowView;
