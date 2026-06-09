import React, { useEffect, useState } from 'react';
import { Tag, Wrench, Boxes, BookOpen, FileText, ClipboardList } from 'lucide-react';
import type {
  AppDictionaries,
  BOM,
  GlobalNodeTemplate,
  Partner,
  Product,
  ProductCategory,
  ReportFieldDefinition,
} from '../../types';
import { getFileExtFromDataUrl } from '../../utils/fileHelpers';
import { productColorSizeEnabled } from '../../utils/productColorSize';
import { bomHasConfiguredItems } from '../../utils/bomEffective';
import { parseRouteReportFileUrls } from '../../utils/routeReportFileUrls';
import {
  effectiveCustomDocFieldType,
  formatReportCustomDataForList,
} from '../../utils/reportCustomDocField';
import { parseKnowledgeFieldValue } from '../../utils/knowledgeFieldValue';
import { KnowledgeDocPreviewModal } from '../../components/knowledge/KnowledgeDocPickerModal';

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
}

function formatRouteReportArchiveValue(
  field: ReportFieldDefinition,
  raw: string | undefined
): { kind: 'file'; urls: string[] } | { kind: 'text'; text: string } | null {
  const v = raw ?? '';
  if (effectiveCustomDocFieldType(field) === 'file') {
    const urls = parseRouteReportFileUrls(v);
    return urls.length > 0 ? { kind: 'file', urls } : null;
  }
  if (!String(v).trim()) return null;
  return { kind: 'text', text: String(v) };
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
}) => {
  const [bomSkuId, setBomSkuId] = useState<string | null>(null);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);

  useEffect(() => {
    const withItems = boms.filter(b => b.parentProductId === p.id).filter(bomHasConfiguredItems);
    const singleId = `single-${p.id}`;
    const variantIds =
      p.variants && p.variants.length > 0 ? p.variants.map(v => v.id) : [singleId];
    if (variantIds.length === 1) {
      const only = variantIds[0];
      if (withItems.some(b => b.variantId === only)) {
        setBomSkuId(only);
        return;
      }
    }
    setBomSkuId(null);
  }, [p.id, p.variants, boms]);

  const cat = categories.find(c => c.id === p.categoryId);
  // 商品详情始终展示分类的全部扩展字段；showInForm 仅控制计划单/工单中心列表是否展示。
  const visibleCustomFields = cat?.customFields ?? [];
  const unitName = p.unitId ? dictionaries.units?.find(u => u.id === p.unitId)?.name : '件';
  const supplier = p.supplierId ? partners.find(pt => pt.id === p.supplierId) : undefined;

  const productBomsAll = boms.filter(b => b.parentProductId === p.id);
  const productBomsWithItems = productBomsAll.filter(bomHasConfiguredItems);
  const hasBomNodes = (p.milestoneNodeIds || []).some(
    nid => globalNodes.find(n => n.id === nid)?.hasBOM
  );
  const singleSkuId = `single-${p.id}`;
  const skuOptions: { id: string; label: string }[] =
    p.variants && p.variants.length > 0
      ? p.variants.map(v => ({
          id: v.id,
          label:
            [
              dictionaries.colors?.find(c => c.id === v.colorId)?.name,
              dictionaries.sizes?.find(s => s.id === v.sizeId)?.name,
            ]
              .filter(Boolean)
              .join(' / ') || v.skuSuffix,
        }))
      : [{ id: singleSkuId, label: '单 SKU' }];
  const selectedSkuBoms = bomSkuId
    ? productBomsWithItems.filter(b => b.variantId === bomSkuId)
    : [];

  const selectedNodesOrdered = (p.milestoneNodeIds || [])
    .map(id => globalNodes.find(n => n.id === id))
    .filter((n): n is GlobalNodeTemplate => Boolean(n));

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
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">默认供应商</p>
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
          {categories.length === 0 ? (
            <span className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400">
              暂无分类配置
            </span>
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
              const empty = val == null || val === '';
              if (empty) {
                return (
                  <div key={f.id} className="px-3 py-1.5 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400">{f.label}: </span>
                    <span className="text-xs font-medium text-slate-400 italic">未填写</span>
                  </div>
                );
              }
              if (effectiveCustomDocFieldType(f) === 'knowledge') {
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
              if (f.type === 'file' && typeof val === 'string' && val.startsWith('data:')) {
                const isImg = val.startsWith('data:image/');
                const isPdf = val.startsWith('data:application/pdf');
                if (isImg)
                  return (
                    <div key={f.id} className="flex items-center gap-2">
                      <img
                        src={val}
                        alt={f.label}
                        className="h-12 w-12 object-cover rounded-xl border cursor-pointer hover:ring-2 hover:ring-indigo-400"
                        onClick={() => onOpenFilePreview(val, 'image')}
                      />
                      <a
                        href={val}
                        download={`${f.label}.${getFileExtFromDataUrl(val)}`}
                        className="text-xs font-bold text-indigo-600 hover:underline"
                      >
                        下载
                      </a>
                    </div>
                  );
                if (isPdf)
                  return (
                    <div key={f.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenFilePreview(val, 'pdf')}
                        className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100"
                      >
                        在线查看
                      </button>
                      <a
                        href={val}
                        download={`${f.label}.${getFileExtFromDataUrl(val)}`}
                        className="text-xs font-bold text-indigo-600 hover:underline"
                      >
                        下载
                      </a>
                    </div>
                  );
                return (
                  <a
                    key={f.id}
                    href={val}
                    download={`${f.label}.${getFileExtFromDataUrl(val)}`}
                    className="px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-bold text-slate-600 hover:bg-indigo-50"
                  >
                    下载
                  </a>
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

      <div className="space-y-3">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Wrench className="w-3.5 h-3.5" /> 标准生产路线
        </h3>
        {selectedNodesOrdered.length === 0 ? (
          <span className="text-sm text-slate-400 italic">暂无工序</span>
        ) : (
          <div className="space-y-3">
            {selectedNodesOrdered.map((node, idx) => {
              const displayTpl = node.reportDisplayTemplate ?? [];
              const displayVals = p.routeReportDisplayValues?.[node.id] ?? {};
              type DispRow =
                | { field: ReportFieldDefinition; kind: 'file'; urls: string[] }
                | { field: ReportFieldDefinition; kind: 'knowledge'; docId: string; title: string }
                | { field: ReportFieldDefinition; kind: 'text'; text: string };
              const displayRows: DispRow[] = [];
              for (const field of displayTpl) {
                const raw = displayVals[field.id] ?? '';
                const ft = effectiveCustomDocFieldType(field);
                if (ft === 'file') {
                  const urls = parseRouteReportFileUrls(raw);
                  if (urls.length > 0) displayRows.push({ field, kind: 'file', urls });
                } else if (ft === 'knowledge') {
                  const ref = parseKnowledgeFieldValue(raw);
                  if (ref) displayRows.push({ field, kind: 'knowledge', docId: ref.id, title: ref.title || '资料库文件' });
                } else if (String(raw).trim()) {
                  displayRows.push({ field, kind: 'text', text: String(raw) });
                }
              }

              const reportTpl = node.reportTemplate ?? [];
              const reportVals = p.routeReportValues?.[node.id] ?? {};
              const archiveRows: { field: ReportFieldDefinition; cell: DispRow }[] = [];
              for (const field of reportTpl) {
                const cell = formatRouteReportArchiveValue(field, reportVals[field.id]);
                if (cell) archiveRows.push({ field, cell });
              }

              const rate = p.nodeRates?.[node.id];
              const pricing = p.nodePricingModes?.[node.id];
              const pieceHint =
                node.enablePieceRate && rate != null && rate > 0
                  ? `工价 ${rate.toFixed(2)} 元/${pricing === 'per_hour' ? '时' : '件'}`
                  : null;

              return (
                <div
                  key={node.id}
                  className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
                >
                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-[10px] font-black text-white">
                      {idx + 1}
                    </span>
                    <span className="text-sm font-black text-slate-900">{node.name}</span>
                    {node.hasBOM && (
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                        含 BOM
                      </span>
                    )}
                    {pieceHint && (
                      <span className="text-[10px] font-bold text-slate-500 ml-auto">{pieceHint}</span>
                    )}
                  </div>
                  <div className="p-3 space-y-3">
                    {displayRows.length > 0 && (
                      <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 px-3 py-2 space-y-2">
                        <div className="flex items-center gap-2">
                          <BookOpen className="w-3.5 h-3.5 shrink-0 text-indigo-600" />
                          <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider">
                            报工页展示（只读）
                          </span>
                        </div>
                        {displayRows.map(row => (
                          <div
                            key={row.field.id}
                            className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-2"
                          >
                            <p className="text-[10px] font-bold text-slate-500 mb-1">{row.field.label}</p>
                            {row.kind === 'knowledge' ? (
                              <button
                                type="button"
                                onClick={() => setPreviewDocId(row.docId)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                              >
                                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                                <span className="max-w-[220px] truncate">{row.title}</span>
                              </button>
                            ) : row.kind === 'file' ? (
                              <div className="flex flex-wrap gap-2">
                                {row.urls.map((url, fi) => (
                                  <div
                                    key={`${row.field.id}-${fi}`}
                                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-1.5"
                                  >
                                    {url.startsWith('data:image/') ? (
                                      <button
                                        type="button"
                                        onClick={() => onOpenFilePreview(url, 'image')}
                                        className="rounded-md border border-slate-200 overflow-hidden shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        title="点击查看"
                                      >
                                        <img
                                          src={url}
                                          alt=""
                                          className="h-14 w-14 object-cover pointer-events-none"
                                        />
                                      </button>
                                    ) : url.startsWith('data:application/pdf') ||
                                      /\.pdf(\?|$)/i.test(url) ? (
                                      <button
                                        type="button"
                                        onClick={() => onOpenFilePreview(url, 'pdf')}
                                        className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline"
                                      >
                                        <FileText className="w-4 h-4 text-rose-500 shrink-0" /> 查看 PDF
                                      </button>
                                    ) : (
                                      <a
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs font-bold text-indigo-600 hover:underline"
                                      >
                                        附件 {fi + 1}
                                      </a>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-slate-800 whitespace-pre-wrap">{row.text}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {archiveRows.length > 0 && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 space-y-2">
                        <div className="flex items-center gap-2">
                          <ClipboardList className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                            报工填报项（产品预设）
                          </span>
                        </div>
                        {archiveRows.map(({ field, cell }) => (
                          <div key={field.id} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                            <p className="text-[10px] font-bold text-slate-500 mb-1">{field.label}</p>
                            {cell.kind === 'file' ? (
                              <div className="flex flex-wrap gap-2">
                                {cell.urls.map((url, fi) => (
                                  <div
                                    key={`${field.id}-${fi}`}
                                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-1.5"
                                  >
                                    {url.startsWith('data:image/') ? (
                                      <button
                                        type="button"
                                        onClick={() => onOpenFilePreview(url, 'image')}
                                        className="rounded-md border border-slate-200 overflow-hidden shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                      >
                                        <img
                                          src={url}
                                          alt=""
                                          className="h-12 w-12 object-cover pointer-events-none"
                                        />
                                      </button>
                                    ) : url.startsWith('data:application/pdf') ||
                                      /\.pdf(\?|$)/i.test(url) ? (
                                      <button
                                        type="button"
                                        onClick={() => onOpenFilePreview(url, 'pdf')}
                                        className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline"
                                      >
                                        <FileText className="w-4 h-4 text-rose-500 shrink-0" /> 查看 PDF
                                      </button>
                                    ) : (
                                      <a
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs font-bold text-indigo-600 hover:underline"
                                      >
                                        附件 {fi + 1}
                                      </a>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-slate-800 whitespace-pre-wrap">{cell.text}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {productBomsWithItems.length > 0 || hasBomNodes ? (
        <div className="space-y-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Boxes className="w-3.5 h-3.5" /> 工艺 BOM
          </h3>
          <div className="flex flex-wrap gap-2">
            {skuOptions.map(opt => {
              const hasBom = productBomsWithItems.some(b => b.variantId === opt.id);
              const selected = bomSkuId === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setBomSkuId(opt.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
                    selected
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-300 ring-offset-1'
                      : hasBom
                        ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border-indigo-200'
                        : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {opt.label}
                  {!hasBom && <span className="text-[10px] ml-1 font-medium">(未配置)</span>}
                </button>
              );
            })}
          </div>
          {bomSkuId && selectedSkuBoms.length > 0 ? (
            <div className="space-y-4 pt-1">
              {selectedSkuBoms.map(bom => {
                const nodeName = bom.nodeId ? globalNodes.find(n => n.id === bom.nodeId)?.name : null;
                return (
                  <div key={bom.id} className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                      <div>
                        {nodeName && (
                          <p className="text-[10px] font-bold text-indigo-600 mb-0.5">{nodeName}</p>
                        )}
                        <p className="text-xs font-bold text-slate-600">{bom.name}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {bom.items
                        .filter(it => (it.productId ?? '').trim() !== '')
                        .map((item, idx) => {
                          const subProd = products.find(x => x.id === item.productId);
                          const subUnit = subProd?.unitId
                            ? dictionaries.units?.find(u => u.id === subProd.unitId)?.name
                            : '件';
                          return (
                            <div
                              key={`${bom.id}-${idx}`}
                              className="rounded-xl bg-white border border-slate-100 px-3 py-2"
                            >
                              <div className="flex justify-between gap-2 items-start">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-bold text-slate-800 truncate">
                                    {subProd?.name || '未知物料'}
                                  </p>
                                  <p className="text-[10px] font-mono text-slate-400 mt-0.5">
                                    SKU {subProd?.sku || item.productId}
                                  </p>
                                </div>
                                <span className="text-sm font-black text-indigo-600 shrink-0">
                                  ×{item.quantity}{' '}
                                  <span className="text-xs font-bold text-slate-500">{subUnit}</span>
                                </span>
                              </div>
                              {item.note?.trim() && (
                                <p className="text-[11px] text-slate-500 mt-1.5 border-t border-slate-100 pt-1.5">
                                  备注：{item.note.trim()}
                                </p>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : bomSkuId ? (
            <p className="text-sm text-slate-400 italic py-2">该规格尚未配置有效 BOM 物料明细</p>
          ) : skuOptions.length > 1 ? (
            <p className="text-xs text-slate-400 italic">请选择上方规格查看 BOM</p>
          ) : null}
        </div>
      ) : null}

      <KnowledgeDocPreviewModal
        isOpen={previewDocId != null}
        docId={previewDocId}
        onClose={() => setPreviewDocId(null)}
      />
    </div>
  );
};

export default ProductQuickDetailBody;
