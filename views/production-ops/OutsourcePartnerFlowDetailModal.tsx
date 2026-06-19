import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Filter, X } from 'lucide-react';
import type {
  AppDictionaries,
  OutsourceFormSettings,
  Product,
  ProductCategory,
  ProductionOpRecord,
  ProductionOrder,
} from '../../types';
import { DEFAULT_OUTSOURCE_FORM_SETTINGS } from '../../types';
import OutsourcePartnerFlowDetailTable from './OutsourcePartnerFlowDetailTable';
import { flowRecordsEarliestMs } from '../../utils/flowDocSort';
import {
  type PartnerFlowDetailSeed,
  buildPartnerFlowDocRows,
  computeDispatchReceiveRemaining,
  filterPartnerNodeOutsourceRecords,
  orderedVariantColumnIds,
  type PartnerFlowDocRow,
} from '../../utils/outsourcePartnerFlowDetail';

export type { PartnerFlowDetailSeed };

export interface OutsourcePartnerFlowDetailModalProps {
  open: boolean;
  seed: PartnerFlowDetailSeed | null;
  onClose: () => void;
  records: ProductionOpRecord[];
  products: Product[];
  orders: ProductionOrder[];
  categories: ProductCategory[];
  dictionaries?: AppDictionaries;
  outsourceFormSettings?: OutsourceFormSettings;
  /** 流水弹窗层级（嵌套在其它弹窗内时可传 z-[90]） */
  overlayZIndexClass?: string;
}

type DetailDocTypeFilter = 'all' | 'dispatch' | 'receive';

function startOfLocalDayMs(ymd: string): number {
  const p = ymd.trim().split('-').map(Number);
  if (p.length !== 3 || p.some(n => !Number.isFinite(n))) return Number.NaN;
  return new Date(p[0], p[1] - 1, p[2], 0, 0, 0, 0).getTime();
}

function endOfLocalDayMs(ymd: string): number {
  const p = ymd.trim().split('-').map(Number);
  if (p.length !== 3 || p.some(n => !Number.isFinite(n))) return Number.NaN;
  return new Date(p[0], p[1] - 1, p[2], 23, 59, 59, 999).getTime();
}

function rowDocTimeMs(row: PartnerFlowDocRow): number {
  return flowRecordsEarliestMs(row.records);
}

function rowMatchesDetailFilters(
  row: PartnerFlowDocRow,
  dateFrom: string,
  dateTo: string,
  docType: DetailDocTypeFilter,
): boolean {
  const t = rowDocTimeMs(row);
  const fromTrim = dateFrom.trim();
  if (fromTrim) {
    const s = startOfLocalDayMs(fromTrim);
    if (!Number.isNaN(s) && t > 0 && t < s) return false;
  }
  const toTrim = dateTo.trim();
  if (toTrim) {
    const e = endOfLocalDayMs(toTrim);
    if (!Number.isNaN(e) && t > 0 && t > e) return false;
  }
  if (docType === 'all') return true;
  const lab = row.typeLabel;
  if (docType === 'dispatch') return lab === '外协发出';
  if (docType === 'receive') return lab === '外协收回';
  return true;
}

