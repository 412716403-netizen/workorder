import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText, X, Filter, ArrowUpFromLine, Undo2, FileText, Loader2 } from 'lucide-react';
import type {
  ProductionOpRecord,
  GlobalNodeTemplate,
  ProductionOrder,
  Product,
} from '../../types';
import { hasOpsPerm } from './types';
import { toLocalDateYmd } from '../../utils/localDateTime';
import { flowRecordsEarliestMs } from '../../utils/flowDocSort';
import {
  fetchProductionByFilter,
  dateInputToIsoStart,
  dateInputToIsoEndExclusive,
  getTodayRangeIso,
  isoToDateInput,
} from './sharedFlowListHelpers';
import FlowListSummaryFooter from '../../components/flow/FlowListSummaryFooter';
import FlowListTableShell from '../../components/flow/FlowListTableShell';
import FlowListProductCell from '../../components/flow/FlowListProductCell';

interface FlowSummaryRow {
  docNo: string;
  orderId: string;
  orderNumber: string;
  productId: string;
  productName: string;
  records: ProductionOpRecord[];
  dateStr: string;
  partner: string;
  totalQuantity: number;
  milestoneStr: string;
  typeStr: string;
  /** 工单模式下由工单 due_date 格式化 */
  dueDateDisplay?: string;
}

/** 从外协主列表卡片打开流水时预填筛选；为 null 时表示从工具栏打开，清空筛选 */
export type OutsourceFlowOpenSeed = {
  orderKeyword: string;
  productKeyword: string;
  milestoneNodeId: string;
  partnerKeyword: string;
} | null;

export interface OutsourceFlowListModalProps {
  productionLinkMode: 'order' | 'product';
  /** 工单模式且计划配置开启「显示交货日期」时展示交货日期列 */
  showOrderDueDateColumn?: boolean;
  orders: ProductionOrder[];
  products: Product[];
  globalNodes: GlobalNodeTemplate[];
  userPermissions?: string[];
  tenantRole?: string;
  /** 点击详情时回传 docNo 与该单据对应的 records，让父组件在窄拉 records 不命中时仍能渲染详情。 */
  onOpenDetail: (docNo: string, records: ProductionOpRecord[]) => void;
  onClose: () => void;
  /** 打开流水时应用的筛选种子；配合 flowOpenNonce 在每次打开时生效 */
  flowOpenSeed?: OutsourceFlowOpenSeed;
  /** 每次打开外协流水时递增，用于在 seed 不变时也能重新应用 */
  flowOpenNonce?: number;
  /** 流水弹窗层级（嵌套在其它弹窗内时可传 z-[90]） */
  overlayZIndexClass?: string;
}

