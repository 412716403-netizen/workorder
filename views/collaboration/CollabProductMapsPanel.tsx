import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Link2, Edit2, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import * as api from '../../services/api';
import type { Product } from '../../types';

interface CollabProductMapsPanelProps {
  onBack: () => void;
  products: Product[];
}

const CollabProductMapsPanel: React.FC<CollabProductMapsPanelProps> = ({ onBack, products }) => {
  const navigate = useNavigate();
  const [productMaps, setProductMaps] = useState<any[]>([]);
  const [mapsLoading, setMapsLoading] = useState(false);
  const [resolvedReceiverProducts, setResolvedReceiverProducts] = useState<Record<string, Product>>({});
  const mapsFetchedProductIdsRef = useRef<Set<string>>(new Set());

  const loadMaps = async () => {
    setMapsLoading(true);
    try {
      const data = await api.collaboration.listProductMaps();
      setProductMaps(data);
    } catch { /* ignore */ }
    setMapsLoading(false);
  };

  useEffect(() => { loadMaps(); }, []);

  useEffect(() => {
    if (productMaps.length === 0) return;
    const ids = ([...new Set(productMaps.map((m: any) => m.receiverProductId).filter(Boolean))] as string[])
      .filter(id => !products.some(p => p.id === id) && !mapsFetchedProductIdsRef.current.has(id));
    if (ids.length === 0) return;
    let cancelled = false;
    ids.forEach(id => mapsFetchedProductIdsRef.current.add(id));
    Promise.all(
      ids.map(id =>
        api.products.get(id)
          .then(p => ({ id, product: p as Product }))
          .catch(() => { mapsFetchedProductIdsRef.current.delete(id); return null; })
      )
    ).then(results => {
      if (cancelled) return;
      const resolved: Record<string, Product> = {};
      for (const r of results) { if (r) resolved[r.id] = r.product; }
      if (Object.keys(resolved).length > 0) {
        setResolvedReceiverProducts(prev => ({ ...prev, ...resolved }));
      }
    });
    return () => { cancelled = true; };
  }, [productMaps, products]);

  const deleteMap = async (id: string) => {
    try {
      await api.collaboration.deleteProductMap(id);
      toast.success('已删除');
      loadMaps();
    } catch (err: any) {
      toast.error(err.message || '删除失败');
    }
  };

  return (
    <div className="w-full min-w-0 space-y-4 animate-in slide-in-from-bottom-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
          <ArrowLeft className="w-4 h-4" /> 返回收件箱
        </button>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <Link2 className="w-5 h-5 text-indigo-600" />
          <h3 className="text-lg font-black text-slate-900">伙伴物料对照表</h3>
        </div>
        {mapsLoading ? (
          <div className="px-6 py-12 text-center text-slate-400 text-sm">加载中...</div>
        ) : productMaps.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-400 text-sm">暂无对照记录，接受协作单时勾选「记住映射」即可自动生成</div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase">甲方 SKU</th>
                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase">甲方产品名</th>
                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase">乙方产品</th>
                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase w-24">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {productMaps.map((m: any) => {
                const rp = products.find(p => p.id === m.receiverProductId) ?? resolvedReceiverProducts[m.receiverProductId];
                const nodeCount = rp?.milestoneNodeIds?.length ?? 0;
                return (
                  <tr key={m.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-3 text-sm font-bold text-slate-800">{m.senderSku}</td>
                    <td className="px-6 py-3 text-sm text-slate-600">{m.senderProductName}</td>
                    <td className="px-6 py-3">
                      <span className="text-sm font-bold text-indigo-600">{rp?.name ?? m.receiverProductId}</span>
                      {rp && (
                        <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded ${nodeCount > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                          {nodeCount > 0 ? `${nodeCount} 道工序` : '未配工序'}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        {rp && (
                          <button
                            onClick={() => navigate('/basic', { state: { editProductId: rp.id } })}
                            className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 text-xs font-bold"
                            title="查看/编辑产品信息与工序"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => deleteMap(m.id)} className="text-rose-500 hover:text-rose-700 text-xs font-bold"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default React.memo(CollabProductMapsPanel);
