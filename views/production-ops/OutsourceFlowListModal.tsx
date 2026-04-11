import React, { useState, useMemo, useEffect } from 'react';
import { ScrollText, X, Filter, ArrowUpFromLine, Undo2, FileText } from 'lucide-react';
import type { ProductionOpRecord, GlobalNodeTemplate } from '../../types';
import { hasOpsPerm } from './types';
import { toLocalDateYmd } from '../../utils/localDateTime';

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
  remark: string;
  milestoneStr: string;
  typeStr: string;
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
  outsourceFlowSummaryRows: FlowSummaryRow[];
  globalNodes: GlobalNodeTemplate[];
  userPermissions?: string[];
  tenantRole?: string;
  setFlowDetailKey: React.Dispatch<React.SetStateAction<string | null>>;
  onClose: () => void;
  /** 打开流水时应用的筛选种子；配合 flowOpenNonce 在每次打开时生效 */
  flowOpenSeed?: OutsourceFlowOpenSeed;
  /** 每次打开外协流水时递增，用于在 seed 不变时也能重新应用 */
  flowOpenNonce?: number;
}

const OutsourceFlowListModal: React.FC<OutsourceFlowListModalProps> = ({
  productionLinkMode,
  outsourceFlowSummaryRows,
  globalNodes,
  userPermissions,
  tenantRole,
  setFlowDetailKey,
  onClose,
  flowOpenSeed = null,
  flowOpenNonce = 0,
}) => {
  const [flowFilterDateFrom, setFlowFilterDateFrom] = useState('');
  const [flowFilterDateTo, setFlowFilterDateTo] = useState('');
  const [flowFilterType, setFlowFilterType] = useState<'all' | '发出' | '收回'>('all');
  const [flowFilterPartner, setFlowFilterPartner] = useState('');
  const [flowFilterDocNo, setFlowFilterDocNo] = useState('');
  const [flowFilterOrder, setFlowFilterOrder] = useState('');
  const [flowFilterProduct, setFlowFilterProduct] = useState('');
  const [flowFilterMilestone, setFlowFilterMilestone] = useState('');

  useEffect(() => {
    if (flowOpenSeed == null) {
      setFlowFilterDateFrom('');
      setFlowFilterDateTo('');
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
  }, [flowOpenNonce, flowOpenSeed]);

  const filteredOutsourceFlowRows = useMemo(() => {
    let list = outsourceFlowSummaryRows;
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

  const { outsourceFlowTotalDispatch, outsourceFlowTotalReceive } = useMemo(() => {
    let dispatch = 0;
    let receive = 0;
    filteredOutsourceFlowRows.forEach(row => {
      row.records.forEach(r => {
        if (r.status === '加工中') dispatch += r.quantity;
        else if (r.status === '已收回') receive += r.quantity;
      });
    });
    return { outsourceFlowTotalDispatch: dispatch, outsourceFlowTotalReceive: receive };
  }, [filteredOutsourceFlowRows]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><ScrollText className="w-5 h-5 text-indigo-600" /> 外协流水</h3>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
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
          <div className="mt-2 flex items-center gap-4">
            <button type="button" onClick={() => { setFlowFilterDateFrom(''); setFlowFilterDateTo(''); setFlowFilterType('all'); setFlowFilterPartner(''); setFlowFilterDocNo(''); setFlowFilterOrder(''); setFlowFilterProduct(''); setFlowFilterMilestone(''); }} className="text-xs font-bold text-slate-500 hover:text-slate-700">清空筛选</button>
            <span className="text-xs text-slate-400">共 {filteredOutsourceFlowRows.length} 条</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {filteredOutsourceFlowRows.length === 0 ? (
            <p className="text-slate-500 text-center py-12">暂无外协流水记录</p>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单号</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">日期</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">类型</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">外协工厂</th>
                    {productionLinkMode !== 'product' && <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工单号</th>}
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">产品</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">工序</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">备注</th>
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
                        <td className="px-4 py-3 font-bold text-slate-800">{row.productName}</td>
                        <td className="px-4 py-3 font-bold text-slate-700">{row.milestoneStr}</td>
                        <td className="px-4 py-3 text-right font-black text-indigo-600">{row.totalQuantity}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 max-w-[180px] truncate" title={row.remark}>{row.remark}</td>
                        <td className="px-4 py-3">
                          {hasOpsPerm(tenantRole, userPermissions, 'production:outsource_records:view') && (
                            <button type="button" onClick={() => setFlowDetailKey(row.docNo)} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all whitespace-nowrap shrink-0">
                              <FileText className="w-3.5 h-3.5" /> 详情
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                    <td className="px-4 py-3" colSpan={productionLinkMode === 'product' ? 9 : 10}>
                      <span className="text-[10px] text-slate-500 uppercase mr-3">合计</span>
                      <span className="text-xs text-indigo-600">发出 {outsourceFlowTotalDispatch} 件</span>
                      <span className="text-slate-300 mx-2">|</span>
                      <span className="text-xs text-amber-600">收回 {outsourceFlowTotalReceive} 件</span>
                      <span className="text-slate-300 mx-2">|</span>
                      <span className="text-xs text-slate-700">结余 {Math.round((outsourceFlowTotalDispatch - outsourceFlowTotalReceive) * 100) / 100} 件</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(OutsourceFlowListModal);
