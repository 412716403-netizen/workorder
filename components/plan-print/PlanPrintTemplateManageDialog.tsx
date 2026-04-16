import React, { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import type { PlanFormSettings, PlanOrder, PrintTemplate, ProductionOrder, Product } from '../../types';
import { PrintTemplateManager } from '../PrintTemplateManager';

export type PlanPrintTemplateManageScope = 'planList' | 'planLabel';

export interface PlanPrintTemplateManageDialogProps {
  open: boolean;
  onClose: () => void;
  scope: PlanPrintTemplateManageScope;
  printTemplates: PrintTemplate[];
  onUpdatePrintTemplates: (list: PrintTemplate[]) => void | Promise<void>;
  /** 用于简易字段选项与白名单是否处于「限制模式」 */
  planFormSettings: PlanFormSettings;
  /** 将当前选中模版 id 合并进对应白名单；若当前未配置则初始化为仅该模版 */
  onMergePrintWhitelist: (templateId: string) => void;
  onRefreshPrintTemplates?: () => void | Promise<void>;
  plans: PlanOrder[];
  orders: ProductionOrder[];
  products: Product[];
}

function scopeTitle(scope: PlanPrintTemplateManageScope): string {
  return scope === 'planList' ? '计划单列表打印模版' : '计划单标签打印模版';
}

function scopeHint(scope: PlanPrintTemplateManageScope): string {
  if (scope === 'planList') {
    return '用于计划单列表「打印」输出；新建模版在新窗口中编辑，保存后请刷新列表。选中左侧模版后点「加入列表打印可选」可加入表单中的列表可选模版（首次加入会从「全部可用」变为仅已加入项）。';
  }
  return '用于计划详情单品码与批次标签；选中模版后点「加入标签打印可选」加入表单中的标签可选模版（首次加入会从「全部可用」变为仅已加入项）。';
}

function joinButtonLabel(scope: PlanPrintTemplateManageScope): string {
  return scope === 'planList' ? '加入列表打印可选' : '加入标签打印可选';
}

export const PlanPrintTemplateManageDialog: React.FC<PlanPrintTemplateManageDialogProps> = ({
  open,
  onClose,
  scope,
  printTemplates,
  onUpdatePrintTemplates,
  planFormSettings,
  onMergePrintWhitelist,
  onRefreshPrintTemplates,
  plans,
  orders,
  products,
}) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  useEffect(() => {
    if (open) void onRefreshPrintTemplates?.();
  }, [open, onRefreshPrintTemplates]);

  const onAfterPersist = useCallback(
    (nextList: PrintTemplate[], prevList: PrintTemplate[]) => {
      const prevIds = new Set(prevList.map(t => t.id));
      const added = nextList.filter(t => !prevIds.has(t.id));
      const allowed =
        scope === 'planList'
          ? planFormSettings.listPrint?.allowedTemplateIds
          : planFormSettings.labelPrint?.allowedTemplateIds;
      if (!allowed?.length) return;
      for (const t of added) onMergePrintWhitelist(t.id);
    },
    [onMergePrintWhitelist, planFormSettings.listPrint?.allowedTemplateIds, planFormSettings.labelPrint?.allowedTemplateIds, scope],
  );

  const handleJoinWhitelist = () => {
    if (!selectedTemplateId) {
      toast.error('请先在左侧选择一个模版');
      return;
    }
    onMergePrintWhitelist(selectedTemplateId);
    toast.success('已加入可选模版');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" aria-label="关闭" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div className="min-w-0">
            <h3 className="text-lg font-black text-slate-900">增加 / 管理模版 · {scopeTitle(scope)}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{scopeHint(scope)}</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-4 pb-2 pt-3">
          <div className="h-[min(70vh,640px)] min-h-[320px] overflow-hidden">
            <PrintTemplateManager
              printTemplates={printTemplates}
              onUpdatePrintTemplates={onUpdatePrintTemplates}
              plans={plans}
              orders={orders}
              products={products}
              onAfterPersist={onAfterPersist}
              onSelectionChange={setSelectedTemplateId}
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-slate-100 bg-slate-50/90 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-slate-500">
            加入后模版会出现在表单配置「已加入」列表及对应打印选择器中；若此前未配置任何项，首次加入后仅允许使用已加入的模版。可在表单配置中删除某项以恢复为「未加入=全部可用」。
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleJoinWhitelist}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              disabled={!selectedTemplateId}
            >
              {joinButtonLabel(scope)}
            </button>
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
