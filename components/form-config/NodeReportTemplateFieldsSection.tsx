import React from 'react';
import { ArrowRight, Database, FileText } from 'lucide-react';
import type { GlobalNodeTemplate, ReportFieldDefinition } from '../../types';
import { ReportCustomFieldsConfigTable } from './CustomFieldsEditorTable';

export interface NodeReportTemplateFieldsSectionProps {
  globalNodes: GlobalNodeTemplate[];
  draft: Record<string, ReportFieldDefinition[]>;
  onDraftChange: (nodeId: string, next: ReportFieldDefinition[]) => void;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

const NodeReportTemplateFieldsSection: React.FC<NodeReportTemplateFieldsSectionProps> = ({
  globalNodes,
  draft,
  onDraftChange,
  selectedNodeId,
  onSelectNode,
}) => {
  const selectedNode = globalNodes.find(n => n.id === selectedNodeId) ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h4 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-600">
          <FileText className="h-4 w-4" /> 报工自定义单据内容（按工序）
        </h4>
      </div>

      {globalNodes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-10 text-center text-sm font-medium text-slate-400">
          暂无工序，请先在系统设置 → 工序节点库中添加。
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="max-h-[320px] space-y-2 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50/50 p-2">
              {globalNodes.map(node => {
                const active = selectedNodeId === node.id;
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => onSelectNode(node.id)}
                    className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition-all ${
                      active
                        ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                        : 'border-transparent bg-white hover:border-slate-200'
                    }`}
                  >
                    <span className={`text-sm font-bold ${active ? 'text-indigo-900' : 'text-slate-600'}`}>
                      {node.name}
                    </span>
                    <ArrowRight
                      className={`h-4 w-4 shrink-0 transition-all ${
                        active ? 'translate-x-1 text-indigo-600' : 'text-slate-200'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-8">
            {selectedNode ? (
              <ReportCustomFieldsConfigTable
                showRequiredColumn
                showShowInFormColumn={false}
                fields={draft[selectedNode.id] ?? []}
                onChange={next => onDraftChange(selectedNode.id, next)}
                showHeader={false}
                addButtonLabel="增加填报项"
                idPrefix={`order-form-rt-${selectedNode.id}-`}
              />
            ) : (
              <div className="flex h-full min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
                <Database className="mb-3 h-8 w-8 text-slate-300" />
                <p className="text-sm font-bold text-slate-400">请选择左侧工序进行字段配置</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(NodeReportTemplateFieldsSection);
