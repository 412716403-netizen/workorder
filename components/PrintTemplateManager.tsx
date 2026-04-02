import React, { useMemo, useState } from 'react';
import { ChevronDown, Copy, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PlanFormSettings, PlanOrder, PrintTemplate, ProductionOrder, Product } from '../types';
import { PrintPaper } from './print-editor/PrintPaper';
import { buildPrintFieldOptions } from './print-editor/printFieldOptions';
import { createPresetLabelTemplate, duplicatePrintTemplate } from '../utils/printTemplateDefaults';

function openEditor(id: string) {
  const base = import.meta.env.BASE_URL || '/';
  const root = base.endsWith('/') ? base.slice(0, -1) : base;
  const path = `${window.location.origin}${root}/print-editor/${id}`;
  window.open(path, '_blank', 'noopener,noreferrer');
}

function firstQrField(t: PrintTemplate): string {
  const q = t.elements.find(e => e.type === 'qrcode');
  if (q && q.type === 'qrcode') return (q.config as { content: string }).content;
  return '{{计划.planNumber}}';
}

function setQrField(t: PrintTemplate, content: string): PrintTemplate {
  const idx = t.elements.findIndex(e => e.type === 'qrcode');
  if (idx < 0) return t;
  const elements = t.elements.map((e, i) =>
    i === idx && e.type === 'qrcode' ? { ...e, config: { ...e.config, content } } : e,
  );
  return { ...t, elements, updatedAt: new Date().toISOString() };
}

function firstTextContents(t: PrintTemplate): [string, string] {
  const texts = t.elements.filter(e => e.type === 'text');
  const c0 = texts[0]?.type === 'text' ? (texts[0].config as { content: string }).content : '{{产品.name}}';
  const c1 = texts[1]?.type === 'text' ? (texts[1].config as { content: string }).content : '{{计划.planNumber}}';
  return [c0, c1];
}

function setTextLines(t: PrintTemplate, line1: string, line2: string): PrintTemplate {
  let n = 0;
  const elements = t.elements.map(e => {
    if (e.type !== 'text') return e;
    const cfg = e.config as { content: string };
    const content = n === 0 ? line1 : n === 1 ? line2 : cfg.content;
    n += 1;
    return { ...e, config: { ...cfg, content } };
  });
  return { ...t, elements, updatedAt: new Date().toISOString() };
}

export interface PrintTemplateManagerProps {
  printTemplates: PrintTemplate[];
  onUpdatePrintTemplates: (list: PrintTemplate[]) => void | Promise<void>;
  planFormSettings: PlanFormSettings;
  plans: PlanOrder[];
  orders: ProductionOrder[];
  products: Product[];
}

