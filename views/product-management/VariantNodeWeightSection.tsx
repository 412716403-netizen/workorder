import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Scale, X } from 'lucide-react';
import type { GlobalNodeTemplate, Product, ProductVariant } from '../../types';
import { sortVariantsByColorThenSize } from '../../utils/sortVariantsByProduct';
import { countConfiguredNodeUnitWeights } from '../../utils/variantNodeUnitWeight';
import { formatWeightKg } from '../../utils/scanWeightCheck';
import { useReceiveUnitWeightAverages } from '../../hooks/useReceiveUnitWeightAverages';
import { useTraceabilityPlugin } from '../../hooks/useTraceabilityPlugin';
import type { AppDictionaries } from '../../types';

export interface VariantNodeWeightSectionProps {
  product: Product;
  nodes: GlobalNodeTemplate[];
  dictionaries: AppDictionaries;
  onChange: (variants: ProductVariant[]) => void;
  readOnly?: boolean;
  highlightVariantId?: string;
  highlightNodeId?: string;
  /** 规格×工序历史外协收货单件重量均值，键 `${variantId}:${nodeId}` */
  avgReceiveUnitWeightKg?: Record<string, number>;
}

function cellKey(variantId: string, nodeId: string): string {
  return `${variantId}:${nodeId}`;
}

function draftsFromProduct(product: Product, nodes: GlobalNodeTemplate[]): Record<string, string> {
  const next: Record<string, string> = {};
  for (const v of product.variants) {
    for (const node of nodes) {
      const w = v.nodeUnitWeights?.[node.id];
      next[cellKey(v.id, node.id)] = w != null && w > 0 ? String(w) : '';
    }
  }
  return next;
}

