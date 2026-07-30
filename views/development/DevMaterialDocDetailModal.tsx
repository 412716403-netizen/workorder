import React, { useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { ModalPortal } from '../../components/ModalPortal';
import { MaterialIssueBatchSelect } from '../../components/MaterialIssueBatchSelect';
import DocEntryTimeField from '../../components/DocEntryTimeField';
import { useAuth } from '../../contexts/AuthContext';
import { useStockSnapshot } from '../../hooks/useStockSnapshot';
import { clampBatchNoInput } from '../../hooks/useBatchPicker';
import { currentOperatorDisplayName } from '../../utils/currentOperatorDisplayName';
import {
  buildDocEditDraft,
  buildDocUpdateBody,
  removeDraftLine,
  updateDraftLine,
  validateDocEditDraft,
  type DevMaterialDocEditDraft,
} from '../../utils/devMaterialDocEdit';
import * as api from '../../services/api';
import type {
  DevMaterialDocGroup,
  Product,
  ProductCategory,
  Warehouse,
} from '../../types';
import { categoryUsesBatchManagement } from '../../types';
import {
  formStandardControlClass,
  outlineToolbarButtonClass,
  primaryToolbarButtonClass,
  sectionTitleClass,
} from '../../styles/uiDensity';

export interface DevMaterialDocDetailModalProps {
  styleId: string;
  styleCode: string;
  styleName: string;
  doc: DevMaterialDocGroup;
  warehouses: Warehouse[];
  products: Product[];
  categories: ProductCategory[];
  canEdit: boolean;
  canDelete: boolean;
  /** 款式是否 developing（归档/已发布不可改删） */
  styleAllowsEdit: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

const DevMaterialDocDetailModal: React.FC<DevMaterialDocDetailModalProps> = ({
  styleId,
  styleCode,
  styleName,
  doc,
  warehouses,
  products,
  categories,
  canEdit,
  canDelete,
  styleAllowsEdit,
  onClose,
  onSaved,
}) => {
  const { currentUser } = useAuth();
  const docOperator = currentOperatorDisplayName(currentUser);
  const whName = useMemo(() => new Map(warehouses.map((w) => [w.id, w.name])), [warehouses]);
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const { listAvailableBatches } = useStockSnapshot({ enabled: true });

  const canStartEdit = styleAllowsEdit && canEdit;
  const canDoDelete = styleAllowsEdit && canDelete;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DevMaterialDocEditDraft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const batchManagedIds = useMemo(() => {
    const set = new Set<string>();
    const sourceLines = draft?.lines ?? doc.lines.map((l) => ({
      productId: l.productId,
      batchNo: l.batchNo ?? '',
    }));
    for (const line of sourceLines) {
      const p = productMap.get(line.productId);
      if (p?.categoryId && categoryUsesBatchManagement(categoryById.get(p.categoryId))) {
        set.add(line.productId);
      }
    }
    return set;
  }, [draft, doc.lines, productMap, categoryById]);

  const showBatchCol = useMemo(() => {
    const lines = draft?.lines ?? doc.lines.map((l) => ({
      productId: l.productId,
      batchNo: l.batchNo ?? '',
    }));
    return lines.some(
      (l) => batchManagedIds.has(l.productId) || Boolean(String(l.batchNo ?? '').trim()),
    );
  }, [draft, doc.lines, batchManagedIds]);

  const isReturn = doc.type === 'STOCK_RETURN';
  const title = editing
    ? isReturn
      ? '开发退料 · 编辑'
      : '开发领料 · 编辑'
    : isReturn
      ? '开发退料单详情'
      : '开发领料单详情';

  const startEdit = () => {
    if (!canStartEdit) return;
    setDraft(buildDocEditDraft(doc));
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(null);
  };

  const handleClose = () => {
    setEditing(false);
    setDraft(null);
    onClose();
  };

  const handleSave = async () => {
    if (!draft) return;
    const err = validateDocEditDraft(draft, batchManagedIds);
    if (err) {
      toast.error(err);
      return;
    }
    setSubmitting(true);
    try {
      const body = buildDocUpdateBody(draft, docOperator || draft.operator);
      await api.devMaterial.updateDoc(styleId, doc.docNo, body);
      toast.success(`已保存 · ${doc.docNo}`);
      await onSaved();
      handleClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    const label = isReturn ? '退料' : '领料';
    if (!window.confirm(`确定删除该张${label}单 ${doc.docNo} 的全部明细？此操作不可恢复。`)) {
      return;
    }
    setDeleting(true);
    try {
      await api.devMaterial.deleteDoc(styleId, doc.docNo);
      toast.success(`已删除 · ${doc.docNo}`);
      await onSaved();
      handleClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 sm:p-6">
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={handleClose} aria-hidden />
        <div
          className="relative z-10 flex max-h-[min(92vh,960px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
            <div>
              <h3 className={`${sectionTitleClass} flex items-center gap-2`}>
                {isReturn ? (
                  <ArrowDownToLine className="h-4 w-4 text-indigo-600" />
                ) : (
                  <ArrowUpFromLine className="h-4 w-4 text-indigo-600" />
                )}
                {title}
              </h3>
              <p className="mt-1 text-xs font-medium text-slate-400">
                {styleName} · {styleCode}
                <span className="ml-2 font-mono text-indigo-600">{doc.docNo}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {editing && draft ? (
              <>
                <DocEntryTimeField
                  mode="datetime"
                  value={draft.entryTimestamp}
                  onChange={(v) => setDraft((prev) => (prev ? { ...prev, entryTimestamp: v } : null))}
                />
                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                  <table className="w-full min-w-[520px] text-left">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/80">
                        <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-slate-400">物料</th>
                        <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-slate-400">仓库</th>
                        {showBatchCol ? (
                          <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-slate-400">批次</th>
                        ) : null}
                        <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider text-slate-400">数量</th>
                        <th className="w-16 px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider text-slate-400"> </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {draft.lines.map((line) => (
                        <tr key={line.id}>
                          <td className="px-3 py-2">
                            <p className="text-xs font-semibold text-slate-800">{line.productName}</p>
                            {line.productSku ? (
                              <p className="text-[10px] font-medium text-slate-400">{line.productSku}</p>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={line.warehouseId}
                              onChange={(e) =>
                                setDraft((prev) =>
                                  prev
                                    ? updateDraftLine(prev, line.id, {
                                        warehouseId: e.target.value,
                                        batchNo: '',
                                      })
                                    : null,
                                )
                              }
                              className={`w-full min-w-[7rem] ${formStandardControlClass}`}
                            >
                              {warehouses.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.name}{w.code ? ` (${w.code})` : ''}
                                </option>
                              ))}
                            </select>
                          </td>
                          {showBatchCol ? (
                            <td className="px-3 py-2 align-top">
                              {batchManagedIds.has(line.productId) ? (
                                <MaterialIssueBatchSelect
                                  product={productMap.get(line.productId)}
                                  categories={categories}
                                  warehouseId={line.warehouseId}
                                  value={line.batchNo}
                                  onChange={(v) =>
                                    setDraft((prev) =>
                                      prev
                                        ? updateDraftLine(prev, line.id, {
                                            batchNo: clampBatchNoInput(v),
                                          })
                                        : null,
                                    )
                                  }
                                  mode={draft.type === 'STOCK_OUT' ? 'issue' : 'return'}
                                  hideLabel
                                  mergeBatches={listAvailableBatches(line.productId, line.warehouseId)}
                                />
                              ) : (
                                <span className="text-[10px] font-medium text-slate-300">—</span>
                              )}
                            </td>
                          ) : null}
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={line.quantity}
                              onChange={(e) => {
                                const v = e.target.value === '' ? 0 : Number(e.target.value);
                                setDraft((prev) =>
                                  prev ? updateDraftLine(prev, line.id, { quantity: v }) : null,
                                );
                              }}
                              className={`w-24 text-right ${formStandardControlClass}`}
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              title="删除本行"
                              disabled={draft.lines.length <= 1}
                              onClick={() =>
                                setDraft((prev) => (prev ? removeDraftLine(prev, line.id) : null))
                              }
                              className="rounded p-1 text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium text-slate-400">
                  <span className="rounded-lg bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600">
                    {isReturn ? '退料' : '领料'}
                  </span>
                  <span>{new Date(doc.timestamp).toLocaleString()}</span>
                  {doc.operator ? <span>· {doc.operator}</span> : null}
                </div>
                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/80">
                        <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap">物料</th>
                        <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap">仓库</th>
                        {showBatchCol ? (
                          <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap">批次</th>
                        ) : null}
                        <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap">数量</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {doc.lines.map((line) => (
                        <tr key={line.id}>
                          <td className="px-3 py-2">
                            <p className="text-xs font-semibold text-slate-800">{line.productName}</p>
                            {line.productSku ? (
                              <p className="text-[10px] font-medium text-slate-400">{line.productSku}</p>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-xs font-medium text-slate-600">
                            {line.warehouseId ? whName.get(line.warehouseId) ?? line.warehouseId : '—'}
                          </td>
                          {showBatchCol ? (
                            <td className="px-3 py-2 text-xs font-medium text-slate-600">
                              {line.batchNo || '无批号'}
                            </td>
                          ) : null}
                          <td className="px-3 py-2 text-right text-xs font-semibold text-slate-800">
                            {line.quantity}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!styleAllowsEdit && (canEdit || canDelete) ? (
                  <p className="text-[10px] font-medium text-amber-600">
                    仅开发中的款式可编辑或删除领退料单据
                  </p>
                ) : null}
              </>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleSave()}
                  className={`${primaryToolbarButtonClass} disabled:opacity-50`}
                >
                  {submitting ? '保存中…' : '保存'}
                </button>
              </>
            ) : (
              <>
                {canDoDelete ? (
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => void handleDelete()}
                    className={`${outlineToolbarButtonClass} border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </button>
                ) : null}
                {canStartEdit ? (
                  <button type="button" onClick={startEdit} className={primaryToolbarButtonClass}>
                    编辑
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                >
                  关闭
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

export default DevMaterialDocDetailModal;
