import React from 'react';
import ProductEconomicsWidget from './ProductEconomicsWidget';

/** 产品经营 · 关联采购入库与关联收付款口径 */
const ProductEconomicsDocumentWidget: React.FC<{
  editing?: boolean;
  onRemove?: () => void;
}> = props => (
  <ProductEconomicsWidget
    {...props}
    materialCostMode="document_linked"
    title="产品经营·单据关联"
  />
);

export default ProductEconomicsDocumentWidget;
