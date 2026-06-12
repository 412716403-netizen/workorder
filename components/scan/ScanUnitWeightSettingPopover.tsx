import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Settings2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Product, ProductVariant } from '../../types';
import { DEFAULT_WEIGHT_TOLERANCE_PERCENT } from '../../types';
import { useAppActions, useConfigData, useMasterData } from '../../contexts/AppDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { hasSubPermission } from '../../utils/hasSubPermission';
import { VariantNodeWeightSection } from '../../views/product-management/VariantNodeWeightSection';
import { useReceiveUnitWeightAverages } from '../../hooks/useReceiveUnitWeightAverages';
import { useTraceabilityPlugin } from '../../hooks/useTraceabilityPlugin';

export interface ScanUnitWeightScanContext {
  variantId: string;
  nodeId: string;
  variantLabel: string;
  nodeName: string;
}

export interface ScanUnitWeightSettingPopoverProps {
  productId: string;
  productName: string;
  scanContext: ScanUnitWeightScanContext;
  onSaved: () => void;
}

function parsePositive(raw: string): number | undefined {
  const n = parseFloat(raw.trim());
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

export function ScanUnitWeightSettingPopover({
  productId,
  productName,
  scanContext,
  onSaved,
}: ScanUnitWeightSettingPopoverProps) {
  const { products, globalNodes, dictionaries } = useMasterData();
  const { weightTolerancePercent } = useConfigData();
  const { onUpdateProduct, onUpdateWeightTolerancePercent } = useAppActions();
  const { tenantCtx } = useAuth();
  const canEditProduct = hasSubPermission(tenantCtx?.permissions, 'basic:products:edit');
  const canEditTolerance = hasSubPermission(tenantCtx?.permissions, 'settings:config:edit');
  const { weightEnabled } = useTraceabilityPlugin();

  const [open, setOpen] = useState(false);
  const [draftVariants, setDraftVariants] = useState<ProductVariant[] | null>(null);
  const [draftTolerance, setDraftTolerance] = useState(String(DEFAULT_WEIGHT_TOLERANCE_PERCENT));
  const [saving, setSaving] = useState(false);

  const product = products.find(p => p.id === productId);
  const avgReceiveUnitWeightKg = useReceiveUnitWeightAverages(productId, open && weightEnabled);

  const weightNodes = useMemo(() => {
    if (!product?.milestoneNodeIds?.length) return [];
    return product.milestoneNodeIds
      .map(id => globalNodes.find(n => n.id === id))
      .filter((n): n is NonNullable<typeof n> => !!n);
  }, [product, globalNodes]);

  useEffect(() => {
    if (!open || !product) return;
    setDraftVariants(
      product.variants.map(v => ({
        ...v,
        nodeUnitWeights: { ...(v.nodeUnitWeights ?? {}) },
      })),
    );
    const tol =
      weightTolerancePercent > 0 ? weightTolerancePercent : DEFAULT_WEIGHT_TOLERANCE_PERCENT;
    setDraftTolerance(String(tol));
  }, [open, product, weightTolerancePercent]);

  const handleSave = useCallback(async () => {
    if (!product || !draftVariants) return;
    const tol = parsePositive(draftTolerance) ?? DEFAULT_WEIGHT_TOLERANCE_PERCENT;
    if (tol > 100) {
      toast.warning('容差百分比不能超过 100');
      return;
    }
    setSaving(true);
    try {
      if (canEditProduct) {
        const saved = await onUpdateProduct({ ...product, variants: draftVariants } as Product);
        if (!saved) return;
      }
      if (canEditTolerance) {
        const current =
          weightTolerancePercent > 0 ? weightTolerancePercent : DEFAULT_WEIGHT_TOLERANCE_PERCENT;
        if (Math.abs(tol - current) > 0.0001) {
          await onUpdateWeightTolerancePercent(tol);
        }
      }
      toast.success('称重设置已保存');
      onSaved();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }, [
    product,
    draftVariants,
    draftTolerance,
    canEditProduct,
    canEditTolerance,
    onUpdateProduct,
    onUpdateWeightTolerancePercent,
    weightTolerancePercent,
    onSaved,
  ]);

  if (!weightEnabled || (!canEditProduct && !canEditTolerance)) return null;

  const draftProduct =
    product && draftVariants ? ({ ...product, variants: draftVariants } as Product) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-indigo-500 hover:bg-indigo-50 hover:text-indigo-700"
        title="设置理论重量与容差"
        aria-label="设置理论重量与容差"
      >
        <Settings2 className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="scan-unit-weight-title"
          onClick={() => !saving && setOpen(false)}
        >
          <div
            className="flex max-h-[min(88dvh,40rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="min-w-0 pr-3">
                <p className="text-[10px] font-bold text-slate-400">理论重量设置</p>
                <h2
                  id="scan-unit-weight-title"
                  className="truncate text-base font-black text-indigo-700"
                >
                  {productName}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => !saving && setOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
                title="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-800">称重容差</p>
                  <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
                    实测与理论偏差超过此百分比时告警（默认 ±{DEFAULT_WEIGHT_TOLERANCE_PERCENT}%）
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-500">±</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    disabled={!canEditTolerance}
                    value={draftTolerance}
                    onChange={e => setDraftTolerance(e.target.value)}
                    data-scan-manual-input="true"
                    className="h-9 w-20 rounded-lg border border-slate-200 bg-white px-2 text-right text-xs font-bold tabular-nums text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-100 disabled:text-slate-500"
                  />
                  <span className="text-xs font-bold text-slate-500">%</span>
                </div>
              </div>

              {draftProduct ? (
                <VariantNodeWeightSection
                  product={draftProduct}
                  nodes={weightNodes}
                  dictionaries={dictionaries}
                  onChange={setDraftVariants}
                  readOnly={!canEditProduct}
                  highlightVariantId={scanContext.variantId}
                  highlightNodeId={scanContext.nodeId}
                  avgReceiveUnitWeightKg={avgReceiveUnitWeightKg}
                />
              ) : (
                <p className="py-8 text-center text-xs text-slate-500">未找到产品档案，请刷新后重试</p>
              )}
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || (canEditProduct && !draftProduct)}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
