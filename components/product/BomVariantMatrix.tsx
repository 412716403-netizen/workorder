import React, { useMemo } from 'react';
import { Boxes, Check, ArrowRight } from 'lucide-react';
import type { AppDictionaries, BOM, GlobalNodeTemplate, ProductVariant } from '../../types';
import { bomHasConfiguredItems } from '../../utils/bomEffective';
import { sortedVariantColorEntries } from '../../utils/sortVariantsByProduct';

export interface BomMatrixProductShape {
  id: string;
  sku: string;
  name: string;
  colorIds?: string[];
  sizeIds?: string[];
  variants: ProductVariant[];
}

export interface BomVariantMatrixProps {
  product: BomMatrixProductShape;
  boms: BOM[];
  enabledBOMNodes: GlobalNodeTemplate[];
  dictionaries: AppDictionaries;
  activeVariantIdForBOM: string | null;
  activeNodeIdForBOM: string | null;
  /** UI 虚拟变体 id（单 SKU 打开编辑器用） */
  singleSkuVariantId: string;
  /** 单 SKU 各工序已配置 BOM id（由父组件按 variantId 规则计算） */
  singleSkuNodeBOMs: Record<string, string>;
  onOpenBOMEditor: (variant: ProductVariant, nodeId: string) => void;
  /** 无启用 BOM 工序时的提示 */
  emptyHint?: React.ReactNode;
}

const BomVariantMatrix: React.FC<BomVariantMatrixProps> = ({
  product,
  boms,
  enabledBOMNodes,
  dictionaries,
  activeVariantIdForBOM,
  activeNodeIdForBOM,
  singleSkuVariantId,
  singleSkuNodeBOMs,
  onOpenBOMEditor,
  emptyHint,
}) => {
  const groupedVariants = useMemo(() => {
    const groups: Record<string, ProductVariant[]> = {};
    product.variants.forEach((v) => {
      if (!groups[v.colorId]) groups[v.colorId] = [];
      groups[v.colorId].push(v);
    });
    return groups;
  }, [product.variants]);

  const nodeBomsForVariant = (variantId: string) =>
    Object.fromEntries(
      boms
        .filter(
          (b) =>
            b.parentProductId === product.id &&
            b.variantId === variantId &&
            b.nodeId &&
            bomHasConfiguredItems(b),
        )
        .map((b) => [b.nodeId!, b.id]),
    );

  if (enabledBOMNodes.length === 0) {
    return (
      <>
        {emptyHint ?? (
          <p className="text-xs text-slate-400 py-8 text-center border border-dashed border-indigo-100 rounded-xl bg-white/60">
            当前路线中暂无需要配置 BOM 的工序；在「系统设置 → 工序节点库」中为工序开启「需 BOM」后，将在此处出现配置入口
          </p>
        )}
      </>
    );
  }

  return (
    <>
      {product.variants.length === 0 && (
        <div className="space-y-4">
          <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">单 SKU 产品</h5>
          <div className="p-6 rounded-3xl border border-white bg-white/90 shadow-sm ring-1 ring-indigo-50">
            <div className="flex justify-between items-start mb-4 pb-3 border-b border-slate-200/50">
              <div>
                <p className="text-sm font-black text-slate-800">本产品</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                  SKU: {product.sku}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {enabledBOMNodes.map((node) => {
                const hasNodeBOM = !!singleSkuNodeBOMs[node.id];
                const isEditing =
                  activeVariantIdForBOM === singleSkuVariantId && activeNodeIdForBOM === node.id;
                const singleSkuVirtualVariant: ProductVariant = {
                  id: singleSkuVariantId,
                  colorId: '',
                  sizeId: '',
                  skuSuffix: product.sku,
                  nodeBoms: singleSkuNodeBOMs,
                };
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => onOpenBOMEditor(singleSkuVirtualVariant, node.id)}
                    className={`w-full px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-between transition-all border ${
                      isEditing
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                        : hasNodeBOM
                          ? 'border-indigo-200 bg-indigo-50/50 text-indigo-900'
                          : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Boxes
                        className={`w-3.5 h-3.5 ${
                          isEditing ? 'text-white' : hasNodeBOM ? 'text-indigo-600' : 'text-slate-300'
                        }`}
                      />
                      <span>{node.name} BOM</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasNodeBOM && !isEditing && <span className="text-[9px]">已配置</span>}
                      {hasNodeBOM && !isEditing && <Check className="w-3.5 h-3.5" />}
                      {isEditing && <ArrowRight className="w-3.5 h-3.5" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {product.variants.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">多变体 · 按颜色分组</h5>
            <p className="text-[10px] text-slate-400 font-medium">同一颜色下各尺码一行，支持各工序独立配料</p>
          </div>

          <div className="space-y-10">
            {sortedVariantColorEntries(groupedVariants, product.colorIds, product.sizeIds).map(
              ([colorId, colorVariants]) => {
                const color = dictionaries.colors.find((c) => c.id === colorId);
                const colorTitle =
                  color?.name != null && String(color.name).trim() !== ''
                    ? String(color.name).trim()
                    : '（未命名颜色）';
                return (
                  <div key={String(colorId)} className="space-y-4">
                    <div className="flex items-center gap-3 ml-2">
                      <div
                        className="w-4 h-4 rounded-full border border-slate-200"
                        style={{ backgroundColor: color?.value }}
                      />
                      <h5 className="text-sm font-black text-slate-800 uppercase tracking-widest">
                        颜色: {colorTitle}
                      </h5>
                      <span className="text-[10px] text-slate-400 font-bold">
                        ({colorVariants.length} 个尺码变体)
                      </span>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50/60 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                            <th className="py-2.5 pl-4 pr-2">尺码</th>
                            <th className="py-2.5 px-2 hidden sm:table-cell">SKU</th>
                            {enabledBOMNodes.map((node) => (
                              <th key={node.id} className="py-2.5 px-2 text-center">
                                {node.name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {colorVariants.map((v) => {
                            const size = dictionaries.sizes.find((s) => s.id === v.sizeId);
                            const sizeTitle =
                              size?.name != null && String(size.name).trim() !== ''
                                ? String(size.name).trim()
                                : '（未命名尺码）';
                            const nodeBoms = nodeBomsForVariant(v.id);
                            return (
                              <tr key={v.id} className="hover:bg-indigo-50/30 transition-colors">
                                <td className="py-2.5 pl-4 pr-2 text-xs font-bold text-slate-800 whitespace-nowrap">
                                  {sizeTitle}
                                </td>
                                <td className="py-2.5 px-2 text-xs font-bold text-slate-800 whitespace-nowrap hidden sm:table-cell">
                                  {product.sku}-{v.skuSuffix}
                                </td>
                                {enabledBOMNodes.map((node) => {
                                  const hasNodeBOM = !!nodeBoms[node.id];
                                  const isEditing =
                                    activeVariantIdForBOM === v.id && activeNodeIdForBOM === node.id;
                                  return (
                                    <td key={node.id} className="py-2.5 px-2 text-center">
                                      <button
                                        type="button"
                                        onClick={() => onOpenBOMEditor(v, node.id)}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                                          isEditing
                                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                                            : hasNodeBOM
                                              ? 'border-indigo-200 bg-indigo-50/50 text-indigo-900'
                                              : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-200 hover:text-slate-700'
                                        }`}
                                      >
                                        {hasNodeBOM ? (
                                          <Check className="w-3 h-3" />
                                        ) : (
                                          <Boxes className="w-3 h-3" />
                                        )}
                                        {isEditing ? '编辑中' : hasNodeBOM ? '已配置' : '配置'}
                                      </button>
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default BomVariantMatrix;
