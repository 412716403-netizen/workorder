/**
 * 返工/返工报工流水 - 详情(只读)视图明细 (P9 抽离自 ReworkReportFlowDetailModal)。
 *
 * 包含:
 * - 头部摘要 DocSummaryCard(只读)
 * - 三种产品明细表 (matrix / no-color-size / variants-only)
 * - 返工目标工序 / 已完成工序
 */
import React from 'react';
import { Clock, User, Building2 } from 'lucide-react';
import type {
  ProductionOpRecord,
  ProductionOrder,
  Product,
  GlobalNodeTemplate,
  AppDictionaries,
} from '../../../types';
import {
  DocCustomFieldInlineReadList,
  DocInlineMetaRow,
  DocSummaryCard,
} from '../../../components/doc-modal';
import VariantQtyMatrixInputs from '../../../components/variant-matrix/VariantQtyMatrixInputs';
import { psiCustomFieldHasFilledDisplayValue } from '../../psi-ops/psiOpsListFormatting';
import ReworkProductInfoCell from './ReworkProductInfoCell';
import type { useReworkReportFlowDetail } from '../../../hooks/useReworkReportFlowDetail';

type Helper = ReturnType<typeof useReworkReportFlowDetail>;

interface Props {
  productionLinkMode: 'order' | 'product';
  helper: Helper;
  globalNodes: GlobalNodeTemplate[];
  dictionaries?: AppDictionaries;
  first: ProductionOpRecord;
  order: ProductionOrder | undefined;
  product: Product | undefined;
}

