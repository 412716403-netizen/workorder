import React, { useState, useMemo } from 'react';
import { ArrowLeft, ScrollText, Filter, Truck, X, FileText } from 'lucide-react';
import type { ProductionOpRecord, Product, Warehouse, AppDictionaries } from '../../types';
import { returnFlowDocStatusLabel, type ReturnDocMeta } from './collabHelpers';
import CollabReturnFlowDocDetailModal from './CollabReturnFlowDocDetailModal';
import { toLocalDateYmd } from '../../utils/localDateTime';
import { flowRecordsEarliestMs } from '../../utils/flowDocSort';

interface CollabReturnFlowPanelProps {
  onBack: () => void;
  /** 嵌入弹窗时隐藏「返回列表」与主标题，由外层提供标题栏 */
  embeddedInModal?: boolean;
  /** 单据号 → 协作回传状态（由协作收件箱 listTransfers 汇总） */
  returnDocMetaByDocNo?: Map<string, ReturnDocMeta>;
  prodRecords: ProductionOpRecord[];
  products: Product[];
  warehouses: Warehouse[];
  dictionaries: AppDictionaries;
  onRefreshProdRecords?: () => Promise<void>;
}

const COLLAB_RETURN_OPERATOR = '协作回传出库';
const PAGE_SIZE = 30;

