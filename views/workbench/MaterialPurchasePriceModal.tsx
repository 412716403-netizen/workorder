import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChevronRight, Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  useMaterialPriceSettings,
  useMaterialPriceParentProducts,
  useMaterialPriceBomMaterials,
  usePatchParentMaterialPriceDefaultRule,
  usePatchBomMaterialPriceOverride,
} from '../../hooks/useMaterialPurchasePrices';
import {
  MATERIAL_PRICE_RULE_SOURCE_LABEL,
  MATERIAL_PRICE_SOURCE_LABEL,
  formatMaterialPriceRuleLabel,
  resolveParentBomDefaultRule,
  type MaterialPriceBomMaterialRow,
  type MaterialPriceParentProductRow,
  type MaterialPriceRule,
  type MaterialPriceRuleOverride,
} from '../../types';
import { formatWorkbenchAmount } from './widgets/WorkbenchKpiCard';

interface MaterialPurchasePriceModalProps {
  open: boolean;
  onClose: () => void;
  showAmount: boolean;
  onSaved?: () => void;
}

type ProductBomRuleMode = 'fixed_range' | 'last_purchase';

function materialOverrideModeFromRow(row: MaterialPriceBomMaterialRow): ProductBomRuleMode {
  if (row.hasIndividualOverride && row.ruleSource === 'material_override' && row.ruleLabel.includes('~')) {
    return 'fixed_range';
  }
  return 'last_purchase';
}

function buildProductBomRule(
  mode: ProductBomRuleMode,
  startDate: string,
  endDate: string,
): MaterialPriceRule {
  if (mode === 'last_purchase') return { mode: 'last_purchase' };
  return { mode: 'fixed_range', startDate, endDate };
}

function productBomRuleModeFromRule(rule: MaterialPriceRule | null): ProductBomRuleMode {
  const effective = resolveParentBomDefaultRule(rule);
  return effective.mode === 'fixed_range' ? 'fixed_range' : 'last_purchase';
}

