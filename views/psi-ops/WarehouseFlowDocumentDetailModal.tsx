import React, { useMemo } from 'react';
import { X, ScrollText } from 'lucide-react';
import { Product, Warehouse, ProductCategory, AppDictionaries, ProductVariant } from '../../types';

const formatFlowDateTime = (ts: string) => {
  if (!ts || !ts.toString().trim()) return '—';
  const d = new Date(ts.toString());
  if (isNaN(d.getTime())) return ts.toString();
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0 || (ts.toString().length > 10 && /[T\s]/.test(ts.toString()));
  return hasTime ? d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : d.toLocaleDateString('zh-CN');
};

export interface WarehouseFlowDocumentDetailModalProps {
  warehouseFlowDetailKey: string;
  onClose: () => void;
  recordsList: any[];
  prodRecords: any[];
  ordersList: { id: string; orderNumber?: string }[];
  productMapPSI: Map<string, Product>;
  warehouseMapPSI: Map<string, Warehouse>;
  categoryMapPSI: Map<string, ProductCategory>;
  dictionaries: AppDictionaries;
  getUnitName: (productId: string) => string;
}

const WarehouseFlowDocumentDetailModal: React.FC<WarehouseFlowDocumentDetailModalProps> = ({
  warehouseFlowDetailKey,
  onClose,
  recordsList,
  prodRecords,
  ordersList,
  productMapPSI,
  warehouseMapPSI,
  categoryMapPSI,
  dictionaries,
  getUnitName,
}) => {
  const result = useMemo(() => {
    const [detailType, detailDocNo] = warehouseFlowDetailKey.split('|');
    const isStockIn = detailType === 'STOCK_IN';
    const isStockReturn = detailType === 'STOCK_RETURN';
    const isStockOut = detailType === 'STOCK_OUT';
    const docRecords = isStockIn
      ? (prodRecords || []).filter((r: any) => {
          if (r.type !== 'STOCK_IN') return false;
          if (r.docNo === detailDocNo || r.id === detailDocNo) return true;
          if (detailDocNo.startsWith('工单入库-')) {
            const wantOrderNum = detailDocNo.replace('工单入库-', '');
            const order = ordersList.find((o) => o.id === r.orderId);
            return order?.orderNumber === wantOrderNum;
          }
          return false;
        }) as any[]
      : isStockReturn
      ? (prodRecords || []).filter((r: any) => {
          if (r.type !== 'STOCK_RETURN') return false;
          if (r.docNo === detailDocNo || r.id === detailDocNo) return true;
          if (detailDocNo.startsWith('退料-')) {
            const wantOrderNum = detailDocNo.replace('退料-', '');
            const order = ordersList.find((o) => o.id === r.orderId);
            return order?.orderNumber === wantOrderNum;
          }
          return false;
        }) as any[]
      : isStockOut
      ? (prodRecords || []).filter((r: any) => {
          if (r.type !== 'STOCK_OUT') return false;
          if (r.docNo === detailDocNo || r.id === detailDocNo) return true;
          if (detailDocNo.startsWith('领料-')) {
            const wantOrderNum = detailDocNo.replace('领料-', '');
            const order = ordersList.find((o) => o.id === r.orderId);
            return order?.orderNumber === wantOrderNum;
          }
          return false;
        }) as any[]
      : recordsList.filter((r: any) => r.type === detailType && (r.docNumber || '') === detailDocNo) as any[];
    if (docRecords.length === 0) return null;
    const first = docRecords[0];
    const mainInfo = isStockIn
      ? { docNumber: first.docNo || (ordersList.find((o) => o.id === first.orderId)?.orderNumber ? `工单入库-${ordersList.find((o) => o.id === first.orderId)?.orderNumber}` : first.id), createdAt: first.timestamp || '—', partner: '—', warehouseId: first.warehouseId, warehouseName: warehouseMapPSI.get(first.warehouseId)?.name ?? '—', note: first.reason ?? '—', fromWarehouseId: undefined, toWarehouseId: undefined, orderNumber: ordersList.find((o) => o.id === first.orderId)?.orderNumber ?? '—' }
      : isStockReturn
      ? { docNumber: first.docNo || (ordersList.find((o) => o.id === first.orderId)?.orderNumber ? `退料-${ordersList.find((o) => o.id === first.orderId)?.orderNumber}` : first.id), createdAt: first.timestamp || '—', partner: '—', warehouseId: first.warehouseId, warehouseName: warehouseMapPSI.get(first.warehouseId)?.name ?? '—', note: first.reason ?? '—', fromWarehouseId: undefined, toWarehouseId: undefined, orderNumber: ordersList.find((o) => o.id === first.orderId)?.orderNumber ?? '—' }
      : isStockOut
      ? { docNumber: first.docNo || (ordersList.find((o) => o.id === first.orderId)?.orderNumber ? `领料-${ordersList.find((o) => o.id === first.orderId)?.orderNumber}` : first.id), createdAt: first.timestamp || '—', partner: '—', warehouseId: first.warehouseId, warehouseName: warehouseMapPSI.get(first.warehouseId)?.name ?? '—', note: first.reason ?? '—', fromWarehouseId: undefined, toWarehouseId: undefined, orderNumber: ordersList.find((o) => o.id === first.orderId)?.orderNumber ?? '—' }
      : { docNumber: first.docNumber || detailDocNo, createdAt: first.createdAt || first.timestamp || '—', partner: first.partner ?? '—', warehouseId: first.warehouseId, warehouseName: warehouseMapPSI.get(first.warehouseId)?.name ?? '—', note: first.note ?? '—', fromWarehouseId: first.fromWarehouseId, toWarehouseId: first.toWarehouseId, orderNumber: '—' };
    const detailLinesByProductVariant = new Map<string, { productId: string; variantId?: string; quantity: number; purchasePrice?: number; salesPrice?: number; record: any }>();
    docRecords.forEach(r => {
      const vId = r.variantId ?? '';
      const key = `${r.productId}|${vId}`;
      const existing = detailLinesByProductVariant.get(key);
      const qty = r.quantity ?? 0;
      const price = r.purchasePrice ?? r.salesPrice;
      if (!existing) {
        detailLinesByProductVariant.set(key, { productId: r.productId, variantId: vId || undefined, quantity: qty, purchasePrice: price, salesPrice: r.salesPrice, record: r });
      } else {
        existing.quantity += qty;
      }
    });
    const detailLines = Array.from(detailLinesByProductVariant.values()).map(item => {
      const product = productMapPSI.get(item.productId);
      const category = categoryMapPSI.get(product?.categoryId);
      const hasColorSize = category?.hasColorSize && (product?.variants?.length ?? 0) > 0;
      let variantLabel = '';
      if (item.variantId && product?.variants) {
        const v = product.variants.find((vv: ProductVariant) => vv.id === item.variantId);
        if (v) {
          const colorName = (dictionaries.colors ?? []).find(c => c.id === v.colorId)?.name ?? '';
          const sizeName = (dictionaries.sizes ?? []).find(s => s.id === v.sizeId)?.name ?? '';
          variantLabel = [colorName, sizeName].filter(Boolean).join(' / ') || v.skuSuffix || item.variantId;
        }
      }
      return {
        ...item,
        productName: product?.name ?? '—',
        productSku: product?.sku ?? '—',
        unitName: item.productId ? getUnitName(item.productId) : 'PCS',
        hasColorSize: !!variantLabel,
        variantLabel
      };
    });
    return { detailType, mainInfo, detailLines };
  }, [warehouseFlowDetailKey, recordsList, prodRecords, ordersList, productMapPSI, warehouseMapPSI, categoryMapPSI, dictionaries, getUnitName]);

  if (!result) return null;
  const { detailType, mainInfo, detailLines } = result;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><ScrollText className="w-5 h-5 text-indigo-600" /> 单据详情 · {mainInfo.docNumber}</h3>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">单据基本信息</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">单号</label>
              <div className="py-2 px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 bg-white">{mainInfo.docNumber}</div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">日期时间</label>
              <div className="py-2 px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 bg-white">{formatFlowDateTime(mainInfo.createdAt)}</div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">{detailType === 'SALES_BILL' ? '客户' : detailType === 'PURCHASE_BILL' ? '供应商' : detailType === 'TRANSFER' ? '调拨' : detailType === 'STOCKTAKE' ? '仓库' : detailType === 'STOCK_IN' || detailType === 'STOCK_RETURN' || detailType === 'STOCK_OUT' ? '工单号' : '备注'}</label>
              <div className="py-2 px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 bg-white">
                {detailType === 'TRANSFER' ? `${warehouseMapPSI.get(mainInfo.fromWarehouseId)?.name ?? '—'} → ${warehouseMapPSI.get(mainInfo.toWarehouseId)?.name ?? '—'}` : detailType === 'STOCKTAKE' ? mainInfo.warehouseName : detailType === 'STOCK_IN' || detailType === 'STOCK_RETURN' || detailType === 'STOCK_OUT' ? (mainInfo as any).orderNumber : mainInfo.partner}
              </div>
            </div>
            {(detailType === 'PURCHASE_BILL' || detailType === 'SALES_BILL' || detailType === 'STOCK_IN' || detailType === 'STOCK_RETURN' || detailType === 'STOCK_OUT') && (
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">仓库</label>
                <div className="py-2 px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 bg-white">{mainInfo.warehouseName}</div>
              </div>
            )}
            {mainInfo.note && (
              <div className="md:col-span-2">
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">备注</label>
                <div className="py-2 px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 bg-white truncate" title={mainInfo.note}>{mainInfo.note}</div>
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-auto min-h-0 p-4">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">明细</h4>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">产品 / SKU</th>
                  {detailLines.some((l: any) => l.variantLabel) && <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">规格（颜色/尺码）</th>}
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">数量</th>
                  {(detailType === 'PURCHASE_BILL' || detailType === 'SALES_BILL') && <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">单价</th>}
                  {(detailType === 'PURCHASE_BILL' || detailType === 'SALES_BILL') && <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">金额</th>}
                </tr>
              </thead>
              <tbody>
                {detailLines.map((line, idx) => {
                  const price = line.purchasePrice ?? line.salesPrice ?? 0;
                  return (
                    <tr key={`${line.productId}-${line.variantId ?? ''}-${idx}`} className="border-b border-slate-100">
                      <td className="px-4 py-3"><span className="font-bold text-slate-800">{line.productName}</span> <span className="text-slate-400 text-[10px]">{line.productSku}</span></td>
                      {detailLines.some((l: any) => l.variantLabel) && (
                        <td className="px-4 py-3 text-slate-600">{line.variantLabel || '—'}</td>
                      )}
                      <td className="px-4 py-3 text-right font-bold text-indigo-600">{(line.quantity ?? 0)} {line.unitName}</td>
                      {(detailType === 'PURCHASE_BILL' || detailType === 'SALES_BILL') && (
                        <>
                          <td className="px-4 py-3 text-right">¥{price.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right">¥{((line.quantity ?? 0) * price).toFixed(2)}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(WarehouseFlowDocumentDetailModal);
