import React, { useMemo, useState, useCallback } from 'react';
import { Layers, ClipboardList, Truck, FileText, History } from 'lucide-react';
import type {
  AppDictionaries,
  BOM,
  GlobalNodeTemplate,
  OutsourceFormSettings,
  Partner,
  PartnerCategory,
  Product,
  ProductCategory,
  ProductionOpRecord,
  ProductionOrder,
  ProductMilestoneProgress,
  PlanFormFieldConfig,
  ReportFieldDefinition,
} from '../../types';
import { DEFAULT_OUTSOURCE_FORM_SETTINGS } from '../../types';
import DocPhaseModal from '../../components/DocPhaseModal';
import { DocSummaryCard, DocInlineMetaRow, DocCustomFieldInlineReadList } from '../../components/doc-modal';
import { productHasColorSizeMatrix } from '../../utils/productColorSize';
import { buildVariantQtyMatrixLayout } from '../../utils/variantQtyMatrix';
import QtyMatrixTable, { type QtyMatrixTableRow } from '../../components/variant-matrix/QtyMatrixTable';
import { getProductCategoryCustomFieldEntries } from '../../utils/reportCustomDocField';
import {
  aggregateProductOutsourcePartners,
  aggregateProductReportSummaryByNode,
  aggregateProductVariantQuantities,
  reportDateRangeFromProductOrders,
} from '../../utils/productProductionDetailStats';
import { getOrderStockInAggregates, getProductStockInAggregates } from '../../utils/pendingStockCompute';
import OutsourceFlowListModal, { type OutsourceFlowOpenSeed } from '../production-ops/OutsourceFlowListModal';
import OutsourcePartnerFlowDetailModal, { type PartnerFlowDetailSeed } from '../production-ops/OutsourcePartnerFlowDetailModal';
import OutsourceFlowDocumentDetailModal from '../production-ops/OutsourceFlowDocumentDetailModal';
import { hasOpsPerm } from '../production-ops/types';
import type { ReportHistoryInitialSeed } from './ReportHistoryModal';
import OrderMaterialInfoSection from './OrderMaterialInfoSection';

function reportFieldToPlanForm(cf: ReportFieldDefinition): PlanFormFieldConfig {
  return {
    id: cf.id,
    label: cf.label,
    type: cf.type,
    options: cf.options,
    dateWithTime: cf.dateWithTime,
    dateAutoFill: cf.dateAutoFill,
    showInList: false,
    showInCreate: true,
    showInDetail: true,
  };
}

export interface ProductProductionDetailModalProps {
  productId: string | null;
  onClose: () => void;
  orders: ProductionOrder[];
  products: Product[];
  boms: BOM[];
  categories?: ProductCategory[];
  dictionaries?: AppDictionaries;
  prodRecords: ProductionOpRecord[];
  productMilestoneProgresses: ProductMilestoneProgress[];
  globalNodes: GlobalNodeTemplate[];
  outsourceFormSettings?: OutsourceFormSettings;
  partners?: Partner[];
  partnerCategories?: PartnerCategory[];
  userPermissions?: string[];
  tenantRole?: string;
  canViewReportHistory?: boolean;
  onOpenReportHistory?: (seed: ReportHistoryInitialSeed) => void;
  onOpenOrderDetail?: (orderId: string) => void;
  onAddRecord?: (record: ProductionOpRecord) => void;
  onAddRecordBatch?: (records: ProductionOpRecord[]) => Promise<void>;
  onUpdateRecord?: (record: ProductionOpRecord) => void;
  onDeleteRecord?: (recordId: string) => void;
}