function ProductBomRuleEditor({
  parentDefaultRule,
  canEdit,
  saving,
  onSave,
}: {
  parentDefaultRule: MaterialPriceRule | null;
  canEdit: boolean;
  saving: boolean;
  onSave: (rule: MaterialPriceRule) => Promise<void>;
}) {
  const effectiveRule = resolveParentBomDefaultRule(parentDefaultRule);
  const [mode, setMode] = useState<ProductBomRuleMode>(productBomRuleModeFromRule(parentDefaultRule));
  const [startDate, setStartDate] = useState(
    effectiveRule.mode === 'fixed_range' ? effectiveRule.startDate : '',
  );
  const [endDate, setEndDate] = useState(
    effectiveRule.mode === 'fixed_range' ? effectiveRule.endDate : '',
  );

  useEffect(() => {
    const next = resolveParentBomDefaultRule(parentDefaultRule);
    setMode(productBomRuleModeFromRule(parentDefaultRule));
    if (next.mode === 'fixed_range') {
      setStartDate(next.startDate);
      setEndDate(next.endDate);
    } else {
      setStartDate('');
      setEndDate('');
    }
  }, [parentDefaultRule]);

  const handleSave = async () => {
    if (mode === 'fixed_range') {
      if (!startDate || !endDate) {
        toast.error('请填写起止日期');
        return;
      }
      if (startDate > endDate) {
        toast.error('结束日期不能早于开始日期');
        return;
      }
    }
    await onSave(buildProductBomRule(mode, startDate, endDate));
  };

  return (
    <div className="rounded-xl border border-violet-100 bg-violet-50/40 px-4 py-3">
      <div className="mb-2">
        <span className="text-xs font-black text-slate-800">成品 BOM 统计规则</span>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['last_purchase', '最近一次采购价'],
              ['fixed_range', '自定义时间'],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] ${
                mode === value
                  ? 'border-violet-300 bg-white font-bold text-violet-700'
                  : 'border-slate-200 bg-white text-slate-600'
              } ${!canEdit ? 'pointer-events-none opacity-70' : ''}`}
            >
              <input
                type="radio"
                name="product-bom-material-price-rule"
                checked={mode === value}
                disabled={!canEdit}
                onChange={() => setMode(value)}
              />
              {label}
            </label>
          ))}
        </div>
        {mode === 'fixed_range' ? (
          <>
            <input
              type="date"
              value={startDate}
              disabled={!canEdit}
              onChange={e => setStartDate(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs disabled:opacity-60"
            />
            <span className="text-xs text-slate-400">~</span>
            <input
              type="date"
              value={endDate}
              disabled={!canEdit}
              onChange={e => setEndDate(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs disabled:opacity-60"
            />
          </>
        ) : null}
        {canEdit ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {saving ? '保存中…' : '保存规则'}
          </button>
        ) : (
          <span className="text-[11px] text-slate-500">
            {formatMaterialPriceRuleLabel(effectiveRule)}
          </span>
        )}
      </div>
    </div>
  );
}

const MaterialPurchasePriceModal: React.FC<MaterialPurchasePriceModalProps> = ({
  open,
  onClose,
  showAmount,
  onSaved,
}) => {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedParent, setSelectedParent] = useState<MaterialPriceParentProductRow | null>(null);
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(t);
  }, [open, search]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setDebouncedSearch('');
      setSelectedParent(null);
      setEditingMaterialId(null);
    }
  }, [open]);

  const settingsQuery = useMaterialPriceSettings();
  const parentQuery = useMaterialPriceParentProducts(debouncedSearch);
  const bomQuery = useMaterialPriceBomMaterials(selectedParent?.productId ?? null);
  const patchParentMutation = usePatchParentMaterialPriceDefaultRule(selectedParent?.productId ?? null);
  const patchMaterialMutation = usePatchBomMaterialPriceOverride(selectedParent?.productId ?? null);

  const canEditProduct = settingsQuery.data?.canEditProduct ?? false;
  const parentRows = parentQuery.data?.rows ?? [];
  const bomRows = bomQuery.data?.rows ?? [];
  const parentDefaultRule = bomQuery.data?.parentDefaultRule ?? null;

  const priceSourceLabel = useMemo(
    () => (source: MaterialPriceBomMaterialRow['priceSource']) =>
      source ? MATERIAL_PRICE_SOURCE_LABEL[source] : '—',
    [],
  );

  const saveProductBomRule = async (rule: MaterialPriceRule) => {
    if (!selectedParent) return;
    try {
      await patchParentMutation.mutateAsync(rule);
      setEditingMaterialId(null);
      toast.success('已保存成品 BOM 统计规则，单物料单独设置已同步清除');
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    }
  };

  const saveMaterialOverride = async (materialId: string, override: MaterialPriceRuleOverride) => {
    try {
      await patchMaterialMutation.mutateAsync({ materialId, rule: override });
      toast.success('已保存单物料规则');
      setEditingMaterialId(null);
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/45 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(90vh,760px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="material-price-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            <h2 id="material-price-title" className="text-lg font-black text-slate-900">
              物料采购均价
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              选择带 BOM 的成品，设定其下物料的采购均价统计规则；默认按<strong className="font-bold text-slate-600">最近一次采购价</strong>，也可改为自定义时间区间；单条物料可单独覆盖。
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="shrink-0 border-b border-slate-100 px-6 py-3">
          {selectedParent ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-bold text-violet-600 hover:bg-violet-50"
                onClick={() => {
                  setSelectedParent(null);
                  setEditingMaterialId(null);
                }}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                成品列表
              </button>
              <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
              <span className="font-bold text-slate-800">{selectedParent.name}</span>
              <span className="text-slate-400">{selectedParent.sku}</span>
            </div>
          ) : (
            <div className="relative max-w-md">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
              <input
                className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs"
                placeholder="搜索成品名称 / SKU"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-2">
          {!selectedParent ? (
            parentQuery.isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-7 w-7 animate-spin text-violet-300" />
              </div>
            ) : parentRows.length === 0 ? (
              <p className="py-16 text-center text-sm text-slate-400">
                {parentQuery.isFetching ? '加载中…' : '暂无带 BOM 的成品或未匹配结果'}
              </p>
            ) : (
              <table className="w-full table-fixed text-xs">
                <colgroup>
                  <col style={{ width: '25%' }} />
                  <col style={{ width: '25%' }} />
                  <col style={{ width: '25%' }} />
                  <col style={{ width: '25%' }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] text-slate-400">
                    <th className="px-3 py-2 font-medium">成品</th>
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 text-center font-medium">BOM 物料数</th>
                    <th className="px-3 py-2 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {parentRows.map(row => (
                    <tr key={row.productId} className="border-b border-slate-50 align-middle">
                      <td className="truncate px-3 py-2.5 font-medium text-slate-800" title={row.name}>
                        {row.name}
                      </td>
                      <td className="truncate px-3 py-2.5 text-slate-500" title={row.sku}>
                        {row.sku}
                      </td>
                      <td className="px-3 py-2.5 text-center tabular-nums text-slate-600">
                        {row.materialCount}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          className="inline-flex items-center gap-0.5 rounded-lg px-2 py-1 text-[11px] font-bold text-violet-600 hover:bg-violet-50"
                          onClick={() => setSelectedParent(row)}
                        >
                          查看
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : bomQuery.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-violet-300" />
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <ProductBomRuleEditor
                parentDefaultRule={parentDefaultRule}
                canEdit={canEditProduct}
                saving={patchParentMutation.isPending}
                onSave={saveProductBomRule}
              />

              {bomRows.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-400">该成品暂无 BOM 物料</p>
              ) : (
                <table className="w-full table-fixed text-xs">
                  <colgroup>
                    {canEditProduct ? (
                      <>
                        <col style={{ width: '20%' }} />
                        <col style={{ width: '20%' }} />
                        <col style={{ width: '20%' }} />
                        <col style={{ width: '20%' }} />
                        <col style={{ width: '20%' }} />
                      </>
                    ) : (
                      <>
                        <col style={{ width: '25%' }} />
                        <col style={{ width: '25%' }} />
                        <col style={{ width: '25%' }} />
                        <col style={{ width: '25%' }} />
                      </>
                    )}
                  </colgroup>
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] text-slate-400">
                      <th className="px-3 py-2 font-medium">物料</th>
                      <th className="px-3 py-2 font-medium">SKU</th>
                      <th className="px-3 py-2 text-center font-medium">核算单价</th>
                      <th className="px-3 py-2 font-medium">规则来源</th>
                      {canEditProduct ? <th className="px-3 py-2 text-right font-medium">操作</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {bomRows.map(row => (
                      <MaterialRow
                        key={row.materialId}
                        row={row}
                        showAmount={showAmount}
                        canEdit={canEditProduct}
                        editing={editingMaterialId === row.materialId}
                        priceSourceLabel={priceSourceLabel}
                        saving={patchMaterialMutation.isPending}
                        onBeginEdit={() => setEditingMaterialId(row.materialId)}
                        onCancelEdit={() => setEditingMaterialId(null)}
                        onSaveOverride={rule => void saveMaterialOverride(row.materialId, rule)}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

function MaterialRow({
  row,
  showAmount,
  canEdit,
  editing,
  priceSourceLabel,
  saving,
  onBeginEdit,
  onCancelEdit,
  onSaveOverride,
}: {
  row: MaterialPriceBomMaterialRow;
  showAmount: boolean;
  canEdit: boolean;
  editing: boolean;
  priceSourceLabel: (source: MaterialPriceBomMaterialRow['priceSource']) => string;
  saving: boolean;
  onBeginEdit: () => void;
  onCancelEdit: () => void;
  onSaveOverride: (rule: MaterialPriceRuleOverride) => void;
}) {
  const [mode, setMode] = useState<ProductBomRuleMode>(materialOverrideModeFromRow(row));
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (!editing) return;
    const nextMode = materialOverrideModeFromRow(row);
    setMode(nextMode);
    if (nextMode === 'fixed_range' && row.ruleLabel.includes('~')) {
      const parts = row.ruleLabel.split(' ~ ');
      setStartDate(parts[0] ?? '');
      setEndDate(parts[1] ?? '');
    } else {
      setStartDate('');
      setEndDate('');
    }
  }, [editing, row]);

  const handleSave = () => {
    if (mode === 'fixed_range') {
      if (!startDate || !endDate) {
        toast.error('请填写起止日期');
        return;
      }
      if (startDate > endDate) {
        toast.error('结束日期不能早于开始日期');
        return;
      }
      onSaveOverride({ mode: 'fixed_range', startDate, endDate });
      return;
    }
    onSaveOverride({ mode: 'last_purchase' });
  };

  const handleRestoreParent = () => {
    onSaveOverride({ inherit: true });
  };

  return (
    <>
      <tr className="border-b border-slate-50 align-middle">
        <td className="truncate px-3 py-2.5 font-medium text-slate-800" title={row.name}>
          {row.name}
        </td>
        <td className="truncate px-3 py-2.5 text-slate-500" title={row.sku}>
          {row.sku}
        </td>
        <td className="px-3 py-2.5 text-center tabular-nums">
          <div className="font-bold text-slate-800">
            {formatWorkbenchAmount(row.unitPrice ?? 0, showAmount && row.unitPrice != null)}
          </div>
          {row.priceSource ? (
            <div className="mt-0.5 text-[10px] text-slate-400">{priceSourceLabel(row.priceSource)}</div>
          ) : null}
        </td>
        <td className="px-3 py-2.5 text-slate-600">
          <div className="truncate" title={row.ruleLabel}>{row.ruleLabel}</div>
          <div className="mt-0.5 truncate text-[10px] text-slate-400">
            {MATERIAL_PRICE_RULE_SOURCE_LABEL[row.ruleSource]}
            {row.hasIndividualOverride ? ' · 单独覆盖' : ''}
          </div>
        </td>
        {canEdit ? (
          <td className="px-3 py-2.5 text-right">
            {!editing ? (
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-[11px] font-bold text-violet-600 hover:bg-violet-50"
                onClick={onBeginEdit}
              >
                设置
              </button>
            ) : null}
          </td>
        ) : null}
      </tr>
      {editing && canEdit ? (
        <tr className="border-b border-violet-50 bg-violet-50/40">
          <td colSpan={canEdit ? 5 : 4} className="px-3 py-3">
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-slate-600">单物料规则 · {row.name}</div>
              <div className="flex flex-wrap items-end gap-3">
                {(
                  [
                    ['last_purchase', '最近一次采购价'],
                    ['fixed_range', '自定义时间'],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] ${
                      mode === value
                        ? 'border-violet-300 bg-white font-bold text-violet-700'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      checked={mode === value}
                      onChange={() => setMode(value)}
                    />
                    {label}
                  </label>
                ))}
                {mode === 'fixed_range' ? (
                  <>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                    />
                    <span className="text-xs text-slate-400">~</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                    />
                  </>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSave}
                    className="rounded-lg bg-violet-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-violet-700 disabled:opacity-60"
                  >
                    {saving ? '保存中…' : '保存'}
                  </button>
                  <button
                    type="button"
                    onClick={onCancelEdit}
                    className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-slate-100"
                  >
                    取消
                  </button>
                  {row.hasIndividualOverride ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleRestoreParent}
                      className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-60"
                    >
                      恢复成品规则
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export default MaterialPurchasePriceModal;