function parseWeightRaw(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const n = parseFloat(trimmed);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

const weightInputClass =
  'w-[4.75rem] rounded-lg border px-2 py-1 text-xs font-bold tabular-nums text-center text-slate-800 outline-none';

function AvgReceiveWeightBadge({ avgKg }: { avgKg: number }) {
  return (
    <span
      className="inline-flex max-w-full items-center justify-center gap-0.5 rounded-md bg-slate-100 px-1.5 py-px text-[10px] font-bold leading-tight tabular-nums text-slate-600 ring-1 ring-inset ring-slate-200/80"
      title="历史外协收货单件重量均值（总交货重÷总收货件数）"
    >
      <span className="text-[9px] font-black text-slate-500">收货均</span>
      <span className="text-slate-700">{formatWeightKg(avgKg)}</span>
      <span className="text-[9px] font-medium text-slate-500">kg</span>
    </span>
  );
}

export function VariantNodeWeightSection({
  product,
  nodes,
  dictionaries,
  onChange,
  readOnly = false,
  highlightVariantId,
  highlightNodeId,
  avgReceiveUnitWeightKg,
}: VariantNodeWeightSectionProps) {
  const variants = sortVariantsByColorThenSize(product.variants, product.colorIds, product.sizeIds);

  const structureKey = useMemo(
    () =>
      `${product.id}:${product.variants.map(v => v.id).join(',')}:${nodes.map(n => n.id).join(',')}`,
    [product.id, product.variants, nodes],
  );

  const [cellDrafts, setCellDrafts] = useState<Record<string, string>>(() =>
    draftsFromProduct(product, nodes),
  );

  useEffect(() => {
    setCellDrafts(draftsFromProduct(product, nodes));
  }, [structureKey, product, nodes]);

  const labelForVariant = useCallback(
    (v: ProductVariant) => {
      const color = dictionaries.colors.find(c => c.id === v.colorId)?.name ?? '';
      const size = dictionaries.sizes.find(s => s.id === v.sizeId)?.name ?? '';
      if (color && size) return `${color} / ${size}`;
      if (color) return color;
      if (size) return size;
      return v.skuSuffix || v.id;
    },
    [dictionaries.colors, dictionaries.sizes],
  );

  const commitCell = (variantId: string, nodeId: string, raw: string) => {
    if (readOnly) return;
    const parsed = parseWeightRaw(raw);
    const display = parsed != null ? String(parsed) : '';
    setCellDrafts(prev => ({ ...prev, [cellKey(variantId, nodeId)]: display }));

    const nextVariants = product.variants.map(v => {
      if (v.id !== variantId) return v;
      const weights = { ...(v.nodeUnitWeights ?? {}) };
      if (parsed == null) delete weights[nodeId];
      else weights[nodeId] = parsed;
      return { ...v, nodeUnitWeights: weights };
    });
    onChange(nextVariants);
  };

  if (nodes.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-center text-xs text-slate-500">
        请先在标准路线中加入已开启「扫码称重」的工序，再维护各规格的单件标准重量。
      </p>
    );
  }

  if (variants.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-center text-xs text-slate-500">
        请先配置产品颜色/尺码规格后，再维护单件标准重量。
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/80">
            <th className="sticky left-0 z-10 bg-slate-50/95 px-3 py-2 text-left font-bold text-slate-600">规格</th>
            {nodes.map(node => (
              <th key={node.id} className="min-w-[6.5rem] px-2 py-2 text-center font-bold text-slate-600">
                <div>{node.name}</div>
                <div className="mt-0.5 text-[9px] font-medium text-slate-400">标准 / 收货均</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {variants.map(v => (
            <tr key={v.id} className="border-b border-slate-50 last:border-0">
              <td className="sticky left-0 z-10 bg-white px-3 py-2 font-bold text-slate-800">{labelForVariant(v)}</td>
              {nodes.map(node => {
                const highlighted =
                  highlightVariantId === v.id && highlightNodeId === node.id;
                const key = cellKey(v.id, node.id);
                const avgKg = avgReceiveUnitWeightKg?.[key];
                return (
                  <td key={node.id} className="px-2 py-1.5 text-center align-top">
                    <div className="inline-flex flex-col items-center gap-1">
                      <input
                      type="text"
                      inputMode="decimal"
                      placeholder="—"
                      readOnly={readOnly}
                      disabled={readOnly}
                      value={cellDrafts[key] ?? ''}
                      onChange={e => {
                        if (readOnly) return;
                        setCellDrafts(prev => ({ ...prev, [key]: e.target.value }));
                      }}
                      onBlur={e => commitCell(v.id, node.id, e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                        }
                      }}
                      data-scan-manual-input="true"
                      className={`${weightInputClass} ${
                        highlighted
                          ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200'
                          : 'border-slate-200 focus:ring-2 focus:ring-indigo-500'
                      } ${readOnly ? 'cursor-default bg-slate-50 text-slate-600' : 'bg-white'}`}
                    />
                      {avgKg != null && avgKg > 0 ? <AvgReceiveWeightBadge avgKg={avgKg} /> : null}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-slate-100 px-3 py-2 text-[10px] leading-relaxed text-slate-500">
        单位 kg；输入框为单件标准重量，扫码称重时用「标准×数量」与秤读数比对。下方「收货均」为历史外协收货实测均值，无称重历史时不显示。
      </p>
    </div>
  );
}

export interface VariantNodeWeightSettingTriggerProps extends VariantNodeWeightSectionProps {
  /** 嵌在「新增产品」弹窗内时需更高 z-index */
  overlayClassName?: string;
}

/** 产品编辑页：仅渲染触发按钮 + 弹窗（无独立卡片区块） */
export function VariantNodeWeightSettingTrigger({
  overlayClassName = 'z-[110]',
  readOnly = false,
  ...props
}: VariantNodeWeightSettingTriggerProps) {
  const { product, nodes, onChange } = props;
  const [open, setOpen] = useState(false);
  const [draftVariants, setDraftVariants] = useState<ProductVariant[] | null>(null);
  const { weightEnabled } = useTraceabilityPlugin();
  const avgReceiveUnitWeightKg = useReceiveUnitWeightAverages(
    product.id,
    open && weightEnabled,
  );

  const nodeIds = useMemo(() => nodes.map(n => n.id), [nodes]);
  const { filled, total } = useMemo(
    () => countConfiguredNodeUnitWeights(product.variants, nodeIds),
    [product.variants, nodeIds],
  );

  const canOpen = nodes.length > 0 && product.variants.length > 0;

  const summaryText = useMemo(() => {
    if (nodes.length === 0) return '请先在标准路线中加入已开启「扫码称重」的工序';
    if (product.variants.length === 0) return '请先配置产品颜色/尺码规格';
    if (filled === 0) return '尚未维护标准重量';
    if (filled >= total) return `已全部维护（${total} 项）`;
    return `已维护 ${filled} / ${total} 项`;
  }, [nodes.length, product.variants.length, filled, total]);

  useEffect(() => {
    if (!open) return;
    setDraftVariants(
      product.variants.map(v => ({
        ...v,
        nodeUnitWeights: { ...(v.nodeUnitWeights ?? {}) },
      })),
    );
  }, [open, product.variants]);

  const draftProduct =
    draftVariants != null ? ({ ...product, variants: draftVariants } as Product) : null;

  const handleConfirm = () => {
    if (draftVariants) onChange(draftVariants);
    setOpen(false);
  };

  const modal =
    open && draftProduct && typeof document !== 'undefined'
      ? createPortal(
          <div
            className={`fixed inset-0 ${overlayClassName} flex items-center justify-center bg-slate-900/50 p-4`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="variant-node-weight-modal-title"
            onClick={() => setOpen(false)}
          >
            <div
              className="flex max-h-[min(88dvh,40rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
                <div className="min-w-0 pr-3">
                  <h2
                    id="variant-node-weight-modal-title"
                    className="truncate text-sm font-black text-slate-900"
                  >
                    单件标准重量 · {product.name || product.sku || '未命名产品'}
                  </h2>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    按规格 × 工序维护，用于扫码称重校验
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
                  title="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <VariantNodeWeightSection
                  {...props}
                  product={draftProduct}
                  onChange={setDraftVariants}
                  readOnly={readOnly}
                  avgReceiveUnitWeightKg={avgReceiveUnitWeightKg}
                />
              </div>
              <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={readOnly}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  确定
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  if (nodes.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!canOpen || readOnly}
        title={summaryText}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:border-emerald-200 hover:bg-emerald-50/80 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Scale className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <span>设置单件标准重量</span>
        {canOpen && filled > 0 ? (
          <span className="text-[10px] font-bold tabular-nums text-slate-400">
            {filled}/{total}
          </span>
        ) : null}
      </button>
      {modal}
    </>
  );
}
