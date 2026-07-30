import React, { useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, ChevronDown, ChevronRight, History, Package } from 'lucide-react';
import type {
  AppDictionaries,
  BOM,
  DevBomDto,
  DevMaterialRecordsResponse,
  DevMaterialSummaryRow,
  GlobalNodeTemplate,
  Partner,
  Product,
  ProductCategory,
  Warehouse,
} from '../../types';
import {
  outlineToolbarButtonClass,
  primaryToolbarButtonClass,
  sectionTitleClass,
} from '../../styles/uiDensity';
import {
  buildDevBomUnitQtyMap,
  buildDevMaterialTree,
  buildProductBomChildIndex,
  buildRootCoverageIndex,
  flattenVisibleRows,
  resolveTopLevelRootIds,
} from '../../utils/devMaterialTree';
import { getProductCategoryCustomFieldEntries } from '../../utils/reportCustomDocField';
import { MediaFilePreviewOverlay, type MediaFilePreview } from '../../components/MediaFilePreviewOverlay';
import PlanProductDetail from '../plan-order-list/PlanProductDetail';
import DevMaterialOperationModal from './DevMaterialOperationModal';
import DevMaterialHistoryModal from './DevMaterialHistoryModal';

export interface DevMaterialPerms {
  canViewRecords: boolean;
  canIssue: boolean;
  canReturn: boolean;
  canEditRecords: boolean;
  canDeleteRecords: boolean;
}

interface DevMaterialSectionProps {
  styleId: string;
  styleCode: string;
  styleName: string;
  data: DevMaterialRecordsResponse | undefined;
  loading?: boolean;
  products: Product[];
  /** 产品档案 BOM，用于展开子物料 */
  boms?: BOM[];
  /** 试制 BOM，领料时展示顶层单个用量 */
  devBoms?: DevBomDto[];
  categories: ProductCategory[];
  warehouses: Warehouse[];
  partners?: Partner[];
  dictionaries?: AppDictionaries;
  globalNodes?: GlobalNodeTemplate[];
  perms: DevMaterialPerms;
  /** 款式是否允许领料（developing）；归档/发布仅退料 */
  styleAllowsIssue: boolean;
  onRefresh: () => Promise<void> | void;
  /** 嵌入弹窗时去掉外层卡片与大标题 */
  embedded?: boolean;
}

const thClass =
  'px-4 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle';
const tdNumClass =
  'px-4 py-2.5 text-right text-xs font-semibold tabular-nums align-middle whitespace-nowrap';

