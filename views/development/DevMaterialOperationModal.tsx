import React, { useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, ChevronDown, ChevronRight, X } from 'lucide-react';
import { toast } from 'sonner';
import { ModalPortal } from '../../components/ModalPortal';
import { MaterialIssueBatchSelect } from '../../components/MaterialIssueBatchSelect';
import DocEntryTimeField from '../../components/DocEntryTimeField';
import { useAuth } from '../../contexts/AuthContext';
import { useStockSnapshot } from '../../hooks/useStockSnapshot';
import { clampBatchNoInput } from '../../hooks/useBatchPicker';
import { currentOperatorDisplayName } from '../../utils/currentOperatorDisplayName';
import { defaultEntryDatetimeLocal, entryDatetimeLocalToTimestamp } from '../../utils/docEntryTime';
import {
  buildIssueLines,
  buildReturnLines,
  pickVisibleQty,
  productLabel,
  returnableRowKey,
} from '../../utils/devMaterialHelpers';
import {
  buildDevMaterialTree,
  buildProductChildrenIndex,
  collectTreeProductIds,
  flattenVisibleRows,
  resolveTopLevelRootIds,
} from '../../utils/devMaterialTree';
import { formatMaterialQtyDisplay } from '../../utils/formatMaterialQtyDisplay';
import * as api from '../../services/api';
import type {
  BOM,
  DevMaterialRecordsResponse,
  Product,
  ProductCategory,
  Warehouse,
} from '../../types';
import { categoryUsesBatchManagement } from '../../types';
import {
  formStandardControlClass,
  formStandardLabelClass,
  primaryToolbarButtonClass,
  sectionTitleClass,
} from '../../styles/uiDensity';

