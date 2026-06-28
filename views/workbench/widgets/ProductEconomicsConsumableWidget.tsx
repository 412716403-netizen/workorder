import React from 'react';
import ProductEconomicsWidget from './ProductEconomicsWidget';

/** 产品经营 · 报工耗材与结余损耗口径 */
const ProductEconomicsConsumableWidget: React.FC<{
  editing?: boolean;
  onRemove?: () => void;
}> = props => (
  <ProductEconomicsWidget
    {...props}
    materialCostMode="consumable"
    title="产品经营·报工耗材"
  />
);

export default ProductEconomicsConsumableWidget;
