import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { ListChecks, Plus, Search } from 'lucide-react';
import type { Product, ProductCategory } from '../../types';
import { useAuthOptional } from '../../contexts/AuthContext';
import { hasSubPermission } from '../../utils/hasSubPermission';
import { isProductEnabled } from '../../utils/productEnabled';
import { productMatchesSearchQuery } from '../../utils/productSearchMatch';
import { lazyWithReloadOnChunkError } from '../../utils/lazyWithReloadOnChunkError';

const LazyProductArchiveCreateModal = lazyWithReloadOnChunkError(() => import('../../components/ProductArchiveCreateModal'));

/** BOM 弹窗内：批量勾选产品后加入多行，再逐行填用量（与单行 SearchableProductSelect 互补） */
export type BomBatchAddPanelProps = {
  open: boolean;
  onClose: () => void;
  options: Product[];
  categories: ProductCategory[];
  alreadyUsedProductIds: string[];
  /** 含颜色/尺码的产品，不可批量加入 BOM */
  blockedProductIds: string[];
  parentProductId: string;
  onConfirm: (rows: { productId: string; categoryId?: string }[]) => void;
  /** 在「新增产品」弹窗内嵌编辑时关闭，避免再叠一层新建弹窗 */
  allowQuickCreate?: boolean;
};