interface DevMaterialOperationModalProps {
  mode: 'issue' | 'return';
  styleId: string;
  styleCode: string;
  styleName: string;
  data: DevMaterialRecordsResponse;
  productMap: Map<string, Product>;
  categoryById: Map<string, ProductCategory>;
  warehouses: Warehouse[];
  /** 产品档案 BOM，领料时展开子物料 */
  boms?: BOM[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

const DevMaterialOperationModal: React.FC<DevMaterialOperationModalProps> = ({
  mode,
  styleId,
  styleCode,
  styleName,
  data,
  productMap,
  categoryById,
  warehouses,
  boms = [],
  onClose,
  onSaved,
}) => {
  const { currentUser } = useAuth();
  const docOperator = currentOperatorDisplayName(currentUser);
  const isIssue = mode === 'issue';
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [qtyByProduct, setQtyByProduct] = useState<Record<string, number>>({});
  const [batchByProduct, setBatchByProduct] = useState<Record<string, string>>({});
  const [qtyByReturnKey, setQtyByReturnKey] = useState<Record<string, number>>({});
  const [entryTimestamp, setEntryTimestamp] = useState(() => defaultEntryDatetimeLocal());
  const [submitting, setSubmitting] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const { listAvailableBatches, getStock } = useStockSnapshot({ enabled: true });

  const childrenIndex = useMemo(() => buildProductChildrenIndex(boms), [boms]);
  const issueRootIds = useMemo(
    () => resolveTopLevelRootIds(data.bomProductIds, childrenIndex),
    [data.bomProductIds, childrenIndex],
  );
  const issueTree = useMemo(
    () => buildDevMaterialTree(issueRootIds, childrenIndex),
    [issueRootIds, childrenIndex],
  );
  const treeProductIds = useMemo(() => collectTreeProductIds(issueTree), [issueTree]);
  const issueVisibleRows = useMemo(
    () => flattenVisibleRows(issueTree, expandedKeys),
    [issueTree, expandedKeys],
  );
  /** 折叠后的子物料不参与提交：界面上看不到的行不应该出库 */
  const visibleProductIds = useMemo(
    () => new Set(issueVisibleRows.map((row) => row.productId)),
    [issueVisibleRows],
  );

  const batchManagedIds = useMemo(() => {
    const set = new Set<string>();
    for (const productId of treeProductIds) {
      const p = productMap.get(productId);
      if (p?.categoryId && categoryUsesBatchManagement(categoryById.get(p.categoryId))) {
        set.add(productId);
      }
    }
    return set;
  }, [treeProductIds, productMap, categoryById]);

  const showBatchCol = isIssue && batchManagedIds.size > 0;
  const showReturnBatchCol = useMemo(
    () =>
      data.returnable.some(row => {
        const p = productMap.get(row.productId);
        return categoryUsesBatchManagement(categoryById.get(p?.categoryId ?? ''));
      }),
    [data.returnable, productMap, categoryById],
  );

  const summaryByProductId = useMemo(() => {
    const map = new Map(data.summary.map((s) => [s.productId, s]));
    return map;
  }, [data.summary]);

  const toggleExpand = (rowKey: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!warehouseId && isIssue) {
      toast.error('请选择仓库');
      return;
    }
    const lines = isIssue
      ? buildIssueLines(
          pickVisibleQty(qtyByProduct, visibleProductIds),
          warehouseId,
          batchByProduct,
          batchManagedIds,
        )
      : buildReturnLines(qtyByReturnKey, data.returnable);
    if (lines.length === 0) {
      toast.error(isIssue ? '请填写本次领料数量' : '请填写本次退料数量');
      return;
    }
    if (isIssue) {
      for (const line of lines) {
        if (batchManagedIds.has(line.productId) && !String(line.batchNo ?? '').trim()) {
          toast.error(`${productLabel(productMap.get(line.productId), line.productId)} 须选择批次`);
          return;
        }
      }
    }
    setSubmitting(true);
    try {
      const body = {
        lines,
        operator: docOperator,
        timestamp: entryDatetimeLocalToTimestamp(entryTimestamp),
      };
      const result = isIssue
        ? await api.devMaterial.issueBatch(styleId, body)
        : await api.devMaterial.returnBatch(styleId, body);
      toast.success(`${isIssue ? '领料' : '退料'}成功 · ${result.docNo}`);
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `${isIssue ? '领料' : '退料'}失败`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[290] flex items-center justify-center p-4 sm:p-6">
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
        <div
          className="relative z-10 flex max-h-[min(92vh,960px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
            <div>
              <h3 className={`${sectionTitleClass} flex items-center gap-2`}>
                {isIssue ? <ArrowUpFromLine className="h-4 w-4 text-indigo-600" /> : <ArrowDownToLine className="h-4 w-4 text-indigo-600" />}
                {isIssue ? '开发领料' : '开发退料'}
              </h3>
              <p className="mt-1 text-xs font-medium text-slate-400">
                {styleName} · {styleCode}
              </p>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <DocEntryTimeField mode="datetime" value={entryTimestamp} onChange={setEntryTimestamp} />

            {isIssue && (
              <label className="block">
                <span className={formStandardLabelClass}>出库仓库</span>
                <select
                  value={warehouseId}
                  onChange={(e) => {
                    setWarehouseId(e.target.value);
                    setBatchByProduct({});
                  }}
                  className={`mt-1 w-full ${formStandardControlClass}`}
                >
                  {warehouses.length === 0 ? <option value="">暂无仓库</option> : null}
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}{w.code ? ` (${w.code})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {isIssue ? (
              issueVisibleRows.length === 0 ? (
                <p className="py-8 text-center text-xs font-medium text-slate-400">请先配置试制 BOM</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                  <table className="w-full min-w-[520px] text-left">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/80">
                        <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap">物料</th>
                        <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap">净领用</th>
                        {showBatchCol ? (
                          <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap">批次</th>
                        ) : (
                          <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap">库存数量</th>
                        )}
                        <th className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap">本次领料</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {issueVisibleRows.map((row) => {
                        const p = productMap.get(row.productId);
                        const summary = summaryByProductId.get(row.productId);
                        const name = p?.name ?? summary?.productName ?? row.productId;
                        const sku = p?.sku ?? summary?.productSku ?? '';
                        const netQty = summary?.netQty ?? 0;
                        const isExpanded = expandedKeys.has(row.rowKey);
                        const padLeft = 12 + (row.level - 1) * 14;
                        return (
                          <tr key={row.rowKey}>
                            <td className="py-2 pr-3" style={{ paddingLeft: padLeft }}>
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
                                  <p className="text-xs font-semibold text-slate-800">{name}</p>
                                  {sku ? <p className="text-[10px] font-medium text-slate-400">{sku}</p> : null}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right text-xs font-semibold text-slate-600">{netQty}</td>
                            {showBatchCol ? (
                              <td className="px-3 py-2 align-top">
                                {batchManagedIds.has(row.productId) ? (
                                  <MaterialIssueBatchSelect
                                    product={productMap.get(row.productId)}
                                    categories={[...categoryById.values()]}
                                    warehouseId={warehouseId}
                                    value={batchByProduct[row.productId] ?? ''}
                                    onChange={(v) =>
                                      setBatchByProduct((prev) => ({
                                        ...prev,
                                        [row.productId]: clampBatchNoInput(v),
                                      }))
                                    }
                                    mode="issue"
                                    hideLabel
                                    mergeBatches={listAvailableBatches(row.productId, warehouseId)}
                                  />
                                ) : (
                                  <span className="text-[10px] font-medium text-slate-300">—</span>
                                )}
                              </td>
                            ) : (
                              <td className="px-3 py-2 text-right text-xs font-semibold text-slate-700 tabular-nums">
                                {formatMaterialQtyDisplay(getStock(row.productId, warehouseId))}
                              </td>
                            )}
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={qtyByProduct[row.productId] ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value === '' ? 0 : Number(e.target.value);
                                  setQtyByProduct((prev) => ({ ...prev, [row.productId]: v }));
                                }}
                                className={`w-28 text-center ${formStandardControlClass}`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            ) : data.returnable.length === 0 ? (
              <p className="py-8 text-center text-xs font-medium text-slate-400">暂无可退物料</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="w-full min-w-[560px] text-left">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80">
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap">物料</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap">仓库</th>
                      {showReturnBatchCol ? (
                        <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap">批次</th>
                      ) : (
                        <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap">库存数量</th>
                      )}
                      <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap">可退</th>
                      <th className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap">本次退料</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.returnable.map((row) => {
                      const key = returnableRowKey(row);
                      const whName = warehouses.find((w) => w.id === row.warehouseId)?.name ?? row.warehouseId;
                      return (
                        <tr key={key}>
                          <td className="px-3 py-2">
                            <p className="text-xs font-semibold text-slate-800">{row.productName}</p>
                            {row.productSku ? <p className="text-[10px] font-medium text-slate-400">{row.productSku}</p> : null}
                          </td>
                          <td className="px-3 py-2 text-xs font-medium text-slate-600">{whName}</td>
                          {showReturnBatchCol ? (
                            <td className="px-3 py-2 text-xs font-medium text-slate-600">{row.batchNo}</td>
                          ) : (
                            <td className="px-3 py-2 text-right text-xs font-semibold text-slate-700 tabular-nums">
                              {formatMaterialQtyDisplay(getStock(row.productId, row.warehouseId))}
                            </td>
                          )}
                          <td className="px-3 py-2 text-right text-xs font-semibold text-slate-700">{row.returnableQty}</td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              max={row.returnableQty}
                              step="any"
                              value={qtyByReturnKey[key] ?? ''}
                              onChange={(e) => {
                                const v = e.target.value === '' ? 0 : Number(e.target.value);
                                setQtyByReturnKey((prev) => ({ ...prev, [key]: v }));
                              }}
                              className={`w-28 text-center ${formStandardControlClass}`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-6 py-4">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50">
              取消
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleSubmit()}
              className={`${primaryToolbarButtonClass} disabled:opacity-50`}
            >
              {submitting ? '提交中…' : isIssue ? '确认领料' : '确认退料'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

export default DevMaterialOperationModal;
