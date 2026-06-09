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
  Scale,
  ToggleLeft,
  ToggleRight,
  FileText,
  Trash2,
  BookOpen,
} from 'lucide-react';
import { GlobalNodeTemplate, type CustomDocFieldType } from '../../types';
import { toast } from 'sonner';
import * as api from '../../services/api';
import { ExtFieldLabelInput } from './shared';
import { ReportCustomFieldsConfigTable } from '../../components/form-config/CustomFieldsEditorTable';
import { formStandardControlClass } from '../../styles/uiDensity';
import { useEquipmentFeaturesEffective } from '../../hooks/useEquipmentFeaturesEffective';
import { useFeaturePlugins } from '../../hooks/useFeaturePlugins';
import { isEquipmentAssignmentEnabled, isWorkerAssignmentEnabled } from '../../utils/nodeAssignmentFlags';

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
  const equipmentFeaturesOn = useEquipmentFeaturesEffective();
  const { isPluginEnabled } = useFeaturePlugins();
  const displayAllowedTypes: CustomDocFieldType[] = isPluginEnabled('knowledge_base')
    ? ['text', 'file', 'knowledge']
    : ['text', 'file'];
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

  const displayTpl = (node: GlobalNodeTemplate) => node.reportDisplayTemplate ?? [];

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
              <input type="text" placeholder="工序名称" value={newNodeName} onChange={e => setNewNodeName(e.target.value)} className={formStandardControlClass} />
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
                             {equipmentFeaturesOn && (
                               <>
                             <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                <div className="flex items-center justify-between mb-2">
                                   <div className="flex items-center gap-2">
                                     <Users className="w-4 h-4 text-indigo-400" />
                                     <span className="text-sm font-bold text-slate-800">工人派工</span>
                                   </div>
                                   <button
                                     onClick={() => {
                                       const next = !isWorkerAssignmentEnabled(node);
                                       updateNodeConfig(
                                         node.id,
                                         next ? { enableAssignment: true, enableWorkerAssignment: true } : { enableWorkerAssignment: false },
                                       );
                                     }}
                                   >
                                     {isWorkerAssignmentEnabled(node) ? <ToggleRight className="w-8 h-8 text-indigo-600" /> : <ToggleLeft className="w-8 h-8 text-slate-300" />}
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
                                       const next = !isEquipmentAssignmentEnabled(node);
                                       updateNodeConfig(
                                         node.id,
                                         next ? { enableAssignment: true, enableEquipmentAssignment: true } : { enableEquipmentAssignment: false },
                                       );
                                     }}
                                   >
                                     {isEquipmentAssignmentEnabled(node) ? <ToggleRight className="w-8 h-8 text-indigo-600" /> : <ToggleLeft className="w-8 h-8 text-slate-300" />}
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
                               </>
                             )}
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
                             <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                                <div className="flex items-center justify-between mb-2">
                                   <div className="flex items-center gap-2">
                                     <Scale className="w-4 h-4 text-indigo-400" />
                                     <span className="text-sm font-bold text-slate-800">报工时记录重量</span>
                                   </div>
                                   <button onClick={() => updateNodeConfig(node.id, { enableWeightOnReport: !node.enableWeightOnReport })}>
                                     {node.enableWeightOnReport ? <ToggleRight className="w-8 h-8 text-indigo-600" /> : <ToggleLeft className="w-8 h-8 text-slate-300" />}
                                   </button>
                                </div>
                                <p className="text-[10px] text-slate-400 font-medium">开启后，本工序报工/外协收回时需录入本次交货重量（kg），并按 BOM 子料用量自动分摊为各子物料实际消耗，替代"件数×BOM"的理论口径，用于计算物料损耗。</p>
                             </div>
                          </div>
                       </div>

                       <div className="space-y-4 pt-4 border-t border-slate-100">
                          <ReportCustomFieldsConfigTable
                            allowedTypes={displayAllowedTypes}
                            showShowInFormColumn={false}
                            fields={displayTpl(node)}
                            onChange={next => updateNodeConfig(node.id, { reportDisplayTemplate: next })}
                            title={
                              <span className="flex items-center gap-2">
                                <BookOpen className="w-4 h-4" /> 报工页展示内容
                              </span>
                            }
                            addButtonLabel="增加展示项"
                            idPrefix={`node-dt-${node.id}-`}
                          />
                       </div>

                       <div className="space-y-4 pt-4 border-t border-slate-100">
                          <ReportCustomFieldsConfigTable
                            showRequiredColumn
                            showShowInFormColumn={false}
                            fields={node.reportTemplate}
                            onChange={next => updateNodeConfig(node.id, { reportTemplate: next })}
                            title={
                              <span className="flex items-center gap-2">
                                <FileText className="w-4 h-4" /> 报工自定义单据内容
                              </span>
                            }
                            addButtonLabel="增加填报项"
                            idPrefix={`node-rt-${node.id}-`}
                          />
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
