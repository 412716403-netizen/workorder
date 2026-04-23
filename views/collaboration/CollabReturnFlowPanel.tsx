import React, { useState, useMemo } from 'react';
import { ArrowLeft, Filter, Truck, FileText } from 'lucide-react';
import type { ProductionOpRecord, Product, Warehouse, AppDictionaries } from '../../types';
import {
  returnFlowDocStatusLabel,
  dispatchFlowDocStatusLabel,
  forwardFlowDocStatusLabel,
} from './collabHelpers';
import CollabReturnFlowDocDetailModal from './CollabReturnFlowDocDetailModal';
import { toLocalDateYmd } from '../../utils/localDateTime';

export type CollabFlowDocType = 'dispatch' | 'return' | 'forward';

interface CollabReturnFlowPanelProps {
  onBack: () => void;
  /** 嵌入弹窗时隐藏「返回列表」与主标题，由外层提供标题栏 */
  embeddedInModal?: boolean;
  /** 协作转运单列表（已由 listTransfers 按本租户可见性过滤） */
  transfers: any[];
  /** 当前本企业 tenantId，用于区分甲方/乙方/转发方视角 */
  myTenantId: string | null;
  prodRecords: ProductionOpRecord[];
  products: Product[];
  warehouses: Warehouse[];
  dictionaries: AppDictionaries;
  onRefreshProdRecords?: () => Promise<void>;
}

const PAGE_SIZE = 30;

type FlowRow = {
  key: string;
  docType: CollabFlowDocType;
  docNo: string;
  timestamp: string;
  partner: string;
  productName: string;
  productSku: string;
  productId: string | null;
  totalQty: number;
  warehouseId: string | null;
  status: string;
  statusWarn: boolean;
};

function sumItemsQty(items: any): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce((s, it) => s + (Number((it && it.quantity) ?? 0) || 0), 0);
}

function toIsoString(v: string | Date | null | undefined): string {
  if (!v) return '';
  if (typeof v === 'string') return v;
  try { return v.toISOString(); } catch { return ''; }
}

