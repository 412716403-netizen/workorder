import React, { useState } from 'react';
import { useAsyncSubmitLock } from '../../hooks/useAsyncSubmitLock';
import {
  Database,
  ArrowRight,
  Settings,
  Boxes,
  Users,
  Wrench,
  DollarSign,
  Truck,
  ToggleLeft,
  ToggleRight,
  FileText,
  PlusCircle,
  Trash2,
  BookOpen,
} from 'lucide-react';
import { GlobalNodeTemplate, ReportFieldDefinition, FieldType } from '../../types';
import { toast } from 'sonner';
import * as api from '../../services/api';
import { ExtFieldLabelInput, NodeReportTemplateSelectOptions } from './shared';

interface NodesTabProps {
  globalNodes: GlobalNodeTemplate[];
  onRefreshGlobalNodes: () => Promise<void>;
  canCreate: boolean;
  canDelete: boolean;
}

const NodesTab: React.FC<NodesTabProps> = ({
  globalNodes,
  onRefreshGlobalNodes,
  canCreate,
  canDelete,
}) => {
  const [newNodeName, setNewNodeName] = useState('');
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [nodeNameDraft, setNodeNameDraft] = useState('');
  const addLock = useAsyncSubmitLock();

  const handleQuickAddNode = async () => {
    if (!newNodeName.trim()) return;
    if (globalNodes.some(n => n.name === newNodeName.trim())) { toast.warning(`工序"${newNodeName.trim()}"已存在`); return; }
    await addLock.run(async () => {
      try {
        const created = await api.settings.nodes.create({
          name: newNodeName, reportTemplate: [], reportDisplayTemplate: [], hasBOM: false,
          enableAssignment: false, enableWorkerAssignment: false,
          enableEquipmentAssignment: false, enableEquipmentOnReport: false,
          enablePieceRate: false, allowOutsource: false,
        }) as GlobalNodeTemplate;
        setNewNodeName('');
        setEditingNodeId(created.id);
        setNodeNameDraft((created as GlobalNodeTemplate).name || newNodeName.trim());
        await onRefreshGlobalNodes();
      } catch (err: any) { toast.error(err.message || '操作失败'); }
    });
  };

  const removeNode = async (id: string) => {
    try {
      await api.settings.nodes.delete(id);
      if (editingNodeId === id) setEditingNodeId(null);
      await onRefreshGlobalNodes();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  const updateNodeConfig = async (id: string, updates: Partial<GlobalNodeTemplate>) => {
    try {
      await api.settings.nodes.update(id, updates);
      await onRefreshGlobalNodes();
    } catch (err: any) { toast.error(err.message || '操作失败'); }
  };

  const addFieldToNode = (nodeId: string) => {
    const node = globalNodes.find(n => n.id === nodeId);
    if (node) {
      const newField: ReportFieldDefinition = { id: `f-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, label: '新填报项', type: 'text' };
      updateNodeConfig(nodeId, { reportTemplate: [...node.reportTemplate, newField] });
    }
  };

  const updateNodeField = (nodeId: string, fieldId: string, updates: Partial<ReportFieldDefinition>) => {
    const node = globalNodes.find(n => n.id === nodeId);
    if (node) {
      const newFields = node.reportTemplate.map(f => f.id === fieldId ? { ...f, ...updates } : f);
      updateNodeConfig(nodeId, { reportTemplate: newFields });
    }
  };

  const removeNodeField = (nodeId: string, fieldId: string) => {
    const node = globalNodes.find(n => n.id === nodeId);
    if (node) {
      updateNodeConfig(nodeId, { reportTemplate: node.reportTemplate.filter(f => f.id !== fieldId) });
    }
  };

  const displayTpl = (node: GlobalNodeTemplate) => node.reportDisplayTemplate ?? [];

  const addDisplayFieldToNode = (nodeId: string) => {
    const node = globalNodes.find(n => n.id === nodeId);
    if (node) {
      const newField: ReportFieldDefinition = {
        id: `d-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        label: '新展示项',
        type: 'text',
      };
      updateNodeConfig(nodeId, { reportDisplayTemplate: [...displayTpl(node), newField] });
    }
  };

  const updateDisplayNodeField = (nodeId: string, fieldId: string, updates: Partial<ReportFieldDefinition>) => {
    const node = globalNodes.find(n => n.id === nodeId);
    if (node) {
      const newFields = displayTpl(node).map(f => (f.id === fieldId ? { ...f, ...updates } : f));
      updateNodeConfig(nodeId, { reportDisplayTemplate: newFields });
    }
  };

  const removeDisplayNodeField = (nodeId: string, fieldId: string) => {
    const node = globalNodes.find(n => n.id === nodeId);
    if (node) {
      updateNodeConfig(nodeId, { reportDisplayTemplate: displayTpl(node).filter(f => f.id !== fieldId) });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-4 space-y-4">
         <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold text-slate-800 mb-6 flex items-center gap-2 text-sm uppercase tracking-wider">
            <Database className="w-4 h-4 text-indigo-600" />
            全局工序库
          </h2>
          <div className="space-y-3 mb-8">
            {globalNodes.map(node => (
              <div 
                key={node.id} 
                onClick={() => {
                  setEditingNodeId(node.id);
                  setNodeNameDraft(node.name);
                }}
                className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all group ${
                  editingNodeId === node.id 
                  ? 'border-indigo-600 bg-indigo-50/50 shadow-sm' 
                  : 'border-slate-50 bg-slate-50 hover:bg-white hover:border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-bold ${editingNodeId === node.id ? 'text-indigo-900' : 'text-slate-600'}`}>{node.name}</span>
                </div>
                <ArrowRight className={`w-4 h-4 transition-all ${editingNodeId === node.id ? 'text-indigo-600 translate-x-1' : 'text-slate-200'}`} />
              </div>
            ))}
          </div>
          {canCreate && (
          <div className="pt-6 border-t border-slate-50">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">快速录入新工序</h3>
            <div className="space-y-4">
              <input type="text" placeholder="工序名称" value={newNodeName} onChange={e => setNewNodeName(e.target.value)} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none" />
              <button type="button" onClick={() => void handleQuickAddNode()} disabled={!newNodeName.trim() || addLock.busy} className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed">{addLock.busy ? '提交中…' : '保存并配置'}</button>
            </div>
          </div>
          )}
        </div>
      </div>
      <div className="lg:col-span-8">
         {editingNodeId ? (
           <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-right-4">
              {globalNodes.filter(n => n.id === editingNodeId).map(node => (
                 <div key={node.id}>
                    <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                      <h2 className="font-black text-slate-800 text-lg">编辑工序：{nodeNameDraft || node.name}</h2>
                      {canDelete && <button onClick={() => removeNode(node.id)} className="text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>}
                    </div>
                    <div className="p-8 space-y-10">
                       <div className="space-y-4">
                          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Settings className="w-4 h-4" /> 1. 工序基础信息
                          </h3>
                          <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100 max-w-md">
                             <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase block mb-1 tracking-widest">工序名称</label>
                                <input
                                  type="text"
                                  value={nodeNameDraft}
                                  onChange={(e) => setNodeNameDraft(e.target.value)}
                                  onBlur={async () => {
                                    const cur = globalNodes.find((x) => x.id === node.id);
                                    if (!cur) return;
                                    const next = nodeNameDraft.trim();
                                    if (next === cur.name) return;
                                    if (!next) {
                                      toast.error('工序名称不能为空');
                                      setNodeNameDraft(cur.name);
                                      return;
                                    }
                                    try {
                                      await api.settings.nodes.update(node.id, { name: next });
                                      await onRefreshGlobalNodes();
                                    } catch (err: unknown) {
                                      toast.error(err instanceof Error ? err.message : '保存失败');
                                      setNodeNameDraft(cur.name);
                                    }
                                  }}
                                  className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                             </div>
                          </div>
                       </div>

                       <div className="space-y-4">
                          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Settings className="w-4 h-4" /> 2. 工序功能开关
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                <div className="flex items-center justify-between mb-2">
                                   <div className="flex items-center gap-2">
                                     <Boxes className="w-4 h-4 text-indigo-400" />
                                     <span className="text-sm font-bold text-slate-800">启用 BOM 依赖</span>
                                   </div>
                                   <button onClick={() => updateNodeConfig(node.id, { hasBOM: !node.hasBOM })}>
                                     {node.hasBOM ? <ToggleRight className="w-8 h-8 text-indigo-600" /> : <ToggleLeft className="w-8 h-8 text-slate-300" />}
                                   </button>
                                </div>
                                <p className="text-[10px] text-slate-400 font-medium">开启后在此工序报工将扣减关联物料。</p>
                             </div>
                             <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                <div className="flex items-center justify-between mb-2">
                                   <div className="flex items-center gap-2">
                                     <Users className="w-4 h-4 text-indigo-400" />
                                     <span className="text-sm font-bold text-slate-800">工人派工</span>
                                   </div>
                                   <button
                                     onClick={() => {
                                       const next = !(node.enableAssignment !== false && node.enableWorkerAssignment !== false);
                                       updateNodeConfig(node.id, next ? { enableAssignment: true, enableWorkerAssignment: true } : { enableWorkerAssignment: false });
                                     }}
                                   >
                                     {(node.enableAssignment !== false && node.enableWorkerAssignment !== false) ? <ToggleRight className="w-8 h-8 text-indigo-600" /> : <ToggleLeft className="w-8 h-8 text-slate-300" />}
                                   </button>
                                </div>
                                <p className="text-[10px] text-slate-400 font-medium">开启后计划单详情中显示该工序的「分派负责人」选项。</p>
                             </div>
                             <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                <div className="flex items-center justify-between mb-2">
                                   <div className="flex items-center gap-2">
                                     <Wrench className="w-4 h-4 text-indigo-400" />
                                     <span className="text-sm font-bold text-slate-800">设备派工</span>
                                   </div>
                                   <button
                                     onClick={() => {
                                       const next = !(node.enableAssignment !== false && node.enableEquipmentAssignment !== false);
                                       updateNodeConfig(node.id, next ? { enableAssignment: true, enableEquipmentAssignment: true } : { enableEquipmentAssignment: false });
                                     }}
                                   >
                                     {(node.enableAssignment !== false && node.enableEquipmentAssignment !== false) ? <ToggleRight className="w-8 h-8 text-indigo-600" /> : <ToggleLeft className="w-8 h-8 text-slate-300" />}
                                   </button>
                                </div>
                                <p className="text-[10px] text-slate-400 font-medium">开启后计划单详情中显示该工序的「分派设备」选项。</p>
                             </div>
                             <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                <div className="flex items-center justify-between mb-2">
                                   <div className="flex items-center gap-2">
                                     <Wrench className="w-4 h-4 text-indigo-400" />
                                     <span className="text-sm font-bold text-slate-800">报工选择设备</span>
                                   </div>
                                   <button onClick={() => updateNodeConfig(node.id, { enableEquipmentOnReport: !node.enableEquipmentOnReport })}>
                                     {node.enableEquipmentOnReport ? <ToggleRight className="w-8 h-8 text-indigo-600" /> : <ToggleLeft className="w-8 h-8 text-slate-300" />}
                                   </button>
                                </div>
                                <p className="text-[10px] text-slate-400 font-medium">开启后该工序报工时需选择设备（参照设备派工输入框）。</p>
                             </div>
                             <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                <div className="flex items-center justify-between mb-2">
                                   <div className="flex items-center gap-2">
                                     <DollarSign className="w-4 h-4 text-indigo-400" />
                                     <span className="text-sm font-bold text-slate-800">开启计件工价</span>
                                   </div>
                                   <button onClick={() => updateNodeConfig(node.id, { enablePieceRate: !node.enablePieceRate })}>
                                     {node.enablePieceRate ? <ToggleRight className="w-8 h-8 text-indigo-600" /> : <ToggleLeft className="w-8 h-8 text-slate-300" />}
                                   </button>
                                </div>
                                <p className="text-[10px] text-slate-400 font-medium">开启后产品与 BOM 中可配置该工序工价（元/件），计划单详情显示工价。</p>
                             </div>
                             <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                <div className="flex items-center justify-between mb-2">
                                   <div className="flex items-center gap-2">
                                     <Truck className="w-4 h-4 text-indigo-400" />
                                     <span className="text-sm font-bold text-slate-800">可外协</span>
                                   </div>
                                   <button onClick={() => updateNodeConfig(node.id, { allowOutsource: !node.allowOutsource })}>
                                     {node.allowOutsource ? <ToggleRight className="w-8 h-8 text-indigo-600" /> : <ToggleLeft className="w-8 h-8 text-slate-300" />}
                                   </button>
                                </div>
                                <p className="text-[10px] text-slate-400 font-medium">开启后该工序会在外协管理待发清单中显示，可按工单选择工序发出。</p>
                             </div>
                          </div>
                       </div>

                       <div className="space-y-4 pt-4 border-t border-slate-100">
                          <div className="flex items-center justify-between">
                             <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><BookOpen className="w-4 h-4" /> 报工页展示内容</h3>
                             <button type="button" onClick={() => addDisplayFieldToNode(node.id)} className="flex items-center gap-2 px-4 py-1.5 bg-slate-700 text-white rounded-xl text-[10px] font-black hover:bg-slate-800 transition-all">
                                <PlusCircle className="w-3.5 h-3.5" /> 增加展示项
                             </button>
                          </div>
                          <p className="text-[10px] text-slate-400 font-medium -mt-2">在产品工序中维护具体内容（如工艺说明、标准 PDF）；报工弹窗顶部只读展示，不参与报工校验。</p>
                          <div className="space-y-3">
                             {displayTpl(node).length === 0 && (
                               <p className="text-center py-8 text-xs text-slate-300 italic border-2 border-dashed border-slate-100 rounded-2xl">暂无展示项</p>
                             )}
                             {displayTpl(node).map((field, idx) => (
                               <div key={field.id} className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col gap-3">
                                  <div className="flex flex-col md:flex-row md:items-start gap-4">
                                     <div className="w-6 h-6 bg-white rounded-lg flex items-center justify-center text-[10px] font-black text-slate-400 shadow-sm shrink-0">{idx + 1}</div>
                                     <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                        <ExtFieldLabelInput
                                          inputKey={`node-dt-${node.id}-${field.id}`}
                                          label={field.label}
                                          placeholder="标签名称"
                                          onPersist={(t) => updateDisplayNodeField(node.id, field.id, { label: t })}
                                          className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold outline-none"
                                        />
                                        <select
                                          value={field.type === 'file' ? 'file' : 'text'}
                                          onChange={(e) => {
                                            const v = e.target.value as 'text' | 'file';
                                            updateDisplayNodeField(node.id, field.id, { type: v, options: undefined });
                                          }}
                                          className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold outline-none"
                                        >
                                          <option value="text">文本说明</option>
                                          <option value="file">文件 / PDF / 图片</option>
                                        </select>
                                        <div className="flex items-center gap-4 px-2 flex-wrap md:col-span-1">
                                           <button type="button" onClick={() => removeDisplayNodeField(node.id, field.id)} className="ml-auto p-1.5 text-rose-300 hover:text-rose-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                     </div>
                                  </div>
                               </div>
                             ))}
                          </div>
                       </div>

                       <div className="space-y-4 pt-4 border-t border-slate-100">
                          <div className="flex items-center justify-between">
                             <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><FileText className="w-4 h-4" /> 报工填报项</h3>
                             <button type="button" onClick={() => addFieldToNode(node.id)} className="flex items-center gap-2 px-4 py-1.5 bg-slate-900 text-white rounded-xl text-[10px] font-black hover:bg-black transition-all">
                                <PlusCircle className="w-3.5 h-3.5" /> 增加填报项
                             </button>
                          </div>
                          <p className="text-[10px] text-slate-400 font-medium -mt-2">报工时由工人填写，写入报工记录的自定义字段。</p>
                          <div className="space-y-3">
                             {node.reportTemplate.length === 0 && <p className="text-center py-10 text-xs text-slate-300 italic border-2 border-dashed border-slate-100 rounded-2xl">暂无表单项，工人只需上报完工数量</p>}
                             {node.reportTemplate.map((field, idx) => {
                               const typeTri: FieldType =
                                 field.type === 'select' || field.type === 'file' ? field.type : 'text';
                               return (
                               <div key={field.id} className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col gap-3">
                                  <div className="flex flex-col md:flex-row md:items-start gap-4">
                                     <div className="w-6 h-6 bg-white rounded-lg flex items-center justify-center text-[10px] font-black text-slate-400 shadow-sm shrink-0">{idx + 1}</div>
                                     <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                        <ExtFieldLabelInput
                                          inputKey={`node-rt-${node.id}-${field.id}`}
                                          label={field.label}
                                          placeholder="标签名称"
                                          onPersist={(t) => updateNodeField(node.id, field.id, { label: t })}
                                          className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold outline-none"
                                        />
                                        <select
                                          value={typeTri}
                                          onChange={(e) => {
                                            const v = e.target.value as FieldType;
                                            if (v === 'select') {
                                              updateNodeField(node.id, field.id, {
                                                type: v,
                                                options:
                                                  field.type === 'select' && Array.isArray(field.options) && field.options.length > 0
                                                    ? field.options
                                                    : [],
                                              });
                                            } else {
                                              updateNodeField(node.id, field.id, { type: v, options: undefined });
                                            }
                                          }}
                                          className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold outline-none"
                                        >
                                          <option value="text">文本输入</option>
                                          <option value="select">下拉选择</option>
                                          <option value="file">上传文件/图片</option>
                                        </select>
                                        <div className="flex items-center gap-4 px-2 flex-wrap">
                                           <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={field.required} onChange={e => updateNodeField(node.id, field.id, { required: e.target.checked })} className="w-3.5 h-3.5 rounded text-indigo-600" /><span className="text-[10px] font-bold text-slate-400 uppercase">必填</span></label>
                                           <button type="button" onClick={() => removeNodeField(node.id, field.id)} className="ml-auto p-1.5 text-rose-300 hover:text-rose-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                        {field.type === 'select' && (
                                          <NodeReportTemplateSelectOptions
                                            nodeId={node.id}
                                            fieldId={field.id}
                                            options={field.options || []}
                                            onPersist={(nid, fid, next) => updateNodeField(nid, fid, { options: next })}
                                          />
                                        )}
                                     </div>
                                  </div>
                               </div>
                             );
                             })}
                          </div>
                       </div>
                    </div>
                 </div>
              ))}
           </div>
         ) : (
           <div className="h-full flex flex-col items-center justify-center bg-white rounded-[32px] border border-dashed border-slate-200 p-20 text-center opacity-60">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4"><Database className="w-8 h-8 text-slate-300" /></div>
              <h3 className="text-lg font-bold text-slate-400">请选择左侧工序进行配置</h3>
           </div>
         )}
      </div>
    </div>
  );
};

export default React.memo(NodesTab);
