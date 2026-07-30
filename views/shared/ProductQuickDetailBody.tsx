import React, { useState } from 'react';
import { Tag, BookOpen } from 'lucide-react';
import type {
  AppDictionaries,
  BOM,
  GlobalNodeTemplate,
  Partner,
  Product,
  ProductCategory,
} from '../../types';
import { getFileExtFromDataUrl } from '../../utils/fileHelpers';
import { productColorSizeEnabled } from '../../utils/productColorSize';
import {
  parseDevStageFileItems,
  resolveDevStageFileDownloadName,
} from '../../utils/devStageFileValue';
import {
  effectiveCustomDocFieldType,
  formatReportCustomDataForList,
} from '../../utils/reportCustomDocField';
import { parseKnowledgeFieldValue } from '../../utils/knowledgeFieldValue';
import { PdfThumbPreview } from '../../components/PdfThumbPreview';
import { KnowledgeDocPreviewModal } from '../../components/knowledge/KnowledgeDocPickerModal';
import ProductRouteSection from './ProductRouteSection';
import ProductBomSection from './ProductBomSection';
import ProductBomWhereUsedSection from './ProductBomWhereUsedSection';

type FilePreviewKind = 'image' | 'pdf';

export interface ProductQuickDetailBodyProps {
  product: Product;
  categories: ProductCategory[];
  dictionaries: AppDictionaries;
  partners: Partner[];
  globalNodes: GlobalNodeTemplate[];
  boms: BOM[];
  products: Product[];
  onOpenFilePreview: (url: string, type: FilePreviewKind) => void;
  /** 外层滚动区内边距：工单中心 p-8，计划 p-4 */
  contentClassName?: string;
  /** 点击 BOM 子件 / 被调用父产品时打开该产品详情 */
  onOpenProduct?: (productId: string) => void;
}