export function BomBatchAddPanel({
  open,
  onClose,
  options,
  categories,
  alreadyUsedProductIds,
  blockedProductIds,
  parentProductId,
  onConfirm,
  allowQuickCreate = true,
}: BomBatchAddPanelProps) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  const auth = useAuthOptional();
  const canQuickCreate = useMemo(() => {
    const tctx = auth?.tenantCtx;
    if (!tctx) return false;
    if (tctx.tenantRole === 'owner') return true;
    return (
      hasSubPermission(tctx.permissions, 'basic:products:view') &&
      hasSubPermission(tctx.permissions, 'basic:products:create')
    );
  }, [auth]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setActiveTab('all');
      setPicked(new Set());
      setQuickCreateOpen(false);
    }
  }, [open]);

  const usedSet = useMemo(() => new Set(alreadyUsedProductIds.filter(Boolean)), [alreadyUsedProductIds]);
  const blockedSet = useMemo(() => new Set(blockedProductIds.filter(Boolean)), [blockedProductIds]);

  const pool = useMemo(
    () => options.filter(p => p.id !== parentProductId && isProductEnabled(p)),
    [options, parentProductId],
  );

  const filtered = useMemo(() => {
    return pool
      .filter(p => {
        const q = search.trim();
        const cat = categories.find(c => c.id === p.categoryId) ?? null;
        const matchesSearch = productMatchesSearchQuery(p, cat, q);
        const matchesCategory = activeTab === 'all' || p.categoryId === activeTab;
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id));
  }, [pool, search, activeTab, categories]);

  const tabBtnCls = (active: boolean) =>
    `px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all whitespace-nowrap shrink-0 ${active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`;

  const toggle = (id: string) => {
    if (usedSet.has(id) || blockedSet.has(id)) return;
    setPicked(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const selectAllVisible = () => {
    setPicked(prev => {
      const n = new Set(prev);
      for (const p of filtered) {
        if (!usedSet.has(p.id) && !blockedSet.has(p.id)) n.add(p.id);
      }
      return n;
    });
  };

  const clearPicked = () => setPicked(new Set());

  const handleConfirm = () => {
    const ids = [...picked].filter(id => !usedSet.has(id) && !blockedSet.has(id));
    if (ids.length === 0) return;
    onConfirm(
      ids.map(id => {
        const p = options.find(x => x.id === id);
        return { productId: id, categoryId: p?.categoryId };
      }),
    );
    onClose();
  };

  const pickedValid = [...picked].filter(id => !usedSet.has(id) && !blockedSet.has(id));
  const visibleSelectable = filtered.filter(p => !usedSet.has(p.id) && !blockedSet.has(p.id)).length;

  if (!open) return null;

  return (
    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3" data-bom-batch-panel>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-black text-indigo-800 uppercase tracking-wider flex items-center gap-1.5">
            <ListChecks className="w-3.5 h-3.5" /> 批量勾选添加
          </p>
          <p className="text-[10px] text-slate-500 mt-1 leading-relaxed max-w-md">
            勾选多个物料后一次加入下方清单，再逐行填写用量；已在本 BOM 中的不可重复勾选。带颜色/尺码的产品不可作 BOM 子件。仍可用「添加物料清单行」逐条搜索单选。
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canQuickCreate && allowQuickCreate && (
            <button
              type="button"
              onClick={() => setQuickCreateOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-black uppercase tracking-wider hover:bg-indigo-700 shadow-sm shadow-indigo-600/20 transition-all"
            >
              <Plus className="w-3 h-3" /> 新增产品
            </button>
          )}
          <button type="button" onClick={onClose} className="text-[10px] font-bold text-slate-500 hover:text-slate-800">
            收起
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        <input
          type="text"
          className="w-full bg-white border border-slate-200 rounded-lg py-2 pl-9 pr-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="名称、SKU 或自定义内容筛选…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
        <button type="button" onClick={() => setActiveTab('all')} className={tabBtnCls(activeTab === 'all')}>
          全部
        </button>
        {categories.map(cat => (
          <button key={cat.id} type="button" onClick={() => setActiveTab(cat.id)} className={tabBtnCls(activeTab === cat.id)}>
            {cat.name}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={selectAllVisible}
          disabled={visibleSelectable === 0}
          className="text-[10px] font-bold text-indigo-600 hover:underline disabled:opacity-40 disabled:no-underline"
        >
          全选当前列表
        </button>
        <button type="button" onClick={clearPicked} disabled={picked.size === 0} className="text-[10px] font-bold text-slate-500 hover:underline disabled:opacity-40">
          清除勾选
        </button>
      </div>

      <div className="max-h-52 overflow-y-auto custom-scrollbar rounded-xl border border-slate-200 bg-white divide-y divide-slate-50">
        {filtered.map(p => {
          const used = usedSet.has(p.id);
          const blocked = blockedSet.has(p.id);
          const checked = picked.has(p.id);
          const cat = categories.find(c => c.id === p.categoryId);
          const rowDisabled = used || blocked;
          const sku = (p.sku ?? '').trim();
          return (
            <label
              key={p.id}
              className={`flex items-start gap-2.5 px-3 py-2.5 ${rowDisabled ? 'opacity-45 cursor-not-allowed bg-slate-50' : 'cursor-pointer hover:bg-slate-50/80'}`}
            >
              <input
                type="checkbox"
                className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                checked={checked}
                disabled={rowDisabled}
                onChange={() => toggle(p.id)}
              />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between items-start gap-2">
                  <span className="text-xs font-bold text-slate-800 truncate">
                    {p.name}
                    {sku ? <span className="font-semibold text-slate-500"> 【{sku}】</span> : null}
                  </span>
                  {cat && (
                    <span className="text-[7px] font-black uppercase text-slate-400 bg-slate-100 px-1 py-0 rounded shrink-0">{cat.name}</span>
                  )}
                </div>
                {used && <p className="text-[9px] text-amber-600 font-bold mt-0.5">已在清单中</p>}
                {blocked && !used && <p className="text-[9px] text-slate-500 font-bold mt-0.5">含颜色/尺码，不可作 BOM 子件</p>}
              </div>
            </label>
          );
        })}
        {filtered.length === 0 && (
          <div className="py-8 text-center text-[10px] text-slate-400 font-medium">没有可选产品</div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50">
          取消
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pickedValid.length === 0}
          className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-45 disabled:cursor-not-allowed shadow-sm"
        >
          加入清单 ({pickedValid.length})
        </button>
      </div>

      {allowQuickCreate && quickCreateOpen && (
        <Suspense fallback={null}>
          <LazyProductArchiveCreateModal
            isOpen={quickCreateOpen}
            onClose={() => setQuickCreateOpen(false)}
            defaultCategoryId={activeTab !== 'all' ? activeTab : undefined}
            onCreated={p => {
              setPicked(prev => {
                const n = new Set(prev);
                n.add(p.id);
                return n;
              });
              setActiveTab('all');
              setSearch('');
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

export default BomBatchAddPanel;
