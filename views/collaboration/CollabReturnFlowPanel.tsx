import React, { useState, useMemo } from 'react';
import { ArrowLeft, Filter, Truck, FileText } from 'lucide-react';
import type { Partner, Product, ProductCategory, Warehouse, AppDictionaries } from '../../types';
import {
  returnFlowDocStatusLabel,
  dispatchFlowDocStatusLabel,
  forwardFlowDocStatusLabel,
} from './collabHelpers';
import CollabDocDetailModal from './CollabDocDetailModal';
import CollabForwardDetailModal from './CollabForwardDetailModal';
import { localTodayYmd, toLocalDateYmd } from '../../utils/localDateTime';
import FlowListSummaryFooter from '../../components/flow/FlowListSummaryFooter';
import FlowListProductCell from '../../components/flow/FlowListProductCell';
import FlowListTableShell from '../../components/flow/FlowListTableShell';

export type CollabFlowDocType = 'dispatch' | 'return' | 'forward';

interface CollabReturnFlowPanelProps {
  onBack: () => void;
  /** 嵌入弹窗时隐藏「返回列表」与主标题，由外层提供标题栏 */
  embeddedInModal?: boolean;
  /** 协作转运单列表（已由 listTransfers 按本租户可见性过滤） */
  transfers: any[];
  /** 当前本企业 tenantId，用于区分甲方/乙方/转发方视角 */
  myTenantId: string | null;
  products: Product[];
  partners: Partner[];
  categories?: ProductCategory[];
  warehouses: Warehouse[];
  dictionaries: AppDictionaries;
  onRefreshList?: () => Promise<void>;
  onRefreshProdRecords?: () => Promise<void>;
  onRefreshOrders?: () => Promise<void> | void;
  onRefreshPMP?: () => Promise<void> | void;
  onRefreshProducts?: () => Promise<void> | void;
}

