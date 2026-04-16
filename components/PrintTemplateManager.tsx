import React, { useMemo, useState } from 'react';
import { Copy, Plus, RotateCcw, Search, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { toast } from 'sonner';
import type { PlanOrder, PrintTemplate, ProductionOrder, Product } from '../types';
import { PrintPaper } from './print-editor/PrintPaper';
import { duplicatePrintTemplate } from '../utils/printTemplateDefaults';
import { augmentPrintPreviewContext } from '../utils/printPreviewSampleContext';

/** 预览区 scale（相对纸张原始 CSS 尺寸），默认 100%，最大可放大到 200% */
const PREVIEW_SCALE_DEFAULT = 1;
const PREVIEW_SCALE_MIN = 0.16;
const PREVIEW_SCALE_MAX = 2;
const PREVIEW_SCALE_STEP = 0.07;

function openEditor(id: string) {
  const base = import.meta.env.BASE_URL || '/';
  const root = base.endsWith('/') ? base.slice(0, -1) : base;
  const path = `${window.location.origin}${root}/print-editor/${id}`;
  window.open(path, '_blank', 'noopener,noreferrer');
}

export interface PrintTemplateManagerProps {
  printTemplates: PrintTemplate[];
  onUpdatePrintTemplates: (list: PrintTemplate[]) => void | Promise<void>;
  plans: PlanOrder[];
  orders: ProductionOrder[];
  products: Product[];
  /** 保存/删除/复制成功后调用，便于外层同步白名单等 */
  onAfterPersist?: (nextList: PrintTemplate[], prevList: PrintTemplate[]) => void;
  /** 左侧选中模版变化 */
  onSelectionChange?: (templateId: string | null) => void;
}

export const PrintTemplateManager: React.FC<PrintTemplateManagerProps> = ({
  printTemplates,
  onUpdatePrintTemplates,
  plans,
  orders,
  products,
  onAfterPersist,
  onSelectionChange,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(() => printTemplates[0]?.id ?? null);
  const [draft, setDraft] = useState<PrintTemplate | null>(null);
  const [listSearch, setListSearch] = useState('');
  const [previewScale, setPreviewScale] = useState(PREVIEW_SCALE_DEFAULT);

  const selected = printTemplates.find(t => t.id === selectedId) ?? null;

  React.useEffect(() => {
    if (selected) setDraft({ ...selected });
    else setDraft(null);
  }, [selected]);

  React.useEffect(() => {
    setPreviewScale(PREVIEW_SCALE_DEFAULT);
  }, [selectedId]);

  const basePreviewCtx = useMemo(() => {
    const plan = plans[0];
    const order = orders[0];
    const product = products.find(p => p.id === (plan?.productId || order?.productId)) ?? products[0];
    return {
      plan,
      order,
      product,
      milestoneName: '示例工序',
      completedQuantity: 10,
    };
  }, [plans, orders, products]);

  const listQuery = listSearch.trim().toLowerCase();
  const filteredTemplates = useMemo(() => {
    if (!listQuery) return printTemplates;
    return printTemplates.filter(t => {
      const name = (t.name || '').toLowerCase();
      const paper = `${t.paperSize.widthMm}×${t.paperSize.heightMm}`.toLowerCase();
      return name.includes(listQuery) || paper.includes(listQuery) || t.id.toLowerCase().includes(listQuery);
    });
  }, [printTemplates, listQuery]);

  const persist = async (list: PrintTemplate[]) => {
    const prevList = printTemplates;
    try {
      await onUpdatePrintTemplates(list);
      onAfterPersist?.(list, prevList);
      toast.success('已保存');
    } catch {
      toast.error('保存失败');
    }
  };

  const removeSelected = async () => {
    if (!selectedId) return;
    const next = printTemplates.filter(t => t.id !== selectedId);
    await persist(next);
    setSelectedId(next[0]?.id ?? null);
  };

  React.useEffect(() => {
    if (selectedId == null && printTemplates.length > 0) setSelectedId(printTemplates[0].id);
  }, [printTemplates, selectedId]);

  React.useEffect(() => {
    onSelectionChange?.(selectedId);
  }, [selectedId, onSelectionChange]);

  const copyOne = async (t: PrintTemplate) => {
    const copy = duplicatePrintTemplate(t);
    await persist([...printTemplates, copy]);
    setSelectedId(copy.id);
  };

  if (!draft && printTemplates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <p className="text-sm font-bold text-slate-500">暂无打印模板</p>
        <button
          type="button"
          onClick={() => openEditor('new')}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> 创建模板
        </button>
      </div>
    );
  }

  return (
    <div className="grid min-h-0 w-full min-w-0 grid-cols-1 gap-4 max-lg:h-auto lg:h-full lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(180px,240px)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/80 p-3 lg:min-h-0 lg:h-full lg:max-h-full">
        <div className="mb-2 shrink-0">
          <button
            type="button"
            onClick={() => openEditor('new')}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-indigo-300 bg-white py-2.5 text-sm font-bold text-indigo-600 hover:bg-indigo-50"
          >
            <Plus className="h-4 w-4" /> 创建模板
          </button>
        </div>
        <div className="relative mb-2 shrink-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={listSearch}
            onChange={e => setListSearch(e.target.value)}
            placeholder="搜索模版名称、纸张…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-0.5 custom-scrollbar">
          {filteredTemplates.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs font-bold text-slate-400">
              {printTemplates.length === 0 ? '暂无模版' : '无匹配模版，请调整关键词'}
            </p>
          ) : (
            filteredTemplates.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedId(t.id)}
                className={`w-full rounded-xl border px-3 py-2.5 text-left transition-all ${selectedId === t.id ? 'border-indigo-400 bg-white shadow-sm ring-2 ring-indigo-100' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80'}`}
              >
                <div className="truncate text-sm font-black text-slate-800">{t.name}</div>
                <div className="mt-0.5 truncate text-[11px] font-bold tabular-nums text-slate-400">
                  {t.paperSize.widthMm}×{t.paperSize.heightMm} mm
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/80 p-4 lg:h-full lg:min-h-0 lg:max-h-full">
        <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">模板效果预览</h4>
          {draft && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5">
                <button
                  type="button"
                  title="缩小"
                  aria-label="缩小预览"
                  onClick={() => setPreviewScale(s => Math.max(PREVIEW_SCALE_MIN, Math.round((s - PREVIEW_SCALE_STEP) * 100) / 100))}
                  disabled={previewScale <= PREVIEW_SCALE_MIN + 1e-6}
                  className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-30"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span className="min-w-[2.75rem] select-none text-center text-[11px] font-black tabular-nums text-slate-500">
                  {Math.round(previewScale * 100)}%
                </span>
                <button
                  type="button"
                  title="放大"
                  aria-label="放大预览"
                  onClick={() => setPreviewScale(s => Math.min(PREVIEW_SCALE_MAX, Math.round((s + PREVIEW_SCALE_STEP) * 100) / 100))}
                  disabled={previewScale >= PREVIEW_SCALE_MAX - 1e-6}
                  className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-30"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="恢复默认缩放"
                  aria-label="预览缩放恢复默认"
                  onClick={() => setPreviewScale(PREVIEW_SCALE_DEFAULT)}
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => selected && void copyOne(selected)}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
              >
                <Copy className="h-3.5 w-3.5" /> 复制
              </button>
              <button
                type="button"
                onClick={() => void removeSelected()}
                className="flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> 删除
              </button>
              <button
                type="button"
                onClick={() => selectedId && openEditor(selectedId)}
                className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-50"
              >
                可视化编辑
              </button>
            </div>
          )}
        </div>
        {draft ? (
          <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto rounded-xl bg-white px-3 py-4">
            <div
              className="shrink-0"
              style={{
                transform: `scale(${previewScale})`,
                transformOrigin: 'top center',
              }}
            >
              <PrintPaper template={draft} ctx={augmentPrintPreviewContext(basePreviewCtx, draft)} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">请从左侧选择一个模板</p>
        )}
      </div>
    </div>
  );
};
