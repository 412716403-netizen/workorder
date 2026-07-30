import React from 'react';
import { Wrench, BookOpen, FileText, ClipboardList } from 'lucide-react';
import type {
  GlobalNodeTemplate,
  Product,
  ReportFieldDefinition,
} from '../../types';
import { parseRouteReportFileUrls } from '../../utils/routeReportFileUrls';
import { effectiveCustomDocFieldType } from '../../utils/reportCustomDocField';
import { parseKnowledgeFieldValue } from '../../utils/knowledgeFieldValue';

type FilePreviewKind = 'image' | 'pdf';

export interface ProductRouteSectionProps {
  product: Product;
  globalNodes: GlobalNodeTemplate[];
  onOpenFilePreview: (url: string, type: FilePreviewKind) => void;
  onPreviewKnowledgeDoc: (docId: string) => void;
}

function formatRouteReportArchiveValue(
  field: ReportFieldDefinition,
  raw: string | undefined
): { kind: 'file'; urls: string[] } | { kind: 'text'; text: string } | null {
  const v = raw ?? '';
  if (effectiveCustomDocFieldType(field) === 'file') {
    const urls = parseRouteReportFileUrls(v);
    return urls.length > 0 ? { kind: 'file', urls } : null;
  }
  if (!String(v).trim()) return null;
  return { kind: 'text', text: String(v) };
}