const OutsourceFlowListModal: React.FC<OutsourceFlowListModalProps> = ({
  productionLinkMode,
  showOrderDueDateColumn = false,
  orders,
  products,
  globalNodes,
  userPermissions,
  tenantRole,
  onOpenDetail,
  onClose,
  flowOpenSeed = null,
  flowOpenNonce = 0,
  overlayZIndexClass = 'z-[80]',
}) => {
  const todayDate = useMemo(() => isoToDateInput(getTodayRangeIso().from), []);
  const [flowFilterDateFrom, setFlowFilterDateFrom] = useState(todayDate);
  const [flowFilterDateTo, setFlowFilterDateTo] = useState(todayDate);
  const [flowFilterType, setFlowFilterType] = useState<'all' | '发出' | '收回'>('all');
  const [flowFilterPartner, setFlowFilterPartner] = useState('');
  const [flowFilterDocNo, setFlowFilterDocNo] = useState('');
  const [flowFilterOrder, setFlowFilterOrder] = useState('');
  const [flowFilterProduct, setFlowFilterProduct] = useState('');
  const [flowFilterMilestone, setFlowFilterMilestone] = useState('');

  useEffect(() => {
    if (flowOpenSeed == null) {
      // 工具栏打开：恢复默认（当天 + 清空过滤器）
      setFlowFilterDateFrom(todayDate);
      setFlowFilterDateTo(todayDate);
      setFlowFilterType('all');
      setFlowFilterPartner('');
      setFlowFilterDocNo('');
      setFlowFilterOrder('');
      setFlowFilterProduct('');
      setFlowFilterMilestone('');
    } else {
      setFlowFilterOrder(flowOpenSeed.orderKeyword);
      setFlowFilterProduct(flowOpenSeed.productKeyword);
      setFlowFilterMilestone(flowOpenSeed.milestoneNodeId);
      setFlowFilterPartner(flowOpenSeed.partnerKeyword);
    }
  }, [flowOpenNonce, flowOpenSeed, todayDate]);

  const flowQuery = useQuery({
    queryKey: ['flow.outsource', flowFilterDateFrom, flowFilterDateTo],
    queryFn: () =>
      fetchProductionByFilter({
        type: 'OUTSOURCE',
        startDate: dateInputToIsoStart(flowFilterDateFrom),
        endDate: dateInputToIsoEndExclusive(flowFilterDateTo),
      }),
    staleTime: 15_000,
  });
  const records = flowQuery.data ?? [];

  /** 本地索引：summary 聚合需要 orders / products / nodes 三个 by-id 映射 */
  const ordersById = useMemo(() => new Map(orders.map(o => [o.id, o])), [orders]);
  const productsById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const nodesById = useMemo(() => new Map(globalNodes.map(n => [n.id, n])), [globalNodes]);

  /**
   * 流水汇总：从 OutsourcePanel 搬入；按 docNo + (orderId|productId) 聚合，
   * 计算 dateStr / 总量 / 工序串 / 类型（发出/收回）。
   */
  const outsourceFlowSummaryRows = useMemo<FlowSummaryRow[]>(() => {
    const isProductMode = productionLinkMode === 'product';
    const outsourceList = records.filter(r => r.type === 'OUTSOURCE' && !r.sourceReworkId);

    if (isProductMode) {
      const key = (docNo: string, productId: string) => `${docNo}|${productId}`;
      const byKey = new Map<string, { docNo: string; productId: string; productName: string; records: ProductionOpRecord[] }>();
      outsourceList.forEach(rec => {
        const docNo = rec.docNo ?? '—';
        const pid = rec.productId || '';
        const product = productsById.get(pid);
        const k = key(docNo, pid);
        if (!byKey.has(k)) {
          byKey.set(k, { docNo, productId: pid, productName: product?.name ?? '—', records: [] });
        }
        byKey.get(k)!.records.push(rec);
      });
      return Array.from(byKey.values())
        .map(row => {
          const sorted = [...row.records].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
          const earliest = sorted.reduce((best, cur) => {
            const tb = new Date(best.timestamp).getTime();
            const tc = new Date(cur.timestamp).getTime();
            if (Number.isNaN(tb)) return cur;
            if (Number.isNaN(tc)) return best;
            return tc < tb ? cur : best;
          }, sorted[0]);
          const dateStr = earliest?.timestamp
            ? (() => {
                try {
                  const d = new Date(earliest.timestamp);
                  return isNaN(d.getTime())
                    ? earliest.timestamp
                    : d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                } catch {
                  return earliest.timestamp;
                }
              })()
            : '—';
          const partner = row.records[0]?.partner ?? '—';
          const totalQuantity = row.records.reduce((s, r) => s + r.quantity, 0);
          const nodeNames = [...new Set(row.records.map(r => r.nodeId).filter(Boolean))]
            .map(nid => nodesById.get(nid as string)?.name ?? nid);
          const milestoneStr = nodeNames.length ? nodeNames.join('、') : '—';
          const hasDispatch = row.records.some(r => r.status !== '已收回');
          const hasReceive = row.records.some(r => r.status === '已收回');
          const typeStr = hasDispatch && hasReceive ? '发出、收回' : hasDispatch ? '发出' : '收回';
          return { ...row, orderId: '', orderNumber: '', records: sorted, dateStr, partner, totalQuantity, milestoneStr, typeStr } as FlowSummaryRow;
        })
        .sort((a, b) => {
          const ta = flowRecordsEarliestMs(a.records);
          const tb = flowRecordsEarliestMs(b.records);
          if (tb !== ta) return tb - ta;
          return (a.docNo || '').localeCompare(b.docNo || '');
        });
    }

    const key = (docNo: string, orderId: string, productId: string) => `${docNo}|${orderId}|${productId}`;
    const byKey = new Map<string, { docNo: string; orderId: string; orderNumber: string; productId: string; productName: string; records: ProductionOpRecord[] }>();
    outsourceList.forEach(rec => {
      const docNo = rec.docNo ?? '—';
      const oid = rec.orderId || '';
      const pid = rec.productId || '';
      const order = ordersById.get(oid);
      const product = productsById.get(pid);
      const k = key(docNo, oid, pid);
      if (!byKey.has(k)) {
        byKey.set(k, {
          docNo,
          orderId: oid,
          orderNumber: order?.orderNumber ?? (oid ? oid : (product?.name ?? '—')),
          productId: pid,
          productName: product?.name ?? '—',
          records: [],
        });
      }
      byKey.get(k)!.records.push(rec);
    });
    return Array.from(byKey.values())
      .map(row => {
        const sorted = [...row.records].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
        const earliest = sorted.reduce((best, cur) => {
          const tb = new Date(best.timestamp).getTime();
          const tc = new Date(cur.timestamp).getTime();
          if (Number.isNaN(tb)) return cur;
          if (Number.isNaN(tc)) return best;
          return tc < tb ? cur : best;
        }, sorted[0]);
        const dateStr = earliest?.timestamp
          ? (() => {
              try {
                const d = new Date(earliest.timestamp);
                return isNaN(d.getTime())
                  ? earliest.timestamp
                  : d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
              } catch {
                return earliest.timestamp;
              }
            })()
          : '—';
        const partner = row.records[0]?.partner ?? '—';
        const totalQuantity = row.records.reduce((s, r) => s + r.quantity, 0);
        const nodeNames = [...new Set(row.records.map(r => r.nodeId).filter(Boolean))]
          .map(nid => nodesById.get(nid as string)?.name ?? nid);
        const milestoneStr = nodeNames.length ? nodeNames.join('、') : '—';
        const hasDispatch = row.records.some(r => r.status !== '已收回');
        const hasReceive = row.records.some(r => r.status === '已收回');
        const typeStr = hasDispatch && hasReceive ? '发出、收回' : hasDispatch ? '发出' : '收回';
        const ord = ordersById.get(row.orderId);
        const dueDateDisplay = ord?.dueDate
          ? toLocalDateYmd(ord.dueDate) || String(ord.dueDate).trim().slice(0, 10)
          : '—';
        return { ...row, records: sorted, dateStr, partner, totalQuantity, milestoneStr, typeStr, dueDateDisplay } as FlowSummaryRow;
      })
      .sort((a, b) => {
        const ta = flowRecordsEarliestMs(a.records);
        const tb = flowRecordsEarliestMs(b.records);
        if (tb !== ta) return tb - ta;
        return (a.docNo || '').localeCompare(b.docNo || '');
      });
  }, [productionLinkMode, records, ordersById, productsById, nodesById]);

  const filteredOutsourceFlowRows = useMemo(() => {
    let list = outsourceFlowSummaryRows;
    // 服务端已按 timestamp 窄拉；这里用 YMD 兜底，确保边界与下拉一致
    if (flowFilterDateFrom.trim()) {
      const from = flowFilterDateFrom.trim();
      list = list.filter(row => {
        const ts = row.records.length ? row.records[row.records.length - 1]?.timestamp : '';
        const d = ts ? toLocalDateYmd(ts) : '';
        return d >= from;
      });
    }
    if (flowFilterDateTo.trim()) {
      const to = flowFilterDateTo.trim();
      list = list.filter(row => {
        const ts = row.records.length ? row.records[row.records.length - 1]?.timestamp : '';
        const d = ts ? toLocalDateYmd(ts) : '';
        return d <= to;
      });
    }
    if (flowFilterType !== 'all') {
      list = list.filter(row => (row.typeStr || '').includes(flowFilterType));
    }
    if (flowFilterPartner.trim()) {
      const kw = flowFilterPartner.trim().toLowerCase();
      list = list.filter(row => (row.partner ?? '').toLowerCase().includes(kw));
    }
    if (flowFilterDocNo.trim()) {
      const kw = flowFilterDocNo.trim().toLowerCase();
      list = list.filter(row => (row.docNo ?? '').toLowerCase().includes(kw));
    }
    if (productionLinkMode !== 'product' && flowFilterOrder.trim()) {
      const kw = flowFilterOrder.trim().toLowerCase();
      list = list.filter(row => (row.orderNumber ?? '').toLowerCase().includes(kw));
    }
    if (flowFilterProduct.trim()) {
      const kw = flowFilterProduct.trim().toLowerCase();
      list = list.filter(row => (row.productName ?? '').toLowerCase().includes(kw));
    }
    if (flowFilterMilestone.trim()) {
      const nodeId = flowFilterMilestone.trim();
      list = list.filter(row => row.records.some(r => r.nodeId === nodeId));
    }
    return list;
  }, [outsourceFlowSummaryRows, flowFilterDateFrom, flowFilterDateTo, flowFilterType, flowFilterPartner, flowFilterDocNo, flowFilterOrder, flowFilterProduct, flowFilterMilestone, productionLinkMode]);

  const { outsourceFlowTotalDispatch, outsourceFlowTotalReceive, outsourceFlowRemaining } = useMemo(() => {
    let dispatch = 0;
    let receive = 0;
    filteredOutsourceFlowRows.forEach(row => {
      row.records.forEach(r => {
        if (r.status === '加工中') dispatch += r.quantity;
        else if (r.status === '已收回') receive += r.quantity;
      });
    });
    const outsourceFlowRemaining = Math.max(0, dispatch - receive);
    return { outsourceFlowTotalDispatch: dispatch, outsourceFlowTotalReceive: receive, outsourceFlowRemaining };
  }, [filteredOutsourceFlowRows]);

  return (
    <div className={`fixed inset-0 ${overlayZIndexClass} flex items-center justify-center p-4`}>
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-indigo-600 shrink-0" /> 外协流水
          </h3>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50 shrink-0"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
            <span className="text-[10px] text-slate-400">默认显示当天，扩大日期范围需手动改</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">日期起</label>
              <input type="date" value={flowFilterDateFrom} onChange={e => setFlowFilterDateFrom(e.target.value)} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">日期止</label>
              <input type="date" value={flowFilterDateTo} onChange={e => setFlowFilterDateTo(e.target.value)} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">类型</label>
              <select value={flowFilterType} onChange={e => setFlowFilterType(e.target.value as 'all' | '发出' | '收回')} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white">
                <option value="all">全部</option>
                <option value="发出">发出</option>
                <option value="收回">收回</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">外协工厂</label>
              <input type="text" value={flowFilterPartner} onChange={e => setFlowFilterPartner(e.target.value)} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">单号</label>
              <input type="text" value={flowFilterDocNo} onChange={e => setFlowFilterDocNo(e.target.value)} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            {productionLinkMode !== 'product' && (
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">工单</label>
                <input type="text" value={flowFilterOrder} onChange={e => setFlowFilterOrder(e.target.value)} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
              </div>
            )}
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">产品</label>
              <input type="text" value={flowFilterProduct} onChange={e => setFlowFilterProduct(e.target.value)} placeholder="模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">工序</label>
              <select value={flowFilterMilestone} onChange={e => setFlowFilterMilestone(e.target.value)} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white">
                <option value="">全部</option>
                {globalNodes.map(n => (<option key={n.id} value={n.id}>{n.name}</option>))}
              </select>
            </div>
          </div>
          {flowQuery.isFetching && (
          <div className="mt-2 flex items-center gap-4">
              <span className="text-xs text-indigo-500 inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />加载中</span>
          </div>
          )}
        </div>
        <div className="flex-1 min-h-0 flex flex-col p-4">
          {flowQuery.isLoading ? (
            <p className="text-slate-500 text-center py-12">加载中…</p>
          ) : filteredOutsourceFlowRows.length === 0 ? (
            <p className="text-slate-500 text-center py-12">暂无外协流水记录</p>
          ) : (
            <FlowListTableShell
              className="flex-1 min-h-0"
              footer={
                <FlowListSummaryFooter
                  mode="bar"
                  count={filteredOutsourceFlowRows.length}
                  metrics={[
                    { label: '发出', value: `${outsourceFlowTotalDispatch} 件`, className: 'text-indigo-600' },
                    { label: '收回', value: `${outsourceFlowTotalReceive} 件`, className: 'text-amber-600' },
                    { label: '剩余', value: `${outsourceFlowRemaining} 件`, className: 'text-slate-700' },
                  ]}
                />
              }
            >
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">日期</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">类型</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">外协工厂</th>
                    {productionLinkMode !== 'product' && <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工单号</th>}
                    {productionLinkMode !== 'product' && showOrderDueDateColumn && (
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">交货日期</th>
                    )}
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">产品</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工序</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap w-24">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOutsourceFlowRows.map(row => {
                    const rowKey = productionLinkMode === 'product' ? `${row.docNo}|${row.productId}` : `${row.docNo}|${row.orderId}|${row.productId}`;
                    const hasDispatch = (row.typeStr || '').includes('发出');
                    const hasReceive = (row.typeStr || '').includes('收回');
                    return (
                      <tr key={rowKey} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-[10px] font-mono font-bold text-slate-600 whitespace-nowrap">{row.docNo}</td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{row.dateStr}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 flex-wrap">
                            {hasDispatch && (<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800"><ArrowUpFromLine className="w-3 h-3" /> 发出</span>)}
                            {hasReceive && (<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800"><Undo2 className="w-3 h-3" /> 收回</span>)}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-800">{row.partner}</td>
                        {productionLinkMode !== 'product' && <td className="px-4 py-3 text-[10px] font-black text-indigo-600 uppercase">{row.orderNumber}</td>}
                        {productionLinkMode !== 'product' && showOrderDueDateColumn && (
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{row.dueDateDisplay ?? '—'}</td>
                        )}
                        <td className="px-4 py-3">
                          <FlowListProductCell
                            product={products.find(p => p.id === row.productId)}
                            name={row.productName}
                          />
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-700">{row.milestoneStr}</td>
                        <td className="px-4 py-3 text-right font-black text-indigo-600">{row.totalQuantity}</td>
                        <td className="px-4 py-3">
                          {hasOpsPerm(tenantRole, userPermissions, 'production:outsource_records:view') && (
                            <button type="button" onClick={() => onOpenDetail(row.docNo, row.records)} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0">
                              <FileText className="w-3.5 h-3.5" /> 详情
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </FlowListTableShell>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(OutsourceFlowListModal);
