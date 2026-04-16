
import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Sliders,
  Trash2,
  Printer,
} from 'lucide-react';
import {
  PlanFormSettings,
  PrintTemplate,
  PlanOrder,
  Product,
  ProductionOrder,
} from '../../types';
import {
  PlanPrintTemplateManageDialog,
  type PlanPrintTemplateManageScope,
} from '../../components/plan-print/PlanPrintTemplateManageDialog';

interface PlanFormConfigModalProps {
  open: boolean;
  onClose: () => void;
  settings: PlanFormSettings;
  onSave: (settings: PlanFormSettings) => void;
  productionLinkMode?: 'order' | 'product';
  printTemplates: PrintTemplate[];
  onUpdatePrintTemplates: (list: PrintTemplate[]) => void | Promise<void>;
  onRefreshPrintTemplates?: () => void | Promise<void>;
  planFormSettings: PlanFormSettings;
  plans: PlanOrder[];
  orders: ProductionOrder[];
  products: Product[];
}

const PlanFormConfigModal: React.FC<PlanFormConfigModalProps> = ({
  open,
  onClose,
  settings,
  onSave,
  productionLinkMode = 'order',
  printTemplates,
  onUpdatePrintTemplates,
  onRefreshPrintTemplates,
  planFormSettings,
  plans,
  orders,
  products,
}) => {
  const [tab, setTab] = useState<'fields' | 'print'>('fields');
  const [draft, setDraft] = useState<PlanFormSettings | null>(null);
  const [printManageScope, setPrintManageScope] = useState<PlanPrintTemplateManageScope | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(JSON.parse(JSON.stringify(settings)));
      setTab('fields');
    } else {
      setDraft(null);
    }
  }, [open, settings]);

  if (!open || !draft) return null;

  const handleClose = () => {
    onClose();
  };

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  const mergeWhitelistIntoDraft = (scope: PlanPrintTemplateManageScope, templateId: string) => {
    setDraft(d => {
      if (!d) return d;
      if (scope === 'planList') {
        const prev = d.listPrint?.allowedTemplateIds;
        const allowedTemplateIds = prev?.length
          ? Array.from(new Set([...prev, templateId]))
          : [templateId];
        return {
          ...d,
          listPrint: {
            ...d.listPrint,
            showPrintButton: d.listPrint?.showPrintButton !== false,
            allowedTemplateIds,
          },
        };
      }
      const prev = d.labelPrint?.allowedTemplateIds;
      const allowedTemplateIds = prev?.length ? Array.from(new Set([...prev, templateId])) : [templateId];
      return {
        ...d,
        labelPrint: {
          ...d.labelPrint,
          allowedTemplateIds,
        },
      };
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={handleClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-8 py-6">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-black text-slate-900">
              <Sliders className="h-5 w-5 text-indigo-500" /> 计划单表单配置
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {tab === 'fields'
                ? '配置在列表、新增、详情页中显示的字段，可增加自定义项'
                : '列表与标签模版请在各区域「增加模版」弹窗中创建或管理；下方仅展示已加入的可选模版，可删除。'}
            </p>
          </div>
          <button onClick={handleClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex gap-1 border-b border-slate-100 px-6 pt-2">
          <button
            type="button"
            onClick={() => setTab('fields')}
            className={`rounded-t-xl px-4 py-2.5 text-sm font-black transition-colors ${tab === 'fields' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            字段配置
          </button>
          <button
            type="button"
            onClick={() => {
              void onRefreshPrintTemplates?.();
              setTab('print');
            }}
            className={`flex items-center gap-1.5 rounded-t-xl px-4 py-2.5 text-sm font-black transition-colors ${tab === 'print' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Printer className="h-4 w-4" /> 打印模版
          </button>
        </div>
        {tab === 'print' ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
              <div className="flex flex-col gap-4">
                <div className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-black text-slate-800">列表打印</h4>
                <button
                  type="button"
                  onClick={() => {
                    void onRefreshPrintTemplates?.();
                    setPrintManageScope('planList');
                  }}
                  className="flex shrink-0 items-center gap-1 rounded-xl border border-indigo-200 bg-white px-3 py-1.5 text-xs font-black text-indigo-700 hover:bg-indigo-50"
                >
                  <Plus className="h-3.5 w-3.5" /> 增加模版
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                控制计划单列表是否显示「打印」按钮。下方仅列出已加入的列表可选模版；未添加任何项时，打印时仍可使用全部模版。
              </p>
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded text-indigo-600"
                  checked={draft.listPrint?.showPrintButton !== false}
                  onChange={e =>
                    setDraft(d =>
                      d
                        ? {
                            ...d,
                            listPrint: {
                              showPrintButton: e.target.checked,
                              allowedTemplateIds: d.listPrint?.allowedTemplateIds,
                            },
                          }
                        : d,
                    )
                  }
                />
                在计划单列表显示「打印」按钮
              </label>
              <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-400">列表可选模版（已加入）</p>
              <div className="mt-2 flex max-h-36 flex-wrap gap-2 overflow-y-auto">
                {(draft.listPrint?.allowedTemplateIds?.length ?? 0) === 0 ? (
                  <span className="text-xs text-slate-400">
                    尚未加入任何模版；打印时可选全部。请点击「增加模版」选择模版后点「加入列表打印可选」。
                  </span>
                ) : (
                  (draft.listPrint?.allowedTemplateIds ?? []).map(tid => {
                    const t = printTemplates.find(x => x.id === tid);
                    return (
                      <div
                        key={tid}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white pl-2.5 pr-1 py-1 text-xs font-bold text-slate-700"
                      >
                        <span className="max-w-[200px] truncate">{t?.name ?? `已删除模版 (${tid.slice(0, 8)}…)`}</span>
                        <button
                          type="button"
                          title="从可选列表移除"
                          onClick={() =>
                            setDraft(d => {
                              if (!d?.listPrint?.allowedTemplateIds?.length) return d;
                              const next = d.listPrint.allowedTemplateIds.filter(id => id !== tid);
                              return {
                                ...d,
                                listPrint: {
                                  ...d.listPrint,
                                  showPrintButton: d.listPrint.showPrintButton !== false,
                                  allowedTemplateIds: next.length > 0 ? next : undefined,
                                },
                              };
                            })
                          }
                          className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
                </div>
                <div className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-black text-slate-800">标签打印</h4>
                <button
                  type="button"
                  onClick={() => {
                    void onRefreshPrintTemplates?.();
                    setPrintManageScope('planLabel');
                  }}
                  className="flex shrink-0 items-center gap-1 rounded-xl border border-indigo-200 bg-white px-3 py-1.5 text-xs font-black text-indigo-700 hover:bg-indigo-50"
                >
                  <Plus className="h-3.5 w-3.5" /> 增加模版
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                用于<strong className="text-slate-600">计划详情 → 单品码一览 → 打印单品码</strong>，以及批次码行的「打印批次标签」。下方仅列出已加入的标签可选模版；未添加任何项时仍可选全部模版。标签模版建议使用小尺寸纸张与单品码/批次码占位符。
              </p>
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm font-bold text-slate-700">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded text-indigo-600"
                  checked={draft.labelPrint?.showPlanDetailTraceSection !== false}
                  onChange={e =>
                    setDraft(d =>
                      d
                        ? {
                            ...d,
                            labelPrint: {
                              ...d.labelPrint,
                              showPlanDetailTraceSection: e.target.checked,
                            },
                          }
                        : d,
                    )
                  }
                />
                <span>
                  在计划详情中显示「追溯码」区块
                  <span className="mt-0.5 block text-xs font-normal font-medium text-slate-500">
                    关闭后隐藏单品码/批次码生成与一览、标签打印入口；不影响已生成的码数据。
                  </span>
                </span>
              </label>
              <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-400">标签可选模版（已加入）</p>
              <div className="mt-2 flex max-h-36 flex-wrap gap-2 overflow-y-auto">
                {(draft.labelPrint?.allowedTemplateIds?.length ?? 0) === 0 ? (
                  <span className="text-xs text-slate-400">
                    尚未加入任何模版；打印时可选全部。请点击「增加模版」选择模版后点「加入标签打印可选」。
                  </span>
                ) : (
                  (draft.labelPrint?.allowedTemplateIds ?? []).map(tid => {
                    const t = printTemplates.find(x => x.id === tid);
                    return (
                      <div
                        key={tid}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white pl-2.5 pr-1 py-1 text-xs font-bold text-slate-700"
                      >
                        <span className="max-w-[200px] truncate">{t?.name ?? `已删除模版 (${tid.slice(0, 8)}…)`}</span>
                        <button
                          type="button"
                          title="从可选列表移除"
                          onClick={() =>
                            setDraft(d => {
                              if (!d?.labelPrint?.allowedTemplateIds?.length) return d;
                              const next = d.labelPrint.allowedTemplateIds.filter(id => id !== tid);
                              return {
                                ...d,
                                labelPrint: {
                                  ...d.labelPrint,
                                  allowedTemplateIds: next.length > 0 ? next : undefined,
                                },
                              };
                            })
                          }
                          className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
          <div>
            <h4 className="text-sm font-black text-slate-600 uppercase tracking-widest mb-3">标准字段显示</h4>
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">字段</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">列表中</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">新增时</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">详情中</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {draft.standardFields
                    .filter(f => !['product', 'totalQty', 'status', 'priority', 'assignedCount', 'planNumber', ...(productionLinkMode === 'product' ? ['customer'] : [])].includes(f.id))
                    .map(f => (
                    <tr key={f.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 text-sm font-bold text-slate-800">{f.label}</td>
                      <td className="px-4 py-2.5 text-center"><input type="checkbox" checked={f.showInList} onChange={e => setDraft(d => d ? { ...d, standardFields: d.standardFields.map(sf => sf.id === f.id ? { ...sf, showInList: e.target.checked } : sf) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                      <td className="px-4 py-2.5 text-center"><input type="checkbox" checked={f.showInCreate} onChange={e => setDraft(d => d ? { ...d, standardFields: d.standardFields.map(sf => sf.id === f.id ? { ...sf, showInCreate: e.target.checked } : sf) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                      <td className="px-4 py-2.5 text-center"><input type="checkbox" checked={f.showInDetail} onChange={e => setDraft(d => d ? { ...d, standardFields: d.standardFields.map(sf => sf.id === f.id ? { ...sf, showInDetail: e.target.checked } : sf) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-black text-slate-600 uppercase tracking-widest">自定义单据内容</h4>
              <button type="button" onClick={() => setDraft(d => d ? { ...d, customFields: [...d.customFields, { id: `custom-${Date.now()}`, label: '新自定义项', type: 'text', showInList: true, showInCreate: true, showInDetail: true }] } : d)} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700">
                <Plus className="w-3.5 h-3.5" /> 增加
              </button>
            </div>
            {draft.customFields.length === 0 ? (
              <p className="text-sm text-slate-400 italic py-4 border-2 border-dashed border-slate-100 rounded-2xl text-center">暂无自定义项，点击「增加」添加</p>
            ) : (
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">标签</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">类型</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">选项（下拉时）</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">列表中</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">新增时</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-center">详情中</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {draft.customFields.map(cf => (
                      <tr key={cf.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2"><input type="text" value={cf.label} onChange={e => setDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, label: e.target.value } : c) } : d)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold outline-none" placeholder="标签" /></td>
                        <td className="px-4 py-2">
                          <select value={cf.type || 'text'} onChange={e => {
                            const newType = e.target.value as 'text' | 'number' | 'date' | 'select';
                            setDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, type: newType, options: newType === 'select' ? (c.options ?? []) : c.options } : c) } : d);
                          }} className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none">
                            <option value="text">文本</option><option value="number">数字</option><option value="date">日期</option><option value="select">下拉</option>
                          </select>
                        </td>
                        <td className="px-4 py-2 align-top">
                          {cf.type === 'select' ? (
                            <div className="min-w-[180px] space-y-1.5">
                              {(cf.options ?? []).map((opt, idx) => (
                                <div key={idx} className="flex items-center gap-1">
                                  <input type="text" value={opt} onChange={e => setDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, options: (c.options ?? []).map((o, i) => i === idx ? e.target.value : o) } : c) } : d)} className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-bold outline-none" placeholder="选项文案" />
                                  <button type="button" onClick={() => setDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, options: (c.options ?? []).filter((_, i) => i !== idx) } : c) } : d)} className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                              ))}
                              <button type="button" onClick={() => setDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, options: [...(c.options ?? []), '新选项'] } : c) } : d)} className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700">
                                <Plus className="w-3.5 h-3.5" /> 添加选项
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center"><input type="checkbox" checked={cf.showInList} onChange={e => setDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, showInList: e.target.checked } : c) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                        <td className="px-4 py-2 text-center"><input type="checkbox" checked={cf.showInCreate} onChange={e => setDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, showInCreate: e.target.checked } : c) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                        <td className="px-4 py-2 text-center"><input type="checkbox" checked={cf.showInDetail} onChange={e => setDraft(d => d ? { ...d, customFields: d.customFields.map(c => c.id === cf.id ? { ...c, showInDetail: e.target.checked } : c) } : d)} className="w-4 h-4 rounded text-indigo-600" /></td>
                        <td className="px-4 py-2"><button type="button" onClick={() => setDraft(d => d ? { ...d, customFields: d.customFields.filter(c => c.id !== cf.id) } : d)} className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        )}
        {tab === 'fields' && (
        <div className="flex justify-end gap-3 border-t border-slate-100 px-8 py-6">
          <button onClick={handleClose} className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800">取消</button>
          <button onClick={handleSave} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">保存配置</button>
        </div>
        )}
        {tab === 'print' && (
        <div className="flex justify-end gap-3 border-t border-slate-100 px-8 py-6">
          <button
            type="button"
            onClick={handleClose}
            className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
          >
            保存配置
          </button>
        </div>
        )}
      </div>

      {printManageScope && (
        <PlanPrintTemplateManageDialog
          open
          onClose={() => setPrintManageScope(null)}
          scope={printManageScope}
          printTemplates={printTemplates}
          onUpdatePrintTemplates={onUpdatePrintTemplates}
          planFormSettings={draft}
          onMergePrintWhitelist={id => mergeWhitelistIntoDraft(printManageScope, id)}
          onRefreshPrintTemplates={onRefreshPrintTemplates}
          plans={plans}
          orders={orders}
          products={products}
        />
      )}
    </div>
  );
};

export default React.memo(PlanFormConfigModal);