const ProductRouteSection: React.FC<ProductRouteSectionProps> = ({
  product: p,
  globalNodes,
  onOpenFilePreview,
  onPreviewKnowledgeDoc,
}) => {
  const selectedNodesOrdered = (p.milestoneNodeIds || [])
    .map(id => globalNodes.find(n => n.id === id))
    .filter((n): n is GlobalNodeTemplate => Boolean(n));

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
        <Wrench className="w-3.5 h-3.5" /> 标准生产路线
      </h3>
      {selectedNodesOrdered.length === 0 ? (
        <span className="text-sm text-slate-400 italic">暂无工序</span>
      ) : (
        <div className="space-y-3">
          {selectedNodesOrdered.map((node, idx) => {
            const displayTpl = node.reportDisplayTemplate ?? [];
            const displayVals = p.routeReportDisplayValues?.[node.id] ?? {};
            type DispRow =
              | { field: ReportFieldDefinition; kind: 'file'; urls: string[] }
              | { field: ReportFieldDefinition; kind: 'knowledge'; docId: string; title: string }
              | { field: ReportFieldDefinition; kind: 'text'; text: string };
            const displayRows: DispRow[] = [];
            for (const field of displayTpl) {
              const raw = displayVals[field.id] ?? '';
              const ft = effectiveCustomDocFieldType(field);
              if (ft === 'file') {
                const urls = parseRouteReportFileUrls(raw);
                if (urls.length > 0) displayRows.push({ field, kind: 'file', urls });
              } else if (ft === 'knowledge') {
                const ref = parseKnowledgeFieldValue(raw);
                if (ref) displayRows.push({ field, kind: 'knowledge', docId: ref.id, title: ref.title || '资料库文件' });
              } else if (String(raw).trim()) {
                displayRows.push({ field, kind: 'text', text: String(raw) });
              }
            }

            const reportTpl = node.reportTemplate ?? [];
            const reportVals = p.routeReportValues?.[node.id] ?? {};
            // cell 来自 formatRouteReportArchiveValue，只有 file/text 两种形态（无 field、无 knowledge），与 DispRow 区分
            const archiveRows: {
              field: ReportFieldDefinition;
              cell: { kind: 'file'; urls: string[] } | { kind: 'text'; text: string };
            }[] = [];
            for (const field of reportTpl) {
              const cell = formatRouteReportArchiveValue(field, reportVals[field.id]);
              if (cell) archiveRows.push({ field, cell });
            }

            const rate = p.nodeRates?.[node.id];
            const pricing = p.nodePricingModes?.[node.id];
            const pieceHint =
              node.enablePieceRate && rate != null && rate > 0
                ? `工价 ${rate.toFixed(2)} 元/${pricing === 'per_hour' ? '时' : '件'}`
                : null;

            return (
              <div
                key={node.id}
                className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
              >
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-[10px] font-black text-white">
                    {idx + 1}
                  </span>
                  <span className="text-sm font-black text-slate-900">{node.name}</span>
                  {node.hasBOM && (
                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                      含 BOM
                    </span>
                  )}
                  {pieceHint && (
                    <span className="text-[10px] font-bold text-slate-500 ml-auto">{pieceHint}</span>
                  )}
                </div>
                <div className="p-3 space-y-3">
                  {displayRows.length > 0 && (
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 px-3 py-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-3.5 h-3.5 shrink-0 text-indigo-600" />
                        <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider">
                          报工页展示（只读）
                        </span>
                      </div>
                      {displayRows.map(row => (
                        <div
                          key={row.field.id}
                          className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-2"
                        >
                          <p className="text-[10px] font-bold text-slate-500 mb-1">{row.field.label}</p>
                          {row.kind === 'knowledge' ? (
                            <button
                              type="button"
                              onClick={() => onPreviewKnowledgeDoc(row.docId)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                            >
                              <BookOpen className="w-3.5 h-3.5 shrink-0" />
                              <span className="max-w-[220px] truncate">{row.title}</span>
                            </button>
                          ) : row.kind === 'file' ? (
                            <div className="flex flex-wrap gap-2">
                              {row.urls.map((url, fi) => (
                                <div
                                  key={`${row.field.id}-${fi}`}
                                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-1.5"
                                >
                                  {url.startsWith('data:image/') ? (
                                    <button
                                      type="button"
                                      onClick={() => onOpenFilePreview(url, 'image')}
                                      className="rounded-md border border-slate-200 overflow-hidden shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                      title="点击查看"
                                    >
                                      <img
                                        src={url}
                                        alt=""
                                        className="h-14 w-14 object-cover pointer-events-none"
                                      />
                                    </button>
                                  ) : url.startsWith('data:application/pdf') ||
                                    /\.pdf(\?|$)/i.test(url) ? (
                                    <button
                                      type="button"
                                      onClick={() => onOpenFilePreview(url, 'pdf')}
                                      className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline"
                                    >
                                      <FileText className="w-4 h-4 text-rose-500 shrink-0" /> 查看 PDF
                                    </button>
                                  ) : (
                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs font-bold text-indigo-600 hover:underline"
                                    >
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
                    </div>
                  )}

                  {archiveRows.length > 0 && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <ClipboardList className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                          报工填报项（产品预设）
                        </span>
                      </div>
                      {archiveRows.map(({ field, cell }) => (
                        <div key={field.id} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                          <p className="text-[10px] font-bold text-slate-500 mb-1">{field.label}</p>
                          {cell.kind === 'file' ? (
                            <div className="flex flex-wrap gap-2">
                              {cell.urls.map((url, fi) => (
                                <div
                                  key={`${field.id}-${fi}`}
                                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-1.5"
                                >
                                  {url.startsWith('data:image/') ? (
                                    <button
                                      type="button"
                                      onClick={() => onOpenFilePreview(url, 'image')}
                                      className="rounded-md border border-slate-200 overflow-hidden shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                      <img
                                        src={url}
                                        alt=""
                                        className="h-12 w-12 object-cover pointer-events-none"
                                      />
                                    </button>
                                  ) : url.startsWith('data:application/pdf') ||
                                    /\.pdf(\?|$)/i.test(url) ? (
                                    <button
                                      type="button"
                                      onClick={() => onOpenFilePreview(url, 'pdf')}
                                      className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline"
                                    >
                                      <FileText className="w-4 h-4 text-rose-500 shrink-0" /> 查看 PDF
                                    </button>
                                  ) : (
                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs font-bold text-indigo-600 hover:underline"
                                    >
                                      附件 {fi + 1}
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-slate-800 whitespace-pre-wrap">{cell.text}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProductRouteSection;
