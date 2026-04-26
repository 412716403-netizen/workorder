import React, { useMemo } from 'react';
import { Clock, Package, User } from 'lucide-react';
import type { AppDictionaries, Product, ProductCategory, ProductVariant, PsiRecord, Warehouse } from '../../types';
import { PSI_PO_CUSTOM_DATA_SOURCE_PLAN_NUMBER } from '../../types';
import { formatPsiDocListTime } from '../../utils/flowDocSort';
import { aggregatePurchaseBillRelatedProductListText, formatPsiDocNumForList } from './psiOpsListFormatting';
import { getProductCategoryCustomFieldEntries } from '../../utils/reportCustomDocField';

type PsiDocType = 'PURCHASE_ORDER' | 'SALES_ORDER' | 'PURCHASE_BILL' | 'SALES_BILL';

export interface PsiDocDetailSummaryProps {
  docType: PsiDocType;
  docNumber: string;
  recordsList: PsiRecord[];
  productMapPSI: Map<string, Product>;
  categories: ProductCategory[];
  /** 采购订单详情：是否展示「关联产品」（与表单配置 `relatedProductEnabled` 一致） */
  showPurchaseOrderRelatedProduct?: boolean;
  /** 采购单详情：是否展示「关联产品」（与表单配置 `relatedProductEnabled` 一致） */
  showPurchaseBillRelatedProduct?: boolean;
  warehouseMapPSI?: Map<string, Warehouse>;
  dictionaries: AppDictionaries;
  getUnitName: (productId: string) => string;
  formatQtyDisplay: (q: number | string | undefined | null) => number;
  receivedByOrderLine?: Record<string, number>;
}

function readPsiLinePrice(i: PsiRecord, priceField: string): number {
  const v = priceField === 'purchasePrice' ? i.purchasePrice : i.salesPrice;
  return Number(v) || 0;
}

const DOC_META: Record<PsiDocType, { priceField: string; emptyMsg: string; priceLabel: string }> = {
  PURCHASE_ORDER: { priceField: 'purchasePrice', emptyMsg: '未找到该采购订单数据。', priceLabel: '采购价' },
  SALES_ORDER:    { priceField: 'salesPrice',    emptyMsg: '未找到该销售订单数据。', priceLabel: '销售价' },
  PURCHASE_BILL:  { priceField: 'purchasePrice', emptyMsg: '未找到该采购单数据。',   priceLabel: '采购价' },
  SALES_BILL:     { priceField: 'salesPrice',    emptyMsg: '未找到该销售单数据。',   priceLabel: '销售价' },
};

const isBill = (t: PsiDocType) => t === 'PURCHASE_BILL' || t === 'SALES_BILL';

function resolveVariantLabel(
  grp: PsiRecord[],
  product: Product | undefined,
  dictionaries: AppDictionaries,
): string {
  const parts = grp
    .filter((i) => i.variantId && product?.variants)
    .map((i) => {
      const v = product?.variants?.find((vv: ProductVariant) => vv.id === i.variantId);
      if (!v) return '';
      const c = dictionaries.colors.find(cc => cc.id === v.colorId)?.name ?? '';
      const sz = dictionaries.sizes.find(ss => ss.id === v.sizeId)?.name ?? '';
      return [c, sz].filter(Boolean).join(' / ');
    })
    .filter(Boolean);
  return parts.length > 1 ? `多规格 (${parts.join(', ')})` : parts[0] ?? '';
}