type FlowRowDetail =
  | { kind: 'dispatch'; transfer: any; doc: any }
  | { kind: 'return'; transfer: any; doc: any }
  | { kind: 'forward'; siblings: any[] };

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
  status: string;
  statusWarn: boolean;
  detail: FlowRowDetail;
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

    for (const d of (t.dispatches || [])) {
      const payload = (d.payload ?? {}) as any;
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
          partner = parent?.receiverTenantName || t.senderTenantName || '';
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
        status: statusText,
        statusWarn: d.status === 'PENDING' || d.status === 'WITHDRAWN',
        detail: { kind: 'dispatch', transfer: t, doc: d },
      });
    }

    for (const r of (t.returns || [])) {
      const payload = (r.payload ?? {}) as any;
      const docNo: string = payload?.stockOutDocNo ?? '';
      if (!docNo) continue;
      const qty = sumItemsQty(payload?.items);
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
        status: statusText,
        statusWarn: statusText === '待甲方确认',
        detail: { kind: 'return', transfer: t, doc: r },
      });
    }
  }

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
      status: statusText,
      statusWarn: !t.originConfirmedAt,
      detail: { kind: 'forward', siblings },
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
  products,
  partners,
  categories,
  warehouses,
  dictionaries,
  onRefreshList,
  onRefreshProdRecords,
  onRefreshOrders,
  onRefreshPMP,
  onRefreshProducts,
}) => {
  const todayDate = useMemo(() => localTodayYmd(), []);
  const [filterDocNo, setFilterDocNo] = useState('');
  const [filterProduct, setFilterProduct] = useState('');
  const [filterPartner, setFilterPartner] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState(todayDate);
  const [filterDateTo, setFilterDateTo] = useState(todayDate);
  const [filterDocType, setFilterDocType] = useState<'all' | CollabFlowDocType>('all');
  const [docDetail, setDocDetail] = useState<{ kind: 'dispatch' | 'return'; doc: any; transfer: any } | null>(null);
  const [forwardDetailSiblings, setForwardDetailSiblings] = useState<any[] | null>(null);

  const handleOpenDetail = (detail: FlowRowDetail) => {
    if (detail.kind === 'forward') {
      setForwardDetailSiblings(detail.siblings);
      return;
    }
    setDocDetail({ kind: detail.kind, doc: detail.doc, transfer: detail.transfer });
  };

  const handleDetailDone = async () => {
    await Promise.all(
      [onRefreshList?.(), onRefreshProdRecords?.(), onRefreshOrders?.(), onRefreshPMP?.()].filter(Boolean) as Promise<void>[],
    );
  };

  const allRows = useMemo(() => buildFlowRows(transfers, myTenantId), [transfers, myTenantId]);

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
    return list;
  }, [allRows, filterDocType, filterDocNo, filterProduct, filterPartner, filterDateFrom, filterDateTo]);

  /** 与外协流水一致：发出（派发+转发）/ 收回（回传）/ 剩余 */
  const { collabFlowTotalDispatch, collabFlowTotalReceive, collabFlowRemaining } = useMemo(() => {
    let dispatch = 0;
    let receive = 0;
    filtered.forEach(row => {
      if (row.docType === 'dispatch' || row.docType === 'forward') dispatch += row.totalQty;
      else if (row.docType === 'return') receive += row.totalQty;
    });
    return {
      collabFlowTotalDispatch: dispatch,
      collabFlowTotalReceive: receive,
      collabFlowRemaining: Math.max(0, dispatch - receive),
    };
  }, [filtered]);

  const filterSection = (
    <div className={`border-b border-slate-100 bg-slate-50/50 shrink-0 ${embeddedInModal ? 'px-6 py-4' : 'px-6 py-4'}`}>
      <div className="flex items-center gap-2 mb-3">
        <Filter className="w-4 h-4 text-slate-500" />
        <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
        <span className="text-[10px] text-slate-400">默认显示当天，扩大日期范围需手动改</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        <div>
          <label className="text-[10px] font-bold text-slate-400 block mb-1">日期起</label>
          <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 block mb-1">日期止</label>
          <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 block mb-1">单据类型</label>
          <select value={filterDocType} onChange={e => setFilterDocType(e.target.value as 'all' | CollabFlowDocType)} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 bg-white">
            <option value="all">全部</option>
            <option value="dispatch">派发</option>
            <option value="return">回传</option>
            <option value="forward">转发</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 block mb-1">单据号</label>
          <input type="text" value={filterDocNo} onChange={e => setFilterDocNo(e.target.value)} placeholder="单号模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 block mb-1">产品</label>
          <input type="text" value={filterProduct} onChange={e => setFilterProduct(e.target.value)} placeholder="产品名/SKU 模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 block mb-1">合作单位</label>
          <input type="text" value={filterPartner} onChange={e => setFilterPartner(e.target.value)} placeholder="名称模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
      </div>
    </div>
  );

  const listSection = (
    <div className="flex-1 min-h-0 flex flex-col p-4">
      {filtered.length === 0 ? (
        <div className="text-center text-slate-400 text-sm space-y-2 max-w-lg mx-auto py-12">
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
        <FlowListTableShell
          className="flex-1 min-h-0"
          footer={
            <FlowListSummaryFooter
              mode="bar"
              count={filtered.length}
              metrics={[
                { label: '发出', value: `${collabFlowTotalDispatch} 件`, className: 'text-indigo-600' },
                { label: '收回', value: `${collabFlowTotalReceive} 件`, className: 'text-amber-600' },
                { label: '剩余', value: `${collabFlowRemaining} 件`, className: 'text-slate-700' },
              ]}
            />
          }
        >
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单据号</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">业务时间</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">合作单位</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单据类型</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">产品</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">状态</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">数量</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap w-24">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(row => {
                const localProduct = row.productId ? products.find(p => p.id === row.productId) : null;
                const displayName = localProduct?.name ?? row.productName ?? '—';
                const displaySku = localProduct?.sku ?? row.productSku ?? '';
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
                    <td className="px-4 py-3">
                      <FlowListProductCell
                        product={localProduct}
                        name={displayName}
                        sku={displaySku}
                      />
                    </td>
                    <td className="px-4 py-3 text-xs font-bold whitespace-nowrap">
                      <span className={row.statusWarn ? 'text-amber-700' : 'text-slate-600'}>{row.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-black text-indigo-600">{row.totalQty}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenDetail(row.detail)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition-all whitespace-nowrap shrink-0"
                      >
                        <FileText className="w-3.5 h-3.5" /> 详情
                      </button>
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

  if (embeddedInModal) {
    return (
      <>
        <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
          {filterSection}
          {listSection}
        </div>
        {docDetail && (
          <CollabDocDetailModal
            open
            onClose={() => setDocDetail(null)}
            docKind={docDetail.kind}
            doc={docDetail.doc}
            transfer={docDetail.transfer}
            warehouses={warehouses}
            products={products}
            partners={partners}
            prodRecords={[]}
            dictionaries={dictionaries}
            categories={categories}
            onRefreshList={() => { void onRefreshList?.(); }}
            onRefreshOrders={onRefreshOrders}
            onRefreshProdRecords={onRefreshProdRecords}
            onRefreshPMP={onRefreshPMP}
            onRefreshProducts={onRefreshProducts}
          />
        )}
        {forwardDetailSiblings && forwardDetailSiblings.length > 0 && (
          <CollabForwardDetailModal
            key={forwardDetailSiblings.map(s => s.id).join('|')}
            open
            onClose={() => setForwardDetailSiblings(null)}
            siblings={forwardDetailSiblings}
            onDone={handleDetailDone}
          />
        )}
      </>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-4 animate-in slide-in-from-bottom-4">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
          <ArrowLeft className="w-4 h-4" /> 返回列表
        </button>
      </div>

      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden flex flex-col min-h-[480px]">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Truck className="w-5 h-5 text-emerald-600" /> 协作流水
          </h3>
        </div>
        {filterSection}
        {listSection}
      </div>

      {docDetail && (
        <CollabDocDetailModal
          open
          onClose={() => setDocDetail(null)}
          docKind={docDetail.kind}
          doc={docDetail.doc}
          transfer={docDetail.transfer}
          warehouses={warehouses}
          products={products}
          partners={partners}
          prodRecords={[]}
          dictionaries={dictionaries}
          categories={categories}
          onRefreshList={() => { void onRefreshList?.(); }}
          onRefreshOrders={onRefreshOrders}
          onRefreshProdRecords={onRefreshProdRecords}
          onRefreshPMP={onRefreshPMP}
          onRefreshProducts={onRefreshProducts}
        />
      )}
      {forwardDetailSiblings && forwardDetailSiblings.length > 0 && (
        <CollabForwardDetailModal
          key={forwardDetailSiblings.map(s => s.id).join('|')}
          open
          onClose={() => setForwardDetailSiblings(null)}
          siblings={forwardDetailSiblings}
          onDone={handleDetailDone}
        />
      )}
    </div>
  );
};

export default React.memo(CollabReturnFlowPanel);
