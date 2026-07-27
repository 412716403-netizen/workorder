import React, { useMemo } from 'react';
import { Building2 } from 'lucide-react';
import type { Partner, Product, ProductCategory } from '../types';
import { getProductCategoryCustomFieldEntries } from '../utils/reportCustomDocField';
import { buildPartnerNameById, resolveProductPartnerName } from '../utils/productPartnerDisplay';

const DEFAULT_TAG_CLASS =
  'inline-flex max-w-full items-center gap-0.5 rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500';

export interface ProductListMetaTagsProps {
  product: Product | null | undefined;
  category: ProductCategory | null | undefined;
  /** 合作单位 id→名称；不传时用 partners 现场构建 */
  partnerNameById?: ReadonlyMap<string, string>;
  partners?: readonly Partner[];
  /** 外层容器 class，默认 flex wrap；传空串则不包一层（由调用方自行包） */
  className?: string;
  /** 单个标签 class */
  tagClassName?: string;
}

/**
 * 列表「产品编号」下方的元信息行：合作单位（分类开启 linkPartner 且已关联时）+ 分类自定义字段。
 * 无内容时返回 null。
 */
export const ProductListMetaTags: React.FC<ProductListMetaTagsProps> = ({
  product,
  category,
  partnerNameById: partnerNameByIdProp,
  partners,
  className = 'flex flex-wrap items-center gap-1',
  tagClassName = DEFAULT_TAG_CLASS,
}) => {
  const partnerNameById = useMemo(() => {
    if (partnerNameByIdProp) return partnerNameByIdProp;
    return buildPartnerNameById(partners ?? []);
  }, [partnerNameByIdProp, partners]);

  if (!product) return null;

  const partnerName = resolveProductPartnerName(product, category, partnerNameById);
  const customTags = getProductCategoryCustomFieldEntries(product, category, { includeFile: false });
  if (!partnerName && customTags.length === 0) return null;

  const tags = (
    <>
      {partnerName ? (
        <span className={tagClassName} title={`合作单位: ${partnerName}`}>
          <Building2 className="h-2.5 w-2.5 shrink-0 text-slate-400" />
          <span className="truncate">{partnerName}</span>
        </span>
      ) : null}
      {customTags.map(({ field, display }) => (
        <span key={field.id} className={tagClassName} title={`${field.label}: ${display}`}>
          {field.label}: {display}
        </span>
      ))}
    </>
  );

  if (!className) return tags;
  return <div className={className}>{tags}</div>;
};

export default React.memo(ProductListMetaTags);