const ProductQuickDetailBody: React.FC<ProductQuickDetailBodyProps> = ({
  product: p,
  categories,
  dictionaries,
  partners,
  globalNodes,
  boms,
  products,
  onOpenFilePreview,
  contentClassName = 'p-8 space-y-6',
  onOpenProduct,
}) => {
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);

  const cat = categories.find(c => c.id === p.categoryId);
  // 商品详情始终展示分类的全部扩展字段；showInForm 仅控制计划单/工单中心列表是否展示。
  const visibleCustomFields = cat?.customFields ?? [];
  const unitName = p.unitId ? dictionaries.units?.find(u => u.id === p.unitId)?.name : '件';
  const supplier = p.supplierId ? partners.find(pt => pt.id === p.supplierId) : undefined;

  return (
    <div className={`flex-1 overflow-y-auto ${contentClassName}`}>
      <div className="space-y-2">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-0.5">
          基本信息
        </h3>
        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">计量单位</p>
              <p className="text-sm font-bold text-slate-800">{unitName}</p>
            </div>
            {(p.salesPrice ?? 0) > 0 && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">销售单价</p>
                <p className="text-sm font-black text-indigo-600">
                  ¥ {(p.salesPrice ?? 0).toLocaleString()}{' '}
                  <span className="text-slate-500 font-bold text-xs">/{unitName}</span>
                </p>
              </div>
            )}
            {(p.purchasePrice ?? 0) > 0 && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">采购单价</p>
                <p className="text-sm font-black text-slate-700">
                  ¥ {(p.purchasePrice ?? 0).toLocaleString()}{' '}
                  <span className="text-slate-500 font-bold text-xs">/{unitName}</span>
                </p>
              </div>
            )}
            {supplier && (
              <div className="col-span-2 sm:col-span-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">合作单位</p>
                <p className="text-sm font-bold text-slate-800">{supplier.name}</p>
              </div>
            )}
          </div>
          {p.description?.trim() && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">商品描述</p>
              <p className="text-sm font-medium text-slate-700 whitespace-pre-wrap leading-relaxed">
                {p.description.trim()}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-0.5">
          业务分类
        </h3>
        <div className="flex flex-wrap gap-1.5" role="list" aria-label="产品所属业务分类">
          {cat ? (
            <span
              role="listitem"
              className="inline-flex items-center px-4 py-2 rounded-lg text-xs font-semibold border bg-indigo-600 text-white shadow-sm border-indigo-600"
            >
              {cat.name}
            </span>
          ) : (
            <span className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400">未分类</span>
          )}
        </div>
      </div>

      {productColorSizeEnabled(p, cat) && (
        <div className="space-y-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Tag className="w-3.5 h-3.5" /> 颜色与尺码
          </h3>
          <div className="space-y-2">
            {p.colorIds && p.colorIds.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 mb-1.5">颜色</p>
                <div className="flex flex-wrap gap-2">
                  {(p.colorIds || []).map(cId => {
                    const c = dictionaries.colors?.find(x => x.id === cId);
                    return c ? (
                      <span
                        key={cId}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-xl text-sm font-bold text-slate-700 border border-slate-100"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-slate-200"
                          style={{ backgroundColor: c.value }}
                        />
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
                      <span
                        key={sId}
                        className="px-3 py-1.5 bg-slate-50 rounded-xl text-sm font-bold text-slate-700 border border-slate-100"
                      >
                        {s.name}
                      </span>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {visibleCustomFields.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Tag className="w-3.5 h-3.5" /> 分类扩展属性
          </h3>
          <div className="flex flex-wrap gap-2">
            {visibleCustomFields.map(f => {
              const val = p.categoryCustomData?.[f.id];
              const fieldType = effectiveCustomDocFieldType(f);
              const fileItems = fieldType === 'file' ? parseDevStageFileItems(val) : [];
              const empty =
                fieldType === 'file'
                  ? fileItems.length === 0
                  : val == null || val === '';
              if (empty) {
                return (
                  <div key={f.id} className="px-3 py-1.5 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400">{f.label}: </span>
                    <span className="text-xs font-medium text-slate-400 italic">未填写</span>
                  </div>
                );
              }
              if (fieldType === 'knowledge') {
                const ref = parseKnowledgeFieldValue(val);
                if (!ref) {
                  return (
                    <div key={f.id} className="px-3 py-1.5 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                      <span className="text-[10px] font-bold text-slate-400">{f.label}: </span>
                      <span className="text-xs font-medium text-slate-400 italic">未填写</span>
                    </div>
                  );
                }
                return (
                  <div key={f.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg">
                    <span className="text-[10px] font-bold text-slate-400">{f.label}: </span>
                    <button
                      type="button"
                      onClick={() => setPreviewDocId(ref.id)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline"
                      title={ref.title || '查看资料库文件'}
                    >
                      <BookOpen className="w-3.5 h-3.5 shrink-0" />
                      <span className="max-w-[180px] truncate">{ref.title || '资料库文件'}</span>
                    </button>
                  </div>
                );
              }
              if (fieldType === 'file') {
                return (
                  <div key={f.id} className="flex min-w-0 flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-slate-400">{f.label}:</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {fileItems.map((item, idx) => {
                        const url = item.url;
                        const downloadName = resolveDevStageFileDownloadName(item, f.label, idx);
                        const isImg = url.startsWith('data:image/');
                        const isPdf = url.startsWith('data:application/pdf');
                        if (isImg) {
                          return (
                            <div key={`${f.id}-${idx}`} className="flex items-center gap-2">
                              <img
                                src={url}
                                alt={downloadName}
                                className="h-12 w-12 object-cover rounded-xl border cursor-pointer hover:ring-2 hover:ring-indigo-400"
                                onClick={() => onOpenFilePreview(url, 'image')}
                              />
                              <a
                                href={url}
                                download={downloadName}
                                className="max-w-[140px] truncate text-xs font-bold text-indigo-600 hover:underline"
                                title={downloadName}
                              >
                                {item.name || '下载'}
                              </a>
                            </div>
                          );
                        }
                        if (isPdf) {
                          return (
                            <div key={`${f.id}-${idx}`} className="flex items-center gap-2">
                              <PdfThumbPreview
                                src={url}
                                onClick={() => onOpenFilePreview(url, 'pdf')}
                                title={`${downloadName} · 查看 PDF`}
                                className="h-12 w-10"
                              />
                              <div className="min-w-0">
                                <span className="block max-w-[160px] truncate text-xs font-bold text-slate-700" title={downloadName}>
                                  {item.name || downloadName}
                                </span>
                                <a
                                  href={url}
                                  download={downloadName}
                                  className="text-xs font-bold text-indigo-600 hover:underline"
                                >
                                  下载
                                </a>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <a
                            key={`${f.id}-${idx}`}
                            href={url}
                            download={downloadName}
                            className="px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-bold text-slate-600 hover:bg-indigo-50"
                            title={downloadName}
                          >
                            {item.name || `下载.${getFileExtFromDataUrl(url)}`}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                );
              }
              return (
                <div key={f.id} className="px-3 py-1.5 bg-slate-100 rounded-lg">
                  <span className="text-[10px] font-bold text-slate-400">{f.label}: </span>
                  <span className="text-sm font-bold text-slate-700">
                    {formatReportCustomDataForList(f, val)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ProductRouteSection
        product={p}
        globalNodes={globalNodes}
        onOpenFilePreview={onOpenFilePreview}
        onPreviewKnowledgeDoc={setPreviewDocId}
      />

      <ProductBomSection
        product={p}
        categories={categories}
        dictionaries={dictionaries}
        globalNodes={globalNodes}
        boms={boms}
        products={products}
        onOpenProduct={onOpenProduct}
      />

      <ProductBomWhereUsedSection
        product={p}
        boms={boms}
        products={products}
        onOpenProduct={onOpenProduct}
      />

      <KnowledgeDocPreviewModal
        isOpen={previewDocId != null}
        docId={previewDocId}
        onClose={() => setPreviewDocId(null)}
      />
    </div>
  );
};

export default ProductQuickDetailBody;
