import React, { useMemo, useState } from 'react';
import { Eye, History, X } from 'lucide-react';
import { ModalPortal } from '../../components/ModalPortal';
import type {
  DevMaterialDocGroup,
  Product,
  ProductCategory,
  Warehouse,
} from '../../types';
import { categoryUsesBatchManagement } from '../../types';
import { sectionTitleClass } from '../../styles/uiDensity';
import DevMaterialDocDetailModal from './DevMaterialDocDetailModal';

interface DevMaterialHistoryModalProps {
  styleId: string;
  styleCode: string;
  styleName: string;
  docs: DevMaterialDocGroup[];
  warehouses: Warehouse[];
  products: Product[];
  categories: ProductCategory[];
  canEdit: boolean;
  canDelete: boolean;
  /** 款式是否 developing（归档/已发布不可改删） */
  styleAllowsEdit: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

const DevMaterialHistoryModal: React.FC<DevMaterialHistoryModalProps> = ({
  styleId,
  styleCode,
  styleName,
  docs,
  warehouses,
  products,
  categories,
  canEdit,
  canDelete,
  styleAllowsEdit,
  onClose,
  onSaved,
}) => {
  const whName = useMemo(() => new Map(warehouses.map((w) => [w.id, w.name])), [warehouses]);
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const [detailDocNo, setDetailDocNo] = useState<string | null>(null);

  const showBatchCol = useMemo(
    () =>
      docs.some((doc) =>
        doc.lines.some((line) => {
          const p = productMap.get(line.productId);
          return (
            Boolean(line.batchNo?.trim()) ||
            (p?.categoryId != null && categoryUsesBatchManagement(categoryById.get(p.categoryId)))
          );
        }),
      ),
    [docs, productMap, categoryById],
  );

  const detailDoc = useMemo(
    () => (detailDocNo ? docs.find((d) => d.docNo === detailDocNo) ?? null : null),
    [detailDocNo, docs],
  );

  return (
    <>
      <ModalPortal>
        <div className="fixed inset-0 z-[290] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
          <div
            className="relative z-10 flex max-h-[min(92vh,960px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className={`${sectionTitleClass} flex items-center gap-2`}>
                  <History className="h-4 w-4 text-indigo-600" />
                  开发领退流水
                </h3>
                <p className="mt-1 text-xs font-medium text-slate-400">
                  {styleName} · {styleCode}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {docs.length === 0 ? (
                <p className="py-10 text-center text-xs font-medium text-slate-400">暂无流水</p>
              ) : (
                docs.map((doc) => (
                  <div key={doc.docNo} className="rounded-2xl border border-slate-100 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600">
                          {doc.type === 'STOCK_OUT' ? '领料' : '退料'}
                        </span>
                        <span className="text-xs font-semibold text-slate-800">{doc.docNo}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-[10px] font-medium text-slate-400">
                          {new Date(doc.timestamp).toLocaleString()}
                          {doc.operator ? ` · ${doc.operator}` : ''}
                        </div>
                        <button
                          type="button"
                          onClick={() => setDetailDocNo(doc.docNo)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-indigo-600 hover:bg-indigo-50"
                        >
                          <Eye className="h-3 w-3" />
                          详情
                        </button>
                      </div>
                    </div>
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-50">
                          <th className="pb-2 text-left text-[10px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap">物料</th>
                          <th className="pb-2 text-left text-[10px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap">仓库</th>
                          {showBatchCol ? (
                            <th className="pb-2 text-left text-[10px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap">批次</th>
                          ) : null}
                          <th className="pb-2 text-right text-[10px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap">数量</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {doc.lines.map((line) => (
                          <tr key={line.id}>
                            <td className="py-2">
                              <p className="text-xs font-semibold text-slate-800">{line.productName}</p>
                              {line.productSku ? (
                                <p className="text-[10px] font-medium text-slate-400">{line.productSku}</p>
                              ) : null}
                            </td>
                            <td className="py-2 text-xs font-medium text-slate-600">
                              {line.warehouseId ? whName.get(line.warehouseId) ?? line.warehouseId : '—'}
                            </td>
                            {showBatchCol ? (
                              <td className="py-2 text-xs font-medium text-slate-600">
                                {line.batchNo || '无批号'}
                              </td>
                            ) : null}
                            <td className="py-2 text-right text-xs font-semibold text-slate-800">
                              {line.quantity}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </ModalPortal>

      {detailDoc ? (
        <DevMaterialDocDetailModal
          styleId={styleId}
          styleCode={styleCode}
          styleName={styleName}
          doc={detailDoc}
          warehouses={warehouses}
          products={products}
          categories={categories}
          canEdit={canEdit}
          canDelete={canDelete}
          styleAllowsEdit={styleAllowsEdit}
          onClose={() => setDetailDocNo(null)}
          onSaved={onSaved}
        />
      ) : null}
    </>
  );
};

export default DevMaterialHistoryModal;