const ReworkVariantRowsTable: React.FC<Props> = ({
  productionLinkMode,
  helper,
  globalNodes,
  dictionaries,
  first,
  order,
  product,
}) => {
  const {
    isReportDetail,
    isOutsourceReworkReport,
    outsourcePartnerDisplay,
    nodeNamesLabel,
    sourceNodeName,
    operatorsLabel,
    latestBatchTimestamp,
    totalQty,
    batchTotalAmount,
    detailHeaderUnitPriceText,
    hasColorSize,
    reworkFlowMatrixProduct,
    matrixSummaryCustomTags,
    reworkReportFieldsForDetail,
    reworkReportCustomSnapshot,
    variantQtyFromDisplayRows,
    undiffDisplayRow,
    unitName,
    fmtDT,
  } = helper;

  return (
    <>
      <DocSummaryCard
        main={
          <>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 text-sm">
              {isReportDetail && first.docNo?.trim() ? (
                <span className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 font-mono text-[10px] font-black uppercase tracking-widest text-indigo-600">
                  {first.docNo.trim()}
                </span>
              ) : null}
              {productionLinkMode !== 'product' && order?.orderNumber ? (
                <span className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-indigo-600">
                  {order.orderNumber}
                </span>
              ) : null}
              <span className="text-slate-600 font-bold normal-case text-xs sm:text-sm">工序：{nodeNamesLabel}</span>
              <span className="text-slate-600 font-bold normal-case text-xs sm:text-sm">
                来源：
                {sourceNodeName ?? (first.sourceNodeId ? globalNodes.find(n => n.id === first.sourceNodeId)?.name : null) ?? '—'}
              </span>
            </div>
            <DocInlineMetaRow>
              {(latestBatchTimestamp || first.timestamp) ? (
                <span className="inline-flex min-h-4 items-center gap-1.5 text-slate-400">
                  <Clock className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                  <span className="leading-none normal-case">时间 {fmtDT(latestBatchTimestamp ?? first.timestamp)}</span>
                </span>
              ) : null}
              {isOutsourceReworkReport ? (
                <span className="inline-flex min-h-4 items-center gap-1.5 text-slate-400">
                  <Building2 className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                  <span className="leading-none normal-case">委外工厂: {outsourcePartnerDisplay || '—'}</span>
                </span>
              ) : (
                <span className="inline-flex min-h-4 items-center gap-1.5 text-slate-400">
                  <User className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                  <span className="leading-none normal-case">经办: {operatorsLabel}</span>
                </span>
              )}
              {isReportDetail && (
                <DocCustomFieldInlineReadList
                  fields={reworkReportFieldsForDetail}
                  values={reworkReportCustomSnapshot}
                  hasFilled={psiCustomFieldHasFilledDisplayValue}
                />
              )}
            </DocInlineMetaRow>
          </>
        }
        side={
          <>
            <div className="min-w-[6.5rem] md:text-right">
              <p className="text-[10px] text-slate-400 font-black uppercase mb-0.5">合计数量</p>
              <p className="font-black tabular-nums text-slate-800">
                {totalQty.toLocaleString()} {unitName}
              </p>
            </div>
            {batchTotalAmount > 0 ? (
              <div className="min-w-[6.5rem] md:text-right">
                <p className="text-[10px] text-slate-400 font-black uppercase mb-0.5">金额（元）</p>
                <p className="font-black tabular-nums text-emerald-600">¥{batchTotalAmount.toFixed(2)}</p>
              </div>
            ) : null}
          </>
        }
      />
      {first.productId && (
        <div className="flex-1 min-h-0 space-y-2 pb-4">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
            {hasColorSize && reworkFlowMatrixProduct && dictionaries ? '产品明细（按规格）' : '产品明细'}
          </p>
          {hasColorSize && reworkFlowMatrixProduct && dictionaries ? (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/80">
                    <th className="py-2.5 px-3 text-left">产品 / SKU</th>
                    <th className="py-2.5 px-3 text-right">数量</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">单价（元）</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">金额（元）</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  <tr>
                    <td className="py-2.5 px-3 align-top">
                      <ReworkProductInfoCell product={product} fallbackProductId={first.productId} customTags={matrixSummaryCustomTags} />
                    </td>
                    <td className="py-2.5 px-3 text-right align-middle font-black text-indigo-600 tabular-nums">
                      {totalQty.toLocaleString()} {unitName}
                    </td>
                    <td className="py-2.5 px-3 text-right align-middle text-xs font-bold tabular-nums text-slate-700">
                      {detailHeaderUnitPriceText}
                    </td>
                    <td className="py-2.5 px-3 text-right align-middle text-sm font-black text-amber-600 tabular-nums">
                      ¥{batchTotalAmount.toFixed(2)}
                    </td>
                  </tr>
                  <tr className="bg-slate-50/70">
                    <td colSpan={4} className="space-y-2 border-t border-slate-100 px-3 pb-3 pt-2 align-top">
                      {undiffDisplayRow ? (
                        <div className="rounded-lg border border-amber-100 bg-amber-50/80 px-2.5 py-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">未分规格</p>
                          <p className="text-sm font-bold text-indigo-600 tabular-nums">
                            {undiffDisplayRow.quantity} {unitName}
                          </p>
                        </div>
                      ) : null}
                      <VariantQtyMatrixInputs
                        readOnly
                        product={reworkFlowMatrixProduct}
                        dictionaries={dictionaries}
                        quantities={variantQtyFromDisplayRows}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : !hasColorSize ? (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/80">
                    <th className="py-2.5 px-3 text-left">产品 / SKU</th>
                    <th className="py-2.5 px-3 text-right">数量</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">单价（元）</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">金额（元）</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  <tr>
                    <td className="py-2.5 px-3 align-top">
                      <ReworkProductInfoCell
                        product={product}
                        fallbackProductId={first.productId}
                        customTags={matrixSummaryCustomTags}
                        showOrderNumber={productionLinkMode !== 'product' && order?.orderNumber ? { orderNumber: order.orderNumber } : null}
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right align-middle">
                      <span className="font-black tabular-nums text-indigo-600">
                        {totalQty.toLocaleString()} {unitName}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right align-middle text-xs font-bold tabular-nums text-slate-700">
                      {detailHeaderUnitPriceText}
                    </td>
                    <td className="py-2.5 px-3 text-right align-middle text-sm font-black text-amber-600 tabular-nums">
                      ¥{batchTotalAmount.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/80">
                    <th className="py-2.5 px-3 text-left">产品 / SKU</th>
                    <th className="py-2.5 px-3 text-right">数量</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">单价（元）</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">金额（元）</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  <tr>
                    <td className="py-2.5 px-3 align-top">
                      <ReworkProductInfoCell product={product} fallbackProductId={first.productId} customTags={matrixSummaryCustomTags} />
                    </td>
                    <td className="py-2.5 px-3 text-right align-middle font-black text-indigo-600 tabular-nums">
                      {totalQty.toLocaleString()} {unitName}
                    </td>
                    <td className="py-2.5 px-3 text-right align-middle text-xs font-bold tabular-nums text-slate-700">
                      {detailHeaderUnitPriceText}
                    </td>
                    <td className="py-2.5 px-3 text-right align-middle text-sm font-black text-amber-600 tabular-nums">
                      ¥{batchTotalAmount.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {(first.reworkNodeIds?.length ?? 0) > 0 && first.reworkNodeIds && (
        <div className="text-sm">
          <span className="text-slate-400 font-bold">返工目标工序</span>
          <p className="text-slate-800 mt-1">
            {first.reworkNodeIds.map(nid => globalNodes.find(n => n.id === nid)?.name ?? nid).join('、')}
          </p>
        </div>
      )}
      {(first.completedNodeIds?.length ?? 0) > 0 && (
        <div className="text-sm">
          <span className="text-slate-400 font-bold">已完成工序</span>
          <p className="text-slate-800 mt-1">
            {first.completedNodeIds!.map(nid => globalNodes.find(n => n.id === nid)?.name ?? nid).join('、')}
          </p>
        </div>
      )}
    </>
  );
};

export default ReworkVariantRowsTable;