const OutsourcePartnerFlowDetailModal: React.FC<OutsourcePartnerFlowDetailModalProps> = ({
  open,
  seed,
  onClose,
  records,
  products,
  orders,
  categories,
  dictionaries,
  outsourceFormSettings = DEFAULT_OUTSOURCE_FORM_SETTINGS,
  overlayZIndexClass = 'z-[85]',
}) => {
  const [detailDateFrom, setDetailDateFrom] = useState('');
  const [detailDateTo, setDetailDateTo] = useState('');
  const [detailDocType, setDetailDocType] = useState<DetailDocTypeFilter>('all');

  const seedKey = useMemo(
    () =>
      open && seed
        ? `${seed.productId}|${seed.nodeId}|${seed.partner}|${seed.orderId ?? ''}|${seed.productionLinkMode}`
        : '',
    [open, seed],
  );

  useEffect(() => {
    if (!open) {
      setDetailDateFrom('');
      setDetailDateTo('');
      setDetailDocType('all');
      return;
    }
    setDetailDateFrom('');
    setDetailDateTo('');
    setDetailDocType('all');
  }, [open, seedKey]);

  const { docRowsAll, variantColumnIds, showVariantCols } = useMemo(() => {
    if (!open || !seed) {
      return {
        docRowsAll: [] as PartnerFlowDocRow[],
        variantColumnIds: [] as string[],
        showVariantCols: false,
      };
    }
    const filtered = filterPartnerNodeOutsourceRecords(records, {
      productionLinkMode: seed.productionLinkMode,
      orderId: seed.productionLinkMode === 'product' ? undefined : seed.orderId,
      productId: seed.productId,
      partner: seed.partner,
      nodeId: seed.nodeId,
    });
    const rows = buildPartnerFlowDocRows(filtered, seed.productionLinkMode === 'product');
    const ord = seed.orderId ? orders.find(o => o.id === seed.orderId) : undefined;
    const prod = products.find(p => p.id === seed.productId);
    const cat = prod ? categories.find(c => c.id === prod.categoryId) : undefined;
    const agg = computeDispatchReceiveRemaining(filtered);
    const vids = orderedVariantColumnIds(prod, cat, ord, [
      ...rows.map(r => r.variantQty),
      agg.dispatchByVariant,
      agg.receiveByVariant,
      agg.remainingByVariant,
    ]);
    return {
      docRowsAll: rows,
      variantColumnIds: vids,
      showVariantCols: vids.length > 0,
    };
  }, [open, seed, records, products, orders, categories]);

  const docRowsFiltered = useMemo(
    () =>
      docRowsAll.filter(row =>
        rowMatchesDetailFilters(row, detailDateFrom, detailDateTo, detailDocType),
      ),
    [docRowsAll, detailDateFrom, detailDateTo, detailDocType],
  );

  const filteredAgg = useMemo(() => {
    const recs = docRowsFiltered.flatMap(r => r.records);
    return computeDispatchReceiveRemaining(recs);
  }, [docRowsFiltered]);

  if (!open || !seed) return null;

  const clearFilters = () => {
    setDetailDateFrom('');
    setDetailDateTo('');
    setDetailDocType('all');
  };

  return (
    <div className={`fixed inset-0 ${overlayZIndexClass} flex items-center justify-center p-4`}>
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div
        className="relative flex w-full max-w-6xl max-h-[90vh] flex-col overflow-hidden rounded-[32px] bg-white shadow-2xl animate-in zoom-in-95"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 pt-3 pb-2.5">
          <div className="min-w-0 pr-2">
            <h3 className="flex items-center gap-2 text-base font-bold leading-tight text-slate-800">
              <FileText className="h-5 w-5 shrink-0 text-indigo-600" />
              加工厂往来数量明细
            </h3>
            <p className="mt-1 truncate text-base font-bold text-slate-600">
              {seed.nodeName} · {seed.partner}
            </p>
            <p className="mt-0.5 truncate text-sm font-semibold text-slate-500">
              {seed.productName}
              {seed.productionLinkMode !== 'product' && seed.orderNumber ? ` · 工单 ${seed.orderNumber}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 -mt-0.5 shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="shrink-0 border-b border-slate-100 bg-slate-50/50 px-4 py-2">
          <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
            <div className="flex shrink-0 items-center gap-1.5 self-end pb-1 text-slate-500">
              <Filter className="h-3.5 w-3.5 shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-wide">筛选</span>
            </div>
            <div className="w-[9.25rem] shrink-0">
              <label className="mb-0.5 block text-[10px] font-bold text-slate-400">开始时间</label>
              <input
                type="date"
                value={detailDateFrom}
                onChange={e => setDetailDateFrom(e.target.value)}
                className="box-border w-full max-w-full rounded-lg border border-slate-200 py-1.5 px-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div className="w-[9.25rem] shrink-0">
              <label className="mb-0.5 block text-[10px] font-bold text-slate-400">结束时间</label>
              <input
                type="date"
                value={detailDateTo}
                onChange={e => setDetailDateTo(e.target.value)}
                className="box-border w-full max-w-full rounded-lg border border-slate-200 py-1.5 px-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div className="w-[10.5rem] shrink-0 sm:w-[11.5rem]">
              <label className="mb-0.5 block text-[10px] font-bold text-slate-400">单据类型</label>
              <select
                value={detailDocType}
                onChange={e => setDetailDocType(e.target.value as DetailDocTypeFilter)}
                className="box-border w-full max-w-full rounded-lg border border-slate-200 py-1.5 px-1.5 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="all">全部</option>
                <option value="dispatch">外协发出</option>
                <option value="receive">外协收回</option>
              </select>
            </div>
            <button
              type="button"
              onClick={clearFilters}
              className="shrink-0 pb-1.5 text-xs font-bold text-slate-500 hover:text-slate-700"
            >
              清空筛选
            </button>
            <span className="shrink-0 pb-1.5 text-xs text-slate-400">共 {docRowsFiltered.length} 单</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 pb-3 pt-2">
          <OutsourcePartnerFlowDetailTable
            hasAnyDoc={docRowsAll.length > 0}
            productId={seed.productId}
            products={products}
            dictionaries={dictionaries}
            showDeliveryDateColumn={outsourceFormSettings.showOutsourceDispatchDeliveryDate === true}
            docRows={docRowsFiltered}
            variantColumnIds={variantColumnIds}
            showVariantCols={showVariantCols}
            dispatchTotal={filteredAgg.dispatchTotal}
            dispatchByVariant={filteredAgg.dispatchByVariant}
            receiveTotal={filteredAgg.receiveTotal}
            receiveByVariant={filteredAgg.receiveByVariant}
            remainingTotal={filteredAgg.remainingTotal}
            remainingByVariant={filteredAgg.remainingByVariant}
          />
        </div>
      </div>
    </div>
  );
};

export default React.memo(OutsourcePartnerFlowDetailModal);
