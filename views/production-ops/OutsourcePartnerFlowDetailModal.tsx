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
import AddTodoButton from '../../components/AddTodoButton';
import FlowListTableShell from '../../components/flow/FlowListTableShell';
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

  return (
    <div className={`fixed inset-0 ${overlayZIndexClass} flex items-center justify-center p-4`}>
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div
        className="relative flex w-full max-w-6xl max-h-[90vh] flex-col overflow-hidden rounded-[32px] bg-white shadow-2xl animate-in zoom-in-95"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 font-bold text-slate-800">
              <FileText className="h-5 w-5 shrink-0 text-indigo-600" />
              加工厂往来数量明细
            </h3>
            <p className="mt-1.5 flex items-center gap-x-2 truncate text-sm font-semibold text-slate-600">
              <span className="truncate">{seed.nodeName}</span>
              <span className="text-slate-300">·</span>
              <span className="truncate">{seed.partner}</span>
              <span className="text-slate-300">·</span>
              <span className="truncate font-medium text-slate-400">
                {seed.productName}
                {seed.productionLinkMode !== 'product' && seed.orderNumber ? ` · 工单 ${seed.orderNumber}` : ''}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <AddTodoButton
              seed={{
                sourceType: 'outsource',
                sourceId: seed.orderId ?? seed.productId ?? null,
                sourceDocNo: '外协管理',
                sourceTitle: `${seed.partner} · ${seed.nodeName} · ${seed.productName}`,
                href: `/production?tab=OUTSOURCE&outsourceFlow=${encodeURIComponent(JSON.stringify(seed))}`,
              }}
            />
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              aria-label="关闭"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 筛选条 */}
        <div className="shrink-0 border-b border-slate-100 bg-slate-50/50 px-6 py-4">
          <div className="mb-3 flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-500" />
            <span className="text-xs font-bold uppercase text-slate-500">筛选</span>
            <span className="ml-auto text-xs font-bold text-slate-400">共 {docRowsFiltered.length} 单</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[10px] font-bold text-slate-400">日期起</label>
              <input
                type="date"
                value={detailDateFrom}
                onChange={e => setDetailDateFrom(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold text-slate-400">日期止</label>
              <input
                type="date"
                value={detailDateTo}
                onChange={e => setDetailDateTo(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold text-slate-400">单据类型</label>
              <select
                value={detailDocType}
                onChange={e => setDetailDocType(e.target.value as DetailDocTypeFilter)}
                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="all">全部</option>
                <option value="dispatch">外协发出</option>
                <option value="receive">外协收回</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col p-4">
          {docRowsAll.length === 0 ? (
            <p className="py-12 text-center text-slate-500">暂无往来数量明细</p>
          ) : (
            <FlowListTableShell className="flex-1 min-h-0" footer={null}>
              <OutsourcePartnerFlowDetailTable
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
            </FlowListTableShell>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(OutsourcePartnerFlowDetailModal);
