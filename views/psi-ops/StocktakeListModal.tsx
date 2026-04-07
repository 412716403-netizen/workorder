import React, { useState } from 'react';
import {
  Plus,
  X,
  FileText,
  ClipboardList,
  ArrowLeft,
  Trash2,
  Pencil,
} from 'lucide-react';
import { Product, Warehouse, AppDictionaries, ProductVariant } from '../../types';
import { sortedVariantColorEntries } from '../../utils/sortVariantsByProduct';
import { useConfirm } from '../../contexts/ConfirmContext';

export interface StocktakeListModalProps {
  open: boolean;
  onClose: () => void;
  stocktakeOrdersGrouped: Record<string, any[]>;
  warehouseMapPSI: Map<string, Warehouse>;
  productMapPSI: Map<string, Product>;
  dictionaries: AppDictionaries;
  hasPsiPerm: (perm: string) => boolean;
  onDeleteRecords?: (type: string, docNumber: string) => void;
  onCreateNew: () => void;
  onEditStocktake: (docNumber: string, docItems: any[]) => void;
  getUnitName: (productId: string) => string;
}

const StocktakeListModal: React.FC<StocktakeListModalProps> = ({
  open,
  onClose,
  stocktakeOrdersGrouped,
  warehouseMapPSI,
  productMapPSI,
  dictionaries,
  hasPsiPerm,
  onDeleteRecords,
  onCreateNew,
  onEditStocktake,
  getUnitName,
}) => {
  const confirm = useConfirm();
  const [detailDocNumber, setDetailDocNumber] = useState<string | null>(null);

  if (!open) return null;

  const handleClose = () => {
    setDetailDocNumber(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={handleClose} aria-hidden />
      <div className="relative bg-white w-full max-w-3xl max-h-[85vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/50">
          <div className="flex items-center gap-3">
            {detailDocNumber ? (
              <button type="button" onClick={() => setDetailDocNumber(null)} className="p-2 text-slate-500 hover:text-indigo-600 rounded-full hover:bg-slate-200/80 transition-colors" aria-label="返回列表"><ArrowLeft className="w-5 h-5" /></button>
            ) : null}
            <div>
              <h3 className="font-black text-slate-800 flex items-center gap-2 text-lg"><ClipboardList className="w-5 h-5 text-indigo-600" /> {detailDocNumber ? `盘点单详情 - ${detailDocNumber}` : '盘点单'}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{detailDocNumber ? '查看明细，可点击「编辑」修改' : '盘点单列表，可查看详情或新增'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!detailDocNumber && hasPsiPerm('psi:warehouse_stocktake:create') && (
              <button type="button" onClick={onCreateNew} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all">
                <Plus className="w-4 h-4" /> 新增盘点单
              </button>
            )}
            <button type="button" onClick={handleClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/80 transition-colors" aria-label="关闭"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {!detailDocNumber ? (
            Object.keys(stocktakeOrdersGrouped).length === 0 ? (
              <div className="py-16 text-center text-slate-500">
                <FileText className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                <p className="text-sm font-medium">暂无盘点单</p>
                <p className="text-xs mt-1">点击「新增盘点单」创建第一张盘点单</p>
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(stocktakeOrdersGrouped).map(([docNum, docItems]) => {
                  const first = docItems[0];
                  const totalQty = docItems.reduce((s: number, i: any) => s + (i.quantity ?? 0), 0);
                  const whName = warehouseMapPSI.get(first.warehouseId)?.name ?? '—';
                  return (
                    <div key={docNum} className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] font-mono font-black text-indigo-600 uppercase tracking-wide">{docNum}</span>
                        <span className="text-sm text-slate-600">{whName}</span>
                        <span className="text-xs text-slate-400">{(first.createdAt || '').toString().slice(0, 10)}</span>
                        <span className="text-sm font-bold text-slate-700">共 {totalQty} 件</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setDetailDocNumber(docNum)} className="px-3 py-1.5 text-[11px] font-bold rounded-xl border border-indigo-100 text-indigo-600 bg-white hover:bg-indigo-50 transition-all flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5" /> 查看详情
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            (() => {
              const docItems = stocktakeOrdersGrouped[detailDocNumber];
              if (!docItems || docItems.length === 0) return <p className="text-slate-500 py-8">未找到该盘点单</p>;
              const first = docItems[0];
              const whName = warehouseMapPSI.get(first.warehouseId)?.name ?? '—';
              const byLineGroup = new Map<string, any[]>();
              docItems.forEach((r: any) => {
                const gid = r.lineGroupId ?? r.id;
                if (!byLineGroup.has(gid)) byLineGroup.set(gid, []);
                byLineGroup.get(gid)!.push(r);
              });
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div><span className="text-slate-400 block text-xs font-bold mb-0.5">盘点仓库</span><span className="font-bold text-slate-800">{whName}</span></div>
                    <div><span className="text-slate-400 block text-xs font-bold mb-0.5">盘点日期</span><span className="font-bold text-slate-800">{(first.createdAt || '').toString().slice(0, 10)}</span></div>
                    {first.note && <div className="col-span-2"><span className="text-slate-400 block text-xs font-bold mb-0.5">备注</span><span className="text-slate-600">{first.note}</span></div>}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">盘点明细</h4>
                    <p className="text-xs text-slate-500 mb-2">「系统数量」= 本单保存时该产品在系统中的数量（盘前），「实盘数量」= 本单盘点录入的数量，便于了解从多少数量盘库到多少数量；有颜色尺码会展开各规格的当时系统数与实盘数。</p>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">产品</th><th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">系统数量（盘前）</th><th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">实盘数量</th></tr></thead>
                        <tbody>
                          {Array.from(byLineGroup.entries()).map(([gid, grp]) => {
                            const firstLine = grp[0];
                            const product = productMapPSI.get(firstLine.productId);
                            const whId = first.warehouseId;
                            const qty = grp.reduce((s: number, r: any) => s + (r.quantity ?? 0), 0);
                            const hasVariants = (product?.variants?.length ?? 0) > 0;
                            const hasSavedSysQty = grp.some((r: any) => typeof r.systemQuantity === 'number');
                            const systemQtyAtStocktake = hasSavedSysQty
                              ? grp.reduce((s: number, r: any) => s + (r.systemQuantity ?? 0), 0)
                              : (() => { const diffQ = docItems.find((r: any) => r.productId === firstLine.productId)?.diffQuantity ?? 0; return qty - Number(diffQ); })();
                            const stGroupedByColor: Record<string, ProductVariant[]> = {};
                            if (product?.variants) {
                              product.variants.forEach((v: ProductVariant) => {
                                if (!stGroupedByColor[v.colorId]) stGroupedByColor[v.colorId] = [];
                                stGroupedByColor[v.colorId].push(v);
                              });
                            }
                            const variantQtyFromGrp = (variantId: string) => grp.reduce((s: number, r: any) => s + (r.variantId === variantId ? (r.quantity ?? 0) : 0), 0);
                            const variantSysFromGrp = (variantId: string) => {
                              const rec = grp.find((r: any) => (r.variantId || '') === variantId);
                              return typeof rec?.systemQuantity === 'number' ? rec.systemQuantity : null;
                            };
                            return (
                              <React.Fragment key={gid}>
                                <tr className="border-b border-slate-100">
                                  <td className="px-4 py-3 font-bold text-slate-800">{product?.name ?? '—'} <span className="text-slate-400 font-normal text-xs">{product?.sku ?? ''}</span></td>
                                  <td className="px-4 py-3 text-right font-bold text-slate-600">{systemQtyAtStocktake} {product ? getUnitName(product.id) : 'PCS'}</td>
                                  <td className="px-4 py-3 text-right font-black text-indigo-600">{qty} {product ? getUnitName(product.id) : 'PCS'}</td>
                                </tr>
                                {hasVariants && whId && (
                                  <tr className="border-b border-slate-100 last:border-0 bg-slate-50/60">
                                    <td colSpan={3} className="px-4 py-3">
                                      <div className="space-y-3">
                                        {sortedVariantColorEntries(stGroupedByColor, product?.colorIds, product?.sizeIds).map(([colorId, colorVariants]) => {
                                          const color = dictionaries?.colors?.find(c => c.id === colorId);
                                          return (
                                            <div key={colorId} className="flex flex-wrap items-center gap-4 bg-white p-3 rounded-xl border border-slate-100">
                                              <div className="flex items-center gap-2 w-28 shrink-0">
                                                <div className="w-4 h-4 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: (color as any)?.value || '#e2e8f0' }} />
                                                <span className="text-xs font-bold text-slate-700">{color?.name || '未命名'}</span>
                                              </div>
                                              <div className="flex flex-wrap gap-4">
                                                {colorVariants.map((v: ProductVariant) => {
                                                  const size = dictionaries?.sizes?.find(s => s.id === v.sizeId);
                                                  const actualV = variantQtyFromGrp(v.id);
                                                  const sysV = variantSysFromGrp(v.id) ?? actualV;
                                                  return (
                                                    <div key={v.id} className="flex flex-col gap-0.5 w-24">
                                                      <span className="text-[9px] font-bold text-slate-400 uppercase">{size?.name || v.skuSuffix}</span>
                                                      <div className="flex items-center gap-2 text-xs">
                                                        <span className="text-slate-500">系统 <span className="font-bold text-slate-600">{sysV}</span></span>
                                                        <span className="text-slate-400">/</span>
                                                        <span className="text-indigo-600 font-black">实盘 {actualV}</span>
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="flex justify-end items-center gap-3 pt-2">
                    {onDeleteRecords && hasPsiPerm('psi:warehouse_stocktake:delete') && (
                      <button type="button" onClick={() => { void confirm({ message: '确定要删除该盘点单吗？', danger: true }).then((ok) => { if (!ok) return; onDeleteRecords('STOCKTAKE', detailDocNumber); setDetailDocNumber(null); onClose(); }); }} className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-rose-50 hover:text-rose-600 hover:border-rose-100 transition-all">
                        <Trash2 className="w-4 h-4" /> 删除盘点单
                      </button>
                    )}
                    {hasPsiPerm('psi:warehouse_stocktake:edit') && (
                    <button type="button" onClick={() => onEditStocktake(detailDocNumber, docItems)} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all">
                      <Pencil className="w-4 h-4" /> 编辑盘点单
                    </button>
                    )}
                  </div>
                </div>
              );
            })()
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(StocktakeListModal);