function buildFlowRows(transfers: any[], myTenantId: string | null): FlowRow[] {
  if (!myTenantId) return [];
  const rows: FlowRow[] = [];
  const transferById = new Map<string, any>();
  for (const t of transfers) transferById.set(t.id, t);

  for (const t of transfers) {
    const isChain = !!t.outsourceRouteSnapshot && (t.chainStep ?? 0) > 0;
    const parent = t.parentTransferId ? transferById.get(t.parentTransferId) : null;

    // ---- 派发 ----
    for (const d of (t.dispatches || [])) {
      const payload = (d.payload ?? {}) as any;
      /**
       * 普通派发（syncDispatch）payload 没有 stockOutDocNo，单号在 senderRef.docNos[] 中（源 OUTSOURCE 单号）；
       * 链式子 transfer 的派发（forwardTransfer）才会写 stockOutDocNo。两种情况都要能出行。
       */
      const senderDocNos: string[] = Array.isArray(payload?.senderRef?.docNos) ? payload.senderRef.docNos.filter(Boolean) : [];
      const docNo: string = payload?.stockOutDocNo || senderDocNos[0] || '';
      const qty = sumItemsQty(payload?.items);
      let include = false;
      let partner = '';
      if (!isChain) {
        if (t.senderTenantId === myTenantId) { include = true; partner = t.receiverTenantName || ''; }
        else if (t.receiverTenantId === myTenantId) { include = true; partner = t.senderTenantName || ''; }
      } else {
        if (t.receiverTenantId === myTenantId) {
          include = true;
          partner = parent?.receiverTenantName /* 上一站转发方 */ || t.senderTenantName || '';
        }
      }
      if (!include) continue;
      const statusText = dispatchFlowDocStatusLabel(d.status);
      rows.push({
        key: `dispatch|${docNo}|${d.id}`,
        docType: 'dispatch',
        docNo,
        timestamp: toIsoString(d.createdAt ?? t.createdAt),
        partner,
        productName: t.senderProductName || '',
        productSku: t.senderProductSku || '',
        productId: t.senderProductId || null,
        totalQty: qty,
        warehouseId: payload?.warehouseId ?? null,
        status: statusText,
        statusWarn: d.status === 'PENDING' || d.status === 'WITHDRAWN',
      });
    }

    // ---- 回传 ----
    for (const r of (t.returns || [])) {
      const payload = (r.payload ?? {}) as any;
      const docNo: string = payload?.stockOutDocNo ?? '';
      if (!docNo) continue;
      const qty = sumItemsQty(payload?.items);
      // 回传两端都会看到：sender 或 receiver 为本企业即可
      if (t.senderTenantId !== myTenantId && t.receiverTenantId !== myTenantId) continue;
      const partner = t.senderTenantId === myTenantId ? (t.receiverTenantName || '') : (t.senderTenantName || '');
      const statusText = returnFlowDocStatusLabel({ status: r.status, amendmentStatus: r.amendmentStatus ?? null });
      rows.push({
        key: `return|${docNo}|${r.id}`,
        docType: 'return',
        docNo,
        timestamp: toIsoString(r.createdAt ?? t.createdAt),
        partner,
        productName: t.senderProductName || '',
        productSku: t.senderProductSku || '',
        productId: t.senderProductId || null,
        totalQty: qty,
        warehouseId: payload?.warehouseId ?? null,
        status: statusText,
        statusWarn: statusText === '待甲方确认',
      });
    }
  }

  // ---- 转发（链式子 transfer，按 parentTransferId + sharedDocNo 聚合） ----
  const seenForward = new Set<string>();
  for (const t of transfers) {
    const isChain = !!t.outsourceRouteSnapshot && (t.chainStep ?? 0) > 0;
    if (!isChain || !t.parentTransferId) continue;
    const parent = transferById.get(t.parentTransferId);
    const parentReceiver: string | null = parent?.receiverTenantId ?? null;
    const isOriginSide = (t.originTenantId ?? t.senderTenantId) === myTenantId;
    const isForwarderSide = parentReceiver === myTenantId;
    if (!isOriginSide && !isForwarderSide) continue;
    const firstD = (t.dispatches || [])[0];
    const sharedDocNo: string = (firstD?.payload as any)?.stockOutDocNo ?? '';
    const dedupeKey = `${t.parentTransferId}|${sharedDocNo || t.id}|${isOriginSide ? 'O' : 'F'}`;
    if (seenForward.has(dedupeKey)) continue;
    seenForward.add(dedupeKey);
    const siblings = sharedDocNo
      ? transfers.filter(x => x.parentTransferId === t.parentTransferId
          && (x.dispatches || []).some((d: any) => (d.payload as any)?.stockOutDocNo === sharedDocNo))
      : [t];
    const qty = siblings.reduce((s: number, tt: any) => {
      return s + (tt.dispatches || []).reduce((ss: number, d: any) => {
        return ss + sumItemsQty((d.payload as any)?.items);
      }, 0);
    }, 0);
    const partner = isOriginSide
      ? (parent?.receiverTenantName || '')
      : (t.receiverTenantName || '');
    const statusText = forwardFlowDocStatusLabel(t.originConfirmedAt ?? null);
    const warehouseId = (firstD?.payload as any)?.warehouseId ?? null;
    rows.push({
      key: `forward|${dedupeKey}`,
      docType: 'forward',
      docNo: sharedDocNo || '',
      timestamp: toIsoString(firstD?.createdAt ?? t.createdAt),
      partner,
      productName: t.senderProductName || '',
      productSku: t.senderProductSku || '',
      productId: t.senderProductId || null,
      totalQty: qty,
      warehouseId,
      status: statusText,
      statusWarn: !t.originConfirmedAt,
    });
  }

  rows.sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return a.key.localeCompare(b.key);
  });
  return rows;
}