const ProductCell: React.FC<{
  name?: string;
  sku?: string;
  variantLabel: string;
  customTags?: Array<{ label: string; display: string }>;
}> = ({ name, sku, variantLabel, customTags }) => (
  <td className="py-2.5 px-3">
    <div className="flex items-start gap-2 min-w-0">
      <div className="w-7 h-7 shrink-0 bg-slate-50 rounded-lg flex items-center justify-center text-slate-300">
        <Package className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-bold text-slate-700">{name || '未知产品'}</span>
          {!!sku && (
            <span className="text-[9px] text-slate-300 font-bold uppercase tracking-tight">
              {sku}{variantLabel ? ` · ${variantLabel}` : ''}
            </span>
          )}
        </div>
        {!!customTags?.length && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {customTags.map((tag, idx) => (
              <span key={`${tag.label}-${idx}`} className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                {tag.label}: {tag.display}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  </td>
);

const PsiDocDetailSummary: React.FC<PsiDocDetailSummaryProps> = ({
  docType, docNumber, recordsList, productMapPSI, categories, showPurchaseOrderRelatedProduct, showPurchaseBillRelatedProduct,
  warehouseMapPSI,
  dictionaries, getUnitName, formatQtyDisplay, receivedByOrderLine,
}) => {
  const meta = DOC_META[docType];

  const docItems = useMemo(
    () => recordsList.filter((r) => r.type === docType && r.docNumber === docNumber),
    [recordsList, docNumber, docType],
  );

  const mainInfo = docItems[0];

  const totalQty = useMemo(
    () => docItems.reduce((s, i) => s + formatQtyDisplay(i.quantity), 0),
    [docItems, formatQtyDisplay],
  );

  const totalAmount = useMemo(
    () => docItems.reduce((s, i) => s + formatQtyDisplay(i.quantity) * readPsiLinePrice(i, meta.priceField), 0),
    [docItems, formatQtyDisplay, meta.priceField],
  );

  /** 采购入库 / 销售出库：任一行有批号即展示批次列 */
  const showBillBatchColumn =
    (docType === 'PURCHASE_BILL' || docType === 'SALES_BILL') &&
    docItems.some(i => String((i.batchNo ?? (i as { batch?: string }).batch) ?? '').trim().length > 0);

  const showPbLineRelatedColumn = docType === 'PURCHASE_BILL' && showPurchaseBillRelatedProduct === true;

  const rowGroups = useMemo(() => {
    const groups: Record<string, PsiRecord[]> = {};
    docItems.forEach((item) => {
      const gid = item.lineGroupId ?? item.id;
      if (!groups[gid]) groups[gid] = [];
      groups[gid].push(item);
    });
    return Object.entries(groups);
  }, [docItems]);

  if (!mainInfo) {
    return <p className="text-sm text-slate-500 py-8 text-center">{meta.emptyMsg}</p>;
  }

  const isSalesBill = docType === 'SALES_BILL';

  return (
    <div className="space-y-5">
      {/* Header card */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="font-black text-slate-800">{mainInfo.partner || '未指定单位'}</span>
          {docType === 'PURCHASE_ORDER' &&
            showPurchaseOrderRelatedProduct &&
            (() => {
              const rid = String(
                (mainInfo.customData && typeof mainInfo.customData === 'object'
                  ? (mainInfo.customData as Record<string, unknown>).relatedProductId
                  : '') ?? '',
              ).trim();
              if (!rid) return null;
              const rp = productMapPSI.get(rid);
              const label = '关联产品';
              return (
                <span className="text-slate-600 font-bold normal-case text-xs sm:text-sm" title={label}>
                  {label}：{rp?.name || rid}
                  {rp?.sku ? <span className="text-slate-400 font-semibold"> · {rp.sku}</span> : null}
                </span>
              );
            })()}
          {docType === 'PURCHASE_BILL' &&
            showPurchaseBillRelatedProduct &&
            (() => {
              const summary = aggregatePurchaseBillRelatedProductListText(docItems, productMapPSI);
              if (summary === '—') return null;
              const label = '关联成品';
              return (
                <span className="text-slate-600 font-bold normal-case text-xs sm:text-sm" title={label}>
                  {label}：{summary}
                </span>
              );
            })()}
          {docType === 'PURCHASE_ORDER' &&
            (() => {
              const sn = String(
                (mainInfo.customData && typeof mainInfo.customData === 'object'
                  ? (mainInfo.customData as Record<string, unknown>)[PSI_PO_CUSTOM_DATA_SOURCE_PLAN_NUMBER]
                  : '') ?? '',
              ).trim();
              if (!sn) return null;
              return (
                <span className="text-slate-600 font-bold normal-case text-xs sm:text-sm" title="来源计划">
                  来源计划：{sn}
                </span>
              );
            })()}
          <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest border bg-indigo-50 text-indigo-600 border-indigo-100">
            {formatPsiDocNumForList(docNumber)}
          </span>
          {isSalesBill && totalQty < 0 && (
            <span className="text-[10px] font-black text-amber-600 uppercase tracking-tighter bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              销售退货
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[10px] font-bold text-slate-400 uppercase">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {formatPsiDocListTime(docItems)}
          </span>
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" /> 经办: {mainInfo.operator || '—'}
          </span>
        </div>
        <div className="flex flex-wrap gap-6 pt-1 border-t border-slate-200/80 text-sm">
          <div>
            <p className="text-[10px] text-slate-400 font-black uppercase mb-0.5">合计数量</p>
            <p className={`font-black tabular-nums ${isSalesBill && totalQty < 0 ? 'text-amber-600' : 'text-slate-800'}`}>
              {totalQty.toLocaleString()} PCS
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-black uppercase mb-0.5">合计金额</p>
            <p className={`font-black tabular-nums ${isSalesBill && totalAmount < 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              ¥{totalAmount.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Detail table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-left text-sm" style={{ tableLayout: 'fixed' }}>
          <TableColGroup docType={docType} showPurchaseBatch={showBillBatchColumn} showPbLineRelated={showPbLineRelatedColumn} />
          <thead>
            <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/80">
              <th className="py-2.5 px-3 text-left">产品 / SKU</th>
              {showPbLineRelatedColumn && (
                <th className="py-2.5 px-3 text-left">关联成品</th>
              )}
              {isBill(docType) && <th className="py-2.5 px-3 text-center">{docType === 'PURCHASE_BILL' ? '入库仓库' : '出库仓库'}</th>}
              {showBillBatchColumn && (
                <th className="py-2.5 px-3 text-center">批次</th>
              )}
              {docType === 'SALES_ORDER' && <th className="py-2.5 px-3 text-right">数量</th>}
              <th className="py-2.5 px-3 text-right">{meta.priceLabel}</th>
              <th className="py-2.5 px-3 text-right">金额</th>
              {docType !== 'SALES_ORDER' && <th className="py-2.5 px-3 text-right">数量</th>}
              {docType === 'PURCHASE_ORDER' && <th className="py-2.5 px-3 text-left">入库进度</th>}
              {docType === 'SALES_ORDER' && <th className="py-2.5 px-3 text-left">配货进度</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rowGroups.map(([gid, grp]) => {
              const first = grp[0];
              const product = productMapPSI.get(first.productId);
              const rowProductName = product?.name ?? first.productName ?? undefined;
              const rowProductSku = product?.sku ?? first.productSku ?? undefined;
              const orderQty = grp.reduce((s, i) => s + formatQtyDisplay(i.quantity), 0);
              const rowAmount = grp.reduce((s, i) => s + formatQtyDisplay(i.quantity) * readPsiLinePrice(i, meta.priceField), 0);
              const avgPrice = orderQty !== 0 ? rowAmount / orderQty : 0;
              const variantLabel = resolveVariantLabel(grp, product, dictionaries);
              const customTags = getProductCategoryCustomFieldEntries(
                product,
                categories.find(c => c.id === product?.categoryId),
                { includeFile: false },
              ).map(({ field, display }) => ({ label: field.label, display }));
              const unitName = first.productId ? getUnitName(first.productId) : 'PCS';

              const lineRel = (() => {
                const cd = first.customData;
                if (!cd || typeof cd !== 'object' || Array.isArray(cd)) return '';
                return String((cd as Record<string, unknown>).relatedProductId ?? '').trim();
              })();
              const lineRelProduct = lineRel ? productMapPSI.get(lineRel) : undefined;

              return (
                <tr key={gid}>
                  <ProductCell name={rowProductName} sku={rowProductSku} variantLabel={variantLabel} customTags={customTags} />

                  {showPbLineRelatedColumn && (
                    <td className="py-2.5 px-3 align-top text-xs font-bold text-slate-600">
                      {lineRel
                        ? (
                          <>
                            {lineRelProduct?.name || lineRel}
                            {lineRelProduct?.sku ? (
                              <span className="text-slate-400 font-semibold"> · {lineRelProduct.sku}</span>
                            ) : null}
                          </>
                        )
                        : '—'}
                    </td>
                  )}

                  {isBill(docType) && (
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded-md bg-slate-50 text-slate-500 text-[10px] font-black uppercase border border-slate-100">
                        {warehouseMapPSI?.get(first.warehouseId)?.name || '默认库'}
                      </span>
                    </td>
                  )}

                  {showBillBatchColumn && (
                    <td className="py-2.5 px-3 text-center text-xs font-bold text-slate-600 break-all">
                      {String((first.batchNo ?? (first as { batch?: string }).batch) ?? '').trim() || '—'}
                    </td>
                  )}

                  {docType === 'SALES_ORDER' && (
                    <td className="py-2.5 px-3 text-right font-black text-indigo-600">
                      {orderQty.toLocaleString()} {unitName}
                    </td>
                  )}

                  <td className="py-2.5 px-3 text-right font-bold text-slate-600">¥{avgPrice.toFixed(2)}</td>
                  <td className="py-2.5 px-3 text-right font-black text-indigo-600">¥{rowAmount.toFixed(2)}</td>

                  {docType !== 'SALES_ORDER' && (
                    <td className="py-2.5 px-3 text-right font-black text-slate-700">
                      {docType === 'PURCHASE_ORDER' && receivedByOrderLine ? (() => {
                        const received = grp.reduce((s, i) => s + (receivedByOrderLine[`${docNumber}::${i.id}`] ?? 0), 0);
                        return received > orderQty
                          ? `${received.toLocaleString()} / ${orderQty.toLocaleString()}`
                          : orderQty.toLocaleString();
                      })() : orderQty.toLocaleString()}{' '}
                      {unitName}
                    </td>
                  )}

                  {docType === 'PURCHASE_ORDER' && receivedByOrderLine && (
                    <PurchaseOrderProgressCell grp={grp} orderQty={orderQty} docNumber={docNumber} receivedByOrderLine={receivedByOrderLine} />
                  )}

                  {docType === 'SALES_ORDER' && (
                    <SalesOrderProgressCell grp={grp} orderQty={orderQty} />
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const TableColGroup: React.FC<{ docType: PsiDocType; showPurchaseBatch?: boolean; showPbLineRelated?: boolean }> = ({
  docType,
  showPurchaseBatch = false,
  showPbLineRelated = false,
}) => {
  switch (docType) {
    case 'PURCHASE_ORDER':
      return (
        <colgroup>
          <col style={{ width: 'auto' }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 140 }} />
        </colgroup>
      );
    case 'SALES_ORDER':
      return (
        <colgroup>
          <col style={{ width: 'auto' }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 160 }} />
        </colgroup>
      );
    case 'PURCHASE_BILL':
      return (
        <colgroup>
          <col style={{ width: 'auto' }} />
          {showPbLineRelated ? <col style={{ width: 120 }} /> : null}
          <col style={{ width: 100 }} />
          {showPurchaseBatch ? <col style={{ width: 88 }} /> : null}
          <col style={{ width: 100 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 100 }} />
        </colgroup>
      );
    case 'SALES_BILL':
      return (
        <colgroup>
          <col style={{ width: 'auto' }} />
          <col style={{ width: 100 }} />
          {showPurchaseBatch ? <col style={{ width: 88 }} /> : null}
          <col style={{ width: 100 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 100 }} />
        </colgroup>
      );
  }
};

const PurchaseOrderProgressCell: React.FC<{
  grp: PsiRecord[];
  orderQty: number;
  docNumber: string;
  receivedByOrderLine: Record<string, number>;
}> = ({ grp, orderQty, docNumber, receivedByOrderLine }) => {
  const received = grp.reduce((s, i) => s + (receivedByOrderLine[`${docNumber}::${i.id}`] ?? 0), 0);
  const progress = orderQty > 0 ? Math.min(1, received / orderQty) : 0;

  return (
    <td className="py-2.5 px-3">
      <div className="flex flex-col gap-2">
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden w-full flex">
          {received > orderQty ? (
            <>
              <div className="h-full bg-emerald-500" style={{ width: `${(orderQty / received) * 100}%` }} />
              <div className="h-full bg-rose-500" style={{ width: `${((received - orderQty) / received) * 100}%` }} />
            </>
          ) : (
            <div
              className={`h-full rounded-full transition-all ${progress >= 1 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
              style={{ width: `${Math.min(100, progress * 100)}%` }}
            />
          )}
        </div>
        <span className="text-[10px] font-bold text-slate-400">
          {received > orderQty
            ? `${received} / ${orderQty}（已超收）`
            : progress >= 1
              ? '已完成'
              : `${received} / ${orderQty}`}
        </span>
      </div>
    </td>
  );
};

const SalesOrderProgressCell: React.FC<{ grp: PsiRecord[]; orderQty: number }> = ({ grp, orderQty }) => {
  const allocatedQty = grp.reduce((s, i) => s + (Number(i.allocatedQuantity) || 0), 0);
  const shippedQty = grp.reduce((s, i) => s + (Number(i.shippedQuantity) || 0), 0);
  const allocPendingQty = Math.max(0, allocatedQty - shippedQty);

  let soBarShipPct = 0;
  let soBarAllocPct = 0;
  let soBarRosePct = 0;
  if (orderQty > 0) {
    const ac = Math.min(allocatedQty, orderQty);
    const shipCap = Math.min(shippedQty, ac);
    const allocRemain = Math.max(0, ac - shipCap);
    if (allocatedQty > orderQty) {
      soBarShipPct = (Math.min(shippedQty, orderQty) / allocatedQty) * 100;
      soBarAllocPct = (allocRemain / allocatedQty) * 100;
      soBarRosePct = ((allocatedQty - orderQty) / allocatedQty) * 100;
    } else {
      soBarShipPct = (Math.min(shippedQty, orderQty) / orderQty) * 100;
      soBarAllocPct = (allocRemain / orderQty) * 100;
    }
  }

  return (
    <td className="py-2.5 px-3">
      <div className="flex flex-col gap-2">
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden w-full flex">
          {orderQty <= 0 ? null : (
            <>
              <div className="h-full bg-sky-500 shrink-0 transition-all" style={{ width: `${soBarShipPct}%` }} />
              <div className="h-full bg-indigo-500 shrink-0 transition-all" style={{ width: `${soBarAllocPct}%` }} />
              {soBarRosePct > 0 && (
                <div className="h-full bg-rose-500 shrink-0" style={{ width: `${soBarRosePct}%` }} />
              )}
            </>
          )}
        </div>
        <span className="text-[10px] font-bold text-slate-500 leading-snug">
          <span className="text-sky-600">已发 {shippedQty}</span>
          <span className="text-slate-300 mx-1">/</span>
          <span className="text-indigo-600">待发 {allocPendingQty}</span>
          {allocatedQty > orderQty && <span className="text-rose-600 ml-1">（超配）</span>}
          {orderQty > 0 && shippedQty >= orderQty && <span className="text-emerald-600 ml-1">· 已发齐</span>}
        </span>
      </div>
    </td>
  );
};

export default React.memo(PsiDocDetailSummary);