function formatQty(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

const EMPTY_SUMMARY: DevMaterialSummaryRow[] = [];
const EMPTY_IDS: string[] = [];

function emptySummary(productId: string, productMap: Map<string, Product>): DevMaterialSummaryRow {
  const p = productMap.get(productId);
  return {
    productId,
    productName: p?.name ?? productId,
    productSku: p?.sku ?? '',
    issuedQty: 0,
    returnedQty: 0,
    netQty: 0,
  };
}

const DevMaterialSection: React.FC<DevMaterialSectionProps> = ({
  styleId,
  styleCode,
  styleName,
  data,
  loading,
  products,
  boms = [],
  devBoms = [],
  categories,
  warehouses,
  partners = [],
  dictionaries,
  globalNodes = [],
  perms,
  styleAllowsIssue,
  onRefresh,
  embedded = false,
}) => {
  const [opMode, setOpMode] = useState<'issue' | 'return' | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const [viewProductId, setViewProductId] = useState<string | null>(null);
  const [filePreview, setFilePreview] = useState<MediaFilePreview | null>(null);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const partnerById = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners]);

  // `?? []` 直接写在渲染体里会每次产生新引用，让下游 useMemo 全部失效
  const summary = useMemo(() => data?.summary ?? EMPTY_SUMMARY, [data]);
  const bomIds = useMemo(() => data?.bomProductIds ?? EMPTY_IDS, [data]);
  const productBomIndex = useMemo(() => buildProductBomChildIndex(boms), [boms]);
  const childrenIndex = productBomIndex.childrenByParent;
  const rootUnitQty = useMemo(
    () => buildDevBomUnitQtyMap(devBoms.filter((b) => b.parentStyleId === styleId)),
    [devBoms, styleId],
  );
  const summaryByProductId = useMemo(() => {
    const map = new Map<string, DevMaterialSummaryRow>();
    for (const row of summary) map.set(row.productId, row);
    return map;
  }, [summary]);

  // 试制 BOM 顶层里若同时列了父件与其子件，子件只保留在展开的子树中，避免两处显示同一组数量
  const topLevelBomIds = useMemo(
    () => resolveTopLevelRootIds(bomIds, childrenIndex),
    [bomIds, childrenIndex],
  );
  const rootCoverage = useMemo(
    () => buildRootCoverageIndex(topLevelBomIds, childrenIndex),
    [topLevelBomIds, childrenIndex],
  );

  /**
   * 顶层行：
   * - 试制 BOM 物料：自身或子孙有流水才出现（避免无流水 BOM 占行）
   * - summary 中不属于任何 BOM 子孙的孤立行（历史领过但已不在当前树下）
   * 子料只在展开处出现，避免与顶层重复。
   */
  const rootIdsForSummary = useMemo(() => {
    const rootsWithFlow = new Set<string>();
    for (const row of summary) {
      for (const rootId of rootCoverage.get(row.productId) ?? []) rootsWithFlow.add(rootId);
    }
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const rootId of topLevelBomIds) {
      if (!rootsWithFlow.has(rootId) || seen.has(rootId)) continue;
      seen.add(rootId);
      ids.push(rootId);
    }
    for (const row of summary) {
      if (seen.has(row.productId) || rootCoverage.has(row.productId)) continue;
      seen.add(row.productId);
      ids.push(row.productId);
    }
    return ids;
  }, [topLevelBomIds, rootCoverage, summary]);

  const materialTree = useMemo(
    () =>
      buildDevMaterialTree(rootIdsForSummary, childrenIndex, {
        rootUnitQty,
        childUnitQty: productBomIndex.unitQtyByParentChild,
      }),
    [rootIdsForSummary, childrenIndex, rootUnitQty, productBomIndex.unitQtyByParentChild],
  );

  const visibleRows = useMemo(
    () => flattenVisibleRows(materialTree, expandedKeys),
    [materialTree, expandedKeys],
  );

  const showSection = perms.canViewRecords || perms.canIssue || perms.canReturn;
  if (!showSection) return null;

  const canOpenIssue = perms.canIssue && styleAllowsIssue && (data?.canIssue ?? styleAllowsIssue) && bomIds.length > 0;
  const canOpenReturn = perms.canReturn && (data?.canReturn ?? false);

  const hasAnySummaryQty = summary.length > 0;
  const showTable = hasAnySummaryQty || bomIds.length > 0;

  const toggleExpand = (rowKey: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {perms.canIssue && (
        <button
          type="button"
          disabled={!canOpenIssue}
          title={
            !styleAllowsIssue
              ? '归档/已发布款式不可继续领料'
              : bomIds.length === 0
                ? '请先配置试制 BOM'
                : undefined
          }
          onClick={() => setOpMode('issue')}
          className={`${primaryToolbarButtonClass} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <ArrowUpFromLine className="h-3.5 w-3.5" />
          开发领料
        </button>
      )}
      {perms.canReturn && (
        <button
          type="button"
          disabled={!canOpenReturn}
          onClick={() => setOpMode('return')}
          className={`${outlineToolbarButtonClass} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <ArrowDownToLine className="h-3.5 w-3.5" />
          开发退料
        </button>
      )}
      {perms.canViewRecords && (
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className={outlineToolbarButtonClass}
        >
          <History className="h-3.5 w-3.5" />
          流水
        </button>
      )}
    </div>
  );

  const body = (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {embedded ? (
          <>
            <p className="text-xs font-medium text-slate-400">本厂领料 / 退料，关联当前款式试制 BOM</p>
            {actions}
          </>
        ) : (
          <>
            <div>
              <h3 className={`${sectionTitleClass} flex items-center gap-2`}>
                <Package className="h-4 w-4 text-indigo-500" />
                开发物料
              </h3>
              <p className="mt-1 text-xs font-medium text-slate-400">本厂领料 / 退料，关联当前款式试制 BOM</p>
            </div>
            {actions}
          </>
        )}
      </div>

      {loading && !data ? (
        <p className="py-6 text-center text-xs font-medium text-slate-400">加载中…</p>
      ) : !showTable ? (
        <p className="py-6 text-center text-xs font-medium text-slate-400">
          暂无试制 BOM 物料，配置后可领料
        </p>
      ) : !hasAnySummaryQty ? (
        <p className="py-6 text-center text-xs font-medium text-slate-400">暂无领退料记录</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <table className="w-full min-w-[520px] table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[46%]" />
              <col className="w-[18%]" />
              <col className="w-[18%]" />
              <col className="w-[18%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th className={`${thClass} text-left`}>物料</th>
                <th className={`${thClass} text-right`}>累计领料</th>
                <th className={`${thClass} text-right`}>累计退料</th>
                <th className={`${thClass} text-right`}>净领用</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {visibleRows.map((row) => {
                const s = summaryByProductId.get(row.productId) ?? emptySummary(row.productId, productMap);
                const product = productMap.get(row.productId);
                const productCode = product?.name ?? s.productName;
                const productTitle = (product?.sku ?? s.productSku)?.trim() || '';
                const customTags = getProductCategoryCustomFieldEntries(
                  product,
                  product ? categoryById.get(product.categoryId ?? '') : undefined,
                  { includeFile: false },
                );
                const partnerName = product?.supplierId
                  ? partnerById.get(product.supplierId)?.name?.trim() || ''
                  : '';
                const metaParts: string[] = [];
                for (const { field, display } of customTags) {
                  if (display) metaParts.push(`${field.label}: ${display}`);
                }
                if (partnerName) metaParts.push(`合作单位: ${partnerName}`);
                const isExpanded = expandedKeys.has(row.rowKey);
                const padLeft = 16 + (row.level - 1) * 16;
                const canOpenDetail = Boolean(product);
                return (
                  <tr key={row.rowKey} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-2.5 pr-4 align-middle min-w-0" style={{ paddingLeft: padLeft }}>
                      <div className="flex min-w-0 items-start gap-1">
                        {row.hasChildren ? (
                          <button
                            type="button"
                            onClick={() => toggleExpand(row.rowKey)}
                            className="mt-0.5 shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                            title={isExpanded ? '收起子物料' : '展开子物料'}
                            aria-label={isExpanded ? '收起子物料' : '展开子物料'}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </button>
                        ) : (
                          <span className="mt-0.5 inline-block h-3.5 w-3.5 shrink-0" aria-hidden />
                        )}
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            {canOpenDetail ? (
                              <button
                                type="button"
                                onClick={() => setViewProductId(row.productId)}
                                className="truncate text-left text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
                                title={`查看物料详情 · ${productCode}`}
                              >
                                {productCode}
                              </button>
                            ) : (
                              <p className="truncate text-xs font-semibold text-slate-800" title={productCode}>
                                {productCode}
                              </p>
                            )}
                            {productTitle ? (
                              <span className="truncate text-[10px] font-medium text-slate-400" title={productTitle}>
                                {productTitle}
                              </span>
                            ) : null}
                          </div>
                          {metaParts.length > 0 ? (
                            <p
                              className="mt-0.5 break-words text-[9px] font-bold text-slate-500"
                              title={metaParts.join(' · ')}
                            >
                              {metaParts.map((part, i) => (
                                <span key={`${row.rowKey}-meta-${i}`}>
                                  {i > 0 ? <span className="text-slate-300"> · </span> : null}
                                  {part}
                                </span>
                              ))}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className={`${tdNumClass} text-slate-700`}>{formatQty(s.issuedQty)}</td>
                    <td className={`${tdNumClass} text-slate-700`}>{formatQty(s.returnedQty)}</td>
                    <td className={`${tdNumClass} text-indigo-600`}>{formatQty(s.netQty)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {opMode && data && (
        <DevMaterialOperationModal
          mode={opMode}
          styleId={styleId}
          styleCode={styleCode}
          styleName={styleName}
          data={data}
          productMap={productMap}
          categoryById={categoryById}
          warehouses={warehouses}
          boms={boms}
          devBoms={devBoms}
          onClose={() => setOpMode(null)}
          onSaved={async () => {
            await onRefresh();
            setOpMode(null);
          }}
        />
      )}

      {historyOpen && data && (
        <DevMaterialHistoryModal
          styleId={styleId}
          styleCode={styleCode}
          styleName={styleName}
          docs={data.docs}
          warehouses={warehouses}
          products={products}
          categories={categories}
          canEdit={perms.canEditRecords}
          canDelete={perms.canDeleteRecords}
          styleAllowsEdit={styleAllowsIssue}
          onClose={() => setHistoryOpen(false)}
          onSaved={async () => {
            await onRefresh();
          }}
        />
      )}

      {viewProductId && dictionaries && (
        <PlanProductDetail
          viewProductId={viewProductId}
          products={products}
          categories={categories}
          dictionaries={dictionaries}
          partners={partners}
          globalNodes={globalNodes}
          boms={boms}
          stackZClass="z-[300]"
          onClose={() => setViewProductId(null)}
          onFilePreview={(url, type) => setFilePreview({ src: url, kind: type })}
        />
      )}

      <MediaFilePreviewOverlay preview={filePreview} onClose={() => setFilePreview(null)} />
    </>
  );

  if (embedded) {
    return <div>{body}</div>;
  }

  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      {body}
    </section>
  );
};

export default DevMaterialSection;
