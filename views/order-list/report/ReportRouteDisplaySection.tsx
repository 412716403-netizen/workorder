/**
 * 报工弹窗 - 工序展示(只读)区 (Phase P4 抽离)。
 *
 * 仅负责渲染 routeReportDisplayValues 中已配置的图片/PDF/文本。
 * 文件预览回调由父组件 (主壳) 通过 hook 提供。
 */
import React, { useState } from 'react';
import { BookOpen, FileText } from 'lucide-react';
import type { Milestone, Product, GlobalNodeTemplate } from '../../../types';
import { parseRouteReportFileUrls } from '../../../utils/routeReportFileUrls';
import { effectiveCustomDocFieldType } from '../../../utils/reportCustomDocField';
import { parseKnowledgeFieldValue } from '../../../utils/knowledgeFieldValue';
import { KnowledgeDocPreviewModal } from '../../../components/knowledge/KnowledgeDocPickerModal';

interface Props {
  milestone: Milestone;
  product: Product | undefined;
  globalNodes: GlobalNodeTemplate[];
  onOpenFilePreview: (url: string, kind: 'image' | 'pdf') => void;
}

const ReportRouteDisplaySection: React.FC<Props> = ({ milestone, product, globalNodes, onOpenFilePreview }) => {
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const tid = milestone.templateId;
  const nodeDef = globalNodes.find(n => n.id === tid);
  const fromMilestone = milestone.reportDisplayTemplate;
  const displayTpl = (fromMilestone?.length ?? 0) > 0 ? fromMilestone : (nodeDef?.reportDisplayTemplate ?? []);
  if (!displayTpl || displayTpl.length === 0) return null;
  const displayVals = product?.routeReportDisplayValues?.[tid] ?? {};

  type VisibleDisplayRow =
    | { field: (typeof displayTpl)[number]; kind: 'file'; urls: string[] }
    | { field: (typeof displayTpl)[number]; kind: 'knowledge'; docId: string; title: string }
    | { field: (typeof displayTpl)[number]; kind: 'text'; text: string };
  const visibleRows: VisibleDisplayRow[] = [];
  for (const field of displayTpl) {
    const raw = displayVals[field.id] ?? '';
    const t = effectiveCustomDocFieldType(field);
    if (t === 'file') {
      const urls = parseRouteReportFileUrls(raw);
      if (urls.length === 0) continue;
      visibleRows.push({ field, kind: 'file', urls });
    } else if (t === 'knowledge') {
      const ref = parseKnowledgeFieldValue(raw);
      if (!ref) continue;
      visibleRows.push({ field, kind: 'knowledge', docId: ref.id, title: ref.title || '资料库文件' });
    } else if (String(raw).trim()) {
      visibleRows.push({ field, kind: 'text', text: String(raw) });
    }
  }
  if (visibleRows.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/50 px-3 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <BookOpen className="w-4 h-4 shrink-0 text-slate-500" />
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">本工序展示（只读）</span>
      </div>
      {visibleRows.map(row => (
        <div key={row.field.id} className="rounded-xl border border-slate-200 bg-white p-2.5">
          <p className="text-[10px] font-bold text-slate-500 mb-1.5">{row.field.label}</p>
          {row.kind === 'knowledge' ? (
            <button
              type="button"
              onClick={() => setPreviewDocId(row.docId)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
            >
              <BookOpen className="w-3.5 h-3.5 shrink-0" />
              <span className="max-w-[220px] truncate">{row.title}</span>
            </button>
          ) : row.kind === 'file' ? (
            <div className="flex flex-wrap gap-2">
              {row.urls.map((url, fi) => (
                <div key={`${row.field.id}-${fi}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-1.5">
                  {url.startsWith('data:image/') ? (
                    <button
                      type="button"
                      onClick={() => onOpenFilePreview(url, 'image')}
                      className="rounded-md border border-slate-200 overflow-hidden shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer hover:opacity-90"
                      title="点击查看大图"
                    >
                      <img src={url} alt="" className="h-16 w-16 object-cover pointer-events-none" />
                    </button>
                  ) : url.startsWith('data:application/pdf') || /\.pdf(\?|$)/i.test(url) ? (
                    <button
                      type="button"
                      onClick={() => onOpenFilePreview(url, 'pdf')}
                      className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-lg px-1 py-0.5"
                    >
                      <FileText className="w-4 h-4 text-rose-500 shrink-0" /> 查看 PDF
                    </button>
                  ) : (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-indigo-600 hover:underline">
                      附件 {fi + 1}
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-800 whitespace-pre-wrap">{row.text}</p>
          )}
        </div>
      ))}
      <KnowledgeDocPreviewModal
        isOpen={previewDocId != null}
        docId={previewDocId}
        onClose={() => setPreviewDocId(null)}
      />
    </div>
  );
};

export default ReportRouteDisplaySection;