const CollabReturnFlowPanel: React.FC<CollabReturnFlowPanelProps> = ({
  onBack,
  embeddedInModal = false,
  returnDocMetaByDocNo,
  prodRecords,
  products,
  warehouses,
  dictionaries,
  onRefreshProdRecords,
}) => {
  const [filterDocNo, setFilterDocNo] = useState('');
  const [filterProduct, setFilterProduct] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [page, setPage] = useState(1);
  const [detailDocNo, setDetailDocNo] = useState<string | null>(null);

  const returnFlowRecords = useMemo(() => {
    const list = prodRecords.filter(r => r.type === 'STOCK_OUT' && r.operator === COLLAB_RETURN_OPERATOR);
    const byDoc = new Map<string, ProductionOpRecord[]>();
    for (const r of list) {
      const k = (r.docNo && String(r.docNo).trim()) ? String(r.docNo) : r.id;
      if (!byDoc.has(k)) byDoc.set(k, []);
      byDoc.get(k)!.push(r);
    }
    const entries = [...byDoc.entries()].sort(([ka, ra], [kb, rb]) => {
      const da = flowRecordsEarliestMs(ra);
      const db = flowRecordsEarliestMs(rb);
      if (db !== da) return db - da;
      return ka.localeCompare(kb);
    });
    return entries.flatMap(([, rs]) => [...rs].sort((a, b) => (a.id || '').localeCompare(b.id || '')));
  }, [prodRecords]);

  const usedWarehouseIds = useMemo(() => {
    const ids = new Set<string>();
    returnFlowRecords.forEach(r => { if (r.warehouseId) ids.add(r.warehouseId); });
    return ids;
  }, [returnFlowRecords]);

  const filtered = useMemo(() => {
    let list = returnFlowRecords;
    if (filterDocNo.trim()) {
      const kw = filterDocNo.trim().toLowerCase();
      list = list.filter(r => (r.docNo ?? '').toLowerCase().includes(kw));
    }
    if (filterProduct.trim()) {
      const kw = filterProduct.trim().toLowerCase();
      list = list.filter(r => {
        const p = products.find(x => x.id === r.productId);
        return (p?.name ?? '').toLowerCase().includes(kw) || (p?.sku ?? '').toLowerCase().includes(kw);
      });
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
    if (filterWarehouse) {
      list = list.filter(r => r.warehouseId === filterWarehouse);
    }
    return list;
  }, [returnFlowRecords, filterDocNo, filterProduct, filterDateFrom, filterDateTo, filterWarehouse, products]);

  const totalQty = filtered.reduce((s, r) => s + r.quantity, 0);

  type MergedRow = {
    key: string;
    docNo: string;
    productId: string;
    timestamp: string;
    warehouseId?: string;
    partner?: string;
    totalQty: number;
    earliestMs: number;
  };

  const mergedRows = useMemo(() => {
    const map = new Map<string, { docNo: string; productId: string; records: ProductionOpRecord[]; warehouseId?: string; partner?: string; totalQty: number; variantQty: Map<string, number> }>();
    for (const r of filtered) {
      const k = `${r.docNo ?? ''}|${r.productId}`;
      const existing = map.get(k);
      if (existing) {
        existing.records.push(r);
        existing.totalQty += r.quantity;
        const vid = r.variantId ?? '';
        existing.variantQty.set(vid, (existing.variantQty.get(vid) ?? 0) + r.quantity);
      } else {
        const vq = new Map<string, number>();
        vq.set(r.variantId ?? '', r.quantity);
        map.set(k, {
          docNo: r.docNo ?? '',
          productId: r.productId,
          records: [r],
          warehouseId: r.warehouseId,
          partner: r.partner,
          totalQty: r.quantity,
          variantQty: vq,
        });
      }
    }
    const rows: MergedRow[] = [];
    for (const [key, g] of map.entries()) {
      const tsMs = flowRecordsEarliestMs(g.records);
      const firstRec = g.records[0];
      const tsStr = g.records.reduce((best, cur) => {
        const tb = new Date(best.timestamp).getTime();
        const tc = new Date(cur.timestamp).getTime();
        if (Number.isNaN(tc)) return best;
        if (Number.isNaN(tb)) return cur.timestamp;
        return tc < tb ? cur.timestamp : best;
      }, firstRec.timestamp);
      rows.push({
        key,
        docNo: g.docNo,
        productId: g.productId,
        timestamp: tsStr,
        warehouseId: g.warehouseId,
        partner: g.partner,
        totalQty: g.totalQty,
        earliestMs: tsMs,
      });
    }
    rows.sort((a, b) => {
      if (b.earliestMs !== a.earliestMs) return b.earliestMs - a.earliestMs;
      return a.key.localeCompare(b.key);
    });
    return rows;
  }, [filtered]);

  const uniqueDocNos = useMemo(() => new Set(mergedRows.map(r => r.docNo)), [mergedRows]);
  const totalPages = Math.max(1, Math.ceil(mergedRows.length / PAGE_SIZE));
  const pagedRows = mergedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
        {embeddedInModal ? (
          <div className="px-4 py-2 sm:px-6 border-b border-slate-100 flex flex-wrap items-center justify-end gap-2 text-xs text-slate-500">
            <span>
              共 {mergedRows.length} 行 · {uniqueDocNos.size} 张单据 · 合计 {totalQty}
            </span>
          </div>
        ) : (
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Truck className="w-5 h-5 text-emerald-600" /> 回传流水
            </h3>
            <span className="text-xs text-slate-400">
              共 {mergedRows.length} 行 · {uniqueDocNos.size} 张单据 · 合计 {totalQty}
            </span>
          </div>
        )}

        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2 mb-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-500 uppercase">筛选</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">日期起</label>
              <input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setPage(1); }} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">日期止</label>
              <input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setPage(1); }} className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">单据号</label>
              <input type="text" value={filterDocNo} onChange={e => { setFilterDocNo(e.target.value); setPage(1); }} placeholder="HC 单号模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">产品</label>
              <input type="text" value={filterProduct} onChange={e => { setFilterProduct(e.target.value); setPage(1); }} placeholder="产品名/SKU 模糊搜索" className="w-full text-sm py-1.5 px-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
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
            <button type="button" onClick={() => { setFilterDocNo(''); setFilterProduct(''); setFilterDateFrom(''); setFilterDateTo(''); setFilterWarehouse(''); setPage(1); }} className="text-xs font-bold text-slate-500 hover:text-slate-700">
              清空筛选
            </button>
          </div>
        </div>

        <div className={`overflow-auto ${embeddedInModal ? 'max-h-[min(55vh,calc(90vh-22rem))]' : 'max-h-[55vh]'}`}>
          {pagedRows.length === 0 ? (
            <div className="px-6 py-16 text-center text-slate-400 text-sm">
              {returnFlowRecords.length === 0 ? '暂无回传出库记录' : '无匹配项，请调整筛选条件'}
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">单据号</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">业务时间</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">合作单位</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">产品</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">状态</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap">合计数量</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">出库仓库</th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right whitespace-nowrap w-24">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedRows.map(row => {
                  const product = products.find(p => p.id === row.productId);
                  const wh = row.warehouseId ? warehouses.find(w => w.id === row.warehouseId) : null;
                  const statusText = returnFlowDocStatusLabel(row.docNo ? returnDocMetaByDocNo?.get(row.docNo) : undefined);
                  const statusWarn = statusText === '待甲方确认';
                  return (
                    <tr key={row.key} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-[10px] font-mono font-bold text-slate-600 whitespace-nowrap">{row.docNo || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">{row.timestamp ? new Date(row.timestamp).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      <td className="px-4 py-3 text-xs font-bold text-teal-700 whitespace-nowrap">{row.partner ?? '—'}</td>
                      <td className="px-4 py-3 font-bold text-slate-800">{product?.name ?? '—'}<span className="ml-1 text-xs text-slate-400">{product?.sku ?? ''}</span></td>
                      <td className="px-4 py-3 text-xs font-bold whitespace-nowrap">
                        <span className={statusWarn ? 'text-amber-700' : 'text-slate-600'}>{statusText}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-black text-indigo-600">{row.totalQty}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{wh?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        {row.docNo && (
                          <button
                            type="button"
                            onClick={() => setDetailDocNo(row.docNo)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black rounded-xl border border-emerald-100 text-emerald-600 bg-white hover:bg-emerald-50 transition-all whitespace-nowrap shrink-0"
                          >
                            <FileText className="w-3.5 h-3.5" /> 详情
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-center gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 text-sm font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40">上一页</button>
            <span className="text-xs text-slate-500">{page} / {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-sm font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40">下一页</button>
          </div>
        )}
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