export const PrintTemplateManager: React.FC<PrintTemplateManagerProps> = ({
  printTemplates,
  onUpdatePrintTemplates,
  planFormSettings,
  plans,
  orders,
  products,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(() => printTemplates[0]?.id ?? null);
  const [draft, setDraft] = useState<PrintTemplate | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const selected = printTemplates.find(t => t.id === selectedId) ?? null;

  React.useEffect(() => {
    if (selected) setDraft({ ...selected });
    else setDraft(null);
  }, [selected]);

  const previewCtx = useMemo(() => {
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

  const fieldOptions = useMemo(() => buildPrintFieldOptions(planFormSettings.customFields), [planFormSettings.customFields]);

  const qrOptions = useMemo(() => fieldOptions.filter(o => o.group !== '工序'), [fieldOptions]);
  const lineOptions = fieldOptions;

  const persist = async (list: PrintTemplate[]) => {
    try {
      await onUpdatePrintTemplates(list);
      toast.success('已保存');
    } catch {
      toast.error('保存失败');
    }
  };

  const saveDraft = async () => {
    if (!draft) return;
    const others = printTemplates.filter(t => t.id !== draft.id);
    await persist([...others, draft]);
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

  const copyOne = async (t: PrintTemplate) => {
    const copy = duplicatePrintTemplate(t);
    await persist([...printTemplates, copy]);
    setSelectedId(copy.id);
  };

  const addPreset = async (preset: '30x40' | '80x60' | '80x100') => {
    const t = createPresetLabelTemplate(preset);
    await persist([...printTemplates, t]);
    setSelectedId(t.id);
    setCreateOpen(false);
  };

  const addCustom = () => {
    setCreateOpen(false);
    openEditor('new');
  };

  if (!draft && printTemplates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <p className="text-sm font-bold text-slate-500">暂无打印模板</p>
        <div className="relative">
          <button
            type="button"
            onClick={() => setCreateOpen(o => !o)}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" /> 创建模板
            <ChevronDown className="h-4 w-4 opacity-80" />
          </button>
          {createOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setCreateOpen(false)} aria-hidden />
              <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                <button type="button" className="block w-full px-4 py-2.5 text-left text-sm font-bold hover:bg-slate-50" onClick={() => void addPreset('30x40')}>
                  30×40 mm
                </button>
                <button type="button" className="block w-full px-4 py-2.5 text-left text-sm font-bold hover:bg-slate-50" onClick={() => void addPreset('80x60')}>
                  80×60 mm
                </button>
                <button type="button" className="block w-full px-4 py-2.5 text-left text-sm font-bold hover:bg-slate-50" onClick={() => void addPreset('80x100')}>
                  80×100 mm
                </button>
                <button type="button" className="block w-full px-4 py-2.5 text-left text-sm font-bold text-indigo-600 hover:bg-indigo-50" onClick={addCustom}>
                  自定义标签模板
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-0 w-full min-w-0 grid-cols-1 gap-4 max-lg:h-auto lg:h-full lg:min-h-0 lg:flex-1 lg:grid-cols-[220px_1fr_280px] lg:grid-rows-[minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/80 p-3 lg:min-h-0 lg:h-full lg:max-h-full">
        <div className="relative mb-3 shrink-0">
          <button
            type="button"
            onClick={() => setCreateOpen(o => !o)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-indigo-300 bg-white py-2.5 text-sm font-bold text-indigo-600 hover:bg-indigo-50"
          >
            <Plus className="h-4 w-4" /> 创建模板
          </button>
          {createOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setCreateOpen(false)} aria-hidden />
              <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                <button type="button" className="block w-full px-3 py-2 text-left text-xs font-bold hover:bg-slate-50" onClick={() => void addPreset('30x40')}>
                  30×40 mm
                </button>
                <button type="button" className="block w-full px-3 py-2 text-left text-xs font-bold hover:bg-slate-50" onClick={() => void addPreset('80x60')}>
                  80×60 mm
                </button>
                <button type="button" className="block w-full px-3 py-2 text-left text-xs font-bold hover:bg-slate-50" onClick={() => void addPreset('80x100')}>
                  80×100 mm
                </button>
                <button type="button" className="block w-full px-3 py-2 text-left text-xs font-bold text-indigo-600 hover:bg-indigo-50" onClick={addCustom}>
                  自定义标签模板
                </button>
              </div>
            </>
          )}
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-0.5 custom-scrollbar">
          {printTemplates.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedId(t.id)}
              className={`w-full rounded-xl border p-3 text-left transition-all ${selectedId === t.id ? 'border-indigo-400 bg-white shadow-md ring-2 ring-indigo-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}
            >
              <div className="mb-2 flex h-16 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                <div className="origin-top scale-[0.22]">
                  <PrintPaper template={t} ctx={previewCtx} />
                </div>
              </div>
              <div className="truncate text-xs font-black text-slate-800">{t.name}</div>
              <div className="text-[10px] font-bold text-slate-400">
                {t.paperSize.widthMm}×{t.paperSize.heightMm} mm
              </div>
              <div className="mt-2 flex gap-2 text-[10px] font-bold">
                <span
                  role="button"
                  tabIndex={0}
                  className="text-indigo-600 hover:underline"
                  onClick={e => {
                    e.stopPropagation();
                    openEditor(t.id);
                  }}
                  onKeyDown={e => e.key === 'Enter' && openEditor(t.id)}
                >
                  编辑
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  className="text-slate-500 hover:underline"
                  onClick={e => {
                    e.stopPropagation();
                    void copyOne(t);
                  }}
                >
                  复制
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 overflow-y-auto overscroll-contain rounded-2xl border border-slate-100 bg-white p-5 lg:h-full lg:min-h-0 lg:max-h-full">
        {draft ? (
          <>
            <h4 className="mb-1 text-sm font-black text-slate-800">
              配置打印模板 {draft.paperSize.widthMm}×{draft.paperSize.heightMm} mm
            </h4>
            <p className="mb-4 text-xs text-slate-500">选择要打印的字段；复杂排版请点「编辑」打开可视化编辑器。</p>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400">模板名称</label>
                <input
                  value={draft.name}
                  onChange={e => setDraft({ ...draft, name: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400">二维码内容</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
                  value={(() => {
                    const raw = firstQrField(draft).replace(/^\{\{|\}\}$/g, '');
                    const hit = qrOptions.find(o => `{{${o.value}}}` === firstQrField(draft) || raw === o.value);
                    return hit?.value ?? '计划.planNumber';
                  })()}
                  onChange={e => {
                    const v = e.target.value;
                    setDraft(setQrField(draft, `{{${v}}}`));
                  }}
                >
                  {qrOptions.map(o => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400">第一行取值</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
                  value={(() => {
                    const [a] = firstTextContents(draft);
                    const raw = a.replace(/^\{\{|\}\}$/g, '');
                    const hit = lineOptions.find(o => `{{${o.value}}}` === a || raw === o.value);
                    return hit?.value ?? '产品.name';
                  })()}
                  onChange={e => {
                    const v = e.target.value;
                    const [, b] = firstTextContents(draft);
                    setDraft(setTextLines(draft, `{{${v}}}`, b));
                  }}
                >
                  {lineOptions.map(o => (
                    <option key={`l1-${o.value}`} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400">第二行取值</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
                  value={(() => {
                    const [, b] = firstTextContents(draft);
                    const raw = b.replace(/^\{\{|\}\}$/g, '');
                    const hit = lineOptions.find(o => `{{${o.value}}}` === b || raw === o.value);
                    return hit?.value ?? '计划.planNumber';
                  })()}
                  onChange={e => {
                    const v = e.target.value;
                    const [a] = firstTextContents(draft);
                    setDraft(setTextLines(draft, a, `{{${v}}}`));
                  }}
                >
                  {lineOptions.map(o => (
                    <option key={`l2-${o.value}`} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void saveDraft()}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700"
              >
                保存
              </button>
              <button
                type="button"
                onClick={() => selected && void copyOne(selected)}
                className="flex items-center gap-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                <Copy className="h-4 w-4" /> 复制
              </button>
              <button type="button" onClick={() => void removeSelected()} className="flex items-center gap-1 rounded-xl border border-rose-200 px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50">
                <Trash2 className="h-4 w-4" /> 删除
              </button>
              <button type="button" onClick={() => selectedId && openEditor(selectedId)} className="ml-auto rounded-xl border border-indigo-200 px-4 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-50">
                可视化编辑
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">请从左侧选择一个模板</p>
        )}
      </div>

      <div className="min-h-0 overflow-y-auto overscroll-contain rounded-2xl border border-slate-100 bg-slate-50/80 p-4 lg:h-full lg:min-h-0 lg:max-h-full">
        <h4 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">模板效果预览</h4>
        {draft && (
          <div className="flex justify-center overflow-auto rounded-xl bg-white p-4">
            <PrintPaper template={draft} ctx={previewCtx} />
          </div>
        )}
      </div>
    </div>
  );
};