const ProductProductionDetailModal: React.FC<ProductProductionDetailModalProps> = ({
  productId,
  onClose,
  orders,
  products,
  boms,
  categories,
  dictionaries,
  prodRecords,
  productMilestoneProgresses,
  globalNodes,
  outsourceFormSettings = DEFAULT_OUTSOURCE_FORM_SETTINGS,
  partners = [],
  partnerCategories = [],
  userPermissions,
  tenantRole,
  canViewReportHistory = false,
  onOpenReportHistory,
  onOpenOrderDetail,
  onAddRecord,
  onAddRecordBatch,
  onUpdateRecord,
  onDeleteRecord,
}) => {
  const product = products.find(p => p.id === productId);
  const category = categories?.find(c => c.id === product?.categoryId);
  const hasColorSize = productHasColorSizeMatrix(product, category);
  const unitName = (product?.unitId && dictionaries?.units?.find(u => u.id === product.unitId)?.name) || '件';

  const productOrders = useMemo(
    () => (productId ? orders.filter(o => o.productId === productId) : []),
    [orders, productId],
  );
  const productTotalQty = useMemo(
    () => productOrders.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0),
    [productOrders],
  );
  const pmpsForProduct = useMemo(
    () => productMilestoneProgresses.filter(p => p.productId === productId),
    [productMilestoneProgresses, productId],
  );

  const reportSummaryRows = useMemo(() => {
    if (!productId) return [];
    return aggregateProductReportSummaryByNode(
      productId,
      productOrders,
      pmpsForProduct,
      prodRecords,
      globalNodes,
      product?.milestoneNodeIds ?? [],
    );
  }, [productId, productOrders, pmpsForProduct, prodRecords, globalNodes, product?.milestoneNodeIds]);

  const outsourcePartners = useMemo(() => {
    if (!productId) return [];
    return aggregateProductOutsourcePartners(productId, prodRecords, globalNodes);
  }, [productId, prodRecords, globalNodes]);

  const displayOutsourcePartners = useMemo(() => {
    if (outsourceFormSettings.hideZeroPendingPartnerOnList !== true) return outsourcePartners;
    return outsourcePartners.filter(r => r.pending > 0);
  }, [outsourcePartners, outsourceFormSettings.hideZeroPendingPartnerOnList]);

  const variantQtyById = useMemo(() => aggregateProductVariantQuantities(productOrders), [productOrders]);
  const productStockInAggregates = useMemo(
    () => (productId ? getProductStockInAggregates(productId, prodRecords) : { alreadyIn: 0, alreadyInByVariant: {} as Record<string, number> }),
    [productId, prodRecords],
  );

  const productCategoryCustomEntries = useMemo(
    () =>
      getProductCategoryCustomFieldEntries(product ?? null, category ?? null, {
        includeFile: true,
        includeEmpty: false,
      }),
    [product, category],
  );
  const categoryCustomFields = productCategoryCustomEntries.map(e => reportFieldToPlanForm(e.field));
  const categoryCustomValues = Object.fromEntries(
    productCategoryCustomEntries.map(e => [e.field.id, e.value]),
  ) as Record<string, unknown>;

  const [showOutsourceFlow, setShowOutsourceFlow] = useState(false);
  const [flowOpenSeed, setFlowOpenSeed] = useState<OutsourceFlowOpenSeed>(null);
  const [flowOpenNonce, setFlowOpenNonce] = useState(0);
  const [partnerQtyDetailSeed, setPartnerQtyDetailSeed] = useState<PartnerFlowDetailSeed | null>(null);
  const [flowDetailKey, setFlowDetailKey] = useState<string | null>(null);
  const [flowDetailExtraRecords, setFlowDetailExtraRecords] = useState<ProductionOpRecord[] | null>(null);
  const [flowDocPhase, setFlowDocPhase] = useState<'detail' | 'edit'>('detail');

  const flowDetailRecordsForPrint = useMemo(() => {
    if (!flowDetailKey) return [];
    const fromPanel = prodRecords.filter(r => r.type === 'OUTSOURCE' && r.docNo === flowDetailKey);
    if (fromPanel.length > 0) return fromPanel;
    return (flowDetailExtraRecords ?? []).filter(r => r.type === 'OUTSOURCE' && r.docNo === flowDetailKey);
  }, [prodRecords, flowDetailKey, flowDetailExtraRecords]);

  const recordsForFlowDetailModal = useMemo(() => {
    if (!flowDetailKey) return prodRecords;
    const fromPanel = prodRecords.filter(r => r.type === 'OUTSOURCE' && r.docNo === flowDetailKey);
    const extraMatch = (flowDetailExtraRecords ?? []).filter(
      r => r.type === 'OUTSOURCE' && r.docNo === flowDetailKey,
    );
    if (extraMatch.length === 0) return prodRecords;
    if (fromPanel.length > 0) return prodRecords;
    const byId = new Map<string, ProductionOpRecord>(prodRecords.map(r => [r.id, r]));
    for (const r of extraMatch) byId.set(r.id, r);
    return Array.from(byId.values());
  }, [prodRecords, flowDetailKey, flowDetailExtraRecords]);

  const flowDetailPrintIsReceive = flowDetailRecordsForPrint[0]?.status === '已收回';

  const openOutsourcePartnerFlow = useCallback(
    (row: { partner: string; nodeId: string; nodeName: string }) => {
      if (!productId || !product) return;
      const seed: PartnerFlowDetailSeed = {
        productionLinkMode: 'product',
        productId,
        productName: product.name,
        nodeId: row.nodeId,
        nodeName: row.nodeName,
        partner: row.partner,
      };
      if (outsourceFormSettings.showPartnerFlowDetailOnList) {
        setPartnerQtyDetailSeed(seed);
        return;
      }
      setFlowOpenSeed({
        orderKeyword: '',
        productKeyword: product.name,
        milestoneNodeId: row.nodeId,
        partnerKeyword: row.partner,
      });
      setFlowOpenNonce(n => n + 1);
      setPartnerQtyDetailSeed(null);
      setShowOutsourceFlow(true);
    },
    [product, productId, outsourceFormSettings.showPartnerFlowDetailOnList],
  );

  const renderOutsourceOverlays = () => (
    <>
      {showOutsourceFlow ? (
        <OutsourceFlowListModal
          productionLinkMode="product"
          showOrderDueDateColumn={false}
          orders={orders}
          products={products}
          globalNodes={globalNodes}
          userPermissions={userPermissions}
          tenantRole={tenantRole}
          overlayZIndexClass="z-[90]"
          onOpenDetail={(docNo, recs) => {
            if (!onAddRecord) return;
            setFlowDetailExtraRecords(recs);
            setFlowDetailKey(docNo);
          }}
          flowOpenSeed={flowOpenSeed}
          flowOpenNonce={flowOpenNonce}
          onClose={() => {
            setShowOutsourceFlow(false);
            setFlowDetailKey(null);
            setFlowDetailExtraRecords(null);
            setFlowOpenSeed(null);
            setPartnerQtyDetailSeed(null);
          }}
        />
      ) : null}
      <OutsourcePartnerFlowDetailModal
        open={partnerQtyDetailSeed != null}
        seed={partnerQtyDetailSeed}
        onClose={() => setPartnerQtyDetailSeed(null)}
        records={prodRecords}
        products={products}
        orders={orders}
        categories={categories ?? []}
        dictionaries={dictionaries}
        outsourceFormSettings={outsourceFormSettings}
        overlayZIndexClass="z-[90]"
      />
      {flowDetailKey && showOutsourceFlow && onAddRecord ? (
        <DocPhaseModal
          open
          phase={flowDocPhase}
          editingDocNumber={flowDetailKey}
          detailTitle={flowDetailPrintIsReceive ? '外协收回详情' : '外协发出详情'}
          editTitle="编辑外协单据"
          newTitle="外协单据"
          showPrint={false}
          zIndexClass="z-[92]"
          hasPerm={p => hasOpsPerm(tenantRole, userPermissions, p)}
          viewPerm="production:outsource_records:view"
          editPerm="production:outsource_records:edit"
          deletePerm={onDeleteRecord ? 'production:outsource_records:delete' : undefined}
          deleteConfirmMessage="确定要删除该张外协单的所有记录吗？此操作不可恢复。"
          onDelete={
            onDeleteRecord && flowDetailRecordsForPrint.length > 0
              ? async () => {
                  await Promise.all(
                    flowDetailRecordsForPrint.map(r => Promise.resolve(onDeleteRecord(r.id))),
                  );
                  setFlowDetailKey(null);
                  setFlowDocPhase('detail');
                }
              : undefined
          }
          onClose={() => {
            setFlowDetailKey(null);
            setFlowDocPhase('detail');
            setFlowDetailExtraRecords(null);
          }}
          onEnterEdit={() => setFlowDocPhase('edit')}
          onCancelEdit={() => setFlowDocPhase('detail')}
          renderContent={() => (
            <OutsourceFlowDocumentDetailModal
              layout="docPhase"
              phase={flowDocPhase}
              onAfterSave={() => {
                setFlowDetailKey(null);
                setFlowDocPhase('detail');
                setFlowDetailExtraRecords(null);
              }}
              productionLinkMode="product"
              flowDetailKey={flowDetailKey}
              records={recordsForFlowDetailModal}
              orders={orders}
              products={products}
              categories={categories ?? []}
              dictionaries={dictionaries}
              globalNodes={globalNodes}
              partners={partners}
              partnerCategories={partnerCategories ?? []}
              userPermissions={userPermissions}
              tenantRole={tenantRole}
              onAddRecord={onAddRecord}
              onAddRecordBatch={onAddRecordBatch}
              onUpdateRecord={onUpdateRecord}
              onDeleteRecord={onDeleteRecord}
              onClose={() => {
                setFlowDetailKey(null);
                setFlowDocPhase('detail');
                setFlowDetailExtraRecords(null);
              }}
              outsourceFormSettings={outsourceFormSettings}
            />
          )}
        />
      ) : null}
    </>
  );

  if (!productId || !product) return null;

  const reportDateRange = reportDateRangeFromProductOrders(productOrders, pmpsForProduct, productId);
  const hasReportSection = reportSummaryRows.length > 0;

  return (
    <>
      <DocPhaseModal
        zIndexClass="z-[85]"
        open
        phase="detail"
        editingDocNumber={product.name}
        detailTitle="产品生产详情"
        editTitle=""
        newTitle=""
        hasPerm={() => false}
        viewPerm="__none__"
        editPerm="__none__"
        renderDocBadge={() => (
          <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
            {product.sku || product.name}
          </span>
        )}
        onClose={onClose}
        onEnterEdit={() => {}}
        onCancelEdit={() => {}}
        renderContent={() => (
          <div className="space-y-6">
            <DocSummaryCard
              main={
                <>
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 text-sm">
                    <span className="font-black text-slate-800" title={product.name}>
                      {product.name}
                    </span>
                    {product.sku ? (
                      <span className="min-w-0 text-[10px] font-bold text-slate-400 normal-case tabular-nums" title="产品编号">
                        {product.sku}
                      </span>
                    ) : null}
                  </div>
                  {categoryCustomFields.length > 0 ? (
                    <DocInlineMetaRow>
                      <DocCustomFieldInlineReadList
                        fields={categoryCustomFields}
                        values={categoryCustomValues}
                        hasFilled={() => true}
                      />
                    </DocInlineMetaRow>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-4">
                    <div className="bg-slate-50 rounded-xl px-4 py-2">
                      <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">工单数</p>
                      <p className="text-sm font-bold text-slate-800">{productOrders.length}</p>
                    </div>
                  </div>
                </>
              }
              side={
                <div className="min-w-[6.5rem] space-y-3 md:text-right">
                  <div>
                    <p className="mb-0.5 text-[10px] font-black uppercase text-slate-400">总计划量</p>
                    <p className="font-black tabular-nums text-slate-800">
                      {productTotalQty.toLocaleString()} {unitName}
                    </p>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[10px] font-black uppercase text-slate-400">入库数量</p>
                    <p className="font-black tabular-nums text-emerald-600">
                      {productStockInAggregates.alreadyIn.toLocaleString()} {unitName}
                    </p>
                  </div>
                </div>
              }
            />

            {hasColorSize && product.variants?.length && dictionaries ? (
              <div>
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-2">
                  <Layers className="w-3.5 h-3.5" /> 产品明细
                </h4>
                {(() => {
                  const layout = buildVariantQtyMatrixLayout(product, dictionaries);
                  if (!layout) return null;
                  const rows: QtyMatrixTableRow[] = layout.colorRows.map(row => {
                    let rowSum = 0;
                    const cells = row.variantAtSize.map((variant, si) => {
                      if (!variant) {
                        return <span key={`${row.key}-e-${si}`} className="text-sm text-slate-300">—</span>;
                      }
                      const qty = variantQtyById.get(variant.id) ?? 0;
                      const stockInQty = productStockInAggregates.alreadyInByVariant[variant.id] ?? 0;
                      rowSum += qty;
                      return (
                        <div key={variant.id} className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-sm font-bold text-indigo-600 tabular-nums">{qty}</span>
                          {stockInQty > 0 ? (
                            <span className="text-[10px] font-medium tabular-nums text-emerald-600">已入库 {stockInQty}</span>
                          ) : null}
                        </div>
                      );
                    });
                    return {
                      key: row.key,
                      colorCell: (
                        <div className="flex items-center gap-2">
                          {row.colorSwatch ? (
                            <span
                              className="h-4 w-4 shrink-0 rounded-full border border-slate-200"
                              style={{ backgroundColor: row.colorSwatch }}
                            />
                          ) : null}
                          <span>{row.colorLabel}</span>
                        </div>
                      ),
                      cells,
                      subtotalCell: rowSum,
                    };
                  });
                  return (
                    <div className="rounded-xl bg-slate-50/50 p-2 sm:p-2.5 ring-1 ring-slate-100/80">
                      <QtyMatrixTable sizeHeaders={layout.sizeColumns.map(c => c.header)} rows={rows} dense />
                    </div>
                  );
                })()}
              </div>
            ) : null}

            {productOrders.length > 0 ? (
              <div>
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-3">
                  <ClipboardList className="w-3.5 h-3.5" /> 关联工单
                </h4>
                <ul className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
                  {productOrders.map(o => {
                    const orderStockIn = getOrderStockInAggregates(o, prodRecords).alreadyIn;
                    return (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => onOpenOrderDetail?.(o.id)}
                        disabled={!onOpenOrderDetail}
                        className="w-full px-4 py-3 flex items-center justify-between gap-3 bg-white hover:bg-slate-50/50 text-left disabled:cursor-default disabled:hover:bg-white"
                      >
                        <span className="font-bold text-slate-800">{o.orderNumber}</span>
                        <span className="text-sm text-slate-600 text-right shrink-0">
                          <span className="tabular-nums">{o.items.reduce((s, i) => s + i.quantity, 0)} {unitName}</span>
                          {orderStockIn > 0 ? (
                            <span className="ml-2 text-emerald-600 tabular-nums">已入库 {orderStockIn}</span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {hasReportSection ? (
              <div>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <ClipboardList className="w-3.5 h-3.5" /> 各工序报工汇总
                  </h4>
                  {canViewReportHistory && onOpenReportHistory ? (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenReportHistory({
                          productKeyword: product.name,
                          dateFrom: reportDateRange.dateFrom,
                          dateTo: reportDateRange.dateTo,
                        })
                      }
                      className="inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors"
                    >
                      <History className="w-3.5 h-3.5" /> 报工明细流水
                    </button>
                  ) : null}
                </div>
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">工序</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">良品</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">不良品</th>
                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">报损</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportSummaryRows.map(row => (
                        <tr key={row.nodeId} className="border-b border-slate-100 last:border-0">
                          <td className="px-4 py-3 text-sm font-bold text-slate-700">{row.name}</td>
                          <td className="px-4 py-3 text-sm font-bold text-emerald-600 text-right">
                            {row.goodQty} {unitName}
                          </td>
                          <td className="px-4 py-3 text-sm font-bold text-amber-600 text-right">
                            {row.defQty > 0 ? `${row.defQty} ${unitName}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm font-bold text-rose-600 text-right">
                            {row.scrapQty > 0 ? `${row.scrapQty} ${unitName}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {productId ? (
              <OrderMaterialInfoSection
                scopeProductId={productId}
                orders={orders}
                products={products}
                boms={boms}
                categories={categories}
                globalNodes={globalNodes}
                productionLinkMode="product"
                productMilestoneProgresses={productMilestoneProgresses}
              />
            ) : null}

            {displayOutsourcePartners.length > 0 ? (
              <div>
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-3">
                  <Truck className="w-3.5 h-3.5" /> 外协管理
                </h4>
                <div className="flex flex-wrap gap-4">
                  {displayOutsourcePartners.map((row, idx) => (
                    <div
                      key={`${row.partner}|${row.nodeId}|${idx}`}
                      className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 min-w-[140px] flex flex-col items-center gap-2"
                    >
                      <div className="w-full text-center">
                        <p className="text-[11px] font-bold text-emerald-600">{row.nodeName}</p>
                        <p className="text-sm font-bold text-slate-900 truncate" title={row.partner}>
                          {row.partner}
                        </p>
                      </div>
                      <div
                        className={`w-16 h-16 rounded-full border-2 bg-white flex items-center justify-center shrink-0 ${row.pending > 0 ? 'border-indigo-300' : 'border-emerald-400'}`}
                        title="已收回数量"
                      >
                        <span className="text-xl font-black text-slate-900">{row.received}</span>
                      </div>
                      <div className="flex items-center justify-center gap-1.5 w-full">
                        <span className="text-xs font-bold text-slate-600" title="发出 / 剩余">
                          {row.dispatched} / {row.pending}
                        </span>
                        <button
                          type="button"
                          onClick={() => openOutsourcePartnerFlow(row)}
                          className="p-0.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
                          title={
                            outsourceFormSettings.showPartnerFlowDetailOnList
                              ? '加工厂往来数量明细'
                              : '查看外协流水'
                          }
                        >
                          <FileText className="w-4 h-4 shrink-0" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      />
      {renderOutsourceOverlays()}
    </>
  );
};

export default ProductProductionDetailModal;
