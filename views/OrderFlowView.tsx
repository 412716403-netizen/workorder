import React, { useMemo, useState } from 'react';
import { ScrollText, FileText, Package, Search } from 'lucide-react';
import { ProductionOrder, Product, OrderStatus } from '../types';
import { STATUS_COLORS, ORDER_STATUS_MAP } from '../constants';

/** 从工单获取创建日期：优先 createdAt，否则从 id 解析时间戳 */
function getOrderDate(order: ProductionOrder): string {
  if (order.createdAt) return order.createdAt;
  const m = order.id.match(/ord-(\d+)-/);
  if (m) {
    const d = new Date(parseInt(m[1], 10));
    return d.toISOString().split('T')[0];
  }
  return order.startDate || '';
}

type DateFilter = 'today' | 'week' | 'month' | 'all';

function getDateRange(filter: DateFilter): { start: string; end: string } | null {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;

  if (filter === 'today') return { start: todayStr, end: todayStr };
  if (filter === 'week') {
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 6);
    const start = weekAgo.toISOString().split('T')[0];
    return { start, end: todayStr };
  }
  if (filter === 'month') {
    return { start: `${y}-${m}-01`, end: todayStr };
  }
  return null;
}

function isDateInRange(dateStr: string, range: { start: string; end: string } | null): boolean {
  if (!range) return true;
  return dateStr >= range.start && dateStr <= range.end;
}

interface OrderFlowViewProps {
  orders: ProductionOrder[];
  products: Product[];
  /** 嵌入弹窗时隐藏主标题，避免重复 */
  embedded?: boolean;
  /** 关联产品模式下隐藏单据状态列 */
  productionLinkMode?: 'order' | 'product';
  /** 从产品卡片打开时传入，用于预填搜索筛选 */
  initialProductId?: string | null;
  /** 点击详情时打开弹窗，不传则无详情入口 */
  onOpenOrderDetail?: (orderId: string) => void;
}

const OrderFlowView: React.FC<OrderFlowViewProps> = ({ orders, products, embedded, productionLinkMode, initialProductId, onOpenOrderDetail }) => {
  const showStatus = productionLinkMode !== 'product';
  const showDueDate = productionLinkMode !== 'product';
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [productSearch, setProductSearch] = useState('');

  React.useEffect(() => {
    if (initialProductId) {
      const product = products.find(p => p.id === initialProductId);
      setProductSearch(product?.name ?? '');
    } else {
      setProductSearch('');
    }
  }, [initialProductId, products]);

  const range = getDateRange(dateFilter);

  const filteredOrders = useMemo(() => {
    let list = [...orders];
    list = list.filter(o => isDateInRange(getOrderDate(o), range));
    if (initialProductId) {
      list = list.filter(o => o.productId === initialProductId);
    }
    if (productSearch.trim()) {
      const q = productSearch.trim().toLowerCase();
      list = list.filter(
        o =>
          o.productName?.toLowerCase().includes(q) ||
          o.sku?.toLowerCase().includes(q) ||
          o.orderNumber?.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      const da = getOrderDate(a);
      const db = getOrderDate(b);
      if (da !== db) return db.localeCompare(da);
      return (b.id || '').localeCompare(a.id || '');
    });
    return list;
  }, [orders, range, productSearch, initialProductId]);

  /** 当前筛选结果的工单总数与件数 */
  const filteredStats = useMemo(() => {
    const count = filteredOrders.length;
    const totalQty = filteredOrders.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0);
    return { count, totalQty };
  }, [filteredOrders]);

  return (
    <div className={`space-y-6 ${!embedded ? 'animate-in fade-in duration-500' : ''}`}>
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <ScrollText className="w-8 h-8 text-indigo-600" />
            工单流水
          </h1>
          <p className="text-slate-500 mt-1 italic text-sm">按日期查看工单下达记录，便于统计每日/每周下单量</p>
        </div>
      )}

      {/* 统计与筛选 */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-3">
          <div className="bg-white rounded-2xl border border-slate-200 px-5 py-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
              <Package className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">当前筛选</p>
              <p className="text-xl font-black text-slate-700">{filteredStats.count} 单 / {filteredStats.totalQty.toLocaleString()} 件</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索产品、工单号..."
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 w-48"
            />
          </div>
          <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-white">
            {(['today', 'week', 'month', 'all'] as const).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setDateFilter(f)}
                className={`px-4 py-2 text-xs font-bold transition-colors ${
                  dateFilter === f ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {f === 'today' ? '今日' : f === 'week' ? '近7日' : f === 'month' ? '本月' : '全部'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 列表 */}
      <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="p-20 text-center">
            <ScrollText className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-400 font-medium">
              {orders.length === 0 ? '暂无工单数据' : '当前筛选条件下无工单'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-wider">下单日期</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-wider">工单号</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-wider">产品</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">数量</th>
                  {showStatus && <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-wider">状态</th>}
                  {showDueDate && <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-wider">交期</th>}
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-wider w-24"></th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => {
                  const orderDate = getOrderDate(order);
                  const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);
                  const product = products.find(p => p.id === order.productId);
                  return (
                    <tr
                      key={order.id}
                      className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-slate-700">{orderDate}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-wider">
                          {order.orderNumber}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {product?.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt=""
                              className="w-8 h-8 rounded-lg object-cover border border-slate-100"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                              <Package className="w-4 h-4 text-slate-400" />
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-bold text-slate-800">{order.productName || '未知产品'}</p>
                            <p className="text-[10px] text-slate-500">{order.sku}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-black text-slate-800">{totalQty}</span>
                        <span className="text-xs text-slate-400 ml-1">件</span>
                      </td>
                      {showStatus && (
                        <td className="px-6 py-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black ${
                              STATUS_COLORS[order.status] || 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {ORDER_STATUS_MAP[order.status]?.label ?? order.status}
                          </span>
                        </td>
                      )}
                      {showDueDate && (
                        <td className="px-6 py-4">
                          {order.dueDate ? (
                            <span className="text-sm font-bold text-slate-600">{order.dueDate}</span>
                          ) : null}
                        </td>
                      )}
                      <td className="px-6 py-4">
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
          </div>
        )}
        {filteredOrders.length > 0 && (
          <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 text-xs font-bold text-slate-500 flex items-center justify-between gap-4">
            <span>当前显示共 {filteredStats.count} 条工单，合计 {filteredStats.totalQty.toLocaleString()} 件</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderFlowView;