const CollabReturnFlowPanel: React.FC<CollabReturnFlowPanelProps> = ({
  onBack,
  embeddedInModal = false,
  transfers,
  myTenantId,
  prodRecords,
  products,
  warehouses,
  dictionaries,
  onRefreshProdRecords,
}) => {
  const [filterDocNo, setFilterDocNo] = useState('');
  const [filterProduct, setFilterProduct] = useState('');
  const [filterPartner, setFilterPartner] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [filterDocType, setFilterDocType] = useState<'all' | CollabFlowDocType>('all');
  const [page, setPage] = useState(1);
  const [detailDocNo, setDetailDocNo] = useState<string | null>(null);

  const allRows = useMemo(() => buildFlowRows(transfers, myTenantId), [transfers, myTenantId]);

  const usedWarehouseIds = useMemo(() => {
    const ids = new Set<string>();
    allRows.forEach(r => { if (r.warehouseId) ids.add(r.warehouseId); });
    return ids;
  }, [allRows]);

  const filtered = useMemo(() => {
    let list = allRows;
    if (filterDocType !== 'all') list = list.filter(r => r.docType === filterDocType);
    if (filterDocNo.trim()) {
      const kw = filterDocNo.trim().toLowerCase();
      list = list.filter(r => r.docNo.toLowerCase().includes(kw));
    }
    if (filterProduct.trim()) {
      const kw = filterProduct.trim().toLowerCase();
      list = list.filter(r => r.productName.toLowerCase().includes(kw) || r.productSku.toLowerCase().includes(kw));
    }
    if (filterPartner.trim()) {
      const kw = filterPartner.trim().toLowerCase();
      list = list.filter(r => (r.partner || '').toLowerCase().includes(kw));
    }
    if (filterDateFrom) {
      list = list.filter(r => {
        const d = r.timestamp ? toLocalDateYmd(r.timestamp) : '';
        return d >= filterDateFrom;
      });
    }
    if (filterDateTo) {
      list = list.filter(r => {
        const d = r.timestamp ? toLocalDateYmd(r.timestamp) : '';
        return d <= filterDateTo;
      });
    }
    if (filterWarehouse) list = list.filter(r => r.warehouseId === filterWarehouse);
    return list;
  }, [allRows, filterDocType, filterDocNo, filterProduct, filterPartner, filterDateFrom, filterDateTo, filterWarehouse]);

  const totalQty = filtered.reduce((s, r) => s + r.totalQty, 0);
  const uniqueDocNos = useMemo(() => new Set(filtered.map(r => r.docNo).filter(Boolean)), [filtered]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const showPager = totalPages > 1;
  const embeddedFooter = embeddedInModal && (showPager || allRows.length > 0);

  return (
    <div className={`w-full min-w-0 ${embeddedInModal ? 'space-y-0' : 'space-y-4 animate-in slide-in-from-bottom-4'}`}>
      {!embeddedInModal && (
        <div className="flex items-center justify-between">
          <button type="button" onClick={onBack} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
            <ArrowLeft className="w-4 h-4" /> 返回列表
          </button>
        </div>
      )}

      <div className={`bg-white border border-slate-200 shadow-sm overflow-hidden ${embeddedInModal ? 'rounded-xl' : 'rounded-2xl'}`}>
        {!embeddedInModal && (
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Truck className="w-5 h-5 text-emerald-600" /> 协作流水
            </h3>
            <span className="text-xs text-slate-400">
              共 {filtered.length} 行 · {uniqueDocNos.size} 张单据 · 合计 {totalQty}
            </span>
          </div>
        )}

        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2 mb-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">日期起</label>
              <input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setPage(1); }} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">日期止</label>
              <input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setPage(1); }} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">单据类型</label>
              <select value={filterDocType} onChange={e => { setFilterDocType(e.target.value as 'all' | CollabFlowDocType); setPage(1); }} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white">
                <option value="all">全部</option>
                <option value="dispatch">派发</option>
                <option value="return">回传</option>
                <option value="forward">转发</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">单据号</label>
              <input type="text" value={filterDocNo} onChange={e => { setFilterDocNo(e.target.value); setPage(1); }} placeholder="单号模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">产品</label>
              <input type="text" value={filterProduct} onChange={e => { setFilterProduct(e.target.value); setPage(1); }} placeholder="产品名/SKU 模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">合作单位</label>
              <input type="text" value={filterPartner} onChange={e => { setFilterPartner(e.target.value); setPage(1); }} placeholder="名称模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">仓库</label>
              <select value={filterWarehouse} onChange={e => { setFilterWarehouse(e.target.value); setPage(1); }} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white">
                <option value="">全部</option>
                {warehouses.filter(w => usedWarehouseIds.has(w.id)).map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-2">
            <button type="button" onClick={() => { setFilterDocNo(''); setFilterProduct(''); setFilterPartner(''); setFilterDateFrom(''); setFilterDateTo(''); setFilterWarehouse(''); setFilterDocType('all'); setPage(1); }} className="text-xs font-bold text-slate-500 hover:text-slate-700">
              清空筛选
            </button>
          </div>
        </div>

        <div className={`overflow-auto ${embeddedInModal ? 'max-h-[min(55vh,calc(90vh-22rem))]' : 'max-h-[55vh]'}`}>
          {pagedRows.length === 0 ? (
            <div className="px-6 py-16 text-center text-slate-400 text-sm space-y-2 max-w-lg mx-auto">
              {allRows.length === 0 ? (
                <>
                  <p className="font-bold text-slate-600">暂无协作流水记录</p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    此处汇总本企业参与的所有协作单据：派发、回传、转发。若尚未产生任何协作单据，列表会为空，属正常情况。
                  </p>
                </>
              ) : (
                '无匹配项，请调整筛选条件'
              )}
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单据号</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">业务时间</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">合作单位</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单据类型</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">产品</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">状态</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">合计数量</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">出库仓库</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap w-24">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedRows.map(row => {
                  const localProduct = row.productId ? products.find(p => p.id === row.productId) : null;
                  const displayName = localProduct?.name ?? row.productName ?? '—';
                  const displaySku = localProduct?.sku ?? row.productSku ?? '';
                  const wh = row.warehouseId ? warehouses.find(w => w.id === row.warehouseId) : null;
                  const typeBadge = row.docType === 'dispatch'
                    ? <span className="inline-flex rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-black text-indigo-700 ring-1 ring-indigo-100">派发</span>
                    : row.docType === 'forward'
                      ? <span className="inline-flex rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-800 ring-1 ring-amber-100">转发</span>
                      : <span className="inline-flex rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-100">回传</span>;
                  return (
                    <tr key={row.key} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-[10px] font-mono font-bold text-slate-600 whitespace-nowrap">{row.docNo || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">{row.timestamp ? new Date(row.timestamp).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      <td className="px-4 py-3 text-xs font-bold text-teal-700 whitespace-nowrap">{row.partner || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{typeBadge}</td>
                      <td className="px-4 py-3 font-bold text-slate-800">{displayName}<span className="ml-1 text-xs text-slate-400">{displaySku}</span></td>
                      <td className="px-4 py-3 text-xs font-bold whitespace-nowrap">
                        <span className={row.statusWarn ? 'text-amber-700' : 'text-slate-600'}>{row.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-black text-indigo-600">{row.totalQty}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{wh?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        {row.docType === 'return' && row.docNo ? (
                          <button
                            type="button"
                            onClick={() => setDetailDocNo(row.docNo)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-emerald-100 text-emerald-600 bg-white hover:bg-emerald-50 transition-all whitespace-nowrap shrink-0"
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
          )}
        </div>

        {embeddedFooter ? (
          <div className={`px-4 py-3 sm:px-6 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-2 ${showPager ? 'justify-between' : 'justify-end'}`}>
            <span className="text-xs text-slate-500 tabular-nums shrink-0 min-w-0">
              共 {filtered.length} 行 · {uniqueDocNos.size} 张单据 · 合计 {totalQty}
            </span>
            {showPager ? (
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 text-sm font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40">上一页</button>
                <span className="text-xs text-slate-500 tabular-nums">{page} / {totalPages}</span>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-sm font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40">下一页</button>
              </div>
            ) : null}
          </div>
        ) : showPager ? (
          <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-center gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 text-sm font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40">上一页</button>
            <span className="text-xs text-slate-500">{page} / {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-sm font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40">下一页</button>
          </div>
        ) : null}
      </div>

      {detailDocNo && (
        <CollabReturnFlowDocDetailModal
          docNo={detailDocNo}
          records={prodRecords}
          products={products}
          warehouses={warehouses}
          dictionaries={dictionaries}
          onClose={() => setDetailDocNo(null)}
          onRefreshRecords={onRefreshProdRecords}
        />
      )}
    </div>
  );
};

export default React.memo(CollabReturnFlowPanel);
