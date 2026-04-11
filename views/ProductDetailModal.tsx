import React, { useState, useEffect } from 'react';
import { X, Package, Tag, Wrench, Boxes, ArrowLeft } from 'lucide-react';
import { Product, ProductCategory, AppDictionaries, Partner, GlobalNodeTemplate, BOM } from '../types';
import { productColorSizeEnabled } from '../utils/productColorSize';

function getFileExtFromDataUrl(dataUrl: string): string {
  const m = dataUrl.match(/^data:([^;]+);/);
  if (!m) return 'bin';
  const map: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
    'application/pdf': 'pdf',
  };
  return map[m[1]] || 'bin';
}

interface ProductDetailModalProps {
  productId: string | null;
  onClose: () => void;
  products: Product[];
  categories: ProductCategory[];
  dictionaries: AppDictionaries;
  partners: Partner[];
  boms: BOM[];
  globalNodes: GlobalNodeTemplate[];
}

const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  productId, onClose, products, categories, dictionaries, partners, boms, globalNodes
}) => {
  const [bomSkuId, setBomSkuId] = useState<string | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [filePreviewType, setFilePreviewType] = useState<'image' | 'pdf'>('image');

  useEffect(() => {
    setBomSkuId(null);
  }, [productId]);

  if (!productId) return null;
  const p = products.find(x => x.id === productId);
  if (!p) return null;

  const cat = categories.find(c => c.id === p.categoryId);
  const unitName = p?.unitId ? dictionaries.units?.find(u => u.id === p.unitId)?.name : '件';

  return (
    <>
      <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />
        <div className="relative bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {p.imageUrl ? (
                <img loading="lazy" decoding="async" src={p.imageUrl} alt={p.name} className="w-16 h-16 rounded-2xl object-cover border border-slate-200" />
              ) : (
                <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-400"><Package className="w-8 h-8" /></div>
              )}
              <div>
                <h2 className="text-xl font-black text-slate-900">{p.name}</h2>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">SKU: {p.sku} · {cat?.name || '未分类'}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"><X className="w-6 h-6" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            <div className="space-y-2">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-0.5">业务分类</h3>
              <div className="flex flex-wrap gap-1.5" role="list" aria-label="产品所属业务分类">
                {categories.length === 0 ? (
                  <span className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400">暂无分类配置</span>
                ) : (
                  categories.map(c => {
                    const active = c.id === p.categoryId;
                    return (
                      <span
                        key={c.id}
                        role="listitem"
                        className={`inline-flex items-center px-4 py-2 rounded-lg text-xs font-semibold transition-all border ${
                          active
                            ? 'bg-indigo-600 text-white shadow-sm border-indigo-600'
                            : 'bg-white/40 text-slate-400 border-slate-200/60'
                        }`}
                      >
                        {c.name}
                      </span>
                    );
                  })
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {(p.salesPrice ?? 0) > 0 && (
                <div className="bg-slate-50 rounded-2xl p-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-1">销售单价</p>
                  <p className="text-lg font-black text-indigo-600">¥ {(p.salesPrice ?? 0).toLocaleString()} <span className="text-slate-500 font-bold">{unitName}</span></p>
                </div>
              )}
              {(p.purchasePrice ?? 0) > 0 && (
                <div className="bg-slate-50 rounded-2xl p-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-1">采购单价</p>
                  <p className="text-lg font-black text-slate-600">¥ {(p.purchasePrice ?? 0).toLocaleString()} <span className="text-slate-500 font-bold">{unitName}</span></p>
                </div>
              )}
              {p.supplierId && (() => {
                const supplier = partners.find(pt => pt.id === p.supplierId);
                return supplier ? (
                  <div className="bg-slate-50 rounded-2xl p-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase mb-1">供应商</p>
                    <p className="text-sm font-bold text-slate-700">{supplier.name}</p>
                  </div>
                ) : null;
              })()}
              {(!((p.salesPrice ?? 0) > 0) && !((p.purchasePrice ?? 0) > 0)) && (
                <div className="col-span-2 bg-slate-50 rounded-2xl p-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-1">单位</p>
                  <p className="text-sm font-bold text-slate-700">{unitName}</p>
                </div>
              )}
            </div>
            {cat?.customFields && cat.customFields.length > 0 && p.categoryCustomData && (
              <div className="space-y-3">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Tag className="w-3.5 h-3.5" /> 扩展属性</h3>
                <div className="flex flex-wrap gap-2">
                  {cat.customFields.map(f => {
                    const val = p.categoryCustomData?.[f.id];
                    if (val == null || val === '') return null;
                    if (f.type === 'file' && typeof val === 'string' && val.startsWith('data:')) {
                      const isImg = val.startsWith('data:image/');
                      const isPdf = val.startsWith('data:application/pdf');
                      if (isImg) return (
                        <div key={f.id} className="flex items-center gap-2">
                          <img src={val} alt={f.label} className="h-12 w-12 object-cover rounded-xl border cursor-pointer hover:ring-2 hover:ring-indigo-400" onClick={() => { setFilePreviewUrl(val); setFilePreviewType('image'); }} />
                          <a href={val} download={`${f.label}.${getFileExtFromDataUrl(val)}`} className="text-xs font-bold text-indigo-600 hover:underline">下载</a>
                        </div>
                      );
                      if (isPdf) return (
                        <div key={f.id} className="flex items-center gap-2">
                          <button type="button" onClick={() => { setFilePreviewUrl(val); setFilePreviewType('pdf'); }} className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100">在线查看</button>
                          <a href={val} download={`${f.label}.${getFileExtFromDataUrl(val)}`} className="text-xs font-bold text-indigo-600 hover:underline">下载</a>
                        </div>
                      );
                      return (
                        <a key={f.id} href={val} download={`${f.label}.${getFileExtFromDataUrl(val)}`} className="px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-bold text-slate-600 hover:bg-indigo-50">下载</a>
                      );
                    }
                    return (
                      <div key={f.id} className="px-3 py-1.5 bg-slate-100 rounded-lg">
                        <span className="text-[10px] font-bold text-slate-400">{f.label}: </span>
                        <span className="text-sm font-bold text-slate-700">{typeof val === 'boolean' ? (val ? '是' : '否') : String(val)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="space-y-3">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Wrench className="w-3.5 h-3.5" /> 工序</h3>
              <div className="flex flex-wrap gap-2">
                {(p.milestoneNodeIds || []).map(nodeId => {
                  const node = globalNodes.find(n => n.id === nodeId);
                  return node ? (
                    <span key={nodeId} className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl text-sm font-bold">{node.name}</span>
                  ) : null;
                })}
                {(!p.milestoneNodeIds || p.milestoneNodeIds.length === 0) && (
                  <span className="text-sm text-slate-400 italic">暂无工序</span>
                )}
              </div>
            </div>
            {(() => {
              const productBoms = boms.filter(b => b.parentProductId === p.id);
              const hasBomNodes = (p.milestoneNodeIds || []).some(nid => globalNodes.find(n => n.id === nid)?.hasBOM);
              const singleSkuId = `single-${p.id}`;
              const skuOptions: { id: string; label: string }[] = p.variants && p.variants.length > 0
                ? p.variants.map(v => ({
                    id: v.id,
                    label: [dictionaries.colors?.find(c => c.id === v.colorId)?.name, dictionaries.sizes?.find(s => s.id === v.sizeId)?.name].filter(Boolean).join(' / ') || v.skuSuffix
                  }))
                : [{ id: singleSkuId, label: '单 SKU' }];
              const selectedSkuBoms = bomSkuId ? productBoms.filter(b => b.variantId === bomSkuId) : [];
              return (productBoms.length > 0 || hasBomNodes) ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Boxes className="w-3.5 h-3.5" /> 工艺 BOM</h3>
                    {bomSkuId && (
                      <button type="button" onClick={() => setBomSkuId(null)} className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                        <ArrowLeft className="w-3 h-3" /> 返回选择
                      </button>
                    )}
                  </div>
                  {!bomSkuId ? (
                    <div className="space-y-2">
                      <p className="text-sm text-slate-500">点击 SKU 查看该规格的 BOM 明细</p>
                      <div className="flex flex-wrap gap-2">
                        {skuOptions.map(opt => {
                          const hasBom = productBoms.some(b => b.variantId === opt.id);
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setBomSkuId(opt.id)}
                              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${hasBom ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200' : 'bg-slate-50 text-slate-400 border border-slate-200'}`}
                            >
                              {opt.label}
                              {!hasBom && <span className="text-[10px] ml-1">(未配置)</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : selectedSkuBoms.length > 0 ? (
                    <div className="space-y-4">
                      <p className="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-2 rounded-xl w-fit">
                        当前查看：{skuOptions.find(o => o.id === bomSkuId)?.label || '该规格'}
                      </p>
                      {selectedSkuBoms.map(bom => {
                        const nodeName = bom.nodeId ? globalNodes.find(n => n.id === bom.nodeId)?.name : null;
                        return (
                          <div key={bom.id} className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                            {nodeName && <p className="text-[10px] font-bold text-indigo-600 mb-2">{nodeName}</p>}
                            <div className="space-y-1.5">
                              {bom.items.map((item, idx) => {
                                const subProd = products.find(x => x.id === item.productId);
                                const subUnit = subProd?.unitId ? dictionaries.units?.find(u => u.id === subProd.unitId)?.name : '件';
                                return (
                                  <div key={idx} className="flex justify-between items-center text-sm">
                                    <span className="font-bold text-slate-700 truncate flex-1">{subProd?.name || subProd?.sku || '未知物料'}</span>
                                    <span className="text-slate-500 font-medium shrink-0 ml-2">{item.quantity} {subUnit}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 italic py-2">该规格尚未配置 BOM 物料明细</p>
                  )}
                </div>
              ) : null;
            })()}
            {productColorSizeEnabled(p, cat) && (
              <div className="space-y-3">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Tag className="w-3.5 h-3.5" /> 颜色尺码</h3>
                <div className="space-y-2">
                  {p.colorIds && p.colorIds.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 mb-1.5">颜色</p>
                      <div className="flex flex-wrap gap-2">
                        {(p.colorIds || []).map(cId => {
                          const c = dictionaries.colors?.find(x => x.id === cId);
                          return c ? (
                            <span key={cId} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-xl text-sm font-bold text-slate-700">
                              <span className="w-2.5 h-2.5 rounded-full border border-slate-200" style={{ backgroundColor: c.value }} />
                              {c.name}
                            </span>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}
                  {p.sizeIds && p.sizeIds.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 mb-1.5">尺码</p>
                      <div className="flex flex-wrap gap-2">
                        {(p.sizeIds || []).map(sId => {
                          const s = dictionaries.sizes?.find(x => x.id === sId);
                          return s ? (
                            <span key={sId} className="px-3 py-1.5 bg-slate-50 rounded-xl text-sm font-bold text-slate-700">{s.name}</span>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 文件预览弹窗 */}
      {filePreviewUrl && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-8 bg-slate-900/80 backdrop-blur-sm" onClick={() => setFilePreviewUrl(null)}>
          <button onClick={() => setFilePreviewUrl(null)} className="absolute top-6 right-6 z-10 p-2 rounded-full bg-white/20 hover:bg-white/40 text-white transition-all">
            <X className="w-8 h-8" />
          </button>
          <div className="relative z-10 w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            {filePreviewType === 'image' ? (
              <img src={filePreviewUrl} alt="预览" className="w-full h-full max-h-[85vh] object-contain" />
            ) : (
              <iframe src={filePreviewUrl} title="PDF 预览" className="w-full h-[85vh] border-0" sandbox="allow-same-origin" />
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default ProductDetailModal;
