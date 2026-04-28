import React, { useState, useMemo } from 'react';
import { ArrowDownToLine, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import type { Product, Partner } from '../../types';

export interface ReceiveRow {
  orderId?: string;
  nodeId: string;
  productId: string;
  orderNumber?: string;
  productName: string;
  milestoneName: string;
  partner: string;
  dispatched: number;
  received: number;
  pending: number;
}

export interface OutsourceReceiveListModalProps {
  productionLinkMode: 'order' | 'product';
  outsourceReceiveRows: ReceiveRow[];
  products: Product[];
  partners: Partner[];
  receiveSelectedKeys: Set<string>;
  setReceiveSelectedKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
  onReceiveFormOpen: () => void;
  onClose: () => void;
}

const OutsourceReceiveListModal: React.FC<OutsourceReceiveListModalProps> = ({
  productionLinkMode,
  outsourceReceiveRows,
  products,
  partners,
  receiveSelectedKeys,
  setReceiveSelectedKeys,
  onReceiveFormOpen,
  onClose,
}) => {
  const [searchOrder, setSearchOrder] = useState('');
  const [searchProduct, setSearchProduct] = useState('');
  const [searchPartner, setSearchPartner] = useState('');
  const [searchNodeId, setSearchNodeId] = useState('');

  const showOrderNumberCol = productionLinkMode === 'order';
  const tableColCount = 1 + (showOrderNumberCol ? 1 : 0) + 6;

  const nodeOptions = useMemo(() => {
    const seen = new Set<string>();
    const init: { value: string; label: string }[] = [];
    return outsourceReceiveRows.reduce((acc, row) => {
      if (row.nodeId && !seen.has(row.nodeId)) {
        seen.add(row.nodeId);
        acc.push({ value: row.nodeId, label: row.milestoneName });
      }
      return acc;
    }, init);
  }, [outsourceReceiveRows]);

  const filteredRows = useMemo(() => {
    const orderKw = (searchOrder || '').trim().toLowerCase();
    const productKw = (searchProduct || '').trim().toLowerCase();
    const partnerKw = (searchPartner || '').trim().toLowerCase();
    return outsourceReceiveRows.filter(row => {
      if (showOrderNumberCol && orderKw && row.orderNumber != null && !(row.orderNumber || '').toLowerCase().includes(orderKw))
        return false;
      if (productKw) {
        const product = products.find(p => p.id === row.productId);
        const nameMatch = (row.productName || '').toLowerCase().includes(productKw);
        const skuMatch = (product?.sku || '').toLowerCase().includes(productKw);
        if (!nameMatch && !skuMatch) return false;
      }
      if (partnerKw && !(row.partner || '').toLowerCase().includes(partnerKw)) return false;
      if (searchNodeId && row.nodeId !== searchNodeId) return false;
      return true;
    });
  }, [outsourceReceiveRows, searchOrder, searchProduct, searchPartner, searchNodeId, products, showOrderNumberCol]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} aria-hidden />
      <div
        className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3.5 sm:px-6">
          <h3 className="flex items-center gap-2 text-lg font-black text-slate-900">
            <ArrowDownToLine className="h-5 w-5 shrink-0 text-indigo-600" /> 待收回清单
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="shrink-0 border-b border-slate-100 bg-slate-50/60 px-5 py-2.5 sm:px-6">
          <p className="text-xs leading-relaxed text-slate-500">
            已发出未收回的外协单。请选择同一外协工厂与同一工序后批量收货；进度按发出时的关联方式回写。
          </p>
        </div>
        <div className="shrink-0 border-b border-slate-100 bg-white px-5 py-3 sm:px-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end lg:gap-x-4 lg:gap-y-3">
            {showOrderNumberCol ? (
              <div className="flex min-w-0 flex-col gap-1 lg:w-[11rem] lg:shrink-0">
                <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">单号</label>
                <input
                  type="text"
                  value={searchOrder}
                  onChange={e => setSearchOrder(e.target.value)}
                  placeholder="工单号模糊搜索"
                  className="w-full min-w-0 rounded-lg border border-slate-200 py-2 pl-3 pr-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>
            ) : null}
            <div className="flex min-w-0 flex-col gap-1 lg:min-w-[12rem] lg:flex-1 lg:max-w-[18rem]">
              <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">货号</label>
              <input
                type="text"
                value={searchProduct}
                onChange={e => setSearchProduct(e.target.value)}
                placeholder="产品名 / SKU 模糊搜索"
                className="w-full min-w-0 rounded-lg border border-slate-200 py-2 pl-3 pr-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1 lg:w-[11rem] lg:shrink-0">
              <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">外协工厂</label>
              <input
                type="text"
                value={searchPartner}
                onChange={e => setSearchPartner(e.target.value)}
                placeholder="模糊搜索"
                className="w-full min-w-0 rounded-lg border border-slate-200 py-2 pl-3 pr-3 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1 lg:w-[10rem] lg:shrink-0">
              <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">工序</label>
              <select
                value={searchNodeId}
                onChange={e => setSearchNodeId(e.target.value)}
                className="w-full min-w-0 rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                <option value="">全部</option>
                {nodeOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-3 pb-2 pt-0 sm:px-5">
          <table className="w-full table-fixed border-collapse text-left">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 shadow-[0_1px_0_0_rgb(226_232_240)]">
                <th className="w-11 px-2 py-2.5 sm:w-12 sm:px-3" scope="col" />
                {showOrderNumberCol ? (
                  <th className="w-[13%] px-2 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-3" scope="col">
                    工单号
                  </th>
                ) : null}
                <th
                  className={`px-2 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-3 ${showOrderNumberCol ? 'w-[22%]' : 'w-[30%]'}`}
                  scope="col"
                >
                  产品
                </th>
                <th className="w-[11%] px-2 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-3" scope="col">
                  工序
                </th>
                <th className="w-[18%] px-2 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-3" scope="col">
                  外协厂商
                </th>
                <th
                  className="w-[11%] whitespace-nowrap px-2 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-3"
                  scope="col"
                >
                  发出总量
                </th>
                <th
                  className="w-[11%] whitespace-nowrap px-2 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-3"
                  scope="col"
                >
                  已收总量
                </th>
                <th
                  className="w-[11%] whitespace-nowrap px-2 py-2.5 text-right text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-3"
                  scope="col"
                >
                  待收数量
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={tableColCount} className="px-4 py-14 text-center text-sm text-slate-400 sm:px-6 sm:py-16">
                    {outsourceReceiveRows.length === 0 ? '暂无待收回项。' : '无匹配项，请调整搜索条件。'}
                  </td>
                </tr>
              ) : (
                filteredRows.map(row => {
                  const isOrderScope = row.orderId != null;
                  const key = isOrderScope ? `${row.orderId}|${row.nodeId}` : `${row.productId}|${row.nodeId}|${row.partner}`;
                  const checked = receiveSelectedKeys.has(key);
                  const toggleRow = () => {
                    setReceiveSelectedKeys(prev => {
                      const next = new Set(prev);
                      if (next.has(key)) {
                        next.delete(key);
                        return next;
                      }
                      if (next.size > 0) {
                        const firstKey = next.values().next().value;
                        const firstRow = outsourceReceiveRows.find(
                          r => (r.orderId != null ? `${r.orderId}|${r.nodeId}` : `${r.productId}|${r.nodeId}|${r.partner}`) === firstKey,
                        );
                        const selectedPartner = firstRow?.partner ?? '';
                        if (selectedPartner !== (row.partner ?? '')) {
                          toast.warning('只能选择同一外协工厂同时收货，请先取消其他加工厂的勾选。');
                          return prev;
                        }
                        if ((firstRow?.nodeId ?? '') !== row.nodeId) {
                          toast.warning('只能选择同一工序同时收货，请先取消其他工序的勾选。');
                          return prev;
                        }
                      }
                      next.add(key);
                      return next;
                    });
                  };
                  const rowSurface = checked
                    ? 'bg-indigo-50/80 hover:bg-indigo-50'
                    : 'bg-white hover:bg-slate-50/80';
                  return (
                    <tr key={key} className={`cursor-pointer transition-colors ${rowSurface}`} onClick={toggleRow}>
                      <td className="w-11 px-2 py-2.5 align-middle sm:w-12 sm:px-3" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={toggleRow}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                      {showOrderNumberCol ? (
                        <td className="max-w-0 px-2 py-2.5 align-middle sm:px-3" title={row.orderNumber || '—'}>
                          <span className="block truncate text-sm font-bold text-slate-800 tabular-nums">
                            {row.orderNumber || <span className="text-slate-300">—</span>}
                          </span>
                        </td>
                      ) : null}
                      <td className="max-w-0 px-2 py-2.5 align-middle sm:px-3" title={row.productName}>
                        <span className="block truncate text-sm font-bold text-slate-800">{row.productName}</span>
                      </td>
                      <td className="max-w-0 px-2 py-2.5 align-middle sm:px-3" title={row.milestoneName}>
                        <span className="block truncate text-sm font-bold text-indigo-600">{row.milestoneName}</span>
                      </td>
                      <td className="max-w-0 px-2 py-2.5 align-middle sm:px-3" title={row.partner || '—'}>
                        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <span className="min-w-0 truncate text-sm font-bold text-slate-700">{row.partner || '—'}</span>
                          {partners.find(p => p.name === row.partner)?.collaborationTenantId ? (
                            <span className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-indigo-600 bg-indigo-50">
                              协作
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right align-middle sm:px-3">
                        <span className="text-sm font-bold tabular-nums text-slate-700">{row.dispatched}</span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right align-middle sm:px-3">
                        <span className="text-sm font-bold tabular-nums text-emerald-600">{row.received}</span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right align-middle sm:px-3">
                        <span className="text-sm font-black tabular-nums text-amber-600">{row.pending}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {outsourceReceiveRows.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/50 px-5 py-3.5 sm:px-6">
            <span className="text-sm font-bold text-slate-600">
              已选 <span className="tabular-nums text-indigo-700">{receiveSelectedKeys.size}</span> 项
            </span>
            <button
              type="button"
              disabled={receiveSelectedKeys.size === 0}
              onClick={onReceiveFormOpen}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check className="h-4 w-4 shrink-0" /> 收货
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(OutsourceReceiveListModal);
