import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft, Plus, Route, Edit2, Trash2, ChevronRight, X
} from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '../../contexts/ConfirmContext';
import * as api from '../../services/api';
import type { Partner, GlobalNodeTemplate, OutsourceRoute, OutsourceRouteStep } from '../../types';

interface CollabRoutesPanelProps {
  onBack: () => void;
  embeddedInModal?: boolean;
  nodeTemplates?: GlobalNodeTemplate[];
  activeCollabs: any[];
  partners: Partner[];
}

const CollabRoutesPanel: React.FC<CollabRoutesPanelProps> = ({
  onBack, embeddedInModal = false, nodeTemplates, activeCollabs, partners,
}) => {
  const confirm = useConfirm();

  const [outsourceRoutes, setOutsourceRoutes] = useState<OutsourceRoute[]>([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routeEditOpen, setRouteEditOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<OutsourceRoute | null>(null);
  const [routeName, setRouteName] = useState('');
  const [routeSteps, setRouteSteps] = useState<OutsourceRouteStep[]>([]);
  const [savingRoute, setSavingRoute] = useState(false);

  const outsourceNodes = useMemo(() =>
    (nodeTemplates ?? []).filter(n => n.allowOutsource),
  [nodeTemplates]);

  const collabTenantPartnerMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of partners) {
      if (p.collaborationTenantId) map[p.collaborationTenantId] = p.name;
    }
    return map;
  }, [partners]);

  const collabDisplayName = useCallback((tenantId: string, tenantName: string) => {
    const partnerName = collabTenantPartnerMap[tenantId];
    return partnerName ? `${partnerName}（${tenantName}）` : tenantName;
  }, [collabTenantPartnerMap]);

  const loadRoutes = useCallback(async () => {
    setRoutesLoading(true);
    try {
      const data = await api.collaboration.listOutsourceRoutes();
      setOutsourceRoutes(data);
    } catch (err: any) {
      toast.error(err.message || '加载路线失败');
    } finally {
      setRoutesLoading(false);
    }
  }, []);

  useEffect(() => { loadRoutes(); }, [loadRoutes]);

  const startEditRoute = (route?: OutsourceRoute) => {
    setEditingRoute(route ?? null);
    setRouteName(route?.name ?? '');
    setRouteSteps(route?.steps ?? []);
    setRouteEditOpen(true);
  };

  const addRouteStep = () => {
    setRouteSteps(prev => [...prev, { stepOrder: prev.length, nodeId: '', nodeName: '', receiverTenantId: '', receiverTenantName: '' }]);
  };

  const removeRouteStep = (idx: number) => {
    setRouteSteps(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, stepOrder: i })));
  };

  const updateRouteStep = (idx: number, patch: Partial<OutsourceRouteStep>) => {
    setRouteSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };

  const saveRoute = async () => {
    if (!routeName.trim()) { toast.warning('请输入路线名称'); return; }
    if (routeSteps.length === 0) { toast.warning('请至少添加一个步骤'); return; }
    for (const s of routeSteps) {
      if (!s.receiverTenantId || !s.nodeId) { toast.warning('每一步须选择工序和协作企业'); return; }
    }
    setSavingRoute(true);
    try {
      const payload = { name: routeName.trim(), steps: routeSteps };
      if (editingRoute) {
        await api.collaboration.updateOutsourceRoute(editingRoute.id, payload);
        toast.success('路线已更新');
      } else {
        await api.collaboration.createOutsourceRoute(payload);
        toast.success('路线已创建');
      }
      setRouteEditOpen(false);
      loadRoutes();
    } catch (err: any) {
      toast.error(err.message || '保存失败');
    } finally {
      setSavingRoute(false);
    }
  };

  const deleteRoute = async (id: string) => {
    const ok = await confirm({ message: '确认删除该路线？', danger: true });
    if (!ok) return;
    try {
      await api.collaboration.deleteOutsourceRoute(id);
      toast.success('已删除');
      loadRoutes();
    } catch (err: any) {
      toast.error(err.message || '删除失败');
    }
  };

  return (
    <div className={`w-full min-w-0 space-y-4 ${embeddedInModal ? '' : 'animate-in slide-in-from-bottom-4'}`}>
      <div className={`flex items-center ${embeddedInModal ? 'justify-end' : 'justify-between'}`}>
        {!embeddedInModal && (
          <button type="button" onClick={onBack} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
            <ArrowLeft className="w-4 h-4" /> 返回收件箱
          </button>
        )}
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => startEditRoute()} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all">
            <Plus className="w-4 h-4" /> 新建路线
          </button>
        </div>
      </div>
      <div className={`bg-white border border-slate-200 shadow-sm overflow-hidden ${embeddedInModal ? 'rounded-xl' : 'rounded-2xl'}`}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <Route className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="text-lg font-black text-slate-900">外协路线</h3>
            <p className="text-xs text-slate-500">配置多步外协传递路线，在外协发出时可选择路线实现链式转发</p>
          </div>
        </div>
        {routesLoading ? (
          <div className="px-6 py-12 text-center text-slate-400 text-sm">加载中...</div>
        ) : outsourceRoutes.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-400 text-sm">暂无外协路线，点击右上角新建</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {outsourceRoutes.map(r => (
              <div key={r.id} className="px-6 py-4 hover:bg-slate-50/50 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-black text-slate-900">{r.name}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEditRoute(r)} className="text-indigo-600 hover:text-indigo-800"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => deleteRoute(r.id)} className="text-rose-500 hover:text-rose-700"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {(r.steps || []).sort((a: any, b: any) => a.stepOrder - b.stepOrder).map((s: any, i: number) => (
                    <React.Fragment key={i}>
                      {i > 0 && <ChevronRight className="w-3 h-3 text-slate-400" />}
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold">
                        {s.nodeName || '工序'} · {s.receiverTenantId ? collabDisplayName(s.receiverTenantId, s.receiverTenantName || '企业') : (s.receiverTenantName || '企业')}
                      </span>
                    </React.Fragment>
                  ))}
                  <ChevronRight className="w-3 h-3 text-slate-400" />
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold">
                    回传甲方
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">{new Date(r.createdAt).toLocaleDateString()} · {r.steps.length} 步</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 路线编辑弹窗 */}
      {routeEditOpen && (
        <div className="fixed inset-0 bg-black/30 z-[95] flex items-center justify-center p-4" onClick={() => setRouteEditOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto z-[96]" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900">{editingRoute ? '编辑路线' : '新建路线'}</h3>
              <button onClick={() => setRouteEditOpen(false)}><X className="w-5 h-5 text-slate-400 hover:text-slate-600" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase block ml-1">路线名称</label>
                <input
                  value={routeName}
                  onChange={e => setRouteName(e.target.value)}
                  placeholder="例如：裁剪-缝制-后整"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">步骤 ({routeSteps.length})</label>
                  <button onClick={addRouteStep} className="text-indigo-600 hover:text-indigo-800 text-xs font-bold flex items-center gap-1">
                    <Plus className="w-3 h-3" /> 添加步骤
                  </button>
                </div>
                {routeSteps.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-slate-50 rounded-xl p-3">
                    <span className="text-xs font-black text-slate-400 w-6 text-center shrink-0">{idx + 1}</span>
                    <select
                      value={step.nodeId}
                      onChange={e => {
                        const node = outsourceNodes.find(n => n.id === e.target.value);
                        updateRouteStep(idx, { nodeId: e.target.value, nodeName: node?.name ?? '' });
                      }}
                      className="flex-1 bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs font-bold text-slate-800"
                    >
                      <option value="">选择工序</option>
                      {outsourceNodes.map(n => (
                        <option key={n.id} value={n.id}>{n.name}</option>
                      ))}
                    </select>
                    <select
                      value={step.receiverTenantId}
                      onChange={e => {
                        const c = activeCollabs.find((c: any) => c.otherTenantId === e.target.value);
                        updateRouteStep(idx, { receiverTenantId: e.target.value, receiverTenantName: c?.otherTenantName ?? '' });
                      }}
                      className="flex-1 bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs font-bold text-slate-800"
                    >
                      <option value="">选择协作企业</option>
                      {activeCollabs.filter((c: any) => {
                        const usedIds = routeSteps.filter((_, si) => si !== idx).map(s => s.receiverTenantId);
                        return !usedIds.includes(c.otherTenantId);
                      }).map((c: any) => (
                        <option key={c.otherTenantId} value={c.otherTenantId}>{collabDisplayName(c.otherTenantId, c.otherTenantName)}</option>
                      ))}
                    </select>
                    <button onClick={() => removeRouteStep(idx)} className="text-rose-400 hover:text-rose-600 shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {routeSteps.length === 0 && (
                  <div className="text-center text-slate-400 text-xs py-4">点击上方「添加步骤」开始配置路线</div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button onClick={() => setRouteEditOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-800">取消</button>
              <button onClick={saveRoute} disabled={savingRoute} className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all">
                {savingRoute ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(CollabRoutesPanel);
